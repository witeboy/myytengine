import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// LONG VIRAL SCENE BREAKDOWN ENGINE
// Scene count is driven by SENTENCE structure, not word budgets.
//
// RULES:
// 1. Each sentence = 1 scene (script pacing is source of truth)
// 2. Sentence < 3 words + adjacent sentence also < 3 words → grouped into 1 scene
// 3. Sentence > 7 words → ceil(words / 7) scenes, all with IDENTICAL narration
//    text but DIFFERENT camera angles (same story, different visual shot)
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.5) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

// ── Sentence splitter ─────────────────────────────────────────────────────────
// Splits script into individual sentences, preserving punctuation.
function splitIntoSentences(text) {
  // Split on sentence-ending punctuation followed by whitespace or end-of-string.
  // Handles: . ! ? … and combinations like ." or !'
  const raw = text.match(/[^.!?…]+[.!?…]+["']?[\s]*/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}

// ── Word count helper ─────────────────────────────────────────────────────────
function wordCount(text) {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ── Apply scene rules to sentences → produce scene beats ─────────────────────
// Returns an array of "beat" objects:
//   { narration_text, word_count, angle_index, total_angles, is_multi_angle }
//
// Rule 1: each sentence → 1 scene
// Rule 2: sentence < 3 words AND next sentence also < 3 words → merge into 1 scene
// Rule 3: sentence > 7 words → ceil(words/7) scenes, same narration, diff angles
function buildSceneBeats(sentences) {
  const beats = [];
  let i = 0;

  while (i < sentences.length) {
    const sentence = sentences[i];
    const wc = wordCount(sentence);

    // Rule 2: group two adjacent ultra-short sentences (< 3 words each)
    if (wc < 3 && i + 1 < sentences.length && wordCount(sentences[i + 1]) < 3) {
      const merged = `${sentence} ${sentences[i + 1]}`;
      beats.push({
        narration_text: merged,
        word_count: wordCount(merged),
        angle_index: 0,
        total_angles: 1,
        is_multi_angle: false,
      });
      i += 2;
      continue;
    }

    // Rule 3: long sentence > 7 words → split into ceil(wc/7) angle scenes
    if (wc > 7) {
      const totalAngles = Math.ceil(wc / 7);
      for (let a = 0; a < totalAngles; a++) {
        beats.push({
          narration_text: sentence,
          word_count: wc,
          angle_index: a,
          total_angles: totalAngles,
          is_multi_angle: true,
        });
      }
      i++;
      continue;
    }

    // Rule 1: normal sentence → 1 scene
    beats.push({
      narration_text: sentence,
      word_count: wc,
      angle_index: 0,
      total_angles: 1,
      is_multi_angle: false,
    });
    i++;
  }

  return beats;
}

// ── Narrative section label by position ──────────────────────────────────────
function getSectionLabel(pct) {
  if (pct < 0.08) return 'cold_open';
  if (pct < 0.15) return 'hook';
  if (pct < 0.30) return 'rising_tension';
  if (pct < 0.65) return 'emotional_core';
  if (pct < 0.80) return 'climax';
  if (pct < 0.92) return 'resolution';
  return 'cta';
}

// ── Batch beats into AI-digestible sub-batches (~20 beats per call) ───────────
const BEATS_PER_SUBBATCH = 20;
// Sub-batches processed per HTTP call. Each sub-batch is one Gemini call.
// 2 keeps each call well under the 180s timeout even on slow days. Frontend loops with start_batch.
const CHUNKS_PER_CALL = 2;

function chunkBeats(beats) {
  const chunks = [];
  for (let i = 0; i < beats.length; i += BEATS_PER_SUBBATCH) {
    chunks.push(beats.slice(i, i + BEATS_PER_SUBBATCH));
  }
  return chunks;
}

Deno.serve(async (req) => {
  const callStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, start_batch = 0 } = await req.json();

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

    let nicheId = 'finance';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      nicheId = channels[0]?.shorts_niche || 'finance';
    }

    // ── Step 1: Split into sentences ─────────────────────────────────────────
    const sentences = splitIntoSentences(fullScript);
    console.log(`📝 Script: ${sentences.length} sentences detected`);

    // ── Step 2: Apply scene rules → build beat list ──────────────────────────
    const allBeats = buildSceneBeats(sentences);
    const totalScenes = allBeats.length;
    console.log(`🎬 Long Viral: ${durationMin}min | ${sentences.length} sentences → ${totalScenes} scene beats`);

    // ── Step 3: Chunk beats into sub-batches for AI ──────────────────────────
    const beatChunks = chunkBeats(allBeats);
    const totalChunks = beatChunks.length;

    // On the very first call, clear any stale scenes from a previous run.
    if (start_batch === 0) {
      const stale = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      if (stale.length > 0) {
        await Promise.all(stale.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));
        console.log(`🗑️ Cleared ${stale.length} stale scenes before fresh breakdown`);
      }
    }

    // ── Step 4: Process this call's slice of sub-batches through Gemini ───────
    const endBatch = Math.min(start_batch + CHUNKS_PER_CALL, totalChunks);
    const allAiScenes = [];
    // Scene numbers are deterministic: sum of beat counts in all prior chunks + 1.
    let globalSceneNumber = beatChunks.slice(0, start_batch).reduce((sum, c) => sum + c.length, 0) + 1;

    for (let bi = start_batch; bi < endBatch; bi++) {
      const chunk = beatChunks[bi];

      // Build a numbered list of beats for the AI with full context
      const beatList = chunk.map((beat, idx) => {
        const sceneNum = globalSceneNumber + idx;
        const pct = sceneNum / totalScenes;
        const section = getSectionLabel(pct);
        const angleNote = beat.is_multi_angle
          ? `[MULTI-ANGLE: angle ${beat.angle_index + 1} of ${beat.total_angles} — SAME narration, DIFFERENT shot from prior angle]`
          : '[SINGLE SCENE]';
        return `Scene ${sceneNum} | ${section} | ${angleNote}\nNarration: "${beat.narration_text}"`;
      }).join('\n\n');

      const continuityNote = allAiScenes.length > 0
        ? `Last scene ended with: "${allAiScenes[allAiScenes.length - 1].narration_text?.slice(-80) || ''}"`
        : 'This is the opening of the video.';

      const subPrompt = `You are a world-class YouTube visual director for long-form faceless ${nicheId} content.

SCENE STRUCTURE RULES — already applied for you:
1. Each scene below maps to exactly one sentence from the script.
2. Some scenes are [MULTI-ANGLE]: the narrator says the SAME sentence but the VIDEO cuts to a fresh shot. These scenes have IDENTICAL narration_text. Your job is to give each angle a DISTINCT visual — different framing, different subject, different energy. This keeps kinetic momentum while the narrator completes a long thought.
3. [SINGLE SCENE] scenes are short, punchy beats — one image, maximum impact.

YOUR TASK:
For each scene listed below, produce a complete scene object. Do NOT rewrite, split, or merge the narration_text — use it exactly as given.

CONTINUITY: ${continuityNote}

SCENES TO DIRECT (${chunk.length} scenes, starting at scene ${globalSceneNumber}):
${beatList}

FOR EACH SCENE PROVIDE:
- scene_number: as listed above
- section: as listed above (cold_open | hook | rising_tension | emotional_core | climax | resolution | cta)
- narration_text: EXACT text as given — do not alter
- duration_seconds: word_count / 2.5 (speaking time at 150wpm). For multi-angle scenes all angles share the same duration_seconds = full_sentence_word_count / 2.5 / total_angles
- visual_description: 2-3 sentences. Specific stock footage — real locations, real objects, real situations. For multi-angle scenes, each angle MUST be visually distinct from its siblings (different subject, framing, energy).
- camera_direction: zoom_in | zoom_out | pan_left | pan_right | static | push_in
- text_overlay: 3-6 word bold on-screen text for emphasis, or empty string
- mood: 2-3 words (e.g. "tense, anticipatory")
- audio_note: voice energy (whisper/conversational/urgent/commanding) + music cue
- characters_present: [] — faceless stock footage only

VISUAL DIRECTION BY SECTION:
- cold_open / hook: maximum contrast, kinetic energy, bold text — grab in 3 seconds
- rising_tension: building momentum, tight shots, urgency
- emotional_core: human-scale moments, warm palette, let image breathe
- climax: single most powerful image — the visual payoff
- resolution: wide, authoritative, settled — viewer exhales
- cta: action-oriented, forward-looking energy

NICHE (${nicheId}): Real environments and situations this audience recognizes and trusts.

Return ONLY valid JSON:
{
  "scenes": [
    {
      "scene_number": ${globalSceneNumber},
      "section": "...",
      "narration_text": "exact text",
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

      console.log(`🎬 Sub-batch ${bi + 1}/${beatChunks.length}: ${chunk.length} beats`);

      let subResult;
      try {
        subResult = await callGemini(subPrompt, 0.5);
      } catch (err) {
        console.error(`❌ Sub-batch ${bi + 1} failed: ${err.message}`);
        // Fallback: create one scene per beat with minimal data
        chunk.forEach((beat, idx) => {
          const sceneNum = globalSceneNumber + idx;
          const pct = sceneNum / totalScenes;
          allAiScenes.push({
            scene_number: sceneNum,
            section: getSectionLabel(pct),
            narration_text: beat.narration_text,
            duration_seconds: parseFloat((beat.word_count / 2.5).toFixed(1)),
            visual_description: `Cinematic footage matching: "${beat.narration_text.substring(0, 100)}"`,
            camera_direction: 'push_in',
            text_overlay: '',
            mood: 'engaged, focused',
            audio_note: 'conversational narration, subtle background music',
            characters_present: [],
            _beat: beat,
          });
        });
        globalSceneNumber += chunk.length;
        continue;
      }

      const subScenes = subResult?.scenes;
      if (!subScenes || !Array.isArray(subScenes) || subScenes.length === 0) {
        console.warn(`⚠️ Sub-batch ${bi + 1}: no scenes returned — using fallback`);
        chunk.forEach((beat, idx) => {
          const sceneNum = globalSceneNumber + idx;
          const pct = sceneNum / totalScenes;
          allAiScenes.push({
            scene_number: sceneNum,
            section: getSectionLabel(pct),
            narration_text: beat.narration_text,
            duration_seconds: parseFloat((beat.word_count / 2.5).toFixed(1)),
            visual_description: `Cinematic footage: "${beat.narration_text.substring(0, 100)}"`,
            camera_direction: 'push_in',
            text_overlay: '',
            mood: 'engaged, focused',
            audio_note: 'conversational narration',
            characters_present: [],
            _beat: beat,
          });
        });
        globalSceneNumber += chunk.length;
        continue;
      }

      // ── THE FIX: Iterate over the source of truth (the chunk), NOT the AI's output ──
      chunk.forEach((beat, idx) => {
        const expectedSceneNum = globalSceneNumber + idx;
        const pct = expectedSceneNum / totalScenes;
        
        // Try to find the AI's response for this specific beat
        // Match by the scene_number it returned, or fallback to the array index
        let aiScene = subScenes.find(s => s.scene_number === expectedSceneNum);
        if (!aiScene) aiScene = subScenes[idx]; 

        if (aiScene) {
          // The AI successfully created a scene for this beat
          aiScene.scene_number = expectedSceneNum;
          aiScene._beat = beat;
          aiScene.narration_text = beat.narration_text; // Enforce exact script text
          allAiScenes.push(aiScene);
        } else {
          // 🚨 THE AI SKIPPED THIS BEAT! Trigger micro-fallback so text isn't lost.
          console.warn(`⚠️ AI skipped beat ${expectedSceneNum}. Forcing local fallback.`);
          allAiScenes.push({
            scene_number: expectedSceneNum,
            section: getSectionLabel(pct),
            narration_text: beat.narration_text,
            duration_seconds: parseFloat((beat.word_count / 2.5).toFixed(1)),
            visual_description: `Cinematic footage: "${beat.narration_text.substring(0, 100)}"`,
            camera_direction: 'push_in',
            text_overlay: '',
            mood: 'engaged, focused',
            audio_note: 'conversational narration',
            characters_present: [],
            _beat: beat,
          });
        }
      });

      // ALWAYS increment by the exact number of beats in the chunk, never the AI's count
      globalSceneNumber += chunk.length; 
      console.log(`✅ Sub-batch ${bi + 1}: processed ${chunk.length} beats`);
    }

    // ── Camera direction map ─────────────────────────────────────────────────
    const cameraMap = {
      'zoom_in': 'slow_zoom_in', 'zoom_out': 'slow_zoom_out',
      'pan_left': 'slow_pan', 'pan_right': 'slow_pan',
      'push_in': 'slow_zoom_in', 'static': 'static',
    };

    // ── Create scene records for THIS call's scenes only ─────────────────────
    const perSceneDuration = (s) => {
      const beat = s._beat;
      if (beat?.is_multi_angle) {
        return parseFloat((beat.word_count / 2.5 / beat.total_angles).toFixed(2));
      }
      return parseFloat(((s.duration_seconds) || (beat?.word_count / 2.5) || 3).toFixed(2));
    };

    const sceneRecords = allAiScenes.map(aiScene => {
      const beat = aiScene._beat || {};
      const directorNotes = {
        section: aiScene.section,
        visual_description: aiScene.visual_description,
        camera_direction: aiScene.camera_direction || 'push_in',
        text_overlay: aiScene.text_overlay || '',
        mood: aiScene.mood || '',
        audio_note: aiScene.audio_note || '',
        long_viral_format: true,
        characters_present: aiScene.characters_present || [],
        is_multi_angle: beat.is_multi_angle || false,
        angle_index: beat.angle_index ?? 0,
        total_angles: beat.total_angles ?? 1,
      };
      return {
        project_id,
        scene_number: aiScene.scene_number,
        narration_text: aiScene.narration_text || '',
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: aiScene.camera_direction || 'push_in',
        duration_seconds: perSceneDuration(aiScene),
        camera_movement: cameraMap[aiScene.camera_direction] || 'slow_zoom_in',
        animation_speed: 'normal',
        status: 'breakdown_ready',
        act: aiScene.section || '',
        notes: aiScene.text_overlay || '',
      };
    });

    if (sceneRecords.length > 0) {
      await base44.asServiceRole.entities.Scenes.bulkCreate(sceneRecords);
    }

    const isDone = endBatch >= totalChunks;

    if (!isDone) {
      const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
      console.log(`⏸ Batches ${start_batch + 1}-${endBatch}/${totalChunks} in ${elapsed}s — next: ${endBatch}`);
      return Response.json({
        success: true,
        done: false,
        next_batch: endBatch,
        total_batches: totalChunks,
        scenes_so_far: globalSceneNumber - 1,
      });
    }

    // ── FINAL CALL: compute beat timing from ALL saved scenes & finalize ──────
    const savedScenes = (await base44.asServiceRole.entities.Scenes.filter({ project_id }))
      .sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));

    const beatDurations = savedScenes.map(s => parseFloat((s.duration_seconds || 3).toFixed(2)));
    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => { beatStartTimes.push(parseFloat(offset.toFixed(2))); offset += d; });

    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `Long Viral: ${project.name}`,
        narrative_arc_summary: `${nicheId} viral structure — ${durationMin}min`,
        visual_world: `Long-form ${nicheId} | ${savedScenes.length} scenes | sentence-paced`,
        visual_format: 'long_viral',
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'breakdown_complete',
      current_step: 5,
    });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    const totalDuration = offset.toFixed(1);
    console.log(`🎬 DONE: ${savedScenes.length} Long Viral scenes | last batch in ${elapsed}s | ${durationMin}min | ${sentences.length} sentences → ${totalScenes} beats | runtime ${totalDuration}s`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: savedScenes.length,
      sentence_count: sentences.length,
      total_duration: totalDuration,
    });

  } catch (error) {
    console.error('❌ longViralSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});