// ══════════════════════════════════════════════════════════════════
// ASR-DRIVEN AUTOSYNC v4 — Text-Anchored Word Matching
// ══════════════════════════════════════════════════════════════════

function normalizeWord(w) {
  if (!w) return '';
  return w
    .toLowerCase()
    .replace(/[^a-z0-9']/g, '')
    .replace(/^'+|'+$/g, '');
}

function wordsMatch(scriptWord, asrWord) {
  const a = normalizeWord(scriptWord);
  const b = normalizeWord(asrWord);
  if (!a || !b) return false;

  if (a === b) return true;

  if (a.length >= 3 && b.length >= 3) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }

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
        if (a.length === b.length) si++;
      }
    }
    if (diffs <= 1) return true;
  }

  return false;
}

function getSceneWords(scene) {
  const text = (scene.narration_text || scene.voiceover_text || '').trim();
  if (!text) return [];
  return text.split(/\s+/).filter(Boolean);
}

export function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return [];

  // ── Step 1: Extract script words per scene ──────────────────────
  const sceneScriptWords = scenes.map(scene => getSceneWords(scene));
  const totalScriptWords = sceneScriptWords.reduce((s, arr) => s + arr.length, 0);

  console.log(`[ASR Sync v5] ${totalScriptWords} script words, ${asrWords.length} ASR words, ${scenes.length} scenes, ${totalAudioDuration.toFixed(1)}s audio`);

  // ── Step 2: Sequential text-anchored matching ───────────────────
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
    let localAsrIdx = 0;

    const maxAsrConsume = Math.min(
      scriptWords.length * 4 + 15,
      asrWords.length - asrCursor
    );

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
        // Try skipping ahead in ASR words (ASR inserted a word)
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
          // Try skipping ahead in script words (ASR dropped a word)
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
      sceneMatches.push({ firstAsrIdx: -1, lastAsrIdx: -1, matchedCount: 0, empty: false, fallback: true });
      continue;
    }

    sceneMatches.push({
      firstAsrIdx,
      firstMatchedAsrIdx: firstMatchedAsrIdx >= 0 ? firstMatchedAsrIdx : firstAsrIdx,
      lastAsrIdx: lastMatchedAsrIdx,
      matchedCount,
      empty: false,
      matchRate: matchedCount / scriptWords.length,
    });

    console.log(`[ASR Scene ${scenes[si].scene_number}] ${scriptWords.length} script → ${matchedCount} matched, ASR range [${firstAsrIdx}..${lastMatchedAsrIdx}]`);
  }

  // ── Step 3: Extract authoritative timestamps ────────────────────
  const results = scenes.map((scene, idx) => {
    const match = sceneMatches[idx];
    const wc = sceneScriptWords[idx].length;

    if (!match || match.empty || match.fallback || match.lastAsrIdx < 0) {
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
      startTime: speechStart,
      endTime: speechEnd,
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
  const MAX_PAD = 0.5;

  // 4a: Leading silence
  const firstSpoken = results.find(r => !r.empty && !r.fallback && r.speechStart !== null);
  if (firstSpoken) {
    firstSpoken.startTime = Math.max(0, firstSpoken.speechStart - Math.min(firstSpoken.speechStart, MAX_PAD));
  }

  // 4b: Trailing silence
  const lastSpoken = [...results].reverse().find(r => !r.empty && !r.fallback && r.speechEnd !== null);
  if (lastSpoken) {
    const trailingSilence = totalAudioDuration - lastSpoken.speechEnd;
    lastSpoken.endTime = Math.min(totalAudioDuration, lastSpoken.speechEnd + Math.min(trailingSilence, MAX_PAD));
  }

  // 4c: Gaps between matched scenes
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];

    if (curr.empty || curr.fallback || next.empty || next.fallback) continue;
    if (curr.speechEnd === null || next.speechStart === null) continue;

    const gap = next.speechStart - curr.speechEnd;

    if (gap > 0) {
      const halfGap = gap / 2;
      curr.endTime = curr.speechEnd + Math.min(halfGap, MAX_PAD);
      next.startTime = next.speechStart - Math.min(halfGap, MAX_PAD);

      if (curr.endTime < next.startTime) {
        const mid = (curr.endTime + next.startTime) / 2;
        curr.endTime = mid;
        next.startTime = mid;
      }
    } else {
      const boundary = (curr.speechEnd + next.speechStart) / 2;
      curr.endTime = boundary;
      next.startTime = boundary;
    }
  }

  // 4d: Empty/fallback scenes — slot between neighbors
  const MIN_EMPTY = 0.8;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.empty && !r.fallback) continue;

    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;

    const prevEnd  = (prev  && prev.endTime   !== null && prev.endTime   !== undefined) ? prev.endTime   : null;
    const nextStart = (next && next.startTime !== null && next.startTime !== undefined) ? next.startTime : null;

    if (prevEnd !== null && nextStart !== null) {
      const available = nextStart - prevEnd;
      if (available >= MIN_EMPTY) {
        r.startTime = prevEnd;
        r.endTime = prevEnd + Math.min(MIN_EMPTY, available);
        if (r.endTime > nextStart) next.startTime = r.endTime;
      } else if (available > 0) {
        r.startTime = prevEnd;
        r.endTime = prevEnd + available;
      } else {
        r.startTime = prevEnd;
        r.endTime = prevEnd + 0.3;
      }
    } else if (prevEnd !== null) {
      r.startTime = prevEnd;
      r.endTime = Math.min(prevEnd + MIN_EMPTY, totalAudioDuration);
    } else if (nextStart !== null) {
      r.endTime = nextStart;
      r.startTime = Math.max(0, nextStart - MIN_EMPTY);
    } else {
      r.startTime = 0;
      r.endTime = MIN_EMPTY;
    }
  }

  // 4e: Clamp first/last to audio boundaries
  if (results[0]?.startTime > 0) results[0].startTime = 0;
  const lastResult = results[results.length - 1];
  if (lastResult?.endTime < totalAudioDuration) lastResult.endTime = totalAudioDuration;

  // ── Step 5: Continuity, minimums, rounding, drift detection ────
  const MIN_DURATION = 0.5;

  // Pass 1: close gaps and overlaps
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.endTime === null || next.startTime === null) continue;

    if (next.startTime > curr.endTime + 0.002) {
      curr.endTime = next.startTime;
    } else if (curr.endTime > next.startTime + 0.002) {
      next.startTime = curr.endTime;
    }
  }

  // Pass 2: minimums, rounding, drift detection
  results.forEach((r, i) => {
    if (r.startTime === null || r.endTime === null) return;

    if (r.endTime - r.startTime < MIN_DURATION) {
      r.endTime = r.startTime + MIN_DURATION;
      if (results[i + 1]?.startTime !== null && results[i + 1].startTime < r.endTime) {
        results[i + 1].startTime = r.endTime;
      }
    }

    r.startTime = Math.round(r.startTime * 1000) / 1000;
    r.endTime   = Math.round(r.endTime   * 1000) / 1000;
    r.duration  = Math.round((r.endTime - r.startTime) * 1000) / 1000;

    if (!r.empty && !r.fallback && r.wordCount > 0) {
      const estimatedSpeechTime = Math.max(0.5, r.wordCount * 0.38);
      const isBloated = r.duration > estimatedSpeechTime * 3.0 && r.duration > 8;
      r.driftDetected = isBloated;
      if (isBloated) {
        r.driftInfo = {
          currentDuration: r.duration,
          speechSpan:       Math.round((r.speechEnd - r.speechStart) * 100) / 100,
          wordCount:        r.wordCount,
          suggestedDuration: Math.round(Math.max(0.5, estimatedSpeechTime + 1.0) * 100) / 100,
          deadAir:          Math.round((r.duration - (r.speechEnd - r.speechStart)) * 100) / 100,
        };
      }
    }
  });

  // ── Log final timeline ──────────────────────────────────────────
  console.log(`[ASR Timeline v5] ${results.length} scenes, total: ${totalAudioDuration.toFixed(1)}s`);
  let totalMapped = 0;
  results.forEach(r => {
    if (r.startTime == null || r.endTime == null) return;
    totalMapped += r.duration || 0;
    const speechSpan = r.speechStart != null
      ? `speech ${r.speechStart.toFixed(2)}-${r.speechEnd.toFixed(2)}s`
      : (r.empty ? 'empty' : 'fallback');
    const matchInfo = r.fallback ? '(fallback)' : r.empty ? '(empty)' : `${r.matchedCount}/${r.wordCount}`;
    console.log(`  Scene ${r.sceneNumber}: ${r.startTime.toFixed(2)}s → ${r.endTime.toFixed(2)}s = ${r.duration.toFixed(2)}s | ${speechSpan} | ${matchInfo}`);
  });
  console.log(`  Total mapped: ${totalMapped.toFixed(2)}s / ${totalAudioDuration.toFixed(2)}s`);

  return results;
}

