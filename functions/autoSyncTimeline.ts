import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// BEAT SYNC ENGINE v4 — ASR-First Scene Alignment
// ══════════════════════════════════════════════════════════════════
//
// Strategy: Each scene has narration_text (e.g. "While everyone's
// fighting over dropshipping...custom t-shirts"). We use ASR to
// get word-level timestamps from the actual voiceover audio, then
// fuzzy-match each scene's narration_text to find EXACTLY where
// those words are spoken. This gives us frame-accurate scene
// start/end times with zero drift.
//
// Flow:
//   1. Transcribe voiceover → ASR words [{word, start, end}, ...]
//   2. For each scene, match narration_text to ASR word stream
//   3. Scene start = first matched word's start time
//      Scene end   = last matched word's end time
//   4. Close gaps, enforce minimums, snap boundaries
//   5. Generate word-level caption data
//   6. Analyze & apply transitions
//   7. Save everything server-side
// ══════════════════════════════════════════════════════════════════

const MIN_SCENE_DURATION = 1.5;

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';
const ASR_POLL_INTERVAL = 3000;
const ASR_POLL_TIMEOUT = 180000; // 3 min

async function transcribeWithASR(voiceoverUrl) {
  const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
  if (!API_KEY) throw new Error('ASSEMBLYAI_API_KEY not configured');

  const headers = { 'Authorization': API_KEY, 'Content-Type': 'application/json' };

  const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: 'POST', headers,
    body: JSON.stringify({ audio_url: voiceoverUrl, language_detection: true, speech_model: 'universal' }),
  });
  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`AssemblyAI submit failed (${submitRes.status}): ${errText}`);
  }
  const { id: transcriptId } = await submitRes.json();
  console.log(`📡 ASR job submitted: ${transcriptId}`);

  const start = Date.now();
  while (true) {
    if (Date.now() - start > ASR_POLL_TIMEOUT) throw new Error('ASR timed out');
    await new Promise(r => setTimeout(r, ASR_POLL_INTERVAL));
    const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
      headers: { 'Authorization': API_KEY },
    });
    if (!pollRes.ok) continue;
    const result = await pollRes.json();
    if (result.status === 'completed') {
      const words = (result.words || []).map(w => ({
        word: w.text, start: w.start / 1000, end: w.end / 1000,
      }));
      console.log(`✓ ASR complete: ${words.length} words, confidence: ${((result.confidence || 0) * 100).toFixed(0)}%`);
      return words;
    }
    if (result.status === 'error') throw new Error(`ASR failed: ${result.error}`);
    console.log(`⏳ ASR status: ${result.status}...`);
  }
}

// ══════════════════════════════════════════════════════════════════
// ASR WORD MATCHING — find scene narration in the audio word stream
// ══════════════════════════════════════════════════════════════════

function normalize(w) {
  return (w || '').toLowerCase().replace(/[^a-z0-9'']/g, '');
}

function sequenceMatchScore(asrWords, scriptWords, asrStart, scriptLen) {
  if (asrStart + scriptLen > asrWords.length) return 0;
  let matches = 0;
  for (let i = 0; i < scriptLen; i++) {
    const asrNorm = normalize(asrWords[asrStart + i].word);
    const scriptNorm = normalize(scriptWords[i]);
    if (asrNorm === scriptNorm) {
      matches++;
    } else if (asrNorm.length > 2 && scriptNorm.length > 2) {
      if (asrNorm.startsWith(scriptNorm.slice(0, 3)) || scriptNorm.startsWith(asrNorm.slice(0, 3))) {
        matches += 0.5;
      }
    }
  }
  return matches / scriptLen;
}

