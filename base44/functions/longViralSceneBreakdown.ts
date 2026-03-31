import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// LONG VIRAL SCENE BREAKDOWN ENGINE
// Same approach as shortsSceneBreakdown but scales to user-defined duration.
// Visual change every 4-6 seconds for long-form (vs 2-3s for shorts).
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
    const totalSec = durationMin * 60;
    const sceneInterval = 5; // visual change every ~5 seconds for long-form
    const approxScenes = Math.round(totalSec / sceneInterval);

    let nicheId = 'finance';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      nicheId = channels[0]?.shorts_niche || 'finance';
    }

    const prompt = `You are a YouTube visual director for long-form content. Break this ${durationMin}-minute script into individual SCENES for a faceless video editor.

CRITICAL RULE: Visual must change every 4-6 seconds for long-form. Each scene = one visual.
Total duration: ${totalSec} seconds (~${durationMin} minutes). That means approximately ${approxScenes} scenes.

SCRIPT:
${fullScript}

For each scene, provide:
- scene_number: sequential number
- section: which part (hook, tension, pivot, value_rule1, value_rule2, value_rule3, cta, outro, context, lessons1, lessons2, lessons3, transformation, cold_open, setup, escalation, twist, wtf_hook, context_bomb, step1, step2, step3, so_what, proof_hook, myth_kill, method_step1, method_step2, method_step3, proof_again)
- narration_text: the exact spoken words for this scene (split the script text across scenes evenly)
- duration_seconds: 4-6 seconds per scene (hook scenes can be 3-5s)
- visual_description: what should be on screen (stock footage description, text overlay, graphic)
- camera_direction: zoom_in, zoom_out, pan_left, pan_right, static, push_in
- text_overlay: any text that appears on screen
- mood: emotional tone
- audio_note: voice energy and background audio direction
- characters_present: array of character names who VISUALLY APPEAR (empty array [] if environment/text shot)

VISUAL RULES FOR LONG-FORM:
- Hook: 3-5 scenes. High-energy visuals. Kinetic text + dramatic background.
- Main body (rules/lessons/steps): bulk of scenes. Each rule/lesson gets its own visual segment.
- Transitions between major sections: color shifts, hard cuts.
- CTA: 3-5 scenes. Return to hook style.
- Outro: 1-2 scenes. End card.

Return JSON:
{
  "scenes": [
    {
      "scene_number": 1,
      "section": "hook",
      "narration_text": "spoken words for this scene",
      "duration_seconds": 5,
      "visual_description": "detailed description",
      "camera_direction": "push_in",
      "text_overlay": "bold text if any",
      "mood": "2-3 words",
      "audio_note": "direction",
      "characters_present": []
    }
  ]
}`;

    console.log(`🎬 Breaking Long Viral script into scenes (${durationMin}min, ~${approxScenes} scenes)...`);
    const result = await callGemini(prompt, 0.5);

    let scenesArr = result?.scenes;
    if (!scenesArr || !Array.isArray(scenesArr)) {
      throw new Error('AI failed to generate scene breakdown');
    }

    // Delete old scenes
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));
    }

    // Beat durations and start times
    const beatDurations = scenesArr.map(s => s.duration_seconds || 5);
    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => { beatStartTimes.push(offset); offset += d; });

    // Save ProductionSettings
    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `Long Viral: ${project.name}`,
        narrative_arc_summary: `${nicheId} viral structure scaled to ${durationMin} minutes`,
        visual_world: `Long-form ${nicheId} with visual change every 4-6 seconds`,
        visual_format: 'long_viral',
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    // Create scenes
    const cameraMap = {
      'zoom_in': 'slow_zoom_in', 'zoom_out': 'slow_zoom_out',
      'pan_left': 'slow_pan', 'pan_right': 'slow_pan',
      'push_in': 'slow_zoom_in', 'static': 'static',
    };

    const sceneRecords = scenesArr.map(aiScene => {
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
        duration_seconds: aiScene.duration_seconds || 5,
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
    console.log(`🎬 Created ${sceneRecords.length} Long Viral scenes in ${elapsed}s`);

    return Response.json({
      success: true, done: true,
      scenes_created: sceneRecords.length,
      total_duration: offset.toFixed(1),
    });

  } catch (error) {
    console.error('❌ longViralSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});