import { describe, expect, it } from 'vitest';

import { rankStockClips, scoreStockClip } from '../src/lib/brollRanking';

const clip = (over: Record<string, unknown> = {}) => ({
  downloadUrl: 'https://example.com/a.mp4',
  duration: 10,
  width: 1920,
  height: 1080,
  source: 'pexels',
  ...over,
});

describe('rankStockClips', () => {
  it('prefers a clip that covers the scene over a sharper one that does not', () => {
    const short4k = clip({ duration: 4, width: 3840, height: 2160, downloadUrl: 'short-4k' });
    const longHd = clip({ duration: 14, width: 1920, height: 1080, downloadUrl: 'long-hd' });
    const [best] = rankStockClips([short4k, longHd], { neededSeconds: 12, portrait: false });
    expect(best.downloadUrl).toBe('long-hd');
  });

  it('matches the video shape', () => {
    const landscape = clip({ width: 1920, height: 1080, downloadUrl: 'landscape' });
    const portrait = clip({ width: 1080, height: 1920, downloadUrl: 'portrait' });
    expect(rankStockClips([landscape, portrait], { neededSeconds: 5, portrait: true })[0].downloadUrl).toBe('portrait');
    expect(rankStockClips([portrait, landscape], { neededSeconds: 5, portrait: false })[0].downloadUrl).toBe('landscape');
  });

  it('breaks a tie with the primary search, then with resolution', () => {
    const alt = clip({ downloadUrl: 'alternative' });
    const primary = clip({ downloadUrl: 'primary', fromPrimary: true });
    expect(rankStockClips([alt, primary], { neededSeconds: 5, portrait: false })[0].downloadUrl).toBe('primary');

    const sd = clip({ width: 640, height: 360, downloadUrl: 'sd' });
    const hd = clip({ width: 1920, height: 1080, downloadUrl: 'hd' });
    expect(rankStockClips([sd, hd], { neededSeconds: 5, portrait: false })[0].downloadUrl).toBe('hd');
  });

  it('drops results that cannot be downloaded', () => {
    const ranked = rankStockClips([clip({ downloadUrl: undefined }), clip({ downloadUrl: 'ok' })], {
      neededSeconds: 5,
      portrait: false,
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0].downloadUrl).toBe('ok');
  });

  it('scores a clip with no metadata without throwing', () => {
    expect(scoreStockClip({}, { neededSeconds: 5, portrait: false })).toBe(0);
    expect(scoreStockClip(clip({ duration: 600 }), { neededSeconds: 5, portrait: false }))
      .toBeLessThan(scoreStockClip(clip({ duration: 8 }), { neededSeconds: 5, portrait: false }));
  });
});
