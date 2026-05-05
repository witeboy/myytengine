import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v5 — 4 parallel Claude calls of 10 scenes each to avoid timeout

async function callClaude(prompt, temperature = 0.5) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      temperature,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Claude error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text;
  if (!rawText) throw new Error("No response from Claude");

  try { return JSON.parse(rawText); } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Claude JSON");
  }
}

const makeBatchPrompt = (startScene, endScene, sections, fullScript, shortsNiche) =>
`You are a YouTube Shorts video editor. Generate exactly ${endScene - startScene + 1} scenes numbered ${startScene} to ${endScene}.

SCRIPT:
${fullScript}

NICHE: ${shortsNiche}

KEY RULE — DECOUPLED NARRATION/VISUALS:
- Camera cuts every 2-3 seconds even mid-sentence.
- Many scenes share the same narration_text — correct and expected.
- Some scenes have empty narration_text ("") — pure visual cutaways.

YOUR ASSIGNED SCENES: ${startScene} to ${endScene} ONLY. Do not generate outside this range.

SECTIONS FOR YOUR BATCH:
${sections}

For each scene provide ALL fields:
- scene_number: integer (${startScene} to ${endScene})
- section: one of [hook, tension, pivot, value_1, value_2, value_3, cta, deadzone]
- narration_text: spoken words during this clip (can be "" or same as previous)
- duration_seconds: 2.0 to 2.5
- visual_concept: director shot — camera position, subject, movement, atmosphere
- shot_type: one of [ECU — Extreme Close-Up, CU — Close-Up, MCU — Medium Close-Up, MS — Medium Shot, WS — Wide Shot, EWS — Extreme Wide Shot, POV — Point of View, HIGH ANGLE, LOW ANGLE, DUTCH ANGLE]
- camera_angle: e.g. "Low angle 15 degrees shooting upward"
- camera_movement: e.g. "Hard push-in 20% zoom over 2s" or "Static locked"
- lighting: e.g. "Single hard backlight, cold blue rim, 80% shadow"
- color_palette: dominant colors with hex codes
- depth_of_field: e.g. "Shallow f/1.4 — subject sharp, background dissolving"
- mood: 2-3 words
- continuity_bridge: one object or light quality linking to next scene
- emotional_intensity: 0.0 to 1.0
- viewer_emotion: feeling the viewer should have
- text_overlay: bold on-screen text or ""
- audio_note: voice energy and music direction
- characters_present: [] for stock shots
- camera_direction: one of [zoom_in, zoom_out, pan_left, pan_right, static, push_in]

SHOT LAW: Never two consecutive same shot types. Shift angle minimum 30 degrees.

Return JSON only — no markdown, no backticks:
{"scenes": [...]}`;

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

    let shortsNiche = 'finance';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      shortsNiche = channels[0]?.shorts_niche || 'finance';
    }

    console.log(`📱 Generating 40 scenes in 4 parallel batches of 10...`);

    const [result1, result2, result3, result4] = await Promise.all([
      callClaude(makeBatchPrompt(1, 10,
        `- hook (scenes 1-4): ECU/LOW ANGLE, camera already moving, kinetic text, most impactful frames. emotional_intensity=0.9
- tension (scenes 5-10): MCU→CU progression, urgency visuals, problem escalating. emotional_intensity=0.8`,
        fullScript, shortsNiche), 0.5),

      callClaude(makeBatchPrompt(11, 20,
        `- tension continued (scenes 11-12): tightest tension shots, cut on motion. emotional_intensity=0.8
- pivot (scenes 13-14): HARD CUT, dutch angle or extreme low, color/energy shift. emotional_intensity=0.7
- value_1 (scenes 15-20): MS to MCU, first key point with supporting visuals. emotional_intensity=0.6`,
        fullScript, shortsNiche), 0.5),

      callClaude(makeBatchPrompt(21, 30,
        `- value_2 (scenes 21-26): MS to MCU, second key point with supporting visuals. emotional_intensity=0.6
- value_3 (scenes 27-30): third key point begins, supporting visuals. emotional_intensity=0.6`,
        fullScript, shortsNiche), 0.5),

      callClaude(makeBatchPrompt(31, 40,
        `- value_3 continued (scenes 31-32): conclude third key point. emotional_intensity=0.6
- cta (scenes 33-38): hook energy returns, ECU/LOW ANGLE, bold Save This text, callback to hook visual. emotional_intensity=0.85
- deadzone (scenes 39-40): WIDE or static, dark card, no voice, subtle branding. emotional_intensity=0.1`,
        fullScript, shortsNiche), 0.5),
    ]);

    let scenesArr = [
      ...(result1?.scenes || []),
      ...(result2?.scenes || []),
      ...(result3?.scenes || []),
      ...(result4?.scenes || []),
    ].sort((a, b) => a.scene_number - b.scene_number);

    if (!scenesArr.length) throw new Error('AI failed to generate scene breakdown');
    if (scenesArr.length < 35) throw new Error(`Too few scenes: ${scenesArr.length}. Expected 40.`);

    // Delete old scenes
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));
    }

    // Beat timings
    const beatDurations = scenesArr.map(s => s.duration_seconds || 2.25);
    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => { beatStartTimes.push(offset); offset += d; });

    // ProductionSettings
    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `YouTube Short: ${project.name}`,
        narrative_arc_summary: 'Hook → Tension → Pivot → 3 Value Points → CTA → Deadzone',
        visual_world: `Fast-paced ${shortsNiche} niche — visual cut every 2-3 seconds, narration decoupled from visuals`,
        visual_format: 'shorts_rapid_cut',
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    const cameraMap = {
      zoom_in: 'slow_zoom_in', zoom_out: 'slow_zoom_out',
      pan_left: 'slow_pan', pan_right: 'slow_pan',
      push_in: 'slow_zoom_in', static: 'static',
    };

    const sceneRecords = scenesArr.map(aiScene => {
      const directorNotes = {
        visual_concept: aiScene.visual_concept || '',
        shot_type: aiScene.shot_type || 'MS — Medium Shot',
        camera_angle: aiScene.camera_angle || 'Eye-level, locked off',
        camera_movement: aiScene.camera_movement || 'static',
        lighting: aiScene.lighting || 'Motivated practical lighting',
        color_palette: aiScene.color_palette || 'High contrast, saturated',
        depth_of_field: aiScene.depth_of_field || 'Shallow f/1.8',
        mood: aiScene.mood || '',
        continuity_bridge: aiScene.continuity_bridge || '',
        emotional_intensity: aiScene.emotional_intensity || 0.7,
        viewer_emotion: aiScene.viewer_emotion || '',
        phase: aiScene.section || 'hook',
        characters_present: aiScene.characters_present || [],
        section: aiScene.section,
        visual_description: aiScene.visual_description || '',
        camera_direction: aiScene.camera_direction || 'push_in',
        text_overlay: aiScene.text_overlay || '',
        audio_note: aiScene.audio_note || '',
        shorts_format: true,
      };
      return {
        project_id,
        scene_number: aiScene.scene_number,
        narration_text: aiScene.narration_text || '',
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: aiScene.camera_direction || 'push_in',
        duration_seconds: aiScene.duration_seconds || 2.25,
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
      orientation: 'portrait',
    });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`📱 Created ${scenesArr.length} scenes in ${elapsed}s`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: scenesArr.length,
      total_duration: offset.toFixed(1),
    });

  } catch (error) {
    console.error('❌ shortsSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});