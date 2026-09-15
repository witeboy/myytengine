// Deterministic scene numbering for the multi-call scene breakdown.
//
// The breakdown runs across several HTTP calls. It used to number each phase from "how
// many scenes exist right now", so a retried or overlapping call — the page re-sends a
// batch after a gateway timeout while the first attempt is still running — handed out the
// same numbers twice and duplicated whole stretches of the script. Numbers now come from
// the phase plan alone, and a sub-batch whose numbers already exist is skipped, so running
// a batch twice creates nothing new.

export interface SubBatch {
  /** 0-based index of the sub-batch's first scene (scene number = offset + 1). */
  offset: number;
  count: number;
  wordStart: number;
  wordEnd: number;
}

/** 1-based first scene number of each phase, in processing order. */
export function phaseFirstNumbers(chunks: Array<{ scenes: number }>): number[] {
  const firsts: number[] = [];
  let next = 1;
  for (const chunk of chunks) {
    firsts.push(next);
    next += Math.max(0, chunk.scenes || 0);
  }
  return firsts;
}

/** Fixed sub-batches for one phase: the same input always yields the same numbers and words. */
export function phaseSubBatches(
  phaseFirst: number,
  sceneCount: number,
  wordCount: number,
  maxPerCall: number,
): SubBatch[] {
  const wordsPerScene = Math.max(1, Math.ceil(wordCount / Math.max(1, sceneCount)));
  const subs: SubBatch[] = [];
  for (let done = 0; done < sceneCount; done += maxPerCall) {
    const count = Math.min(maxPerCall, sceneCount - done);
    const wordStart = done * wordsPerScene;
    subs.push({
      offset: phaseFirst - 1 + done,
      count,
      wordStart,
      wordEnd: Math.min(wordStart + count * wordsPerScene, wordCount),
    });
  }
  return subs;
}

/**
 * A sub-batch is done once any of its scene numbers exists. The AI sometimes returns fewer
 * scenes than asked for; asking again would duplicate the ones it did write.
 */
export function subBatchDone(sub: { offset: number; count: number }, existing: Set<number>): boolean {
  for (let n = sub.offset + 1; n <= sub.offset + sub.count; n++) {
    if (existing.has(n)) return true;
  }
  return false;
}

/** Scene numbers that appear more than once, ascending. */
export function duplicateSceneNumbers(numbers: Array<number | null | undefined>): number[] {
  const seen = new Map<number, number>();
  for (const n of numbers) {
    if (typeof n !== 'number') continue;
    seen.set(n, (seen.get(n) || 0) + 1);
  }
  return [...seen].filter(([, count]) => count > 1).map(([n]) => n).sort((a, b) => a - b);
}

/**
 * Minutes to pace scene beats over. A project length that disagrees with the script by 2x
 * or more is ignored in favour of the script's own length (150 words a minute): pacing a
 * 10-minute script as a 1-minute video floors every beat at its minimum. The reason is
 * returned so the page can say so rather than silently changing the plan.
 */
export function pacingMinutes(
  targetMinutes: number | null | undefined,
  wordCount: number,
): { minutes: number; note: string | null } {
  const scriptMinutes = wordCount / 150;
  if (!targetMinutes || targetMinutes <= 0) {
    return { minutes: Math.max(1, Math.ceil(scriptMinutes)), note: null };
  }
  const ratio = targetMinutes / Math.max(scriptMinutes, 1e-9);
  if (ratio > 0.5 && ratio < 2) return { minutes: targetMinutes, note: null };

  const estimate = Math.max(1, Math.round(scriptMinutes));
  return {
    minutes: estimate,
    note:
      `Project length is set to ${targetMinutes} min, but the script reads as about ${estimate} min ` +
      `(${wordCount} words). Scene timing was planned for ${estimate} min.`,
  };
}
