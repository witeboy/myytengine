// ══════════════════════════════════════════════════════════════════
// ASR-DRIVEN AUTOSYNC v4 — Text-Anchored Word Matching
// ══════════════════════════════════════════════════════════════════
//
// WHY v3 FAILED:
//   v3 used a proportional ratio (totalASRWords / totalScriptWords)
//   to assign ASR words to scenes. This assumes all scenes are spoken
//   at the same pace. They're not. A narrator might pause 2 seconds
//   on a 3-word scene, then speed through a 20-word scene. The ratio
//   puts scene boundaries in the wrong places.
//
// v4 APPROACH:
//   1. Extract the word list from each scene's narration_text
//   2. Walk through ASR words sequentially
//   3. For each scene, consume ASR words that match (fuzzy) the
//      scene's script words, in order
//   4. Scene start = timestamp of first matched ASR word
//      Scene end   = timestamp of last matched ASR word
//   5. Stitch gaps between scenes
//
// This is robust because:
//   - It uses the ACTUAL audio timestamps for each scene's words
//   - It handles pace variation naturally (fast/slow sections)
//   - Fuzzy matching handles minor ASR errors (thee → the, etc.)
//   - Sequential consumption prevents word-stealing between scenes
// ══════════════════════════════════════════════════════════════════

/**
 * Normalize a word for fuzzy comparison.
 * Strips punctuation, lowercases, handles common ASR substitutions.
 */
