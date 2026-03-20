// ══════════════════════════════════════════════════════════════════
// ASR-DRIVEN AUTOSYNC — Exact audio-aligned scene boundaries
// ══════════════════════════════════════════════════════════════════
//
// Uses real word-level timestamps from speech recognition to
// determine exactly when each scene's narration starts and ends
// in the voiceover audio. Zero drift, zero estimation.
//
// Algorithm:
//   1. Get ASR words [{word, start, end}, ...]
//   2. For each scene, fuzzy-match its narration_text to a
//      contiguous run of ASR words
//   3. Scene start = first matched word's start time
//      Scene end   = last matched word's end time
//   4. Handle gaps between scenes (split evenly)
//   5. Ensure full coverage: first scene starts at 0,
//      last scene ends at total audio duration
// ══════════════════════════════════════════════════════════════════

/**
 * Normalize a word for matching: lowercase, strip punctuation
 */
function normalize(w) {
  return (w || '').toLowerCase().replace(/[^a-z0-9'']/g, '');
}

/**
 * Score how well a sequence of ASR words matches a sequence of script words.
 * Returns 0-1 (1 = perfect match).
 */
function sequenceMatchScore(asrWords, scriptWords, asrStart, scriptLen) {
  if (asrStart + scriptLen > asrWords.length) return 0;
  let matches = 0;
  for (let i = 0; i < scriptLen; i++) {
    const asrNorm = normalize(asrWords[asrStart + i].word);
    const scriptNorm = normalize(scriptWords[i]);
    if (asrNorm === scriptNorm) {
      matches++;
    } else if (asrNorm.length > 2 && scriptNorm.length > 2) {
      // Partial match for similar words (ASR may mishear slightly)
      if (asrNorm.startsWith(scriptNorm.slice(0, 3)) || scriptNorm.startsWith(asrNorm.slice(0, 3))) {
        matches += 0.5;
      }
    }
  }
  return matches / scriptLen;
}

/**
 * Find the best starting position in ASR words for a script's word sequence.
 * Uses a sliding window with anchored search near the expected position.
 */
