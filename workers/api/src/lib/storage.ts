// Media storage with tiered retention.
//
// THREE TIERS, THREE LIFETIMES. Getting this wrong is silent data loss, so the tier is
// a required argument — there is no default.
//
// THE RULE THAT DECIDES THE TIER:
//
//     If a URL is written into an entity row, the asset is 'durable'.
//     If nothing persists it, it is 'ephemeral'.
//
// That is not a style preference. A scene image is referenced by `Scenes.image_url` and
// a project may sit for weeks; sweeping it at 48h would empty a live project — strictly
// worse than the expiring provider URLs this re-hosting exists to fix. Cost control for
// project media is keyed on the project being archived, not on a timer (see the
// scheduled handler in index.ts).
//
//   'ephemeral'  Bunny · deleted after ~48h. Genuinely transient: the proxy cache for
//                CORS-blocked provider assets during export. Nothing references these
//                once the export finishes.
//   'durable'    Bunny · never swept on a timer. Anything an entity points at — scene
//                images and videos, thumbnails, voiceovers, music, sound effects,
//                downloaded sources, finished exports.
//   'cold'       R2 · never swept, never public. Oversized D1 column overflow
//                (timeline clips, caption data, full scripts). Handled by db/cold.ts,
//                not here — listed so the boundary is explicit.
//
// WHY BUNNY IS SAFE NOW
// ---------------------
// Bunny was retired earlier for a specific reason: `quickPublishTranscribe`'s
// `bunny_config` action returned BUNNY_STORAGE_PASSWORD **to the browser** so it could
// PUT directly, handing a write credential to every client. That action is gone and is
// not coming back. Every call here is Worker -> Bunny, server side. The key never
// leaves the isolate. Bunny as a storage backend was never the problem; exposing its
// password was.
//
// EXPIRY IS BY DATE-PREFIX, NOT PER-OBJECT
// ----------------------------------------
// Bunny Storage has no native object TTL (R2 does, via lifecycle rules — see the note
// at the bottom). So keys carry the upload date:
//
//     ephemeral/2026-09-06/9f3c…_scene-04.jpg
//
// and the scheduled sweeper deletes whole day folders. That is one DELETE per day
// folder instead of one per object, and it needs no metadata lookups.

import { HttpError, newId } from './http';
import type { Ctx, Env } from '../types';

export type Tier = 'ephemeral' | 'durable';

