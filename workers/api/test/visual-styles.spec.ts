import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STYLE_ID,
  STYLES,
  STYLE_ALIASES,
  getStyle,
  isBrollOnlyStyle,
  resolveStyleId,
  styleDirective,
  styleMapForEngines,
} from '../src/lib/visualStyles';

const pickableLooks = STYLES.filter((s) => s.pickable && !s.kind);

describe('the style catalogue', () => {
  it('gives every style a card and every look a prompt', () => {
    expect(pickableLooks.length).toBeGreaterThan(5);
    for (const style of STYLES) {
      expect(style.label, `${style.id} has no label`).toBeTruthy();
      expect(style.desc, `${style.id} has no description`).toBeTruthy();
    }
    for (const style of pickableLooks) {
      // A card with no prompt text is the bug that shipped B-Roll Only as a dead option.
      expect(style.positive, `${style.id} has no prompt text`).toBeTruthy();
      expect(style.avoid, `${style.id} has nothing to avoid`).toBeTruthy();
    }
  });

  it('offers no style the project mode sets on its own', () => {
    for (const style of STYLES.filter((s) => s.kind === 'mode')) {
      expect(style.pickable, `${style.id} should not be offered`).toBe(false);
    }
  });

  it('hands the engines every look, and nothing without a prompt', () => {
    const map = styleMapForEngines();
    for (const style of pickableLooks) {
      expect(map[style.id]?.positive).toBe(style.positive);
      expect(map[style.id]?.negative).toBe(style.avoid);
    }
    expect(map.broll_only).toBeUndefined();
  });
});

describe('styleDirective', () => {
  it('always returns prompt text, for every style and for junk', () => {
    // The engines read .positive unconditionally: an empty directive is a 500 on the
    // prompt run. Sleep, Explainer and B-Roll Only carry no look of their own.
    for (const style of STYLES) {
      const directive = styleDirective(style.id);
      expect(directive.positive, `${style.id} produced no prompt text`).toBeTruthy();
    }
    expect(styleDirective('explainer_diagram').positive).toBeTruthy();
    expect(styleDirective('broll_only').positive).toBeTruthy();
    expect(styleDirective('nonsense').positive).toBeTruthy();
    expect(styleDirective(null).positive).toBeTruthy();
  });

  it('keeps a real look rather than substituting the default', () => {
    expect(styleDirective('faceless_mannequin').positive).toBe(getStyle('faceless_mannequin').positive);
  });
});

describe('resolveStyleId', () => {
  it('keeps projects on retired styles working', () => {
    // Every alias must land on a style that still exists.
    for (const [retired, replacement] of Object.entries(STYLE_ALIASES)) {
      expect(STYLES.find((s) => s.id === replacement), `${retired} points at nothing`).toBeTruthy();
      expect(resolveStyleId(retired)).toBe(replacement);
    }
    expect(resolveStyleId('photorealistic_4k')).toBe('cinematic_realistic');
    expect(resolveStyleId('harry_potter')).toBe('gothic_candlelight');
  });

  it('does not alias a style that still exists', () => {
    for (const retired of Object.keys(STYLE_ALIASES)) {
      expect(STYLES.find((s) => s.id === retired), `${retired} is both a style and an alias`).toBeUndefined();
    }
  });

  it('reads labels and stray spellings', () => {
    expect(resolveStyleId('Skeleton Protagonist')).toBe('skeleton_protagonist');
    expect(resolveStyleId('Faceless Mannequin History')).toBe('faceless_mannequin');
    expect(resolveStyleId('  CINEMATIC_ANIME  ')).toBe('cinematic_anime');
    // The old matcher took the first substring hit in object order, so "anime" could win
    // over "cinematic_anime". The longest match wins now.
    expect(resolveStyleId('dark cinematic anime key art')).toBe('cinematic_anime');
  });

  it('falls back to the default rather than throwing', () => {
    expect(resolveStyleId('')).toBe(DEFAULT_STYLE_ID);
    expect(resolveStyleId(null)).toBe(DEFAULT_STYLE_ID);
    expect(resolveStyleId('something nobody has ever picked')).toBe(DEFAULT_STYLE_ID);
    expect(getStyle('nonsense').id).toBe(DEFAULT_STYLE_ID);
  });

  it('knows B-Roll Only is stock footage, not a look', () => {
    expect(isBrollOnlyStyle('broll_only')).toBe(true);
    expect(isBrollOnlyStyle('cinematic_realistic')).toBe(false);
    expect(getStyle('broll_only').positive).toBeUndefined();
  });
});
