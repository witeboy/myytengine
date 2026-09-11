// Worker-side client for the ffmpeg container. See codex/FFMPEG.md.
//
// The container is deliberately dumb: it fetches a source URL, runs one ffmpeg command,
// hands the result back, and reports. It holds no API keys, has no database access, and
// makes no decisions. All policy lives here.
//
// Two ways the result gets home, chosen by MEDIA_BACKEND:
//
//   'r2'    (production) The container returns the encoded bytes in its response and the
//           Worker writes them through the MEDIA binding. No credential of any kind is
//           handed to the container — R2 is reached by binding, never by key.
//   'bunny' (optional, server-only) The Worker hands the container a one-shot PUT URL
//           plus the zone access key, exactly as the original design described.
//
// The ffmpeg flags below are copied verbatim from the original `clip_video`. Changing
// the preset, CRF or filter chain changes the look of every clip the app produces —
// treat them as fixed unless someone asks for a different output.

import { getRandom } from '@cloudflare/containers';
import { HttpError } from './http';
import { buildKey, publicUrl, type Tier } from './storage';
import type { Ctx, Env } from '../types';

export type Op = 'clip' | 'burn_captions' | 'concat' | 'probe';

/** Must match `max_instances` for the container in wrangler.toml. */
const FFMPEG_POOL = 5;

/** A cold container start is a few seconds; a stalled or undeployed one is forever. */
const HEALTH_TIMEOUT_MS = 20_000;

interface RunResult {
  ok: boolean;
  duration?: number;
  bytes?: number;
  error?: string;
}

const isR2 = (env: Env) => (env.MEDIA_BACKEND || 'bunny') === 'r2';

/**
 * A one-shot upload target for the container: the exact PUT URL and the access key,
 * scoped to a single object. The container never learns the storage zone password's
 * broader scope, and never sees any other credential. Bunny backend only.
 */
function uploadTarget(env: Env, key: string) {
  const region = (env.BUNNY_STORAGE_REGION || 'ny').trim();
  const host = region === 'de' || region === 'storage' || !region
    ? 'storage.bunnycdn.com'
    : `${region}.storage.bunnycdn.com`;
  const zone = (env.BUNNY_STORAGE_ZONE || '').trim();
  const accessKey = (env.BUNNY_STORAGE_PASSWORD || '').trim();

  if (!zone || !accessKey) {
    throw new HttpError(500, 'Bunny storage is not configured — cannot give the container an upload target.');
  }
  return { put_url: `https://${host}/${zone}/${key}`, access_key: accessKey };
}

function requireBinding(env: Env): DurableObjectNamespace {
  const binding = env.FFMPEG;
  if (!binding) {
    throw new HttpError(
      501,
      'The ffmpeg container is not deployed. Server-side video operations are unavailable; ' +
        'the in-browser path (src/lib/clipWithFFmpeg.js) still works. See codex/FFMPEG.md.',
    );
  }
  return binding;
}

async function containerStub(env: Env) {
  // Load-balance across a fixed pool rather than minting a fresh instance per job.
  // A unique id per job would mean a brand-new container every time — cold start on
  // every clip, and since Containers bill per second, the most expensive possible
  // shape. A pool lets `sleepAfter` do its job and keeps warm instances in play.
  // FFMPEG_POOL must not exceed max_instances in wrangler.toml.
  return getRandom(requireBinding(env) as any, FFMPEG_POOL);
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

/** Raw call. `probe` and the Bunny path answer with JSON; the R2 path answers with bytes. */
async function callContainer(ctx: Ctx, payload: Record<string, unknown>): Promise<Response> {
  const stub = await containerStub(ctx.env);
  return stub.fetch('http://ffmpeg/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function readJsonResult(res: Response, op: unknown): Promise<RunResult> {
  const out = ((await res.json().catch(() => null)) as RunResult | null)
    || { ok: false, error: 'container returned no JSON' };
  if (!res.ok || !out.ok) {
    throw new HttpError(502, `ffmpeg ${op} failed: ${out.error || res.status}`);
  }
  return out;
}

/**
 * Run an encoding op and land the output at `key`.
 *
 * R2: the payload carries no `upload`; the container streams `video/mp4` back with
 * `X-Ffmpeg-Duration` / `X-Ffmpeg-Bytes`, and the bytes go into the MEDIA bucket here.
 * Bunny: the payload carries the pre-authorized PUT target and the container uploads.
 */
async function runToStorage(
  ctx: Ctx,
  op: Exclude<Op, 'probe'>,
  payload: Record<string, unknown>,
  key: string,
): Promise<RunResult> {
  if (!isR2(ctx.env)) {
    const res = await callContainer(ctx, { op, ...payload, upload: uploadTarget(ctx.env, key) });
    return readJsonResult(res, op);
  }

  const res = await callContainer(ctx, { op, ...payload });
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.startsWith('video/')) {
    // Any failure (or an old container build that still insists on an upload target)
    // comes back as the JSON envelope.
    return readJsonResult(res, op);
  }

  // Buffer rather than stream: the R2 binding needs a known length, and the ops here
  // are short clips — a 6s 720×1280 clip is low single-digit megabytes.
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength) throw new HttpError(502, `ffmpeg ${op} failed: container returned an empty file`);
  await ctx.env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'video/mp4' } });

  const duration = Number(res.headers.get('x-ffmpeg-duration'));
  return {
    ok: true,
    bytes: bytes.byteLength,
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };
}

