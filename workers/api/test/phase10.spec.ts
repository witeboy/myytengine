import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import analyzeViralMoments from '../src/fn/analyzeViralMoments';
import downloadYouTubeVideo from '../src/fn/downloadYouTubeVideo';
import { FUNCTIONS } from '../src/fn/registry';
import type { Ctx } from '../src/types';

function context(keys: Record<string, string> = {}): Ctx {
  const configured: Record<string, string> = { CHEAPER_INFERENCE_API_KEY: 'test-key', ...keys };
  return {
    env: { MEDIA: env.MEDIA, MEDIA_BACKEND: 'r2', MEDIA_PUBLIC_BASE: 'https://media.example.test', AI_PROVIDER_MODE: 'aggregator', AI_AGGREGATOR_BASE_URL: 'https://ai.example.test' },
    user: { id: 'phase10', email: 'phase10@myytengine.invalid' },
    db: {},
    keys: { get: async (key: string) => configured[key] || null, has: async (key: string) => !!configured[key], require: async (key: string) => {
      if (!configured[key]) throw new Error(`Unexpected key ${key}`);
      return configured[key];
    } },
    waitUntil: () => {},
  } as unknown as Ctx;
}
afterEach(() => vi.unstubAllGlobals());

describe('Phase 10 clips and scheduling', () => {
  it('runs the nested inference helper and preserves snapped clip response fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ content: [{ type: 'text', text: JSON.stringify({ clips: [{ title: 'Moon landing', start: 0, end: 20, virality_score: 90 }] }) }] })));
    const words = Array.from({ length: 25 }, (_, i) => ({ word: i === 20 ? 'moon.' : 'word', start: i, end: i + 0.8 }));
    const result = await analyzeViralMoments({ transcript: 'Moon landing', words, duration: 25 }, context());
    expect(result).toMatchObject({ success: true, total_found: 1, video_duration: 25, model_used: 'base44_llm' });
    expect((result as any).clips[0]).toMatchObject({ title: 'Moon landing', virality_score: 90 });
  });

  it('rehosts both temporary Cobalt streams in durable R2 and keeps URL aliases', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'https://cobalt.example.test/') {
        const audio = JSON.parse(String(init?.body)).downloadMode === 'audio';
        return Response.json({ status: 'tunnel', url: `https://source.example.test/${audio ? 'audio.mp3' : 'video.mp4'}`, filename: 'Moon.mp4' });
      }
      if (url.startsWith('https://source.example.test/')) return new Response('sample-media', { headers: { 'Content-Type': url.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4' } });
      return Response.json({ title: 'Moon', author_name: 'Test' });
    }));
    const result = await downloadYouTubeVideo({ url: 'https://www.youtube.com/watch?v=abcdefghijk' }, context({ COBALT_API_URL: 'https://cobalt.example.test' })) as any;
    expect(result.video_url).toBe(result.stable_video_url);
    expect(result.audio_url).toBe(result.stable_audio_url);
    for (const url of [result.video_url, result.audio_url]) {
      expect(url).toMatch(/^https:\/\/media\.example\.test\/durable\//);
      const key = new URL(url).pathname.slice(1);
      expect(await (await env.MEDIA.get(key))?.text()).toBe('sample-media');
      await env.MEDIA.delete(key);
    }
  });

  it('retains the missing Cobalt configuration error', async () => {
    await expect(downloadYouTubeVideo({ url: 'https://youtu.be/abcdefghijk' }, context())).rejects.toMatchObject({ status: 400, message: 'COBALT_API_URL not set' });
  });

  it('no longer registers the removed auto-post scheduler', () => {
    expect(FUNCTIONS.scheduleClipPost).toBeUndefined();
  });
});
