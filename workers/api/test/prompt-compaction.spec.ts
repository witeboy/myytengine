import { describe, expect, it } from 'vitest';

import { compactPrompt } from '../src/lib/promptCompaction';

const SUBJECT = 'Low angle across a muddy village square at dusk, a figure in a long coat striding past a dying fire.';
const MIDDLE = 'Broken carts and sodden straw line the edges of the square, and a church spire rises behind the rooftops. '
  + 'Puddles hold the last of the daylight between the cobbles, and smoke drifts along the ground between the cabins. '
  + 'A handful of villagers huddle with their backs to the wind, wrapped in shawls that have seen better winters.';
const STYLE = 'Low-key chiaroscuro lighting from firelight and a single lantern. Deep navy and amber palette over rich blacks, anamorphic lens, shallow depth of field, organic 35mm film grain.';
const LONG = `${SUBJECT} ${MIDDLE} ${STYLE}`;

describe('compactPrompt', () => {
  it('leaves a short prompt untouched', () => {
    expect(compactPrompt(SUBJECT, 950)).toBe(SUBJECT);
  });

  it('keeps both the subject and the look when it has to cut', () => {
    const out = compactPrompt(LONG, 400);
    expect(out.length).toBeLessThanOrEqual(400);
    expect(out).toContain('Low angle across a muddy village square');
    // The style tail is what plain truncation used to throw away.
    expect(out).toMatch(/chiaroscuro|film grain|anamorphic|palette/);
  });

  it('drops the middle elaboration first', () => {
    const out = compactPrompt(LONG, 400);
    expect(out).not.toContain('shawls that have seen better winters');
  });

  it('never cuts mid-word', () => {
    const out = compactPrompt(LONG, 300);
    expect(out.endsWith('-')).toBe(false);
    const originalWords = new Set(LONG.replace(/[.,]/g, '').split(/\s+/));
    for (const word of out.replace(/[.,]/g, '').split(/\s+/)) {
      expect(originalWords.has(word)).toBe(true);
    }
  });

  it('handles one enormous sentence', () => {
    const monster = 'a '.repeat(600) + 'lantern';
    const out = compactPrompt(monster, 200);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out).not.toMatch(/\s$/);
  });

  it('copes with empty input', () => {
    expect(compactPrompt('', 950)).toBe('');
  });
});
