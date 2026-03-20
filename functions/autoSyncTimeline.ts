import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// BEAT SYNC ENGINE v2 — Character-Position Beat Alignment
// ══════════════════════════════════════════════════════════════════
//
// Instead of word-count proportional math, this maps each scene's
// narration to exact time positions using character-position ratios.
// Scene boundaries snap to sentence endings so cuts never happen
// mid-sentence.
//
// Also generates caption_data (word-level timestamps) for the
// caption overlay system.
//
// ONE backend call:
//   1. Build full script from all scenes
//   2. Map each scene's char position → time position
//   3. Snap boundaries to sentence ends
//   4. Generate word-level timestamps for captions
//   5. Analyze transitions (narrative cues)
//   6. Enforce transition rules
//   7. Apply all updates server-side
// ══════════════════════════════════════════════════════════════════

const MAX_VIDEO_DURATION = 6.0;
const MIN_SCENE_DURATION = 3.0;

// ══════════════════════════════════════════════════════════════════
// ASR ALIGNMENT — Match scenes to real word timestamps
// ══════════════════════════════════════════════════════════════════

function normalizeWord(w) {
  return (w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function alignScenesASR(scenes, asrWords, totalDuration) {
  let asrCursor = 0;

  const results = scenes.map((scene, i) => {
    const text = (scene.narration_text || '').trim();
    const scriptWords = text.split(/\s+/).filter(Boolean);
    const media = classifyMedia(scene);

    if (scriptWords.length === 0) {
      return {
        scene_id: scene.id, scene_number: scene.scene_number,
        duration_seconds: 0, time_start: 0, time_end: 0,
        narration_text: '', media_type: media, video_hold: false,
        video_play_seconds: 0, empty: true, matchScore: 0,
      };
    }

    // Find best start position using first few words
    const sampleSize = Math.min(scriptWords.length, 6);
    const sampleWords = scriptWords.slice(0, sampleSize);
    const radius = i === 0 ? Math.min(asrWords.length, 50) : Math.min(80, Math.max(20, scriptWords.length * 2));
    const lo = Math.max(0, asrCursor - radius);
    const hi = Math.min(asrWords.length - sampleSize, asrCursor + radius);

    let bestScore = -1;
    let bestStart = asrCursor;
    for (let j = lo; j <= hi; j++) {
      let matches = 0;
      for (let k = 0; k < sampleSize; k++) {
        if (j + k >= asrWords.length) break;
        const aw = normalizeWord(asrWords[j + k].word);
        const sw = normalizeWord(sampleWords[k]);
        if (aw === sw) matches++;
        else if (aw.length > 2 && sw.length > 2 && (aw.startsWith(sw.slice(0, 3)) || sw.startsWith(aw.slice(0, 3)))) matches += 0.5;
      }
      const score = matches / sampleSize;
      if (score > bestScore) { bestScore = score; bestStart = j; }
    }

    let endIdx = Math.min(bestStart + scriptWords.length - 1, asrWords.length - 1);

    // Verify end with tail words
    if (scriptWords.length > 6) {
      const tailWords = scriptWords.slice(-4);
      let bestTailScore = -1;
      let bestTailPos = endIdx - 3;
      const tLo = Math.max(bestStart + scriptWords.length - 20, bestStart);
      const tHi = Math.min(bestStart + scriptWords.length + 20, asrWords.length - 4);
      for (let j = tLo; j <= tHi; j++) {
        let matches = 0;
        for (let k = 0; k < 4; k++) {
          if (j + k >= asrWords.length) break;
          if (normalizeWord(asrWords[j + k].word) === normalizeWord(tailWords[k])) matches++;
        }
        if (matches > bestTailScore) { bestTailScore = matches; bestTailPos = j; }
      }
      endIdx = Math.min(bestTailPos + 3, asrWords.length - 1);
    }

    const startTime = asrWords[bestStart]?.start ?? 0;
    const endTime = asrWords[endIdx]?.end ?? startTime;
    asrCursor = endIdx + 1;

    return {
      scene_id: scene.id, scene_number: scene.scene_number,
      duration_seconds: Math.round((endTime - startTime) * 100) / 100,
      time_start: Math.round(startTime * 100) / 100,
      time_end: Math.round(endTime * 100) / 100,
      narration_text: text, media_type: media, matchScore: bestScore,
      video_hold: false, video_play_seconds: 0, empty: false,
    };
  });

  // Post-process: first starts at 0, last ends at totalDuration
  if (results.length > 0 && !results[0].empty) results[0].time_start = 0;
  const lastNonEmpty = [...results].reverse().find(r => !r.empty);
  if (lastNonEmpty) lastNonEmpty.time_end = totalDuration;

  // Fill gaps between consecutive scenes
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.empty || next.empty) continue;
    if (next.time_start > curr.time_end) {
      const mid = (curr.time_end + next.time_start) / 2;
      curr.time_end = mid;
      next.time_start = mid;
    } else if (next.time_start < curr.time_end) {
      const mid = (curr.time_end + next.time_start) / 2;
      curr.time_end = mid;
      next.time_start = mid;
    }
  }

  // Handle empty scenes
  for (let i = 0; i < results.length; i++) {
    if (!results[i].empty) continue;
    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;
    if (prev && next && !next.empty) {
      results[i].time_start = prev.time_end;
      results[i].time_end = Math.min(prev.time_end + 1.5, next.time_start);
    } else if (prev) {
      results[i].time_start = prev.time_end;
      results[i].time_end = Math.min(prev.time_end + 1.5, totalDuration);
    }
  }

  // Recalculate durations and add video hold info
  results.forEach(r => {
    r.time_start = Math.round(Math.max(0, r.time_start) * 100) / 100;
    r.time_end = Math.round(Math.min(totalDuration, r.time_end) * 100) / 100;
    r.duration_seconds = Math.round((r.time_end - r.time_start) * 100) / 100;
    r.video_hold = (r.media_type === 'video' && r.duration_seconds > MAX_VIDEO_DURATION);
    r.video_play_seconds = r.video_hold ? MAX_VIDEO_DURATION : (r.media_type === 'video' ? Math.min(r.duration_seconds, MAX_VIDEO_DURATION) : r.duration_seconds);
  });

  return results;
}

