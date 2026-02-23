import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE — CLIP-BUDGET AWARE
// ══════════════════════════════════════════════════════════════════
// Pipeline: Script → [THIS] → Compression Gate → Scene Prompts → Image Gen → Animation
//
// KEY PRINCIPLE: Voiceover duration is the HOLY GRAIL.
// Total clips = floor(voiceover_seconds / CLIP_DURATION).
// This budget is calculated BEFORE the LLM creates scenes,
// ensuring no runtime overflow from the very first step.
//
// ARCHITECTURE: Single-call, all phases processed in memory.
// Director notes stored as JSON in image_prompt field on each Scene.
// Prompt generator reads them from there — NO blueprint dependency.
// ══════════════════════════════════════════════════════════════════

const CLIP_DURATION = 5; // Each Veo clip = ~5 seconds
const MIN_CLIPS = 5;     // Floor — even a 15s video gets 5 visual beats
const MAX_CLIPS = 40;    // Ceiling — more than 40 = diminishing returns

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

      try { return JSON.parse(rawText); } catch (_) {}
      try { return JSON.parse(repairJSON(rawText)); } catch (_) {}

      let jsonStr = rawText;
      if (rawText.includes("```json")) jsonStr = rawText.split("```json")[1].split("```")[0].trim();
      else if (rawText.includes("```")) jsonStr = rawText.split("```")[1].split("```")[0].trim();
      try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}

      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }

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
// CLIP BUDGET CALCULATOR — VOICEOVER IS THE HOLY GRAIL
// ══════════════════════════════════════════════════════════════════
//
// Priority order:
//   1. voiceover_duration_seconds from ProductionSettings (gold standard)
//   2. Word count ÷ 150 wpm (reliable estimate for narration pace)
//   3. project.video_duration_minutes (user-set, fallback)
//
// Returns: { estimatedSeconds, maxClips, source }
// ══════════════════════════════════════════════════════════════════

