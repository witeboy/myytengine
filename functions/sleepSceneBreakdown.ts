import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// SLEEP SCENE BREAKDOWN ENGINE
// Purpose-built for sleep meditations & sleep stories.
// - Longer scenes that progressively grow (variable pacing)
// - Gentle, atmospheric visual concepts
// - No tension, no drama, no conflict in visual direction
// - Moody/dark nature + abstract ambient visuals
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.5) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 16384, responseMimeType: "application/json" }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");
  const rawText = data.candidates[0].content.parts[0].text;

  try { return JSON.parse(rawText); } catch (_) {}

  // Recovery
  const lastBrace = rawText.lastIndexOf('}');
  if (lastBrace === -1) throw new Error("Cannot recover JSON from Gemini response");
  const trimmed = rawText.substring(0, lastBrace + 1);
  for (const suffix of [']}', '}]}', '']) {
    try {
      const parsed = JSON.parse(trimmed + suffix);
      if (parsed.scenes && Array.isArray(parsed.scenes)) return parsed;
      if (parsed.story_analysis) return parsed;
    } catch (_) {}
  }
  throw new Error("Failed to parse Gemini JSON after recovery");
}

function cleanNarrationText(text) {
  if (!text) return text;
  let cleaned = text;
  // Keep [PAUSE X SEC] and [BREATHE] markers for sleep content — they're part of the narration
  cleaned = cleaned.replace(/\[[^\]]*\]/gi, (match) => {
    if (/PAUSE|BREATHE/i.test(match)) return match;
    return '';
  });
  cleaned = cleaned.replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '');
  cleaned = cleaned.replace(/^[A-Z\s]+\(V\.?O\.?\)\s*:?\s*/gim, '');
  cleaned = cleaned.replace(/\*\*[^*]+\*\*:?\s*/g, '');
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');
  cleaned = cleaned.replace(/\n{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

// ══════════════════════════════════════════════════════════════════
// SLEEP-SPECIFIC PROGRESSIVE BEAT CALCULATOR
// Start medium (~8s), gradually extend to 15-25s+ as content deepens
// ══════════════════════════════════════════════════════════════════

function calculateSleepBeatDurations(totalScenes, durationMinutes) {
  const totalSeconds = durationMinutes * 60;
  const durations = [];

  for (let i = 0; i < totalScenes; i++) {
    const progress = i / (totalScenes - 1 || 1); // 0 → 1
    // Start at ~8s, ramp to ~20s by the end
    const baseDuration = 8 + progress * 14;
    // Add slight variance
    const variance = (Math.sin(i * 1.7) * 0.1 + 1) * baseDuration;
    durations.push(Math.round(Math.max(6, Math.min(30, variance)) * 10) / 10);
  }

  // Scale to fit total duration
  const sumRaw = durations.reduce((a, b) => a + b, 0);
  const scale = totalSeconds / sumRaw;
  return durations.map(d => Math.round(d * scale * 10) / 10);
}

function calculateStartTimes(durations) {
  const starts = [];
  let offset = 0;
  for (const d of durations) {
    starts.push(offset);
    offset += d;
  }
  return starts;
}

// ══════════════════════════════════════════════════════════════════
// SLEEP SCENE BREAKDOWN PROMPT
// ══════════════════════════════════════════════════════════════════

function buildSleepBreakdownPrompt({ scriptText, sceneCount, sceneStart, beatDurations, isMeditation, topicTitle }) {
  return `You are a visual director for sleep and relaxation content. Your job is to break a narration script into gentle visual scenes for a ${isMeditation ? 'guided meditation' : 'bedtime story'} video.

**TOPIC**: "${topicTitle}"

**VISUAL DIRECTION FOR SLEEP CONTENT:**
- Every scene must be CALMING, DARK, and ATMOSPHERIC
- Color palette: deep blues, midnight purples, dark teals, warm amber accents, moonlight silver, soft gold
- Lighting: always low and gentle — moonlight, candlelight, firelight, starlight, dawn glow, bioluminescence
- NO bright daylight, NO harsh lighting, NO high contrast
- Environments: dark forests, moonlit oceans, starlit meadows, cozy cabins at night, misty mountains at dusk, rain-soaked gardens, aurora skies, underwater coral, firelit caves
- Camera movements: extremely slow — glacial pans, imperceptible zoom-outs, drifting dolly
- NO sudden movements, NO dramatic angles, NO tension-building shots
- Each scene should feel like it could be a still painting that barely breathes
- Progressive deepening: scenes get SLOWER, DARKER, and MORE ABSTRACT as the video progresses

**PACING RULE — VARIABLE PROGRESSIVE:**
- Early scenes (first 20%): ~${beatDurations[0]?.toFixed(1) || '8'}s — establishing, still relatively active visuals
- Middle scenes (20-60%): gradually longer — nature contemplation, ambient movement
- Late scenes (60-100%): longest — near-static, abstract, hypnotic, barely moving

**SCRIPT TO BREAK DOWN:**
${scriptText}

**YOUR TASK**: Create exactly ${sceneCount} scenes starting from scene number ${sceneStart}.

**RESPONSE FORMAT:**
{
  "scenes": [
    {
      "scene_number": ${sceneStart},
      "narration_text": "EXACT words from the script (include [PAUSE X SEC] and [BREATHE] markers)",
      "visual_concept": "2-3 sentences describing a DARK, ATMOSPHERIC scene. Environment first, then any gentle movement.",
      "shot_type": "e.g. EWS — Extreme Wide Shot, WS — Wide Shot, MS — Medium Shot",
      "camera_movement": "e.g. imperceptible slow zoom out over 15 seconds",
      "lighting": "e.g. soft moonlight from upper left, faint bioluminescent glow",
      "color_palette": "e.g. deep midnight blue #0a1628, soft amber #d4a574, silver moonlight #c0c8d4",
      "mood": "2-3 words — e.g. serene stillness, deep peace, gentle wonder",
      "emotional_intensity": 0.2,
      "duration_seconds": ${beatDurations[0]?.toFixed(1) || '10'},
      "sleep_visual_type": "nature_dark|nature_twilight|abstract_ambient|water|sky|fire_warmth|mist_fog|cozy_interior"
    }
  ]
}

**RULES:**
1. Generate EXACTLY ${sceneCount} scenes
2. Narration text must use EXACT words from the script — distribute evenly
3. Visual concepts must be DARK and ATMOSPHERIC — no bright scenes
4. Camera movement must be EXTREMELY SLOW — viewers should barely notice
5. Emotional intensity should stay between 0.1 and 0.3 (never higher)
6. Each scene must tag its sleep_visual_type for B-roll matching
7. Progressive deepening: scenes get calmer, darker, more abstract toward the end
8. Duration per scene: [${beatDurations.map(d => d.toFixed(1)).join(', ')}] seconds
9. NO conflict, tension, surprise, or excitement in visual concepts
10. Include nature and abstract elements: rain, stars, ocean, candles, fog, aurora, fireflies`;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const callStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, batch_index } = await req.json();
    const startBatch = batch_index || 0;

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found.' }, { status: 400 });
    }

    const isMeditation = project.project_mode === 'sleep_meditation';
    const finalScript = script.full_script;
    const wordCount = finalScript.split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);

    // Sleep content: fewer scenes, longer durations
    // ~1 scene per 15-20 seconds for sleep (vs ~5-7s for standard)
    const avgSceneDuration = 12 + (durationMinutes / 10); // 12s base, scales up
    const totalTargetScenes = Math.max(6, Math.round((durationMinutes * 60) / avgSceneDuration));

    const beatDurations = calculateSleepBeatDurations(totalTargetScenes, durationMinutes);
    const beatStartTimes = calculateStartTimes(beatDurations);

    console.log(`🌙 Sleep breakdown: ${durationMinutes}min → ${totalTargetScenes} scenes (avg ${avgSceneDuration.toFixed(1)}s) | mode: ${project.project_mode}`);
    console.log(`📊 Beat range: ${Math.min(...beatDurations).toFixed(1)}s – ${Math.max(...beatDurations).toFixed(1)}s`);

    if (startBatch === 0) {
      // Delete old scenes
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      if (oldScenes.length > 0) {
        for (let i = 0; i < oldScenes.length; i += 10) {
          await Promise.all(oldScenes.slice(i, i + 10).map(s =>
            base44.asServiceRole.entities.Scenes.delete(s.id).catch(_ => {})
          ));
        }
        console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
      }

      // Save beat data to ProductionSettings
      const psPayload = {
        beat_durations: JSON.stringify(beatDurations),
        beat_start_times: JSON.stringify(beatStartTimes),
        story_analysis: JSON.stringify({
          central_theme: `${isMeditation ? 'Guided meditation' : 'Sleep story'}: ${project.name}`,
          narrative_arc_summary: 'Progressive relaxation from gentle awareness to deep rest',
          emotional_trajectory: ['calm', 'settling', 'peaceful', 'deep_rest'],
          visual_world: 'Dark atmospheric environments — moonlit nature, candlelit interiors, starlit skies',
          recurring_visual_motifs: ['moonlight', 'water', 'stars', 'gentle flame', 'mist'],
          color_arc: 'deep midnight blue → warm amber → soft silver → darkness'
        })
      };
      const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
      if (psList[0]) {
        await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
      } else {
        await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
      }

      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: 'scene_breakdown',
        current_step: 5
      });
    }

    // Split script into chunks for batched processing
    const sentences = finalScript.match(/[^.!?]+[.!?]+[\s]*/g) || [finalScript];
    const MAX_SCENES_PER_CALL = 15;
    const MAX_WALL_MS = 55000;

    let scenesCreated = 0;
    let sceneOffset = startBatch > 0
      ? (await base44.asServiceRole.entities.Scenes.filter({ project_id })).length
      : 0;

    const scenesPerBatch = Math.min(MAX_SCENES_PER_CALL, totalTargetScenes - sceneOffset);
    if (scenesPerBatch <= 0) {
      return Response.json({ success: true, done: true, scenes_created: sceneOffset, total_target: totalTargetScenes });
    }

    // Distribute sentences to this batch
    const sentencesPerScene = Math.max(1, Math.floor(sentences.length / totalTargetScenes));
    const batchSentenceStart = sceneOffset * sentencesPerScene;
    const batchSentenceEnd = Math.min(sentences.length, batchSentenceStart + scenesPerBatch * sentencesPerScene);
    const batchText = sentences.slice(batchSentenceStart, batchSentenceEnd).join('').trim();
    const batchBeats = beatDurations.slice(sceneOffset, sceneOffset + scenesPerBatch);

    if (!batchText) {
      return Response.json({ success: true, done: true, scenes_created: sceneOffset, total_target: totalTargetScenes });
    }

    const prompt = buildSleepBreakdownPrompt({
      scriptText: batchText,
      sceneCount: scenesPerBatch,
      sceneStart: sceneOffset + 1,
      beatDurations: batchBeats,
      isMeditation,
      topicTitle: project.name
    });

    console.log(`🌙 Generating scenes ${sceneOffset + 1}-${sceneOffset + scenesPerBatch}...`);
    const result = await callGemini(prompt, 0.5);

    let scenesArr = result?.scenes;
    if (!scenesArr || !Array.isArray(scenesArr)) {
      console.error(`No scenes array in response. Keys: ${Object.keys(result || {}).join(',')}`);
      return Response.json({ error: 'AI failed to generate scenes' }, { status: 500 });
    }

    for (const scene of scenesArr) {
      const sceneNum = sceneOffset + scenesCreated + 1;
      const cleanedNarration = cleanNarrationText(scene.narration_text);
      const targetDuration = beatDurations[sceneNum - 1] || scene.duration_seconds || 12;

      const directorNotes = {
        visual_concept: scene.visual_concept,
        shot_type: scene.shot_type,
        camera_movement: scene.camera_movement,
        lighting: scene.lighting,
        color_palette: scene.color_palette,
        mood: scene.mood,
        emotional_intensity: scene.emotional_intensity || 0.15,
        sleep_visual_type: scene.sleep_visual_type || 'nature_dark',
        phase: 'sleep_deepening'
      };

      await base44.asServiceRole.entities.Scenes.create({
        project_id,
        scene_number: sceneNum,
        narration_text: cleanedNarration,
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: '',
        duration_seconds: targetDuration,
        status: 'breakdown_ready'
      });

      scenesCreated++;
    }

    const totalCreated = sceneOffset + scenesCreated;
    const allDone = totalCreated >= totalTargetScenes;

    if (allDone) {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: 'breakdown_complete',
        current_step: 5
      });
    }

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`🌙 Created ${scenesCreated} scenes (total: ${totalCreated}/${totalTargetScenes}) in ${elapsed}s`);

    return Response.json({
      success: true,
      done: allDone,
      next_batch: allDone ? null : (startBatch || 0) + 1,
      scenes_created: totalCreated,
      total_target: totalTargetScenes,
      beat_durations: beatDurations,
      beat_start_times: beatStartTimes
    });

  } catch (error) {
    console.error('❌ sleepSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});