import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed
// ══════════════════════════════════════════════════════════════════
// SHORTS SCENE BREAKDOWN ENGINE
// Takes a 90-second Shorts script and breaks it into scenes
// with visual change every 2-3 seconds as specified.
// Each section maps to multiple scenes with visual/audio specs.
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
        generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: "application/json" }
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

    // Get channel shorts niche
    let shortsNiche = 'finance';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      shortsNiche = channels[0]?.shorts_niche || 'finance';
    }

    const prompt = `You are a YouTube Shorts visual director. Break this 90-second script into individual SCENES for a faceless video editor.

CRITICAL RULE: Visual must change every 2-3 seconds. Each scene = one visual.
Total duration: 90 seconds. That means approximately 30-45 scenes.

SCRIPT:
${fullScript}

For each scene, provide:
- scene_number: sequential number
- section: which part of the video (hook, tension, pivot, value_rule1, value_rule2, value_rule3, cta, deadzone, context, lessons1, lessons2, lessons3, transformation, loop)
- narration_text: the exact spoken words for this scene (split the script text across scenes)
- duration_seconds: 2-3 seconds per scene (hook scenes can be 1.5-2.5s)
- visual_description: what should be on screen (stock footage description, text overlay, graphic)
- camera_direction: zoom_in, zoom_out, pan_left, pan_right, static, push_in
- text_overlay: any text that appears on screen (key numbers, rule labels, etc.)
- mood: emotional tone of this specific visual
- audio_note: voice energy and background audio direction
- characters_present: array of character names who VISUALLY APPEAR in this scene (empty array [] if pure environment/text/graphic shot)

VISUAL RULES:
- Hook (0-5s): 2-3 scenes. Full-screen kinetic text + dramatic background. Word-by-word text animation.
- Tension (5-20s): 5-7 scenes. Stock footage montage, new clip every 2-3s. Red highlights on numbers.
- Pivot (20-25s): 2 scenes. HARD CUT transition. Color shift dark→bright. Single bold text line.
- Value (25-70s): 15-18 scenes. 3 segments of 5-6 scenes each. Rule number appears as header. Numbers in green/gold.
- CTA (70-85s): 5-6 scenes. Return to hook style. "Save this" text. Tease next video.
- Dead zone (85-90s): 1-2 scenes. Dark card or loop back to opening frame. No voiceover.

Return JSON:
{
  "scenes": [
    {
      "scene_number": 1,
      "section": "hook",
      "narration_text": "spoken words for this 2-3 second clip",
      "duration_seconds": 2.5,
      "visual_description": "detailed stock footage or graphic description",
      "camera_direction": "push_in",
      "text_overlay": "bold text on screen if any",
      "mood": "2-3 words",
      "audio_note": "voice and background direction",
      "characters_present": ["Character Name"]
    }
  ]
}`;

    console.log(`📱 Breaking Shorts script into scenes (visual every 2-3s)...`);
    const result = await callGemini(prompt, 0.5);

    let scenesArr = result?.scenes;
    if (!scenesArr || !Array.isArray(scenesArr)) {
      throw new Error('AI failed to generate scene breakdown');
    }

    // Delete old scenes in parallel
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));
    }

    // Calculate beat durations and start times
    const beatDurations = scenesArr.map(s => s.duration_seconds || 2.5);
    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => { beatStartTimes.push(offset); offset += d; });

    // Save ProductionSettings
    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `YouTube Short: ${project.name}`,
        narrative_arc_summary: 'Hook → Tension → Pivot → 3 Value Points → CTA → Loop',
        visual_world: `Fast-paced ${shortsNiche} niche with visual change every 2-3 seconds`,
        visual_format: 'shorts_rapid_cut',
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    // Create scene records in bulk
    const cameraMap = {
      'zoom_in': 'slow_zoom_in',
      'zoom_out': 'slow_zoom_out',
      'pan_left': 'slow_pan',
      'pan_right': 'slow_pan',
      'push_in': 'slow_zoom_in',
      'static': 'static',
    };

    const sceneRecords = scenesArr.map(aiScene => {
      const directorNotes = {
        section: aiScene.section,
        visual_description: aiScene.visual_description,
        camera_direction: aiScene.camera_direction || 'push_in',
        text_overlay: aiScene.text_overlay || '',
        mood: aiScene.mood || '',
        audio_note: aiScene.audio_note || '',
        shorts_format: true,
        characters_present: aiScene.characters_present || [],
      };
      return {
        project_id,
        scene_number: aiScene.scene_number,
        narration_text: aiScene.narration_text || '',
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: aiScene.camera_direction || 'push_in',
        duration_seconds: aiScene.duration_seconds || 2.5,
        camera_movement: cameraMap[aiScene.camera_direction] || 'slow_zoom_in',
        animation_speed: 'normal',
        status: 'breakdown_ready',
        act: aiScene.section || '',
        notes: aiScene.text_overlay || '',
      };
    });

    await base44.asServiceRole.entities.Scenes.bulkCreate(sceneRecords);
    const scenesCreated = sceneRecords.length;

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'breakdown_complete',
      current_step: 5,
      orientation: 'portrait',
    });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`📱 Created ${scenesCreated} Shorts scenes in ${elapsed}s (avg ${(90/scenesCreated).toFixed(1)}s per scene)`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: scenesCreated,
      total_duration: offset.toFixed(1),
    });

  } catch (error) {
    console.error('❌ shortsSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});