import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v4 — decoupled narration/visuals, enforces 40 scenes, Claude
// ══════════════════════════════════════════════════════════════════
// SHORTS SCENE BREAKDOWN ENGINE
// Takes a 90-second Shorts script and breaks it into 40 scenes.
// Narration and visuals are DECOUPLED — one sentence of narration
// can span multiple visual scenes. Visual cuts every 2-3 seconds.
// ══════════════════════════════════════════════════════════════════

async function callClaude(prompt, temperature = 0.5) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Claude API ${response.status}: ${err.error?.message || "Unknown"}`);
  }

  const data = await response.json();
  const rawText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");

  try { return JSON.parse(rawText); } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Claude JSON");
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

    const prompt = `You are a YouTube Shorts video editor breaking a 90-second script into exactly 40 visual scenes.

═══════════════════════════════════════════════
MOST IMPORTANT RULE — READ CAREFULLY:
═══════════════════════════════════════════════
Narration and visuals are COMPLETELY DECOUPLED.
- The script has ~200-240 words spoken over 90 seconds.
- You must produce EXACTLY 40 scenes regardless of word count.
- A single sentence of narration MUST be spread across multiple visual scenes.
- Think like a film editor: the camera cuts every 2-3 seconds even when the same sentence is still being spoken.
- Many scenes will have the SAME or CONTINUED narration_text — that is correct and expected.
- Some scenes will have empty narration_text ("") — pure visual cutaways with no voiceover.

EXAMPLE of how ONE sentence becomes FOUR scenes:
Narration: "He stole $400 million and nobody noticed for 12 years."
→ Scene 1: narration_text: "He stole $400 million" | visual: man typing at multiple monitors, dark office
→ Scene 2: narration_text: "" | visual: extreme close-up of hands on keyboard
→ Scene 3: narration_text: "and nobody noticed" | visual: empty office hallway, security camera
→ Scene 4: narration_text: "for 12 years." | visual: calendar pages flipping fast, years ticking by

This is how real Shorts are edited. The voice is continuous. The visuals cut constantly.
═══════════════════════════════════════════════

SCRIPT TO BREAK DOWN:
${fullScript}

SECTION STRUCTURE — distribute your 40 scenes across these sections:
- hook (scenes 1-4): 4 scenes, 2-2.5s each. Kinetic text + dramatic visuals. Most impactful frames.
- tension (scenes 5-12): 8 scenes, 2-2.5s each. Stock footage montage. Problem escalating.
- pivot (scenes 13-14): 2 scenes, 2s each. Hard cut. Color or energy shift.
- value_1 (scenes 15-20): 6 scenes, 2-2.5s each. First key point with supporting visuals.
- value_2 (scenes 21-26): 6 scenes, 2-2.5s each. Second key point with supporting visuals.
- value_3 (scenes 27-32): 6 scenes, 2-2.5s each. Third key point with supporting visuals.
- cta (scenes 33-38): 6 scenes, 2-2.5s each. Return to hook energy. "Save this" moment.
- deadzone (scenes 39-40): 2 scenes, 2s each. Dark card or loop frame. Silent or near-silent.

For each of the 40 scenes provide ALL of these fields:
- scene_number: 1 to 40
- section: one of [hook, tension, pivot, value_1, value_2, value_3, cta, deadzone]
- narration_text: the spoken words during this specific 2-3 second clip (can be empty "" for pure visual scenes, can repeat/continue from previous scene)
- duration_seconds: 2.0 to 2.5 (hook and cta scenes can be 2.0, value scenes 2.5)
- visual_concept: DIRECTOR'S SHOT DESCRIPTION — lead with WHERE THE CAMERA IS. Pattern: "[Camera position] — [what the lens discovers as it moves]. [Subject caught mid-action, woven into environment]. [One atmosphere detail serving the emotion]." NOT a caption. A cinematographer's briefing.
- shot_type: one of [ECU — Extreme Close-Up, CU — Close-Up, MCU — Medium Close-Up, MS — Medium Shot, WS — Wide Shot, EWS — Extreme Wide Shot, OTS — Over the Shoulder, POV — Point of View, HIGH ANGLE, LOW ANGLE, DUTCH ANGLE]
- camera_angle: physical camera placement e.g. "Low angle 15 degrees, shooting upward" or "Eye-level, locked off" or "Dutch angle 20 degrees right"
- camera_movement: specific motion e.g. "Hard push-in 20% zoom over 2s" or "Static locked" or "Slow pan right tracking subject"
- lighting: specific lighting setup e.g. "Single hard backlight, cold blue rim, 80% shadow" or "Warm motivated key left, clean shadows"
- color_palette: dominant colors e.g. "Deep navy #0A1628, gold accent #D4A574, high contrast" or "Dark charcoal #0D0D0D, warning red #CC2200"
- depth_of_field: e.g. "Shallow f/1.4 — subject sharp, world dissolving" or "Deep f/8 — everything in focus"
- mood: 2-3 words describing emotional energy
- continuity_bridge: ONE specific physical object or light quality that will also appear in the NEXT scene
- emotional_intensity: number 0.0 to 1.0 (hook=0.9, tension=0.8, pivot=0.7, value=0.6, cta=0.85, deadzone=0.1)
- viewer_emotion: the exact feeling the viewer should have during this scene
- text_overlay: bold text on screen if any (key numbers, power words) — empty string if none
- audio_note: voice energy and music direction for this scene
- characters_present: array of character names who VISUALLY APPEAR (empty [] for stock/graphic shots)
- camera_direction: one of [zoom_in, zoom_out, pan_left, pan_right, static, push_in] (kept for animation system compatibility)