function findBestMatch(asrWords, scriptWords, expectedStart, searchRadius) {
  const scriptLen = scriptWords.length;
  if (scriptLen === 0) return { start: expectedStart, end: expectedStart, score: 0 };

  const sampleSize = Math.min(scriptLen, 8);
  const sampleScript = scriptWords.slice(0, sampleSize);

  let bestScore = -1;
  let bestStart = expectedStart;

  const lo = Math.max(0, expectedStart - searchRadius);
  const hi = Math.min(asrWords.length - sampleSize, expectedStart + searchRadius);

  for (let i = lo; i <= hi; i++) {
    const score = sequenceMatchScore(asrWords, sampleScript, i, sampleSize);
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  let endIdx = Math.min(bestStart + scriptLen - 1, asrWords.length - 1);

  // Verify tail match for longer scenes
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

function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return null;

  const results = [];
  let asrCursor = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const text = (scene.narration_text || '').trim();
    const scriptWords = text.split(/\s+/).filter(Boolean);

    if (scriptWords.length === 0) {
      results.push({
        scene_id: scene.id, scene_number: scene.scene_number,
        startTime: null, endTime: null, duration: 0,
        asrWordStart: null, asrWordEnd: null, empty: true,
      });
      continue;
    }

    const radius = i === 0
      ? Math.min(asrWords.length, 50)
      : Math.min(80, Math.max(20, scriptWords.length * 2));
    const match = findBestMatch(asrWords, scriptWords, asrCursor, radius);

    const wordStart = asrWords[match.start];
    const wordEnd = asrWords[match.end];

    results.push({
      scene_id: scene.id, scene_number: scene.scene_number,
      startTime: wordStart?.start ?? null,
      endTime: wordEnd?.end ?? null,
      duration: (wordEnd?.end ?? 0) - (wordStart?.start ?? 0),
      asrWordStart: match.start,
      asrWordEnd: match.end,
      matchScore: match.score,
      empty: false,
    });

    asrCursor = match.end + 1;
  }

  // ── Post-processing ──

  // First scene starts at 0
  if (results.length > 0 && results[0].startTime !== null) {
    results[0].startTime = 0;
  }

  // Last scene ends at total duration
  const lastNonEmpty = [...results].reverse().find(r => !r.empty);
  if (lastNonEmpty) lastNonEmpty.endTime = totalAudioDuration;

  // Close gaps between consecutive non-empty scenes
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.empty || next.empty) continue;
    if (curr.endTime === null || next.startTime === null) continue;
    // Visual cuts exactly when next narration starts
    curr.endTime = next.startTime;
  }

  // Handle empty scenes
  for (let i = 0; i < results.length; i++) {
    if (!results[i].empty) continue;
    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;
    const MIN_EMPTY = 1.5;

    if (prev?.endTime !== null && next?.startTime !== null) {
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
    } else if (prev?.endTime !== null) {
      results[i].startTime = prev.endTime;
      results[i].endTime = Math.min(prev.endTime + MIN_EMPTY, totalAudioDuration);
    } else if (next?.startTime !== null) {
      results[i].endTime = next.startTime;
      results[i].startTime = Math.max(0, next.startTime - MIN_EMPTY);
    }
  }

  // Recalculate & round
  results.forEach(r => {
    if (r.startTime !== null && r.endTime !== null) {
      r.startTime = Math.round(r.startTime * 1000) / 1000;
      r.endTime = Math.round(r.endTime * 1000) / 1000;
      r.duration = Math.round((r.endTime - r.startTime) * 1000) / 1000;
    }
  });

  // Enforce minimum duration
  for (let i = 0; i < results.length; i++) {
    if (results[i].duration < MIN_SCENE_DURATION) {
      const deficit = MIN_SCENE_DURATION - results[i].duration;
      if (i < results.length - 1 && results[i + 1].duration > MIN_SCENE_DURATION + deficit) {
        results[i].endTime += deficit;
        results[i + 1].startTime += deficit;
      } else if (i > 0 && results[i - 1].duration > MIN_SCENE_DURATION + deficit) {
        results[i].startTime -= deficit;
        results[i - 1].endTime -= deficit;
      }
      results[i].duration = Math.round((results[i].endTime - results[i].startTime) * 1000) / 1000;
    }
  }

  // Check quality
  const nonEmpty = results.filter(r => !r.empty);
  const avgScore = nonEmpty.length > 0
    ? nonEmpty.reduce((s, r) => s + (r.matchScore || 0), 0) / nonEmpty.length
    : 0;

  // If average match quality is too low, ASR didn't align well
  if (avgScore < 0.3) {
    console.warn(`⚠ ASR alignment quality too low (avg score: ${(avgScore * 100).toFixed(0)}%) — falling back`);
    return null;
  }

  console.log(`✓ ASR alignment: ${results.length} scenes, avg match score: ${(avgScore * 100).toFixed(0)}%`);
  return results;
}


