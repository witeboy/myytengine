import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// SHORTS SCENE BREAKDOWN ENGINE v3
// Deterministic scene count — 1 scene per 2s target, section-aware
// pacing. AI fills the creative content; math controls the structure.
// ══════════════════════════════════════════════════════════════════

// ── Section pacing table ─────────────────────────────────────────
// Each section: time window + seconds-per-scene (scene duration)
// These drive exact scene counts — Gemini gets hard numbers, not "approx"
const SECTION_PACING = [
  { name: 'hook',        start:  0, end:  5,  secPerScene: 1.5 },  // ~3 scenes  — fastest, word-by-word kinetic
  { name: 'tension',     start:  5, end: 20,  secPerScene: 2.0 },  // ~7 scenes  — rapid stock montage
  { name: 'pivot',       start: 20, end: 25,  secPerScene: 2.5 },  // ~2 scenes  — hard cut + colour shift
  { name: 'value',       start: 25, end: 70,  secPerScene: 3.0 },  // ~15 scenes — teaching needs to land
  { name: 'cta',         start: 70, end: 85,  secPerScene: 2.0 },  // ~7 scenes  — urgency ramp
  { name: 'deadzone',    start: 85, end: 90,  secPerScene: 5.0 },  // ~1 scene   — silent loop/end card
];

// ── Calculate exact scene counts from pacing table ───────────────
function buildSectionPlan(totalDurationSeconds) {
  const scale = totalDurationSeconds / 90; // stretch/compress for non-90s scripts
  let sceneNumber = 1;

  return SECTION_PACING.map(section => {
    const sectionDuration = (section.end - section.start) * scale;
    const rawCount = sectionDuration / section.secPerScene;
    const count = Math.max(1, Math.round(rawCount));
    const assignedDuration = sectionDuration / count; // exact per-scene duration

    const plan = {
      name: section.name,
      startTime: section.start * scale,
      endTime: section.end * scale,
      sectionDuration: Math.round(sectionDuration * 10) / 10,
      sceneCount: count,
      secPerScene: Math.round(assignedDuration * 10) / 10,
      firstScene: sceneNumber,
      lastScene: sceneNumber + count - 1,
    };
    sceneNumber += count;
    return plan;
  });
}

// ── Estimate script duration from word count ─────────────────────
// Shorts narration pace: ~160 words/min = ~2.67 words/sec
function estimateDuration(script) {
  const words = script.trim().split(/\s+/).filter(w => w.length > 0).length;
  const estimatedSeconds = Math.round(words / 2.67);
  // Clamp: Shorts are 15–90s. If they passed a longer script treat it as 90s.
  return Math.min(90, Math.max(15, estimatedSeconds));
}

// ── Robust JSON extractor (handles fences, preamble, truncation) ──
function extractJSON(rawText) {
  if (!rawText) return null;
  try { return JSON.parse(rawText); } catch (_) {}

  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) { try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {} }

  const firstBrace = rawText.indexOf('{');
  const lastBrace  = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = rawText.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(slice); } catch (_) {}
    for (const suffix of [']}', '}]}', '"}]}', '"]}']) {
      try {
        const p = JSON.parse(slice + suffix);
        if (p && typeof p === 'object') return p;
      } catch (_) {}
    }
    try { return JSON.parse(slice.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')); } catch (_) {}
  }
  return null;
}

async function callGemini(prompt, temperature = 0.5) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 8192,
          responseMimeType: "application/json"
        }
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
  const parsed = extractJSON(rawText);
  if (!parsed) throw new Error("Failed to parse Gemini JSON");
  return parsed;
}

