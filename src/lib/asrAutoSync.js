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
  const MAX_TIME_JUMP = 15.0; // seconds

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
  // CORE PRINCIPLE: scene startTime/endTime come DIRECTLY from the
  // ASR timestamps of the first/last matched words in that scene.
  // Interpolated timestamps are only used as fallback when a scene
  // has zero direct ASR matches. This ensures each scene's duration
  // is exactly the speech span of its narration.
  const results = scenes.map((scene, idx) => {
    const range = sceneWordRanges[idx];

    if (range.wordCount === 0) {
      return {
        sceneId: scene.id, sceneNumber: scene.scene_number,
        startTime: null, endTime: null, duration: 0,
        matchScore: 0, empty: true, wordCount: 0,
      };
    }

    // Collect ALL direct ASR match timestamps for this scene's words
    let firstDirectTs = null, lastDirectTs = null;
    let firstInterp = null, lastInterp = null;
    let matched = 0;
    const allMatchTimes = []; // all matched word timestamps for outlier detection

    for (let wi = range.firstWordIdx; wi <= range.lastWordIdx; wi++) {
      if (alignment[wi] >= 0) {
        matched++;
        const ts = {
          start: asrWords[alignment[wi]].start,
          end: asrWords[alignment[wi]].end,
        };
        allMatchTimes.push(ts);
        if (!firstDirectTs) firstDirectTs = ts;
        lastDirectTs = ts;
      }
      if (timestamps[wi]) {
        if (!firstInterp) firstInterp = timestamps[wi];
        lastInterp = timestamps[wi];
      }
    }

    const matchScore = range.wordCount > 0 ? matched / range.wordCount : 0;
    const wordCount = range.wordCount;

    // ── Outlier detection: if the last ASR match is suspiciously far
    // from the cluster of other matches, use a robust endpoint instead.
    // This catches the case where one word got matched to a distant
    // part of the audio (misalignment).
    let robustStart = firstDirectTs?.start ?? firstInterp?.start ?? null;
    let robustEnd = lastDirectTs?.end ?? lastInterp?.end ?? null;

    if (allMatchTimes.length >= 3) {
      const expectedSpan = wordCount * 0.4; // ~0.4s per word normal speech
      const rawSpan = (lastDirectTs?.end ?? 0) - (firstDirectTs?.start ?? 0);

      if (rawSpan > expectedSpan * 3 && rawSpan > 12) {
        // The raw span is suspiciously wide — use percentile clamping
        const sortedStarts = allMatchTimes.map(t => t.start).sort((a, b) => a - b);
        const sortedEnds = allMatchTimes.map(t => t.end).sort((a, b) => a - b);
        // Use 10th percentile for start and 90th for end to exclude outliers
        const p10 = sortedStarts[Math.floor(sortedStarts.length * 0.1)];
        const p90 = sortedEnds[Math.floor(sortedEnds.length * 0.9)];
        console.warn(`[ASR Align] ⚠️ Scene ${scene.scene_number}: raw span ${rawSpan.toFixed(1)}s (expected ~${expectedSpan.toFixed(1)}s) — clamping to p10-p90: ${p10.toFixed(1)}s-${p90.toFixed(1)}s`);
        robustStart = p10;
        robustEnd = p90;
      }
    }

    // Scene boundaries = direct ASR speech span (robust)
    // speechStart/speechEnd also stored for drift detection
    return {
      sceneId: scene.id, sceneNumber: scene.scene_number,
      startTime: robustStart,
      endTime: robustEnd,
      duration: (robustEnd ?? 0) - (robustStart ?? 0),
      matchScore,
      empty: false,
      wordCount,
      speechStart: robustStart,
      speechEnd: robustEnd,
    };
  });

  // Log overall match quality
  const nonEmpty = results.filter(r => !r.empty);
  const totalMatched = alignment.filter(a => a >= 0).length;
  const totalScript = scriptWords.length;
  console.log(`[ASR Align] ${totalMatched}/${totalScript} words matched (${((totalMatched / totalScript) * 100).toFixed(0)}%), ${nonEmpty.length} scenes`);

  // Log per-scene ASR anchors for verification
  results.forEach(r => {
    if (r.empty) return;
    console.log(`[ASR Scene ${r.sceneNumber}] ${r.wordCount}w | ASR span: ${r.speechStart?.toFixed(2)}s → ${r.speechEnd?.toFixed(2)}s = ${r.duration.toFixed(2)}s | match: ${(r.matchScore * 100).toFixed(0)}%`);
  });

  // ── Step 5: Post-processing — full coverage ────────────────────
  // Scene boundaries are now driven by ASR word positions.
  // Post-processing only: anchor edges, close seams, handle empties.

  // First scene starts at 0
  if (results.length > 0 && results[0].startTime !== null) {
    results[0].startTime = 0;
  }

  // Last scene ends at total audio duration
  const lastNonEmpty = [...results].reverse().find(r => !r.empty);
  if (lastNonEmpty) {
    lastNonEmpty.endTime = totalAudioDuration;
  }

  // Close seams between consecutive non-empty scenes.
  // Each scene's start/end already comes from ASR word positions.
  // We just need to stitch adjacent scenes so there are no gaps or overlaps.
  // Strategy: split the gap/overlap at the midpoint between the previous
  // scene's last word end and the next scene's first word start.

  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.empty || next.empty) continue;
    if (curr.endTime === null || next.startTime === null) continue;

    const gap = next.startTime - curr.endTime;
    if (Math.abs(gap) < 0.01) continue; // already stitched

    // Split at midpoint between current speech end and next speech start
    const mid = curr.endTime + gap / 2;
    curr.endTime = mid;
    next.startTime = mid;
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

  // ── AUTO-FIX BLOATED SCENES ──────────────────────────────────────
  // After gap stitching, some scenes absorb dead air from their neighbors
  // and become much longer than their actual speech content.
  // Automatically shrink any scene whose duration exceeds its word-based
  // estimate by more than 1.8x, and redistribute the freed time to the
  // next scene (extend it backward).
  const SECS_PER_WORD = 0.38;
  const MAX_RATIO = 1.8; // max allowed duration / wordEstimate ratio
  const MIN_DURATION = 1.0;

  // Multiple passes: shrinking one scene extends the next, which may need shrinking too
  for (let pass = 0; pass < 30; pass++) {
    let fixedAny = false;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.empty || r.startTime === null || r.endTime === null) continue;

      const wordCount = r.wordCount ?? 0;
      if (wordCount === 0) continue;
      const wordEstimate = Math.max(MIN_DURATION, wordCount * SECS_PER_WORD);
      const maxAllowed = Math.max(MIN_DURATION + 1, wordEstimate * MAX_RATIO);

      if (r.duration > maxAllowed) {
        const targetDur = Math.max(MIN_DURATION, wordEstimate + 0.5);
        const freed = r.duration - targetDur;

        console.log(`[Auto-Fix] Scene ${r.sceneNumber}: ${r.duration.toFixed(1)}s → ${targetDur.toFixed(1)}s (${wordCount}w, est ${wordEstimate.toFixed(1)}s, freed ${freed.toFixed(1)}s)`);

        r.endTime = r.startTime + targetDur;
        r.duration = targetDur;

        // Give freed time to next scene (extend it backward)
        if (i + 1 < results.length && !results[i + 1].empty) {
          results[i + 1].startTime = r.endTime;
          results[i + 1].duration = results[i + 1].endTime - results[i + 1].startTime;
        }
        fixedAny = true;
      }
    }
    if (!fixedAny) break;
  }

  // Enforce minimum duration
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

  // ── DRIFT DETECTION (report remaining — user can apply manual fix) ──
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.empty || r.startTime === null || r.endTime === null) continue;

    const wordCount = r.wordCount ?? 0;
    const wordEstimate = Math.max(1.0, wordCount * SECS_PER_WORD);

    // Flag anything still over 2x word estimate after auto-fix
    if (r.duration > wordEstimate * 2.0 && r.duration > 6) {
      const suggestedDur = Math.round(Math.max(1.0, Math.min(10, wordEstimate + 0.5)) * 100) / 100;
      r.driftDetected = true;
      r.driftInfo = {
        currentDuration: r.duration,
        speechSpan: Math.round(((r.speechEnd ?? r.endTime) - (r.speechStart ?? r.startTime)) * 100) / 100,
        wordCount,
        wordEstimate: Math.round(wordEstimate * 100) / 100,
        suggestedDuration: suggestedDur,
        deadAir: Math.round((r.duration - wordEstimate) * 100) / 100,
      };
      console.warn(`[Drift Detected] Scene ${r.sceneNumber}: ${r.duration.toFixed(1)}s (words: ${wordCount}, est: ${wordEstimate.toFixed(1)}s)`);
    }
  }

  return results;
}


