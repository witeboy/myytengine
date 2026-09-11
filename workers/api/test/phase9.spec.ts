import { afterEach, describe, expect, it, vi } from 'vitest';
import analyzeForThumbnail from '../src/fn/analyzeForThumbnail';
import newThumbnailConcept from '../src/fn/newThumbnailConcept';
import { FUNCTIONS } from '../src/fn/registry';
import { invokeLLM } from '../src/lib/ai';
import type { Ctx } from '../src/types';

function context(): Ctx {
  return {
    env: { AI_PROVIDER_MODE: 'aggregator', AI_AGGREGATOR_BASE_URL: 'https://api.example.test' },
    user: { id: 'phase9', email: 'phase9@myytengine.invalid' },
    keys: {
      get: async () => null,
      has: async (key: string) => key === 'CHEAPER_INFERENCE_API_KEY',
      require: async (key: string) => {
        if (key !== 'CHEAPER_INFERENCE_API_KEY') throw new Error(`Unexpected direct key: ${key}`);
        return 'test-aggregator-key';
      },
    },
    db: { ThumbnailConcepts: { create: vi.fn(async (row) => ({ ...row, id: 'concept-1' })) } },
    waitUntil: () => {},
  } as unknown as Ctx;
}

afterEach(() => vi.unstubAllGlobals());

describe('Phase 9 thumbnail routing and persistence', () => {
  it('passes the callers response schema to the model', async () => {
    const schema = { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.system).toContain(JSON.stringify(schema));
      expect(body.messages[0].content).toBe('Summarize Apollo.');
      return Response.json({ content: [{ type: 'text', text: '{"summary":"A trip to the moon."}' }] });
    }));
    await expect(invokeLLM(context(), { prompt: 'Summarize Apollo.', response_json_schema: schema })).resolves.toEqual({ summary: 'A trip to the moon.' });
  });
  it('registers the thumbnail and frontend LLM entry points', () => {
    for (const name of ['analyzeForThumbnail', 'newThumbnailConcept', 'safeGeminiCall', 'invokeLLM', 'callClaudeProxy']) {
      expect(FUNCTIONS[name]).toBeTypeOf('function');
    }
  });

  it('uses the shared key and retains Claude-to-Gemini fallback', async () => {
    const result = { recommended_template: 'shock_number', text_options: ['THE MOON'] };
    const request = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (url.endsWith('/messages')) {
        expect(body.model).toBe('claude-sonnet-4.5');
        return Response.json({ error: { message: 'provider unavailable' } }, { status: 503 });
      }
      expect(body.model).toBe('gemini-2.5-flash');
      return Response.json({ choices: [{ message: { content: JSON.stringify(result) } }] });
    });
    vi.stubGlobal('fetch', request);
    await expect(analyzeForThumbnail({ title: 'Apollo', transcript: 'A trip to the moon.' }, context())).resolves.toEqual(result);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('saves Gemini concepts with the shared key and returns addressable ids', async () => {
    const ctx = context();
    const calls: Array<{ url: string; model: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), model: JSON.parse(String(init.body)).model });
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        detected_mood: 'dramatic', concepts: [{ image_prompt: 'A moon landscape', text_overlay: 'THE MOON', rank: 1 }],
      }) } }] });
    }));
    const result = await newThumbnailConcept({ video_title: 'Apollo', project_id: 'project-9' }, ctx) as any;
    // The port once sent the literal text "${geminiModel}" as the model id (a template
    // literal turned into a plain string); the aggregator rejected it with a 400.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).not.toContain('${');
    expect(calls[0].model).toBe('gemini-2.5-flash');
    expect(result).toMatchObject({ success: true, concept_ids: ['concept-1'], concepts_saved: 1, project_id: 'project-9' });
    expect(ctx.db.ThumbnailConcepts.create).toHaveBeenCalledWith(expect.objectContaining({ project_id: 'project-9', text_overlay: 'THE MOON', status: 'pending' }));
  });
});