// ══════════════════════════════════════════════════════════════════
// FALLBACK: Character-Position Duration Mapping
// ══════════════════════════════════════════════════════════════════

function computeDurationsFallback(scenes, totalVoDuration) {
  const sceneTexts = scenes.map(s => (s.narration_text || '').trim());
  const totalChars = sceneTexts.reduce((sum, t) => sum + t.length, 0);

  if (totalChars === 0) {
    const perScene = totalVoDuration / scenes.length;
    return scenes.map(s => ({
      scene_id: s.id, scene_number: s.scene_number,
      startTime: 0, endTime: perScene,
      duration: Math.max(MIN_SCENE_DURATION, Math.round(perScene * 10) / 10),
    }));
  }

  const charsPerSecond = totalChars / totalVoDuration;
  let charCursor = 0;
  const results = scenes.map(s => {
    const text = (s.narration_text || '').trim();
    const charStart = charCursor;
    const charEnd = charCursor + text.length;
    charCursor = charEnd + 1;
    const startTime = charStart / charsPerSecond;
    const endTime = charEnd / charsPerSecond;
    return {
      scene_id: s.id, scene_number: s.scene_number,
      startTime, endTime,
      duration: Math.max(MIN_SCENE_DURATION, Math.round((endTime - startTime) * 10) / 10),
    };
  });

  // Fix first/last
  results[0].startTime = 0;
  results[results.length - 1].endTime = totalVoDuration;
  results[results.length - 1].duration = Math.round((totalVoDuration - results[results.length - 1].startTime) * 10) / 10;

  // Normalize
  const rawTotal = results.reduce((sum, r) => sum + r.duration, 0);
  const scale = totalVoDuration / rawTotal;
  results.forEach(r => { r.duration = Math.max(MIN_SCENE_DURATION, Math.round(r.duration * scale * 10) / 10); });

  // Recalculate start times
  let timeAcc = 0;
  results.forEach(r => {
    r.startTime = Math.round(timeAcc * 100) / 100;
    timeAcc += r.duration;
    r.endTime = Math.round(timeAcc * 100) / 100;
  });

  return results;
}


// ══════════════════════════════════════════════════════════════════
// CAPTION DATA — word-level timestamps from ASR or estimation
// ══════════════════════════════════════════════════════════════════

function generateCaptionData(sceneData, asrWords) {
  // If we have ASR words, use them directly (they already have perfect timestamps)
  if (asrWords?.length > 0) {
    return asrWords.map(w => {
      // Find which scene this word belongs to
      let sceneNumber = 1;
      for (const sd of sceneData) {
        if (w.start >= sd.startTime && w.start < sd.endTime) {
          sceneNumber = sd.scene_number;
          break;
        }
      }
      return {
        word: w.word,
        start: Math.round(w.start * 100) / 100,
        end: Math.round(w.end * 100) / 100,
        scene_number: sceneNumber,
      };
    });
  }

  // Fallback: estimate from scene durations
  const captionData = [];
  for (const scene of sceneData) {
    const text = scene.narration_text || '';
    if (!text) continue;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const totalWordChars = words.reduce((sum, w) => sum + w.length, 0);
    let wordTime = scene.startTime;
    for (const word of words) {
      const wordProportion = word.length / totalWordChars;
      const wordDuration = scene.duration * wordProportion;
      captionData.push({
        word, start: Math.round(wordTime * 100) / 100,
        end: Math.round((wordTime + wordDuration) * 100) / 100,
        scene_number: scene.scene_number,
      });
      wordTime += wordDuration;
    }
  }
  return captionData;
}