// ══════════════════════════════════════════════════════════════════
// FALLBACK: Character-Position Duration Mapping
// ══════════════════════════════════════════════════════════════════

function computeDurations(scenes, totalVoDuration) {
  // Step 1: Build the full concatenated script
  const sceneTexts = scenes.map(s => (s.narration_text || '').trim());
  const fullScript = sceneTexts.join(' ');
  const totalChars = fullScript.length;

  if (totalChars === 0) {
    const perScene = totalVoDuration / scenes.length;
    return scenes.map(s => ({
      scene_id: s.id,
      scene_number: s.scene_number,
      duration_seconds: Math.max(MIN_SCENE_DURATION, Math.round(perScene * 10) / 10),
      char_start: 0,
      char_end: 0,
      time_start: 0,
      time_end: perScene,
      narration_text: '',
      media_type: classifyMedia(s),
      video_hold: false,
      video_play_seconds: 0,
    }));
  }

  // Step 2: Find each scene's character start/end in the full script
  let charCursor = 0;
  const sceneData = scenes.map((s, i) => {
    const text = sceneTexts[i];
    const charStart = charCursor;
    const charEnd = charCursor + text.length;
    charCursor = charEnd + 1; // +1 for the space between scenes

    return {
      scene_id: s.id,
      scene_number: s.scene_number,
      narration_text: text,
      char_start: charStart,
      char_end: charEnd,
      media_type: classifyMedia(s),
    };
  });

  // Step 3: Map character positions → time positions
  const charsPerSecond = totalChars / totalVoDuration;

  sceneData.forEach(s => {
    s.time_start_raw = s.char_start / charsPerSecond;
    s.time_end_raw = s.char_end / charsPerSecond;
    s.duration_raw = s.time_end_raw - s.time_start_raw;
  });

  // Step 4: Snap scene boundaries to sentence endings
  const sentenceEnds = [];
  for (let i = 0; i < fullScript.length; i++) {
    if ((fullScript[i] === '.' || fullScript[i] === '!' || fullScript[i] === '?') &&
        (i === fullScript.length - 1 || fullScript[i + 1] === ' ' || fullScript[i + 1] === '"')) {
      sentenceEnds.push(i);
    }
  }

  for (let i = 0; i < sceneData.length - 1; i++) {
    const boundaryChar = sceneData[i].char_end;
    let bestEnd = boundaryChar;
    let bestDist = Infinity;
    for (const se of sentenceEnds) {
      const dist = Math.abs(se - boundaryChar);
      if (dist < bestDist && dist < 200) {
        bestDist = dist;
        bestEnd = se + 1;
      }
    }

    if (bestEnd !== boundaryChar) {
      sceneData[i].char_end = bestEnd;
      if (i + 1 < sceneData.length) {
        sceneData[i + 1].char_start = bestEnd + 1;
      }
    }
  }

  // Step 5: Recalculate times after snapping
  sceneData.forEach(s => {
    s.time_start = Math.max(0, s.char_start / charsPerSecond);
    s.time_end = Math.min(totalVoDuration, s.char_end / charsPerSecond);
    s.duration_seconds = Math.round((s.time_end - s.time_start) * 10) / 10;
  });

  sceneData[0].time_start = 0;
  sceneData[sceneData.length - 1].time_end = totalVoDuration;
  sceneData[sceneData.length - 1].duration_seconds =
    Math.round((totalVoDuration - sceneData[sceneData.length - 1].time_start) * 10) / 10;

  // Step 6: Enforce minimum 3s per scene
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < sceneData.length; i++) {
      if (sceneData[i].duration_seconds < MIN_SCENE_DURATION) {
        const deficit = MIN_SCENE_DURATION - sceneData[i].duration_seconds;
        sceneData[i].duration_seconds = MIN_SCENE_DURATION;
        const neighbors = [];
        if (i > 0) neighbors.push(i - 1);
        if (i < sceneData.length - 1) neighbors.push(i + 1);
        const longestNeighbor = neighbors.reduce((best, idx) =>
          sceneData[idx].duration_seconds > sceneData[best].duration_seconds ? idx : best,
          neighbors[0]
        );
        sceneData[longestNeighbor].duration_seconds =
          Math.max(MIN_SCENE_DURATION, sceneData[longestNeighbor].duration_seconds - deficit);
      }
    }
  }

  // Step 7: Normalize to exact total
  const rawTotal = sceneData.reduce((sum, s) => sum + s.duration_seconds, 0);
  const scale = totalVoDuration / rawTotal;
  sceneData.forEach(s => {
    s.duration_seconds = Math.max(MIN_SCENE_DURATION, Math.round(s.duration_seconds * scale * 10) / 10);
  });

  const adjustedTotal = sceneData.reduce((sum, s) => sum + s.duration_seconds, 0);
  const diff = Math.round((totalVoDuration - adjustedTotal) * 10) / 10;
  if (Math.abs(diff) > 0.05) {
    const longestIdx = sceneData.reduce((mi, s, i, arr) =>
      s.duration_seconds > arr[mi].duration_seconds ? i : mi, 0);
    sceneData[longestIdx].duration_seconds =
      Math.max(MIN_SCENE_DURATION, Math.round((sceneData[longestIdx].duration_seconds + diff) * 10) / 10);
  }

  // Step 8: Recalculate start times sequentially
  let timeAcc = 0;
  sceneData.forEach(s => {
    s.time_start = Math.round(timeAcc * 100) / 100;
    timeAcc += s.duration_seconds;
    s.time_end = Math.round(timeAcc * 100) / 100;
  });

  // Step 9: Video hold detection
  sceneData.forEach(s => {
    s.video_hold = (s.media_type === 'video' && s.duration_seconds > MAX_VIDEO_DURATION);
    s.video_play_seconds = s.video_hold
      ? MAX_VIDEO_DURATION
      : (s.media_type === 'video' ? Math.min(s.duration_seconds, MAX_VIDEO_DURATION) : s.duration_seconds);
  });

  return sceneData;
}

