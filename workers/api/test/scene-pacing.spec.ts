import { describe, expect, it } from 'vitest';

import { PACING_WORDS, buildSceneBeats } from '../src/fn/longViralSceneBreakdown';

// A paragraph of a real script: long sentences are what drive the scene count.
const SENTENCES = [
  'In December 1846, a magistrate named Nicholas Cummins travelled to a village in West Cork called Skibbereen.',
  'He had heard reports and did not believe them.',
  'People knew.',
  'It stopped.',
  'Ireland did not run out of food during the famine, it ran out of food it was permitted to eat.',
];

describe('scene pacing', () => {
  it('cuts far less often as the pace slows', () => {
    const fast = buildSceneBeats(SENTENCES, PACING_WORDS.fast).length;
    const standard = buildSceneBeats(SENTENCES, PACING_WORDS.standard).length;
    const cinematic = buildSceneBeats(SENTENCES, PACING_WORDS.cinematic).length;
    expect(fast).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThanOrEqual(cinematic);
    expect(cinematic).toBeGreaterThanOrEqual(SENTENCES.length - 1); // the two short lines merge
  });

  it('defaults to the original pace so existing projects do not change', () => {
    expect(buildSceneBeats(SENTENCES).length).toBe(buildSceneBeats(SENTENCES, 7).length);
  });

  it('never gives one sentence more than four angles', () => {
    const monster = ['word '.repeat(60).trim() + '.'];
    const beats = buildSceneBeats(monster, PACING_WORDS.fast);
    expect(beats.length).toBeLessThanOrEqual(4);
    expect(beats.every(b => b.narration_text === monster[0])).toBe(true);
  });

  it('still merges two very short sentences into one scene', () => {
    const beats = buildSceneBeats(['People knew.', 'It stopped.'], PACING_WORDS.fast);
    expect(beats).toHaveLength(1);
    expect(beats[0].narration_text).toBe('People knew. It stopped.');
  });

  it('numbers the angles of a line in order', () => {
    const beats = buildSceneBeats([SENTENCES[0]], PACING_WORDS.fast);
    expect(beats.length).toBeGreaterThan(1);
    beats.forEach((b, i) => {
      expect(b.angle_index).toBe(i);
      expect(b.total_angles).toBe(beats.length);
      expect(b.is_multi_angle).toBe(true);
    });
  });
});
