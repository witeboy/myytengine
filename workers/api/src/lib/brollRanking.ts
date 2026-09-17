// Picking the best stock clip for a scene.
//
// The old ranking sorted by resolution, then by length. That reliably chose a beautiful
// 4-second 4K clip for a 12-second scene, which then froze on its last frame in the
// export, and it ignored orientation entirely — landscape footage in a vertical video.
// Covering the scene comes first, then matching its shape, then sharpness.

export interface StockClip {
  downloadUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
  source?: string;
  /** Result of the scene's primary search rather than the fallback angle. */
  fromPrimary?: boolean;
}

export function scoreStockClip(
  clip: StockClip,
  opts: { neededSeconds: number; portrait: boolean },
): number {
  const needed = Math.max(2, opts.neededSeconds || 5);
  const duration = Number(clip.duration) || 0;
  const width = Number(clip.width) || 0;
  const height = Number(clip.height) || 0;

  let points = 0;
  // Long enough to cover the scene — the single biggest cause of a bad-looking cut.
  points += duration >= needed ? 45 : 45 * (duration / needed);
  // A minute-long file for a five-second scene is a slow download for no gain.
  if (duration > needed * 5) points -= 8;
  // Orientation: a landscape clip letterboxes inside a vertical video.
  if (width && height && (height > width) === opts.portrait) points += 20;
  // Sharpness, with a ceiling so 4K cannot outweigh actually fitting the scene.
  points += Math.min(25, (width * height) / 100000);
  if (clip.fromPrimary) points += 10;
  // Pexels is human-curated and better tagged, so its matches tend to be closer.
  if (clip.source === 'pexels') points += 5;
  return points;
}

/** Best first. Clips with no download URL are dropped. */
export function rankStockClips<T extends StockClip>(
  clips: T[],
  opts: { neededSeconds: number; portrait: boolean },
): T[] {
  return clips
    .filter((c) => !!c.downloadUrl)
    .map((clip) => ({ clip, score: scoreStockClip(clip, opts) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.clip);
}
