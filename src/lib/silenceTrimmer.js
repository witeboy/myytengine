// ══════════════════════════════════════════════════════════════════════
// SILENCE & FILLER TRIMMER — client-side audio analysis
//
// Given a source video URL + word timestamps, detects:
//   • Silence gaps between words (>0.4s with no word) → trim to 0.1s
//   • Filler words (um, uh, like, you know, so, basically, etc) → remove
//
// Returns:
//   • keepRanges: [{start, end}] — ranges to keep in the original timeline
//   • timeShifts: [{t, shift}] — cumulative time removed before each orig t
//       → use this to re-align word captions after trim
//   • stats: {originalDur, trimmedDur, removedDur, fillersRemoved, silencesRemoved}
//
// This is PURE LOGIC — no audio decoding needed since we rely on word
// timestamps from AssemblyAI, which already give us silence gaps for free.
// ══════════════════════════════════════════════════════════════════════

const FILLER_PATTERNS = [
  /^(um+|uh+|umm+|uhh+|er+|ah+|hmm+|mhm+)$/i,
  /^(like|basically|literally|actually|honestly|seriously)$/i,
];

// Multi-word fillers (check against sequences)
const FILLER_PHRASES = [
  ['you', 'know'],
  ['i', 'mean'],
  ['sort', 'of'],
  ['kind', 'of'],
  ['so', 'like'],
];

