import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const SAMPLE_AUDIO =
  'https://raw.githubusercontent.com/craigsdennis/notebooks-cloudflare-workers-ai/main/assets/craig-rambling.mp3';

describe('Phase 5 live Workers AI ASR smoke', () => {
  it('returns genuine word-level timestamps from Deepgram Nova-3', async () => {
    const audioResponse = await fetch(SAMPLE_AUDIO);
    expect(audioResponse.ok).toBe(true);

    const output: any = await env.AI.run('@cf/deepgram/nova-3' as any, {
      audio: { body: audioResponse.body, contentType: 'audio/mpeg' },
      smart_format: true,
    });
    const alternative = output?.results?.channels?.[0]?.alternatives?.[0] || {};
    const words = Array.isArray(alternative.words) ? alternative.words : [];

    console.log(JSON.stringify({
      model: '@cf/deepgram/nova-3',
      hasText: typeof alternative.transcript === 'string' && alternative.transcript.length > 0,
      wordCount: words.length,
      firstWordShape: words[0]
        ? { hasWord: typeof (words[0].word ?? words[0].text) === 'string',
            hasStart: Number.isFinite(words[0].start), hasEnd: Number.isFinite(words[0].end) }
        : null,
    }));

    expect(alternative.transcript).toEqual(expect.any(String));
    expect(words.length).toBeGreaterThan(0);
    expect(words[0]).toEqual(expect.objectContaining({
      start: expect.any(Number),
      end: expect.any(Number),
    }));
  });
});
