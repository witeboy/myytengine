import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// SLEEP VISUAL BREAKDOWN ENGINE (v2)
// ══════════════════════════════════════════════════════════════════
// Instead of many short cinematic scenes, generates 8-12 gorgeous
// "ambient image" definitions with 5-15 minute holds each.
// Each image is topic-matched (forests for forests, planets for
// terraforming, etc.) with dreamy, painterly aesthetics.
// Ultra-slow Ken Burns (zoom/pan) on static AI images.
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

  const lastBrace = rawText.lastIndexOf('}');
  if (lastBrace === -1) throw new Error("Cannot recover JSON from Gemini response");
  const trimmed = rawText.substring(0, lastBrace + 1);
  for (const suffix of [']}', '}]}', '']) {
    try {
      const parsed = JSON.parse(trimmed + suffix);
      if (parsed.scenes && Array.isArray(parsed.scenes)) return parsed;
    } catch (_) {}
  }
  throw new Error("Failed to parse Gemini JSON after recovery");
}

function cleanNarrationText(text) {
  if (!text) return text;
  let cleaned = text;
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
// AMBIENT IMAGE PROMPT BUILDER
// ══════════════════════════════════════════════════════════════════

function buildAmbientImagePrompt({ scriptText, imageCount, topicTitle, isMeditation, durationMinutes }) {
  return `You are a visual art director for premium sleep content on YouTube. Your job is to design ${imageCount} GORGEOUS ambient images for a ${durationMinutes}-minute ${isMeditation ? 'guided meditation' : 'sleep story'}.

**CRITICAL CONTEXT**: These images will each be shown for 5-15 MINUTES with an ultra-slow Ken Burns effect (barely perceptible zoom/pan). Viewers glance at them before closing their eyes. The images are AMBIENT WALLPAPER, not storytelling — they set a mood.

**TOPIC**: "${topicTitle}"

**YOUR TASK**: Design ${imageCount} breathtaking images that are TOPIC-MATCHED to "${topicTitle}".

**VISUAL STYLE RULES**:
- Style: Dreamlike, painterly, warm. Think oil painting meets digital art. NOT photorealistic.
- Colors: Rich, warm, saturated but dark — deep blues, warm ambers, soft golds, midnight purples, emerald greens
- Lighting: Always gentle — golden hour, moonlight, candlelight, bioluminescence, aurora, starlight
- Composition: Simple, uncluttered, vast. Leave lots of breathing room. No busy details.
- Mood: Serene, peaceful, wonder-inducing, cozy
- NO text, NO people (unless very distant/silhouetted), NO faces, NO animals in focus
- NO bright daylight, NO harsh contrast, NO drama or tension
- Each image should work as a standalone piece of ambient art
- Progressive deepening: images get DARKER and MORE ABSTRACT toward the end

**TOPIC MATCHING** (this is CRITICAL):
- If the topic is about forests → forest scenes (moonlit groves, misty canopies, ancient trees)
- If about space/planets → cosmic scenes (nebulae, planet surfaces, star fields, auroras)
- If about oceans → ocean scenes (deep underwater, moonlit waves, coral reefs at night)
- If about history → atmospheric period settings (ancient libraries, castle corridors, candlelit chambers)
- If about science → abstract science visuals (molecular structures as art, crystalline formations, light phenomena)
- If about nature → nature scenes matching the specific topic (mountains, rivers, deserts at dusk)
- If about motivation/self → symbolic nature metaphors (paths through forests, mountains at dawn, calm rivers)
- ALWAYS tie visuals to the ACTUAL TOPIC while keeping the dreamy sleep aesthetic

**PROGRESSION ARC** (${imageCount} images):
1. First image: Most "awake" — still topic-relevant but warmly lit, inviting
2. Middle images: Gradually darker, more atmospheric, deeper into the visual world
3. Final 2-3 images: Near-abstract, very dark, hypnotic — barely-there details in darkness

**SCRIPT CONTEXT** (for topic understanding, NOT for scene-matching):
${scriptText.substring(0, 3000)}

**DURATION ALLOCATION**: Total ${durationMinutes} minutes. Distribute time across ${imageCount} images.
- Earlier images: slightly shorter (they're seen while listener is still awake)
- Later images: longer holds (listener is drifting off, doesn't need visual change)
- Suggested durations should sum to ${durationMinutes} minutes

Return JSON:
{
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "First ~${Math.floor(scriptText.split(/\\s+/).length / imageCount)} words of script here...",
      "visual_concept": "3-4 sentences describing a GORGEOUS, DREAMLIKE scene. Rich detail but simple composition. This is a painting prompt.",
      "image_prompt_core": "A single-paragraph AI image generation prompt. Painterly, dreamlike, rich colors. Include style keywords: 'digital painting, dreamy atmosphere, warm lighting, ambient, 4K, masterpiece quality'. Be very specific about colors, lighting direction, and composition.",
      "camera_movement": "ultra_slow_zoom_in|ultra_slow_zoom_out|ultra_slow_pan_left|ultra_slow_pan_right|imperceptible_drift",
      "color_palette": "e.g. midnight blue #0a1628, warm gold #d4a574, soft amber #c8956a",
      "mood": "2-3 words",
      "duration_minutes": 5,
      "topic_match": "Brief note on how this image connects to the topic"
    }
  ]
}

RULES:
1. Generate EXACTLY ${imageCount} images
2. Every image MUST relate to "${topicTitle}" — no generic images
3. image_prompt_core must be a COMPLETE, STANDALONE image generation prompt (not dependent on other images)
4. Distribute the full script text evenly across narration_text fields — use ALL the script words
5. Durations must sum to approximately ${durationMinutes} minutes
6. Style: painterly, dreamlike, NOT photorealistic. Include "digital painting, dreamlike" in every prompt.`;
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

    const isMeditation = project.project_mode === 'sleep_meditation';
    const finalScript = script.full_script;
    const wordCount = finalScript.split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);

    // Sleep content: 8-12 ambient images for the entire video
    // Short videos (10-15 min): 6-8 images
    // Medium videos (20-30 min): 8-10 images
    // Long videos (60+ min): 10-12 images
    const imageCount = Math.min(12, Math.max(6, Math.round(durationMinutes / 5) + 3));

    console.log(`🌙 Sleep ambient breakdown: ${durationMinutes}min → ${imageCount} ambient images | mode: ${project.project_mode}`);

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

    // Generate ambient image definitions
    const prompt = buildAmbientImagePrompt({
      scriptText: finalScript,
      imageCount,
      topicTitle: project.name,
      isMeditation,
      durationMinutes
    });

    console.log(`🎨 Generating ${imageCount} ambient image definitions...`);
    const result = await callGemini(prompt, 0.6);

    let scenesArr = result?.scenes;
    if (!scenesArr || !Array.isArray(scenesArr)) {
      console.error(`No scenes array in response. Keys: ${Object.keys(result || {}).join(',')}`);
      return Response.json({ error: 'AI failed to generate ambient images' }, { status: 500 });
    }

    // Calculate beat durations and start times
    const beatDurations = [];
    const beatStartTimes = [];
    let timeOffset = 0;

    for (const scene of scenesArr) {
      const durationSec = (scene.duration_minutes || (durationMinutes / imageCount)) * 60;
      beatDurations.push(durationSec);
      beatStartTimes.push(timeOffset);
      timeOffset += durationSec;
    }

    // Save beats to ProductionSettings
    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `${isMeditation ? 'Guided meditation' : 'Sleep story'}: ${project.name}`,
        narrative_arc_summary: 'Progressive relaxation with topic-matched ambient visuals',
        emotional_trajectory: ['wonder', 'calm', 'settling', 'deep_rest'],
        visual_world: `Dreamlike ambient scenes inspired by ${project.name}`,
        recurring_visual_motifs: ['warm light', 'gentle darkness', 'nature', 'atmosphere'],
        color_arc: 'warm amber → deep blue → midnight → near-darkness',
        visual_format: 'ambient_images_with_ken_burns'
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    // Create scene records
    let scenesCreated = 0;
    for (let i = 0; i < scenesArr.length; i++) {
      const scene = scenesArr[i];
      const sceneNum = i + 1;
      const durationSec = beatDurations[i] || (durationMinutes / imageCount) * 60;

      const cleanedNarration = cleanNarrationText(scene.narration_text || '');

      // Store the image prompt directly (not director notes) since these ARE the prompts
      const imagePrompt = scene.image_prompt_core || scene.visual_concept || '';

      const directorNotes = {
        visual_concept: scene.visual_concept,
        image_prompt_core: scene.image_prompt_core,
        camera_movement: scene.camera_movement || 'ultra_slow_zoom_out',
        color_palette: scene.color_palette,
        mood: scene.mood,
        duration_minutes: scene.duration_minutes || (durationMinutes / imageCount),
        topic_match: scene.topic_match,
        emotional_intensity: 0.15,
        sleep_visual_type: 'ambient_image',
        phase: 'sleep_ambient'
      };

      await base44.asServiceRole.entities.Scenes.create({
        project_id,
        scene_number: sceneNum,
        narration_text: cleanedNarration,
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: scene.camera_movement || 'ultra_slow_zoom_out',
        duration_seconds: durationSec,
        camera_movement: 'slow_zoom_out',
        animation_speed: 'very_slow',
        status: 'breakdown_ready'
      });

      scenesCreated++;
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'breakdown_complete',
      current_step: 5
    });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`🌙 Created ${scenesCreated} ambient image definitions in ${elapsed}s`);
    console.log(`📊 Durations: ${beatDurations.map(d => (d/60).toFixed(1) + 'min').join(', ')}`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: scenesCreated,
      total_target: imageCount,
      beat_durations: beatDurations,
      beat_start_times: beatStartTimes,
      visual_format: 'ambient_images_with_ken_burns'
    });

  } catch (error) {
    console.error('❌ sleepSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});