export function applyDriftFix(results, driftedIndices) {
  if (!driftedIndices?.length || !results?.length) return results;

  const fixed = results.map(r => ({ ...r }));
  let totalReclaimed = 0;

  // Shrink bloated scenes
  for (const idx of driftedIndices) {
    const r = fixed[idx];
    if (!r?.driftInfo) continue;

    const newDuration = r.driftInfo.suggestedDuration || Math.max(1.0, (r.speechEnd - r.speechStart) + 0.5);
    const reclaimed = r.duration - newDuration;
    if (reclaimed <= 0) continue;

    r.endTime = r.startTime + newDuration;
    r.duration = newDuration;
    totalReclaimed += reclaimed;
  }

  // Rebuild start times after shrinking
  for (let i = 1; i < fixed.length; i++) {
    const prev = fixed[i - 1];
    if (prev.endTime === null || fixed[i].startTime === null) continue;
    if (fixed[i].startTime !== prev.endTime) {
      fixed[i].startTime = prev.endTime;
      fixed[i].endTime = driftedIndices.includes(i)
        ? fixed[i].endTime + (prev.endTime - fixed[i].startTime)
        : fixed[i].startTime + fixed[i].duration;
    }
  }

  // Recalculate durations and clear drift flags
  fixed.forEach(r => {
    if (r.startTime === null || r.endTime === null) return;
    r.startTime     = Math.round(r.startTime * 1000) / 1000;
    r.endTime       = Math.round(r.endTime   * 1000) / 1000;
    r.duration      = Math.round((r.endTime - r.startTime) * 1000) / 1000;
    r.driftDetected = false;
    r.driftInfo     = undefined;
  });

  console.log(`[DriftFix] Reclaimed ${totalReclaimed.toFixed(2)}s from ${driftedIndices.length} bloated scenes`);
  return fixed;
}