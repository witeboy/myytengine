// KIE.ai adapter — image, video and music generation.
//
// IMPORTANT: KIE is called DIRECTLY, not through AI Gateway. The gateway fronts LLM
// providers only. So for a ported function the KIE URL does not change at all — the
// only edit is the API key, which the codemod already handles:
//     Deno.env.get('KIE_API_KEY')  ->  await ctx.keys.require('KIE_API_KEY')
//
// This module exists for shared use and for the async job pattern every KIE function
// repeats. Ported files may keep their inline fetch; new code should use these.
//
// The contract below was read out of the existing functions, not invented:
//   POST /api/v1/jobs/createTask   { model, input }      -> { code, data: { taskId } }
//   GET  /api/v1/jobs/recordInfo?taskId=X                -> { code, data: { state, resultJson, failMsg } }
//   states: undefined | pending | queued | processing | success | fail
//   result: JSON.parse(data.resultJson).resultUrls[0] ?? .url ?? .video_url
//
// A non-200 `code` in the BODY means failure even when the HTTP status is 200. Every
// original function checks `resData.code !== 200`; so does this one.

import { HttpError } from './http';
import type { Ctx } from '../types';

export const KIE_JOBS = 'https://api.kie.ai/api/v1/jobs';
export const KIE_GENERATE = 'https://api.kie.ai/api/v1/generate';

// House rule: KIE owns ALL visual generation — text-to-image, image-to-image (editing
// and compositing), and image-to-video (animation). AI33 owns audio only; music moved
// off KIE to AI33. Nothing visual should call AI33, and nothing audio should call KIE.
//
// Model ids exactly as they appear in the source. Do not "upgrade" them — the four
// image models below are surfaced to the user by name in
// `src/components/content/ImageProviderSelector.jsx`, so renaming one breaks the picker.
export const KIE_MODELS = {
  // text-to-image — the four choices behind the UI picker
  imageZ: 'z-image',                          // "Z-Image"      (default / best general)
  imageSeedream: 'seedream-4.5',              // "Seedream 4.5"
  imageGrok: 'grok-imagine/text-to-image',    // "Grok Imagine"
  imageNanoBanana: 'google/nano-banana',      // "Nano Banana"

  // image-to-image — editing, compositing, face blending
  imageSeedreamEdit: 'seedream-edit',
  upscaler: 'kie-ai/upscaler',
  imageEnhance: 'kie-ai/image-enhance',

  // image-to-video — animation
  videoGrok: 'grok-imagine/image-to-video',

  // NOTE music-2.5 was here. Music generation moved to AI33 (lib/ai33.ts).
} as const;

/**
 * Text-to-image. Thin wrapper over createTask; the caller keeps its own polling.
 * `input` is passed through verbatim — the per-model fields (aspect_ratio,
 * nsfw_checker, prompt length caps) differ and are the caller's business.
 */
export const createImageTask = (ctx: Ctx, model: string, input: Record<string, unknown>) =>
  createTask(ctx, model, input);

/**
 * Image-to-image via Seedream edit. Shape taken from the existing KIE call in
 * `generateThumbnailImage` — `{ prompt, image_url, aspect_ratio }`, where `image_url`
 * may be a data: URI or a public URL. This is the replacement for AI33's
 * `/v1i/task/generate-image` compositing path used by `thumbnailBlend`.
 */
export const editImage = (
  ctx: Ctx,
  input: { prompt?: string; image_url: string; aspect_ratio?: string } & Record<string, unknown>,
) => createTask(ctx, KIE_MODELS.imageSeedreamEdit, input);

/** Image-to-video. `image_urls` is an array even for a single frame. */
export const animateImage = (
  ctx: Ctx,
  input: {
    image_urls: string[];
    prompt?: string;
    mode?: string;
    duration?: string;
    resolution?: string;
  } & Record<string, unknown>,
) => createTask(ctx, KIE_MODELS.videoGrok, input);

const authHeaders = (key: string) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

/** Raw passthrough, mirroring geminiFetch — returns the untouched Response. */
export async function kieFetch(ctx: Ctx, path: string, init: RequestInit = {}) {
  const key = await ctx.keys.require('KIE_API_KEY');
  const headers = new Headers(init.headers as HeadersInit);
  headers.set('Authorization', `Bearer ${key}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const url = path.startsWith('http') ? path : `${KIE_JOBS}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, { ...init, headers });
}

/** Submit a job. Returns the taskId. Throws with KIE's own message on failure. */
export async function createTask(
  ctx: Ctx,
  model: string,
  input: Record<string, unknown>,
): Promise<string> {
  const key = await ctx.keys.require('KIE_API_KEY');
  const res = await fetch(`${KIE_JOBS}/createTask`, {
    method: 'POST',
    headers: authHeaders(key),
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(60_000),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new HttpError(502, `KIE returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (!res.ok || data.code !== 200) {
    throw new HttpError(502, `KIE API error: ${data.message || data.msg || text.slice(0, 200)}`);
  }

  const taskId = data.data?.taskId;
  if (!taskId) throw new HttpError(502, 'No taskId returned from KIE API');
  return taskId;
}

export type KieState = 'processing' | 'success' | 'fail';

export interface KieRecord {
  state: KieState;
  /** First result URL, when state === 'success' and the URL is populated. */
  url: string | null;
  urls: string[];
  failMsg: string | null;
  createTime: unknown;
  raw: any;
}

/**
 * Poll a job. Note the quirk the originals all handle: a task can report `success`
 * before `resultJson` is populated. That is NOT an error — treat it as still
 * processing and poll again, or the caller writes an empty URL into the entity.
 */
export async function recordInfo(ctx: Ctx, taskId: string): Promise<KieRecord> {
  const key = await ctx.keys.require('KIE_API_KEY');
  const res = await fetch(`${KIE_JOBS}/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new HttpError(502, `KIE status check failed: ${res.status} - ${t.slice(0, 200)}`);
  }

  const data = await res.json<any>();
  if (data.code !== 200) {
    throw new HttpError(502, `KIE status error: ${data.msg || data.message}`);
  }

  const record = data.data || {};
  const rawState = record.state;

  let resultJson: any = {};
  try {
    resultJson = JSON.parse(record.resultJson || '{}');
  } catch {
    /* leave empty — same tolerance as the originals */
  }

  const urls: string[] = resultJson.resultUrls
    || (resultJson.url ? [resultJson.url] : [])
    || (resultJson.video_url ? [resultJson.video_url] : [])
    || [];
  const url = urls[0] || resultJson.url || resultJson.video_url || null;

  let state: KieState;
  if (rawState === 'fail') state = 'fail';
  else if (rawState === 'success') state = url ? 'success' : 'processing';
  else state = 'processing';

  return {
    state,
    url,
    urls,
    failMsg: record.failMsg || record.failCode || null,
    createTime: record.createTime,
    raw: record,
  };
}

/**
 * Re-host a KIE result in R2 and return a permanent URL.
 *
 * KIE hands back short-lived URLs on `file.aiquickdraw.com` / `tempfile.aiquickdraw.com`.
 * Writing one into an entity row means that row eventually points at nothing —
 * `proxyFetchAsset` exists largely to paper over the consequences at export time.
 *
 * Defaults to 'durable' because the caller is, by definition, about to persist the URL.
 */
export async function persistResult(
  ctx: Ctx,
  url: string,
  prefix = 'kie',
  tier: 'ephemeral' | 'durable' = 'durable',
): Promise<string> {
  const { ingestUrl } = await import('./storage');
  const stored = await ingestUrl(ctx, url, { tier, prefix });
  return stored.url;
}
