// Worker-side client for the ffmpeg container. See codex/FFMPEG.md.
//
// The container is deliberately dumb: it fetches a source URL, runs one ffmpeg command,
// PUTs the result to a target the Worker hands it, and reports back. It holds no API
// keys, has no database access, and makes no decisions. All policy lives here.
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

interface RunResult {
  ok: boolean;
  duration?: number;
  bytes?: number;
  error?: string;
}

/**
 * A one-shot upload target for the container: the exact PUT URL and the access key,
 * scoped to a single object. The container never learns the storage zone password's
 * broader scope, and never sees any other credential.
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

async function callContainer(ctx: Ctx, payload: Record<string, unknown>): Promise<RunResult> {
  const binding = ctx.env.FFMPEG;
  if (!binding) {
    throw new HttpError(
      501,
      'The ffmpeg container is not deployed. Server-side video operations are unavailable; ' +
        'the in-browser path (src/lib/clipWithFFmpeg.js) still works. See codex/FFMPEG.md.',
    );
  }

  // Load-balance across a fixed pool rather than minting a fresh instance per job.
  // A unique id per job would mean a brand-new container every time — cold start on
  // every clip, and since Containers bill per second, the most expensive possible
  // shape. A pool lets `sleepAfter` do its job and keeps warm instances in play.
  // FFMPEG_POOL must not exceed max_instances in wrangler.toml.
  const stub = await getRandom(binding as any, FFMPEG_POOL);

  const res = await stub.fetch('http://ffmpeg/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const out = ((await res.json().catch(() => null)) as RunResult | null)
    || { ok: false, error: 'container returned no JSON' };
  if (!res.ok || !out.ok) {
    throw new HttpError(502, `ffmpeg ${payload.op} failed: ${out.error || res.status}`);
  }
  return out;
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

  // 'durable': the clip URL is returned to the caller and ends up in the OpenShorts
  // manifest. Pass tier: 'ephemeral' explicitly for a throwaway preview render.
  const key = buildKey(opts.tier ?? 'durable', 'clip.mp4', 'clips');

  const result = await callContainer(ctx, {
    op: 'clip',
    source_url: String(opts.source_url).split('#')[0],
    args: { start: Math.floor(opts.start), duration },
    upload: uploadTarget(ctx.env, key),
  });

  return { clip_url: publicUrl(ctx.env, key), key, duration: result.duration ?? duration };
}

// ── caption burn-in ───────────────────────────────────────────────────────────

export async function runBurnCaptions(
  ctx: Ctx,
  opts: { source_url: string; srt: string; style?: Record<string, unknown>; tier?: Tier },
): Promise<{ url: string; key: string }> {
  const key = buildKey(opts.tier ?? 'durable', 'captioned.mp4', 'clips');
  await callContainer(ctx, {
    op: 'burn_captions',
    source_url: opts.source_url,
    args: { srt: opts.srt, style: opts.style || {} },
    upload: uploadTarget(ctx.env, key),
  });
  return { url: publicUrl(ctx.env, key), key };
}

// ── concat ────────────────────────────────────────────────────────────────────

export async function runConcat(
  ctx: Ctx,
  opts: { source_urls: string[]; tier?: Tier },
): Promise<{ url: string; key: string }> {
  if (!opts.source_urls?.length) throw new HttpError(400, 'source_urls is required');
  const key = buildKey(opts.tier ?? 'durable', 'concat.mp4', 'clips');
  await callContainer(ctx, {
    op: 'concat',
    args: { source_urls: opts.source_urls },
    upload: uploadTarget(ctx.env, key),
  });
  return { url: publicUrl(ctx.env, key), key };
}

// ── probe ─────────────────────────────────────────────────────────────────────

/** Duration/dimensions without transcoding. Also the container's health check. */
export async function runProbe(ctx: Ctx, source_url: string) {
  return callContainer(ctx, { op: 'probe', source_url });
}

/** True when the container binding exists — lets healthCheck report it honestly. */
export const ffmpegAvailable = (env: Env) => Boolean(env.FFMPEG);