const slug = (name: string) => (name || 'file.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
const today = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

/** `de`/`storage`/empty use the apex host; every other region is a subdomain. */
function bunnyHost(env: Env): string {
  const region = (env.BUNNY_STORAGE_REGION || 'ny').trim();
  return region === 'de' || region === 'storage' || !region
    ? 'storage.bunnycdn.com'
    : `${region}.storage.bunnycdn.com`;
}

function requireBunny(env: Env) {
  const zone = (env.BUNNY_STORAGE_ZONE || '').trim();
  const pass = (env.BUNNY_STORAGE_PASSWORD || '').trim();
  const cdn = (env.BUNNY_CDN_URL || '').trim().replace(/\/$/, '');
  if (!zone || !pass || !cdn) {
    throw new HttpError(
      500,
      'Bunny storage is not configured. Set BUNNY_STORAGE_ZONE, BUNNY_STORAGE_REGION ' +
        'and BUNNY_CDN_URL in wrangler.toml, and BUNNY_STORAGE_PASSWORD as a secret.',
    );
  }
  return { zone, pass, cdn, host: bunnyHost(env) };
}

/**
 * Hostnames of our own media storage, for the asset-proxy allowlists. The original
 * allowlists named provider CDNs plus the Base44-era storage hosts; after the storage
 * migration the app's own durable media lives on MEDIA_PUBLIC_BASE (R2 custom domain)
 * or the Bunny CDN, so those hosts must be proxyable or exports of our own assets fail.
 */
export function ownMediaHosts(env: Env): string[] {
  const hosts: string[] = [];
  for (const base of [env.MEDIA_PUBLIC_BASE, env.BUNNY_CDN_URL]) {
    if (!base) continue;
    try {
      hosts.push(new URL(base).hostname);
    } catch {
      // ignore malformed config; the static allowlist still applies
    }
  }
  return hosts;
}

/** Public CDN URL for a stored key. */
export function publicUrl(env: Env, key: string): string {
  if ((env.MEDIA_BACKEND || 'bunny') === 'r2') {
    return `${env.MEDIA_PUBLIC_BASE.replace(/\/$/, '')}/${key}`;
  }
  return `${requireBunny(env).cdn}/${key}`;
}

/**
 * Build a tiered, date-prefixed key. Callers that need a stable key layout (the audio
 * functions write `music/…`, `sfx/…`) pass it as `prefix`; it sits inside the tier so
 * retention still applies.
 */
export function buildKey(tier: Tier, filename: string, prefix?: string): string {
  const mid = prefix ? `${prefix.replace(/^\/|\/$/g, '')}/` : '';
  return `${tier}/${today()}/${mid}${newId()}_${slug(filename)}`;
}

async function putBunny(
  env: Env,
  key: string,
  body: ArrayBuffer | Uint8Array | ReadableStream | Blob,
  contentType: string,
): Promise<void> {
  const { zone, pass, host } = requireBunny(env);
  const res = await fetch(`https://${host}/${zone}/${key}`, {
    method: 'PUT',
    headers: { AccessKey: pass, 'Content-Type': contentType },
    body: body as BodyInit,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new HttpError(502, `Bunny upload failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

/** Store bytes and return the CDN URL. `tier` is required — see the header. */
export async function putMedia(
  ctx: Ctx,
  body: ArrayBuffer | Uint8Array | ReadableStream | Blob,
  opts: { tier: Tier; filename?: string; contentType?: string; prefix?: string },
): Promise<{ url: string; key: string }> {
  const key = buildKey(opts.tier, opts.filename || 'file.bin', opts.prefix);
  const contentType = opts.contentType || 'application/octet-stream';

  if ((ctx.env.MEDIA_BACKEND || 'bunny') === 'r2') {
    await ctx.env.MEDIA.put(key, body as any, { httpMetadata: { contentType } });
  } else {
    await putBunny(ctx.env, key, body, contentType);
  }
  return { url: publicUrl(ctx.env, key), key };
}

/**
 * Copy a provider's temporary output into our storage and return a permanent URL.
 *
 * This is the most repeated operation in the image/video/audio functions: KIE hands back
 * short-lived `file.aiquickdraw.com` links and Suno serves from `cdn1.suno.ai`, both of
 * which expire. Re-hosting is what stops an entity row pointing at a dead URL.
 */
export async function ingestUrl(
  ctx: Ctx,
  url: string,
  opts: { tier: Tier; filename?: string; prefix?: string; timeoutMs?: number },
): Promise<{ url: string; key: string; contentType: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
  });
  if (!res.ok) throw new HttpError(502, `Could not fetch asset (HTTP ${res.status}): ${url}`);

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const guessed = opts.filename || url.split('?')[0].split('/').pop() || 'asset.bin';

  const stored = await putMedia(ctx, res.body as ReadableStream, {
    tier: opts.tier,
    filename: guessed,
    contentType,
    prefix: opts.prefix,
  });
  return { ...stored, contentType };
}

export async function deleteMedia(env: Env, key: string): Promise<void> {
  if ((env.MEDIA_BACKEND || 'bunny') === 'r2') {
    await env.MEDIA.delete(key);
    return;
  }
  const { zone, pass, host } = requireBunny(env);
  await fetch(`https://${host}/${zone}/${key}`, {
    method: 'DELETE',
    headers: { AccessKey: pass },
  });
}

// ── 48-hour sweeper ───────────────────────────────────────────────────────────
//
// Run from the Worker's scheduled handler. Deletes `ephemeral/<date>/` folders older
// than the retention window. `durable/` is never touched, and R2 cold storage is a
// different bucket entirely.
//
// RETENTION IS A FLOOR, NOT AN EXACT AGE. Deleting whole day folders means an object
// lives between 48 and 72 hours depending on when in the day it was written. That is
// deliberate: the guarantee that matters is "nothing is deleted before 48h".

export const RETENTION_DAYS = 2;

function foldersToSweep(existing: string[], retentionDays = RETENTION_DAYS): string[] {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  // Lexicographic comparison is correct for YYYY-MM-DD.
  return existing.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoffStr);
}

/** Bunny returns a JSON array of entries for a directory listing. */
async function listBunnyDirs(env: Env, path: string): Promise<string[]> {
  const { zone, pass, host } = requireBunny(env);
  const res = await fetch(`https://${host}/${zone}/${path}`, {
    headers: { AccessKey: pass, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const items = (await res.json<any[]>().catch(() => [])) || [];
  return items.filter((i) => i?.IsDirectory).map((i) => String(i.ObjectName));
}

/**
 * Delete expired ephemeral media. Returns what it removed so the scheduled handler can
 * log it — silent deletion of user-visible assets is not something to do blindly.
 */
export async function sweepExpired(env: Env): Promise<{ swept: string[]; backend: string }> {
  const backend = env.MEDIA_BACKEND || 'bunny';

  if (backend === 'r2') {
    // R2 supports native lifecycle rules; prefer configuring one on the bucket over
    // sweeping here. This branch exists so the two backends behave the same if you have
    // not set that rule up.
    const swept: string[] = [];
    let cursor: string | undefined;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    do {
      const page = await env.MEDIA.list({ prefix: 'ephemeral/', cursor, limit: 1000 });
      const stale = page.objects.filter((o) => o.uploaded < cutoff);
      if (stale.length) {
        await env.MEDIA.delete(stale.map((o) => o.key));
        swept.push(...stale.map((o) => o.key));
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return { swept, backend };
  }

  const dirs = await listBunnyDirs(env, 'ephemeral/');
  const expired = foldersToSweep(dirs);
  const { zone, pass, host } = requireBunny(env);

  for (const day of expired) {
    // A trailing slash tells Bunny to remove the directory and its contents.
    await fetch(`https://${host}/${zone}/ephemeral/${day}/`, {
      method: 'DELETE',
      headers: { AccessKey: pass },
    });
  }
  return { swept: expired.map((d) => `ephemeral/${d}/`), backend };
}

export { foldersToSweep as __foldersToSweepForTests };

// ── archive sweep — the real cost lever for project media ─────────────────────
//
// A blanket timer cannot free project media safely: a scene image is referenced by
// `Scenes.image_url` and a project may sit open for weeks. So the lever is the project
// lifecycle instead. `Projects.archived` already exists and the Dashboard already sets
// it — archiving a project is the user saying "I am done with this".
//
// This collects every asset URL a project's rows point at, deletes those objects, and
// blanks the columns so the UI shows an archived project as having no media rather than
// broken images.
//
// DEFAULT OFF. `ARCHIVE_SWEEP_ENABLED` must be set to "true" in wrangler.toml. Deleting
// a user's generated media is not something to switch on by inference.

const ASSET_FIELDS: Record<string, string[]> = {
  Scenes: ['image_url', 'video_url', 'sound_effect_url', 'broll_url', 'broll_thumbnail'],
  MusicTracks: ['audio_url'],
  ThumbnailConcepts: ['image_url'],
  ProductionSettings: ['voiceover_url'],
  MediaAssets: ['file_url'],
};

/** Pull our own storage key out of a public CDN URL. Foreign URLs return null. */
export function keyFromUrl(env: Env, url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('http')) return null;
  const base =
    (env.MEDIA_BACKEND || 'bunny') === 'r2'
      ? env.MEDIA_PUBLIC_BASE
      : env.BUNNY_CDN_URL || '';
  const prefix = String(base).replace(/\/$/, '') + '/';
  if (!base || !url.startsWith(prefix)) return null;   // provider URL, not ours
  const key = url.slice(prefix.length).split('?')[0];
  // Only ever delete inside our own tiers.
  return key.startsWith('durable/') || key.startsWith('ephemeral/') ? key : null;
}

/**
 * Free the media belonging to one archived project.
 * Returns the keys removed so the caller can log them — this deletes user-visible work.
 */
export async function sweepArchivedProject(
  ctx: Ctx,
  projectId: string,
): Promise<{ deleted: string[] }> {
  const deleted: string[] = [];

  for (const [entity, fields] of Object.entries(ASSET_FIELDS)) {
    const rows = await ctx.db[entity].filter({ project_id: projectId });
    for (const row of rows) {
      const patch: Record<string, null> = {};
      for (const f of fields) {
        const key = keyFromUrl(ctx.env, row[f]);
        if (!key) continue;
        await deleteMedia(ctx.env, key);
        deleted.push(key);
        patch[f] = null;
      }
      // Blank the columns so the UI reads "no media", not a broken image.
      if (Object.keys(patch).length) await ctx.db[entity].update(row.id, patch);
    }
  }

  return { deleted };
}
