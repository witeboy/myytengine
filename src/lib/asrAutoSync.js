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
  
  console.log(`[ASR Sync v5] ${totalScriptWords} script words, ${asrWords.length} ASR words, ${scenes.length} scenes, ${totalAudioDuration.toFixed(1)}s audio`);

  // ── Step 2: Sequential text-anchored matching ──────────────────
  let asrCursor = 0;
  const sceneMatches = [];
  
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
    
    const maxAsrConsume = Math.min(
      scriptWords.length * 4 + 15,
      asrWords.length - asrCursor
    );
    
    let localAsrIdx = 0;
    
    while (scriptIdx < scriptWords.length && localAsrIdx < maxAsrConsume) {
      const asrIdx = asrCursor + localAsrIdx;
      if (asrIdx >= asrWords.length) break;
      
      const asrW = asrWords[asrIdx].word;
      const scriptW = scriptWords[scriptIdx];
      
      if (wordsMatch(scriptW, asrW)) {
        if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = asrIdx;
        lastMatchedAsrIdx = asrIdx;
        matchedCount++;
        scriptIdx++;
        localAsrIdx++;
      } else {
        let asrSkipFound = false;
        for (let skip = 1; skip <= 3 && localAsrIdx + skip < maxAsrConsume; skip++) {
          const candidateIdx = asrIdx + skip;
          if (candidateIdx < asrWords.length && wordsMatch(scriptW, asrWords[candidateIdx].word)) {
            localAsrIdx += skip;
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
          let scriptSkipFound = false;
          for (let skip = 1; skip <= 3 && scriptIdx + skip < scriptWords.length; skip++) {
            if (wordsMatch(scriptWords[scriptIdx + skip], asrW)) {
              scriptIdx += skip;
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
            localAsrIdx++;
          }
        }
      }
    }
    
    if (lastMatchedAsrIdx >= 0) {
      asrCursor = lastMatchedAsrIdx + 1;
    } else {
      // No matches — mark as fallback, don't steal ASR words
      sceneMatches.push({
        firstAsrIdx: -1,
        lastAsrIdx: -1,
        matchedCount: 0,
        empty: false,
        fallback: true,
      });
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

  // ── Step 3: Extract AUTHORITATIVE timestamps from matched words ─
  // speechStart/speechEnd are the ground truth — they come directly
  // from the ASR word timestamps and will NOT be overridden.
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
        empty: match.empty || false,
        fallback: match.fallback || false,
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
      startTime: speechStart,   // will be adjusted for padding only
      endTime: speechEnd,       // will be adjusted for padding only
      duration: Math.max(0.5, speechEnd - speechStart),
      matchScore: match.matchRate || 0,
      empty: false,
      fallback: false,
      wordCount: wc,
      speechStart,
      speechEnd,
      matchedCount: match.matchedCount,
    };
  });

  // ── Step 4: Word-anchored stitching ────────────────────────────
  // RULE: Each scene's startTime/endTime stays anchored to its
  // speechStart/speechEnd. We only distribute dead-air gaps
  // (silence between scenes) as symmetric padding, capped so no
  // scene gets more than 0.5s of padding on either side.
  
  const MAX_PAD = 0.5; // max padding added to either side of a scene
  
  // 4a: Handle the leading silence (before first spoken scene)
  const firstSpoken = results.find(r => !r.empty && !r.fallback && r.speechStart !== null);
  if (firstSpoken) {
    const leadingSilence = firstSpoken.speechStart;
    // Give at most MAX_PAD of leading silence to the first scene
    firstSpoken.startTime = Math.max(0, firstSpoken.speechStart - Math.min(leadingSilence, MAX_PAD));
  }
  
  // 4b: Handle trailing silence (after last spoken scene)
  const lastSpoken = [...results].reverse().find(r => !r.empty && !r.fallback && r.speechEnd !== null);
  if (lastSpoken) {
    const trailingSilence = totalAudioDuration - lastSpoken.speechEnd;
    lastSpoken.endTime = Math.min(totalAudioDuration, lastSpoken.speechEnd + Math.min(trailingSilence, MAX_PAD));
  }
  
  // 4c: Between consecutive matched scenes, split the gap symmetrically
  // but cap each side at MAX_PAD so no scene bloats
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    
    // Skip empty/fallback scenes — handled separately
    if (curr.empty || curr.fallback || next.empty || next.fallback) continue;
    if (curr.speechEnd === null || next.speechStart === null) continue;

    const gap = next.speechStart - curr.speechEnd;

    if (gap > 0) {
      // Positive gap — silence between scenes
      // Give each side at most MAX_PAD, split remainder evenly
      const halfGap = gap / 2;
      const currPad = Math.min(halfGap, MAX_PAD);
      const nextPad = Math.min(halfGap, MAX_PAD);
      const boundary = curr.speechEnd + currPad;
      // If there's leftover gap after both pads, the boundary stays at curr pad
      // and next starts at its own pad — any middle gap is "assigned" to curr
      curr.endTime = curr.speechEnd + currPad;
      next.startTime = next.speechStart - nextPad;
      
      // If the pads don't cover the full gap, we need a clean boundary
      // Split any remaining gap at the midpoint
      if (curr.endTime < next.startTime) {
        const mid = (curr.endTime + next.startTime) / 2;
        curr.endTime = mid;
        next.startTime = mid;
      }
    } else {
      // Overlap — scenes' speech overlaps (shouldn't happen with good ASR)
      // Split at midpoint of the overlapping region
      const boundary = (curr.speechEnd + next.speechStart) / 2;
      curr.endTime = boundary;
      next.startTime = boundary;
    }
  }

  // 4d: Handle empty/fallback scenes — give them a minimal slot
  // between their neighbors, without stealing from matched scenes
  const MIN_EMPTY = 0.8;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.empty && !r.fallback) continue;
    
    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;
    
    if (prev && prev.endTime !== null && next && next.startTime !== null) {
      // Slot between neighbors — take only from the gap, not from their speech time
      const available = next.startTime - prev.endTime;
      if (available >= MIN_EMPTY) {
        r.startTime = prev.endTime;
        r.endTime = prev.endTime + Math.min(MIN_EMPTY, available);
        // Push next startTime only if we consumed the full gap
        if (r.endTime > next.startTime) next.startTime = r.endTime;
      } else if (available > 0) {
        r.startTime = prev.endTime;
        r.endTime = prev.endTime + available;
      } else {
        // No gap available — give it a tiny sliver at prev's end
        r.startTime = prev.endTime;
        r.endTime = prev.endTime + 0.3;
      }
    } else if (prev && prev.endTime !== null) {
      r.startTime = prev.endTime;
      r.endTime = Math.min(prev.endTime + MIN_EMPTY, totalAudioDuration);
    } else if (next && next.startTime !== null) {
      r.endTime = next.startTime;
      r.startTime = Math.max(0, next.startTime - MIN_EMPTY);
    } else {
      // Completely isolated — shouldn't happen but handle gracefully
      r.startTime = 0;
      r.endTime = MIN_EMPTY;
    }
  }

  // 4e: Ensure first scene starts at 0 and last scene ends at totalAudioDuration
  // by extending only the boundary (not overriding speechStart/speechEnd)
  if (results.length > 0 && results[0].startTime !== null && results[0].startTime > 0) {
    results[0].startTime = 0;
  }
  const lastResult = results[results.length - 1];
  if (lastResult && lastResult.endTime !== null && lastResult.endTime < totalAudioDuration) {
    lastResult.endTime = totalAudioDuration;
  }

  // ── Step 5: Enforce continuity + minimums + round ──────────────
  const MIN_DURATION = 0.5;
  
  // First pass: enforce continuity (no gaps between consecutive scenes)
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.endTime !== null && next.startTime !== null) {
      // If there's a micro-gap, close it by extending curr to meet next
      if (next.startTime > curr.endTime + 0.002) {
        // Small gap — extend curr
        curr.endTime = next.startTime;
      } else if (curr.endTime > next.startTime + 0.002) {
        // Overlap — next starts where curr ends
        next.startTime = curr.endTime;
      }
    }
  }
  
  // Second pass: enforce minimums and round
  results.forEach((r, i) => {
    if (r.startTime !== null && r.endTime !== null) {
      if (r.endTime - r.startTime < MIN_DURATION) {
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
      
      // Drift detection
      if (!r.empty && !r.fallback && r.wordCount > 0) {
        const estimatedSpeechTime = Math.max(0.5, r.wordCount * 0.38);
        const isBloated = r.duration > estimatedSpeechTime * 3.0 && r.duration > 8;
        r.driftDetected = isBloated;
        if (isBloated) {
          r.driftInfo = {
            currentDuration: r.duration,
            speechSpan: Math.round((r.speechEnd - r.speechStart) * 100) / 100,
            wordCount: r.wordCount,
            suggestedDuration: Math.round(Math.max(0.5, estimatedSpeechTime + 1.0) * 100) / 100,
            deadAir: Math.round((r.duration - (r.speechEnd - r.speechStart)) * 100) / 100,
          };
        }
      }
    }
  });

  // Log final timeline
  console.log(`[ASR Timeline v5] ${results.length} scenes, total: ${totalAudioDuration.toFixed(1)}s`);
  let totalMapped = 0;
  results.forEach(r => {
    if (r.startTime === null) return;
    totalMapped += r.duration;
    const speechSpan = (r.speechStart !== null && r.speechEnd !== null) 
      ? `speech ${r.speechStart.toFixed(2)}-${r.speechEnd.toFixed(2)}s` 
      : (r.empty ? 'empty' : 'fallback');
    const matchInfo = r.fallback ? '(fallback)' : r.empty ? '(empty)' : `${r.matchedCount}/${r.wordCount}`;
    console.log(`  Scene ${r.sceneNumber}: ${r.startTime.toFixed(2)}s → ${r.endTime.toFixed(2)}s = ${r.duration.toFixed(2)}s | ${speechSpan} | ${matchInfo}`);
  });
  console.log(`  Total mapped: ${totalMapped.toFixed(2)}s / ${totalAudioDuration.toFixed(2)}s`);

  return results;
}

