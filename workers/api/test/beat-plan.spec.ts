import { describe, expect, it } from 'vitest';

import { beatsToSceneBeats, normalizeBeats, wordsPerShot } from '../src/lib/beatPlan';

const SENTENCES = [
  'In December 1846, a magistrate named Nicholas Cummins travelled to Skibbereen.',
  'He had heard reports and did not believe them.',
  'He went into the first cabin he came to.',
  'It looked empty.',
  'Then he saw movement in the corner.',
  'People knew.',
  'It did not stop.',
  'At the time Cummins stood in that cabin, ships were leaving Irish ports loaded with food.',
];

describe('normalizeBeats', () => {
  it('covers every sentence exactly once, in order', () => {
    const beats = normalizeBeats(
      [
        { start_sentence: 1, emotional_beat_name: 'The Witness' },
        { start_sentence: 6, emotional_beat_name: 'The Indictment' },
      ],
      SENTENCES.length,
    );
    expect(beats.map(b => [b.startIndex, b.endIndex])).toEqual([[0, 5], [5, 8]]);
    const covered = beats.flatMap(b => SENTENCES.slice(b.startIndex, b.endIndex));
    expect(covered).toEqual(SENTENCES);
  });

  it('always starts the first beat at the first sentence', () => {
    // A model that opens its first beat at sentence 3 would otherwise orphan 1 and 2.
    const beats = normalizeBeats([{ start_sentence: 3, emotional_beat_name: 'Late' }], SENTENCES.length);
    expect(beats[0].startIndex).toBe(0);
    expect(beats[beats.length - 1].endIndex).toBe(SENTENCES.length);
  });

  it('discards nonsense rather than trusting it', () => {
    const beats = normalizeBeats(
      [
        { start_sentence: 5 },
        { start_sentence: 5 },          // duplicate
        { start_sentence: 99 },         // past the end
        { start_sentence: -2 },         // before the start
        { start_sentence: 'three' },    // not a number
        { start_sentence: 2 },          // out of order
      ],
      SENTENCES.length,
    );
    expect(beats.map(b => b.startIndex)).toEqual([0, 1, 4]);
    expect(beats[beats.length - 1].endIndex).toBe(SENTENCES.length);
  });

  it('survives an empty or missing answer', () => {
    expect(normalizeBeats([], SENTENCES.length).map(b => [b.startIndex, b.endIndex])).toEqual([[0, SENTENCES.length]]);
    expect(normalizeBeats(null, SENTENCES.length)).toHaveLength(1);
    expect(normalizeBeats([{ start_sentence: 1 }], 0)).toEqual([]);
  });

  it('names an unnamed beat rather than leaving it blank', () => {
    expect(normalizeBeats([{ start_sentence: 1 }], 3)[0].name).toBe('Beat 1');
  });
});

describe('wordsPerShot', () => {
  it('cuts faster when the director asks for urgency', () => {
    expect(wordsPerShot('Fast, erratic, building panic')).toBeLessThan(wordsPerShot('Measured and even'));
    expect(wordsPerShot('Slow and heavy, letting the silence linger')).toBeGreaterThan(wordsPerShot('Measured and even'));
  });

  it('has a sane default for an empty note', () => {
    expect(wordsPerShot('')).toBe(14);
  });
});

describe('beatsToSceneBeats', () => {
  const beats = normalizeBeats(
    [
      { start_sentence: 1, emotional_beat_name: 'The Witness', pacing_and_momentum: 'Slow and heavy', directors_vision: 'Hold on the doorway' },
      { start_sentence: 6, emotional_beat_name: 'The Indictment', pacing_and_momentum: 'Fast, building anger' },
    ],
    SENTENCES.length,
  );

  it('keeps the whole script, in order', () => {
    const scenes = beatsToSceneBeats(beats, SENTENCES);
    const spoken = scenes
      .filter((s, i) => i === 0 || s.narration_text !== scenes[i - 1].narration_text)
      .map(s => s.narration_text)
      .join(' ');
    for (const sentence of SENTENCES) expect(spoken).toContain(sentence);
  });

  it('lets the story decide the count instead of a fixed rule', () => {
    const scenes = beatsToSceneBeats(beats, SENTENCES);
    expect(scenes.length).toBeGreaterThanOrEqual(beats.length);
    expect(scenes.length).toBeLessThan(SENTENCES.length * 4);
  });

  it('carries the beat name, pacing and vision onto every scene', () => {
    const scenes = beatsToSceneBeats(beats, SENTENCES);
    expect(scenes[0].beat_name).toBe('The Witness');
    expect(scenes[0].directors_vision).toBe('Hold on the doorway');
    expect(scenes.every(s => typeof s.pacing === 'string')).toBe(true);
  });

  it('gives a frantic beat more shots than a heavy one of the same length', () => {
    const line = ['Ships left the ports loaded with grain while the people in the cabins starved quietly.'];
    const fast = beatsToSceneBeats(normalizeBeats([{ start_sentence: 1, pacing_and_momentum: 'fast, erratic' }], 1), line);
    const slow = beatsToSceneBeats(normalizeBeats([{ start_sentence: 1, pacing_and_momentum: 'slow, heavy, lingering' }], 1), line);
    expect(fast.length).toBeGreaterThan(slow.length);
  });

  it('covers a single long line from several angles rather than splitting the words', () => {
    const line = ['Ireland did not run out of food during the famine, it ran out of food it was permitted to eat, every year.'];
    const scenes = beatsToSceneBeats(normalizeBeats([{ start_sentence: 1, pacing_and_momentum: 'fast' }], 1), line);
    expect(scenes.length).toBeGreaterThan(1);
    expect(scenes.every(s => s.narration_text === line[0])).toBe(true);
    expect(scenes.map(s => s.angle_index)).toEqual(scenes.map((_, i) => i));
  });

  it('never runs away with one beat', () => {
    const huge = ['word '.repeat(400).trim() + '.'];
    expect(beatsToSceneBeats(normalizeBeats([{ start_sentence: 1, pacing_and_momentum: 'fast' }], 1), huge).length).toBeLessThanOrEqual(12);
  });

  it('never holds one image for half a minute', () => {
    // A long beat with few shots used to produce 67-word scenes — about 27 seconds on a
    // single still. No scene may carry more than ~32 words (~13s) of narration.
    const longBeat = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i} of a long and unbroken stretch of narration.`);
    const scenes = beatsToSceneBeats(normalizeBeats([{ start_sentence: 1, pacing_and_momentum: 'slow and heavy' }], longBeat.length), longBeat);
    expect(Math.max(...scenes.map(s => s.word_count))).toBeLessThanOrEqual(32);
  });
});
