import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// LONG VIRAL SCENE BREAKDOWN ENGINE
// Systemic word-budget scene density — Spielberg rhythm (5-7s/scene).
// AI self-organizes scene count from word-per-scene mental model.
// Visual change emerges naturally from 13 words/scene at 150wpm.
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
  try { return JSON.parse(rawText); } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Gemini JSON");
  }
}

Deno.serve(async (req) => {
  const callStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found.' }, { status: 400 });
    }

    const fullScript = script.full_script;
    const durationMin = project.video_duration_minutes || 10;

    // ── Word-budget systemic scene density ──────────────────────────────────────
    // A scene change every 5 seconds at 150wpm = ~12.5 words per scene.
    // We give the AI this mental model instead of enforcing pre-split chunks.
    // The AI naturally divides text into scenes because it understands WHY.
    const TARGET_WORDS_PER_SCENE = 13; // ~5s at 150wpm — Spielberg rhythm
    const WORDS_PER_SUBBATCH = 400;    // ~27 scenes per AI call — comfortable context

    const scriptWords = fullScript.split(/\s+/).filter(w => w.length > 0);
    const totalWords = scriptWords.length;
    const targetSceneCount = Math.max(8, Math.round(totalWords / TARGET_WORDS_PER_SCENE));

    let nicheId = 'finance';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      nicheId = channels[0]?.shorts_niche || 'finance';
    }

    console.log(`🎬 Long Viral: ${durationMin}min | ${totalWords} words → ${targetSceneCount} scenes @ ~${TARGET_WORDS_PER_SCENE}w/scene`);

    // ── Split script into sentence-aligned word-budget sub-batches ──────────────
    // Each sub-batch is ~WORDS_PER_SUBBATCH words, cut at sentence boundaries.
    // The AI gets each block and is told how many scenes to create based on word count.
    const sentences = fullScript.match(/[^.!?]+[.!?]+[\s]*/g) || [fullScript];
    const subBatchTexts = [];
    let currentBatch = [];
    let currentWordCount = 0;

    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().split(/\s+/).length;
      if (currentWordCount + sentenceWords > WORDS_PER_SUBBATCH && currentBatch.length > 0) {
        subBatchTexts.push(currentBatch.join(''));
        currentBatch = [];
        currentWordCount = 0;
      }
      currentBatch.push(sentence);
      currentWordCount += sentenceWords;
    }
    if (currentBatch.length > 0) subBatchTexts.push(currentBatch.join(''));

    // Determine narrative section label by position in the full story
    function getSectionLabel(batchIdx, totalBatches, sceneIdx, scenesInBatch) {
      const pct = (batchIdx + sceneIdx / Math.max(scenesInBatch, 1)) / Math.max(totalBatches, 1);
      if (pct < 0.08) return 'cold_open';
      if (pct < 0.15) return 'hook';
      if (pct < 0.30) return 'rising_tension';
      if (pct < 0.65) return 'emotional_core';
      if (pct < 0.80) return 'climax';
      if (pct < 0.92) return 'resolution';
      return 'cta';
    }

    // ── Process each sub-batch — AI self-organizes scene count from word budget ──
    const allAiScenes = [];
    let globalSceneNumber = 1;

    for (let bi = 0; bi < subBatchTexts.length; bi++) {
      const batchText = subBatchTexts[bi];
      const batchWords = batchText.trim().split(/\s+/).length;
      const expectedScenes = Math.max(1, Math.round(batchWords / TARGET_WORDS_PER_SCENE));
      const expectedDuration = Math.round((batchWords / 150) * 60); // seconds at 150wpm

      const continuityNote = allAiScenes.length > 0
        ? `Last scene ended with: "${allAiScenes[allAiScenes.length - 1].narration_text?.slice(-80) || ''}"`
        : 'This is the opening of the video.';

      const subPrompt = `You are a world-class YouTube visual director for long-form faceless content (${nicheId} niche).

MENTAL MODEL — how a Spielberg-caliber editor thinks:
A narrator speaks at 150 words per minute. Each visual scene should hold for 5-7 seconds.
At 150wpm, 5 seconds = ~12 words of narration. 7 seconds = ~18 words.
Therefore: one scene = 12-18 spoken words. Never more. Each sentence break is a potential cut.

YOUR TASK:
Break the narration block below into individual scenes.
- This block is ${batchWords} words (~${expectedDuration} seconds of narration)
- At 12-18 words per scene, this block naturally yields approximately ${expectedScenes} scenes
- Cut at natural sentence or clause boundaries — wherever a new visual image makes sense
- Do NOT merge multiple sentences into one scene unless they form a single unbroken image

NARRATION BLOCK (scenes ${globalSceneNumber} onward):
${batchText}

CONTINUITY: ${continuityNote}

FOR EACH SCENE PROVIDE:
- scene_number: sequential, starting at ${globalSceneNumber}
- section: narrative position (cold_open | hook | rising_tension | emotional_core | climax | resolution | cta)
- narration_text: the exact words from the block for this scene (12-18 words, one thought)
- duration_seconds: word_count_of_narration_text / 2.5 (this is the speaking time at 150wpm)
- visual_description: specific stock footage or graphic that illustrates exactly what is being said. 2-3 sentences. Name real locations, real situations, real objects — not abstract concepts.
- camera_direction: zoom_in | zoom_out | pan_left | pan_right | static | push_in
- text_overlay: 3-6 word bold on-screen text for emphasis, or empty string
- mood: 2-3 words (e.g. "tense, anticipatory")
- audio_note: voice energy (whisper/conversational/urgent/commanding) + music (e.g. "urgent narration, low percussive build")
- characters_present: [] — this is faceless stock footage content

VISUAL DIRECTION BY SECTION:
- cold_open / hook: maximum contrast, kinetic energy, bold text — grab attention in 3 seconds
- rising_tension: building momentum, tight shots, urgency in every frame
- emotional_core: human-scale relatable moments, warm palette, let the image breathe
- climax: the single most powerful image — the visual payoff of everything built
- resolution: wide, authoritative, settled — the viewer exhales
- cta: return to hook energy — action-oriented, forward-looking

NICHE VISUAL SENSIBILITY (${nicheId}): Match stock footage to this niche's visual world — real environments, real people, real situations this audience recognizes and trusts.

Return only valid JSON with all narration words accounted for:
{
  "scenes": [
    {
      "scene_number": ${globalSceneNumber},
      "section": "...",
      "narration_text": "exact words from the block",
      "duration_seconds": 5.2,
      "visual_description": "...",
      "camera_direction": "push_in",
      "text_overlay": "",
      "mood": "...",
      "audio_note": "...",
      "characters_present": []
    }
  ]
}`;

      console.log(`🎬 Sub-batch ${bi + 1}/${subBatchTexts.length}: ${batchWords} words → ~${expectedScenes} scenes`);

      let subResult;
      try {
        subResult = await callGemini(subPrompt, 0.5);
      } catch (err) {
        console.error(`❌ Sub-batch ${bi + 1} failed: ${err.message}`);
        // On AI failure, keep the block as one scene with real narration content
        allAiScenes.push({
          scene_number: globalSceneNumber,
          section: getSectionLabel(bi, subBatchTexts.length, 0, 1),
          narration_text: batchText.trim(),
          duration_seconds: parseFloat(expectedDuration.toFixed(1)),
          visual_description: `Cinematic footage matching the narration: ${batchText.trim().substring(0, 120)}`,
          camera_direction: 'push_in',
          text_overlay: '',
          mood: 'engaged, focused',
          audio_note: 'conversational narration, subtle background music',
          characters_present: [],
        });
        globalSceneNumber++;
        continue;
      }

      const subScenes = subResult?.scenes;
      if (!subScenes || !Array.isArray(subScenes) || subScenes.length === 0) {
        console.warn(`⚠️ Sub-batch ${bi + 1}: no scenes returned — keeping block as single scene`);
        allAiScenes.push({
          scene_number: globalSceneNumber,
          section: getSectionLabel(bi, subBatchTexts.length, 0, 1),
          narration_text: batchText.trim(),
          duration_seconds: parseFloat(expectedDuration.toFixed(1)),
          visual_description: `Cinematic footage: ${batchText.trim().substring(0, 120)}`,
          camera_direction: 'push_in',
          text_overlay: '',
          mood: 'engaged, focused',
          audio_note: 'conversational narration',
          characters_present: [],
        });
        globalSceneNumber++;
        continue;
      }

      // Renumber sequentially and accept AI's natural splits
      for (let si = 0; si < subScenes.length; si++) {
        const scene = subScenes[si];
        scene.scene_number = globalSceneNumber++;
        if (!scene.section) {
          scene.section = getSectionLabel(bi, subBatchTexts.length, si, subScenes.length);
        }
        allAiScenes.push(scene);
      }

      const actualScenes = subScenes.length;
      const ratio = actualScenes / expectedScenes;
      if (ratio < 0.6) {
        console.warn(`⚠️ Sub-batch ${bi + 1}: AI produced ${actualScenes} scenes, expected ~${expectedScenes} (${Math.round(ratio * 100)}% of target) — consider reducing WORDS_PER_SUBBATCH`);
      } else {
        console.log(`✅ Sub-batch ${bi + 1}: ${actualScenes} scenes (expected ~${expectedScenes})`);
      }
    }

    // ── Delete old scenes ────────────────────────────────────────────────────────
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));
    }

    // ── Beat durations and start times ───────────────────────────────────────────
    const beatDurations = allAiScenes.map(s => s.duration_seconds || (TARGET_WORDS_PER_SCENE / 2.5));
    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => { beatStartTimes.push(offset); offset += d; });

    // ── Save ProductionSettings ───────────────────────────────────────────────────
    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `Long Viral: ${project.name}`,
        narrative_arc_summary: `${nicheId} viral structure — ${durationMin}min`,
        visual_world: `Long-form ${nicheId} | ${allAiScenes.length} scenes | ~${TARGET_WORDS_PER_SCENE}w/scene`,
        visual_format: 'long_viral',
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    // ── Create scene records ─────────────────────────────────────────────────────
    const cameraMap = {
      'zoom_in': 'slow_zoom_in', 'zoom_out': 'slow_zoom_out',
      'pan_left': 'slow_pan', 'pan_right': 'slow_pan',
      'push_in': 'slow_zoom_in', 'static': 'static',
    };

    const sceneRecords = allAiScenes.map(aiScene => {
      const directorNotes = {
        section: aiScene.section,
        visual_description: aiScene.visual_description,
        camera_direction: aiScene.camera_direction || 'push_in',
        text_overlay: aiScene.text_overlay || '',
        mood: aiScene.mood || '',
        audio_note: aiScene.audio_note || '',
        long_viral_format: true,
        characters_present: aiScene.characters_present || [],
      };
      return {
        project_id,
        scene_number: aiScene.scene_number,
        narration_text: aiScene.narration_text || '',
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: aiScene.camera_direction || 'push_in',
        duration_seconds: aiScene.duration_seconds || TARGET_WORDS_PER_SCENE / 2.5,
        camera_movement: cameraMap[aiScene.camera_direction] || 'slow_zoom_in',
        animation_speed: 'normal',
        status: 'breakdown_ready',
        act: aiScene.section || '',
        notes: aiScene.text_overlay || '',
      };
    });

    await base44.asServiceRole.entities.Scenes.bulkCreate(sceneRecords);

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'breakdown_complete',
      current_step: 5,
    });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`🎬 Created ${sceneRecords.length} Long Viral scenes in ${elapsed}s | ${durationMin}min | ${totalWords} words | target was ${targetSceneCount}`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: sceneRecords.length,
      target_scenes: targetSceneCount,
      total_duration: offset.toFixed(1),
    });

  } catch (error) {
    console.error('❌ longViralSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});