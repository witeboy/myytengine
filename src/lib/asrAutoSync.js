// ══════════════════════════════════════════════════════════════════
// ASR-DRIVEN AUTOSYNC v2 — Global word-level alignment
// ══════════════════════════════════════════════════════════════════
//
// Strategy: Instead of matching each scene independently (which
// causes cascading drift), we align the ENTIRE script word list
// against the ENTIRE ASR word list using a single global pass.
//
// Algorithm:
//   1. Flatten all scene narration into one ordered word list,
//      tagging each word with its scene index.
//   2. Run a two-pointer alignment between script words and ASR
//      words. For each script word, find the closest matching
//      ASR word within a look-ahead window. Allow skips for
//      ASR extras (filler words, repeated words) and script
//      extras (words ASR missed).
//   3. Once every script word has an ASR match (or is marked
//      unmatched), derive scene boundaries from the first/last
//      matched word in each scene.
//   4. Post-process: fill gaps, enforce minimums, full coverage.
// ══════════════════════════════════════════════════════════════════

/**
 * Normalize a word for comparison
 */
function norm(w) {
  return (w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Check if two normalized words are a match.
 * Handles exact matches plus common ASR mishearings.
 */
function wordsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;

  // One is substring of the other (e.g. "its" vs "it's" → both "its")
  if (a.length >= 3 && b.length >= 3) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }

  // Edit distance 1 for words of 3+ chars (ASR often swaps/drops a letter)
  if (a.length >= 3 && b.length >= 3 && Math.abs(a.length - b.length) <= 1) {
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    if (longer.length === shorter.length) {
      // Same length: allow 1 substitution
      let diffs = 0;
      for (let i = 0; i < longer.length; i++) {
        if (longer[i] !== shorter[i]) diffs++;
        if (diffs > 1) break;
      }
      if (diffs <= 1) return true;
    } else {
      // Length differs by 1: allow 1 insertion/deletion
      let diffs = 0;
      let li = 0, si = 0;
      while (li < longer.length && si < shorter.length) {
        if (longer[li] !== shorter[si]) {
          diffs++;
          if (diffs > 1) break;
          li++; // skip the extra char in longer
        } else {
          li++; si++;
        }
      }
      if (diffs <= 1) return true;
    }
  }

  // Phonetic: common number words
  const numMap = { '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
                   '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten',
                   '100': 'hundred', '1000': 'thousand', '0': 'zero' };
  if (numMap[a] === b || numMap[b] === a) return true;

  return false;
}

/**
 * Global two-pointer alignment of script words to ASR words.
 *
 * For each script word, we look ahead up to WINDOW_SIZE ASR words
 * to find a match. If found, we consume all ASR words up to the
 * match (they're ASR extras — filler, repetitions). If not found,
 * the script word is unmatched (ASR missed it) and we advance
 * only the script pointer.
 *
 * Returns: array parallel to scriptWords, each element is the
 * index into asrWords that it matched, or -1 if unmatched.
 */
