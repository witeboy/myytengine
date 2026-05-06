// ══════════════════════════════════════════════════════════════════
// ASR-DRIVEN AUTOSYNC v3 — Sequential Word Counting
// ══════════════════════════════════════════════════════════════════
//
// KEY INSIGHT: We already know EXACTLY which words belong to each
// scene (from narration_text). The voiceover is just the script
// read aloud in order. So we don't need fuzzy matching at all.
//
// Algorithm:
//   1. Count words per scene from narration_text
//   2. ASR gives us N timestamped words for the full audio
//   3. Map ASR words sequentially: first W1 words → Scene 1,
//      next W2 words → Scene 2, etc.
//   4. Scene start = ASR timestamp of its first word
//      Scene end   = ASR timestamp of its last word
//   5. Stitch gaps at midpoints between scenes
//
// This is dead simple and robust because it doesn't try to match
// by word content at all — just by position in the sequence.
// ══════════════════════════════════════════════════════════════════

/**
 * Main function: align scenes to ASR word timestamps
 *
 * @param {Array} asrWords - [{word, start, end}, ...] from transcription
 * @param {Array} scenes - sorted scenes with narration_text
 * @param {number} totalAudioDuration - total voiceover duration in seconds
 * @returns {Array} - [{sceneId, sceneNumber, startTime, endTime, duration, ...}, ...]
 */
export function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return [];

  // ── Step 1: Count words per scene ──────────────────────────────
  const sceneWordCounts = scenes.map(scene => {
    const text = (scene.narration_text || scene.voiceover_text || '').trim();
    return text.split(/\s+/).filter(Boolean).length;
  });

  const totalScriptWords = sceneWordCounts.reduce((s, c) => s + c, 0);
  const totalAsrWords = asrWords.length;

  console.log(`[ASR Sync] ${totalScriptWords} script words, ${totalAsrWords} ASR words, ${scenes.length} scenes, ${totalAudioDuration.toFixed(1)}s audio`);

  // ── Step 2: Cumulative word boundaries ─────────────────────────
  // Instead of rounding per-scene (which compounds errors), we use
  // cumulative fractions to find exact ASR word boundaries.
  // Scene i owns ASR words from cumFraction[i] to cumFraction[i+1].
  const ratio = totalAsrWords / Math.max(1, totalScriptWords);

  console.log(`[ASR Sync] Word ratio: ${ratio.toFixed(3)} (ASR/script) — ${ratio > 1 ? 'ASR has more words' : 'ASR has fewer words'}`);

  // ── Step 3: Map ASR words to scenes via cumulative fractions ───
  // Build cumulative script word counts, then map to ASR indices
  // using the cumulative total. This prevents rounding drift.
  const cumScriptWords = [0];
  for (let i = 0; i < sceneWordCounts.length; i++) {
    cumScriptWords.push(cumScriptWords[i] + sceneWordCounts[i]);
  }

  const sceneAsrRanges = [];

  for (let i = 0; i < scenes.length; i++) {
    const wc = sceneWordCounts[i];

    if (wc === 0) {
      sceneAsrRanges.push({ firstIdx: -1, lastIdx: -1, asrCount: 0 });
      continue;
    }

    // Map cumulative script boundaries to ASR indices
    const asrStart = Math.round((cumScriptWords[i] / totalScriptWords) * totalAsrWords);
    const asrEnd = i === scenes.length - 1
      ? totalAsrWords  // last scene gets everything remaining
      : Math.round((cumScriptWords[i + 1] / totalScriptWords) * totalAsrWords);

    // Clamp and ensure at least 1 word
    const firstIdx = Math.min(asrStart, totalAsrWords - 1);
    const lastIdx = Math.max(firstIdx, Math.min(asrEnd - 1, totalAsrWords - 1));
    const asrCount = lastIdx - firstIdx + 1;

    sceneAsrRanges.push({ firstIdx, lastIdx, asrCount });
  }

  // ── Step 4: Extract timestamps from ASR word ranges ────────────
  const results = scenes.map((scene, idx) => {
    const range = sceneAsrRanges[idx];
    const wc = sceneWordCounts[idx];

    if (wc === 0 || range.firstIdx < 0 || range.lastIdx < 0) {
      return {
        sceneId: scene.id,
        sceneNumber: scene.scene_number,
        startTime: null,
        endTime: null,
        duration: 0,
        matchScore: 0,
        empty: true,
        wordCount: wc,
        speechStart: null,
        speechEnd: null,
      };
    }

    // Clamp to valid ASR indices
    const first = Math.min(range.firstIdx, asrWords.length - 1);
    const last = Math.min(range.lastIdx, asrWords.length - 1);

    const speechStart = asrWords[first].start;
    const speechEnd = asrWords[last].end;

    console.log(`[ASR Scene ${scene.scene_number}] ${wc} script words → ${range.asrCount} ASR words [${first}..${last}] | ${speechStart.toFixed(2)}s → ${speechEnd.toFixed(2)}s = ${(speechEnd - speechStart).toFixed(2)}s`);

    return {
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      startTime: speechStart,
      endTime: speechEnd,
      duration: speechEnd - speechStart,
      matchScore: 1.0,
      empty: false,
      wordCount: wc,
      speechStart,
      speechEnd,
    };
  });

  // ── Step 5: Stitch timeline — split gaps at midpoints ──────────
  // First scene always starts at 0
  if (results.length > 0 && !results[0].empty) {
    results[0].startTime = 0;
  }

  // Between consecutive non-empty scenes, split the gap at the midpoint
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.empty || next.empty) continue;

    const currSpeechEnd = curr.speechEnd;
    const nextSpeechStart = next.speechStart;
    if (currSpeechEnd === null || nextSpeechStart === null) continue;

    const gap = nextSpeechStart - currSpeechEnd;

    if (gap > 0) {
      // Bias gap toward the scene that just finished speaking (70/30).
      // Natural speech pauses happen at the END of a thought, so the
      // outgoing scene should "own" more of the silence.
      const boundary = currSpeechEnd + gap * 0.7;
      curr.endTime = boundary;
      next.startTime = boundary;
    } else {
      // Overlap or no gap — split at the midpoint of the overlap
      const boundary = (currSpeechEnd + nextSpeechStart) / 2;
      curr.endTime = boundary;
      next.startTime = boundary;
    }
  }

  // Last non-empty scene ends at total audio duration
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
      const dur = Math.min(MIN_EMPTY, available);
      results[i].startTime = prev.endTime;
      results[i].endTime = prev.endTime + dur;
      if (dur < available) next.startTime = results[i].endTime;
    } else if (prev && prev.endTime !== null) {
      results[i].startTime = prev.endTime;
      results[i].endTime = Math.min(prev.endTime + MIN_EMPTY, totalAudioDuration);
    } else if (next && next.startTime !== null) {
      results[i].endTime = next.startTime;
      results[i].startTime = Math.max(0, next.startTime - MIN_EMPTY);
    }
  }

  // ── Step 6: Finalize — enforce minimums, round ─────────────────
  const MIN_DURATION = 1.0;
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

// Kept as no-op to avoid breaking imports
export function applyDriftFix(results) {
  return results;
}