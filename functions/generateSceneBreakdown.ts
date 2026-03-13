import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE
// ══════════════════════════════════════════════════════════════════
// PURPOSE: Sits BETWEEN script generation and scene prompt generation.
// INPUT:   Final aggregated script + project metadata
// OUTPUT:  Scene records (status: "breakdown_ready") + scene_blueprint on Project
//
// This does NOT generate image prompts. It generates DIRECTORIAL INTENT
// that the prompt generator then converts into image/animation prompts.
//
// Pipeline: Script → [THIS FUNCTION] → Scene Prompts → Image Gen → Animation
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.7) {
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

  try {
    return JSON.parse(rawText);
  } catch (e) {
    console.log("JSON parse failed, attempting recovery...");
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace === -1) throw new Error("Cannot recover JSON from Gemini response");
    const trimmed = rawText.substring(0, lastBrace + 1);
    const attempts = [trimmed + ']}', trimmed + '}]}', trimmed];
    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed.scenes && Array.isArray(parsed.scenes)) {
          console.log(`Recovered ${parsed.scenes.length} scenes from truncated JSON`);
          return parsed;
        }
      } catch (_) {}
    }
    throw new Error("Failed to parse Gemini JSON response after recovery attempts");
  }
}

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
// VISUAL STYLE NORMALIZER
// ══════════════════════════════════════════════════════════════════

function normalizeStyleKey(raw) {
  if (!raw) return '';
  const normalized = raw.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  const knownStyles = [
    'cinematic_realistic', 'photorealistic_4k', 'anime', 'cinematic_anime',
    'cartoon_2d', 'picstory_cocomelon', 'cinematic_picstory', 'oil_painting',
    'watercolor', 'comic_book', 'humpty_dumpty', 'harry_potter',
    '3d_whiteboard_cartoon', 'low_poly_3d_cartoon', 'skeleton_protagonist'
  ];
  if (knownStyles.includes(normalized)) return normalized;
  for (const key of knownStyles) {
    if (normalized.includes(key) || key.includes(normalized)) return key;
  }
  console.warn(`⚠️ Unknown visual_style "${raw}" → normalized: "${normalized}"`);
  return normalized;
}

// ══════════════════════════════════════════════════════════════════
// VISUAL STYLE CHARACTER DIRECTIVES
// ══════════════════════════════════════════════════════════════════
// Certain visual styles inject a mandatory character override so
// the LLM always features a specific protagonist. Add new styles here.
// Returns empty string for styles that don't need character override.
// ══════════════════════════════════════════════════════════════════

function getStyleCharacterDirective(visualStyle) {
  const directives = {
    skeleton_protagonist: `
**🦴 MANDATORY — SKELETON PROTAGONIST STYLE:**

CHARACTER IDENTITY (consistent across ALL scenes):
- A photorealistic transparent glass-like humanoid body shell with glossy ivory skeleton visible inside (ribcage, spine, pelvis, all bones)
- Big round expressive brown/amber EYEBALLS in the skull sockets (NOT empty dark sockets)
- Adult male proportions, context-appropriate clothing per scene (robes, gear, suits, etc.)
- NOT scary or horror — he is the relatable HERO of the story

**🎬 CRITICAL FRAMING RULES — READ CAREFULLY:**

1. **FULL CHARACTER**: The skeleton must be shown as a FULL HUMAN-SIZED figure in MOST scenes. Frame him head to feet — like a real person standing, sitting, kneeling, walking, running. Show his character interacting with the world. NEVER default to torso-only or bust shots. Close-ups of face/hands are allowed ONLY for 1-2 key emotional beats, not as the default.

2. **ENVIRONMENT FIRST**: Every scene is a WORLD, not a portrait. Describe the environment in detail BEFORE the character — the room, landscape, weather, crowd, props, textures, architecture. The skeleton lives INSIDE a rich, detailed, photorealistic world. Blurred backgrounds are BANNED for this style.

3. **INTERACTION AND ACTION**: The skeleton must be DOING something — holding objects, gesturing to people, walking through crowds, sitting at tables, kneeling in rivers, climbing, reaching, pointing. Static standing poses facing camera are LAZY. Show him mid-action in a story moment.

4. **OTHER PEOPLE IN FRAME**: Include photorealistic normal humans interacting with or near the skeleton in MOST scenes — crowds, companions, onlookers, workers. He exists in a populated world, not alone in empty space.

5. **SCENE FLOW**: Every visual_concept must contain a CONTINUITY ELEMENT that bridges to the next scene — a prop that reappears, a color that shifts, a gesture that echoes, a location that transforms. Scenes are NOT isolated portraits — they are frames in a continuous film.

6. **PERSPECTIVE VARIETY**: Use the full director's toolkit — low angles looking up at the skeleton against sky, overhead God's-eye views of him in a crowd, over-shoulder shots from behind him looking at what he sees, wide establishing shots showing him small in a vast landscape, medium shots of him with companions.

BAD visual_concept: "The transparent skeleton protagonist stands with expressive amber eyes, glass body reflecting light, ribcage visible through translucent torso."
GOOD visual_concept: "Full-body view of the skeleton protagonist kneeling knee-deep in a rushing river, muddy water swirling around his transparent legs, both hands lifting a massive gold nugget above the surface. Behind him, dozens of miners in worn 1849-era clothing pan for gold among sun-bleached boulders. Golden hour light catches the water droplets on his glass skin. A coiled rope and shovel rest on the rocky bank in the foreground."
`
  };
  return directives[visualStyle] || '';
}