function findBestMatch(asrWords, scriptWords, expectedStart, searchRadius) {
  const scriptLen = scriptWords.length;
  if (scriptLen === 0) return { start: expectedStart, end: expectedStart, score: 0 };

  // For very short scenes (1-3 words), use a smaller sample
  const sampleSize = Math.min(scriptLen, 8);
  const sampleScript = scriptWords.slice(0, sampleSize);

  let bestScore = -1;
  let bestStart = expectedStart;

  // Search within radius of expected position
  const lo = Math.max(0, expectedStart - searchRadius);
  const hi = Math.min(asrWords.length - sampleSize, expectedStart + searchRadius);

  for (let i = lo; i <= hi; i++) {
    const score = sequenceMatchScore(asrWords, sampleScript, i, sampleSize);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  // If we matched the start, find where this scene's text ends
  // Walk through the full script words from bestStart
  let endIdx = Math.min(bestStart + scriptLen - 1, asrWords.length - 1);

  // Verify the end region matches too (last few words)
  if (scriptLen > 8) {
    const tailSample = scriptWords.slice(-4);
    let bestTailScore = -1;
    let bestTailPos = endIdx - 3;
    const tailLo = Math.max(bestStart + scriptLen - 20, bestStart);
    const tailHi = Math.min(bestStart + scriptLen + 20, asrWords.length - 4);
    for (let i = tailLo; i <= tailHi; i++) {
      const score = sequenceMatchScore(asrWords, tailSample, i, 4);
      if (score > bestTailScore) {
        bestTailScore = score;
        bestTailPos = i;
      }
    }
    endIdx = bestTailPos + 3;
  }

  return {
    start: bestStart,
    end: Math.min(endIdx, asrWords.length - 1),
    score: bestScore,
  };
}

/**
 * Main function: align scenes to ASR word timestamps
 *
 * @param {Array} asrWords - [{word, start, end}, ...] from transcription
 * @param {Array} scenes - sorted scenes with narration_text
 * @param {number} totalAudioDuration - total voiceover duration in seconds
 * @returns {Array} - [{sceneId, sceneNumber, startTime, endTime, duration, asrWordStart, asrWordEnd}, ...]
 */
export function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return [];

  const results = [];
  let asrCursor = 0; // Track where we expect the next scene to start in ASR words

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const text = (scene.narration_text || scene.voiceover_text || '').trim();
    const scriptWords = text.split(/\s+/).filter(Boolean);

    if (scriptWords.length === 0) {
      // Scene with no text — will be assigned a gap later
      results.push({
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        startTime: null,
        endTime: null,
        duration: 0,
        asrWordStart: null,
        asrWordEnd: null,
        empty: true,
      });
      continue;
    }

    // Search radius: wider for first scene, tighter for subsequent ones
    const radius = i === 0 ? Math.min(asrWords.length, 50) : Math.min(80, Math.max(20, scriptWords.length * 2));
    const match = findBestMatch(asrWords, scriptWords, asrCursor, radius);

    const wordStart = asrWords[match.start];
    const wordEnd = asrWords[match.end];

    results.push({
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      startTime: wordStart?.start ?? null,
      endTime: wordEnd?.end ?? null,
      duration: (wordEnd?.end ?? 0) - (wordStart?.start ?? 0),
      asrWordStart: match.start,
      asrWordEnd: match.end,
      matchScore: match.score,
      empty: false,
    });

    // Move cursor past this scene's matched words
    asrCursor = match.end + 1;
  }

  // ── Post-processing: fill gaps and ensure full coverage ──────

  // 1. First scene starts at 0
  if (results.length > 0 && results[0].startTime !== null) {
    results[0].startTime = 0;
  }

  // 2. Last scene ends at total audio duration
  const lastNonEmpty = [...results].reverse().find(r => !r.empty);
  if (lastNonEmpty) {
    lastNonEmpty.endTime = totalAudioDuration;
  }

  // 3. For consecutive non-empty scenes, close gaps so visuals cut
  //    RIGHT when the next scene's narration begins (no lag).
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];

    if (curr.empty || next.empty) continue;
    if (curr.endTime === null || next.startTime === null) continue;

    if (next.startTime > curr.endTime) {
      // Gap between scenes — extend current scene to fill it,
      // so the visual cuts exactly when the next narration starts.
      curr.endTime = next.startTime;
    } else if (next.startTime < curr.endTime) {
      // Overlap — snap: next scene's speech wins (visual cuts to it)
      curr.endTime = next.startTime;
    }
  }

  // 4. Handle empty scenes — give them a small slice from their neighbor
  for (let i = 0; i < results.length; i++) {
    if (!results[i].empty) continue;

    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;
    const MIN_EMPTY = 1.5; // minimum 1.5s for empty scenes

    if (prev && prev.endTime !== null && next && next.startTime !== null) {
      // Between two scenes — take a slice
      const available = next.startTime - prev.endTime;
      if (available > MIN_EMPTY) {
        results[i].startTime = prev.endTime;
        results[i].endTime = prev.endTime + MIN_EMPTY;
        next.startTime = results[i].endTime;
      } else {
        // Steal from previous scene
        results[i].startTime = prev.endTime - MIN_EMPTY / 2;
        results[i].endTime = prev.endTime + MIN_EMPTY / 2;
        prev.endTime = results[i].startTime;
        if (next.startTime < results[i].endTime) next.startTime = results[i].endTime;
      }
    } else if (prev && prev.endTime !== null) {
      results[i].startTime = prev.endTime;
      results[i].endTime = Math.min(prev.endTime + MIN_EMPTY, totalAudioDuration);
      prev.endTime = results[i].startTime;
    } else if (next && next.startTime !== null) {
      results[i].endTime = next.startTime;
      results[i].startTime = Math.max(0, next.startTime - MIN_EMPTY);
      next.startTime = results[i].endTime;
    }
  }

  // 5. Recalculate durations and round
  results.forEach(r => {
    if (r.startTime !== null && r.endTime !== null) {
      r.startTime = Math.round(r.startTime * 1000) / 1000;
      r.endTime = Math.round(r.endTime * 1000) / 1000;
      r.duration = Math.round((r.endTime - r.startTime) * 1000) / 1000;
    }
  });

  // 6. Enforce minimum duration (1s) by stealing from longest neighbor
  const MIN_DURATION = 1.0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].duration < MIN_DURATION) {
      const deficit = MIN_DURATION - results[i].duration;
      // Try to extend endTime
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