function globalAlign(scriptWords, asrWords) {
  const alignment = new Array(scriptWords.length).fill(-1);
  let asrIdx = 0;

  // Pre-normalize all words once for speed
  const normScript = scriptWords.map(w => norm(w.word));
  const normASR = asrWords.map(w => norm(w.word));

  // Build an inverted index: normWord → [asrIdx, asrIdx, ...]
  const asrIndex = {};
  normASR.forEach((w, i) => {
    if (!w) return;
    if (!asrIndex[w]) asrIndex[w] = [];
    asrIndex[w].push(i);
  });

  // Estimate expected ASR position for each script word.
  // This acts as a time anchor to prevent wild jumps.
  const totalAsrDur = asrWords.length > 0 ? asrWords[asrWords.length - 1].end : 0;
  const expectedAsrTime = (si) => {
    if (scriptWords.length <= 1) return 0;
    return (si / scriptWords.length) * totalAsrDur;
  };

  // Time-based guard: reject a candidate if it would jump more than
  // MAX_TIME_JUMP seconds ahead of where we expect to be.
  // For continuous speech (no silence), keep this tight.
  const avgSecsPerWord = totalAsrDur / Math.max(1, asrWords.length);
  const MAX_TIME_JUMP = Math.max(8.0, avgSecsPerWord * 30); // ~30 words worth of jump max

  const isTimeReasonable = (ai, si) => {
    const asrTime = asrWords[ai]?.start ?? 0;
    const expected = expectedAsrTime(si);
    // Allow generous forward drift but prevent huge jumps
    return (asrTime - expected) < MAX_TIME_JUMP;
  };

  // Track last matched ASR time for local jump detection
  let lastMatchedTime = 0;

  for (let si = 0; si < scriptWords.length; si++) {
    const sw = normScript[si];
    if (!sw) continue;

    // ── Strategy 1: Look ahead in a local window (fast path) ────
    const WINDOW = 25;
    let found = false;
    const limit = Math.min(asrIdx + WINDOW, asrWords.length);

    for (let ai = asrIdx; ai < limit; ai++) {
      if (wordsMatch(sw, normASR[ai])) {
        alignment[si] = ai;
        asrIdx = ai + 1;
        lastMatchedTime = asrWords[ai].end;
        found = true;
        break;
      }
    }
    if (found) continue;

    // ── Strategy 2: Use inverted index to find next occurrence ──
    const candidates = asrIndex[sw];
    if (candidates) {
      let lo = 0, hi = candidates.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (candidates[mid] < asrIdx) lo = mid + 1;
        else hi = mid;
      }
      for (let ci = lo; ci < Math.min(lo + 3, candidates.length); ci++) {
        const ai = candidates[ci];
        if (ai < asrIdx) continue;
        if (ai > asrIdx + 150) break;

        // TIME GUARD: reject if this would jump too far from expected position
        const jumpTime = asrWords[ai].start - lastMatchedTime;
        if (jumpTime > MAX_TIME_JUMP && !isTimeReasonable(ai, si)) continue;

        // Verify: do the next 2 script words also match nearby?
        let confirmCount = 0;
        for (let k = 1; k <= 2 && si + k < scriptWords.length; k++) {
          const nextSw = normScript[si + k];
          if (!nextSw) continue;
          for (let nai = ai + k; nai < Math.min(ai + k + 4, asrWords.length); nai++) {
            if (wordsMatch(nextSw, normASR[nai])) {
              confirmCount++;
              break;
            }
          }
        }
        // Require stronger confirmation for large jumps
        const minConfirm = jumpTime > 8.0 ? 2 : 1;
        if (confirmCount >= minConfirm) {
          alignment[si] = ai;
          asrIdx = ai + 1;
          lastMatchedTime = asrWords[ai].end;
          found = true;
          break;
        }
      }
    }
    if (found) continue;

    // ── Strategy 3: Fuzzy search in wider window ─────────────────
    const WIDE_WINDOW = 60;
    const wideLimit = Math.min(asrIdx + WIDE_WINDOW, asrWords.length);
    for (let ai = asrIdx + WINDOW; ai < wideLimit; ai++) {
      if (wordsMatch(sw, normASR[ai])) {
        // TIME GUARD
        const jumpTime = asrWords[ai].start - lastMatchedTime;
        if (jumpTime > MAX_TIME_JUMP) continue;

        // Confirm with next word
        const nextSw = si + 1 < scriptWords.length ? normScript[si + 1] : null;
        if (nextSw) {
          let nextFound = false;
          for (let nai = ai + 1; nai < Math.min(ai + 5, asrWords.length); nai++) {
            if (wordsMatch(nextSw, normASR[nai])) { nextFound = true; break; }
          }
          if (!nextFound) continue;
        }
        alignment[si] = ai;
        asrIdx = ai + 1;
        lastMatchedTime = asrWords[ai].end;
        found = true;
        break;
      }
    }

    // If still not found, script word is unmatched — asrIdx stays put
  }

  return alignment;
}

/**
 * Interpolate timestamps for unmatched script words.
 * Uses the nearest matched neighbors to estimate timing.
 */
function interpolateUnmatched(alignment, asrWords) {
  const timestamps = new Array(alignment.length).fill(null);

  // Fill in matched words
  for (let i = 0; i < alignment.length; i++) {
    if (alignment[i] >= 0) {
      timestamps[i] = {
        start: asrWords[alignment[i]].start,
        end: asrWords[alignment[i]].end,
      };
    }
  }

  // Interpolate unmatched by finding nearest left and right matches
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i]) continue;

    let leftIdx = -1, rightIdx = -1;
    for (let l = i - 1; l >= 0; l--) {
      if (timestamps[l]) { leftIdx = l; break; }
    }
    for (let r = i + 1; r < timestamps.length; r++) {
      if (timestamps[r]) { rightIdx = r; break; }
    }

    if (leftIdx >= 0 && rightIdx >= 0) {
      // Linear interpolation between neighbors
      const span = rightIdx - leftIdx;
      const pos = i - leftIdx;
      const ratio = pos / span;
      const leftEnd = timestamps[leftIdx].end;
      const rightStart = timestamps[rightIdx].start;
      const dur = rightStart - leftEnd;
      timestamps[i] = {
        start: leftEnd + dur * ((pos - 0.5) / span),
        end: leftEnd + dur * ((pos + 0.5) / span),
      };
    } else if (leftIdx >= 0) {
      const gap = 0.15; // assume ~150ms per word
      timestamps[i] = {
        start: timestamps[leftIdx].end + gap * (i - leftIdx - 1),
        end: timestamps[leftIdx].end + gap * (i - leftIdx),
      };
    } else if (rightIdx >= 0) {
      const gap = 0.15;
      timestamps[i] = {
        start: Math.max(0, timestamps[rightIdx].start - gap * (rightIdx - i)),
        end: Math.max(0, timestamps[rightIdx].start - gap * (rightIdx - i - 1)),
      };
    }
  }

  return timestamps;
}

