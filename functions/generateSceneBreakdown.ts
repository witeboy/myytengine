import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE
// ══════════════════════════════════════════════════════════════════
// Pipeline: Script → [THIS] → Scene Prompts → Image Gen → Animation
//
// ARCHITECTURE: Single-call, all phases processed in memory.
// Director notes stored as JSON in image_prompt field on each Scene.
// Prompt generator reads them from there — NO blueprint dependency.
// ══════════════════════════════════════════════════════════════════

function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

async function callGemini(prompt, temperature = 0.7, maxTokens = 16384, retries = 3) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: "application/json" }
          })
        }
      );

      if (response.status === 429) {
        const waitMs = Math.pow(2, attempt + 1) * 5000;
        console.log(`Rate limited, waiting ${waitMs / 1000}s...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
      }

      const data = await response.json();
      if (!data.candidates?.length) throw new Error("No candidates from Gemini");
      const rawText = data.candidates[0].content.parts[0].text;

      // 3-stage JSON parsing
      try { return JSON.parse(rawText); } catch (_) {}
      try { return JSON.parse(repairJSON(rawText)); } catch (_) {}

      let jsonStr = rawText;
      if (rawText.includes("```json")) jsonStr = rawText.split("```json")[1].split("```")[0].trim();
      else if (rawText.includes("```")) jsonStr = rawText.split("```")[1].split("```")[0].trim();
      try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}

      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }

      // Truncation recovery
      const lastBrace = rawText.lastIndexOf('}');
      if (lastBrace > 0) {
        const trimmed = rawText.substring(0, lastBrace + 1);
        for (const suffix of [']}', '}]}', '']) {
          try {
            const parsed = JSON.parse(trimmed + suffix);
            if (parsed.scenes || parsed.story_analysis) return parsed;
          } catch (_) {}
        }
      }

      throw new Error("Failed to parse Gemini JSON after all recovery attempts");
    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`Attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// SCRIPT CLEANING
// ══════════════════════════════════════════════════════════════════

function cleanScriptText(text) {
  let cleaned = text;
  cleaned = cleaned.replace(/\[[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '');
  cleaned = cleaned.replace(/^[A-Z\s]+\(V\.?O\.?\)\s*:?\s*/gim, '');
  cleaned = cleaned.replace(/\*\*[^*]+\*\*:?\s*/g, '');
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  cleaned = cleaned.replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic|softly|urgent|compelling)[^)]*\)/gi, '');
  cleaned = cleaned.replace(/\(?\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?\)?/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

function cleanNarrationText(text) {
  if (!text) return text;
  let cleaned = text;
  cleaned = cleaned.replace(/\[[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '');
  cleaned = cleaned.replace(/^[A-Z\s]+\(V\.?O\.?\)\s*:?\s*/gim, '');
  cleaned = cleaned.replace(/\*\*[^*]+\*\*:?\s*/g, '');
  cleaned = cleaned.replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic|softly|urgent|compelling)[^)]*\)/gi, '');
  cleaned = cleaned.replace(/\(?\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?\)?/g, '');
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  cleaned = cleaned.replace(/\n{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

// ══════════════════════════════════════════════════════════════════
// NICHE DIRECTOR PROFILES
// ══════════════════════════════════════════════════════════════════

function getNicheDirectorProfile(niche) {
  const profiles = {
    finance: {
      visual_world: "Corporate glass towers vs intimate kitchen tables, Wall Street grandeur vs suburban vulnerability",
      signature_shots: "Overhead God's-eye documents, tight CU hands gripping objects, silhouettes against windows",
      metaphor_language: "Weight/lightness, containers overflowing/empty, bridges and chasms, seeds and harvest",
      emotional_palette: "Cool blues/grays shifting to warm ambers/golds, deep shadows, golden hour resolution",
      pacing_style: "Measured, deliberate — documentary gravitas with emotional swells",
      avoid: "Literal cash flying, generic stock offices, calculator close-ups"
    },
    retirement: {
      visual_world: "Golden-hour suburbs, well-worn family homes, generational gatherings, objects holding decades of memory",
      signature_shots: "Slow pans across photo mantles, weathered hands detail, depth through doorways",
      metaphor_language: "Seasons, paths and horizons, light through windows, roots and branches",
      emotional_palette: "Warm amber/honey, golden hour, earth tones, morning mist blues, sunset golds",
      pacing_style: "Gentle but purposeful — meaningful conversation over coffee",
      avoid: "Lonely elderly stereotypes, clinical settings, generic beach sunsets"
    },
    motivation: {
      visual_world: "Mountain peaks/valleys, training spaces, pre-dawn cities, sweat made beautiful",
      signature_shots: "Low-angle hero shots, tracking forward motion, silhouettes against epic backdrops",
      metaphor_language: "Elevation/ascent, fire/forge, dawn breaking, chains breaking, doors opening",
      emotional_palette: "Dark blues/blacks building to fiery oranges and triumphant golds",
      pacing_style: "Building momentum — steady climb with explosive peaks",
      avoid: "Cheesy flexing, generic mountaintop arms raised, lion/wolf imagery"
    },
    horror: {
      visual_world: "Liminal spaces, barely-lit corridors, familiar places made wrong, uncanny valley",
      signature_shots: "Dutch angles, long corridor depth, POV approach, static wide with something wrong",
      metaphor_language: "Decay, doors that shouldn't be open, reflections that don't match",
      emotional_palette: "Sickly greens, desaturated blues, deep blacks, crimson accents, fog",
      pacing_style: "Slow dread with sharp punctuation",
      avoid: "Over-the-top gore, cheap jump scares, cliché haunted house"
    },
    technology: {
      visual_world: "Clean labs and messy maker spaces, circuit patterns echoing nature, human meets digital",
      signature_shots: "Macro components, rack focus human/machine, reflections in screens",
      metaphor_language: "Networks, light through fiber, emergence/evolution, spark of creation",
      emotional_palette: "Cool blues/whites precision, warm ambers human moments, neon innovation",
      pacing_style: "Precise, rhythmic — elegance of systems with wonder at discovery",
      avoid: "Matrix code rain, cliché robots, hologram interfaces"
    },
    health: {
      visual_world: "Body as landscape, kitchens as labs, nature as pharmacy, self-care intimacy",
      signature_shots: "Macro food beauty, mindful human moments, nature parallels",
      metaphor_language: "Growth/cultivation, water/nourishment, dawn renewal, body as garden",
      emotional_palette: "Fresh greens, clean whites, warm skin tones, sunrise golds, cool blues",
      pacing_style: "Breathing rhythm — expansion/contraction, energy/rest",
      avoid: "Clinical imagery, shame shots, unrealistic body standards"
    },
    crime: {
      visual_world: "Rain-slicked streets, interrogation rooms, evidence boards, moral gray zones",
      signature_shots: "Noir low-key lighting, over-shoulder reveals, bird's-eye evidence, half-shadow profiles",
      metaphor_language: "Masks/mirrors, threads/webs, predator/prey, weight of truth",
      emotional_palette: "Deep noir blues/blacks, sodium oranges, forensic whites, blood red accents",
      pacing_style: "Tension ratcheting — each scene tightens the screw",
      avoid: "Gratuitous violence, sensationalized victims, cop show clichés"
    },
    history: {
      visual_world: "Weathered textures, vast landscapes dwarfing figures, artifacts as time portals",
      signature_shots: "Epic wides, slow zoom period details, then/now juxtaposition, artifact close-ups",
      metaphor_language: "Layers/excavation, rivers of time, monuments rising/crumbling",
      emotional_palette: "Sepia nostalgia, stone grays authority, jewel tones power, golden glory",
      pacing_style: "Epic sweep with intimate punctuation",
      avoid: "Cartoonish period stereotypes, too-clean historical settings"
    },
    education: {
      visual_world: "Light-filled spaces, the understanding moment, abstract made tangible, discovery joy",
      signature_shots: "Revealing wides, diagram compositions, POV discovery, teaching warmth",
      metaphor_language: "Illumination, puzzle pieces connecting, seeds of knowledge, lenses focusing",
      emotional_palette: "Bright clear colors, warm yellows aha-moments, cool blues contemplation",
      pacing_style: "Building understanding — each scene adds a layer",
      avoid: "Boring classrooms, lecturing framing, academic dryness"
    },
    travel: {
      visual_world: "Golden hour landscapes, local markets, contemplative foreign moments",
      signature_shots: "Sweeping drone establishing, street-level handheld, food macro, archway depth",
      metaphor_language: "Horizons/thresholds, cultural bridges, paths less traveled",
      emotional_palette: "Rich saturated local palettes, golden travel light, azure skies",
      pacing_style: "Wandering but purposeful — exploration with awe moments",
      avoid: "Brochure clichés, over-filtered Instagram, cultural stereotypes"
    },
    relationship: {
      visual_world: "Intimate shared spaces, geometry of two people, hands/gestures, environment as emotion",
      signature_shots: "Two-shots with negative space, OTS intimacy, hand details, distance/closeness wides",
      metaphor_language: "Bridges/walls, weather as mood, growing/wilting, light finding its way in",
      emotional_palette: "Warm amber connection, cool blues distance, soft rose intimacy, golden reconciliation",
      pacing_style: "Emotionally honest — ebbs and flows like real conversation",
      avoid: "Cheesy romance, toxic glorification, superficial beauty shots"
    }
  };

  return profiles[niche?.toLowerCase()] || {
    visual_world: "Environments reflecting narrative emotion, contrast between open/enclosed spaces",
    signature_shots: "Establishing wides, medium connection shots, close-up emotion, macro details",
    metaphor_language: "Light/shadow, doors opening/closing, rising/falling, seeds growing",
    emotional_palette: "Cool/muted for tension, warm/saturated for resolution, high contrast conflict",
    pacing_style: "Follows natural emotional rhythm of the story",
    avoid: "Generic stock aesthetics, repetitive compositions, literal abstract representations"
  };
}

// ══════════════════════════════════════════════════════════════════
// PHASE STRUCTURE
// ══════════════════════════════════════════════════════════════════

function calculatePhaseAllocation(totalTargetScenes) {
  const phaseWeights = [
    { name: "cold_open", weight: 0.10, purpose: "Hook — visceral, immediate, intriguing." },
    { name: "rising_tension", weight: 0.25, purpose: "Build the world and problem — escalate stakes." },
    { name: "emotional_core", weight: 0.40, purpose: "Heart of story — maximum impact, key revelations." },
    { name: "resolution", weight: 0.25, purpose: "Payoff — resolution, transformation, call to action." }
  ];

  let remaining = totalTargetScenes;
  return phaseWeights.map((phase, index) => {
    if (index === phaseWeights.length - 1) return { ...phase, scenes: Math.max(1, remaining) };
    const scenes = Math.max(1, Math.round(totalTargetScenes * phase.weight));
    remaining -= scenes;
    return { ...phase, scenes };
  });
}

function splitScriptByPhase(script, phases) {
  const sentences = script.match(/[^.!?]+[.!?]+[\s]*/g) || [script];
  const totalSentences = sentences.length;
  const totalPhaseScenes = phases.reduce((a, b) => a + b.scenes, 0);
  let cursor = 0;
  const chunks = [];

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const proportion = phase.scenes / totalPhaseScenes;
    const sentenceCount = Math.max(1, Math.round(totalSentences * proportion));
    const isLast = i === phases.length - 1;
    const endCursor = isLast ? totalSentences : Math.min(cursor + sentenceCount, totalSentences);
    const segment = sentences.slice(cursor, endCursor).join("").trim();
    if (segment.length > 0) {
      chunks.push({ phase: phase.name, purpose: phase.purpose, scenes: phase.scenes, text: segment });
    }
    cursor = endCursor;
  }
  return chunks;
}

// ══════════════════════════════════════════════════════════════════
// MAIN — ALL PHASES IN ONE CALL
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, selected_hook } = await req.json();

    // ── Fetch project + script (parallel) ──────────────────────────
    const [projects, allScripts] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scripts.filter({ project_id })
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found.' }, { status: 400 });
    }

    // ── Clean script ───────────────────────────────────────────────
    const cleanedScript = cleanScriptText(script.full_script);
    let finalScript = cleanedScript;
    if (selected_hook) {
      finalScript = `${selected_hook}. ${cleanedScript.replace(selected_hook, "").trim()}`;
    }

    const wordCount = finalScript.split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    const niche = project.niche || 'general';
    const nicheProfile = getNicheDirectorProfile(niche);

    const MAX_SCENE_SECONDS = 5;
    const totalTargetScenes = Math.max(8, Math.round((durationMinutes * 60) / MAX_SCENE_SECONDS));
    const phases = calculatePhaseAllocation(totalTargetScenes);
    const scriptChunks = splitScriptByPhase(finalScript, phases);

    // ── Delete existing scenes (parallel) ──────────────────────────
    try {
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id)));
    } catch (_) {}

    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown", current_step: 5
      });
    } catch (_) {}

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 SCENE BREAKDOWN — ALL PHASES IN ONE CALL`);
    console.log(`📖 ${wordCount} words | ~${durationMinutes}min | 🎯 ${totalTargetScenes} scenes | ${scriptChunks.length} phases`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PASS 1: STORY ANALYSIS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const analysisPrompt = `You are a world-class film director. Study this script and understand its soul.

**FULL SCRIPT:**
${finalScript}

**NICHE:** ${niche} | **TOPIC:** ${project.name} | **DURATION:** ~${durationMinutes}min | **SCENES:** ${totalTargetScenes}

Respond with JSON:
{
  "story_analysis": {
    "central_theme": "The deeper human truth (NOT the topic)",
    "narrative_arc_summary": "2-3 sentence emotional journey",
    "emotional_trajectory": ["curiosity", "concern", "empathy", "hope"],
    "key_turning_points": ["Emotional shift 1", "Stakes escalation", "Climax"],
    "visual_world": "SPECIFIC sensory description — textures, environments, lighting",
    "recurring_visual_motifs": ["Motif 1", "Motif 2", "Motif 3"],
    "color_arc": "How palette shifts across the video",
    "characters": [
      {
        "name": "Character name/archetype",
        "visual_description": "EXACT: age, gender, ethnicity, build, hair, clothing, features",
        "emotional_arc": "How they change"
      }
    ]
  }
}

NICHE (${niche}): Visual World: ${nicheProfile.visual_world} | Palette: ${nicheProfile.emotional_palette} | AVOID: ${nicheProfile.avoid}`;

    console.log(`🎬 Pass 1: Story Analysis...`);
    const analysisResult = await callGemini(analysisPrompt, 0.6, 8192);
    const storyAnalysis = analysisResult.story_analysis || analysisResult;

    console.log(`✓ Theme: ${storyAnalysis.central_theme}`);
    console.log(`✓ Characters: ${storyAnalysis.characters?.map(c => c.name).join(', ') || 'None'}`);

    // Save characters (non-blocking)
    try {
      if (storyAnalysis.characters) {
        await base44.asServiceRole.entities.Projects.update(project_id, {
          character_descriptions: JSON.stringify(storyAnalysis.characters)
        });
      }
    } catch (_) {}

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PASS 2: SCENE BREAKDOWN — All phases, in memory
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const allScenes = []; // In-memory accumulator
    let totalScenesCreated = 0;

    const characters = storyAnalysis.characters || [];
    const characterBlock = characters.length > 0
      ? `**CHARACTERS (EXACT descriptions for consistency):**\n${characters.map(c => `• ${c.name}: ${c.visual_description || ''}`).join('\n')}`
      : '';

    for (let batchIdx = 0; batchIdx < scriptChunks.length; batchIdx++) {
      const chunk = scriptChunks[batchIdx];
      const sceneOffset = totalScenesCreated;

      // Continuity from last 3 scenes
      const prev = allScenes.slice(-3);
      const continuityCtx = prev.length > 0
        ? `**LAST ${prev.length} SCENES (continuity):**\n${prev.map(s => `Scene ${s.scene_number}: [${s.shot_type}] ${s.visual_concept} | Mood: ${s.mood}`).join('\n')}`
        : '**OPENING — establish the visual world with a strong first impression.**';

      if (batchIdx > 0) await new Promise(r => setTimeout(r, 2000));

      const breakdownPrompt = `You are a legendary film director known for breathtaking visual storytelling and dynamic cinematography. You must block this script into MANY short, punchy scenes — each one a distinct visual beat with a UNIQUE camera setup.

**STORY:** Theme: ${storyAnalysis.central_theme} | Arc: ${storyAnalysis.narrative_arc_summary}
Visual World: ${storyAnalysis.visual_world} | Color Arc: ${storyAnalysis.color_arc}
Motifs: ${JSON.stringify(storyAnalysis.recurring_visual_motifs)}

${characterBlock}
${continuityCtx}

**PHASE: ${chunk.phase.toUpperCase()}** — ${chunk.purpose}
Create EXACTLY ${chunk.scenes} scenes (numbers ${sceneOffset + 1} to ${sceneOffset + chunk.scenes})

**SCRIPT:**
${chunk.text}

**CRITICAL RULES:**
1. MORE SCENES = BETTER ENERGY. Split aggressively — every idea, beat, emotion shift, or emphasis change deserves its own scene. A single sentence can be 2 scenes if the visual changes.
2. Scenes = VISUAL BEATS not sentences. Director calls CUT when the visual concept changes.
3. Each scene is SHORT (3-6 seconds). Quick cuts create energy and flow.
4. Visual concept = SPECIFIC frozen cinematic moment (2-4 sentences), incredibly detailed.
5. **CAMERA IS EVERYTHING** — each scene MUST have a DISTINCT camera setup that serves the story:
   - Shot variety: ECU, CU, MCU, MS, MWS, WS, EWS, OTS, INSERT, LOW ANGLE, HIGH ANGLE, DUTCH, POV, AERIAL, STEADICAM, HANDHELD, CRANE
   - NEVER 2 consecutive scenes with the same shot type
   - Use camera to convey EMOTION: low angle = power/dominance, high angle = vulnerability, dutch = unease, ECU = intimacy/tension, wide = isolation/grandeur
   - camera_movement MUST be SPECIFIC and CINEMATIC: "Slow dolly push-in from MS to MCU over 5s, slight left drift" NOT just "slow zoom"
6. Emotional escalation within the phase — build momentum with increasingly dynamic camera work.
7. Adjacent scenes share ONE visual continuity thread (color, object, gesture, lighting direction).
8. Abstract concepts → CONCRETE physical metaphors (inflation → receipt curling off counter, time passing → shadows moving across floor).
9. Niche (${niche}): ${nicheProfile.visual_world} | Shots: ${nicheProfile.signature_shots} | AVOID: ${nicheProfile.avoid}

**CAMERA MOVEMENT GUIDE — use these to create FLOW:**
- Emotional reveal: Slow crane up revealing scene, 5s
- Tension: Steadicam creep forward, tracking subject, slightly off-center
- Impact: Whip pan left-to-right, 1s, hard stop on subject
- Intimacy: Gentle dolly-in from MS to CU, barely perceptible drift
- Power: Low-angle tracking shot, moving with subject, wide lens distortion
- Vulnerability: Slow overhead crane descending toward subject
- Urgency: Handheld with deliberate micro-shake, pushing forward
- Contemplation: Static locked-off frame, subject moves within, atmospheric particles drift
- Transition: Lateral dolly slide revealing new environment

**RESPONSE:**
{
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1},
      "narration_text": "EXACT script words for this scene — keep it SHORT per scene",
      "visual_concept": "Rich 2-4 sentence cinematic frozen moment with incredible detail",
      "shot_type": "e.g. 'ECU — Extreme Close-Up' or 'LOW ANGLE — Wide Shot'",
      "camera_angle": "e.g. 'Low angle 15°, slightly left of center, lens 35mm'",
      "camera_movement": "SPECIFIC cinematic direction: 'Slow dolly push-in from MS to MCU over 5s, slight left drift, focus pulls from background to subject at 3s mark'",
      "lighting": "e.g. 'Hard key light from upper left, soft fill from right, warm practical lamp in frame, rim light from window behind'",
      "color_palette": "e.g. 'Warm amber #D4A574, shadow brown #2C1810, cream #F5F0E8'",
      "mood": "2-3 words",
      "depth_of_field": "e.g. 'Shallow f/1.4, subject sharp, background bokeh circles visible'",
      "niche_visual_element": "One niche metaphor element that reinforces the emotion",
      "continuity_bridge": "Visual thread to NEXT scene — what carries over",
      "emotional_intensity": 0.5,
      "duration_seconds": 5
    }
  ]
}

EXACTLY ${chunk.scenes} scenes. EVERY script word allocated to a scene. NO added narration. No text/charts in visuals. SHORT narration per scene — split the text across all ${chunk.scenes} scenes evenly.`;

      console.log(`🎬 Pass 2.${batchIdx + 1}: ${chunk.phase} (scenes ${sceneOffset + 1}-${sceneOffset + chunk.scenes})...`);
      const batchResult = await callGemini(breakdownPrompt, 0.7, 16384);

      if (!batchResult.scenes || !Array.isArray(batchResult.scenes)) {
        console.error(`Phase ${chunk.phase} returned no scenes`);
        continue;
      }

      // Save scenes to DB (parallel) — director notes stored as JSON in image_prompt
      const savePromises = batchResult.scenes.map(async (scene, i) => {
        const sceneNum = sceneOffset + i + 1;
        const cleanedNarration = cleanNarrationText(scene.narration_text);

        // Package ALL directorial data into a JSON blob
        const directorNotes = {
          visual_concept: scene.visual_concept,
          shot_type: scene.shot_type,
          camera_angle: scene.camera_angle,
          camera_movement: scene.camera_movement,
          lighting: scene.lighting,
          color_palette: scene.color_palette,
          mood: scene.mood,
          depth_of_field: scene.depth_of_field,
          niche_visual_element: scene.niche_visual_element,
          continuity_bridge: scene.continuity_bridge,
          emotional_intensity: scene.emotional_intensity || 0.5,
          phase: chunk.phase
        };

        try {
          await base44.asServiceRole.entities.Scenes.create({
            project_id,
            scene_number: sceneNum,
            narration_text: cleanedNarration,
            // Director notes stored HERE — prompt generator reads from this
            image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
            animation_prompt: scene.camera_movement || "",
            duration_seconds: scene.duration_seconds || 8,
            status: "breakdown_ready"
          });

          // Track in memory for continuity
          allScenes.push({
            scene_number: sceneNum,
            ...directorNotes
          });

          return true;
        } catch (err) {
          console.error(`Failed to save scene ${sceneNum}:`, err.message);
          return false;
        }
      });

      const results = await Promise.all(savePromises);
      const created = results.filter(Boolean).length;
      totalScenesCreated += created;
      console.log(`✓ ${chunk.phase}: ${created} scenes (total: ${totalScenesCreated})`);
    }

    // ── Try saving blueprint (non-blocking bonus) ──────────────────
    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        scene_blueprint: JSON.stringify({
          story_analysis: storyAnalysis,
          total_target_scenes: totalTargetScenes,
          scenes: allScenes
        })
      });
    } catch (_) { console.warn('scene_blueprint field may not exist — OK, data is on Scene records'); }

    // ── Mark complete ──────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "breakdown_complete", current_step: 5
      });
    } catch (_) {}

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 BREAKDOWN COMPLETE — ${totalScenesCreated} scenes across ${scriptChunks.length} phases`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      done: true,
      story_analysis: {
        central_theme: storyAnalysis.central_theme,
        characters: storyAnalysis.characters?.length || 0,
        motifs: storyAnalysis.recurring_visual_motifs
      },
      scenes_created: totalScenesCreated,
      total_target: totalTargetScenes,
      phases_completed: scriptChunks.map(c => c.phase)
    });

  } catch (error) {
    console.error("❌ generateSceneBreakdown error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});