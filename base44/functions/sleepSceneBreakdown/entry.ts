import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v5 — Gemini 2.5 Pro primary, Claude fallback, bulkCreate, max 12 scenes, code-controlled durations
// ══════════════════════════════════════════════════════════════════
// SLEEP VISUAL BREAKDOWN ENGINE (v5)
// ══════════════════════════════════════════════════════════════════
// Generates 6-12 ambient environment image definitions.
// Narration is split in code (not by AI) to avoid timeout.
// AI only generates visual concepts + image prompts.
// NO PEOPLE — pure environment/landscape scenes.
// Primary: Gemini 2.5 Pro | Fallback: Claude Sonnet
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.5) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 6000,
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
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("No response from Gemini");

  try { return JSON.parse(rawText); } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Gemini JSON");
  }
}

async function callClaude(prompt, temperature = 0.5) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 6000,
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

// Call Gemini first, fall back to Claude on any error
async function callAI(prompt, temperature = 0.5) {
  try {
    console.log("🤖 Calling Gemini 2.5 Pro...");
    const result = await callGemini(prompt, temperature);
    console.log("✅ Gemini succeeded");
    return { result, provider: "gemini" };
  } catch (geminiErr) {
    console.warn(`⚠️ Gemini failed: ${geminiErr.message} — falling back to Claude...`);
    try {
      const result = await callClaude(prompt, temperature);
      console.log("✅ Claude fallback succeeded");
      return { result, provider: "claude" };
    } catch (claudeErr) {
      throw new Error(`Both AI providers failed. Gemini: ${geminiErr.message} | Claude: ${claudeErr.message}`);
    }
  }
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

    const finalScript = script.full_script;
    const wordCount = finalScript.split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);

    // Scene count — 1 per 5 min, floor 6, hard cap 12
    const imageCount = Math.min(12, Math.max(6, Math.round(durationMinutes / 5)));

    // Durations computed purely in code — AI has no say
    const durationSecPerScene = (durationMinutes * 60) / imageCount;

    console.log(`🌙 Sleep ambient breakdown: ${durationMinutes}min → ${imageCount} scenes @ ${(durationSecPerScene / 60).toFixed(1)}min each | mode: ${project.project_mode}`);

    // Delete old scenes in parallel
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));
      console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
    }

    // Split narration in code — don't ask AI to do it
    const narrationChunks = splitScriptIntoChunks(finalScript, imageCount);

    const prompt = `You are a visual art director for premium sleep content. Design ${imageCount} ambient environment images for a ${durationMinutes}-minute sleep story about "${project.name}".

RULES:
- Dark moody oil painting style, Rembrandt chiaroscuro, 70%+ shadow
- Colors: deep amber, burnt sienna, dark chocolate, midnight navy, warm gold highlights only
- Light sources: very dim candlelight, very dim moonlight, faint distant glow, dying campfire embers — always warm and VERY DIM
- Topic-matched to "${project.name}" — every image relates to the topic
- Progressive darkening: scene 1 has very dim warm glow, final scenes are nearly black
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

Return JSON with EXACTLY ${imageCount} scenes and nothing else — no markdown, no backticks, no explanation:
{
  "scenes": [
    {
      "scene_number": 1,
      "image_prompt_core": "Pure environment/landscape prompt with NO people or body parts. Example: 'A misty forest path at twilight, ancient oak trees with gnarled roots, golden fireflies drifting through heavy fog, dark moody oil painting, Rembrandt chiaroscuro lighting, deep shadow, warm amber rim light, burnt sienna and dark chocolate palette, low-key lighting, masterpiece quality, 70 percent shadow'",
      "camera_movement": "ultra_slow_zoom_in",
      "mood": "2-3 words"
    }
  ]
}

camera_movement must be one of: ultra_slow_zoom_in, ultra_slow_zoom_out, ultra_slow_pan_left, ultra_slow_pan_right
Alternate camera movements across scenes for visual variety.`;

    console.log(`🎨 Generating ${imageCount} ambient image definitions...`);
    const { result, provider } = await callAI(prompt, 0.6);

    let scenesArr = result?.scenes;
    if (!scenesArr || !Array.isArray(scenesArr)) {
      console.error(`No scenes array. Keys: ${Object.keys(result || {}).join(',')}`);
      return Response.json({ error: 'AI failed to generate ambient images' }, { status: 500 });
    }

    // Safety net — never exceed imageCount even if AI returns extras
    scenesArr = scenesArr.slice(0, imageCount);

    // Beat timing — all computed in code, perfectly even
    const beatDurations = Array(imageCount).fill(durationSecPerScene);
    const beatStartTimes = beatDurations.map((_, i) => i * durationSecPerScene);

    // Save ProductionSettings
    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `Sleep story: ${project.name}`,
        narrative_arc_summary: 'Progressive relaxation with topic-matched ambient visuals',
        emotional_trajectory: ['wonder', 'calm', 'settling', 'deep_rest'],
        visual_world: `Dreamlike ambient scenes inspired by ${project.name}`,
        recurring_visual_motifs: ['warm light', 'gentle darkness', 'nature', 'atmosphere'],
        color_arc: 'warm amber → deep blue → midnight → near-darkness',
        visual_format: 'ambient_images_with_ken_burns',
        ai_provider: provider
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    // bulkCreate instead of sequential creates
    const sceneRecords = scenesArr.map((aiScene, i) => {
      const cleanedNarration = cleanNarrationText(narrationChunks[i] || '');
      const directorNotes = {
        image_prompt_core: aiScene.image_prompt_core || '',
        camera_movement: aiScene.camera_movement || 'ultra_slow_zoom_out',
        mood: aiScene.mood || 'serene',
        duration_minutes: parseFloat((durationSecPerScene / 60).toFixed(2)),
        emotional_intensity: 0.15,
        sleep_visual_type: 'ambient_image',
        phase: 'sleep_ambient'
      };
      return {
        project_id,
        scene_number: i + 1,
        narration_text: cleanedNarration,
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: aiScene.camera_movement || 'ultra_slow_zoom_out',
        duration_seconds: durationSecPerScene,
        camera_movement: 'slow_zoom_out',
        animation_speed: 'very_slow',
        status: 'breakdown_ready'
      };
    });

    await base44.asServiceRole.entities.Scenes.bulkCreate(sceneRecords);

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'breakdown_complete',
      current_step: 5
    });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`🌙 Created ${sceneRecords.length} ambient scenes in ${elapsed}s via ${provider}`);
    console.log(`📊 Each scene: ${(durationSecPerScene / 60).toFixed(1)}min | Total: ${durationMinutes}min`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: sceneRecords.length,
      total_target: imageCount,
      scene_duration_minutes: parseFloat((durationSecPerScene / 60).toFixed(2)),
      total_duration_minutes: durationMinutes,
      beat_durations: beatDurations,
      beat_start_times: beatStartTimes,
      visual_format: 'ambient_images_with_ken_burns',
      ai_provider: provider
    });

  } catch (error) {
    console.error('❌ sleepSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});