// BYOK key vault.
//
// Provider keys are supplied by the user in Settings, encrypted with AES-GCM under
// KEYVAULT_MASTER_KEY (a wrangler secret) and stored in D1. Plaintext exists only
// inside a Worker request; it is never returned to the browser and never logged.
//
// A ported function asks for a key by its ORIGINAL env name, so the port stays a
// one-token change:
//     Deno.env.get('GEMINI_API_KEY')   ->   await ctx.keys.require('GEMINI_API_KEY')

import { HttpError, newId, nowIso } from './http';
import type { Env, User } from '../types';

const b64encode = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const b64decode = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function masterKey(env: Env): Promise<CryptoKey> {
  const raw = b64decode(env.KEYVAULT_MASTER_KEY);
  if (raw.length !== 32) {
    throw new HttpError(500, 'KEYVAULT_MASTER_KEY must be 32 bytes, base64-encoded');
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptSecret(env: Env, plaintext: string) {
  const key = await masterKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: b64encode(ct), iv: b64encode(iv.buffer) };
}

export async function decryptSecret(env: Env, ciphertext: string, iv: string) {
  const key = await masterKey(env);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(iv) },
    key,
    b64decode(ciphertext),
  );
  return new TextDecoder().decode(pt);
}

/** Masked preview shown in Settings, e.g. `••••••••4f2a`. Never the real value. */
export const hintOf = (secret: string) =>
  secret.length <= 4 ? '••••' : '••••••••' + secret.slice(-4);

// ── per-request resolver ──────────────────────────────────────────────────────

export interface KeyResolver {
  /** null when the user has not supplied this key. Use for optional providers. */
  get(provider: string): Promise<string | null>;
  /** Throws a 400 the UI renders as "add it in Settings". Use for required providers. */
  require(provider: string): Promise<string>;
  /** True when a key exists — lets a function pick a code path without decrypting. */
  has(provider: string): Promise<boolean>;
  /** Non-secret user preferences (e.g. { asr_provider: 'assemblyai' }). */
  settings(): Promise<Record<string, any>>;
}

export function makeKeyResolver(env: Env, user: User): KeyResolver {
  let loaded: Map<string, { ciphertext: string; iv: string }> | null = null;
  const plain = new Map<string, string>();
  let prefs: Record<string, any> | null = null;

  const load = async () => {
    if (loaded) return loaded;
    const res = await env.DB.prepare(
      'SELECT provider, ciphertext, iv FROM UserApiKeys WHERE user_id = ?',
    )
      .bind(user.id)
      .all<{ provider: string; ciphertext: string; iv: string }>();
    loaded = new Map();
    for (const r of res.results || []) {
      loaded.set(r.provider, { ciphertext: r.ciphertext, iv: r.iv });
    }
    return loaded;
  };

  const get = async (provider: string) => {
    if (plain.has(provider)) return plain.get(provider)!;
    const row = (await load()).get(provider);
    if (!row) return null;
    const value = await decryptSecret(env, row.ciphertext, row.iv);
    plain.set(provider, value);
    return value;
  };

  return {
    get,
    async has(provider) {
      return (await load()).has(provider);
    },
    async require(provider) {
      const v = await get(provider);
      if (!v) {
        throw new HttpError(
          400,
          `Missing API key: ${provider}. Add it in Settings → API Keys.`,
        );
      }
      return v;
    },
    async settings(): Promise<Record<string, any>> {
      if (prefs) return prefs;
      const row = await env.DB.prepare(
        'SELECT attrs FROM UserSettings WHERE user_id = ?',
      )
        .bind(user.id)
        .first<{ attrs: string }>();
      let parsed: Record<string, any>;
      try {
        parsed = row ? JSON.parse(row.attrs || '{}') : {};
      } catch {
        parsed = {};
      }
      prefs = parsed;
      return parsed;
    },
  };
}

// ── writes (used by routes/keys.ts) ───────────────────────────────────────────

export async function putKey(env: Env, user: User, provider: string, secret: string) {
  const { ciphertext, iv } = await encryptSecret(env, secret);
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO UserApiKeys (id, created_date, updated_date, user_id, provider, ciphertext, iv, hint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       iv         = excluded.iv,
       hint       = excluded.hint,
       updated_date = excluded.updated_date,
       last_error = NULL`,
  )
    .bind(newId(), ts, ts, user.id, provider, ciphertext, iv, hintOf(secret))
    .run();
}

export async function deleteKey(env: Env, user: User, provider: string) {
  await env.DB.prepare('DELETE FROM UserApiKeys WHERE user_id = ? AND provider = ?')
    .bind(user.id, provider)
    .run();
}

export async function markKeyResult(
  env: Env,
  user: User,
  provider: string,
  error: string | null,
) {
  await env.DB.prepare(
    `UPDATE UserApiKeys SET last_ok_at = ?, last_error = ?, updated_date = ?
     WHERE user_id = ? AND provider = ?`,
  )
    .bind(error ? null : nowIso(), error, nowIso(), user.id, provider)
    .run();
}

export async function saveSettings(env: Env, user: User, patch: Record<string, any>) {
  const row = await env.DB.prepare('SELECT id, attrs FROM UserSettings WHERE user_id = ?')
    .bind(user.id)
    .first<{ id: string; attrs: string }>();
  const ts = nowIso();
  let current: Record<string, any> = {};
  if (row) {
    try {
      current = JSON.parse(row.attrs || '{}');
    } catch {
      /* ignore */
    }
  }
  const merged = { ...current, ...patch };
  if (row) {
    await env.DB.prepare('UPDATE UserSettings SET attrs = ?, updated_date = ? WHERE id = ?')
      .bind(JSON.stringify(merged), ts, row.id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO UserSettings (id, created_date, updated_date, user_id, attrs)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(newId(), ts, ts, user.id, JSON.stringify(merged))
      .run();
  }
  return merged;
}