/**
 * Apply drift fix — kept for backward compatibility.
 * In v4, drift detection is built into alignScenesToASR.
 */
export function applyDriftFix(results, driftedIndices) {
  if (!driftedIndices?.length || !results?.length) return results;
  
  const fixed = results.map(r => ({ ...r }));
  let totalReclaimed = 0;
  
  // Shrink bloated scenes to their suggested duration
  for (const idx of driftedIndices) {
    const r = fixed[idx];
    if (!r || !r.driftInfo) continue;
    
    const oldDuration = r.duration;
    const newDuration = r.driftInfo.suggestedDuration || Math.max(1.0, (r.speechEnd - r.speechStart) + 0.5);
    const reclaimed = oldDuration - newDuration;
    
    if (reclaimed <= 0) continue;
    
    r.endTime = r.startTime + newDuration;
    r.duration = newDuration;
    totalReclaimed += reclaimed;
  }
  
  // Rebuild start times to close gaps created by shrinking
  for (let i = 1; i < fixed.length; i++) {
    const prev = fixed[i - 1];
    if (prev.endTime !== null && fixed[i].startTime !== null) {
      if (fixed[i].startTime !== prev.endTime) {
        const shift = prev.endTime - fixed[i].startTime;
        fixed[i].startTime = prev.endTime;
        fixed[i].endTime = fixed[i].endTime + shift;
        // Don't change duration of non-drifted scenes
        if (!driftedIndices.includes(i)) {
          fixed[i].endTime = fixed[i].startTime + fixed[i].duration;
        }
      }
    }
  }
  
  // Recalculate durations
  fixed.forEach(r => {
    if (r.startTime !== null && r.endTime !== null) {
      r.duration = Math.round((r.endTime - r.startTime) * 1000) / 1000;
      r.startTime = Math.round(r.startTime * 1000) / 1000;
      r.endTime = Math.round(r.endTime * 1000) / 1000;
      r.driftDetected = false;
      r.driftInfo = undefined;
    }
  });
  
  console.log(`[DriftFix] Reclaimed ${totalReclaimed.toFixed(2)}s from ${driftedIndices.length} bloated scenes`);
  return fixed;
}