function normalizeWord(w) {
  if (!w) return '';
  return w
    .toLowerCase()
    .replace(/[^a-z0-9']/g, '') // keep apostrophes for contractions
    .replace(/^'+|'+$/g, '');    // strip leading/trailing apostrophes
}

/**
 * Check if two words are a fuzzy match.
 * Handles: exact match, prefix match (3+ chars), single char diff.
 */
function wordsMatch(scriptWord, asrWord) {
  const a = normalizeWord(scriptWord);
  const b = normalizeWord(asrWord);
  if (!a || !b) return false;
  
  // Exact match
  if (a === b) return true;
  
  // One is prefix of the other (handles truncations like "engineerin" → "engineering")
  if (a.length >= 3 && b.length >= 3) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }
  
  // Single character difference (handles "thee" → "the", "an" → "and")
  if (Math.abs(a.length - b.length) <= 1) {
    let diffs = 0;
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    let si = 0;
    for (let li = 0; li < longer.length && diffs <= 1; li++) {
      if (shorter[si] === longer[li]) {
        si++;
      } else {
        diffs++;
        if (a.length === b.length) si++; // substitution, advance both
      }
    }
    if (diffs <= 1) return true;
  }
  
  return false;
}

/**
 * Extract clean word list from scene narration text.
 */
function getSceneWords(scene) {
  const text = (scene.narration_text || scene.voiceover_text || '').trim();
  if (!text) return [];
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Main function: align scenes to ASR word timestamps using text matching.
 *
 * @param {Array} asrWords - [{word, start, end}, ...] from transcription
 * @param {Array} scenes - sorted scenes with narration_text
 * @param {number} totalAudioDuration - total voiceover duration in seconds
 * @returns {Array} - [{sceneId, sceneNumber, startTime, endTime, duration, ...}, ...]
 */
export function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return [];

  // ── Step 1: Extract script words per scene ─────────────────────
  const sceneScriptWords = scenes.map(scene => getSceneWords(scene));
  const totalScriptWords = sceneScriptWords.reduce((s, arr) => s + arr.length, 0);
  
  console.log(`[ASR Sync v4] ${totalScriptWords} script words, ${asrWords.length} ASR words, ${scenes.length} scenes, ${totalAudioDuration.toFixed(1)}s audio`);

  // ── Step 2: Sequential text-anchored matching ──────────────────
  // Walk through ASR words, consuming them scene by scene.
  // For each scene, try to match its script words against upcoming
  // ASR words. Allow skipping up to 2 ASR words (ASR insertions)
  // and up to 1 script word (ASR deletions) to stay robust.
  
  let asrCursor = 0; // current position in ASR word array
  const sceneMatches = []; // per-scene: { firstAsrIdx, lastAsrIdx, matchedCount }
  
  for (let si = 0; si < scenes.length; si++) {
    const scriptWords = sceneScriptWords[si];
    
    if (scriptWords.length === 0) {
      sceneMatches.push({ firstAsrIdx: -1, lastAsrIdx: -1, matchedCount: 0, empty: true });
      continue;
    }
    
    const firstAsrIdx = asrCursor;
    let firstMatchedAsrIdx = -1;
    let lastMatchedAsrIdx = -1;
    let scriptIdx = 0;
    let matchedCount = 0;
    
    // How many ASR words should this scene consume at most?
    // Use a generous upper bound: 2× the script word count + 5.
    // This prevents one scene from eating all remaining ASR words
    // if matching goes wrong.
    const maxAsrConsume = Math.min(
      scriptWords.length * 4 + 15,
      asrWords.length - asrCursor
    );
    
    let localAsrIdx = 0; // how many ASR words we've looked at for this scene
    
    while (scriptIdx < scriptWords.length && localAsrIdx < maxAsrConsume) {
      const asrIdx = asrCursor + localAsrIdx;
      if (asrIdx >= asrWords.length) break;
      
      const asrW = asrWords[asrIdx].word;
      const scriptW = scriptWords[scriptIdx];
      
      if (wordsMatch(scriptW, asrW)) {
        // Match found — consume both
        if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = asrIdx;
        lastMatchedAsrIdx = asrIdx;
        matchedCount++;
        scriptIdx++;
        localAsrIdx++;
      } else {
        // No match — try skipping up to 3 ASR words (ASR inserted filler)
        let asrSkipFound = false;
        for (let skip = 1; skip <= 3 && localAsrIdx + skip < maxAsrConsume; skip++) {
          const candidateIdx = asrIdx + skip;
          if (candidateIdx < asrWords.length && wordsMatch(scriptW, asrWords[candidateIdx].word)) {
            localAsrIdx += skip; // skip inserted ASR words
            if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = asrCursor + localAsrIdx;
            lastMatchedAsrIdx = asrCursor + localAsrIdx;
            matchedCount++;
            scriptIdx++;
            localAsrIdx++;
            asrSkipFound = true;
            break;
          }
        }

        if (!asrSkipFound) {
          // Try skipping up to 3 script words (ASR dropped them)
          let scriptSkipFound = false;
          for (let skip = 1; skip <= 3 && scriptIdx + skip < scriptWords.length; skip++) {
            if (wordsMatch(scriptWords[scriptIdx + skip], asrW)) {
              scriptIdx += skip; // skip dropped script words
              if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = asrIdx;
              lastMatchedAsrIdx = asrIdx;
              matchedCount++;
              scriptIdx++;
              localAsrIdx++;
              scriptSkipFound = true;
              break;
            }
          }

          if (!scriptSkipFound) {
            // Neither skip worked — advance ASR cursor and try again
            localAsrIdx++;
          }
        }
      }
    }
    
    // Advance the global ASR cursor past all words consumed by this scene
    if (lastMatchedAsrIdx >= 0) {
      asrCursor = lastMatchedAsrIdx + 1;
    } else {
      // No matches at all — scene had words but ASR didn't match any.
      // Don't advance cursor, will be handled as empty.
      // But assign it a proportional chunk of remaining ASR words
      // so it doesn't collapse to zero.
      const remainingScenes = scenes.length - si;
      const remainingAsr = asrWords.length - asrCursor;
      const fairShare = Math.max(1, Math.round(remainingAsr / remainingScenes));
      const assignedEnd = Math.min(asrCursor + fairShare, asrWords.length) - 1;
      sceneMatches.push({
        firstAsrIdx: asrCursor,
        lastAsrIdx: assignedEnd,
        matchedCount: 0,
        empty: false,
        fallback: true, // flag that this used proportional fallback
      });
      asrCursor = assignedEnd + 1;
      continue;
    }
    
    sceneMatches.push({
      firstAsrIdx: firstAsrIdx,
      firstMatchedAsrIdx: firstMatchedAsrIdx >= 0 ? firstMatchedAsrIdx : firstAsrIdx,
      lastAsrIdx: lastMatchedAsrIdx,
      matchedCount,
      empty: false,
      matchRate: matchedCount / scriptWords.length,
    });
    
    console.log(`[ASR Scene ${scenes[si].scene_number}] ${scriptWords.length} script → ${matchedCount} matched, ASR range [${firstAsrIdx}..${lastMatchedAsrIdx}]`);
  }

  // ── Step 3: Extract timestamps from matched ranges ─────────────
  const results = scenes.map((scene, idx) => {
    const match = sceneMatches[idx];
    const wc = sceneScriptWords[idx].length;
    
    if (match.empty || (match.firstAsrIdx < 0 && match.lastAsrIdx < 0)) {
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
    
    const firstIdx = Math.max(0, Math.min(
      match.firstMatchedAsrIdx >= 0 ? match.firstMatchedAsrIdx : match.firstAsrIdx,
      asrWords.length - 1
    ));
    const lastIdx = Math.max(0, Math.min(match.lastAsrIdx, asrWords.length - 1));
    
    const speechStart = asrWords[firstIdx].start;
    const speechEnd = asrWords[lastIdx].end;
    
    return {
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      startTime: speechStart,
      endTime: speechEnd,
      duration: Math.max(0.5, speechEnd - speechStart),
      matchScore: match.matchRate || (match.fallback ? 0.3 : 0),
      empty: false,
      wordCount: wc,
      speechStart,
      speechEnd,
      matchedCount: match.matchedCount,
      fallback: match.fallback || false,
    };
  });

  // ── Step 4: Stitch timeline — fill gaps between scenes ─────────
  // First scene always starts at 0
  if (results.length > 0 && !results[0].empty) {
    results[0].startTime = 0;
  }

  // Between consecutive non-empty scenes, split the gap at midpoint
  // with 70/30 bias toward the outgoing scene (natural speech pause)
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.empty || next.empty) continue;
    if (curr.speechEnd === null || next.speechStart === null) continue;

    const gap = next.speechStart - curr.speechEnd;

    if (gap > 0) {
      // Gap between scenes — bias toward outgoing scene
      const boundary = curr.speechEnd + gap * 0.7;
      curr.endTime = boundary;
      next.startTime = boundary;
    } else {
      // Overlap — split at midpoint
      const boundary = (curr.speechEnd + next.speechStart) / 2;
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

  // ── Step 5: Enforce minimums, detect drift, round ──────────────
  const MIN_DURATION = 1.0;
  results.forEach((r, i) => {
    if (r.startTime !== null && r.endTime !== null) {
      if (r.endTime - r.startTime < MIN_DURATION && !r.empty) {
        r.endTime = r.startTime + MIN_DURATION;
        // Push next scene if we expanded into it
        if (i + 1 < results.length && results[i + 1].startTime !== null) {
          if (results[i + 1].startTime < r.endTime) {
            results[i + 1].startTime = r.endTime;
          }
        }
      }
      r.startTime = Math.round(r.startTime * 1000) / 1000;
      r.endTime = Math.round(r.endTime * 1000) / 1000;
      r.duration = Math.round((r.endTime - r.startTime) * 1000) / 1000;
      
      // Drift detection: if scene duration is >2.5× the estimated speech time
      // and the scene is >10s, it's probably bloated
      if (!r.empty && r.wordCount > 0) {
        const estimatedSpeechTime = Math.max(1.0, r.wordCount * 0.38);
        const isBloated = r.duration > estimatedSpeechTime * 2.5 && r.duration > 10;
        r.driftDetected = isBloated;
        if (isBloated) {
          r.driftInfo = {
            currentDuration: r.duration,
            speechSpan: Math.round(estimatedSpeechTime * 100) / 100,
            wordCount: r.wordCount,
            suggestedDuration: Math.round(Math.max(1.0, Math.min(10, estimatedSpeechTime + 1.5)) * 100) / 100,
            deadAir: Math.round((r.duration - estimatedSpeechTime) * 100) / 100,
          };
        }
      }
    }
  });

  // ── Step 6: Final continuity check ─────────────────────────────
  // Ensure no gaps or overlaps between consecutive scenes
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.endTime !== null && next.startTime !== null) {
      if (Math.abs(curr.endTime - next.startTime) > 0.002) {
        // Force continuity — next scene starts exactly where previous ends
        next.startTime = curr.endTime;
        next.duration = Math.round((next.endTime - next.startTime) * 1000) / 1000;
      }
    }
  }

  // Log final timeline
  console.log(`[ASR Timeline v4] ${results.length} scenes, total: ${totalAudioDuration.toFixed(1)}s`);
  let totalMapped = 0;
  results.forEach(r => {
    if (r.empty) return;
    totalMapped += r.duration;
    const matchInfo = r.fallback ? '(fallback)' : `${r.matchedCount}/${r.wordCount} matched`;
    console.log(`  Scene ${r.sceneNumber}: ${r.startTime?.toFixed(2)}s → ${r.endTime?.toFixed(2)}s = ${r.duration.toFixed(2)}s | ${matchInfo}`);
  });
  console.log(`  Total mapped: ${totalMapped.toFixed(2)}s / ${totalAudioDuration.toFixed(2)}s`);

  return results;
}

/**
 * Apply drift fix — kept for backward compatibility.
 * In v4, drift detection is built into alignScenesToASR.
 */
export function applyDriftFix(results) {
  return results;
}