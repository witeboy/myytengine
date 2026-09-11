import { afterEach, describe, expect, it, vi } from 'vitest';

import proxyFetchAsset from '../src/fn/proxyFetchAsset';
import selectHook from '../src/fn/selectHook';
import callClaudeProxy from '../src/fn/callClaudeProxy';
import { ownMediaHosts } from '../src/lib/storage';
import type { Ctx, Env } from '../src/types';

const ctx = (env: Partial<Env>): Ctx => ({
  env: { MEDIA_BACKEND: 'r2', MEDIA_PUBLIC_BASE: 'https://media.example.test', ...env } as Env,
  user: { id: 'u', email: 'u@myytengine.invalid' },
  db: {} as Ctx['db'],
  keys: { get: async () => null, require: async () => { throw new Error('none'); } } as unknown as Ctx['keys'],
  waitUntil: () => {},
});

afterEach(() => vi.unstubAllGlobals());

describe('asset proxies trust the app\'s own media host', () => {
  it('derives hosts from the configured storage bases', () => {
    expect(ownMediaHosts({ MEDIA_PUBLIC_BASE: 'https://media.example.test' } as Env)).toEqual(['media.example.test']);
    expect(ownMediaHosts({ MEDIA_PUBLIC_BASE: 'https://a.test/', BUNNY_CDN_URL: 'https://b.b-cdn.net' } as Env)).toEqual(['a.test', 'b.b-cdn.net']);
    expect(ownMediaHosts({ MEDIA_PUBLIC_BASE: 'not a url' } as Env)).toEqual([]);
  });

  it('proxyFetchAsset serves a durable asset from the media domain inline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/wav' } })));
    const out = (await proxyFetchAsset({ url: 'https://media.example.test/durable/2026-09-11/uploads/a.wav' }, ctx({}))) as any;
    expect(out.success).toBe(true);
    expect(out.content_type).toBe('audio/wav');
    expect(atob(out.data)).toBe('\x01\x02\x03');
  });

  it('still rejects hosts outside the list', async () => {
    await expect(proxyFetchAsset({ url: 'https://evil.example/x.mp4' }, ctx({}))).rejects.toMatchObject({ status: 403 });
    await expect(callClaudeProxy({ action: 'proxyAsset', url: 'https://evil.example/x.mp4' }, ctx({}))).rejects.toMatchObject({ status: 403 });
    await expect(selectHook({ action: 'proxyAsset', url: 'https://evil.example/x.mp4' }, ctx({}))).rejects.toThrow(/not in allowlist: evil\.example/);
  });

  it('selectHook and callClaudeProxy proxy the media domain too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([9]), { headers: { 'content-type': 'image/png' } })));
    const a = (await selectHook({ action: 'proxyAsset', url: 'https://media.example.test/durable/x.png' }, ctx({}))) as any;
    expect(a.success).toBe(true);
    const b = (await callClaudeProxy({ action: 'proxyAsset', url: 'https://media.example.test/durable/x.png' }, ctx({}))) as any;
    expect(b.success).toBe(true);
  });
});
