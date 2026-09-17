import { describe, expect, it } from 'vitest';

import { hasTtsMarkers, stripTtsMarkers } from '../src/lib/scriptText';

describe('stripTtsMarkers', () => {
  it('removes the Higgs prosody tokens that reached scene narration', () => {
    // Taken from a real script: the token was glued to the next sentence, so the scene's
    // narration began with "<|prosody:long_pause|>Now here is the fact…".
    const out = stripTtsMarkers('People knew. It didn\'t stop.<|prosody:long_pause|>Now here is the fact.');
    expect(out).not.toMatch(/<\|/);
    expect(out).toMatch(/It didn't stop\./);
    expect(out).toMatch(/Now here is the fact\./);
  });

  it('turns a long pause into a paragraph break and a short pause into a space', () => {
    expect(stripTtsMarkers('One.<|prosody:long_pause|>Two.')).toBe('One.\n\nTwo.');
    expect(stripTtsMarkers('One.<|prosody:pause|>Two.')).toBe('One. Two.');
  });

  it('removes control tokens from any engine', () => {
    expect(stripTtsMarkers('A <|emotion:sad|> B <|speed:slow|> C')).toBe('A B C');
  });

  it('handles bracketed pause directions too', () => {
    expect(stripTtsMarkers('Wait [pause] then go')).toBe('Wait then go');
  });

  it('leaves ordinary scripts alone', () => {
    const plain = 'In December 1846, a magistrate travelled to Skibbereen. He did not believe the reports.';
    expect(stripTtsMarkers(plain)).toBe(plain);
  });

  it('copes with empty input', () => {
    expect(stripTtsMarkers('')).toBe('');
    expect(stripTtsMarkers(null)).toBe('');
  });

  it('reports whether a script still carries markers', () => {
    expect(hasTtsMarkers('a <|prosody:pause|> b')).toBe(true);
    expect(hasTtsMarkers('a b')).toBe(false);
  });
});