// ══════════════════════════════════════════════════════════════════
// DRIFT FIX — Apply targeted speech-density fix to drifted scenes
// Called manually by the user after reviewing detected drifts.
// Only touches the affected scenes + their neighbors. Everything
// else stays exactly as the main aligner left it.
// ══════════════════════════════════════════════════════════════════

/**
 * Fix drifted scenes in-place.
 * Shrinks bloated scenes to their speech span + padding, then
 * redistributes freed time to intermediate neighbors using word counts.
 *
 * @param {Array} results - alignment results (mutated in place)
 * @param {Array} driftedIndices - 0-based indices of bloated scenes
 * @param {Array} [wordRanges] - optional sceneWordRanges for accurate word counts
 * @returns {Array} - the mutated results array
 */
export function applyDriftFix(results, driftedIndices) {
  if (!driftedIndices?.length || !results?.length) return results;

  const MIN_DUR = 1.0;

  // Strategy:
  // Each bloated scene already has speechStart/speechEnd from ASR — these
  // tell us where the scene's FIRST and LAST words are spoken in the audio.
  // But for bloated scenes, speechEnd may be wrong (ASR matched a word far
  // away). So we use:
  //   - startTime: keep the scene's current startTime (where the previous
  //     scene ends — maintains continuity)
  //   - duration: wordEstimate + 1.0s padding (how long the words take)
  // Then extend the NEXT scene backward to fill the gap. All other scenes
  // keep their ASR-anchored positions — audio sync is preserved.

  const SECS_PER_WORD = 0.38;

  // Helper: check if a scene is bloated and tag it
  const detectBloat = (r) => {
    if (!r || r.empty || r.startTime === null || r.endTime === null) return;
    // wordCount is stored directly on the result by alignScenesToASR
    const wordCount = r.wordCount ?? r.driftInfo?.wordCount ?? 0;
    if (wordCount === 0) return;
    const wordEstimate = Math.max(1.0, wordCount * SECS_PER_WORD);
    const isBloated = r.duration > wordEstimate * 2.5 && r.duration > 8;
    if (isBloated) {
      const suggestedDur = Math.round(Math.max(MIN_DUR, Math.min(10, wordEstimate + 1.0)) * 100) / 100;
      r.driftDetected = true;
      r.driftInfo = {
        ...(r.driftInfo || {}),
        currentDuration: r.duration,
        wordCount,
        wordEstimate: Math.round(wordEstimate * 100) / 100,
        suggestedDuration: suggestedDur,
        deadAir: Math.round((r.duration - wordEstimate) * 100) / 100,
      };
    }
  };

  // Helper: fix a single bloated scene
  const fixScene = (i) => {
    const r = results[i];
    if (!r || r.empty || !r.driftDetected) return;
    const info = r.driftInfo;
    if (!info) return;

    // Use ACTUAL ASR speech span when available and reasonable.
    // speechStart/speechEnd are the timestamps of the first/last ASR-matched
    // words for this scene. If the span is reasonable (not itself bloated),
    // use it directly. Otherwise fall back to word estimate.
    const wordEstimate = info.wordEstimate;
    let speechDur = null;
    if (r.speechStart != null && r.speechEnd != null) {
      const rawSpan = r.speechEnd - r.speechStart;
      // Trust the ASR span if it's within 3x of the word estimate
      // (if it's bigger, speechEnd was probably misaligned)
      if (rawSpan > 0 && rawSpan <= wordEstimate * 3) {
        speechDur = rawSpan;
      }
    }

    // Target duration: ASR speech span + small padding, or word estimate + padding
    const baseDur = speechDur ?? wordEstimate;
    const targetDur = Math.max(MIN_DUR, Math.min(10, baseDur + 0.5));

    const source = speechDur ? 'ASR span' : 'word est';
    console.log(`[Drift Fix] Scene ${r.sceneNumber}: ${r.duration.toFixed(1)}s → ${targetDur.toFixed(1)}s (${source}: ${baseDur.toFixed(1)}s, ${info.wordCount} words)`);

    // Keep startTime anchored, shrink endTime
    r.endTime = r.startTime + targetDur;
    r.duration = targetDur;
    r.driftFixed = true;
    r.driftDetected = false;

    // Extend the NEXT scene backward to fill the gap.
    // The gap is dead air — showing the next scene's visual earlier is fine.
    // The next scene's endTime stays put (preserving its audio sync and all
    // scenes after it).
    if (i + 1 < results.length) {
      const next = results[i + 1];
      if (next.startTime > r.endTime) {
        next.startTime = r.endTime;
        next.duration = next.endTime - next.startTime;
        // Re-check: extending the next scene backward may have made IT bloated
        detectBloat(next);
      }
    }
  };

  // Fix all initially-flagged scenes
  for (const i of driftedIndices) {
    if (i < 0 || i >= results.length) continue;
    fixScene(i);
  }

  // Cascade: keep fixing any newly-bloated scenes until stable
  // (max 20 passes to prevent infinite loops)
  for (let pass = 0; pass < 20; pass++) {
    let foundMore = false;
    for (let i = 0; i < results.length; i++) {
      if (results[i].driftDetected && !results[i].driftFixed) {
        fixScene(i);
        foundMore = true;
      }
    }
    if (!foundMore) break;
  }

  // Round everything
  results.forEach(r => {
    if (r.startTime !== null && r.endTime !== null) {
      r.startTime = Math.round(r.startTime * 1000) / 1000;
      r.endTime = Math.round(r.endTime * 1000) / 1000;
      r.duration = Math.round((r.endTime - r.startTime) * 1000) / 1000;
    }
  });

  return results;
}