async function calculateClipBudget(base44, project, wordCount) {
  let estimatedSeconds = 0;
  let source = 'unknown';

  // ── Tier 1: Check for actual voiceover duration ─────────────
  try {
    const settings = await base44.asServiceRole.entities.ProductionSettings.filter({
      project_id: project.id
    });
    const setting = settings[0];
    if (setting?.voiceover_duration_seconds && setting.voiceover_duration_seconds > 0) {
      estimatedSeconds = setting.voiceover_duration_seconds;
      source = 'voiceover_actual';
      console.log(`🎙️ Voiceover duration found: ${estimatedSeconds}s (from ProductionSettings)`);
    }
  } catch (_) {
    // ProductionSettings might not exist yet — that's fine
  }

  // ── Tier 2: Estimate from word count (150 wpm for narration) ──
  if (estimatedSeconds === 0 && wordCount > 0) {
    estimatedSeconds = Math.round((wordCount / 150) * 60);
    source = 'word_count_estimate';
    console.log(`📝 Estimated from ${wordCount} words @ 150 wpm: ${estimatedSeconds}s`);
  }

  // ── Tier 3: Fallback to project duration ────────────────────
  if (estimatedSeconds === 0) {
    const mins = project.video_duration_minutes || 2;
    estimatedSeconds = mins * 60;
    source = 'project_duration_fallback';
    console.log(`⚠️ Fallback to project duration: ${mins}min = ${estimatedSeconds}s`);
  }

  // ── Calculate clip budget ───────────────────────────────────
  const rawClips = Math.floor(estimatedSeconds / CLIP_DURATION);
  const maxClips = Math.max(MIN_CLIPS, Math.min(MAX_CLIPS, rawClips));

  console.log(`📊 Clip budget: ${estimatedSeconds}s ÷ ${CLIP_DURATION}s = ${rawClips} → clamped to ${maxClips} clips`);

  return { estimatedSeconds, maxClips, source };
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
// PHASE STRUCTURE — NOW BUDGET-AWARE
// ══════════════════════════════════════════════════════════════════

function calculatePhaseAllocation(maxClips) {
  // Emotional arc weighting — climax gets more density
  const phaseWeights = [
    { name: "cold_open", weight: 0.10, purpose: "Hook — visceral, immediate, intriguing. First emotional beat grabs the audience." },
    { name: "rising_tension", weight: 0.25, purpose: "Build the world and problem — escalate stakes. Each beat raises the emotional floor." },
    { name: "emotional_core", weight: 0.40, purpose: "Heart of story — maximum impact, key revelations. Most visual density here." },
    { name: "resolution", weight: 0.25, purpose: "Payoff — resolution, transformation, call to action. Land the emotional plane." }
  ];

  let remaining = maxClips;
  return phaseWeights.map((phase, index) => {
    if (index === phaseWeights.length - 1) return { ...phase, scenes: Math.max(1, remaining) };
    const scenes = Math.max(1, Math.round(maxClips * phase.weight));
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
// MAIN — BUDGET-AWARE BREAKDOWN
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
    const niche = project.niche || 'general';
    const nicheProfile = getNicheDirectorProfile(niche);

    // ══════════════════════════════════════════════════════════════
    // CLIP BUDGET — CALCULATED BEFORE ANY SCENE CREATION
    // ══════════════════════════════════════════════════════════════
    const budget = await calculateClipBudget(base44, project, wordCount);
    const maxClips = budget.maxClips;
    const estimatedSeconds = budget.estimatedSeconds;

    const phases = calculatePhaseAllocation(maxClips);
    const scriptChunks = splitScriptByPhase(finalScript, phases);

    // ── Delete existing scenes ──────────────────────────────────────
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
    console.log(`🎬 SCENE BREAKDOWN — CLIP-BUDGET AWARE`);
    console.log(`📖 ${wordCount} words | ⏱️ ~${estimatedSeconds}s runtime | 🎬 ${maxClips} clip budget (${budget.source})`);
    console.log(`📊 Phases: ${scriptChunks.map(c => `${c.phase}:${c.scenes}`).join(' → ')}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PASS 1: STORY ANALYSIS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const analysisPrompt = `You are a world-class film director. Study this script and understand its soul.

**FULL SCRIPT:**
${finalScript}

**NICHE:** ${niche} | **TOPIC:** ${project.name} | **RUNTIME:** ~${estimatedSeconds}s | **CLIP BUDGET:** ${maxClips} visual beats

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

    try {
      if (storyAnalysis.characters) {
        await base44.asServiceRole.entities.Projects.update(project_id, {
          character_descriptions: JSON.stringify(storyAnalysis.characters)
        });
      }
    } catch (_) {}

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PASS 2: SCENE BREAKDOWN — BUDGET-CONSTRAINED EMOTIONAL BEATS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const allScenes = [];
    let totalScenesCreated = 0;

    const characters = storyAnalysis.characters || [];
    const characterBlock = characters.length > 0
      ? `**CHARACTERS (EXACT descriptions for consistency):**\n${characters.map(c => `• ${c.name}: ${c.visual_description || ''}`).join('\n')}`
      : '';

    for (let batchIdx = 0; batchIdx < scriptChunks.length; batchIdx++) {
      const chunk = scriptChunks[batchIdx];
      const sceneOffset = totalScenesCreated;

      const prev = allScenes.slice(-3);
      const continuityCtx = prev.length > 0
        ? `**LAST ${prev.length} SCENES (continuity):**\n${prev.map(s => `Scene ${s.scene_number}: [${s.shot_type}] ${s.visual_concept} | Mood: ${s.mood}`).join('\n')}`
        : '**OPENING — establish the visual world with a strong first impression.**';

      if (batchIdx > 0) await new Promise(r => setTimeout(r, 2000));

      // ── Arc position determines animation energy ──────────────
      const arcGuidance = {
        cold_open: "SETUP pacing: wider shots, slower movements, establish the visual world. Camera should breathe — restrained but intriguing.",
        rising_tension: "RISING pacing: gradually tighter framing, increased movement energy. Push-ins, tracking shots. Build momentum with each beat.",
        emotional_core: "CLIMAX pacing: tightest framing, strongest motion, most dynamic compositions. This is the emotional peak — every frame must hit hard.",
        resolution: "RESOLUTION pacing: pull back, soften movement, widen shots. The emotional exhale. Gentle camera, contemplative compositions."
      };

      const breakdownPrompt = `You are a film director blocking EMOTIONAL BEATS, not sentences.

**CRITICAL CONSTRAINT: You have EXACTLY ${chunk.scenes} visual beats for this phase.**
Each beat = one ~${CLIP_DURATION}-second video clip. A beat represents an EMOTIONAL SHIFT, not a single line of narration.
Multiple narration sentences can play over a single visual beat (the camera holds while the voice continues).
The TOTAL video is ~${estimatedSeconds} seconds with ${maxClips} beats total. DO NOT create more beats than allocated.

**STORY:** Theme: ${storyAnalysis.central_theme} | Arc: ${storyAnalysis.narrative_arc_summary}
Visual World: ${storyAnalysis.visual_world} | Color Arc: ${storyAnalysis.color_arc}
Motifs: ${JSON.stringify(storyAnalysis.recurring_visual_motifs)}

${characterBlock}
${continuityCtx}

**PHASE: ${chunk.phase.toUpperCase()}** — ${chunk.purpose}
${arcGuidance[chunk.phase] || ''}
Create EXACTLY ${chunk.scenes} beats (numbers ${sceneOffset + 1} to ${sceneOffset + chunk.scenes})

**SCRIPT FOR THIS PHASE:**
${chunk.text}

**RULES:**
1. Beats = EMOTIONAL SHIFTS, not sentences. A director calls CUT when the FEELING changes, not when a sentence ends.
2. Multiple narration lines CAN and SHOULD map to a single beat if they share the same emotional energy.
3. Visual concept = SPECIFIC frozen moment (2-4 sentences), not a general idea.
4. Shot variety — NEVER consecutive duplicates: ECU, CU, MCU, MS, MWS, WS, EWS, OTS, INSERT, LOW ANGLE, HIGH ANGLE, DUTCH, POV
5. Emotional escalation within the phase. Each beat is MORE intense than the last.
6. Adjacent beats share ONE visual continuity thread.
7. Abstract → CONCRETE physical metaphors (inflation → receipt curling off counter).
8. Niche (${niche}): ${nicheProfile.visual_world} | Shots: ${nicheProfile.signature_shots} | AVOID: ${nicheProfile.avoid}
9. arc_position must reflect this phase's position in the story arc.
10. DISTRIBUTE ALL script text across your beats. Every word must be assigned. No narration left behind.

**RESPONSE:**
{
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1},
      "narration_text": "ALL script words that play during this visual beat (may be multiple sentences)",
      "visual_concept": "Rich 2-4 sentence cinematic frozen moment",
      "shot_type": "e.g. 'ECU — Extreme Close-Up'",
      "camera_angle": "e.g. 'Low angle, 15 degrees, left of center'",
      "camera_movement": "e.g. 'Slow push-in 5s, MS to MCU'",
      "lighting": "e.g. 'Single warm lamp left, deep shadows right, rim light window'",
      "color_palette": "e.g. 'Warm amber #D4A574, shadow brown #2C1810, cream #F5F0E8'",
      "mood": "2-3 words",
      "depth_of_field": "e.g. 'Shallow f/1.4, subject sharp, background bokeh'",
      "niche_visual_element": "One niche metaphor element",
      "continuity_bridge": "Visual thread to NEXT beat",
      "emotional_intensity": 0.5,
      "arc_position": "${chunk.phase === 'cold_open' ? 'setup' : chunk.phase === 'rising_tension' ? 'rising' : chunk.phase === 'emotional_core' ? 'climax' : 'resolution'}"
    }
  ]
}

EXACTLY ${chunk.scenes} beats. EVERY script word assigned to a beat. NO added narration. No text/charts in visuals.`;

      console.log(`🎬 Pass 2.${batchIdx + 1}: ${chunk.phase} (beats ${sceneOffset + 1}-${sceneOffset + chunk.scenes})...`);
      const batchResult = await callGemini(breakdownPrompt, 0.7, 16384);

      if (!batchResult.scenes || !Array.isArray(batchResult.scenes)) {
        console.error(`Phase ${chunk.phase} returned no scenes`);
        continue;
      }

      // ── Hard cap: only take chunk.scenes, ignore extras ──────
      const clampedScenes = batchResult.scenes.slice(0, chunk.scenes);
      if (batchResult.scenes.length > chunk.scenes) {
        console.warn(`⚠️ LLM returned ${batchResult.scenes.length} but budget is ${chunk.scenes} — clamped`);
      }

      const savePromises = clampedScenes.map(async (scene, i) => {
        const sceneNum = sceneOffset + i + 1;
        const cleanedNarration = cleanNarrationText(scene.narration_text);

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
          arc_position: scene.arc_position || chunk.phase,
          phase: chunk.phase
        };

        try {
          await base44.asServiceRole.entities.Scenes.create({
            project_id,
            scene_number: sceneNum,
            narration_text: cleanedNarration,
            image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
            animation_prompt: scene.camera_movement || "",
            duration_seconds: CLIP_DURATION,
            status: "breakdown_ready"
          });

          allScenes.push({ scene_number: sceneNum, ...directorNotes });
          return true;
        } catch (err) {
          console.error(`Failed to save scene ${sceneNum}:`, err.message);
          return false;
        }
      });

      const results = await Promise.all(savePromises);
      const created = results.filter(Boolean).length;
      totalScenesCreated += created;
      console.log(`✓ ${chunk.phase}: ${created} beats (total: ${totalScenesCreated}/${maxClips})`);
    }

    // ── Save blueprint + budget metadata ────────────────────────────
    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        scene_blueprint: JSON.stringify({
          story_analysis: storyAnalysis,
          clip_budget: {
            estimated_seconds: estimatedSeconds,
            max_clips: maxClips,
            clip_duration: CLIP_DURATION,
            source: budget.source,
            scenes_created: totalScenesCreated
          },
          scenes: allScenes
        })
      });
    } catch (_) { console.warn('scene_blueprint field may not exist — OK, data is on Scene records'); }

    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "breakdown_complete", current_step: 5
      });
    } catch (_) {}

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 BREAKDOWN COMPLETE — ${totalScenesCreated} beats for ${estimatedSeconds}s runtime`);
    console.log(`📊 Budget: ${totalScenesCreated}/${maxClips} clips used (${budget.source})`);
    if (totalScenesCreated > maxClips) {
      console.log(`⚠️ Over budget by ${totalScenesCreated - maxClips} — compression gate in generateScenePrompts will handle this`);
    }
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      done: true,
      story_analysis: {
        central_theme: storyAnalysis.central_theme,
        characters: storyAnalysis.characters?.length || 0,
        motifs: storyAnalysis.recurring_visual_motifs
      },
      clip_budget: {
        estimated_seconds: estimatedSeconds,
        max_clips: maxClips,
        clip_duration: CLIP_DURATION,
        source: budget.source
      },
      scenes_created: totalScenesCreated,
      total_target: maxClips,
      phases_completed: scriptChunks.map(c => `${c.phase}:${c.scenes}`)
    });

  } catch (error) {
    console.error("❌ generateSceneBreakdown error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});