function classifyMedia(scene) {
  const hasVideo = scene.video_url && scene.video_url.startsWith('http') &&
    !scene.video_url.startsWith('http://placeholder');
  const hasImage = scene.image_url && scene.image_url.startsWith('http');
  if (hasVideo) return 'video';
  if (hasImage) return 'image';
  return 'none';
}


// ══════════════════════════════════════════════════════════════════
// PHASE 2: Generate Word-Level Timestamps (Caption Data)
// ══════════════════════════════════════════════════════════════════

function generateCaptionData(sceneData) {
  const captionData = [];

  for (const scene of sceneData) {
    const text = scene.narration_text || '';
    if (!text) continue;

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const sceneDuration = scene.duration_seconds;
    const sceneStart = scene.time_start;
    const totalWordChars = words.reduce((sum, w) => sum + w.length, 0);

    let wordTime = sceneStart;
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordProportion = word.length / totalWordChars;
      const wordDuration = sceneDuration * wordProportion;

      captionData.push({
        word: word,
        start: Math.round(wordTime * 100) / 100,
        end: Math.round((wordTime + wordDuration) * 100) / 100,
        scene_number: scene.scene_number,
      });

      wordTime += wordDuration;
    }
  }

  return captionData;
}


// ══════════════════════════════════════════════════════════════════
// PHASE 3: Narrative-Aware Transitions
// ══════════════════════════════════════════════════════════════════

