import { describe, expect, it } from 'vitest';

import {
  duplicateSceneNumbers,
  pacingMinutes,
  phaseFirstNumbers,
  phaseSubBatches,
  subBatchDone,
} from '../src/lib/breakdownPlan';

describe('phaseFirstNumbers', () => {
  it('numbers phases from the plan, not from what already exists', () => {
    expect(phaseFirstNumbers([{ scenes: 3 }, { scenes: 0 }, { scenes: 5 }, { scenes: 2 }])).toEqual([1, 4, 4, 9]);
  });
});

describe('phaseSubBatches', () => {
  it('splits a phase into fixed ranges of scene numbers and script words', () => {
    expect(phaseSubBatches(11, 25, 250, 10)).toEqual([
      { offset: 10, count: 10, wordStart: 0, wordEnd: 100 },
      { offset: 20, count: 10, wordStart: 100, wordEnd: 200 },
      { offset: 30, count: 5, wordStart: 200, wordEnd: 250 },
    ]);
  });
});

describe('subBatchDone', () => {
  it('is done when any of its own numbers exists, and only its own', () => {
    const sub = { offset: 10, count: 10 }; // scenes 11-20
    expect(subBatchDone(sub, new Set([15]))).toBe(true);
    expect(subBatchDone(sub, new Set([10, 21]))).toBe(false);
  });
});

describe('re-running a breakdown', () => {
  // Simulates the page re-sending batches after timeouts: every phase runs twice.
  const plan = [{ scenes: 12 }, { scenes: 7 }, { scenes: 23 }];
  const firsts = phaseFirstNumbers(plan);

  function runPhase(p: number, created: number[], shortBy = 0) {
    const existing = new Set(created);
    for (const sub of phaseSubBatches(firsts[p], plan[p].scenes, plan[p].scenes * 12, 10)) {
      if (subBatchDone(sub, existing)) continue;
      const returned = Math.max(1, sub.count - shortBy); // the AI may return fewer scenes
      for (let i = 0; i < returned; i++) created.push(sub.offset + i + 1);
    }
  }

  it('creates each scene number exactly once when batches repeat', () => {
    const created: number[] = [];
    for (let p = 0; p < plan.length; p++) {
      runPhase(p, created);
      runPhase(p, created);
    }
    expect(duplicateSceneNumbers(created)).toEqual([]);
    expect(created.length).toBe(42);
  });

  it('does not re-request a sub-batch the AI answered short', () => {
    const created: number[] = [];
    runPhase(0, created, 1);
    const firstPass = created.length;
    runPhase(0, created, 1);
    expect(created.length).toBe(firstPass);
    expect(duplicateSceneNumbers(created)).toEqual([]);
  });
});

describe('duplicateSceneNumbers', () => {
  it('lists numbers that appear more than once', () => {
    expect(duplicateSceneNumbers([3, 1, 2, 2, 3, 3, null, undefined])).toEqual([2, 3]);
  });
});

describe('pacingMinutes', () => {
  it('keeps a project length that roughly matches the script', () => {
    expect(pacingMinutes(10, 1565)).toEqual({ minutes: 10, note: null });
    expect(pacingMinutes(15, 1565)).toEqual({ minutes: 15, note: null });
  });

  it('uses the script length when the project length is off by 2x or more, and says so', () => {
    const r = pacingMinutes(1, 1565);
    expect(r.minutes).toBe(10);
    expect(r.note).toContain('set to 1 min');
    expect(r.note).toContain('about 10 min');
  });

  it('falls back to the script length when no project length is set', () => {
    expect(pacingMinutes(undefined, 1565)).toEqual({ minutes: 11, note: null });
  });
});
