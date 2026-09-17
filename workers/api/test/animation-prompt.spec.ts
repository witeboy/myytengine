import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// animationPrompt is module-private in the handler, so it is lifted out the same way the
// handler defines it. This keeps the test honest about the real source.
const source = readFileSync(new URL('../src/fn/generateSceneVideo.ts', import.meta.url), 'utf8');
const start = source.indexOf('const CAMERA_PHRASES');
const end = source.indexOf('const handler');
const animationPrompt: (raw: string | null) => string = new Function(
  `${source.slice(start, end)}\nreturn animationPrompt;`,
)();

describe('animationPrompt', () => {
  it('turns a bare camera word into a sentence', () => {
    expect(animationPrompt('push_in')).toMatch(/slow cinematic push-in/);
  });

  it('always states the motion rules, whatever the scene says', () => {
    // The reported artifact: a man walking against the direction of his own feet.
    for (const input of ['push_in', '', 'Slow dolly through the market as the lanterns sway.']) {
      const out = animationPrompt(input);
      expect(out).toMatch(/never\s+slide, skate, glide or step backwards/);
      expect(out).toMatch(/direction the feet, knees and hips already point/);
      expect(out).toMatch(/Nothing new enters the frame/);
    }
  });

  it('keeps the scene description', () => {
    expect(animationPrompt('Lanterns sway over wet cobbles')).toMatch(/Lanterns sway over wet cobbles/);
  });

  it('never lets a long description crowd out the rules', () => {
    const out = animationPrompt('A'.repeat(5000));
    expect(out.length).toBeLessThanOrEqual(1800);
    expect(out).toMatch(/Motion rules:/);
    expect(out).toMatch(/shifting light\.$/);
  });
});