SHOT SEQUENCING LAW: Before each shot, mentally state the previous shot type. The new shot MUST be a different type and shift angle by minimum 30 degrees. Never two consecutive MS eye-level shots.

SECTION CAMERA ENERGY:
- hook: Camera ALREADY MOVING when scene opens. ECU or LOW ANGLE. Assertive, no drift.
- tension: Each scene tighter than the last. MCU → CU progression. Cut on motion.
- pivot: HARD CUT energy. Single bold composition. Dutch angle or extreme low.
- value_1/2/3: MS to MCU. Deliberate push. World visible, subject clear.
- cta: Returns to hook energy. ECU or LOW ANGLE. Assertive and urgent.
- deadzone: WIDE or static. World without the character.

VISUAL RULES PER SECTION:
- hook: Full-screen bold text animations, dramatic stock footage, word-by-word kinetic text
- tension: Fast stock footage cuts, red highlights on numbers, urgency visuals
- pivot: HARD CUT — single bold statement, color shift dark→bright or calm→energetic
- value_1/2/3: Rule number as header graphic, supporting stock footage, numbers in green/gold
- cta: Bold "Save This" text frames, callback to hook visual, teaser frame for next video
- deadzone: Black card with subtle branding or loop back to scene 1 visual. No voice.

Return JSON and nothing else — no markdown, no backticks, no explanation:
{
  "scenes": [
    {
      "scene_number": 1,
      "section": "hook",
      "narration_text": "He stole $400 million",
      "duration_seconds": 2.0,
      "visual_concept": "ECU from below the keyboard — fingers slam keys in the dark, the glow of multiple monitors catching knuckle edges. Camera holds perfectly still as the typing stops mid-word.",
      "shot_type": "ECU — Extreme Close-Up",
      "camera_angle": "Low angle, 20 degrees below hands, shooting upward",
      "camera_movement": "Static locked — tension lives in stillness",
      "lighting": "Single cold blue backlight from monitors, 85% shadow, no fill",
      "color_palette": "Deep charcoal #0D0D0D, cold blue #1A2744, single amber key glint #C8A46E",
      "depth_of_field": "Shallow f/1.4 — fingertips razor sharp, keyboard dissolving into dark",
      "mood": "urgent, shocking, dark",
      "continuity_bridge": "cold blue monitor light carries into scene 2",
      "emotional_intensity": 0.9,
      "viewer_emotion": "shock and dread",
      "text_overlay": "$400,000,000",
      "audio_note": "voice low and deliberate, bass-heavy music sting on this frame",
      "characters_present": [],
      "camera_direction": "push_in"
    }
  ]
}`;

    console.log(`📱 Breaking Shorts script into 40 scenes (decoupled narration/visuals)...`);
    const result = await callClaude(prompt, 0.5);

    let scenesArr = result?.scenes;
    if (!scenesArr || !Array.isArray(scenesArr)) {
      throw new Error('AI failed to generate scene breakdown');
    }

    // Hard guard — must have at least 35 scenes
    if (scenesArr.length < 35) {
      throw new Error(`Too few scenes generated: ${scenesArr.length}. Expected 40. Please retry.`);
    }

    // Delete old scenes in parallel
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));
    }

    // Calculate beat durations and start times
    const beatDurations = scenesArr.map(s => s.duration_seconds || 2.25);
    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => { beatStartTimes.push(offset); offset += d; });

    // Save ProductionSettings
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

    // Camera movement map
    const cameraMap = {
      'zoom_in': 'slow_zoom_in',
      'zoom_out': 'slow_zoom_out',
      'pan_left': 'slow_pan',
      'pan_right': 'slow_pan',
      'push_in': 'slow_zoom_in',
      'static': 'static',
    };

    // Build scene records for bulkCreate
    const sceneRecords = scenesArr.map(aiScene => {
      const directorNotes = {
        // Full cinematic fields — now generated natively by Shorts breakdown
        visual_concept: aiScene.visual_concept || aiScene.visual_description || '',
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
        // Shorts-specific fields kept for animation system and UI compatibility
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
    const scenesCreated = sceneRecords.length;

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'breakdown_complete',
      current_step: 5,
      orientation: 'portrait',
    });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`📱 Created ${scenesCreated} Shorts scenes in ${elapsed}s (avg ${(offset / scenesCreated).toFixed(1)}s per scene)`);

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