// ── clip + 9:16 crop ──────────────────────────────────────────────────────────

/**
 * Cut `start`–`end` out of a source video and crop it to portrait.
 *
 * Flags are the original's, unchanged:
 *   -ss {start} -i {src} -t {duration}
 *   -vf crop=ih*9/16:ih,scale=720:1280
 *   -c:v libx264 -preset ultrafast -crf 26 -c:a aac -b:a 128k -movflags +faststart
 */
export async function runClip(
  ctx: Ctx,
  opts: { source_url: string; start: number; end: number; tier?: Tier },
): Promise<{ clip_url: string; key: string; duration: number }> {
  const duration = Math.ceil(opts.end - opts.start);
  if (!opts.source_url) throw new HttpError(400, 'source_url is required');
  if (!(duration > 0)) throw new HttpError(400, 'Invalid clip range');

  // 'durable': the clip URL is returned to the caller and persisted by the timeline
  // manifest. Pass tier: 'ephemeral' explicitly for a throwaway preview render.
  const key = buildKey(opts.tier ?? 'durable', 'clip.mp4', 'clips');

  const result = await runToStorage(ctx, 'clip', {
    source_url: String(opts.source_url).split('#')[0],
    args: { start: Math.floor(opts.start), duration },
  }, key);

  return { clip_url: publicUrl(ctx.env, key), key, duration: result.duration ?? duration };
}

// ── caption burn-in ───────────────────────────────────────────────────────────

export async function runBurnCaptions(
  ctx: Ctx,
  opts: { source_url: string; srt: string; style?: Record<string, unknown>; tier?: Tier },
): Promise<{ url: string; key: string }> {
  const key = buildKey(opts.tier ?? 'durable', 'captioned.mp4', 'clips');
  await runToStorage(ctx, 'burn_captions', {
    source_url: opts.source_url,
    args: { srt: opts.srt, style: opts.style || {} },
  }, key);
  return { url: publicUrl(ctx.env, key), key };
}

// ── concat ────────────────────────────────────────────────────────────────────

export async function runConcat(
  ctx: Ctx,
  opts: { source_urls: string[]; tier?: Tier },
): Promise<{ url: string; key: string }> {
  if (!opts.source_urls?.length) throw new HttpError(400, 'source_urls is required');
  const key = buildKey(opts.tier ?? 'durable', 'concat.mp4', 'clips');
  await runToStorage(ctx, 'concat', { args: { source_urls: opts.source_urls } }, key);
  return { url: publicUrl(ctx.env, key), key };
}

// ── probe ─────────────────────────────────────────────────────────────────────

/** Duration without transcoding. */
export async function runProbe(ctx: Ctx, source_url: string): Promise<RunResult> {
  const res = await callContainer(ctx, { op: 'probe', source_url });
  return readJsonResult(res, 'probe');
}

// ── health ────────────────────────────────────────────────────────────────────

/** True when the container binding exists. Says nothing about whether an image runs. */
export const ffmpegAvailable = (env: Env) => Boolean(env.FFMPEG);

/**
 * Actually reach the container's GET /health. A binding can exist while no image was
 * ever rolled out (`wrangler deploy --containers-rollout=none`), in which case the
 * request never completes — so this is bounded and reports the failure instead of
 * letting a phantom "ok" through. Note that a successful probe starts (and briefly
 * bills) one container instance.
 */
export async function ffmpegHealth(
  env: Env,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<{ ok: boolean; error?: string }> {
  if (!env.FFMPEG) return { ok: false, error: 'binding not configured' };
  try {
    const stub = await containerStub(env);
    const res = await withTimeout(stub.fetch('http://ffmpeg/health'), timeoutMs, 'ffmpeg health');
    const out = (await res.json().catch(() => null)) as RunResult | null;
    if (res.ok && out?.ok) return { ok: true };
    return { ok: false, error: out?.error || `container /health returned HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
