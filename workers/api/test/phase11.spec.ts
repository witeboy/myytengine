import { afterEach, describe, expect, it, vi } from 'vitest';
import generateSeoTitlesDescriptions from '../src/fn/generateSeoTitlesDescriptions';
import generateSeoDescriptions from '../src/fn/generateSeoDescriptions';
import autoBrollPopulate from '../src/fn/autoBrollPopulate';
import { FUNCTIONS } from '../src/fn/registry';
import type { Ctx } from '../src/types';

function context(db: any): Ctx {
  return {
    env: { AI_PROVIDER_MODE: 'aggregator', AI_AGGREGATOR_BASE_URL: 'https://ai.example.test' },
    user: { id: 'phase11', email: 'phase11@myytengine.invalid' }, db,
    keys: {
      get: async (key: string) => key === 'PEXELS_API_KEY' ? 'test-stock-key' : null,
      has: async (key: string) => key === 'CHEAPER_INFERENCE_API_KEY',
      require: async (key: string) => { if (key !== 'CHEAPER_INFERENCE_API_KEY') throw new Error('Direct key used'); return 'test-key'; },
    }, waitUntil: () => {},
  } as unknown as Ctx;
}
const completion = (data: any) => Response.json({ choices: [{ message: { content: JSON.stringify(data) } }] });
afterEach(() => vi.unstubAllGlobals());

describe('Phase 11 SEO and resumable stock footage', () => {
  it('registers all eight names, including dynamically invoked b-roll handlers', () => {
    for (const name of ['generateTopics', 'parseAndScheduleTopics', 'researchNicheStrategy', 'generateSeoTitlesDescriptions', 'generateSeoDescriptions', 'searchBrollVideos', 'autoBrollPopulate', 'sleepBrollPopulate']) expect(FUNCTIONS[name]).toBeTypeOf('function');
  });

  it('persists the three-call SEO package then generates descriptions through the shared key', async () => {
    let metadata: any;
    const ctx = context({
      Projects: { filter: async () => [{ id: 'p11', name: 'Apollo', niche: 'history' }] },
      Scripts: { filter: async () => [{ version: 'final', full_script: 'A journey to the moon.' }] },
      ThumbnailConcepts: { filter: async () => [] },
      UploadMetadata: {
        filter: async () => metadata ? [metadata] : [],
        create: async (data: any) => (metadata = { id: 'm11', ...data }),
        update: async (_: string, data: any) => (metadata = { ...metadata, ...data }),
      },
    });
    const replies = [
      { titles: [{ title: 'The Moon Secret', rank: 1 }], seo_analysis: { primary_keyword: 'Apollo' } },
      { primary_tag: 'Apollo', tags_breakdown: { short: ['Moon'], medium: [], long: [] } },
      { hashtags: ['#Apollo'], hashtag_string: '#Apollo' },
      { descriptions: [{ label: 'Hook-Heavy', content: 'The story of Apollo.', word_count: 4 }] },
    ];
    const fetch = vi.fn(async () => completion(replies.shift()));
    vi.stubGlobal('fetch', fetch);
    await expect(generateSeoTitlesDescriptions({ project_id: 'p11' }, ctx)).resolves.toMatchObject({ success: true, needs_descriptions: true });
    expect(metadata).toMatchObject({ title_primary: 'The Moon Secret', hashtags: '#Apollo' });
    await expect(generateSeoDescriptions({ project_id: 'p11' }, ctx)).resolves.toMatchObject({ success: true, descriptions: [{ content: 'The story of Apollo.' }] });
    expect(metadata.description_template).toBe('The story of Apollo.');
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('keeps the 20-scene limit and resumes the remaining scene on the next invocation', async () => {
    const scenes = Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, scene_number: i, narration_text: 'Moon landscape', broll_url: '' }));
    const ctx = context({
      Projects: { filter: async () => [{ id: 'p11', niche: 'history' }] },
      Scenes: { filter: async () => scenes, update: async (id: string, data: any) => Object.assign(scenes.find(s => s.id === id)!, data) },
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.startsWith('https://ai.example.test/')) return completion({ queries: scenes.map(s => ({ scene_number: s.scene_number, primary: 'moon', alternative: 'space' })) });
      return Response.json({ videos: [{ id: 1, duration: 30, image: 'https://stock.example.test/thumb.jpg', video_files: [{ quality: 'hd', width: 1920, height: 1080, link: 'https://stock.example.test/video.mp4' }] }] });
    }));
    await expect(autoBrollPopulate({ project_id: 'p11' }, ctx)).resolves.toMatchObject({ populated: 20, total: 21, remaining: 1, done: false });
    await expect(autoBrollPopulate({ project_id: 'p11' }, ctx)).resolves.toMatchObject({ populated: 1, total: 21, remaining: 0, done: true });
  });
});