// ── Build the prompt with hard scene-count constraints ────────────
function buildShortsPrompt(fullScript, sectionPlan, shortsNiche, totalDuration) {
  const totalScenes = sectionPlan.reduce((s, p) => s + p.sceneCount, 0);

  const sectionInstructions = sectionPlan.map(p => {
    const visualRules = {
      hook:     'Full-screen kinetic text, word-by-word animation, dramatic background. Maximum energy.',
      tension:  'Stock footage montage, new clip every cut. Pain/problem visuals. Red highlights on numbers.',
      pivot:    'HARD CUT. Dark→bright colour shift. Single bold text line. Breath moment.',
      value:    'Teaching visuals. Rule number as header. 3 sub-segments of ~5 scenes each. Numbers in green/gold.',
      cta:      'Return to hook energy. "Save this" / "Follow" text. Loop tease. Urgency.',
      deadzone: 'Dark end card or silent loop-back frame. No voiceover. 1 scene only.',
    };
    return `  SECTION "${p.name}" — scenes ${p.firstScene}–${p.lastScene} (EXACTLY ${p.sceneCount} scenes, ${p.secPerScene}s each, total ${p.sectionDuration}s):
    ${visualRules[p.name] || 'Dynamic visuals matching script energy.'}`;
  }).join('\n');

  return `You are a YouTube Shorts visual director for a ${shortsNiche} channel.

Break this ${Math.round(totalDuration)}-second script into EXACTLY ${totalScenes} scenes.
This is a hard requirement — return EXACTLY ${totalScenes} scene objects, no more, no less.

SCRIPT:
${fullScript}

SECTION PLAN — follow these scene counts exactly:
${sectionInstructions}

SCENE DURATION RULE: Each scene's duration_seconds is pre-assigned below. Use these exact values:
${sectionPlan.map(p =>
  `  Scenes ${p.firstScene}–${p.lastScene}: ${p.secPerScene}s each`
).join('\n')}

VISUAL RULES:
- Every scene = one distinct visual. No two consecutive scenes use the same visual type.
- narration_text: split the script proportionally — earlier scenes get fewer words (hook is fast), value scenes get more.
- visual_description: describe the stock footage, graphic, or text treatment. Be specific (e.g. "close-up hands counting cash on a wooden desk" not "money").
- text_overlay: key number, rule label, or hook phrase that appears on screen. Empty string if none.
- camera_direction: one of zoom_in | zoom_out | pan_left | pan_right | push_in | static
- mood: 2-3 words
- audio_note: voice energy + music direction for this specific scene
- characters_present: array of character names who physically appear on screen. Use [] for stock footage / text / graphic scenes.

Return ONLY this JSON — no markdown, no explanation:
{
  "scenes": [
    {
      "scene_number": 1,
      "section": "hook",
      "narration_text": "exact spoken words for this scene",
      "duration_seconds": 1.5,
      "visual_description": "specific visual description",
      "camera_direction": "push_in",
      "text_overlay": "bold text if any",
      "mood": "2-3 words",
      "audio_note": "voice and music direction",
      "characters_present": []
    }
  ]
}`;
}