function isFillerWord(word) {
  const w = String(word || '').replace(/[^a-z']/gi, '').toLowerCase();
  if (!w) return false;
  return FILLER_PATTERNS.some(p => p.test(w));
}

function findFillerPhraseRanges(words) {
  const ranges = [];
  for (let i = 0; i < words.length; i++) {
    for (const phrase of FILLER_PHRASES) {
      if (i + phrase.length > words.length) continue;
      const match = phrase.every((p, k) => {
        const w = String(words[i + k].word || '').replace(/[^a-z]/gi, '').toLowerCase();
        return w === p;
      });
      if (match) {
        ranges.push({
          start: words[i].start,
          end: words[i + phrase.length - 1].end,
          reason: 'filler_phrase',
        });
      }
    }
  }
  return ranges;
}

// ══════════════════════════════════════════════════════════════════════
// MAIN: analyze a clip region for trim opportunities
//
// @param words       — AssemblyAI word timestamps (source timeline)
// @param clipStart   — clip start in source
// @param clipEnd     — clip end in source
// @param config      — { silenceThresh: 0.4, keepSilence: 0.1, removeFillers: true }
//
// @returns { keepRanges, timeShifts, removeRanges, stats }
// ══════════════════════════════════════════════════════════════════════
export function analyzeClipForTrim({
  words = [],
  clipStart,
  clipEnd,
  config = {},
}) {
  const {
    silenceThresh = 0.4,      // gap > this is considered silence
    keepSilence = 0.12,       // keep this much natural pause
    removeFillers = true,
  } = config;

  const originalDur = clipEnd - clipStart;

  // Words that fall inside the clip region (and clamp their boundaries)
  const clipWords = (words || [])
    .filter(w =>
      typeof w.start === 'number' &&
      typeof w.end === 'number' &&
      w.end > clipStart &&
      w.start < clipEnd
    )
    .map(w => ({
      word: w.word || w.text || '',
      start: Math.max(clipStart, w.start),
      end: Math.min(clipEnd, w.end),
    }))
    .sort((a, b) => a.start - b.start);

  // ── Build list of REMOVE ranges (silences + fillers) ────────────
  const removeRanges = [];

  // 1. Long silences BEFORE first word
  if (clipWords.length && clipWords[0].start - clipStart > silenceThresh) {
    removeRanges.push({
      start: clipStart,
      end: clipWords[0].start - keepSilence,
      reason: 'leading_silence',
    });
  }

  // 2. Silences BETWEEN words
  for (let i = 0; i < clipWords.length - 1; i++) {
    const gap = clipWords[i + 1].start - clipWords[i].end;
    if (gap > silenceThresh) {
      removeRanges.push({
        start: clipWords[i].end + keepSilence / 2,
        end: clipWords[i + 1].start - keepSilence / 2,
        reason: 'silence_gap',
      });
    }
  }

  // 3. Trailing silence after last word
  if (clipWords.length && clipEnd - clipWords[clipWords.length - 1].end > silenceThresh) {
    removeRanges.push({
      start: clipWords[clipWords.length - 1].end + keepSilence,
      end: clipEnd,
      reason: 'trailing_silence',
    });
  }

  // 4. Filler single words
  let fillerCount = 0;
  if (removeFillers) {
    for (const w of clipWords) {
      if (isFillerWord(w.word)) {
        removeRanges.push({ start: w.start, end: w.end, reason: 'filler_word' });
        fillerCount++;
      }
    }
    // 5. Filler phrases
    const phrases = findFillerPhraseRanges(clipWords);
    removeRanges.push(...phrases);
    fillerCount += phrases.length;
  }

  // ── Merge overlapping remove-ranges, normalize to clip-relative time
  removeRanges.sort((a, b) => a.start - b.start);
  const mergedRemove = [];
  for (const r of removeRanges) {
    const last = mergedRemove[mergedRemove.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      mergedRemove.push({ ...r });
    }
  }

  // Filter out ranges that would be too short after clamping
  const finalRemove = mergedRemove
    .map(r => ({
      start: Math.max(clipStart, r.start),
      end: Math.min(clipEnd, r.end),
      reason: r.reason,
    }))
    .filter(r => r.end - r.start > 0.08); // min 80ms to be worth cutting

  // ── Compute KEEP ranges (inverse of remove) ─────────────────────
  const keepRanges = [];
  let cursor = clipStart;
  for (const rm of finalRemove) {
    if (rm.start > cursor) keepRanges.push({ start: cursor, end: rm.start });
    cursor = Math.max(cursor, rm.end);
  }
  if (cursor < clipEnd) keepRanges.push({ start: cursor, end: clipEnd });

  // ── Build timeShifts for caption re-alignment ───────────────────
  // timeShifts[i] = { t: original clip-relative time, shift: cumulative sec removed before t }
  // After trim, a word at original t is now at (t - shift).
  const timeShifts = [];
  let cumShift = 0;
  for (const rm of finalRemove) {
    const tRel = rm.start - clipStart;
    timeShifts.push({ t: tRel, shift: cumShift });
    cumShift += (rm.end - rm.start);
    timeShifts.push({ t: rm.end - clipStart, shift: cumShift });
  }

  const removedDur = finalRemove.reduce((s, r) => s + (r.end - r.start), 0);
  const trimmedDur = originalDur - removedDur;

  return {
    keepRanges,
    removeRanges: finalRemove,
    timeShifts,
    stats: {
      originalDur,
      trimmedDur,
      removedDur,
      removedPercent: originalDur > 0 ? (removedDur / originalDur) * 100 : 0,
      fillersRemoved: fillerCount,
      silencesRemoved: finalRemove.filter(r => r.reason.includes('silence')).length,
      cutCount: finalRemove.length,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// Build FFmpeg select filter expression for keep-ranges.
//
// Example output: "between(t,0,2.3)+between(t,2.8,5.1)"
// Used with -vf "select='<expr>',setpts=N/FRAME_RATE/TB"
//          -af "aselect='<expr>',asetpts=N/SR/TB"
// ══════════════════════════════════════════════════════════════════════
export function buildSelectExpr(keepRanges, clipStart) {
  if (!keepRanges.length) return '1'; // keep everything
  const parts = keepRanges.map(r => {
    const a = Math.max(0, r.start - clipStart).toFixed(3);
    const b = Math.max(0, r.end - clipStart).toFixed(3);
    return `between(t,${a},${b})`;
  });
  return parts.join('+');
}