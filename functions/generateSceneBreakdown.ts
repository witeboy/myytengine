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
    { name: "cold_open", weight: 0.15, purpose: "HOOK (first 30s) — MAXIMUM emotional intensity. Rapid-fire cuts, every 1.5-2s. Each scene must HIT viscerally. Convey the script's core emotion with overwhelming visual force. This is where viewers decide to stay or leave." },
    { name: "rising_tension", weight: 0.25, purpose: "Build the world and problem — escalate stakes. Each scene introduces a new micro-detail, angle, or emotional layer. Visual continuity threads MUST connect every pair of adjacent scenes." },
    { name: "emotional_core", weight: 0.35, purpose: "Heart of story — maximum impact, key revelations. Break every beat into multiple visual angles: wide establishing → medium reaction → close-up detail → extreme close-up emotion. Flow like a music video." },
    { name: "resolution", weight: 0.25, purpose: "Payoff — resolution, transformation, call to action. Mirror opening motifs. End with visual punch that echoes the hook." }
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

    // HYPER-GRANULAR DIRECTOR LOGIC: ~2.5x more scenes than before
    // Every emotional micro-beat, camera shift, lighting change, or character gesture = new scene
    // Where we had 2 scenes for an action, we now want 5 — each flowing into the next
    const GRANULARITY_MULTIPLIER = 2.5;
    const baseScenes = Math.max(10, Math.round((durationMinutes * 60) / 4));
    const totalTargetScenes = Math.round(baseScenes * GRANULARITY_MULTIPLIER);
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
    console.log(`📖 ${wordCount} words | ~${durationMinutes}min | 🎯 ${totalTargetScenes} scenes (${GRANULARITY_MULTIPLIER}x granular) | ${scriptChunks.length} phases`);
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

      // Continuity from last 5 scenes (more context for tighter visual flow)
      const prev = allScenes.slice(-5);
      const continuityCtx = prev.length > 0
        ? `**LAST ${prev.length} SCENES (VISUAL CONTINUITY — your scenes MUST flow from these):**\n${prev.map(s => `Scene ${s.scene_number}: [${s.shot_type}] ${s.visual_concept} | Mood: ${s.mood} | BRIDGE TO NEXT: ${s.continuity_to_next || 'N/A'}`).join('\n')}\n\n⚠️ Your FIRST scene in this batch MUST visually connect to Scene ${prev[prev.length - 1].scene_number} — use the same character, environment, object, or lighting direction as a bridge.`
        : '**OPENING — establish the visual world with a strong first impression. Your first scene sets the visual DNA for the entire video.**';

      if (batchIdx > 0) await new Promise(r => setTimeout(r, 2000));

      const isHookPhase = chunk.phase === 'cold_open';
      const hookIntensityNote = isHookPhase
        ? `\n\n**🔥 HOOK PHASE — MAXIMUM INTENSITY 🔥**
This is the FIRST 30 SECONDS. The viewer decides in 3 seconds whether to stay.
- EVERY scene must PUNCH with raw emotion — the CORE feeling of the entire script
- Cut FAST: 1.5-2.5 seconds per scene. Music-video pacing.
- Start with the most VISCERAL, SHOCKING, or EMOTIONALLY GRIPPING visual from the script
- Each scene in the hook escalates emotional intensity: 0.7 → 0.8 → 0.9 → 1.0
- Use the most EXTREME camera angles: ECU eyes, LOW ANGLE power, DUTCH unease, AERIAL scale
- Color palette should be BOLD and HIGH CONTRAST — no subtlety in the hook`
        : '';

      const breakdownPrompt = `You are a legendary film director known for breathtaking visual storytelling. You create HYPER-GRANULAR scene breakdowns where every micro-beat of emotion, every camera shift, every lighting change, every character gesture becomes its OWN scene. Where a lesser director would use 2 scenes, you use 5 — and each one FLOWS seamlessly into the next.

**STORY:** Theme: ${storyAnalysis.central_theme} | Arc: ${storyAnalysis.narrative_arc_summary}
Visual World: ${storyAnalysis.visual_world} | Color Arc: ${storyAnalysis.color_arc}
Motifs: ${JSON.stringify(storyAnalysis.recurring_visual_motifs)}

${characterBlock}
${continuityCtx}

**PHASE: ${chunk.phase.toUpperCase()}** — ${chunk.purpose}
Create EXACTLY ${chunk.scenes} scenes (numbers ${sceneOffset + 1} to ${sceneOffset + chunk.scenes})
${hookIntensityNote}

**SCRIPT:**
${chunk.text}

**HYPER-GRANULAR BREAKDOWN RULES:**

1. **MICRO-BEAT SPLITTING** — One sentence = 2-5 visual scenes. Break EVERY idea into:
   - WIDE establishing → MEDIUM reaction → CLOSE-UP detail → ECU emotion → CUTAWAY environment
   - Each emotional shift within a sentence is its own scene
   - Each new object, gesture, or visual element introduced = new scene
   - A character speaking = multiple scenes (face, hands, environment reaction, listener reaction)

2. **VISUAL CONTINUITY FLOW (CRITICAL)** — Adjacent scenes MUST share a VISUAL BRIDGE so they feel like one continuous shot sequence:
   - **CHARACTER FLOW**: Same character appears in consecutive scenes but from different angles/distances (wide → close → hands → eyes)
   - **BACKGROUND FLOW**: Same environment visible across 3-5 scenes, camera just moves within it
   - **ELEMENT FLOW**: A specific object, color, light source, or texture carries across scenes (e.g. a red scarf visible in 3 consecutive scenes from different angles)
   - **LIGHTING FLOW**: Light direction stays consistent across adjacent scenes (if key light is from left in scene 5, it stays left in scene 6)
   - **COLOR FLOW**: Color palette evolves GRADUALLY — no jarring shifts between adjacent scenes
   - For each scene, specify EXACTLY what visual element bridges TO the next scene AND what bridges FROM the previous scene

3. **CAMERA VARIETY** — NEVER 2 consecutive scenes with the same shot type:
   ECU, CU, MCU, MS, MWS, WS, EWS, OTS, INSERT, LOW ANGLE, HIGH ANGLE, DUTCH, POV, AERIAL, STEADICAM, HANDHELD, CRANE
   Use camera to convey EMOTION: low angle = power, high angle = vulnerability, dutch = unease, ECU = intimacy

4. **SCENE DURATION**: ${isHookPhase ? '1.5-2.5 seconds each (RAPID FIRE for hook)' : '2-4 seconds each. Shorter = better energy.'}

5. Visual concept = SPECIFIC frozen cinematic moment (3-5 sentences), incredibly detailed. Describe what's IN FRAME with physical precision.

6. Abstract concepts → CONCRETE physical metaphors (inflation → receipt curling off counter, time passing → shadows moving across floor).

7. Niche (${niche}): ${nicheProfile.visual_world} | Shots: ${nicheProfile.signature_shots} | AVOID: ${nicheProfile.avoid}

**CAMERA MOVEMENT GUIDE:**
- Reveal: Slow crane up, 5s
- Tension: Steadicam creep forward, slightly off-center
- Impact: Whip pan, 1s, hard stop
- Intimacy: Gentle dolly-in MS→CU
- Power: Low-angle tracking, wide lens
- Vulnerability: Overhead crane descending
- Urgency: Handheld micro-shake, pushing forward
- Contemplation: Static locked-off, subject moves within
- Transition: Lateral dolly slide revealing new environment

**RESPONSE:**
{
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1},
      "narration_text": "EXACT script words — keep VERY SHORT per scene, split text across ALL ${chunk.scenes} scenes",
      "visual_concept": "Rich 3-5 sentence cinematic frozen moment. Describe the EXACT physical contents of the frame with incredible detail.",
      "shot_type": "e.g. 'ECU — Extreme Close-Up' (MUST differ from adjacent scenes)",
      "camera_angle": "e.g. 'Low angle 15°, slightly left of center, lens 35mm'",
      "camera_movement": "SPECIFIC: 'Slow dolly push-in from MS to MCU over 3s, focus pulls at 2s mark'",
      "lighting": "EXACT setup: 'Hard key from upper left, soft fill right, warm practical lamp, rim light from window'",
      "color_palette": "e.g. 'Warm amber #D4A574, shadow brown #2C1810, cream #F5F0E8'",
      "mood": "2-3 words",
      "depth_of_field": "e.g. 'Shallow f/1.4, subject sharp, background bokeh circles visible'",
      "niche_visual_element": "One niche metaphor element reinforcing the emotion",
      "continuity_from_previous": "What visual element carries IN from the previous scene (character, background, object, light, color)",
      "continuity_to_next": "What visual element carries FORWARD to the next scene",
      "emotional_intensity": ${isHookPhase ? '0.8' : '0.5'},
      "duration_seconds": ${isHookPhase ? 2 : 3}
    }
  ]
}

EXACTLY ${chunk.scenes} scenes. EVERY script word allocated. NO added narration. No text in visuals. VERY SHORT narration per scene.`;

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
          continuity_from_previous: scene.continuity_from_previous,
          continuity_to_next: scene.continuity_to_next,
          continuity_bridge: scene.continuity_to_next || scene.continuity_bridge,
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
            animation_prompt: scene.camera_movement || "slow gentle camera drift forward with atmospheric particles",
            duration_seconds: scene.duration_seconds || 3,
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