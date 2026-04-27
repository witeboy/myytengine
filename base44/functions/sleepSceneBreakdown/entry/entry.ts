import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed
// ══════════════════════════════════════════════════════════════════
// SLEEP VISUAL BREAKDOWN ENGINE (v3)
// ══════════════════════════════════════════════════════════════════
// Generates ambient environment image definitions.
// Narration is split in code (not by AI) to avoid timeout.
// AI only generates visual concepts + image prompts.
// NO PEOPLE — pure environment/landscape scenes. 
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
        generationConfig: { temperature, maxOutputTokens: 4096, responseMimeType: "application/json" }
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

// Split script into N roughly-equal chunks, breaking at sentence boundaries
function splitScriptIntoChunks(scriptText, chunkCount) {
  const sentences = scriptText.split(/(?<=[.!?…])\s+/).filter(s => s.trim().length > 0);
  const totalSentences = sentences.length;
  const perChunk = Math.ceil(totalSentences / chunkCount);
  const chunks = [];
  for (let i = 0; i < chunkCount; i++) {
    const start = i * perChunk;
    const end = Math.min(start + perChunk, totalSentences);
    chunks.push(sentences.slice(start, end).join(' '));
  }
  return chunks;
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

    // ~1 image per 4 min for long, ~1.8 min for short; min 6, max 15
    const imageCount = Math.min(15, Math.max(6, Math.round(durationMinutes / 4) + 3));

    console.log(`🌙 Sleep ambient breakdown: ${durationMinutes}min → ${imageCount} images | mode: ${project.project_mode}`);

    // Delete old scenes
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      let deleted = 0;
      for (const s of oldScenes) {
        try {
          await base44.asServiceRole.entities.Scenes.delete(s.id);
          deleted++;
        } catch (e) {
          if (e.message?.includes('Rate limit')) {
            await new Promise(r => setTimeout(r, 2000));
            try { await base44.asServiceRole.entities.Scenes.delete(s.id); deleted++; } catch (_) {}
          }
        }
      }
      console.log(`🗑️ Deleted ${deleted}/${oldScenes.length} old scenes`);
    }

    // Split narration in code — don't ask AI to do it
    const narrationChunks = splitScriptIntoChunks(finalScript, imageCount);

    // Ask Gemini ONLY for visual concepts (small output)
    const prompt = `You are a visual art director for premium sleep content. Design ${imageCount} ambient environment images for a ${durationMinutes}-minute ${isMeditation ? 'guided meditation' : 'sleep story'} about "${project.name}".

RULES:
- Dark moody oil painting style, Rembrandt chiaroscuro, 70%+ shadow
- Colors: deep amber, burnt sienna, dark chocolate, midnight navy, warm gold highlights only
- Light sources: very dim candlelight, very dim moonlight, faint distant glow, dying campfire embers — always warm and VERY DIM, barely visible
- Topic-matched to "${project.name}" — every image relates to the topic
- Progressive darkening: image 1 has very dim warm glow, final images are nearly black
- ALL light must be described as "very dim" or "faint" — never just "candlelight" or "moonlight" alone
- Simple compositions with lots of dark negative space

ABSOLUTE PROHIBITION — ZERO TOLERANCE:
- NEVER include ANY human figures, people, persons, characters, silhouettes, or shadows of people
- NEVER include ANY body parts: hands, fingers, feet, legs, arms, face, eyes, skin, torso, shoulders, hair, lips, head
- NEVER include human-occupied furniture: beds, chairs, sofas, desks with items on them
- NEVER include clothing, shoes, accessories, or any object implying human presence
- NEVER use words like: person, figure, someone, viewer, listener, character, protagonist, woman, man, child
- Every scene must be a PURE ENVIRONMENT or LANDSCAPE — nature, architecture, still life, abstract atmosphere
- If the topic involves people, represent it through SYMBOLIC environments (empty paths, distant lights, weathered doors) — NEVER through human forms

Return JSON with EXACTLY ${imageCount} scenes:
{
  "scenes": [
    {
      "scene_number": 1,
      "image_prompt_core": "Pure environment/landscape prompt with NO people or body parts. Example: 'A misty forest path at twilight, ancient oak trees with gnarled roots, golden fireflies drifting through heavy fog, dark moody oil painting, Rembrandt chiaroscuro lighting, deep shadow, warm amber rim light, burnt sienna and dark chocolate palette, low-key lighting, masterpiece quality, 70 percent shadow'",
      "camera_movement": "ultra_slow_zoom_in|ultra_slow_zoom_out|ultra_slow_pan_left|ultra_slow_pan_right (ONLY camera motion — NO light animation, NO shine, NO rays, NO glow changes)",
      "mood": "2-3 words",
      "duration_minutes": ${(durationMinutes / imageCount).toFixed(1)}
    }
  ]
}`;

    console.log(`🎨 Generating ${imageCount} ambient image definitions...`);
    const result = await callGemini(prompt, 0.6);

    let scenesArr = result?.scenes;
    if (!scenesArr || !Array.isArray(scenesArr)) {
      console.error(`No scenes array. Keys: ${Object.keys(result || {}).join(',')}`);
      return Response.json({ error: 'AI failed to generate ambient images' }, { status: 500 });
    }

    // Calculate beat durations
    const beatDurations = [];
    const beatStartTimes = [];
    let timeOffset = 0;

    for (let i = 0; i < imageCount; i++) {
      const scene = scenesArr[i];
      const durationSec = scene ? (scene.duration_minutes || (durationMinutes / imageCount)) * 60 : (durationMinutes / imageCount) * 60;
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

    // Create scene records — narration from code, visuals from AI
    let scenesCreated = 0;
    for (let i = 0; i < imageCount; i++) {
      const aiScene = scenesArr[i] || {};
      const sceneNum = i + 1;
      const durationSec = beatDurations[i];
      const cleanedNarration = cleanNarrationText(narrationChunks[i] || '');

      const directorNotes = {
        image_prompt_core: aiScene.image_prompt_core || '',
        camera_movement: aiScene.camera_movement || 'ultra_slow_zoom_out',
        mood: aiScene.mood || 'serene',
        duration_minutes: aiScene.duration_minutes || (durationMinutes / imageCount),
        emotional_intensity: 0.15,
        sleep_visual_type: 'ambient_image',
        phase: 'sleep_ambient'
      };

      await base44.asServiceRole.entities.Scenes.create({
        project_id,
        scene_number: sceneNum,
        narration_text: cleanedNarration,
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: aiScene.camera_movement || 'ultra_slow_zoom_out',
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