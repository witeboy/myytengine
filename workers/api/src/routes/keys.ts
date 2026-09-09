// /api/keys/*  — BYOK management for the Settings page.
//
// Invariant: a stored key's plaintext is NEVER returned to the browser. The UI only
// ever sees `configured: true` plus a masked hint. Writes are one-way.

import { badRequest, notFound } from '../lib/http';
import { getProvider, publicCatalog, PROVIDERS } from '../lib/providers';
import { deleteKey, hintOf, markKeyResult, putKey, saveSettings } from '../lib/vault';
import type { Ctx } from '../types';

interface KeyRow {
  provider: string;
  hint: string;
  updated_date: string;
  last_ok_at: string | null;
  last_error: string | null;
}

/** GET /api/keys — catalog + which are configured. No secrets. */
export async function listKeys(ctx: Ctx) {
  const res = await ctx.env.DB.prepare(
    `SELECT provider, hint, updated_date, last_ok_at, last_error
       FROM UserApiKeys WHERE user_id = ?`,
  )
    .bind(ctx.user.id)
    .all<KeyRow>();

  const stored = new Map((res.results || []).map((r) => [r.provider, r]));

  const providers = publicCatalog().map((p) => {
    const row = stored.get(p.id);
    return {
      ...p,
      configured: !!row,
      hint: row?.hint || null,
      updated_date: row?.updated_date || null,
      last_ok_at: row?.last_ok_at || null,
      last_error: row?.last_error || null,
    };
  });

  const missingCore = providers.filter((p) => p.tier === 'core' && !p.configured);

  return {
    providers,
    settings: await ctx.keys.settings(),
    ready: missingCore.length === 0,
    missing_core: missingCore.map((p) => p.id),
  };
}

/** POST /api/keys/set { provider, value } */
export async function setKey(body: any, ctx: Ctx) {
  const provider = String(body?.provider || '');
  const value = String(body?.value ?? '').trim();
  const def = getProvider(provider);
  if (!def) throw notFound(`Unknown provider: ${provider}`);
  if (!value) throw badRequest('value is required — use DELETE to clear a key');

  await putKey(ctx.env, ctx.user, provider, value);
  return { provider, configured: true, hint: hintOf(value) };
}

/**
 * POST /api/keys/test { provider, value? }
 * Tests the supplied value if given (so the user can verify before saving),
 * otherwise the stored one.
 */
export async function testKey(body: any, ctx: Ctx) {
  const provider = String(body?.provider || '');
  const def = getProvider(provider);
  if (!def) throw notFound(`Unknown provider: ${provider}`);

  const value = body?.value ? String(body.value).trim() : await ctx.keys.get(provider);
  if (!value) throw badRequest(`No key stored for ${provider}`);

  try {
    await def.test(value);
  } catch (e: any) {
    const message = e?.message || String(e);
    if (!body?.value) await markKeyResult(ctx.env, ctx.user, provider, message);
    return { provider, ok: false, error: message };
  }

  if (!body?.value) await markKeyResult(ctx.env, ctx.user, provider, null);
  return { provider, ok: true };
}

/** POST /api/keys/delete { provider } */
export async function removeKey(body: any, ctx: Ctx) {
  const provider = String(body?.provider || '');
  if (!getProvider(provider)) throw notFound(`Unknown provider: ${provider}`);
  await deleteKey(ctx.env, ctx.user, provider);
  return { provider, configured: false };
}

/** POST /api/keys/settings { patch } — non-secret preferences. */
export async function updateSettings(body: any, ctx: Ctx) {
  const patch = body?.patch;
  if (!patch || typeof patch !== 'object') throw badRequest('patch object is required');

  const ALLOWED = new Set(['asr_provider', 'tts_provider', 'default_image_model', 'default_video_model']);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (ALLOWED.has(k)) clean[k] = v;
  }
  if (!Object.keys(clean).length) throw badRequest('No recognised settings in patch');

  return saveSettings(ctx.env, ctx.user, clean);
}

/**
 * POST /api/keys/testAll — runs every configured key's probe.
 * Used by the "Test all" button and by HealthCheckButton.
 */
export async function testAllKeys(ctx: Ctx) {
  const results: Array<{ provider: string; ok: boolean; error?: string }> = [];
  for (const def of PROVIDERS) {
    const value = await ctx.keys.get(def.id);
    if (!value) continue;
    try {
      await def.test(value);
      await markKeyResult(ctx.env, ctx.user, def.id, null);
      results.push({ provider: def.id, ok: true });
    } catch (e: any) {
      const message = e?.message || String(e);
      await markKeyResult(ctx.env, ctx.user, def.id, message);
      results.push({ provider: def.id, ok: false, error: message });
    }
  }
  return { results, tested: results.length };
}
