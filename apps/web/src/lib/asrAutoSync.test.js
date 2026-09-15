// Regression tests for AutoSync scene alignment. Run: npm test (node --test, no extra deps).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alignScenesToASR } from './asrAutoSync.js';

const WORD_SECONDS = 0.4;

// Scenes as the breakdown writes them, plus the transcript a voiceover of them would give.
function fixture(sceneTexts, { mishear = {} } = {}) {
  const scenes = sceneTexts.map((text, i) => ({ id: `s${i + 1}`, scene_number: i + 1, narration_text: text }));
  const asrWords = [];
  const trueStarts = [];
  let t = 0.2;
  sceneTexts.forEach((text, si) => {
    text.split(/\s+/).forEach((word, wi) => {
      if (wi === 0) trueStarts.push(t);
      const heard = wi === 0 && mishear[si] ? mishear[si] : word.replace(/[^A-Za-z']/g, '').toLowerCase();
      asrWords.push({ word: heard, start: t, end: t + WORD_SECONDS * 0.9 });
      t += WORD_SECONDS;
    });
    t += 0.3; // breath between sentences
  });
  return { scenes, asrWords, trueStarts, duration: t + 0.5 };
}

const quiet = (fn) => {
  const log = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = log; }
};

const STORY = [
  'Engineers at the lab worked through the night on the guidance program.',
  'And the computer kept raising alarms nobody had seen before.',
  'The flight controllers had seconds to decide whether to abort.',
  'A young engineer and his team knew the alarms were harmless.',
  'And the landing continued while the whole world held its breath.',
  'Minutes later the lunar module touched down on the surface.',
];

test('every scene aligns when the transcript matches the script', () => {
  const { scenes, asrWords, trueStarts, duration } = fixture(STORY);
  const res = quiet(() => alignScenesToASR(asrWords, scenes, duration));
  assert.equal(res.filter((r) => r.fallback).length, 0);
  res.forEach((r, i) => assert.ok(Math.abs(r.speechStart - trueStarts[i]) < 0.01, `scene ${i + 1} start`));
});

test('a misheard first word is skipped over instead of failing the scene', () => {
  const { scenes, asrWords, trueStarts, duration } = fixture(STORY, { mishear: { 1: 'an' } });
  const res = quiet(() => alignScenesToASR(asrWords, scenes, duration));
  assert.equal(res.filter((r) => r.fallback).length, 0, 'no fallbacks');
  // Scene 2 anchors on its second word, one word late; every other scene is exact.
  assert.ok(Math.abs(res[1].speechStart - (trueStarts[1] + WORD_SECONDS)) < 0.01);
  [0, 2, 3, 4, 5].forEach((i) => assert.ok(Math.abs(res[i].speechStart - trueStarts[i]) < 0.01, `scene ${i + 1} start`));
});

test('scene durations cover the audio without gaps or overlaps', () => {
  const { scenes, asrWords, duration } = fixture(STORY, { mishear: { 1: 'an' } });
  const res = quiet(() => alignScenesToASR(asrWords, scenes, duration));
  assert.equal(res[0].startTime, 0);
  for (let i = 1; i < res.length; i++) assert.ok(Math.abs(res[i].startTime - res[i - 1].endTime) < 0.002, `seam ${i}`);
  assert.ok(Math.abs(res[res.length - 1].endTime - duration) < 0.002);
});

test('one-word scenes still align', () => {
  const { scenes, asrWords, trueStarts, duration } = fixture(['Silence.', 'Then the engines ignited all at once.', 'Liftoff.']);
  const res = quiet(() => alignScenesToASR(asrWords, scenes, duration));
  assert.equal(res.filter((r) => r.fallback).length, 0);
  res.forEach((r, i) => assert.ok(Math.abs(r.speechStart - trueStarts[i]) < 0.01, `scene ${i + 1} start`));
});

test('real voiceover: a short common-word sentence does not steal later speech', () => {
  // The opening of a real script and what Workers AI heard from its voiceover. The old
  // matcher anchored "This is the moment." on a loose "this ... is" eleven seconds late;
  // the next scene then claimed the words of the three after it, and those fell back.
  const real = JSON.parse(readFileSync(new URL('./__fixtures__/apollo-opening.json', import.meta.url), 'utf8'));
  const scenes = real.sentences.map((text, i) => ({ id: `a${i + 1}`, scene_number: i + 1, narration_text: text }));
  const res = quiet(() => alignScenesToASR(real.words, scenes, real.duration));

  const norm = (w) => w.toLowerCase().replace(/[^a-z']/g, '');
  // Spoken numbers come back as digits ("07/20/1969"), so they cannot anchor anything.
  const numberish = (w) => /\d/.test(w) || /^(and|one|two|three|four|five|six|seven|eight|nine|ten|nineteen|twenty|twentieth|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|point|zero)$/.test(norm(w));

  let cursor = 0;
  let checked = 0;
  real.sentences.forEach((text, i) => {
    const toks = text.split(/\s+/).filter((w) => !numberish(w)).map(norm).filter(Boolean);
    if (toks.length < 2) return;
    // Where the sentence's first two anchorable words were actually heard.
    let at = -1;
    for (let k = cursor; k < real.words.length - 1; k++) {
      if (norm(real.words[k].word) === toks[0] && norm(real.words[k + 1].word) === toks[1]) { at = k; break; }
    }
    if (at < 0) return;
    cursor = at + 1;
    checked++;
    assert.ok(!res[i].fallback, `scene ${i + 1} ("${text}") fell back`);
    // AutoSync may anchor a couple of words either side of this point; eleven seconds is not that.
    const nearby = real.words.slice(Math.max(0, at - 2), at + 4).map((w) => Math.abs(res[i].speechStart - w.start));
    assert.ok(Math.min(...nearby) < 0.3, `scene ${i + 1} starts at ${res[i].speechStart}s but was heard at ${real.words[at].start}s`);
  });
  assert.ok(checked >= 6, `only ${checked} sentences were checkable`);
});
