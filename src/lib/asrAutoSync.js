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
  const results = scenes.map((scene, idx) => {
    const range = sceneWordRanges[idx];

    if (range.wordCount === 0) {
      return {
        sceneId: scene.id, sceneNumber: scene.scene_number,
        startTime: null, endTime: null, duration: 0,
        matchScore: 0, empty: true,
      };
    }

    // Find first and last words with timestamps for this scene.
    // Track both interpolated timestamps (for scene boundaries) and
    // direct ASR matches (for gap validation — more trustworthy).
    let firstTs = null, lastTs = null;
    let firstDirectTs = null, lastDirectTs = null;
    let matched = 0;

    for (let wi = range.firstWordIdx; wi <= range.lastWordIdx; wi++) {
      if (alignment[wi] >= 0) {
        matched++;
        // Direct ASR match — trustworthy timestamp
        const directTs = {
          start: asrWords[alignment[wi]].start,
          end: asrWords[alignment[wi]].end,
        };
        if (!firstDirectTs) firstDirectTs = directTs;
        lastDirectTs = directTs;
      }
      if (timestamps[wi]) {
        if (!firstTs) firstTs = timestamps[wi];
        lastTs = timestamps[wi];
      }
    }

    const matchScore = range.wordCount > 0 ? matched / range.wordCount : 0;

    // Log scenes with suspiciously wide word spans (direct matches far apart)
    if (firstDirectTs && lastDirectTs) {
      const directSpan = lastDirectTs.end - firstDirectTs.start;
      const wordCount = range.wordCount;
      const expectedDur = wordCount * 0.35; // ~0.35s per word is normal speech
      if (directSpan > expectedDur * 3 && directSpan > 15) {
        console.warn(`[ASR Align] ⚠️ Scene ${scene.scene_number}: direct matches span ${directSpan.toFixed(1)}s for ${wordCount} words (expected ~${expectedDur.toFixed(1)}s) — possible misalignment`);
      }
    }

    return {
      sceneId: scene.id, sceneNumber: scene.scene_number,
      startTime: firstTs?.start ?? null,
      endTime: lastTs?.end ?? null,
      duration: (lastTs?.end ?? 0) - (firstTs?.start ?? 0),
      matchScore,
      empty: false,
      // Raw direct-match boundaries (from ASR, not interpolated)
      speechStart: firstDirectTs?.start ?? firstTs?.start ?? null,
      speechEnd: lastDirectTs?.end ?? lastTs?.end ?? null,
    };
  });

  // Log overall match quality
  const nonEmpty = results.filter(r => !r.empty);
  const totalMatched = alignment.filter(a => a >= 0).length;
  const totalScript = scriptWords.length;
  console.log(`[ASR Align] ${totalMatched}/${totalScript} words matched (${((totalMatched / totalScript) * 100).toFixed(0)}%), ${nonEmpty.length} scenes`);

  // ── Step 5: Post-processing — full coverage ────────────────────

  // ── Step 5a: Detect & fix over-stretched scenes ─────────────────
  // If a scene's direct ASR matches span much longer than expected
  // for its word count, it means some words were misaligned to the
  // wrong part of the audio. Clamp the scene using the next scene's
  // speech start as an upper bound.
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.empty || r.speechStart === null || r.speechEnd === null) continue;

    const range = sceneWordRanges[i];
    const wordCount = range.wordCount;
    const expectedDur = Math.max(2.0, wordCount * 0.4); // ~0.4s per word
    const actualSpan = r.speechEnd - r.speechStart;

    if (actualSpan > expectedDur * 3 && actualSpan > 15) {
      // This scene is over-stretched. Find the next scene's speech start
      // to use as an upper bound.
      let nextSpeechStart = null;
      for (let j = i + 1; j < results.length; j++) {
        if (!results[j].empty && results[j].speechStart !== null) {
          nextSpeechStart = results[j].speechStart;
          break;
        }
      }

      // Also check: where do the MAJORITY of this scene's matched words fall?
      // Use the median matched timestamp as the anchor.
      const matchedTimestamps = [];
      for (let wi = range.firstWordIdx; wi <= range.lastWordIdx; wi++) {
        if (alignment[wi] >= 0) {
          matchedTimestamps.push(asrWords[alignment[wi]].end);
        }
      }

      if (matchedTimestamps.length >= 2) {
        matchedTimestamps.sort((a, b) => a - b);
        // Use the 75th percentile as the scene's true end
        const p75Idx = Math.floor(matchedTimestamps.length * 0.75);
        const clampedEnd = matchedTimestamps[p75Idx];

        // Only clamp if the 75th percentile is significantly earlier than the raw end
        if (r.speechEnd - clampedEnd > 10) {
          console.log(`[ASR Fix] Scene ${r.sceneNumber}: clamping speechEnd from ${r.speechEnd.toFixed(1)}s to ${clampedEnd.toFixed(1)}s (p75 of ${matchedTimestamps.length} matches)`);
          r.speechEnd = clampedEnd;
          r.endTime = clampedEnd;
        }
      }

      // If next scene starts before our clamped end, don't overlap
      if (nextSpeechStart !== null && r.endTime > nextSpeechStart) {
        r.endTime = nextSpeechStart;
        r.speechEnd = nextSpeechStart;
      }
    }
  }

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
  // Uses LOOKAHEAD VALIDATION: before deciding how to handle a gap,
  // check where the next scene's speech *actually* starts (from ASR).
  // This distinguishes real silence gaps from alignment artifacts.
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
        // ── LOOKAHEAD: Is this gap real or a false gap? ──────
        // Check where the next scene's speech actually starts
        // vs where the current scene's speech actually ends.
        // If the next scene's ASR-matched speech starts close to
        // the current scene's speech end, the "gap" is an artifact
        // and we should close it. If it's truly far away, it's a
        // real silence/music break — distribute evenly.

        const currSpeechEnd = curr.speechEnd ?? curr.endTime;
        const nextSpeechStart = next.speechStart ?? next.startTime;
        const actualGap = nextSpeechStart - currSpeechEnd;

        // Also look 2-3 scenes ahead to find the next speech anchor
        let nearestAheadSpeech = nextSpeechStart;
        for (let look = i + 2; look < Math.min(i + 4, results.length); look++) {
          if (!results[look].empty && results[look].speechStart !== null) {
            // If a scene ahead has speech closer to current speech end,
            // it means intermediate scenes may have been misplaced
            nearestAheadSpeech = Math.min(nearestAheadSpeech, results[look].speechStart);
            break;
          }
        }

        if (actualGap <= MAX_ABSORB) {
          // ASR words are actually close — the gap is an artifact.
          // Close it: extend current to next speech start, and snap next.
          console.log(`[Gap Close] Scene ${curr.sceneNumber}→${next.sceneNumber}: gap ${gap.toFixed(1)}s is artifact (actual speech gap ${actualGap.toFixed(1)}s) — closing`);
          curr.endTime = nextSpeechStart;
          next.startTime = nextSpeechStart;
        } else {
          // Real gap — distribute proportionally based on speech density.
          // Give each side a small tail (MAX_ABSORB/2) and leave the
          // remaining gap as dead time split evenly.
          const tail = Math.min(MAX_ABSORB / 2, gap * 0.1);
          const deadZoneStart = currSpeechEnd + tail;
          const deadZoneEnd = nextSpeechStart - tail;

          if (deadZoneEnd > deadZoneStart) {
            // Split the dead zone at midpoint
            const mid = (deadZoneStart + deadZoneEnd) / 2;
            curr.endTime = mid;
            next.startTime = mid;
          } else {
            // Tails overlap — just split the whole gap at midpoint
            const mid = currSpeechEnd + (nextSpeechStart - currSpeechEnd) / 2;
            curr.endTime = mid;
            next.startTime = mid;
          }
          console.log(`[Gap Close] Scene ${curr.sceneNumber}→${next.sceneNumber}: real gap ${actualGap.toFixed(1)}s — split at ${curr.endTime.toFixed(1)}s`);
        }
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

  // ── INTELLIGENT DRIFT CORRECTION ────────────────────────────────
  // Instead of a hard cap, detect over-stretched scenes and use their
  // word count to estimate correct duration, then re-anchor the next
  // 5 scenes using ASR word positions to heal the drift chain.
  //
  // For each bloated scene:
  //   1. Shrink it to its word-count estimate
  //   2. Look ahead 5 scenes — find the first one that has strong ASR
  //      matches (an "anchor" scene). That anchor's ASR-based start time
  //      is trustworthy.
  //   3. Distribute the time between the bloated scene and the anchor
  //      proportionally by word count across the intermediate scenes.
  //   4. Snap the anchor scene back to its ASR position.

  const LOOKAHEAD = 5;
  const SECS_PER_WORD = 0.38;
  const processed = new Set(); // avoid re-processing scenes in a correction window

  // Run drift correction in multiple passes until no more fixes needed
  let driftPassCount = 0;
  let driftFixed = true;
  while (driftFixed && driftPassCount < 3) {
    driftFixed = false;
    driftPassCount++;

  for (let i = 0; i < results.length; i++) {
    if (processed.has(i)) continue;
    const r = results[i];
    if (r.empty || r.startTime === null || r.endTime === null) continue;

    // Recalculate fresh duration from actual times
    r.duration = r.endTime - r.startTime;

    const range = sceneWordRanges[i];
    const wordCount = range?.wordCount || 0;
    const expectedDur = Math.max(MIN_DURATION, wordCount * SECS_PER_WORD);

    // Is this scene over-stretched?
    // Trigger if duration > 10s AND duration > 2x expected word-count duration
    const isOverStretched = r.duration > 10 && r.duration > expectedDur * 2;
    if (!isOverStretched) continue;

    console.log(`[Drift Fix] Scene ${r.sceneNumber}: ${r.duration.toFixed(1)}s vs expected ${expectedDur.toFixed(1)}s (${wordCount} words) — initiating correction window`);

    // ── Find an anchor scene within LOOKAHEAD ──────────────────
    // An anchor is a scene with good ASR match score whose speechStart
    // we can trust as a reliable time reference.
    let anchorIdx = -1;
    let anchorAsrStart = null;

    for (let j = i + 1; j <= Math.min(i + LOOKAHEAD, results.length - 1); j++) {
      const candidate = results[j];
      if (candidate.empty) continue;
      // A scene with matchScore >= 0.5 and a speechStart is trustworthy
      if (candidate.matchScore >= 0.4 && candidate.speechStart !== null) {
        anchorIdx = j;
        anchorAsrStart = candidate.speechStart;
        break;
      }
    }

    // If no anchor found, use the first non-empty scene ahead
    if (anchorIdx === -1) {
      for (let j = i + 1; j <= Math.min(i + LOOKAHEAD, results.length - 1); j++) {
        if (!results[j].empty && results[j].speechStart !== null) {
          anchorIdx = j;
          anchorAsrStart = results[j].speechStart;
          break;
        }
      }
    }

    // Shrink the bloated scene to its word-count estimate
    const correctedStart = r.startTime;
    const correctedEnd = correctedStart + expectedDur;

    if (anchorIdx !== -1 && anchorAsrStart !== null) {
      // ── Redistribute time between bloated scene and anchor ────
      // The window is: [scene i correctedEnd] → [anchor scene ASR start]
      const windowStart = correctedEnd;
      const windowEnd = anchorAsrStart;
      const windowDur = windowEnd - windowStart;

      // Collect intermediate scenes (between bloated and anchor)
      const intermediates = [];
      for (let j = i + 1; j < anchorIdx; j++) {
        const ir = results[j];
        const irRange = sceneWordRanges[j];
        intermediates.push({
          idx: j,
          wordCount: irRange?.wordCount || 0,
          result: ir,
        });
      }

      // Total word weight for proportional distribution
      const totalIntWords = intermediates.reduce((s, m) => s + Math.max(1, m.wordCount), 0);

      if (windowDur > 0 && totalIntWords > 0) {
        // Distribute proportionally by word count
        let cursor = windowStart;
        for (const mid of intermediates) {
          const proportion = Math.max(1, mid.wordCount) / totalIntWords;
          const midDur = Math.max(MIN_DURATION, windowDur * proportion);
          mid.result.startTime = cursor;
          mid.result.endTime = cursor + midDur;
          mid.result.duration = midDur;
          processed.add(mid.idx);
          cursor += midDur;
        }
        console.log(`[Drift Fix] Redistributed ${intermediates.length} intermediate scenes across ${windowDur.toFixed(1)}s window`);
      } else if (windowDur <= 0 && intermediates.length > 0) {
        // Window is negative — the anchor starts before our corrected end.
        // Give each intermediate its word-count estimate, pushing forward.
        let cursor = correctedEnd;
        for (const mid of intermediates) {
          const midDur = Math.max(MIN_DURATION, mid.wordCount * SECS_PER_WORD);
          mid.result.startTime = cursor;
          mid.result.endTime = cursor + midDur;
          mid.result.duration = midDur;
          processed.add(mid.idx);
          cursor += midDur;
        }
        // Adjust anchor start to after the last intermediate
        anchorAsrStart = Math.max(anchorAsrStart, cursor);
      }

      // Snap anchor scene to its ASR-based start
      const anchor = results[anchorIdx];
      anchor.startTime = anchorAsrStart;
      if (anchor.endTime < anchor.startTime + MIN_DURATION) {
        anchor.endTime = anchor.startTime + Math.max(MIN_DURATION, (sceneWordRanges[anchorIdx]?.wordCount || 3) * SECS_PER_WORD);
      }
      anchor.duration = anchor.endTime - anchor.startTime;
      processed.add(anchorIdx);

      console.log(`[Drift Fix] Anchor Scene ${anchor.sceneNumber} snapped to ${anchorAsrStart.toFixed(1)}s`);
    }

    // Apply the correction to the bloated scene itself
    r.endTime = correctedEnd;
    r.duration = expectedDur;
    processed.add(i);

    console.log(`[Drift Fix] Scene ${r.sceneNumber}: corrected to ${r.startTime.toFixed(1)}s–${r.endTime.toFixed(1)}s (${r.duration.toFixed(1)}s)`);
  }

  // ── Final gap-closing pass ──────────────────────────────────────
  // Close any gaps left by the drift correction, without re-inflating.
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.empty || next.empty) continue;
    if (curr.endTime === null || next.startTime === null) continue;

    const gap = next.startTime - curr.endTime;
    if (gap > 0 && gap <= MAX_ABSORB) {
      // Small gap — extend current scene to fill
      curr.endTime = next.startTime;
    } else if (gap > MAX_ABSORB) {
      // Larger gap — split at midpoint
      const mid = curr.endTime + gap / 2;
      curr.endTime = mid;
      next.startTime = mid;
    } else if (gap < 0) {
      // Overlap — trim the longer scene
      const mid = curr.endTime + gap / 2;
      curr.endTime = mid;
      next.startTime = mid;
    }
  }

  // Final duration recalculation
  results.forEach(r => {
    if (r.startTime !== null && r.endTime !== null) {
      r.startTime = Math.round(r.startTime * 1000) / 1000;
      r.endTime = Math.round(r.endTime * 1000) / 1000;
      r.duration = Math.round((r.endTime - r.startTime) * 1000) / 1000;
    }
  });

  return results;
}