async function analyzeTransitions(sceneData, openaiKey) {
  if (sceneData.length <= 50 && openaiKey) {
    try {
      return await analyzeTransitionsLLM(sceneData, openaiKey);
    } catch (err) {
      console.warn(`LLM transition analysis failed: ${err.message} — using rules`);
    }
  }
  return analyzeTransitionsRuleBased(sceneData);
}

async function analyzeTransitionsLLM(sceneData, openaiKey) {
  const summaries = sceneData.map(s => {
    const words = (s.narration_text || '').split(/\s+/);
    const first = words.slice(0, 15).join(' ');
    const last = words.length > 20 ? '...' + words.slice(-10).join(' ') : '';
    return `S${s.scene_number} [${s.duration_seconds}s]: "${first}${last}"`;
  }).join('\n');

  const prompt = `You are a professional film editor. Analyze scene transitions for a video.

SCENES:
${summaries}

For each scene, decide the transition INTO it.
Rules:
- "cut" (0s): default, 70-80% of all transitions. Same topic continuation.
- "dissolve" (0.7s): mood/topic shift, time passing, perspective change.
- "fade_to_black" (1.2s): major act break. MAX 3 total.
- "fade_from_black" (1.0s): scene 1 ONLY.

Return JSON: {"transitions":[{"scene_number":1,"transition":"fade_from_black","duration":1.0,"reason":"Opening"}]}

CRITICAL: 70%+ must be "cut". Only cut/dissolve/fade_to_black/fade_from_black allowed.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a professional film editor. Always respond in valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  let parsed;
  try { parsed = JSON.parse(text); } catch (_) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) parsed = JSON.parse(fenced[1]);
    else throw new Error('JSON parse failed');
  }

  const transitions = Array.isArray(parsed) ? parsed : (parsed.transitions || []);
  if (transitions.length < sceneData.length * 0.5) {
    throw new Error(`Only got ${transitions.length} transitions`);
  }

  return transitions.map((t, i) => ({
    scene_number: t.scene_number || sceneData[i]?.scene_number || i + 1,
    transition_type: (t.transition || t.type || 'cut').toLowerCase().replace(/\s+/g, '_'),
    transition_duration: parseFloat(t.duration || t.transition_duration || 0) || 0,
    reason: t.reason || '',
  }));
}

function analyzeTransitionsRuleBased(sceneData) {
  return sceneData.map((scene, i) => {
    if (i === 0) return { scene_number: scene.scene_number, transition_type: 'fade_from_black', transition_duration: 1.0, reason: 'Opening' };
    if (i === sceneData.length - 1) return { scene_number: scene.scene_number, transition_type: 'fade_to_black', transition_duration: 1.5, reason: 'Closing' };

    const currText = (scene.narration_text || '').toLowerCase();
    const prevText = (sceneData[i - 1].narration_text || '').toLowerCase();

    const timeJumpCues = ['years later', 'months later', 'the next day', 'meanwhile', 'on the other side', 'across the world'];
    if (timeJumpCues.some(cue => currText.startsWith(cue) || currText.includes(cue))) {
      return { scene_number: scene.scene_number, transition_type: 'fade_to_black', transition_duration: 1.2, reason: 'Time jump' };
    }

    const pivotCues = ['but ', 'however', 'on the other hand', 'in contrast', 'nevertheless', 'yet ', 'instead'];
    const hasPivot = pivotCues.some(cue => currText.startsWith(cue));
    const prevWords = new Set(prevText.split(/\s+/).filter(w => w.length > 4));
    const currWords = new Set(currText.split(/\s+/).filter(w => w.length > 4));
    const overlap = [...currWords].filter(w => prevWords.has(w)).length;
    const sim = overlap / Math.max(currWords.size, 1);

    if ((sim < 0.03 || hasPivot) && i % 3 === 0) {
      return { scene_number: scene.scene_number, transition_type: 'dissolve', transition_duration: 0.7, reason: hasPivot ? 'Pivot' : 'Topic shift' };
    }

    return { scene_number: scene.scene_number, transition_type: 'cut', transition_duration: 0, reason: 'Flow' };
  });
}


// ══════════════════════════════════════════════════════════════════
// PHASE 4: Rules Engine
// ══════════════════════════════════════════════════════════════════

function enforceRules(transitions, sceneData) {
  const VALID = ['cut', 'dissolve', 'fade_to_black', 'fade_from_black'];
  const DUR = { cut: 0, dissolve: 0.7, fade_to_black: 1.2, fade_from_black: 1.0 };

  transitions = transitions.map(t => {
    let type = (t.transition_type || 'cut').toLowerCase().replace(/\s+/g, '_');
    if (['wipe', 'slide', 'zoom', 'spin', 'flip'].includes(type)) type = 'cut';
    if (type === 'fade') type = 'dissolve';
    if (!VALID.includes(type)) type = 'cut';
    let dur = parseFloat(t.transition_duration || DUR[type]) || 0;
    if (type === 'cut') dur = 0;
    return { ...t, transition_type: type, transition_duration: Math.round(dur * 10) / 10 };
  });

  if (transitions.length > 0) { transitions[0].transition_type = 'fade_from_black'; transitions[0].transition_duration = 1.0; }
  if (transitions.length > 1) { transitions[transitions.length - 1].transition_type = 'fade_to_black'; transitions[transitions.length - 1].transition_duration = 1.5; }

  transitions.forEach((t, i) => {
    if (i === 0 || i === transitions.length - 1) return;
    const scene = sceneData.find(s => s.scene_number === t.scene_number);
    if (scene && scene.duration_seconds < 4 && t.transition_type !== 'cut') {
      t.transition_type = 'cut'; t.transition_duration = 0;
    }
  });

  let fc = 0;
  for (let i = 1; i < transitions.length - 1; i++) {
    if (transitions[i].transition_type === 'fade_to_black') { fc++; if (fc > 3) { transitions[i].transition_type = 'dissolve'; transitions[i].transition_duration = 0.8; } }
  }

  let cc = 0;
  for (let i = 1; i < transitions.length - 1; i++) {
    if (transitions[i].transition_type === 'dissolve') { cc++; if (cc > 2) { transitions[i].transition_type = 'cut'; transitions[i].transition_duration = 0; cc = 0; } } else { cc = 0; }
  }

  const mid = transitions.slice(1, -1);
  const nc = mid.filter(t => t.transition_type !== 'cut').length;
  const mx = Math.floor(mid.length * 0.30);
  if (nc > mx) {
    let ex = nc - mx;
    for (let i = transitions.length - 2; i >= 1 && ex > 0; i--) {
      if (transitions[i].transition_type === 'dissolve') { transitions[i].transition_type = 'cut'; transitions[i].transition_duration = 0; ex--; }
    }
  }

  return transitions;
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

    const openaiKey = Deno.env.get('OPENAI_API_KEY');

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
    console.log(`🎵 Beat Sync v3 (ASR-first): ${scenes.length} scenes · ${totalVoDuration}s voiceover`);

    // PHASE 1: Try ASR-based alignment, fall back to character-position
    let sceneData;
    let usedASR = false;

    const assemblyKey = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (assemblyKey && voiceoverUrl) {
      try {
        console.log(`🎙 Requesting ASR transcription...`);
        const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
          method: 'POST',
          headers: { 'Authorization': assemblyKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_url: voiceoverUrl, speech_models: ['universal-3-pro'], language_detection: true }),
        });
        if (!submitRes.ok) throw new Error(`ASR submit ${submitRes.status}`);
        const { id: txId } = await submitRes.json();

        // Poll for completion (max 4 min)
        let asrWords = null;
        for (let poll = 0; poll < 80; poll++) {
          await new Promise(r => setTimeout(r, 3000));
          const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${txId}`, {
            headers: { 'Authorization': assemblyKey },
          });
          if (!pollRes.ok) continue;
          const result = await pollRes.json();
          if (result.status === 'completed') {
            asrWords = (result.words || []).map(w => ({ word: w.text, start: w.start / 1000, end: w.end / 1000 }));
            console.log(`✓ ASR complete: ${asrWords.length} words`);
            break;
          }
          if (result.status === 'error') throw new Error(result.error || 'ASR failed');
        }

        if (asrWords && asrWords.length > 0) {
          // Match scenes to ASR words
          sceneData = alignScenesASR(scenes, asrWords, totalVoDuration);
          usedASR = true;
          console.log(`✓ ASR alignment applied: ${sceneData.length} scenes`);
        }
      } catch (asrErr) {
        console.warn(`⚠ ASR failed (falling back to char-position): ${asrErr.message}`);
      }
    }

    if (!sceneData) {
      sceneData = computeDurations(scenes, totalVoDuration);
    }
    console.log(`✓ Durations (${usedASR ? 'ASR' : 'char-position'}): ${sceneData.filter(s => s.media_type === 'video').length} video · ${sceneData.filter(s => s.media_type === 'image').length} image · ${sceneData.filter(s => s.video_hold).length} holds`);

    // PHASE 2: Caption data
    const captionData = generateCaptionData(sceneData);
    console.log(`✓ Captions: ${captionData.length} words timestamped`);

    // PHASE 3: Transitions
    let transitions = await analyzeTransitions(sceneData, openaiKey);
    transitions = enforceRules(transitions, sceneData);

    // PHASE 4: Apply server-side
    console.log(`📝 Applying ${sceneData.length} scene updates...`);
    let applied = 0;
    let failed = 0;

    for (let i = 0; i < sceneData.length; i++) {
      const sd = sceneData[i];
      const tr = transitions.find(t => t.scene_number === sd.scene_number) || {};

      const payload = {
        duration_seconds: sd.duration_seconds,
        start_time: sd.time_start,
      };
      if (tr.transition_type) {
        payload.transition_type = tr.transition_type;
        payload.transition_duration = tr.transition_duration || 0;
      }
      if (sd.video_hold) {
        payload.video_hold = true;
        payload.video_play_seconds = sd.video_play_seconds;
      }

      let ok = false;
      for (let a = 0; a < 5; a++) {
        try {
          await base44.asServiceRole.entities.Scenes.update(sd.scene_id, payload);
          ok = true;
          break;
        } catch (_) {
          if (a < 4) await new Promise(r => setTimeout(r, 500 * (a + 1)));
        }
      }
      if (ok) applied++; else failed++;
      if ((i + 1) % 50 === 0 || i === sceneData.length - 1) console.log(`  ${applied}/${sceneData.length} done · ${failed} failed`);
    }

    // Save caption data
    try {
      await base44.asServiceRole.entities.ProductionSettings.update(prod.id, {
        caption_data: JSON.stringify(captionData),
      });
      console.log(`✓ Caption data saved`);
    } catch (err) {
      console.warn(`⚠ Caption save failed: ${err.message}`);
    }

    const stats = {
      total_scenes: sceneData.length,
      total_duration: totalVoDuration,
      video_scenes: sceneData.filter(s => s.media_type === 'video').length,
      image_scenes: sceneData.filter(s => s.media_type === 'image').length,
      video_holds: sceneData.filter(s => s.video_hold).length,
      cuts: transitions.filter(t => t.transition_type === 'cut').length,
      dissolves: transitions.filter(t => t.transition_type === 'dissolve').length,
      fades: transitions.filter(t => t.transition_type.includes('fade')).length,
      caption_words: captionData.length,
    };

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Complete: ${applied} scenes · ${stats.cuts} cuts · ${stats.dissolves} dissolves · ${stats.fades} fades`);

    return Response.json({ success: true, apply_mode: 'server', sync_method: usedASR ? 'asr' : 'char_position', applied, failed, total_duration: totalVoDuration, stats });

  } catch (error) {
    console.error('autoSyncTimeline error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});