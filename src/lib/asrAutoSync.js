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
  // This lets us jump directly to candidate positions
  const asrIndex = {};
  normASR.forEach((w, i) => {
    if (!w) return;
    if (!asrIndex[w]) asrIndex[w] = [];
    asrIndex[w].push(i);
  });

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
        found = true;
        break;
      }
    }
    if (found) continue;

    // ── Strategy 2: Use inverted index to find next occurrence ──
    // Find the smallest ASR index >= asrIdx for this exact word
    const candidates = asrIndex[sw];
    if (candidates) {
      // Binary search for first candidate >= asrIdx
      let lo = 0, hi = candidates.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (candidates[mid] < asrIdx) lo = mid + 1;
        else hi = mid;
      }
      // Check candidates near this position
      for (let ci = lo; ci < Math.min(lo + 3, candidates.length); ci++) {
        const ai = candidates[ci];
        if (ai < asrIdx) continue;
        // Don't jump too far ahead — max 150 ASR words skip
        if (ai > asrIdx + 150) break;

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
        if (confirmCount >= 1) {
          alignment[si] = ai;
          asrIdx = ai + 1;
          found = true;
          break;
        }
      }
    }
    if (found) continue;

    // ── Strategy 3: Fuzzy search in wider window (edit distance) ─
    const WIDE_WINDOW = 60;
    const wideLimit = Math.min(asrIdx + WIDE_WINDOW, asrWords.length);
    for (let ai = asrIdx + WINDOW; ai < wideLimit; ai++) {
      if (wordsMatch(sw, normASR[ai])) {
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
 * Main function: align scenes to ASR word timestamps
 *
 * @param {Array} asrWords - [{word, start, end}, ...] from transcription
 * @param {Array} scenes - sorted scenes with narration_text
 * @param {number} totalAudioDuration - total voiceover duration in seconds
 * @returns {Array} - [{sceneId, sceneNumber, startTime, endTime, duration, matchScore, ...}, ...]
 */
export function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return [];

  // ── Step 1: Flatten all scene narration into a single word list ──
  const scriptWords = []; // [{word, sceneIdx, sceneId}]
  const sceneWordRanges = []; // [{sceneIdx, firstWordIdx, lastWordIdx}]

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

  // ── Step 2: Global alignment ──────────────────────────────────
  const alignment = globalAlign(scriptWords, asrWords);

  // ── Step 3: Interpolate unmatched words ────────────────────────
  const timestamps = interpolateUnmatched(alignment, asrWords);

  // ── Step 4: Derive scene boundaries ────────────────────────────
  const results = scenes.map((scene, idx) => {
    const range = sceneWordRanges[idx];

    if (range.wordCount === 0) {
      return {
        sceneId: scene.id, sceneNumber: scene.scene_number,
        startTime: null, endTime: null, duration: 0,
        matchScore: 0, empty: true,
      };
    }

    // Find first and last words with timestamps for this scene
    let firstTs = null, lastTs = null;
    let matched = 0;

    for (let wi = range.firstWordIdx; wi <= range.lastWordIdx; wi++) {
      if (alignment[wi] >= 0) matched++;
      if (timestamps[wi]) {
        if (!firstTs) firstTs = timestamps[wi];
        lastTs = timestamps[wi];
      }
    }

    const matchScore = range.wordCount > 0 ? matched / range.wordCount : 0;

    return {
      sceneId: scene.id, sceneNumber: scene.scene_number,
      startTime: firstTs?.start ?? null,
      endTime: lastTs?.end ?? null,
      duration: (lastTs?.end ?? 0) - (firstTs?.start ?? 0),
      matchScore,
      empty: false,
      // Keep raw speech boundaries for gap validation
      speechStart: firstTs?.start ?? null,
      speechEnd: lastTs?.end ?? null,
    };
  });

  // Log overall match quality
  const nonEmpty = results.filter(r => !r.empty);
  const totalMatched = alignment.filter(a => a >= 0).length;
  const totalScript = scriptWords.length;
  console.log(`[ASR Align] ${totalMatched}/${totalScript} words matched (${((totalMatched / totalScript) * 100).toFixed(0)}%), ${nonEmpty.length} scenes`);

  // ── Step 5: Post-processing — full coverage ────────────────────

  // First scene starts at 0
  if (results.length > 0 && results[0].startTime !== null) {
    results[0].startTime = 0;
  }

  // Last scene ends at total audio duration
  const lastNonEmpty = [...results].reverse().find(r => !r.empty);
  if (lastNonEmpty) {
    lastNonEmpty.endTime = totalAudioDuration;
  }

  // Close gaps between consecutive non-empty scenes.
  // If the gap is small (≤ MAX_ABSORB), the current scene absorbs it
  // (visual holds until next narration starts). If it's large (a long
  // silence/music break), split the excess evenly so no single scene
  // balloons to an absurd duration.
  const MAX_ABSORB = 5.0; // max seconds a scene can absorb beyond its speech
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.empty || next.empty) continue;
    if (curr.endTime === null || next.startTime === null) continue;

    if (next.startTime > curr.endTime) {
      const gap = next.startTime - curr.endTime;
      if (gap <= MAX_ABSORB) {
        // Small gap — current scene absorbs it
        curr.endTime = next.startTime;
      } else {
        // Large gap (silence/music break) — split evenly
        const mid = curr.endTime + gap / 2;
        curr.endTime = mid;
        next.startTime = mid;
      }
    } else if (next.startTime < curr.endTime) {
      // Overlap — snap to next scene's start
      curr.endTime = next.startTime;
    }
  }

  // Handle empty scenes (no narration)
  for (let i = 0; i < results.length; i++) {
    if (!results[i].empty) continue;
    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;
    const MIN_EMPTY = 1.5;

    if (prev && prev.endTime !== null && next && next.startTime !== null) {
      const available = next.startTime - prev.endTime;
      if (available > MIN_EMPTY) {
        results[i].startTime = prev.endTime;
        results[i].endTime = prev.endTime + MIN_EMPTY;
        next.startTime = results[i].endTime;
      } else {
        results[i].startTime = prev.endTime - MIN_EMPTY / 2;
        results[i].endTime = prev.endTime + MIN_EMPTY / 2;
        prev.endTime = results[i].startTime;
        if (next.startTime < results[i].endTime) next.startTime = results[i].endTime;
      }
    } else if (prev && prev.endTime !== null) {
      results[i].startTime = prev.endTime;
      results[i].endTime = Math.min(prev.endTime + MIN_EMPTY, totalAudioDuration);
    } else if (next && next.startTime !== null) {
      results[i].endTime = next.startTime;
      results[i].startTime = Math.max(0, next.startTime - MIN_EMPTY);
    }
  }

  // Recalculate durations and round
  results.forEach(r => {
    if (r.startTime !== null && r.endTime !== null) {
      r.startTime = Math.round(r.startTime * 1000) / 1000;
      r.endTime = Math.round(r.endTime * 1000) / 1000;
      r.duration = Math.round((r.endTime - r.startTime) * 1000) / 1000;
    }
  });

  // Enforce minimum duration
  const MIN_DURATION = 1.0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].duration < MIN_DURATION) {
      const deficit = MIN_DURATION - results[i].duration;
      if (i < results.length - 1 && results[i + 1].duration > MIN_DURATION + deficit) {
        results[i].endTime += deficit;
        results[i + 1].startTime += deficit;
      } else if (i > 0 && results[i - 1].duration > MIN_DURATION + deficit) {
        results[i].startTime -= deficit;
        results[i - 1].endTime -= deficit;
      }
      results[i].duration = Math.round((results[i].endTime - results[i].startTime) * 1000) / 1000;
    }
  }

  return results;
}