// ══════════════════════════════════════════════════════════════════
// TRANSITIONS — narrative-aware
// ══════════════════════════════════════════════════════════════════

function analyzeTransitionsRuleBased(sceneData) {
  return sceneData.map((scene, i) => {
    if (i === 0) return { scene_number: scene.scene_number, transition_type: 'fade_from_black', transition_duration: 1.0 };
    if (i === sceneData.length - 1) return { scene_number: scene.scene_number, transition_type: 'fade_to_black', transition_duration: 1.5 };

    const currText = (scene.narration_text || '').toLowerCase();
    const timeJumpCues = ['years later', 'months later', 'the next day', 'meanwhile', 'on the other side'];
    if (timeJumpCues.some(cue => currText.includes(cue))) {
      return { scene_number: scene.scene_number, transition_type: 'fade_to_black', transition_duration: 1.2 };
    }

    const pivotCues = ['but ', 'however', 'on the other hand', 'in contrast', 'nevertheless'];
    const hasPivot = pivotCues.some(cue => currText.startsWith(cue));
    if (hasPivot && i % 3 === 0) {
      return { scene_number: scene.scene_number, transition_type: 'dissolve', transition_duration: 0.7 };
    }

    return { scene_number: scene.scene_number, transition_type: 'cut', transition_duration: 0 };
  });
}


// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const [allScenes, prodSettings] = await Promise.all([
      base44.asServiceRole.entities.Scenes.filter({ project_id }),
      base44.asServiceRole.entities.ProductionSettings.filter({ project_id }),
    ]);

    const scenes = allScenes.sort((a, b) => a.scene_number - b.scene_number);
    if (scenes.length === 0) return Response.json({ error: 'No scenes found' }, { status: 400 });

    const prod = prodSettings[0];
    const totalVoDuration = prod?.total_duration_seconds || 0;
    const voiceoverUrl = prod?.voiceover_url;

    if (!voiceoverUrl || totalVoDuration <= 0) {
      return Response.json({ error: 'No voiceover found. Generate voiceover first.' }, { status: 400 });
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎵 Beat Sync v4 (ASR-first): ${scenes.length} scenes · ${totalVoDuration}s voiceover`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1: Get ASR word-level timestamps from actual audio
    // ═══════════════════════════════════════════════════════════════

    let asrWords = null;
    let sceneData = null;
    let syncMethod = 'char_position';

    try {
      console.log(`🎙 Calling ASR transcription directly...`);
      const words = await transcribeWithASR(voiceoverUrl);

      if (words?.length > 0) {
        asrWords = words;

        // ── Match each scene's narration_text to the ASR word stream ──
        const alignment = alignScenesToASR(asrWords, scenes, totalVoDuration);

        if (alignment) {
          // Merge scene metadata with alignment results
          sceneData = alignment.map(a => {
            const scene = scenes.find(s => s.id === a.scene_id);
            return {
              ...a,
              narration_text: scene?.narration_text || '',
              media_type: classifyMedia(scene),
            };
          });
          syncMethod = 'asr';

          // Log alignment quality per scene
          for (const sd of sceneData) {
            const score = sd.matchScore !== undefined ? `${(sd.matchScore * 100).toFixed(0)}%` : 'N/A';
            console.log(`  S${sd.scene_number}: ${sd.startTime?.toFixed(2)}s → ${sd.endTime?.toFixed(2)}s (${sd.duration?.toFixed(1)}s) match: ${score}`);
          }
        }
      }
    } catch (err) {
      console.warn(`⚠ ASR transcription failed: ${err.message} — falling back to estimation`);
    }

    // ═══════════════════════════════════════════════════════════════
    // FALLBACK: Character-position estimation (if ASR failed)
    // ═══════════════════════════════════════════════════════════════

    if (!sceneData) {
      console.log(`📐 Using character-position fallback`);
      const fallback = computeDurationsFallback(scenes, totalVoDuration);
      sceneData = fallback.map(f => {
        const scene = scenes.find(s => s.id === f.scene_id);
        return {
          ...f,
          narration_text: scene?.narration_text || '',
          media_type: classifyMedia(scene),
        };
      });
    }

    console.log(`✓ Durations computed via ${syncMethod}: ${sceneData.length} scenes`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Caption data (word-level timestamps)
    // ═══════════════════════════════════════════════════════════════

    const captionData = generateCaptionData(sceneData, syncMethod === 'asr' ? asrWords : null);
    console.log(`✓ Captions: ${captionData.length} words timestamped (source: ${syncMethod})`);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3: Transitions
    // ═══════════════════════════════════════════════════════════════

    const transitions = analyzeTransitionsRuleBased(sceneData);

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4: Apply all updates server-side
    // ═══════════════════════════════════════════════════════════════

    console.log(`📝 Applying ${sceneData.length} scene updates...`);
    let applied = 0;
    let failed = 0;

    for (let i = 0; i < sceneData.length; i++) {
      const sd = sceneData[i];
      const tr = transitions.find(t => t.scene_number === sd.scene_number) || {};

      const payload = {
        duration_seconds: sd.duration,
        start_time: sd.startTime,
      };
      if (tr.transition_type) {
        payload.transition_type = tr.transition_type;
        payload.transition_duration = tr.transition_duration || 0;
      }

      let ok = false;
      for (let a = 0; a < 3; a++) {
        try {
          await base44.asServiceRole.entities.Scenes.update(sd.scene_id, payload);
          ok = true;
          break;
        } catch (_) {
          if (a < 2) await new Promise(r => setTimeout(r, 500 * (a + 1)));
        }
      }
      if (ok) applied++; else failed++;
    }

    // Save beat data + caption data
    const beatDurations = sceneData.map(s => s.duration);
    const beatStartTimes = sceneData.map(s => s.startTime);

    try {
      await base44.asServiceRole.entities.ProductionSettings.update(prod.id, {
        caption_data: JSON.stringify(captionData),
        beat_durations: JSON.stringify(beatDurations),
        beat_start_times: JSON.stringify(beatStartTimes),
      });
      console.log(`✓ Caption data + beat data saved`);
    } catch (err) {
      console.warn(`⚠ Save failed: ${err.message}`);
    }

    const stats = {
      total_scenes: sceneData.length,
      total_duration: totalVoDuration,
      caption_words: captionData.length,
      cuts: transitions.filter(t => t.transition_type === 'cut').length,
      dissolves: transitions.filter(t => t.transition_type === 'dissolve').length,
      fades: transitions.filter(t => t.transition_type.includes('fade')).length,
    };

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Complete (${syncMethod}): ${applied} scenes · ${stats.caption_words} caption words`);

    return Response.json({
      success: true,
      apply_mode: 'server',
      sync_method: syncMethod,
      applied,
      failed,
      total_duration: totalVoDuration,
      stats,
    });

  } catch (error) {
    console.error('autoSyncTimeline error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function classifyMedia(scene) {
  if (!scene) return 'none';
  const hasVideo = scene.video_url?.startsWith('http') && !scene.video_url?.startsWith('http://placeholder');
  const hasImage = scene.image_url?.startsWith('http');
  if (hasVideo) return 'video';
  if (hasImage) return 'image';
  return 'none';
}