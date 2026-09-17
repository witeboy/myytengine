import { describe, expect, it } from 'vitest';

import { enforceFacelessFigures, styleRequiresFacelessFigures } from '../src/lib/facelessGuard';

describe('enforceFacelessFigures', () => {
  it('masks a person the model described as human', () => {
    // The exact failure seen in production: a crowd of mannequins and one real face.
    const out = enforceFacelessFigures(
      'Low angle across the muddy square. A bearded gentleman in a top hat strides past the fire, his eyes fixed on the horizon.',
    );
    expect(out).toMatch(/gentleman with a blank egg-smooth porcelain mannequin head/i);
    expect(out).not.toMatch(/bearded/i);
    expect(out).not.toMatch(/his eyes/i);
  });

  it('leaves a figure that is already a mannequin alone', () => {
    const input = 'Three figures in faceless white porcelain mannequin form huddle around the embers.';
    const out = enforceFacelessFigures(input);
    expect(out.match(/mannequin/gi)?.length).toBeLessThan(4);
    expect(out).toMatch(/Every figure in frame/);
  });

  it('uses plural wording for groups', () => {
    const out = enforceFacelessFigures('A crowd gathers by the church steps.');
    expect(out).toMatch(/crowd with blank egg-smooth porcelain mannequin heads/i);
  });

  it('always ends with the guarantee, once', () => {
    const once = enforceFacelessFigures('A woman kneels by the fire.');
    const twice = enforceFacelessFigures(once);
    expect(once.match(/Every figure in frame/g)).toHaveLength(1);
    expect(twice.match(/Every figure in frame/g)).toHaveLength(1);
  });

  it('is stable when run repeatedly', () => {
    const once = enforceFacelessFigures('A man and two children wait outside the workshop.');
    expect(enforceFacelessFigures(once)).toBe(once);
  });

  it('leaves prompts with no people almost untouched', () => {
    const out = enforceFacelessFigures('An empty candlelit workshop, brass tools on aged oak, rain on the window.');
    expect(out).toMatch(/^An empty candlelit workshop/);
  });

  it('handles empty input', () => {
    expect(enforceFacelessFigures('')).toBe('');
  });

  it('knows which style needs it', () => {
    expect(styleRequiresFacelessFigures('faceless_mannequin')).toBe(true);
    expect(styleRequiresFacelessFigures('cinematic_realistic')).toBe(false);
    expect(styleRequiresFacelessFigures(null)).toBe(false);
  });
});