// ══════════════════════════════════════════════════════════════════
// NICHE DIRECTOR PROFILES
// ══════════════════════════════════════════════════════════════════
// Instead of hardcoded motifs, these are DIRECTORIAL SENSIBILITIES
// that guide the AI to think visually for each niche.
// ══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// BEAT DURATION CALCULATOR
// ═══════════════════════════════════════════════════════════════════

function calculateBeatDurations(phases, totalTargetScenes, defaultDuration = 5, durationMinutes = 3) {
  // ═══════════════════════════════════════════════════════════════
  // DURATION-AWARE PACING
  // ═══════════════════════════════════════════════════════════════
  // Short videos (1-3 min)  → tight, punchy cuts (social/YT Shorts energy)
  // Medium videos (4-10 min) → balanced rhythm (standard YouTube)
  // Long videos (11-30 min) → cinematic holds, scenes breathe
  // Epic videos (30-60+ min) → documentary pacing, long holds
  //
  // The scale factor linearly interpolates between these tiers
  // and multiplies the base durations per phase.
  // ═══════════════════════════════════════════════════════════════

  // Pacing scale: maps durationMinutes → multiplier
  // 1 min → 0.7x (snappy), 5 min → 1.0x (baseline), 15 min → 1.4x, 30 min → 1.7x, 60 min → 2.0x
  const pacingAnchors = [
    { minutes: 1,  scale: 0.70 },
    { minutes: 3,  scale: 0.85 },
    { minutes: 5,  scale: 1.00 },   // ← baseline
    { minutes: 10, scale: 1.20 },
    { minutes: 15, scale: 1.40 },
    { minutes: 30, scale: 1.70 },
    { minutes: 60, scale: 2.00 },
  ];

  function getScaleFactor(mins) {
    if (mins <= pacingAnchors[0].minutes) return pacingAnchors[0].scale;
    if (mins >= pacingAnchors[pacingAnchors.length - 1].minutes) return pacingAnchors[pacingAnchors.length - 1].scale;
    for (let i = 0; i < pacingAnchors.length - 1; i++) {
      const lo = pacingAnchors[i];
      const hi = pacingAnchors[i + 1];
      if (mins >= lo.minutes && mins <= hi.minutes) {
        const t = (mins - lo.minutes) / (hi.minutes - lo.minutes);
        return lo.scale + t * (hi.scale - lo.scale);
      }
    }
    return 1.0;
  }

  const scale = getScaleFactor(durationMinutes);

  // Base pacing (tuned for ~5 minute video — the 1.0x baseline)
  const basePacing = {
    cold_open:      { base: 3.5, variance: 0.5 },   // Punchy hook
    rising_tension: { base: 4.5, variance: 0.8 },   // Building
    emotional_core: { base: 5.5, variance: 1.0 },   // Breathing room
    resolution:     { base: 4.5, variance: 0.5 }    // Steady close
  };

  // Apply scale to get actual pacing for this video length
  const phasePacing = {};
  for (const [name, pacing] of Object.entries(basePacing)) {
    phasePacing[name] = {
      base: Math.round(pacing.base * scale * 10) / 10,
      variance: Math.round(pacing.variance * scale * 10) / 10
    };
  }

  const durations = [];
  const floor = Math.max(2.5, 2.0 * scale);  // floor scales too — long videos never go below ~4s

  for (const phase of phases) {
    const pacing = phasePacing[phase.name] || { base: defaultDuration * scale, variance: 0.5 * scale };

    for (let i = 0; i < phase.scenes; i++) {
      // Within each phase, ramp duration slightly toward the end
      // (scenes build weight as the phase progresses)
      const progressRatio = phase.scenes > 1 ? i / (phase.scenes - 1) : 0.5;
      const rampOffset = (progressRatio - 0.5) * pacing.variance;  // -variance/2 → +variance/2
      const duration = Math.round((pacing.base + rampOffset) * 10) / 10;
      durations.push(Math.max(floor, duration));
    }
  }

  const totalDuration = durations.reduce((a, b) => a + b, 0);
  const avgDuration = totalDuration / durations.length;

  console.log(`📊 Beat durations calculated: ${durations.length} scenes | Scale: ${scale.toFixed(2)}x (${durationMinutes} min video)`);
  console.log(`   Scaled pacing: cold_open=${phasePacing.cold_open.base}s, rising=${phasePacing.rising_tension.base}s, core=${phasePacing.emotional_core.base}s, resolution=${phasePacing.resolution.base}s`);
  console.log(`   Range: ${Math.min(...durations).toFixed(1)}s – ${Math.max(...durations).toFixed(1)}s | Avg: ${avgDuration.toFixed(1)}s | Total: ${totalDuration.toFixed(1)}s`);

  return durations;
}

