import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// SHORTS SCENE BREAKDOWN ENGINE v7
// Scene count derived from sentence structure — no hardcoded 40.
//
// SCENE RULES (shorts-optimised — faster cuts than long form):
// 1. Each sentence = 1 scene (script pacing is source of truth)
// 2. Sentence < 3 words + adjacent sentence also < 3 words → merge 1 scene
// 3. Sentence > 5 words → ceil(words / 5) scenes, IDENTICAL narration,
//    DIFFERENT camera angles per scene (same beat, fresh shot each cut)
//
// RESILIENCE: 6-layer JSON repair + Gemini → Claude Sonnet fallback
// CONTINUITY: last scene's narration + visual passed into next batch
// SCHEMA: 18-field cinematic director notes per scene
// ══════════════════════════════════════════════════════════════════

// ── JSON repair & extraction ─────────────────────────────────────────────────
function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

function extractJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') return null; 

  // Layer 1: direct parse
  try { return JSON.parse(rawText); } catch (_) {}

  // Layer 2: repair control chars and trailing commas
  try { return JSON.parse(repairJSON(rawText)); } catch (_) {}

  // Layer 3: strip markdown fences
  let jsonStr = rawText;
  if (rawText.includes("```json")) jsonStr = rawText.split("```json")[1].split("```")[0].trim();
  else if (rawText.includes("```")) jsonStr = rawText.split("```")[1].split("```")[0].trim();
  try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}

  // Layer 4: extract outermost JSON object
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
    try { return JSON.parse(repairJSON(match[0])); } catch (_) {}
  }

  // Layer 5: truncation repair — find last complete scene object
  const text = match ? match[0] : rawText;
  let repaired = text.replace(/,\s*\{[^}]*$/, '');
  repaired = repaired.replace(/,\s*\{[^}]*"[^"]*$/, '');
  repaired = repaired.replace(/,\s*$/, '');
  if (!repaired.endsWith(']}')) {
    if (!repaired.endsWith(']')) repaired += ']';
    if (!repaired.endsWith('}')) repaired += '}';
  }
  try {
    const result = JSON.parse(repaired);
    console.log(`🔧 JSON truncation repair recovered ${result.scenes?.length || 0} scenes`);
    return result;
  } catch (_) {}

  // Layer 6: find last complete }, then close
  const lastComplete = text.lastIndexOf('},');
  if (lastComplete > 0) {
    const finalAttempt = text.substring(0, lastComplete + 1) + ']}';
    try {
      const result = JSON.parse(finalAttempt);
      console.log(`🔧 JSON deep repair recovered ${result.scenes?.length || 0} scenes`);
      return result;
    } catch (_) {}
  }

  return null;
}

// ── Gemini 1.5 Pro ───────────────────────────────────────────────────────────
async function callGemini(prompt, systemText, temperature = 0.5) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try { const e = await response.json(); errMsg = e.error?.message || errMsg; } catch (_) {}
    throw new Error(`Gemini API error: ${errMsg}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    const finishReason = data.candidates?.[0]?.finishReason || 'unknown';
    throw new Error(`Gemini returned no text. finishReason: ${finishReason}`);
  }

  const parsed = extractJSON(rawText);
  if (parsed) return parsed;
  throw new Error(`Failed to parse Gemini JSON. Length: ${rawText.length} chars.`);
}

// ── Claude Sonnet 3.5 fallback ───────────────────────────────────────────────
async function callClaudeFallback(prompt, systemText, temperature = 0.5) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-3-5",
      max_tokens: 8000,
      temperature,
      system: systemText,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try { const e = await response.json(); errMsg = e.error?.message || errMsg; } catch (_) {}
    throw new Error(`Claude API error: ${errMsg}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text;
  if (!rawText) throw new Error("No response from Claude");

  const parsed = extractJSON(rawText);
  if (parsed) return parsed;
  throw new Error("Failed to parse Claude JSON after all repair attempts");
}

