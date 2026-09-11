import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';

import { ffmpegHealth, runClip } from '../src/lib/ffmpeg';
import healthCheck from '../src/fn/healthCheck';
import type { Ctx, Env, User } from '../src/types';

const user: User = { id: 'ffmpeg-test', email: 'ffmpeg@myytengine.invalid' };

/**
 * A stand-in for the container Durable Object namespace. `getRandom` only needs
 * `idFromName` and `get`; the stub's `fetch` plays the Go server.
 */
function fakeBinding(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  return {
    idFromName: (name: string) => ({ name }),
    get: () => ({ fetch: handler }),
  } as unknown as DurableObjectNamespace;
}

function makeCtx(overrides: Partial<Env>): Ctx {
  return {
    env: {
      MEDIA: env.MEDIA,
      COLD: env.COLD,
      DB: env.DB,
      MEDIA_BACKEND: 'r2',
      MEDIA_PUBLIC_BASE: 'https://media.example.test',
      ...overrides,
    } as unknown as Env,
    user,
    db: {} as Ctx['db'],
    keys: {
      get: async () => null,
      require: async (p: string) => { throw new Error(`Missing test key: ${p}`); },
      has: async () => false,
      settings: async () => ({}),
    } as unknown as Ctx['keys'],
    waitUntil: () => {},
  };
}

const MP4_BYTES = new TextEncoder().encode('ftypisom-fake-mp4-payload');

describe('ffmpeg container client', () => {
  it('stores the returned bytes in R2 by binding and hands the container no credential', async () => {
    const seen: any[] = [];
    const binding = fakeBinding(async (_url, init) => {
      seen.push(JSON.parse(String(init?.body)));
      return new Response(MP4_BYTES, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'X-Ffmpeg-Duration': '6.021',
          'X-Ffmpeg-Bytes': String(MP4_BYTES.byteLength),
        },
      });
    });
    const ctx = makeCtx({ FFMPEG: binding });

    const out = await runClip(ctx, { source_url: 'https://media.example.test/durable/src.mp4#t=1', start: 12.6, end: 18.2 });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      op: 'clip',
      source_url: 'https://media.example.test/durable/src.mp4',
      args: { start: 12, duration: 6 },
    });
    expect(seen[0]).not.toHaveProperty('upload');

    expect(out.key).toMatch(/^durable\/\d{4}-\d{2}-\d{2}\/clips\/[a-f0-9]+_clip\.mp4$/);
    expect(out.clip_url).toBe(`https://media.example.test/${out.key}`);
    expect(out.duration).toBe(6.021);

    const stored = await env.MEDIA.get(out.key);
    expect(stored).not.toBeNull();
    expect(stored!.httpMetadata?.contentType).toBe('video/mp4');
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(MP4_BYTES);
    await env.MEDIA.delete(out.key);
  });

  it('surfaces a container failure as a 502 naming the op', async () => {
    const binding = fakeBinding(async () =>
      Response.json({ ok: false, error: 'ffmpeg: exit status 1: Invalid data found' }, { status: 502 }),
    );
    const ctx = makeCtx({ FFMPEG: binding });
    await expect(runClip(ctx, { source_url: 'https://x.test/a.mp4', start: 0, end: 3 }))
      .rejects.toMatchObject({ status: 502, message: expect.stringContaining('ffmpeg clip failed: ffmpeg: exit status 1') });
  });

  it('keeps the 501 in-browser fallback when no binding exists', async () => {
    const ctx = makeCtx({ FFMPEG: undefined });
    await expect(runClip(ctx, { source_url: 'https://x.test/a.mp4', start: 0, end: 3 }))
      .rejects.toMatchObject({ status: 501, message: expect.stringContaining('clipWithFFmpeg.js') });
  });

  it('still requires a pre-authorized upload target on the optional Bunny backend', async () => {
    const binding = fakeBinding(async () => Response.json({ ok: true }));
    const ctx = makeCtx({ FFMPEG: binding, MEDIA_BACKEND: 'bunny', BUNNY_STORAGE_ZONE: '', BUNNY_STORAGE_PASSWORD: '' });
    await expect(runClip(ctx, { source_url: 'https://x.test/a.mp4', start: 0, end: 3 }))
      .rejects.toMatchObject({ status: 500, message: expect.stringContaining('Bunny storage is not configured') });
  });

  it('health probe reports a defined-but-unreachable container as an error, not ok', async () => {
    const never = fakeBinding(() => new Promise<Response>(() => {}));
    const ctx = makeCtx({ FFMPEG: never });
    const h = await ffmpegHealth(ctx.env, 50);
    expect(h.ok).toBe(false);
    expect(h.error).toContain('timed out');

    const ok = fakeBinding(async (url) => {
      expect(url).toBe('http://ffmpeg/health');
      return Response.json({ ok: true });
    });
    expect(await ffmpegHealth(makeCtx({ FFMPEG: ok }).env, 50)).toEqual({ ok: true });
  });

  it('healthCheck row reflects the real probe result', async () => {
    const down = fakeBinding(async () => Response.json({ ok: false, error: 'ffmpeg not runnable' }, { status: 500 }));
    const ctx = makeCtx({ FFMPEG: down, DB: { prepare: () => ({ first: async () => 1 }) } as any });
    const report = (await healthCheck({}, ctx)) as any;
    const row = report.report.find((r: any) => r.name === 'ffmpeg container');
    expect(row.status).toBe('error');
    expect(row.error).toContain('ffmpeg not runnable');

    const none = makeCtx({ FFMPEG: undefined, DB: { prepare: () => ({ first: async () => 1 }) } as any });
    const report2 = (await healthCheck({}, none)) as any;
    expect(report2.report.find((r: any) => r.name === 'ffmpeg container').status).toBe('not configured');
    vi.restoreAllMocks();
  });
});
