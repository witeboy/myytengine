import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE
// ══════════════════════════════════════════════════════════════════
// Pipeline: Script → [THIS] → Scene Prompts → Image Gen → Animation
//
// ARCHITECTURE: Processes ALL phases in a SINGLE call.
//   1. Story Analysis Pass (director reads full script)
//   2. Scene Breakdown Pass × N phases (sequential, in-memory)
//   3. All scenes saved to DB with status "breakdown_ready"
//
// No cross-call state. No scene_blueprint field required.
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
        console.log(`Rate limited, waiting ${waitMs / 1000}s (retry ${attempt + 1}/${retries})...`);
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
      if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch (_) {}
      }

      // Truncation recovery for scenes arrays
      const lastBrace = rawText.lastIndexOf('}');
      if (lastBrace > 0) {
        const trimmed = rawText.substring(0, lastBrace + 1);
        for (const suffix of [']}', '}]}', '']) {
          try {
            const parsed = JSON.parse(trimmed + suffix);
            if (parsed.scenes && Array.isArray(parsed.scenes)) {
              console.log(`Recovered ${parsed.scenes.length} scenes from truncated JSON`);
              return parsed;
            }
            if (parsed.story_analysis) return parsed;
            return parsed;
          } catch (_) {}
        }
      }

      throw new Error("Failed to parse Gemini JSON after all recovery attempts");

    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`Gemini attempt ${attempt + 1} failed: ${error.message}, retrying...`);
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
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');
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
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');
  cleaned = cleaned.replace(/\n{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

// ══════════════════════════════════════════════════════════════════
// NICHE DIRECTOR PROFILES
// ══════════════════════════════════════════════════════════════════

function getNicheDirectorProfile(niche) {
  const profiles = {
    finance: {
      visual_world: "Corporate glass towers vs intimate kitchen tables, Wall Street grandeur vs suburban vulnerability, the contrast between institutional coldness and human warmth",
      signature_shots: "Overhead God's-eye-view of documents/desk chaos, tight CU of hands gripping/releasing objects, wide shots of empty rooms that should be full, silhouettes against floor-to-ceiling windows",
      metaphor_language: "Weight and lightness (burden vs freedom), containers (overflowing vs empty), bridges and chasms, erosion and growth, seeds and harvest",
      emotional_palette: "Cool institutional blues/grays shifting to warm ambers/golds as hope enters, deep shadows for uncertainty, golden hour for resolution",
      pacing_style: "Measured, deliberate — think documentary gravitas with emotional swells",
      avoid: "Literal money shots (cash flying), generic stock office scenes, cliché calculator close-ups"
    },
    retirement: {
      visual_world: "Golden-hour suburbs, well-worn family homes, nature trails, generational gatherings, the quiet dignity of aging, objects that hold decades of memory",
      signature_shots: "Slow pans across photo-filled mantles, hands-in-detail shots (weathered, strong), wide establishing shots of homes at different times of day, depth-layered shots through doorways/windows",
      metaphor_language: "Seasons (autumn warmth, spring renewal), paths and horizons, light through windows, roots and branches, the patina of well-loved objects",
      emotional_palette: "Warm amber and honey tones, soft golden hour light, gentle earth tones, morning mist blues for uncertainty, sunset golds for peace",
      pacing_style: "Gentle but purposeful — the rhythm of a meaningful conversation over coffee",
      avoid: "Depressing lonely elderly stereotypes, clinical medical settings, generic beach sunsets"
    },
    motivation: {
      visual_world: "Mountain peaks and valley floors, training spaces, pre-dawn cities, the moment before action, sweat and determination made beautiful",
      signature_shots: "Low-angle hero shots, tracking shots following forward motion, extreme wide-to-tight punch-ins, silhouettes against epic backdrops, slow-motion peak moments",
      metaphor_language: "Elevation and ascent, fire and forge, dawn breaking, chains breaking, doors opening, first steps and finish lines",
      emotional_palette: "Dark moody blues/blacks building to fiery oranges and triumphant golds, high contrast, dramatic rim lighting",
      pacing_style: "Building momentum — steady climb with explosive peaks, like a great film score",
      avoid: "Cheesy flexing/posing, generic mountain top arms raised, overused lion/wolf imagery"
    },
    horror: {
      visual_world: "Liminal spaces, barely-lit corridors, familiar places made wrong, the uncanny valley of ordinary life, nature at its most indifferent",
      signature_shots: "Dutch angles for unease, long corridor shots with depth, POV approaching something, static wide shots where something is subtly wrong, extreme CU of details that shouldn't be there",
      metaphor_language: "Decay and contamination, doors that shouldn't be open, reflections that don't match, familiar spaces turned alien, the feeling of being watched",
      emotional_palette: "Sickly greens, desaturated blues, deep blacks with pockets of unnatural light, crimson accents, fog and haze",
      pacing_style: "Slow dread build with sharp punctuation — long holds broken by sudden shifts",
      avoid: "Over-the-top gore, cheap jump scare framing, cliché haunted house imagery"
    },
    technology: {
      visual_world: "Clean laboratories and messy maker spaces, circuit patterns that echo natural forms, the human hand meeting the digital interface, data made physical",
      signature_shots: "Macro lens detail shots of components/textures, rack focus between human and machine, wide clean architectural frames, reflections in screens showing faces",
      metaphor_language: "Networks and connections, light traveling through fiber/glass, emergence and evolution, the spark of creation, invisible forces made visible",
      emotional_palette: "Cool electric blues and clean whites for precision, warm ambers for human moments, neon accents for innovation, deep space blacks for the unknown",
      pacing_style: "Precise and rhythmic — the elegance of well-designed systems, with wonder at discovery moments",
      avoid: "Generic Matrix-style code rain, cliché robot imagery, glowing hologram interfaces"
    },
    health: {
      visual_world: "The human body as landscape, kitchens as laboratories of nourishment, nature as pharmacy, the intimacy of self-care rituals, transformation over time",
      signature_shots: "Macro beauty shots of foods/ingredients, medium shots of mindful human moments, before/during/after visual progressions, nature parallel shots (body as ecosystem)",
      metaphor_language: "Growth and cultivation, water and nourishment, dawn as renewal, the body as garden, building and rebuilding, rhythm and balance",
      emotional_palette: "Fresh greens and earth tones, clean bright whites, warm skin tones, sunrise golds for energy, cool blues for calm/recovery",
      pacing_style: "Breathing rhythm — expansion and contraction, energy and rest, tension and release",
      avoid: "Clinical medical imagery, before/after shame shots, unrealistic body standards, pill/supplement focus"
    },
    crime: {
      visual_world: "Rain-slicked streets, interrogation rooms, evidence boards, the boundary between order and chaos, moral gray zones made visual",
      signature_shots: "Noir-influenced low-key lighting, over-shoulder reveals, bird's-eye evidence layouts, handheld tension sequences, profile shots half in shadow",
      metaphor_language: "Masks and mirrors, threads and webs, doors locked and unlocked, predator and prey, the weight of truth",
      emotional_palette: "Deep noir blues and blacks, sodium vapor oranges, cool forensic whites, blood reds as accents, fog and rain as atmosphere",
      pacing_style: "Tension ratcheting — each scene tightens the screw, with release only at key reveals",
      avoid: "Gratuitous violence imagery, sensationalized victim portrayal, cop show clichés"
    },
    history: {
      visual_world: "Weathered textures and patina, vast landscapes that dwarf human figures, artifacts as portals to the past, the layers of time visible in architecture and nature",
      signature_shots: "Epic wide establishing shots, slow zooms into period details, juxtaposition of then/now, God's-eye battlefield views, intimate artifact close-ups",
      metaphor_language: "Layers and excavation, rivers of time, echoes and shadows, monuments rising and crumbling, flame being passed",
      emotional_palette: "Sepia warmth for nostalgia, cool stone grays for authority, rich jewel tones for power, muted earth tones for common people, golden light for glory moments",
      pacing_style: "Epic sweep with intimate punctuation — the vast and the personal interleaved",
      avoid: "Cartoonish period stereotypes, overly clean/new-looking historical settings, anachronisms"
    },
    education: {
      visual_world: "Light-filled learning spaces, the moment of understanding on a face, abstract concepts made tangible through visual metaphor, the joy of discovery",
      signature_shots: "Revealing wide shots that put concepts in context, diagram-like compositions, POV discovery shots, warm interpersonal teaching moments",
      metaphor_language: "Illumination and clarity, puzzle pieces connecting, paths branching, seeds of knowledge growing, lenses focusing",
      emotional_palette: "Bright, clear colors for clarity, warm yellows for aha-moments, cool blues for contemplation, vibrant variety for engagement",
      pacing_style: "Building understanding — each scene adds a layer, like a great lecture that keeps you leaning forward",
      avoid: "Boring classroom stereotypes, lecturing-at-audience framing, overly academic dryness"
    },
    travel: {
      visual_world: "Golden hour landscapes, bustling local markets, quiet contemplative moments in foreign places, the contrast between tourist gaze and authentic life",
      signature_shots: "Sweeping drone-style establishing shots, intimate street-level handheld, food and texture macro shots, golden hour silhouettes, depth shots through archways",
      metaphor_language: "Horizons and thresholds, bridges between cultures, paths less traveled, windows into other worlds, the compass pointing forward",
      emotional_palette: "Rich saturated location-specific palettes, golden travel light, deep azure skies, warm market tones, cool mountain blues",
      pacing_style: "Wandering but purposeful — the rhythm of exploration with moments of awe",
      avoid: "Tourist brochure clichés, over-filtered Instagram aesthetics, cultural stereotypes"
    },
    relationship: {
      visual_world: "Intimate shared spaces, the geometry of two people, hands and gestures, the environment reflecting emotional states, doorways and thresholds",
      signature_shots: "Two-shots with meaningful negative space, OTS intimate perspectives, detail shots of hands/gestures, wide shots showing distance or closeness, mirror and reflection shots",
      metaphor_language: "Bridges and walls, weather reflecting mood, growing and wilting, light finding its way in, two halves of a whole",
      emotional_palette: "Warm amber for connection, cool blues for distance, soft rose for intimacy, harsh white for conflict, golden hour for reconciliation",
      pacing_style: "Emotionally honest — ebbs and flows like a real conversation between people who matter to each other",
      avoid: "Cheesy romance clichés, toxic relationship glorification, superficial beauty shots"
    }
  };

  const defaultProfile = {
    visual_world: "Environments that reflect the emotional state of the narrative, contrast between open and enclosed spaces, the interplay of light and shadow as emotional indicators",
    signature_shots: "Establishing wides for context, medium shots for connection, close-ups for emotion, macro details for emphasis, variety in angle and movement",
    metaphor_language: "Light and shadow, open and closed doors, rising and falling, building and breaking, seeds growing into trees, rivers finding their path",
    emotional_palette: "Colors that track the emotional arc — cooler and more muted for tension, warmer and more saturated for resolution, high contrast for conflict, soft gradients for peace",
    pacing_style: "Follows the natural emotional rhythm of the story — building where it needs to build, breathing where it needs to breathe",
    avoid: "Generic stock photo aesthetics, repetitive compositions, literal visual representations of abstract concepts without metaphor"
  };

  return profiles[niche?.toLowerCase()] || defaultProfile;
}

// ══════════════════════════════════════════════════════════════════
// PHASE STRUCTURE
// ══════════════════════════════════════════════════════════════════

function calculatePhaseAllocation(totalTargetScenes) {
  const phaseWeights = [
    { name: "cold_open", weight: 0.10, purpose: "Hook the viewer — visceral, immediate, intriguing. Creates the question that demands an answer." },
    { name: "rising_tension", weight: 0.25, purpose: "Build the world and the problem — escalate stakes, deepen understanding, create investment in the outcome." },
    { name: "emotional_core", weight: 0.40, purpose: "The heart of the story — maximum emotional impact, key revelations, the moments viewers will remember." },
    { name: "resolution", weight: 0.25, purpose: "Deliver the payoff — resolution, transformation, call to action. Leave the viewer changed." }
  ];

  let remaining = totalTargetScenes;
  return phaseWeights.map((phase, index) => {
    if (index === phaseWeights.length - 1) {
      return { ...phase, scenes: Math.max(1, remaining) };
    }
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
// MAIN HANDLER — ALL BATCHES IN ONE CALL
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
      return Response.json({ error: 'No final script found. Generate the full script first.' }, { status: 400 });
    }

    // ── Clean and prepare script ───────────────────────────────────
    const cleanedScript = cleanScriptText(script.full_script);
    let finalScript = cleanedScript;

    if (selected_hook) {
      const scriptWithoutHook = cleanedScript.replace(selected_hook, "").trim();
      finalScript = `${selected_hook}. ${scriptWithoutHook}`;
    }

    const wordCount = finalScript.split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    const niche = project.niche || 'general';
    const nicheProfile = getNicheDirectorProfile(niche);

    // ── Calculate scene targets ────────────────────────────────────
    const MAX_SCENE_SECONDS = 8;
    const totalTargetScenes = Math.max(8, Math.round((durationMinutes * 60) / MAX_SCENE_SECONDS));
    const phases = calculatePhaseAllocation(totalTargetScenes);
    const scriptChunks = splitScriptByPhase(finalScript, phases);

    // ── Delete existing scenes (parallel) ──────────────────────────
    try {
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id)));
      console.log(`Deleted ${oldScenes.length} existing scenes`);
    } catch (delErr) {
      console.warn('Delete existing scenes failed:', delErr.message);
    }

    // Update project status
    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown",
        current_step: 5
      });
    } catch (_) {}

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 SCENE BREAKDOWN ENGINE — ALL PHASES IN ONE CALL`);
    console.log(`📖 Words: ${wordCount} | ⏱️ ~${durationMinutes}min | 🎯 ${totalTargetScenes} scenes`);
    console.log(`🎨 Niche: ${niche} | Phases: ${scriptChunks.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PASS 1: STORY ANALYSIS — Director reads the full script
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const analysisPrompt = `You are a world-class film director preparing to shoot a visual narrative.

BEFORE you break anything into scenes, STUDY the entire script and understand its soul.

**FULL SCRIPT:**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${finalScript}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**NICHE:** ${niche}
**TOPIC:** ${project.name}
**DURATION:** ~${durationMinutes} minutes
**SCENES PLANNED:** ${totalTargetScenes}

**YOUR DIRECTOR'S ANALYSIS — respond with this JSON:**
{
  "story_analysis": {
    "central_theme": "The ONE core idea — the deeper human truth, NOT just the topic",
    "narrative_arc_summary": "2-3 sentence emotional journey from start to finish",
    "emotional_trajectory": ["curiosity", "concern", "empathy", "hope", "determination"],
    "key_turning_points": ["Moment 1 where emotion shifts", "Moment 2 where stakes escalate", "Moment 3 climax"],
    "visual_world": "SPECIFIC sensory description of this story's visual universe — textures, environments, lighting",
    "recurring_visual_motifs": ["Motif 1", "Motif 2", "Motif 3"],
    "color_arc": "How the palette shifts across the video",
    "characters": [
      {
        "name": "Character name or archetype",
        "visual_description": "EXACT physical: age, gender, ethnicity, build, hair, clothing, distinguishing features",
        "emotional_arc": "How this character changes emotionally"
      }
    ]
  }
}

**PRINCIPLES:**
- "central_theme" is NOT the topic. It's the HUMAN truth underneath.
- "visual_world" must be SPECIFIC and sensory, not generic.
- "characters" must be precise enough that 20 artists would draw the same person.
- "key_turning_points" are EMOTIONAL shifts, not topic changes.

**NICHE SENSIBILITY (${niche}):**
- Visual World: ${nicheProfile.visual_world}
- Signature Shots: ${nicheProfile.signature_shots}
- Metaphor Language: ${nicheProfile.metaphor_language}
- Emotional Palette: ${nicheProfile.emotional_palette}
- AVOID: ${nicheProfile.avoid}`;

    console.log(`🎬 Pass 1: Story Analysis...`);
    const analysisResult = await callGemini(analysisPrompt, 0.6, 8192);
    const storyAnalysis = analysisResult.story_analysis || analysisResult;

    console.log(`✓ Theme: ${storyAnalysis.central_theme}`);
    console.log(`✓ Characters: ${storyAnalysis.characters?.map(c => c.name).join(', ') || 'None'}`);
    console.log(`✓ Motifs: ${storyAnalysis.recurring_visual_motifs?.join(', ') || 'N/A'}`);

    // Try to save character descriptions (non-blocking)
    try {
      if (storyAnalysis.characters) {
        await base44.asServiceRole.entities.Projects.update(project_id, {
          character_descriptions: JSON.stringify(storyAnalysis.characters)
        });
      }
    } catch (_) { console.warn('Could not save character_descriptions to project'); }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PASS 2: SCENE BREAKDOWN — All phases sequentially, in memory
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const allBlueprintScenes = []; // In-memory — no DB dependency
    let totalScenesCreated = 0;

    // Load characters for consistency block
    const characters = storyAnalysis.characters || [];
    const characterBlock = characters.length > 0
      ? `**ESTABLISHED CHARACTERS (use EXACT descriptions for consistency):**
${characters.map(c => `  • ${c.name}: ${c.visual_description || ''}`).join('\n')}`
      : '';

    for (let batchIdx = 0; batchIdx < scriptChunks.length; batchIdx++) {
      const chunk = scriptChunks[batchIdx];
      const sceneOffset = totalScenesCreated;

      // Continuity from last 3 scenes
      const previousScenes = allBlueprintScenes.slice(-3);
      const continuityContext = previousScenes.length > 0
        ? `**LAST ${previousScenes.length} SCENES (visual continuity):**
${previousScenes.map(s => `  Scene ${s.scene_number}: [${s.shot_type}] ${s.visual_concept} | Mood: ${s.mood}`).join('\n')}`
        : '**This is the OPENING — establish the visual world with a strong first impression.**';

      // Small delay between batches to avoid rate limits
      if (batchIdx > 0) await new Promise(r => setTimeout(r, 2000));

      const breakdownPrompt = `You are a world-class film director blocking out scenes.

**STORY ANALYSIS:**
- Central Theme: ${storyAnalysis.central_theme}
- Narrative Arc: ${storyAnalysis.narrative_arc_summary}
- Emotional Trajectory: ${JSON.stringify(storyAnalysis.emotional_trajectory)}
- Turning Points: ${JSON.stringify(storyAnalysis.key_turning_points)}
- Visual World: ${storyAnalysis.visual_world}
- Motifs: ${JSON.stringify(storyAnalysis.recurring_visual_motifs)}
- Color Arc: ${storyAnalysis.color_arc}

${characterBlock}

${continuityContext}

**CURRENT PHASE: ${chunk.phase.toUpperCase()}**
Purpose: ${chunk.purpose}
Scenes to create: ${chunk.scenes}
Scene numbers: ${sceneOffset + 1} through ${sceneOffset + chunk.scenes}

**SCRIPT SEGMENT:**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${chunk.text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**━━━━ DIRECTOR'S RULES ━━━━**

🎬 RULE 1: SCENES = VISUAL BEATS, NOT SENTENCES
A scene changes when the VISUAL changes. Three sentences about one moment = ONE scene.

🎬 RULE 2: VISUAL CONCEPT = SPECIFIC FROZEN MOMENT
WRONG: "A person looking worried about money"
RIGHT: "Extreme close-up of weathered hands slowly closing around a faded family photograph, edges worn soft. Single warm lamp light from left creates deep shadows across knuckles. Shallow DOF dissolves cluttered kitchen table into warm bokeh."

🎬 RULE 3: SHOT VARIETY — NEVER consecutive duplicates
Cycle: ECU, CU, MCU, MS, MWS, WS, EWS, OTS, INSERT/DETAIL, LOW ANGLE, HIGH ANGLE, DUTCH, POV

🎬 RULE 4: EMOTIONAL ESCALATION within the phase

🎬 RULE 5: VISUAL CONTINUITY — adjacent scenes share ONE visual thread

🎬 RULE 6: ABSTRACT → CONCRETE
"inflation" → grocery receipt curling off counter. "loneliness" → single place setting at table for six.

🎬 RULE 7: NICHE (${niche})
- Visual World: ${nicheProfile.visual_world}
- Shots: ${nicheProfile.signature_shots}
- Metaphors: ${nicheProfile.metaphor_language}
- Palette: ${nicheProfile.emotional_palette}
- AVOID: ${nicheProfile.avoid}

**RESPONSE FORMAT:**
{
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1},
      "narration_text": "EXACT script words for this scene",
      "visual_concept": "Rich 2-4 sentence cinematic description of the frozen moment",
      "shot_type": "e.g. 'ECU — Extreme Close-Up'",
      "camera_angle": "e.g. 'Low angle, 15 degrees, slightly left'",
      "camera_movement": "e.g. 'Slow push-in over 8s, MS to MCU'",
      "lighting": "e.g. 'Single warm lamp left, deep shadows right, rim light from window'",
      "color_palette": "e.g. 'Warm amber #D4A574, shadow brown #2C1810, cream #F5F0E8'",
      "mood": "2-3 words, e.g. 'quiet desperation'",
      "depth_of_field": "e.g. 'Shallow f/1.4, subject sharp, background bokeh'",
      "niche_visual_element": "One niche metaphor element",
      "continuity_bridge": "Visual thread to NEXT scene",
      "emotional_intensity": 0.5,
      "duration_seconds": 8
    }
  ]
}

**CRITICAL:**
- EXACTLY ${chunk.scenes} scenes, starting at ${sceneOffset + 1}
- EVERY word of the script segment in exactly one narration_text
- NO added narration — ONLY provided script words
- visual_concept NEVER describes text/charts/graphs
- Adjacent scenes MUST use different shot types`;

      console.log(`🎬 Pass 2.${batchIdx + 1}: ${chunk.phase} (scenes ${sceneOffset + 1}-${sceneOffset + chunk.scenes})...`);

      const batchResult = await callGemini(breakdownPrompt, 0.7, 16384);

      if (!batchResult.scenes || !Array.isArray(batchResult.scenes)) {
        console.error(`Phase ${chunk.phase} returned no scenes array`);
        continue;
      }

      // Save scenes to DB (parallel within batch)
      const savePromises = batchResult.scenes.map(async (scene, i) => {
        const sceneNum = sceneOffset + i + 1;
        const cleanedNarration = cleanNarrationText(scene.narration_text);

        try {
          await base44.asServiceRole.entities.Scenes.create({
            project_id,
            scene_number: sceneNum,
            narration_text: cleanedNarration,
            image_prompt: "",
            animation_prompt: "",
            duration_seconds: scene.duration_seconds || 8,
            status: "breakdown_ready"
          });

          // Store in memory for continuity
          allBlueprintScenes.push({
            scene_number: sceneNum,
            phase: chunk.phase,
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
            duration_seconds: scene.duration_seconds || 8
          });

          return true;
        } catch (err) {
          console.error(`Failed to save scene ${sceneNum}:`, err.message);
          return false;
        }
      });

      const results = await Promise.all(savePromises);
      const batchCreated = results.filter(Boolean).length;
      totalScenesCreated += batchCreated;

      console.log(`✓ ${chunk.phase}: ${batchCreated} scenes saved (total: ${totalScenesCreated})`);
    }

    // ── Try to save blueprint to project (non-blocking) ────────────
    // This is a BONUS — the function works without it
    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        scene_blueprint: JSON.stringify({
          story_analysis: storyAnalysis,
          phases: phases.map(p => ({ name: p.name, purpose: p.purpose, scene_count: p.scenes })),
          total_target_scenes: totalTargetScenes,
          niche_profile: nicheProfile,
          scenes: allBlueprintScenes
        })
      });
      console.log('✓ Blueprint saved to project');
    } catch (bpErr) {
      console.warn('Could not save scene_blueprint to project (field may not exist):', bpErr.message);
      // Not fatal — scenes are already saved to Scenes entity
    }

    // ── Mark complete ──────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "breakdown_complete",
        current_step: 5
      });
    } catch (_) {}

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 BREAKDOWN COMPLETE`);
    console.log(`📊 ${totalScenesCreated} scenes across ${scriptChunks.length} phases`);
    console.log(`🎯 Target was ${totalTargetScenes}`);
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
      phases_completed: scriptChunks.map(c => c.phase),
      total_phases: scriptChunks.length
    });

  } catch (error) {
    console.error("❌ generateSceneBreakdown error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});