// ── Unified AI caller: Gemini first → Claude fallback ────────────────────────
async function callAI(prompt, temperature = 0.5) {
  const systemText = "You are a YouTube Shorts video editor. Return ONLY raw valid JSON. No markdown, no backticks, no conversational text.";
  try {
    const result = await callGemini(prompt, systemText, temperature);
    console.log(`✅ Gemini succeeded`);
    return result;
  } catch (geminiErr) {
    console.warn(`⚠️ Gemini failed: ${geminiErr.message} — falling back to Claude`);
  }
  const result = await callClaudeFallback(prompt, systemText, temperature);
  console.log(`✅ Claude fallback succeeded`);
  return result;
}

// ── Sentence splitter ────────────────────────────────────────────────────────
function splitIntoSentences(text) {
  const raw = text.match(/[^.!?…]+[.!?…]+["']?[\s]*/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}

// ── Word count helper ────────────────────────────────────────────────────────
function wordCount(text) {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// ── Build scene beats from sentences ────────────────────────────────────────
// Rule 1: each sentence = 1 scene
// Rule 2: sentence < 3 words + adjacent < 3 words → merge into 1 scene
// Rule 3: sentence > 5 words → ceil(words/5) scenes, same narration, diff angles
// Returns array of beat objects with full metadata for AI and duration math
function buildSceneBeats(sentences) {
  const beats = [];
  let i = 0;

  while (i < sentences.length) {
    const sentence = sentences[i];
    const wc = wordCount(sentence);

    // Rule 2: merge two adjacent ultra-short sentences
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

    // Rule 3: long sentence → multiple angle scenes (shorts threshold: > 5 words)
    if (wc > 5) {
      const totalAngles = Math.ceil(wc / 5);
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

// ── Narrative section label by position ─────────────────────────────────────
function getSectionLabel(pct) {
  if (pct < 0.10) return 'hook';
  if (pct < 0.25) return 'tension';
  if (pct < 0.35) return 'pivot';
  if (pct < 0.55) return 'value_1';
  if (pct < 0.72) return 'value_2';
  if (pct < 0.85) return 'value_3';
  if (pct < 0.95) return 'cta';
  return 'deadzone';
}

// ── Section visual direction hints for prompt ────────────────────────────────
function getSectionDirectionHint(section) {
  const hints = {
    hook:      'ECU/LOW ANGLE, camera already moving, kinetic text, most impactful frames. emotional_intensity=0.9',
    tension:   'MCU→CU progression, urgency visuals, problem escalating. emotional_intensity=0.8',
    pivot:     'HARD CUT, dutch angle or extreme low, color/energy shift. emotional_intensity=0.7',
    value_1:   'MS to MCU, first key insight with supporting visuals. emotional_intensity=0.6',
    value_2:   'MS to MCU, second key insight, building confidence. emotional_intensity=0.6',
    value_3:   'MCU to CU, third point, tension rising toward payoff. emotional_intensity=0.65',
    cta:       'Hook energy returns, ECU/LOW ANGLE, bold action text, urgency. emotional_intensity=0.85',
    deadzone:  'WIDE or static, dark card, no voice, subtle branding. emotional_intensity=0.1',
  };
  return hints[section] || 'MS, neutral energy. emotional_intensity=0.5';
}

// ── Chunk beats into sub-batches for AI (sequential for continuity) ──────────
const BEATS_PER_SUBBATCH = 12;

function chunkBeats(beats) {
  const chunks = [];
  for (let i = 0; i < beats.length; i += BEATS_PER_SUBBATCH) {
    chunks.push(beats.slice(i, i + BEATS_PER_SUBBATCH));
  }
  return chunks;
}

// ── Build AI prompt for a sub-batch ─────────────────────────────────────────
function makeBatchPrompt({
  chunk,
  globalStartScene,
  totalScenes,
  fullScript,
  shortsNiche,
  continuityNote,
}) {
  const beatList = chunk.map((beat, idx) => {
    const sceneNum = globalStartScene + idx;
    const pct = sceneNum / totalScenes;
    const section = getSectionLabel(pct);
    const angleNote = beat.is_multi_angle
      ? `[MULTI-ANGLE ${beat.angle_index + 1}/${beat.total_angles} — SAME narration, DISTINCT shot from other angles]`
      : '[SINGLE SCENE]';
    return `Scene ${sceneNum} | ${section} | ${angleNote}\nNarration: "${beat.narration_text}"`;
  }).join('\n\n');

  // Collect unique sections in this chunk for direction hints
  const sectionsInChunk = [...new Set(chunk.map((beat, idx) => {
    const pct = (globalStartScene + idx) / totalScenes;
    return getSectionLabel(pct);
  }))];
  const sectionHints = sectionsInChunk
    .map(s => `- ${s}: ${getSectionDirectionHint(s)}`)
    .join('\n');

  return `You are a YouTube Shorts video editor directing stock footage for a ${shortsNiche} channel.

FULL SCRIPT (for context only — do NOT rewrite narration):
${fullScript}

CONTINUITY FROM PRIOR BATCH: ${continuityNote}

SCENE STRUCTURE RULES — already pre-computed, follow exactly:
1. Each scene maps to one sentence from the script.
2. [MULTI-ANGLE] scenes carry IDENTICAL narration_text — the narrator says it ONCE, the video cuts to a FRESH visual angle. Make each angle visually distinct: different subject, framing, energy, shot type. Never repeat the same shot type across sibling angles.
3. [SINGLE SCENE] scenes are short punchy beats — one image, maximum impact.
4. Do NOT rewrite, split, merge, or alter any narration_text — use it exactly as given.

SHOT LAW: Never two consecutive identical shot_types. Shift angle minimum 30 degrees between scenes.

SECTIONS FOR THIS BATCH:
${sectionHints}

SCENES TO DIRECT (${chunk.length} scenes, scene numbers ${globalStartScene} to ${globalStartScene + chunk.length - 1}):
${beatList}

For each scene provide ALL fields:
- scene_number: integer as listed
- section: as listed
- narration_text: EXACT text as given — do not alter
- duration_seconds: 2.0 to 2.5 (shorts rhythm — every scene is a fast cut)
- visual_concept: director shot — camera position, subject, movement, atmosphere (2-3 sentences, specific stock footage)
- shot_type: one of [ECU, CU, MCU, MS, WS, EWS, POV, HIGH ANGLE, LOW ANGLE, DUTCH ANGLE]
- camera_angle: e.g. "Low angle 15 degrees shooting upward"
- camera_movement: e.g. "Hard push-in 20% zoom over 2s" or "Static locked"
- lighting: e.g. "Single hard backlight, cold blue rim, 80% shadow"
- color_palette: dominant colors with hex codes
- depth_of_field: e.g. "Shallow f/1.4 — subject sharp, background dissolving"
- mood: 2-3 words
- continuity_bridge: one object or light quality linking this scene to the NEXT
- emotional_intensity: 0.0 to 1.0
- viewer_emotion: feeling the viewer should have
- text_overlay: bold on-screen text or ""
- audio_note: voice energy (whisper/conversational/urgent/commanding) + music direction
- characters_present: [] for stock footage
- camera_direction: one of [zoom_in, zoom_out, pan_left, pan_right, static, push_in]

Return ONLY valid JSON — no markdown, no backticks:
{"scenes": [...]}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────
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

    // ── Step 1: Sentences → beats ────────────────────────────────────────────
    const sentences = splitIntoSentences(fullScript);
    console.log(`📝 Script: ${sentences.length} sentences detected`);

    const allBeats = buildSceneBeats(sentences);
    const totalScenes = allBeats.length;
    console.log(`📱 Shorts: ${sentences.length} sentences → ${totalScenes} scene beats (threshold: >5 words = multi-angle)`);

    // ── Step 2: Chunk beats for sequential AI processing ────────────────────
    const beatChunks = chunkBeats(allBeats);
    console.log(`🎬 Processing ${beatChunks.length} sub-batches of up to ${BEATS_PER_SUBBATCH} beats (sequential for continuity)`);

    // ── Step 3: Process each chunk sequentially — continuity flows forward ───
    const allAiScenes = [];
    let globalSceneNumber = 1;

    // Continuity state: updated after each batch and passed into the next
    let continuityNote = 'This is the opening of the video — maximum energy from frame one.';

    for (let bi = 0; bi < beatChunks.length; bi++) {
      const chunk = beatChunks[bi];

      const prompt = makeBatchPrompt({
        chunk,
        globalStartScene: globalSceneNumber,
        totalScenes,
        fullScript,
        shortsNiche,
        continuityNote,
      });

      console.log(`🎬 Sub-batch ${bi + 1}/${beatChunks.length}: ${chunk.length} beats (scenes ${globalSceneNumber}–${globalSceneNumber + chunk.length - 1})`);

      let subResult;
      try {
        subResult = await callAI(prompt, 0.5);
      } catch (err) {
        console.error(`❌ Sub-batch ${bi + 1} failed both AI models: ${err.message}`);
        // Minimal fallback: one scene per beat
        chunk.forEach((beat, idx) => {
          const sceneNum = globalSceneNumber + idx;
          const pct = sceneNum / totalScenes;
          allAiScenes.push({
            scene_number: sceneNum,
            section: getSectionLabel(pct),
            narration_text: beat.narration_text,
            duration_seconds: 2.25,
            visual_concept: `Stock footage matching: "${beat.narration_text.substring(0, 100)}"`,
            shot_type: 'MS',
            camera_angle: 'Eye-level, locked off',
            camera_movement: 'Static locked',
            lighting: 'Motivated practical lighting',
            color_palette: 'High contrast, saturated',
            depth_of_field: 'Shallow f/1.8',
            mood: 'engaged, urgent',
            continuity_bridge: 'neutral',
            emotional_intensity: 0.6,
            viewer_emotion: 'engaged',
            text_overlay: '',
            audio_note: 'conversational narration, subtle background music',
            characters_present: [],
            camera_direction: 'push_in',
            _beat: beat,
          });
        });
        globalSceneNumber += chunk.length;
        // Update continuity from fallback
        const lastFallback = allAiScenes[allAiScenes.length - 1];
        continuityNote = `Last scene (fallback): narration "${lastFallback.narration_text.slice(-80)}" | visual: stock footage | shot: MS`;
        continue;
      }

      const subScenes = subResult?.scenes;
      if (!subScenes || !Array.isArray(subScenes) || subScenes.length === 0) {
        console.warn(`⚠️ Sub-batch ${bi + 1}: no scenes returned — applying fallback`);
        chunk.forEach((beat, idx) => {
          const sceneNum = globalSceneNumber + idx;
          const pct = sceneNum / totalScenes;
          allAiScenes.push({
            scene_number: sceneNum,
            section: getSectionLabel(pct),
            narration_text: beat.narration_text,
            duration_seconds: 2.25,
            visual_concept: `Cinematic stock: "${beat.narration_text.substring(0, 100)}"`,
            shot_type: 'MCU',
            camera_angle: 'Eye-level',
            camera_movement: 'push_in',
            lighting: 'Natural motivated',
            color_palette: 'Warm, high contrast',
            depth_of_field: 'Shallow f/1.8',
            mood: 'focused',
            continuity_bridge: 'neutral',
            emotional_intensity: 0.6,
            viewer_emotion: 'curious',
            text_overlay: '',
            audio_note: 'conversational, light music',
            characters_present: [],
            camera_direction: 'push_in',
            _beat: beat,
          });
        });
        globalSceneNumber += chunk.length;
        const lastFallback = allAiScenes[allAiScenes.length - 1];
        continuityNote = `Last scene (fallback): narration "${lastFallback.narration_text.slice(-80)}" | shot: MCU`;
        continue;
      }

      // Attach beat, renumber, enforce narration integrity
      subScenes.forEach((scene, idx) => {
        const beat = chunk[idx] || chunk[chunk.length - 1];
        scene.scene_number = globalSceneNumber + idx;
        scene._beat = beat;
        // Narration integrity — AI must not alter the pre-computed text
        if (beat) scene.narration_text = beat.narration_text;
        allAiScenes.push(scene);
      });

      globalSceneNumber += subScenes.length;

      // ── Update continuity note for next batch ────────────────────────────
      const lastScene = subScenes[subScenes.length - 1];
      continuityNote = [
        `Last scene narration: "${(lastScene.narration_text || '').slice(-100)}"`,
        `Shot type: ${lastScene.shot_type || 'MS'}`,
        `Visual: ${(lastScene.visual_concept || '').substring(0, 120)}`,
        `Continuity bridge: ${lastScene.continuity_bridge || 'none specified'}`,
        `Mood: ${lastScene.mood || 'neutral'}`,
        `Color palette: ${lastScene.color_palette || 'unspecified'}`,
      ].join(' | ');

      console.log(`✅ Sub-batch ${bi + 1}: ${subScenes.length} scenes (continuity locked)`);
    }

    // ── Delete old scenes ────────────────────────────────────────────────────
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      await Promise.all(oldScenes.map(s =>
        base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})
      ));
    }

    // ── Beat durations ───────────────────────────────────────────────────────
    // Multi-angle scenes share the sentence's total speaking time split evenly.
    // Single scenes get their AI-assigned duration (2.0–2.5s shorts rhythm).
    const beatDurations = allAiScenes.map(s => {
      const beat = s._beat;
      if (beat?.is_multi_angle) {
        // Each angle gets an equal share of the sentence's total speaking time
        // but clamped to shorts rhythm (min 2.0s, max 2.5s)
        const totalSpeakingTime = beat.word_count / 2.5; // 150wpm
        const perAngle = totalSpeakingTime / beat.total_angles;
        return parseFloat(Math.min(2.5, Math.max(2.0, perAngle)).toFixed(2));
      }
      return parseFloat((s.duration_seconds || 2.25).toFixed(2));
    });

    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => {
      beatStartTimes.push(parseFloat(offset.toFixed(2)));
      offset += d;
    });

    // ── ProductionSettings ───────────────────────────────────────────────────
    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: `YouTube Short: ${project.name}`,
        narrative_arc_summary: 'Hook → Tension → Pivot → Value 1-3 → CTA → Deadzone',
        visual_world: `Fast-paced ${shortsNiche} | sentence-paced | ${allAiScenes.length} scenes | cut every 2-2.5s`,
        visual_format: 'shorts_rapid_cut',
      })
    };
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    // ── Camera map ───────────────────────────────────────────────────────────
    const cameraMap = {
      zoom_in: 'slow_zoom_in', zoom_out: 'slow_zoom_out',
      pan_left: 'slow_pan', pan_right: 'slow_pan',
      push_in: 'slow_zoom_in', static: 'static',
    };

    // ── Scene records ────────────────────────────────────────────────────────
    const sceneRecords = allAiScenes.map((aiScene, i) => {
      const beat = aiScene._beat || {};
      const directorNotes = {
        visual_concept: aiScene.visual_concept || '',
        shot_type: aiScene.shot_type || 'MS',
        camera_angle: aiScene.camera_angle || 'Eye-level, locked off',
        camera_movement: aiScene.camera_movement || 'Static locked',
        lighting: aiScene.lighting || 'Motivated practical lighting',
        color_palette: aiScene.color_palette || 'High contrast, saturated',
        depth_of_field: aiScene.depth_of_field || 'Shallow f/1.8',
        mood: aiScene.mood || '',
        continuity_bridge: aiScene.continuity_bridge || '',
        emotional_intensity: aiScene.emotional_intensity || 0.7,
        viewer_emotion: aiScene.viewer_emotion || '',
        section: aiScene.section || '',
        text_overlay: aiScene.text_overlay || '',
        audio_note: aiScene.audio_note || '',
        characters_present: aiScene.characters_present || [],
        camera_direction: aiScene.camera_direction || 'push_in',
        shorts_format: true,
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
        duration_seconds: beatDurations[i],
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
    console.log(`📱 Created ${sceneRecords.length} Shorts scenes in ${elapsed}s | ${sentences.length} sentences → ${totalScenes} beats | total runtime: ${offset.toFixed(1)}s`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: sceneRecords.length,
      sentence_count: sentences.length,
      total_duration: offset.toFixed(1),
    });

  } catch (error) {
    console.error('❌ shortsSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});