/**
 * Main function: align scenes to ASR word timestamps (for TIMELINE)
 *
 * SIMPLE APPROACH:
 * 1. Match each scene's first word → ASR start time = scene start
 * 2. Match each scene's last word  → ASR end time   = scene end
 * 3. The silence between last word of scene N and first word of scene N+1
 *    naturally becomes the buffer/transition zone — split at midpoint.
 * 4. No bloat detection, no drift fix, no complex post-processing.
 *
 * @param {Array} asrWords - [{word, start, end}, ...] from transcription
 * @param {Array} scenes - sorted scenes with narration_text
 * @param {number} totalAudioDuration - total voiceover duration in seconds
 * @returns {Array} - [{sceneId, sceneNumber, startTime, endTime, duration, matchScore, ...}, ...]
 */
export function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return [];

  // ── Step 1: Flatten all scene narration into one word list ──────
  const scriptWords = [];
  const sceneWordRanges = [];

  scenes.forEach((scene, idx) => {
    const text = (scene.narration_text || scene.voiceover_text || '').trim();
    const tokens = text.split(/\s+/).filter(Boolean);
    const firstIdx = scriptWords.length;
    tokens.forEach(t => scriptWords.push({ word: t, sceneIdx: idx }));
    const lastIdx = scriptWords.length - 1;
    sceneWordRanges.push({
      sceneIdx: idx,
      firstWordIdx: tokens.length > 0 ? firstIdx : -1,
      lastWordIdx: tokens.length > 0 ? lastIdx : -1,
      wordCount: tokens.length,
    });
  });

  // ── Step 2: Global word alignment ──────────────────────────────
  const alignment = globalAlign(scriptWords, asrWords);

  const totalMatched = alignment.filter(a => a >= 0).length;
  console.log(`[ASR Align] ${totalMatched}/${scriptWords.length} words matched (${((totalMatched / scriptWords.length) * 100).toFixed(0)}%)`);

  // ── Step 3: Find first/last matched word per scene ─────────────
  // This is the ONLY thing that determines scene boundaries.
  const results = scenes.map((scene, idx) => {
    const range = sceneWordRanges[idx];

    if (range.wordCount === 0) {
      return {
        sceneId: scene.id, sceneNumber: scene.scene_number,
        startTime: null, endTime: null, duration: 0,
        matchScore: 0, empty: true, wordCount: 0,
        speechStart: null, speechEnd: null,
      };
    }

    // Walk through this scene's words, find first and last ASR match
    let firstMatch = null; // {start, end} of first matched word
    let lastMatch = null;  // {start, end} of last matched word
    let matched = 0;

    for (let wi = range.firstWordIdx; wi <= range.lastWordIdx; wi++) {
      if (alignment[wi] >= 0) {
        matched++;
        const asrWord = asrWords[alignment[wi]];
        if (!firstMatch) firstMatch = { start: asrWord.start, end: asrWord.end };
        lastMatch = { start: asrWord.start, end: asrWord.end };
      }
    }

    const matchScore = matched / range.wordCount;

    // Scene start = when first word is spoken
    // Scene end   = when last word finishes
    let speechStart = firstMatch?.start ?? null;
    let speechEnd   = lastMatch?.end ?? null;

    // ── Sanity check: if the ASR span is wildly too wide for the word count,
    // the aligner matched to wrong positions. Mark as unreliable.
    const SECS_PER_WORD = 0.38;
    const wordEstimate = range.wordCount * SECS_PER_WORD;
    let unreliable = false;

    if (speechStart != null && speechEnd != null) {
      const span = speechEnd - speechStart;
      // Unreliable if:
      // 1. Span > 2.5x the word-count estimate AND span > 8s, OR
      // 2. Match rate < 50% AND span > 8s
      const spanTooWide = span > wordEstimate * 2.5 && span > 8;
      const lowMatch = matchScore < 0.5 && span > 8;
      if (spanTooWide || lowMatch) {
        console.warn(`[ASR Scene ${scene.scene_number}] ⚠️ UNRELIABLE: span ${span.toFixed(1)}s for ${range.wordCount}w (expected ~${wordEstimate.toFixed(1)}s), match ${(matchScore * 100).toFixed(0)}% — will anchor from neighbors`);
        unreliable = true;
        speechStart = null;
        speechEnd = null;
      }
    }

    console.log(`[ASR Scene ${scene.scene_number}] ${range.wordCount}w, ${matched} matched | speech: ${speechStart?.toFixed(2) ?? '?'}s → ${speechEnd?.toFixed(2) ?? '?'}s = ${speechStart != null && speechEnd != null ? (speechEnd - speechStart).toFixed(2) : '?'}s | match: ${(matchScore * 100).toFixed(0)}%${unreliable ? ' ⚠️ UNRELIABLE' : ''}`);

    return {
      sceneId: scene.id, sceneNumber: scene.scene_number,
      startTime: speechStart,
      endTime: speechEnd,
      duration: (speechEnd ?? 0) - (speechStart ?? 0),
      matchScore, empty: false,
      wordCount: range.wordCount,
      speechStart, speechEnd,
      unreliable,
    };
  });

  // ── Step 4: Stitch timeline — split silence at midpoints ───────
  // Between scene N's last word end and scene N+1's first word start,
  // there's natural silence. Split it at the midpoint so each scene
  // gets half the buffer.
  //
  // For UNRELIABLE scenes (bad ASR match), we anchor them from
  // the previous scene's end and give them word-estimate duration.

  // First: resolve unreliable scenes by anchoring from neighbors
  const SECS_PER_WORD_STITCH = 0.38;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.unreliable && !r.empty) continue;
    if (!r.unreliable) continue; // empty scenes handled separately below

    // Find the nearest reliable scene before and after
    let prevEnd = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (!results[j].empty && !results[j].unreliable && results[j].speechEnd != null) {
        prevEnd = results[j].speechEnd;
        break;
      } else if (results[j].endTime != null) {
        prevEnd = results[j].endTime;
        break;
      }
    }

    let nextStart = totalAudioDuration;
    for (let j = i + 1; j < results.length; j++) {
      if (!results[j].empty && !results[j].unreliable && results[j].speechStart != null) {
        nextStart = results[j].speechStart;
        break;
      }
    }

    // Give this scene its word-estimate duration, anchored after prev
    const estDur = Math.max(1.0, r.wordCount * SECS_PER_WORD_STITCH + 0.5);
    const available = nextStart - prevEnd;
    const dur = Math.min(estDur, Math.max(1.0, available));

    r.startTime = prevEnd;
    r.endTime = prevEnd + dur;
    r.duration = dur;

    console.log(`[ASR Scene ${r.sceneNumber}] ⚠️ Unreliable → anchored: ${r.startTime.toFixed(2)}s → ${r.endTime.toFixed(2)}s = ${dur.toFixed(2)}s (est ${estDur.toFixed(1)}s)`);
  }

  // First scene starts at 0
  if (results.length > 0 && !results[0].empty && results[0].startTime !== null) {
    results[0].startTime = 0;
  }

  // Stitch adjacent scenes at the midpoint of silence between them
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];

    // Skip empty scenes for now
    if (curr.empty || next.empty) continue;

    const currEnd = curr.speechEnd ?? curr.endTime;
    const nextStart = next.speechStart ?? next.startTime;
    if (currEnd === null || nextStart === null) continue;

    // The silence gap between this scene's last word and next scene's first word
    const silenceGap = nextStart - currEnd;

    if (silenceGap > 0) {
      // Cap how much silence each scene absorbs on each side.
      // Each scene gets at most MAX_BUFFER of silence as padding.
      // Any remaining dead air in the middle is "owned" by curr scene
      // (visual holds slightly longer — better than next scene starting too early).
      const MAX_BUFFER = 1.5;
      const currBuffer = Math.min(MAX_BUFFER, silenceGap / 2);
      const nextBuffer = Math.min(MAX_BUFFER, silenceGap / 2);
      // curr scene ends: speechEnd + its buffer
      // next scene starts: speechStart - its buffer
      const currNewEnd = currEnd + currBuffer;
      const nextNewStart = nextStart - nextBuffer;
      // If buffers overlap (gap < 2*MAX_BUFFER), just split at midpoint
      if (currNewEnd >= nextNewStart) {
        const mid = currEnd + silenceGap / 2;
        curr.endTime = mid;
        next.startTime = mid;
      } else {
        // Dead air gap in the middle — assign it to curr (visual holds)
        curr.endTime = nextNewStart;
        next.startTime = nextNewStart;
      }
    } else {
      // Overlap or no gap — just butt them together
      const boundary = (currEnd + nextStart) / 2;
      curr.endTime = boundary;
      next.startTime = boundary;
    }
  }

  // Last scene ends at total audio duration
  const lastNonEmpty = [...results].reverse().find(r => !r.empty);
  if (lastNonEmpty) {
    lastNonEmpty.endTime = totalAudioDuration;
  }

  // Handle empty scenes (no narration) — give them 1.5s between neighbors
  const MIN_EMPTY = 1.5;
  for (let i = 0; i < results.length; i++) {
    if (!results[i].empty) continue;
    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;

    if (prev && prev.endTime !== null && next && next.startTime !== null) {
      const available = next.startTime - prev.endTime;
      if (available >= MIN_EMPTY) {
        results[i].startTime = prev.endTime;
        results[i].endTime = prev.endTime + Math.min(MIN_EMPTY, available);
        next.startTime = results[i].endTime;
      } else {
        results[i].startTime = prev.endTime;
        results[i].endTime = prev.endTime + MIN_EMPTY;
        next.startTime = results[i].endTime;
      }
    } else if (prev && prev.endTime !== null) {
      results[i].startTime = prev.endTime;
      results[i].endTime = Math.min(prev.endTime + MIN_EMPTY, totalAudioDuration);
    } else if (next && next.startTime !== null) {
      results[i].endTime = next.startTime;
      results[i].startTime = Math.max(0, next.startTime - MIN_EMPTY);
    }
  }

  // ── Step 5: Finalize — hard cap, round, and calculate durations ─
  // No scene should exceed MAX_SCENE_DURATION. If it does, trim it
  // and push the reclaimed time to neighbors.
  const nonEmptyCount = results.filter(r => !r.empty).length;
  const avgDuration = nonEmptyCount > 0 ? totalAudioDuration / nonEmptyCount : 8;
  const MAX_SCENE_DURATION = Math.max(12, avgDuration * 2.5);
  const MIN_DURATION = 1.0;

  // Pass 1: Hard-cap bloated scenes
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.empty || r.startTime === null || r.endTime === null) continue;
    const dur = r.endTime - r.startTime;
    if (dur > MAX_SCENE_DURATION) {
      const excess = dur - MAX_SCENE_DURATION;
      // Trim from the end — the speech content is at the start
      r.endTime = r.startTime + MAX_SCENE_DURATION;
      console.warn(`[ASR Scene ${r.sceneNumber}] ⚠️ HARD CAP: ${dur.toFixed(1)}s → ${MAX_SCENE_DURATION.toFixed(1)}s (trimmed ${excess.toFixed(1)}s)`);
      // Push next scene's start back to fill the gap
      if (i + 1 < results.length && results[i + 1].startTime !== null) {
        results[i + 1].startTime = r.endTime;
      }
    }
  }

  // Pass 2: Enforce minimums and round
  results.forEach((r, i) => {
    if (r.startTime !== null && r.endTime !== null) {
      if (r.endTime - r.startTime < MIN_DURATION && !r.empty) {
        r.endTime = r.startTime + MIN_DURATION;
        if (i + 1 < results.length && results[i + 1].startTime !== null) {
          if (results[i + 1].startTime < r.endTime) {
            results[i + 1].startTime = r.endTime;
          }
        }
      }
      r.startTime = Math.round(r.startTime * 1000) / 1000;
      r.endTime = Math.round(r.endTime * 1000) / 1000;
      r.duration = Math.round((r.endTime - r.startTime) * 1000) / 1000;
    }
  });

  // Log final timeline
  console.log(`[ASR Timeline] ${results.length} scenes, total: ${totalAudioDuration.toFixed(1)}s`);
  results.forEach(r => {
    if (r.empty) return;
    console.log(`  Scene ${r.sceneNumber}: ${r.startTime?.toFixed(2)}s → ${r.endTime?.toFixed(2)}s = ${r.duration.toFixed(2)}s`);
  });

  return results;
}


// ══════════════════════════════════════════════════════════════════
// DRIFT FIX — No longer needed with the simple first/last word
// approach, but kept as a no-op to avoid breaking imports.
// ══════════════════════════════════════════════════════════════════
export function applyDriftFix(results) {
  return results;
}