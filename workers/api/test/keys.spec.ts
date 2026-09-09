import { env } from 'cloudflare:workers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { makeDb } from '../src/db/client';
import { listKeys, setKey, testAllKeys, testKey } from '../src/routes/keys';
import { makeKeyResolver } from '../src/lib/vault';
import type { Ctx, Env as WorkerEnv, User } from '../src/types';

const user: User = {
  id: 'phase4-byok',
  email: 'phase4-byok@myytengine.invalid',
};

const masterKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const testEnv = {
  DB: env.DB,
  KEYVAULT_MASTER_KEY: masterKey,
} as WorkerEnv;

function makeCtx(): Ctx {
  return {
    env: testEnv,
    user,
    db: makeDb(testEnv, user),
    keys: makeKeyResolver(testEnv, user),
    waitUntil: () => {},
  };
}

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS UserApiKeys (
      id TEXT PRIMARY KEY,
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      hint TEXT NOT NULL DEFAULT '',
      last_ok_at TEXT,
      last_error TEXT
    )`),
    env.DB.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_UserApiKeys_user_provider ON UserApiKeys(user_id, provider)',
    ),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS UserSettings (
      id TEXT PRIMARY KEY,
      created_date TEXT NOT NULL,
      updated_date TEXT NOT NULL,
      user_id TEXT NOT NULL,
      attrs TEXT NOT NULL DEFAULT '{}'
    )`),
    env.DB.prepare(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_UserSettings_user ON UserSettings(user_id)',
    ),
  ]);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await env.DB.prepare('DELETE FROM UserApiKeys WHERE user_id = ?').bind(user.id).run();
  await env.DB.prepare('DELETE FROM UserSettings WHERE user_id = ?').bind(user.id).run();
});

describe('BYOK Settings security contract', () => {
  it('returns only a masked hint while D1 stores AES-GCM ciphertext', async () => {
    const plaintext = `phase4-secret-${crypto.randomUUID()}-TAIL`;
    const saved = await setKey(
      { provider: 'COBALT_API_URL', value: plaintext },
      makeCtx(),
    );

    expect(saved).toEqual({
      provider: 'COBALT_API_URL',
      configured: true,
      hint: '••••••••TAIL',
    });
    expect(JSON.stringify(saved)).not.toContain(plaintext);
    expect(JSON.stringify(saved)).not.toContain('ciphertext');

    const raw = await env.DB.prepare(
      'SELECT ciphertext, iv, hint FROM UserApiKeys WHERE user_id = ? AND provider = ?',
    )
      .bind(user.id, 'COBALT_API_URL')
      .first<{ ciphertext: string; iv: string; hint: string }>();

    expect(raw?.ciphertext).toBeTruthy();
    expect(raw?.ciphertext).not.toContain(plaintext);
    expect(raw?.iv).toBeTruthy();
    expect(raw?.hint).toBe('••••••••TAIL');

    const listed = await listKeys(makeCtx());
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(plaintext);
    expect(serialized).not.toContain('ciphertext');
    expect(serialized).not.toContain('"iv"');
    expect(listed.providers.find((provider) => provider.id === 'COBALT_API_URL')).toMatchObject({
      configured: true,
      hint: '••••••••TAIL',
    });
  });

  it('reports a deliberately invalid value as a failed provider test', async () => {
    await expect(
      testKey({ provider: 'COBALT_API_URL', value: 'not-a-url' }, makeCtx()),
    ).resolves.toMatchObject({ provider: 'COBALT_API_URL', ok: false });
  });

  it('reports success when the configured provider probe succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));

    await expect(
      testKey({ provider: 'COBALT_API_URL', value: 'https://provider.example' }, makeCtx()),
    ).resolves.toEqual({ provider: 'COBALT_API_URL', ok: true });
  });

  it('Test all runs every configured provider and returns no stored value', async () => {
    const plaintext = 'https://configured-provider.example';
    await setKey({ provider: 'COBALT_API_URL', value: plaintext }, makeCtx());
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })));

    const result = await testAllKeys(makeCtx());

    expect(result).toEqual({
      tested: 1,
      results: [{ provider: 'COBALT_API_URL', ok: true }],
    });
    expect(JSON.stringify(result)).not.toContain(plaintext);
  });
});