function calculateStartTimes(durations) {
  const starts = [];
  let offset = 0;
  for (const duration of durations) {
    starts.push(offset);
    offset += duration;
  }
  return starts;
}

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
      chunks.push({
        phase: phase.name,
        purpose: phase.purpose,
        scenes: phase.scenes,
        text: segment
      });
    }
    cursor = endCursor;
  }
  return chunks;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, batch_index, selected_hook } = await req.json();
    const startBatch = batch_index || 0;

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found. Please generate the full script first.' }, { status: 400 });
    }

    const cleanedScript = cleanScriptText(script.full_script);
    let finalScript = cleanedScript;

    if (selected_hook) {
      const scriptWithoutHook = cleanedScript.replace(selected_hook, "").trim();
      finalScript = `${selected_hook}. ${scriptWithoutHook}`;
    }

    const wordCount = finalScript.split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    const niche = project.niche || 'general';

    // ── Style character directive (e.g. skeleton protagonist) ──────
    const rawStyle = project.visual_style || '';
    const visualStyle = normalizeStyleKey(rawStyle);
    const styleDirective = getStyleCharacterDirective(visualStyle);
    console.log(`🎨 Style: raw="${rawStyle}" → resolved="${visualStyle}"`);
    if (styleDirective) {
      console.log(`🦴 Style directive active: ${visualStyle}`);
    }

    // ═══ DURATION-AWARE SCENE DENSITY ═══
    // Average scene duration scales with video length (same anchors as beat calculator).
    // Short vids → tight ~4s avg cuts.  Long vids → cinematic ~9-10s avg holds.
    // This prevents a 60-min video from requesting 720 scenes at 5s each.
    const pacingAnchors = [
      { minutes: 1,  avgScene: 3.4 },   // 0.70x scale → ~3.4s avg
      { minutes: 3,  avgScene: 4.0 },   // 0.85x
      { minutes: 5,  avgScene: 4.7 },   // 1.00x baseline
      { minutes: 10, avgScene: 5.6 },   // 1.20x
      { minutes: 15, avgScene: 6.6 },   // 1.40x
      { minutes: 30, avgScene: 8.0 },   // 1.70x
      { minutes: 60, avgScene: 9.4 },   // 2.00x
    ];
    function getAvgSceneDuration(mins) {
      if (mins <= pacingAnchors[0].minutes) return pacingAnchors[0].avgScene;
      if (mins >= pacingAnchors[pacingAnchors.length - 1].minutes) return pacingAnchors[pacingAnchors.length - 1].avgScene;
      for (let i = 0; i < pacingAnchors.length - 1; i++) {
        const lo = pacingAnchors[i], hi = pacingAnchors[i + 1];
        if (mins >= lo.minutes && mins <= hi.minutes) {
          const t = (mins - lo.minutes) / (hi.minutes - lo.minutes);
          return lo.avgScene + t * (hi.avgScene - lo.avgScene);
        }
      }
      return 4.7;
    }
    const avgSceneDuration = getAvgSceneDuration(durationMinutes);
    const totalTargetScenes = Math.max(8, Math.round((durationMinutes * 60) / avgSceneDuration));
    console.log(`🎯 Scene density: ${durationMinutes}min video → avg ${avgSceneDuration.toFixed(1)}s/scene → ${totalTargetScenes} target scenes`);

    const phases = calculatePhaseAllocation(totalTargetScenes);
    const scriptChunks = splitScriptByPhase(finalScript, phases);
    const numBatches = scriptChunks.length;

    // ══════════════════════════════════════════════════════════════
    // RESOLVE BLUEPRINT FIRST — before anything that reads from it
    // (Fixes race condition: blueprint must exist before beat logic)
    // ══════════════════════════════════════════════════════════════
    let blueprint;
    let freshProject = project;

    if (startBatch === 0) {
      // ── Batch 0: wipe old scenes, run story analysis, build blueprint from scratch ──
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      for (const s of oldScenes) {
        await base44.asServiceRole.entities.Scenes.delete(s.id);
      }

      const nicheProfile = getNicheDirectorProfile(niche);

      const analysisPrompt = `
You are a world-class film director preparing to shoot a visual narrative.

BEFORE you break anything into scenes, you must STUDY the entire script and understand its soul.
${styleDirective}

**FULL SCRIPT:**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${finalScript}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**NICHE:** ${niche}
**TOPIC:** ${project.name}
**TOTAL DURATION:** ~${durationMinutes} minutes
**TOTAL SCENES PLANNED:** ${totalTargetScenes}

**YOUR DIRECTOR'S ANALYSIS — respond with this JSON:**
{
  "story_analysis": {
    "central_theme": "The ONE core idea this story is really about (not just the topic — the deeper human truth)",
    "narrative_arc_summary": "A 2-3 sentence description of the story's emotional journey from start to finish",
    "emotional_trajectory": "A sequence of emotional states the viewer should experience, e.g. ['curiosity', 'concern', 'empathy', 'hope', 'determination']",
    "key_turning_points": ["Moment 1 where emotion shifts", "Moment 2 where stakes escalate", "Moment 3 climax/revelation"],
    "visual_world": "Describe the overall visual universe this story lives in — what does this world LOOK like? What textures, environments, lighting define it?",
    "recurring_visual_motifs": ["Motif 1 — a visual element that should echo across scenes", "Motif 2", "Motif 3"],
    "color_arc": "How the color palette should shift across the video — e.g. 'cool desaturated blues → warm amber → vibrant gold'",
    "characters": [
      {
        "name": "Character name or archetype (e.g. 'The Father', 'Sarah')",
        "identity_core": "IMMUTABLE physical identity — the features that NEVER change across scenes. Must include ALL of: (1) exact age like '34 years old', (2) gender, (3) ethnicity/skin tone with specific shade like 'warm olive-tan' not just 'olive', (4) face shape (oval/square/round/heart), (5) exact eye color and shape like 'deep-set hazel eyes with hooded lids', (6) nose specifics like 'strong Roman nose with slight bump on bridge', (7) lip shape, (8) exact hair: color, length, texture, style like 'shoulder-length wavy auburn hair with copper highlights, usually parted left', (9) body build with height like '5ft10 lean athletic build with broad shoulders', (10) 2-3 distinguishing marks like 'small scar through left eyebrow, visible crow's feet when smiling, prominent collarbones'. This must read like a casting sheet — specific enough that 20 artists would draw recognizably the SAME person.",
        "default_clothing": "Typical clothing style and palette — what they'd wear on an average day. This CAN change per scene.",
        "reference_prompt": "A standalone prompt to generate ONE hero reference portrait of this character: neutral 3/4 angle, shoulders-up, clean studio lighting, plain gray background, character looking slightly off-camera with a natural expression. Include the FULL identity_core description. This image will be used as a visual reference for ALL subsequent scenes.",
        "emotional_arc": "How this character changes emotionally through the story"
      }
    ]
  }
}

**DIRECTOR'S PRINCIPLES:**
- The "central_theme" is NOT the topic (e.g. NOT "retirement planning"). It's the HUMAN truth underneath (e.g. "the fear of becoming a burden to the people you love most").
- "visual_world" should be SPECIFIC and sensory, not generic.
- "recurring_visual_motifs" are visual threads that stitch scenes together.
- "color_arc" creates subliminal emotional continuity.
- "key_turning_points" should be EMOTIONAL shifts, not just topic changes.

**CHARACTER CASTING RULES — READ CAREFULLY:**
- "identity_core" is the IMMUTABLE DNA — face, body, skin, hair, eyes, distinguishing marks. This NEVER changes between scenes. Clothing is NOT part of identity_core.
- "default_clothing" is what they typically wear — this CAN change per scene based on context.
- "reference_prompt" must be a complete standalone prompt that could generate a recognizable portrait of this character in isolation.
- BAD identity_core: "A woman in her 30s with dark hair and green eyes" ← TOO VAGUE, matches thousands of people
- GOOD identity_core: "34-year-old woman, warm olive-tan skin, oval face with high cheekbones, deep-set emerald green eyes with thick dark lashes, straight narrow nose with slight upturn at tip, full lips with defined cupid's bow, shoulder-length wavy dark chestnut hair with auburn highlights parted left, 5ft6 slender build with long neck, small beauty mark above right lip, slight dimple on left cheek when smiling"
- The test: could a sketch artist draw this person from your description alone? If not, add more detail.

**NICHE VISUAL SENSIBILITY for ${niche}:**
- Visual World: ${nicheProfile.visual_world}
- Signature Shots: ${nicheProfile.signature_shots}
- Metaphor Language: ${nicheProfile.metaphor_language}
- Emotional Palette: ${nicheProfile.emotional_palette}
- Pacing Style: ${nicheProfile.pacing_style}
- AVOID: ${nicheProfile.avoid}
`;

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🎬 STORY ANALYSIS PASS — Director studying full script`);
      console.log(`📖 Words: ${wordCount} | ⏱️ Duration: ~${durationMinutes}min | 🎯 Target: ${totalTargetScenes} scenes`);
      console.log(`🎨 Niche: ${niche}${visualStyle ? ` | 🖼️ Style: ${visualStyle}` : ''}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      const analysis = await callGemini(analysisPrompt, 0.6);

      const storyAnalysis = analysis.story_analysis || analysis;

      // ── Calculate phase-aware beat durations ──
      const beatDurations = calculateBeatDurations(phases, totalTargetScenes, avgSceneDuration, durationMinutes);
      const beatStartTimes = calculateStartTimes(beatDurations);

      console.log(`📊 Beat breakdown calculated:`);
      console.log(`   Durations: [${beatDurations.map(d => d.toFixed(1)).join(', ')}]`);
      console.log(`   Start times: [${beatStartTimes.map(t => t.toFixed(1)).join(', ')}]`);
      console.log(`   Total duration: ${beatDurations.reduce((a,b)=>a+b,0).toFixed(1)}s`);

      // Build blueprint in memory — avoids stale re-read after update
      blueprint = {
        story_analysis: storyAnalysis,
        phases: phases.map(p => ({ name: p.name, purpose: p.purpose, scene_count: p.scenes })),
        total_target_scenes: totalTargetScenes,
        niche_profile: nicheProfile,
        beat_durations: beatDurations,
        beat_start_times: beatStartTimes,
        scenes: []
      };

      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown",
        current_step: 5,
        scene_blueprint: JSON.stringify(blueprint),
        character_descriptions: storyAnalysis.characters
          ? JSON.stringify(storyAnalysis.characters)
          : project.character_descriptions
      });

      // ═══ SAVE BEAT BREAKDOWN TO PRODUCTION SETTINGS ═══
      const prodSettingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ 
        project_id 
      });

      let prodSettings = prodSettingsList[0];
      if (prodSettings) {
        await base44.asServiceRole.entities.ProductionSettings.update(prodSettings.id, {
          beat_durations: JSON.stringify(beatDurations),
          beat_start_times: JSON.stringify(beatStartTimes),
        });
        console.log(`✓ Beat durations saved to ProductionSettings (updated existing record)`);
      } else {
        prodSettings = await base44.asServiceRole.entities.ProductionSettings.create({
          project_id,
          beat_durations: JSON.stringify(beatDurations),
          beat_start_times: JSON.stringify(beatStartTimes),
        });
        console.log(`✓ Beat durations saved to ProductionSettings (created new record)`);
      }

      freshProject = {
        ...project,
        character_descriptions: storyAnalysis.characters
          ? JSON.stringify(storyAnalysis.characters)
          : project.character_descriptions
      };

      console.log(`✓ Story analysis complete`);
      console.log(`  Theme: ${storyAnalysis.central_theme}`);
      console.log(`  Characters: ${storyAnalysis.characters?.map(c => c.name).join(', ') || 'None identified'}`);
      console.log(`  Motifs: ${storyAnalysis.recurring_visual_motifs?.join(', ') || 'N/A'}`);

      // ── Batch 0 DONE — return immediately. Phases start at batch_index=1 ──
      // This keeps batch 0 under the timeout (delete + Gemini analysis + saves ≈ 15s)
      return Response.json({
        success: true,
        done: false,
        next_batch: 1,
        scenes_created: 0,
        total_scenes: 0,
        total_target: totalTargetScenes,
        total_batches: numBatches + 1,  // +1 because batch 0 is analysis-only
        current_batch: 0,
        phase: 'story_analysis',
        beat_durations: beatDurations,
        beat_start_times: beatStartTimes
      });

    } else {
      // ── Subsequent batches (1+): blueprint already persisted, read from DB ──
      // Base44's DB is eventually consistent — the write from batch 0 may not
      // have propagated yet. Retry up to 3 times with increasing delays.
      const MAX_READ_RETRIES = 3;
      const READ_DELAY_MS = [2000, 4000, 6000]; // escalating wait

      for (let readAttempt = 0; readAttempt < MAX_READ_RETRIES; readAttempt++) {
        freshProject = (await base44.asServiceRole.entities.Projects.filter({ id: project_id }))[0];
        
        if (freshProject?.scene_blueprint) {
          try {
            blueprint = JSON.parse(freshProject.scene_blueprint);
            if (blueprint?.story_analysis) {
              console.log(`✓ Blueprint loaded from DB (attempt ${readAttempt + 1})`);
              break;
            }
          } catch (_) {}
        }

        if (readAttempt < MAX_READ_RETRIES - 1) {
          const delay = READ_DELAY_MS[readAttempt];
          console.log(`⏳ Blueprint not ready yet, waiting ${delay / 1000}s (attempt ${readAttempt + 1}/${MAX_READ_RETRIES})...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }

      if (!blueprint?.story_analysis) {
        return Response.json({ error: 'Scene blueprint not found. Run batch 0 first.' }, { status: 400 });
      }
    }

    // ══════════════════════════════════════════════════════════════
    // At this point we're in batch 1+ (phase processing).
    // blueprint is loaded from DB.
    // Phase index = batch_index - 1 (because batch 0 was analysis-only)
    // ══════════════════════════════════════════════════════════════

    const beatDurations = blueprint.beat_durations || [];
    const beatStartTimes = blueprint.beat_start_times || [];

    const storyAnalysis = blueprint.story_analysis;
    const nicheProfile = blueprint.niche_profile;

    let characters = [];
    if (freshProject.character_descriptions) {
      try { characters = JSON.parse(freshProject.character_descriptions); } catch (_) {}
    }

    const characterBlock = characters.length > 0
      ? `**ESTABLISHED CHARACTERS (use these EXACT descriptions for consistency):**\n${characters.map(c => {
          const identity = c.identity_core || c.visual_description || c.description || '';
          const clothing = c.default_clothing ? ` | Default clothing: ${c.default_clothing}` : '';
          return `  • ${c.name}: ${identity}${clothing}`;
        }).join('\n')}`
      : '';

    // ═══ PROCESS ONE PHASE PER CALL ═══
    // Phase index = startBatch - 1 (batch 0 = analysis, batch 1 = phase 0, etc.)
    const phaseIdx = startBatch - 1;
    let grandTotalCreated = 0;

    if (phaseIdx < 0 || phaseIdx >= scriptChunks.length) {
      // All phases already done
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "breakdown_complete",
        current_step: 5
      });
      return Response.json({
        success: true,
        done: true,
        scenes_created: 0,
        total_scenes: blueprint.scenes.length,
        total_target: totalTargetScenes,
        total_batches: numBatches + 1,
        beat_durations: beatDurations,
        beat_start_times: beatStartTimes
      });
    }

    {
      const existingScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      const sceneOffset = existingScenes.length;

      const currentChunk = scriptChunks[phaseIdx];
      const scenesForBatch = currentChunk.scenes;

      const previousScenes = blueprint.scenes.slice(-3);
      const continuityContext = previousScenes.length > 0
        ? `**LAST ${previousScenes.length} SCENES (for visual continuity):**\n${previousScenes.map(s => `  Scene ${s.scene_number}: [${s.shot_type}] ${s.visual_concept} | Mood: ${s.mood} | Palette: ${s.color_palette}`).join('\n')}`
        : '**This is the OPENING — establish the visual world with a strong first impression.**';

      // ── Pull per-scene durations for THIS batch from the beat array ──
      const batchBeatDurations = beatDurations.slice(sceneOffset, sceneOffset + scenesForBatch);
      const durationGuidance = batchBeatDurations.length > 0
        ? `**SCENE DURATION TARGETS (seconds per scene, in order):** [${batchBeatDurations.map(d => d.toFixed(1)).join(', ')}]\nThese reflect the narrative pacing for this phase — shorter = punchier cuts, longer = breathing room. Use these as each scene's duration_seconds.`
        : '';

      const breakdownPrompt = `
You are a world-class film director blocking out scenes for a visual narrative.
${styleDirective}

**YOUR STORY ANALYSIS (from your earlier read-through):**
- Central Theme: ${storyAnalysis.central_theme}
- Narrative Arc: ${storyAnalysis.narrative_arc_summary}
- Emotional Trajectory: ${JSON.stringify(storyAnalysis.emotional_trajectory)}
- Key Turning Points: ${JSON.stringify(storyAnalysis.key_turning_points)}
- Visual World: ${storyAnalysis.visual_world}
- Recurring Motifs: ${JSON.stringify(storyAnalysis.recurring_visual_motifs)}
- Color Arc: ${storyAnalysis.color_arc}

${characterBlock}

${continuityContext}

**CURRENT PHASE: ${currentChunk.phase.toUpperCase()}**
Phase Purpose: ${currentChunk.purpose}
Scenes to create: ${scenesForBatch}
Scene numbers: ${sceneOffset + 1} through ${sceneOffset + scenesForBatch}

${durationGuidance}

**SCRIPT SEGMENT FOR THIS PHASE:**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${currentChunk.text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**━━━━ THE DIRECTOR'S SCENE BREAKDOWN RULES ━━━━**

🎬 **RULE 1: SCENES ARE VISUAL BEATS, NOT SENTENCES**
A scene changes when the VISUAL needs to change — not at every period.

🎬 **RULE 2: EVERY SCENE HAS A VISUAL CONCEPT, NOT JUST A DESCRIPTION**
WRONG: "A person looking worried about money"
WRONG: "The skeleton protagonist stands with expressive eyes and visible ribcage"
RIGHT: "Full-body wide shot of a man sitting alone at a cluttered kitchen table at 2 AM, head in hands, surrounded by scattered bills and a cold cup of coffee. A single overhead lamp casts harsh downward light, leaving the corners of the small apartment in deep shadow. Through the window behind him, city lights blur into bokeh. A framed family photo on the fridge catches a sliver of light."

🎬 **RULE 3: SHOT VARIETY IS NON-NEGOTIABLE**
Never use the same shot type consecutively. Cycle through:
WS, EWS, MWS, MS, LOW ANGLE, HIGH ANGLE/OVERHEAD, OTS, MCU, CU, POV, INSERT/DETAIL, DUTCH ANGLE, ECU
Favor wider shots (WS, EWS, MWS, MS) that show full body and environment. Use close-ups (CU, ECU) sparingly for key emotional beats only.

🎬 **RULE 4: EMOTIONAL ESCALATION WITHIN THE PHASE**
Even within a single phase, scenes should ESCALATE emotionally.

🎬 **RULE 5: VISUAL CONTINUITY — THE INVISIBLE THREAD**
Adjacent scenes should share at least ONE visual element that creates a bridge.

🎬 **RULE 6: ABSTRACT → CONCRETE**
When the narration is abstract, the visual must be CONCRETE and PHYSICAL.

🎬 **RULE 7: OBJECT INTERACTION — SHOW THE PERSON, NOT THE OBJECT**
AI image generators CANNOT render readable text on screens, papers, signs, or documents. They CANNOT render realistic hand-object grip physics in close-up. They CANNOT render dollar amounts, numbers, or any written content.
When the narration mentions a phone, laptop, document, receipt, bill, letter, contract, or any object with text:
- WRONG: "Close-up of an iPhone screen showing the Settings app with Battery and Privacy options" ← garbled nonsense text
- WRONG: "Tight shot of a medical bill showing $45,000 in outstanding charges" ← garbled numbers and letters
- WRONG: "Insert shot of a receipt displaying the total amount" ← unreadable scribbles
- WRONG: "Detail shot of a letter that reads 'Your application has been approved'" ← random text artifacts
- RIGHT: "Medium wide shot of a woman at her kitchen table, an ominous stack of medical bills fanned out before her, her face pale under the overhead light, one hand pressing against her forehead. A coffee mug sits untouched, cold."
- RIGHT: "Over-the-shoulder shot of a man holding a crumpled receipt at a gas station counter, his jaw tightening, fluorescent light harsh on his face. The attendant watches from behind scratched plexiglass."
- RIGHT: "Wide shot of a woman clutching an opened letter on her apartment steps, tears streaming, her dog pressing against her knee. Scattered mail on the concrete beside her."
The visual should show the CHARACTER'S EMOTIONAL REACTION to the document — their face, body language, posture — from a distance where text on the paper is naturally too small to read. The document is a PROP in their hands, not the subject of the shot.
NEVER describe what text appears on any surface. NEVER include dollar amounts, names, dates, or words that would appear on the object.

🎬 **RULE 8: NICHE VISUAL LANGUAGE**
- Visual World: ${nicheProfile.visual_world}
- Signature Shots: ${nicheProfile.signature_shots}
- Metaphor Language: ${nicheProfile.metaphor_language}
- Emotional Palette: ${nicheProfile.emotional_palette}
- AVOID: ${nicheProfile.avoid}

**━━━━ RESPONSE FORMAT ━━━━**
{
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1},
      "narration_text": "EXACT words from the script segment that play during this scene.",
      "visual_concept": "A rich, specific, CINEMATIC description of what we SEE. 2-4 sentences. MUST describe: (1) the FULL environment/location with specific details, (2) the character shown doing a specific ACTION, (3) other people or elements in the scene, (4) atmospheric details like weather/light/props. Think like a DP describing a film frame.",
      "shot_type": "e.g. 'ECU — Extreme Close-Up'",
      "camera_angle": "e.g. 'Low angle, 15 degrees, slightly left of center'",
      "camera_movement": "e.g. 'Slow push-in over 5 seconds, from MS to MCU'",
      "lighting": "e.g. 'Single warm practical light from desk lamp, camera left.'",
      "color_palette": "e.g. 'Warm amber #D4A574, deep shadow brown #2C1810, cream highlight #F5F0E8'",
      "mood": "2-3 words (e.g. 'quiet desperation', 'fragile hope')",
      "depth_of_field": "e.g. 'Shallow f/1.4 — subject sharp, background melted to bokeh'",
      "niche_visual_element": "One specific visual element from niche metaphor language",
      "continuity_bridge": "Visual thread connecting this to the NEXT scene",
      "emotional_intensity": 0.0 to 1.0,
      "duration_seconds": 5
    }
  ]
}

**CRITICAL REMINDERS:**
- Generate EXACTLY ${scenesForBatch} scenes
- Scene numbers start at ${sceneOffset + 1}
- EVERY word of the script segment must appear in exactly one scene's narration_text
- NO added narration — use ONLY the provided script words
- visual_concept must NEVER describe text, charts, graphs, or readable content on screen
- visual_concept must describe the FULL SCENE: environment FIRST, then full-body character action, then other people, then atmosphere
- Characters must be shown in scenes accordingly — torso-only crops are BANNED unless specifically an ECU emotional beat
- Every scene must contain a CONTINUITY ELEMENT that visually bridges to the next scene (shared prop, color shift, gesture echo, location transform)
- Adjacent scenes MUST use different shot types
- emotional_intensity should generally escalate through the phase
- NEVER describe the character in isolation against a blank/blurred background — always place them IN a detailed world
- Use the provided SCENE DURATION TARGETS for each scene's duration_seconds value
`;

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🎬 SCENE BREAKDOWN — Phase: ${currentChunk.phase} (Phase ${phaseIdx + 1}/${numBatches})`);
      console.log(`📍 Generating scenes ${sceneOffset + 1}-${sceneOffset + scenesForBatch}`);
      console.log(`⏱️ Beat targets: [${batchBeatDurations.map(d => d.toFixed(1)).join(', ')}]s`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      const result = await callGemini(breakdownPrompt, 0.7);

      let scenesCreated = 0;
      const newBlueprintScenes = [];

      if (result.scenes && Array.isArray(result.scenes)) {
        for (let i = 1; i < result.scenes.length; i++) {
          if (result.scenes[i].shot_type === result.scenes[i - 1].shot_type) {
            console.warn(`⚠️ Consecutive duplicate shot type at scene ${result.scenes[i].scene_number}: ${result.scenes[i].shot_type}`);
          }
        }

        for (const scene of result.scenes) {
          const sceneNum = sceneOffset + scenesCreated + 1;
          const cleanedNarration = cleanNarrationText(scene.narration_text);

          // Use the pre-calculated beat duration for this scene index,
          // falling back to whatever Gemini returned, then to 5s default
          const targetDuration = beatDurations[sceneNum - 1] 
            || scene.duration_seconds 
            || 5;

          await base44.asServiceRole.entities.Scenes.create({
            project_id,
            scene_number: sceneNum,
            narration_text: cleanedNarration,
            image_prompt: "",
            animation_prompt: "",
            duration_seconds: targetDuration,
            status: "breakdown_ready"
          });

          newBlueprintScenes.push({
            scene_number: sceneNum,
            phase: currentChunk.phase,
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
            duration_seconds: targetDuration
          });

          scenesCreated++;
        }
      }

      blueprint.scenes = [...blueprint.scenes, ...newBlueprintScenes];
      grandTotalCreated += scenesCreated;

      // Save after this phase — progress persists
      await base44.asServiceRole.entities.Projects.update(project_id, {
        scene_blueprint: JSON.stringify(blueprint)
      });

      console.log(`✓ Phase ${currentChunk.phase} complete — ${scenesCreated} scenes | Running total: ${blueprint.scenes.length}/${totalTargetScenes}`);

    } // end single-phase block

    // Check if there are more phases to process
    // Frontend batch_index: 0=analysis, 1=phase0, 2=phase1, etc.
    const nextBatch = startBatch + 1;
    const allPhasesComplete = (phaseIdx + 1) >= scriptChunks.length;

    if (allPhasesComplete) {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "breakdown_complete",
        current_step: 5
      });

      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🎉 FULL BREAKDOWN COMPLETE — ${blueprint.scenes.length} scenes ready for prompt generation`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    } else {
      console.log(`⏩ Phase ${phaseIdx + 1}/${scriptChunks.length} done — next call: batch_index=${nextBatch}`);
    }

    return Response.json({
      success: true,
      done: allPhasesComplete,
      next_batch: allPhasesComplete ? null : nextBatch,
      scenes_created: grandTotalCreated,
      total_scenes: blueprint.scenes.length,
      total_target: totalTargetScenes,
      total_batches: scriptChunks.length + 1,  // +1 for analysis batch
      current_batch: startBatch,
      beat_durations: beatDurations,
      beat_start_times: beatStartTimes
    });

  } catch (error) {
    console.error("❌ generateSceneBreakdown error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});