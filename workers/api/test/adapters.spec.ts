import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { anthropic, geminiGenerate, openai } from '../src/lib/ai';
import { getTask } from '../src/lib/ai33';
import { poll, submit } from '../src/lib/asr';
import { fetchJson } from '../src/lib/http';
import { createTask, recordInfo } from '../src/lib/kie';
import { getMedia, listMedia, putMedia } from '../src/lib/r2';
import { pexelsFetch, pixabayFetch } from '../src/lib/stock';
import type { Ctx, Env, User } from '../src/types';
import { searchYouTube } from '../src/lib/youtube';

const user: User = { id: 'phase5-adapters', email: 'phase5-adapters@myytengine.invalid' };

function makeCtx(options: {
  keys?: Record<string, string>;
  asrProvider?: string;
  ai?: { run: ReturnType<typeof vi.fn> };
  waitUntil?: (promise: Promise<unknown>) => void;
} = {}): Ctx {
  const configured = options.keys || {};
  const workerEnv = {
    MEDIA: env.MEDIA,
    COLD: env.COLD,
    AI: options.ai || { run: vi.fn() },
    MEDIA_BACKEND: 'r2',
    MEDIA_PUBLIC_BASE: 'https://media.example.test',
    AI_PROVIDER_MODE: 'aggregator',
    AI_AGGREGATOR_BASE_URL: 'https://aggregator.example.test',
  } as unknown as Env;

  return {
    env: workerEnv,
    user,
    db: {} as Ctx['db'],
    keys: {
      get: async (provider: string) => configured[provider] || null,
      require: async (provider: string) => {
        const value = configured[provider];
        if (!value) throw new Error(`Missing test key: ${provider}`);
        return value;
      },
      has: async (provider: string) => Boolean(configured[provider]),
      settings: async () => ({ asr_provider: options.asrProvider || 'auto' }),
    } as Ctx['keys'],
    waitUntil: options.waitUntil || (() => {}),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Phase 5 provider adapter contracts', () => {
  it('maps Gemini requests and returns the native Gemini response shape', async () => {
    let requestBody: any;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'gemini-ok' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      });
    }));

    const result = await geminiGenerate(
      makeCtx({ keys: { CHEAPER_INFERENCE_API_KEY: 'test-key' } }),
      'gemini-2.0-flash',
      { contents: [{ role: 'user', parts: [{ text: 'hello' }] }] },
    );

    expect(requestBody.model).toBe('gemini-2.5-flash');
    expect(result.candidates[0].content.parts[0].text).toBe('gemini-ok');
  });

  it('maps Anthropic and OpenAI model ids through both convenience adapters', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return bodies.length === 1
        ? Response.json({ content: [{ type: 'text', text: 'claude-ok' }] })
        : Response.json({ choices: [{ message: { content: 'openai-ok' } }] });
    }));
    const ctx = makeCtx({ keys: { CHEAPER_INFERENCE_API_KEY: 'test-key' } });

    const claude = await anthropic(ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'hello' }],
    });
    const gpt = await openai(ctx, '/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(bodies.map((body) => body.model)).toEqual(['claude-sonnet-4.6', 'gpt-5.4']);
    expect(claude.content[0].text).toBe('claude-ok');
    expect(gpt.choices[0].message.content).toBe('openai-ok');
  });

  it('normalizes KIE task submission and polling shapes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/createTask')) {
        return Response.json({ code: 200, data: { taskId: 'kie-task-1' } });
      }
      return Response.json({
        code: 200,
        data: {
          state: 'success',
          resultJson: JSON.stringify({ video_url: 'https://cdn.example.test/video.mp4' }),
        },
      });
    }));
    const ctx = makeCtx({ keys: { KIE_API_KEY: 'test-key' } });

    expect(await createTask(ctx, 'test-model', { prompt: 'hello' })).toBe('kie-task-1');
    await expect(recordInfo(ctx, 'kie-task-1')).resolves.toMatchObject({
      state: 'success',
      url: 'https://cdn.example.test/video.mp4',
      urls: ['https://cdn.example.test/video.mp4'],
    });
  });

  it('normalizes AI33 task polling into the shared audio contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      status: 'done',
      progress: 100,
      credit_cost: 2,
      metadata: {
        audio_url: 'https://cdn.example.test/audio.mp3',
        stream_url: 'https://cdn.example.test/audio-stream.mp3',
      },
    })));

    await expect(getTask(makeCtx({ keys: { AI33_API_KEY: 'test-key' } }), 'audio-task-1'))
      .resolves.toMatchObject({
        status: 'done',
        audioUrl: 'https://cdn.example.test/audio.mp3',
        streamUrl: 'https://cdn.example.test/audio-stream.mp3',
        progress: 100,
      });
  });

  it('writes, reads, and lists media through the R2 adapter', async () => {
    const ctx = makeCtx();
    const stored = await putMedia(ctx, new TextEncoder().encode('phase5-r2-ok'), {
      tier: 'ephemeral',
      filename: 'smoke.txt',
      contentType: 'text/plain',
      prefix: 'phase5-smoke',
    });

    try {
      expect(stored.url).toBe(`https://media.example.test/${stored.key}`);
      expect(await (await getMedia(ctx, stored.key)).text()).toBe('phase5-r2-ok');
      expect((await listMedia(ctx, stored.key)).map((item) => item.key)).toContain(stored.key);
    } finally {
      await env.MEDIA.delete(stored.key);
    }
  });

  it('preserves the submit/poll ASR shape and word timestamps', async () => {
    let background: Promise<unknown> | undefined;
    const ai = {
      run: vi.fn(async () => ({
        results: {
          channels: [{ alternatives: [{
            transcript: 'hello world',
            words: [
              { word: 'hello', start: 0, end: 0.5, confidence: 0.99 },
              { word: 'world', start: 0.6, end: 1.2, confidence: 0.98 },
            ],
          }] }],
        },
      })),
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'audio/mpeg', 'content-length': '3' },
    })));
    const ctx = makeCtx({
      asrProvider: 'workers-ai',
      ai,
      waitUntil: (promise) => { background = promise; },
    });

    const submitted = await submit(ctx, 'https://audio.example.test/sample.mp3');
    expect(submitted.transcript_id).toMatch(/^cfw:/);
    await background;

    await expect(poll(ctx, submitted.transcript_id)).resolves.toMatchObject({
      status: 'completed',
      text: 'hello world',
      words: [
        { word: 'hello', start: 0, end: 0.5 },
        { word: 'world', start: 0.6, end: 1.2 },
      ],
    });
    expect(ai.run).toHaveBeenCalledWith('@cf/deepgram/nova-3', expect.objectContaining({
      audio: expect.objectContaining({ contentType: 'audio/mpeg' }),
      smart_format: true,
    }));
    await env.COLD.delete(`asr/${submitted.transcript_id}.json`);
  });

  it('keeps YouTube Data API reads authenticated and response-shaped', async () => {
    let requestedUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      requestedUrl = url;
      return Response.json({ items: [{ id: { videoId: 'video-1' }, snippet: { title: 'One' } }] });
    }));

    const response = await searchYouTube(
      makeCtx({ keys: { YOUTUBE_API_KEY: 'youtube-test-key' } }),
      { part: 'snippet', q: 'test query', maxResults: 1 },
    );
    const data = await response.json<any>();

    expect(requestedUrl).toContain('/youtube/v3/search?');
    expect(requestedUrl).toContain('key=youtube-test-key');
    expect(data.items[0]).toMatchObject({ id: { videoId: 'video-1' } });
  });

  it('keeps Pexels and Pixabay authentication and raw video-list shapes', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, authorization: new Headers(init?.headers).get('Authorization') });
      return url.includes('pexels')
        ? Response.json({ videos: [{ id: 1, video_files: [] }] })
        : Response.json({ hits: [{ id: 2, videos: {} }] });
    }));
    const ctx = makeCtx({
      keys: { PEXELS_API_KEY: 'pexels-test-key', PIXABAY_API_KEY: 'pixabay-test-key' },
    });

    const [pexels, pixabay] = await Promise.all([
      pexelsFetch(ctx, { query: 'city', per_page: 1 }),
      pixabayFetch(ctx, { q: 'city', per_page: 3 }),
    ]);
    const pexelsData = await pexels.json<any>();
    const pixabayData = await pixabay.json<any>();

    expect(calls.find((call) => call.url.includes('pexels'))?.authorization).toBe('pexels-test-key');
    expect(calls.find((call) => call.url.includes('pixabay'))?.url).toContain('key=pixabay-test-key');
    expect(pexelsData.videos).toEqual(expect.any(Array));
    expect(pixabayData.hits).toEqual(expect.any(Array));
  });

  it('parses a JSON response through the shared HTTP adapter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ok: true, value: 42 })));
    await expect(fetchJson('https://http.example.test/shape', { timeoutMs: 1_000 }))
      .resolves.toEqual({ ok: true, value: 42 });
  });
});