// ── Validate and repair AI output against the plan ────────────────
function validateAndRepair(scenesArr, sectionPlan) {
  const totalExpected = sectionPlan.reduce((s, p) => s + p.sceneCount, 0);

  // Remap section names and durations to match plan regardless of what AI returned
  let sceneIndex = 0;
  for (const section of sectionPlan) {
    for (let i = 0; i < section.sceneCount; i++) {
      const scene = scenesArr[sceneIndex];
      if (!scene) break;
      // Enforce correct scene number, section, and duration
      scene.scene_number = sceneIndex + 1;
      scene.section = section.name;
      scene.duration_seconds = section.secPerScene;
      sceneIndex++;
    }
  }

  // If AI returned fewer scenes, pad with placeholder scenes
  if (scenesArr.length < totalExpected) {
    console.warn(`⚠️ AI returned ${scenesArr.length} scenes, expected ${totalExpected} — padding missing scenes`);
    while (scenesArr.length < totalExpected) {
      const idx = scenesArr.length;
      // Find which section this index falls into
      let targetSection = sectionPlan[sectionPlan.length - 1];
      for (const s of sectionPlan) {
        if (idx < s.lastScene) { targetSection = s; break; }
      }
      scenesArr.push({
        scene_number: idx + 1,
        section: targetSection.name,
        narration_text: '',
        duration_seconds: targetSection.secPerScene,
        visual_description: 'Continuation of previous visual',
        camera_direction: 'static',
        text_overlay: '',
        mood: 'neutral',
        audio_note: 'Continue previous',
        characters_present: [],
      });
    }
  }

  // If AI returned too many, trim to exact count
  if (scenesArr.length > totalExpected) {
    console.warn(`⚠️ AI returned ${scenesArr.length} scenes, trimming to ${totalExpected}`);
    scenesArr = scenesArr.slice(0, totalExpected);
  }

  return scenesArr;
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  const callStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found.' }, { status: 400 });
    }

    const fullScript = script.full_script.trim();
    if (fullScript.length < 10) {
      return Response.json({ error: 'Script is too short.' }, { status: 400 });
    }

    // Get channel shorts niche
    let shortsNiche = 'finance';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      shortsNiche = channels[0]?.shorts_niche || project.shorts_niche || 'finance';
    } else {
      shortsNiche = project.shorts_niche || 'finance';
    }

    // ── Step 1: Calculate structure deterministically ─────────────
    const totalDuration = estimateDuration(fullScript);
    const sectionPlan   = buildSectionPlan(totalDuration);
    const totalScenes   = sectionPlan.reduce((s, p) => s + p.sceneCount, 0);

    console.log(`📱 Script: ~${totalDuration}s | ${totalScenes} scenes planned`);
    console.log(`   ${sectionPlan.map(p => `${p.name}(${p.sceneCount}×${p.secPerScene}s)`).join(' → ')}`);

    // ── Step 2: Ask Gemini to fill creative content ───────────────
    const prompt = buildShortsPrompt(fullScript, sectionPlan, shortsNiche, totalDuration);
    const result = await callGemini(prompt, 0.5);

    let scenesArr = result?.scenes;
    if (!scenesArr || !Array.isArray(scenesArr)) {
      throw new Error('Gemini did not return a scenes array');
    }

    // ── Step 3: Validate and enforce structure ────────────────────
    scenesArr = validateAndRepair(scenesArr, sectionPlan);

    // ── Step 4: Delete old scenes ─────────────────────────────────
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      for (let i = 0; i < oldScenes.length; i += 10) {
        await Promise.all(
          oldScenes.slice(i, i + 10).map(s =>
            base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})
          )
        );
      }
      console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
    }

    // ── Step 5: Build beat timing arrays ─────────────────────────
    const beatDurations  = scenesArr.map(s => s.duration_seconds);
    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => { beatStartTimes.push(Math.round(offset * 10) / 10); offset += d; });

    // ── Step 6: Save ProductionSettings ──────────────────────────
    const psPayload = {
      beat_durations:   JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `YouTube Short: ${project.name}`,
        narrative_arc_summary: 'Hook → Tension → Pivot → Value (3 rules) → CTA → Loop',
        visual_world: `Fast-paced ${shortsNiche} niche, 1 scene per 2s rhythm`,
        visual_format: 'shorts_rapid_cut',
        section_plan: sectionPlan,
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    // ── Step 7: Create scene records ─────────────────────────────
    const cameraMap = {
      zoom_in:  'slow_zoom_in',
      zoom_out: 'slow_zoom_out',
      pan_left: 'slow_pan',
      pan_right:'slow_pan',
      push_in:  'slow_zoom_in',
      static:   'static',
    };

    const sceneRecords = scenesArr.map(aiScene => {
      const directorNotes = {
        section:          aiScene.section,
        visual_description: aiScene.visual_description,
        camera_direction: aiScene.camera_direction || 'push_in',
        text_overlay:     aiScene.text_overlay || '',
        mood:             aiScene.mood || '',
        audio_note:       aiScene.audio_note || '',
        shorts_format:    true,
        characters_present: aiScene.characters_present || [],
      };
      return {
        project_id,
        scene_number:     aiScene.scene_number,
        narration_text:   aiScene.narration_text || '',
        image_prompt:     `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: aiScene.camera_direction || 'push_in',
        duration_seconds: aiScene.duration_seconds,
        camera_movement:  cameraMap[aiScene.camera_direction] || 'slow_zoom_in',
        animation_speed:  'normal',
        status:           'breakdown_ready',
        act:              aiScene.section || '',
        notes:            aiScene.text_overlay || '',
      };
    });

    // Bulk create in batches of 20 to avoid timeout
    for (let i = 0; i < sceneRecords.length; i += 20) {
      await base44.asServiceRole.entities.Scenes.bulkCreate(sceneRecords.slice(i, i + 20));
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status:       'breakdown_complete',
      current_step: 5,
      orientation:  'portrait',
    });

    const elapsed      = ((Date.now() - callStart) / 1000).toFixed(1);
    const totalSeconds = Math.round(offset * 10) / 10;
    const avgDuration  = (totalSeconds / sceneRecords.length).toFixed(2);

    console.log(`✅ Created ${sceneRecords.length} scenes in ${elapsed}s | total video ${totalSeconds}s | avg ${avgDuration}s/scene`);
    console.log(`   Section breakdown: ${sectionPlan.map(p => `${p.name}=${p.sceneCount}`).join(', ')}`);

    return Response.json({
      success:       true,
      done:          true,
      scenes_created: sceneRecords.length,
      total_duration: totalSeconds,
      avg_scene_duration: parseFloat(avgDuration),
      section_plan:  sectionPlan,
    });

  } catch (error) {
    console.error('❌ shortsSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});