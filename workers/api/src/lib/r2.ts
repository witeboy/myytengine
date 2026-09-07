// R2 helpers — COLD STORAGE ONLY.
//
// Media moved to lib/storage.ts when Bunny came back as the media backend. Storage is
// now tiered and the tier is a required argument, because the three classes of data
// have three different lifetimes:
//
//   lib/storage.ts  'ephemeral'  media swept after ~48h   (scene images, clips, SFX)
//   lib/storage.ts  'durable'    finished exports, kept   (timeline renders)
//   THIS FILE / db/cold.ts       oversized D1 columns     (never swept, never public)
//
// Re-exported below so existing imports keep working, but note the signature change:
// putMedia and ingestUrl now REQUIRE a `tier`. That is deliberate — an untiered write
// is a write whose lifetime nobody decided.

export { putMedia, ingestUrl, deleteMedia, publicUrl, buildKey } from './storage';
export type { Tier } from './storage';

import { HttpError } from './http';
import type { Ctx } from '../types';

/** Read an object from the R2 bucket directly. Cold storage and internal use only. */
export async function getMedia(ctx: Ctx, key: string) {
  const obj = await ctx.env.MEDIA.get(key);
  if (!obj) throw new HttpError(404, `Asset not found: ${key}`);
  return obj;
}

/** List objects under a prefix in R2. Used by cleanup jobs and export listings. */
export async function listMedia(ctx: Ctx, prefix: string, limit = 100) {
  const page = await ctx.env.MEDIA.list({ prefix, limit });
  return page.objects.map((o) => ({
    key: o.key,
    size: o.size,
    uploaded: o.uploaded,
  }));
}
