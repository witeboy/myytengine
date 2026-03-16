import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE
// ══════════════════════════════════════════════════════════════════
// Single-call architecture from the original, upgraded with:
// - Duration-aware scene density & beat pacing
// - DIRECTOR_NOTES stored on each Scene record
// - Story analysis → ProductionSettings (no scene_blueprint size limit)
// - Sub-batching for phases > 20 scenes
// - Immersion & object naming rules
// - Timeout safety valve for long videos
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

  try { return JSON.parse(rawText); } catch (_) {}

  // Recovery: try closing truncated JSON
  console.log("JSON parse failed, attempting recovery...");
  const lastBrace = rawText.lastIndexOf('}');
  if (lastBrace === -1) throw new Error("Cannot recover JSON from Gemini response");
  const trimmed = rawText.substring(0, lastBrace + 1);
  for (const suffix of [']}', '}]}', '']) {
    try {
      const parsed = JSON.parse(trimmed + suffix);
      if (parsed.scenes && Array.isArray(parsed.scenes)) {
        console.log(`Recovered ${parsed.scenes.length} scenes from truncated JSON`);
        return parsed;
      }
      if (parsed.story_analysis) return parsed;
    } catch (_) {}
  }
  throw new Error("Failed to parse Gemini JSON after recovery");
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
// VISUAL STYLE
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
  return normalized;
}

function getStyleCharacterDirective(visualStyle) {
  const directives = {
    skeleton_protagonist: `
**🦴 MANDATORY — SKELETON PROTAGONIST STYLE:**
CHARACTER: Photorealistic transparent glass-like humanoid body shell with glossy ivory skeleton visible inside (ribcage, spine, pelvis, all bones). Big round expressive brown/amber EYEBALLS in skull sockets (NOT empty dark sockets). Adult male proportions, context-appropriate clothing per scene. NOT scary — relatable HERO.
RULES: Show FULL BODY in most scenes. Environment FIRST, then character. Character must be DOING something. Include other photorealistic humans in most scenes. Every scene has a CONTINUITY ELEMENT bridging to the next. Use varied camera angles. Blurred backgrounds BANNED.`
  };
  return directives[visualStyle] || '';
}

// ══════════════════════════════════════════════════════════════════
// DURATION-AWARE BEAT CALCULATOR
// ══════════════════════════════════════════════════════════════════

function calculateBeatDurations(phases, durationMinutes) {
  const anchors = [
    {m:1,s:0.70},{m:3,s:0.85},{m:5,s:1.00},{m:10,s:1.20},
    {m:15,s:1.40},{m:30,s:1.70},{m:60,s:2.00}
  ];
  function getScale(mins) {
    if (mins <= anchors[0].m) return anchors[0].s;
    if (mins >= anchors[anchors.length-1].m) return anchors[anchors.length-1].s;
    for (let i = 0; i < anchors.length - 1; i++) {
      if (mins >= anchors[i].m && mins <= anchors[i+1].m) {
        const t = (mins - anchors[i].m) / (anchors[i+1].m - anchors[i].m);
        return anchors[i].s + t * (anchors[i+1].s - anchors[i].s);
      }
    }
    return 1.0;
  }

  const scale = getScale(durationMinutes);
  const basePacing = {
    cold_open: { base: 3.5, variance: 0.5 },
    rising_tension: { base: 4.5, variance: 0.8 },
    emotional_core: { base: 5.5, variance: 1.0 },
    resolution: { base: 4.5, variance: 0.5 }
  };

  const durations = [];
  const floor = Math.max(2.5, 2.0 * scale);

  for (const phase of phases) {
    const p = basePacing[phase.name] || { base: 5 * scale, variance: 0.5 * scale };
    const base = p.base * scale;
    const vari = p.variance * scale;
    for (let i = 0; i < phase.scenes; i++) {
      const ratio = phase.scenes > 1 ? i / (phase.scenes - 1) : 0.5;
      const d = Math.round((base + (ratio - 0.5) * vari) * 10) / 10;
      durations.push(Math.max(floor, d));
    }
  }
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

// ══════════════════════════════════════════════════════════════════
// NICHE DIRECTOR PROFILES
// ══════════════════════════════════════════════════════════════════

function getNicheDirectorProfile(niche) {
  const profiles = {
    finance: {
      visual_world: "Corporate glass towers vs intimate kitchen tables, Wall Street grandeur vs suburban vulnerability",
      signature_shots: "Overhead desk chaos, CU hands gripping objects, empty rooms, silhouettes against windows",
      metaphor_language: "Weight/lightness, overflowing/empty containers, bridges and chasms, erosion and growth",
      emotional_palette: "Cool institutional blues/grays shifting to warm ambers/golds",
      avoid: "Literal money shots (cash flying), generic stock office scenes, cliché calculator close-ups"
    },
    retirement: {
      visual_world: "Golden-hour suburbs, well-worn family homes, nature trails, generational gatherings",
      signature_shots: "Photo-filled mantles, weathered hands, homes at different times of day",
      metaphor_language: "Seasons, paths and horizons, light through windows, roots and branches",
      emotional_palette: "Warm amber/honey tones, soft golden hour light, earth tones",
      avoid: "Depressing lonely elderly stereotypes, clinical medical settings"
    },
    motivation: {
      visual_world: "Mountain peaks, training spaces, pre-dawn cities, determination made beautiful",
      signature_shots: "Low-angle hero shots, tracking forward motion, silhouettes against epic backdrops",
      metaphor_language: "Elevation, fire and forge, dawn breaking, chains breaking, doors opening",
      emotional_palette: "Dark blues/blacks building to fiery oranges and triumphant golds",
      avoid: "Cheesy flexing/posing, generic mountain top arms raised"
    },
    horror: {
      visual_world: "Liminal spaces, barely-lit corridors, familiar places made wrong",
      signature_shots: "Dutch angles, long corridors, POV approaches, static wide shots with something wrong",
      metaphor_language: "Decay, doors that shouldn't be open, reflections that don't match",
      emotional_palette: "Sickly greens, desaturated blues, deep blacks, crimson accents",
      avoid: "Over-the-top gore, cheap jump scare framing, cliché haunted house"
    },
    technology: {
      visual_world: "Clean labs and messy maker spaces, human hand meeting digital interface",
      signature_shots: "Macro components, rack focus human/machine, clean architectural frames",
      metaphor_language: "Networks, light through fiber, emergence, the spark of creation",
      emotional_palette: "Electric blues/whites, warm ambers for human moments, neon for innovation",
      avoid: "Matrix code rain, cliché robots, glowing hologram interfaces"
    },
    health: {
      visual_world: "Body as landscape, kitchens as labs, nature as pharmacy, self-care rituals",
      signature_shots: "Macro food shots, mindful human moments, nature parallels",
      metaphor_language: "Growth, water/nourishment, dawn as renewal, body as garden",
      emotional_palette: "Fresh greens, clean whites, sunrise golds, cool blues",
      avoid: "Clinical imagery, shame shots, pill focus"
    },
    crime: {
      visual_world: "Rain-slicked streets, interrogation rooms, evidence boards, moral gray zones",
      signature_shots: "Noir low-key lighting, over-shoulder reveals, bird's-eye evidence layouts",
      metaphor_language: "Masks/mirrors, threads/webs, predator/prey, the weight of truth",
      emotional_palette: "Noir blues/blacks, sodium oranges, forensic whites, blood red accents",
      avoid: "Gratuitous violence imagery, sensationalized victim portrayal"
    },
    history: {
      visual_world: "Weathered textures, vast landscapes, artifacts as time portals",
      signature_shots: "Epic wides, slow zooms to period details, then/now juxtaposition",
      metaphor_language: "Layers, rivers of time, monuments rising/crumbling, flame being passed",
      emotional_palette: "Sepia warmth, stone grays, jewel tones for power, golden glory light",
      avoid: "Cartoonish stereotypes, overly clean historical settings, anachronisms"
    },
    education: {
      visual_world: "Light-filled spaces, moment of understanding, abstract→tangible",
      signature_shots: "Revealing wides, diagram-like compositions, POV discovery",
      metaphor_language: "Illumination, puzzle pieces connecting, seeds growing, lenses focusing",
      emotional_palette: "Bright clear colors, warm yellows for aha-moments, cool blues for contemplation",
      avoid: "Boring classroom stereotypes, lecturing framing"
    },
    travel: {
      visual_world: "Golden hour landscapes, local markets, tourist gaze vs authentic life",
      signature_shots: "Drone establishing shots, street-level handheld, food macros",
      metaphor_language: "Horizons, bridges between cultures, paths less traveled",
      emotional_palette: "Rich saturated palettes, golden light, azure skies, warm market tones",
      avoid: "Tourist brochure clichés, Instagram filters, cultural stereotypes"
    },
    relationship: {
      visual_world: "Intimate shared spaces, geometry of two people, environment reflecting emotions",
      signature_shots: "Two-shots with negative space, OTS perspectives, hand details",
      metaphor_language: "Bridges/walls, weather reflecting mood, growing/wilting, light finding its way in",
      emotional_palette: "Warm amber for connection, cool blues for distance, soft rose for intimacy",
      avoid: "Cheesy romance clichés, toxic relationship glorification"
    }
  };

  return profiles[niche?.toLowerCase()] || {
    visual_world: "Environments reflecting emotional state, contrast between open/enclosed spaces",
    signature_shots: "Establishing wides, medium shots, close-up emotion, macro details",
    metaphor_language: "Light/shadow, open/closed doors, rising/falling, seeds→trees",
    emotional_palette: "Cooler for tension, warmer for resolution, high contrast for conflict",
    avoid: "Generic stock aesthetics, repetitive compositions"
  };
}

// ══════════════════════════════════════════════════════════════════
// PHASE STRUCTURE
// ══════════════════════════════════════════════════════════════════

function calculatePhaseAllocation(totalTargetScenes) {
  const phaseWeights = [
    { name: "cold_open", weight: 0.10, purpose: "Hook — visceral, immediate, intriguing." },
    { name: "rising_tension", weight: 0.25, purpose: "Build the world and problem — escalate stakes." },
    { name: "emotional_core", weight: 0.40, purpose: "Heart of the story — maximum emotional impact." },
    { name: "resolution", weight: 0.25, purpose: "Deliver the payoff — resolution, transformation." }
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
// SCENE BREAKDOWN PROMPT BUILDER
// ══════════════════════════════════════════════════════════════════

function buildBreakdownPrompt({
  styleDirective, storyAnalysis, characterBlock, continuityContext,
  phaseName, phasePurpose, sceneCount, sceneStart, scriptText,
  beatDurationsSlice, nicheProfile
}) {
  const durLine = beatDurationsSlice.length > 0
    ? `\n**DURATION TARGETS (seconds per scene):** [${beatDurationsSlice.map(d => d.toFixed(1)).join(', ')}]`
    : '';

  return `You are a world-class film director blocking out scenes for a visual narrative.
${styleDirective}

**YOUR STORY ANALYSIS:**
- Central Theme: ${storyAnalysis.central_theme}
- Narrative Arc: ${storyAnalysis.narrative_arc_summary}
- Emotional Trajectory: ${JSON.stringify(storyAnalysis.emotional_trajectory)}
- Visual World: ${storyAnalysis.visual_world}
- Recurring Motifs: ${JSON.stringify(storyAnalysis.recurring_visual_motifs)}
- Color Arc: ${storyAnalysis.color_arc}

${characterBlock}

${continuityContext}

**CURRENT PHASE: ${phaseName.toUpperCase()}**
Purpose: ${phasePurpose}
Scenes to create: ${sceneCount}
Scene numbers: ${sceneStart} through ${sceneStart + sceneCount - 1}
${durLine}

**SCRIPT SEGMENT:**
${scriptText}

**RULES:**
1. Scenes are VISUAL BEATS, not sentences. Change scene when the visual changes.
2. visual_concept: 2-4 sentences. Environment FIRST, then character ACTION, then atmosphere.
3. Shot variety: NEVER same shot type consecutively. Cycle WS/EWS/MWS/MS/LOW/HIGH/OTS/MCU/CU/POV/DUTCH.
4. ALWAYS name specific objects from the narration (cellphone, laptop, bill, receipt, etc.) as PROPS — "clutching her cellphone", "staring at the overdue bill". But NEVER describe what's ON the screen/paper — no text, UI, dollar amounts, app names.
5. Abstract concepts → PHYSICAL METAPHORS. Use the EXACT nouns from the script.
6. Characters must be IN a detailed environment doing an ACTION — never isolated against blank/blurred background.
7. Adjacent scenes share a CONTINUITY element (shared prop, color shift, gesture echo).
8. IMMERSION — every scene must include at least 2 of: (a) foreground element between camera and subject, (b) sensory texture (steam, rain, dust, wind-blown hair), (c) character micro-action (tapping fingers, adjusting glasses, biting lip), (d) background storytelling detail (half-eaten meal, wilting plant, child's drawing), (e) specific time-of-day lighting ("4AM blue pre-dawn glow"), (f) scale contrast (person dwarfed by lobby).
9. NICHE: ${nicheProfile.visual_world} | ${nicheProfile.emotional_palette} | AVOID: ${nicheProfile.avoid}

**RESPONSE FORMAT:**
{
  "scenes": [
    {
      "scene_number": ${sceneStart},
      "narration_text": "EXACT words from the script segment.",
      "visual_concept": "Rich cinematic description of what we SEE.",
      "shot_type": "e.g. WS — Wide Shot",
      "camera_angle": "e.g. Low angle, 15 degrees",
      "camera_movement": "e.g. Slow push-in over 5 seconds",
      "lighting": "e.g. Single warm practical light from desk lamp",
      "color_palette": "e.g. Warm amber #D4A574, deep shadow #2C1810",
      "mood": "2-3 words",
      "depth_of_field": "e.g. Shallow f/1.4",
      "continuity_bridge": "Visual thread to next scene",
      "emotional_intensity": 0.5,
      "duration_seconds": 5
    }
  ]
}

**CRITICAL:** Generate EXACTLY ${sceneCount} scenes. Use ONLY script words for narration_text.`;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const callStart = Date.now();
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
      return Response.json({ error: 'No final script found.' }, { status: 400 });
    }

    const cleanedScript = cleanScriptText(script.full_script);
    let finalScript = cleanedScript;
    if (selected_hook) {
      finalScript = `${selected_hook}. ${cleanedScript.replace(selected_hook, "").trim()}`;
    }

    const wordCount = finalScript.split(/\s+/).filter(w => w.length > 0).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    const niche = project.niche || 'general';
    const rawStyle = project.visual_style || '';
    const visualStyle = normalizeStyleKey(rawStyle);
    const styleDirective = getStyleCharacterDirective(visualStyle);

    // ═══ DURATION-AWARE SCENE DENSITY ═══
    const densityAnchors = [
      {m:1,d:4.2},{m:3,d:5.0},{m:5,d:5.5},{m:8,d:6.0},
      {m:10,d:6.2},{m:15,d:7.0},{m:30,d:8.0},{m:60,d:9.0}
    ];
    function getAvgSceneDuration(mins) {
      if (mins <= densityAnchors[0].m) return densityAnchors[0].d;
      if (mins >= densityAnchors[densityAnchors.length-1].m) return densityAnchors[densityAnchors.length-1].d;
      for (let i = 0; i < densityAnchors.length - 1; i++) {
        const lo = densityAnchors[i], hi = densityAnchors[i+1];
        if (mins >= lo.m && mins <= hi.m) {
          const t = (mins - lo.m) / (hi.m - lo.m);
          return lo.d + t * (hi.d - lo.d);
        }
      }
      return 5.5;
    }
    const avgSceneDuration = getAvgSceneDuration(durationMinutes);
    const totalTargetScenes = Math.max(8, Math.round((durationMinutes * 60) / avgSceneDuration));

    const phases = calculatePhaseAllocation(totalTargetScenes);
    const scriptChunks = splitScriptByPhase(finalScript, phases);
    const numBatches = scriptChunks.length;
    const nicheProfile = getNicheDirectorProfile(niche);

    console.log(`🎯 ${durationMinutes}min → ${totalTargetScenes} scenes (avg ${avgSceneDuration.toFixed(1)}s) | ${numBatches} phases | Style: ${visualStyle || 'default'}`);

    // ══════════════════════════════════════════════════════════════
    // BATCH 0: Story analysis + all phases in one call
    // BATCH 1+: Resume from a specific phase (timeout recovery)
    // ══════════════════════════════════════════════════════════════

    let blueprint;
    let freshProject = project;
    let storyAnalysis;
    let beatDurations = [];
    let beatStartTimes = [];
    let phaseStart = 0;

    if (startBatch === 0) {
      // ── Delete old scenes (parallel batches of 10) ──
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      if (oldScenes.length > 0) {
        for (let i = 0; i < oldScenes.length; i += 10) {
          await Promise.all(oldScenes.slice(i, i + 10).map(s =>
            base44.asServiceRole.entities.Scenes.delete(s.id).catch(_ => {})
          ));
        }
        console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
      }

      // ── Story Analysis ──
      const analysisPrompt = `You are a world-class film director. Study this script and respond with JSON.
${styleDirective}

**SCRIPT:**
${finalScript}

**NICHE:** ${niche} | **TOPIC:** ${project.name} | **DURATION:** ~${durationMinutes}min | **SCENES:** ${totalTargetScenes}

Respond with this JSON:
{
  "story_analysis": {
    "central_theme": "The deeper human truth (NOT the topic)",
    "narrative_arc_summary": "2-3 sentence emotional journey",
    "emotional_trajectory": ["curiosity","concern","empathy","hope"],
    "key_turning_points": ["Moment 1","Moment 2","Moment 3"],
    "visual_world": "Specific sensory description of this story's visual universe",
    "recurring_visual_motifs": ["Motif 1","Motif 2","Motif 3"],
    "color_arc": "e.g. cool blues → warm amber → vibrant gold",
    "characters": [{
      "name": "Name/archetype",
      "identity_core": "Casting-sheet: exact age, SPECIFIC gender (must be 'male' or 'female' — NEVER 'neutral' or 'any'), skin tone shade, face shape, eye color+shape, nose, lips, hair (color/length/style), build+height, 2-3 distinguishing marks. Must be specific enough for 20 artists to draw the SAME person. If the script doesn't specify gender, pick one and commit to it for consistency.",
      "default_clothing": "Typical outfit (can change per scene)",
      "emotional_arc": "How they change emotionally"
    }]
  }
}

NICHE SENSIBILITY: ${nicheProfile.visual_world} | ${nicheProfile.emotional_palette} | AVOID: ${nicheProfile.avoid}`;

      console.log(`🎬 Story analysis...`);
      const analysis = await callGemini(analysisPrompt, 0.6);
      storyAnalysis = analysis.story_analysis || analysis;

      // ── Beat durations ──
      beatDurations = calculateBeatDurations(phases, durationMinutes);
      beatStartTimes = calculateStartTimes(beatDurations);

      console.log(`📊 Beats: ${beatDurations.length} scenes | Range: ${Math.min(...beatDurations).toFixed(1)}s – ${Math.max(...beatDurations).toFixed(1)}s | Total: ${beatDurations.reduce((a,b)=>a+b,0).toFixed(1)}s`);

      // ── Save story analysis + beats to ProductionSettings ──
      const saForSave = { ...storyAnalysis };
      delete saForSave.characters; // saved separately on Project
      const psPayload = {
        beat_durations: JSON.stringify(beatDurations),
        beat_start_times: JSON.stringify(beatStartTimes),
        story_analysis: JSON.stringify(saForSave)
      };
      const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
      if (psList[0]) {
        await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
      } else {
        await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
      }

      // ── Tiny flag on scene_blueprint (field has ~1000 char limit) ──
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown",
        current_step: 5,
        scene_blueprint: `{"ready":true,"niche":"${niche}","ts":${totalTargetScenes}}`,
        character_descriptions: storyAnalysis.characters
          ? JSON.stringify(storyAnalysis.characters)
          : project.character_descriptions
      });

      // Build in-memory blueprint for the phase loop
      blueprint = {
        story_analysis: storyAnalysis,
        phases: phases.map(p => ({ name: p.name, purpose: p.purpose, scene_count: p.scenes })),
        total_target_scenes: totalTargetScenes,
        niche_profile: nicheProfile,
        beat_durations: beatDurations,
        beat_start_times: beatStartTimes,
        scenes: []
      };

      freshProject = {
        ...project,
        character_descriptions: storyAnalysis.characters
          ? JSON.stringify(storyAnalysis.characters)
          : project.character_descriptions
      };

      console.log(`✓ Analysis: "${(storyAnalysis.central_theme || '').substring(0, 60)}" | ${storyAnalysis.characters?.length || 0} characters`);
      phaseStart = 0;

    } else {
      // ── Resume from a specific phase (timeout recovery) ──
      phaseStart = startBatch - 1;
      if (phaseStart < 0) phaseStart = 0;

      const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
      if (!psList[0]?.story_analysis) {
        return Response.json({ error: 'Story analysis not found. Run batch 0 first.' }, { status: 400 });
      }
      storyAnalysis = JSON.parse(psList[0].story_analysis);
      beatDurations = JSON.parse(psList[0].beat_durations || '[]');
      beatStartTimes = JSON.parse(psList[0].beat_start_times || '[]');

      freshProject = (await base44.asServiceRole.entities.Projects.filter({ id: project_id }))[0];
      if (freshProject?.character_descriptions) {
        try { storyAnalysis.characters = JSON.parse(freshProject.character_descriptions); } catch (_) {}
      }

      blueprint = {
        story_analysis: storyAnalysis,
        niche_profile: nicheProfile,
        beat_durations: beatDurations,
        beat_start_times: beatStartTimes,
        scenes: []
      };

      console.log(`⏩ Resuming from phase ${phaseStart}`);
    }

    // ── Character block for prompts ──
    let characters = [];
    if (freshProject.character_descriptions) {
      try { characters = JSON.parse(freshProject.character_descriptions); } catch (_) {}
    }
    const characterBlock = characters.length > 0
      ? `**CHARACTERS (use these EXACT descriptions):**\n${characters.map(c => {
          const id = c.identity_core || c.visual_description || c.description || '';
          const clothing = c.default_clothing ? ` | Clothing: ${c.default_clothing}` : '';
          return `  • ${c.name}: ${id}${clothing}`;
        }).join('\n')}`
      : '';

    // ══════════════════════════════════════════════════════════════
    // PHASE LOOP — all phases in one call, sub-batched if > 20 scenes
    // ══════════════════════════════════════════════════════════════

    let grandTotalCreated = 0;
    const MAX_WALL_MS = 55000;
    const MAX_SCENES_PER_CALL = 20;

    for (let batchIdx = phaseStart; batchIdx < scriptChunks.length; batchIdx++) {
      // ── Timeout safety valve ──
      const elapsed = Date.now() - callStart;
      if (elapsed > MAX_WALL_MS && batchIdx > phaseStart) {
        console.log(`⏱️ ${(elapsed/1000).toFixed(1)}s elapsed — saving progress, returning for resume`);
        await base44.asServiceRole.entities.Projects.update(project_id, {
          scene_blueprint: `{"ready":true,"niche":"${niche}","ts":${totalTargetScenes},"sc":${grandTotalCreated}}`
        });
        return Response.json({
          success: true, done: false,
          next_batch: batchIdx + 1,
          scenes_created: grandTotalCreated,
          total_target: totalTargetScenes,
          total_batches: numBatches + 1
        });
      }

      const currentChunk = scriptChunks[batchIdx];
      const existingScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      const sceneOffset = existingScenes.length;

      // ── Continuity from last 3 existing scenes ──
      const recentScenes = existingScenes
        .sort((a, b) => b.scene_number - a.scene_number)
        .slice(0, 3)
        .reverse();

      let continuityContext = '**This is the OPENING — establish the visual world with a strong first impression.**';
      if (recentScenes.length > 0) {
        const lines = recentScenes.map(s => {
          let d = null;
          if (s.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
            try { d = JSON.parse(s.image_prompt.substring(15)); } catch (_) {}
          }
          const shot = d?.shot_type || 'MS';
          const vc = (d?.visual_concept || s.narration_text || '').substring(0, 80);
          const mood = d?.mood || '';
          return `  Scene ${s.scene_number}: [${shot}] ${vc} | Mood: ${mood}`;
        });
        continuityContext = `**LAST ${recentScenes.length} SCENES (for visual continuity):**\n${lines.join('\n')}`;
      }

      // ── Sub-batch if phase has > MAX_SCENES_PER_CALL scenes ──
      const subBatches = [];
      const chunkWords = currentChunk.text.split(/\s+/);
      const wordsPerScene = Math.max(1, Math.ceil(chunkWords.length / currentChunk.scenes));
      let subRemaining = currentChunk.scenes;
      let subOffset = sceneOffset;

      while (subRemaining > 0) {
        const count = Math.min(subRemaining, MAX_SCENES_PER_CALL);
        subBatches.push({ offset: subOffset, count });
        subOffset += count;
        subRemaining -= count;
      }

      let phaseCreated = 0;

      for (let si = 0; si < subBatches.length; si++) {
        const sub = subBatches[si];

        // Timeout check between sub-batches
        const elapsed2 = Date.now() - callStart;
        if (elapsed2 > MAX_WALL_MS && phaseCreated > 0) {
          console.log(`⏱️ ${(elapsed2/1000).toFixed(1)}s — saving mid-phase progress`);
          break;
        }

        // Slice script text proportionally
        const wordStart = (sub.offset - sceneOffset) * wordsPerScene;
        const wordEnd = Math.min(wordStart + sub.count * wordsPerScene, chunkWords.length);
        const subText = chunkWords.slice(wordStart, wordEnd).join(' ');
        const subBeats = beatDurations.slice(sub.offset, sub.offset + sub.count);

        const prompt = buildBreakdownPrompt({
          styleDirective,
          storyAnalysis,
          characterBlock,
          continuityContext,
          phaseName: currentChunk.phase,
          phasePurpose: currentChunk.purpose,
          sceneCount: sub.count,
          sceneStart: sub.offset + 1,
          scriptText: subText,
          beatDurationsSlice: subBeats,
          nicheProfile
        });

        const subLabel = subBatches.length > 1 ? ` (sub ${si+1}/${subBatches.length})` : '';
        console.log(`🎬 Phase ${batchIdx+1}/${numBatches}: ${currentChunk.phase} — scenes ${sub.offset+1}-${sub.offset+sub.count}${subLabel} [${subText.split(/\s+/).length} words]`);

        let result;
        try {
          result = await callGemini(prompt, 0.7);
        } catch (err) {
          console.error(`❌ Scenes ${sub.offset+1}-${sub.offset+sub.count} FAILED: ${err.message}`);
          // Retry with half the scenes
          if (sub.count > 10) {
            console.log(`🔄 Retrying with ${Math.ceil(sub.count/2)} scenes...`);
            try {
              const halfPrompt = buildBreakdownPrompt({
                styleDirective, storyAnalysis, characterBlock, continuityContext,
                phaseName: currentChunk.phase, phasePurpose: currentChunk.purpose,
                sceneCount: Math.ceil(sub.count / 2),
                sceneStart: sub.offset + 1,
                scriptText: subText,
                beatDurationsSlice: subBeats.slice(0, Math.ceil(sub.count / 2)),
                nicheProfile
              });
              result = await callGemini(halfPrompt, 0.7);
            } catch (retryErr) {
              console.error(`❌ Retry also failed: ${retryErr.message} — skipping`);
              continue;
            }
          } else {
            continue;
          }
        }

        // Extract scenes from result (handle different possible keys)
        let scenesArr = result?.scenes;
        if (!scenesArr || !Array.isArray(scenesArr)) {
          scenesArr = result?.prompts || result?.scene || null;
          if (Array.isArray(scenesArr)) {
            console.warn(`⚠️ Scenes found under non-standard key (${Object.keys(result).join(',')})`);
          } else {
            console.error(`❌ No scenes array. Keys: ${JSON.stringify(Object.keys(result || {}))}. Sample: ${JSON.stringify(result).substring(0, 200)}`);
            continue;
          }
        }

        // Check for duplicate consecutive shot types
        for (let i = 1; i < scenesArr.length; i++) {
          if (scenesArr[i].shot_type === scenesArr[i-1].shot_type) {
            console.warn(`⚠️ Duplicate shot type at scene ${scenesArr[i].scene_number}: ${scenesArr[i].shot_type}`);
          }
        }

        for (const scene of scenesArr) {
          const sceneNum = sceneOffset + phaseCreated + 1;
          const cleanedNarration = cleanNarrationText(scene.narration_text);
          const targetDuration = beatDurations[sceneNum - 1] || scene.duration_seconds || 5;

          // Store director notes on the Scene record itself
          const directorNotes = {
            visual_concept: scene.visual_concept,
            shot_type: scene.shot_type,
            camera_angle: scene.camera_angle,
            camera_movement: scene.camera_movement,
            lighting: scene.lighting,
            color_palette: scene.color_palette,
            mood: scene.mood,
            depth_of_field: scene.depth_of_field,
            continuity_bridge: scene.continuity_bridge,
            emotional_intensity: scene.emotional_intensity || 0.5,
            phase: currentChunk.phase
          };

          await base44.asServiceRole.entities.Scenes.create({
            project_id,
            scene_number: sceneNum,
            narration_text: cleanedNarration,
            image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
            animation_prompt: "",
            duration_seconds: targetDuration,
            status: "breakdown_ready"
          });

          // Keep in memory for continuity context
          blueprint.scenes.push({
            scene_number: sceneNum,
            phase: currentChunk.phase,
            visual_concept: scene.visual_concept,
            shot_type: scene.shot_type,
            mood: scene.mood,
            color_palette: scene.color_palette,
            continuity_bridge: scene.continuity_bridge,
            emotional_intensity: scene.emotional_intensity || 0.5,
            duration_seconds: targetDuration
          });

          phaseCreated++;
        }

        // Update continuity context for next sub-batch
        if (si < subBatches.length - 1 && blueprint.scenes.length >= 3) {
          const last3 = blueprint.scenes.slice(-3);
          continuityContext = `**LAST 3 SCENES:**\n${last3.map(s =>
            `  Scene ${s.scene_number}: [${s.shot_type}] ${(s.visual_concept || '').substring(0, 80)} | Mood: ${s.mood}`
          ).join('\n')}`;
        }
      } // end sub-batch loop

      grandTotalCreated += phaseCreated;
      console.log(`✓ ${currentChunk.phase}: ${phaseCreated} scenes (total: ${grandTotalCreated}/${totalTargetScenes}) [${((Date.now()-callStart)/1000).toFixed(1)}s]`);

    } // end phase loop

    // ── All phases done ──
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: "breakdown_complete",
      current_step: 5,
      scene_blueprint: `{"ready":true,"niche":"${niche}","ts":${totalTargetScenes},"sc":${grandTotalCreated}}`
    });

    console.log(`🎉 COMPLETE — ${grandTotalCreated} scenes in ${((Date.now()-callStart)/1000).toFixed(1)}s`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: grandTotalCreated,
      total_scenes: grandTotalCreated,
      total_target: totalTargetScenes,
      total_batches: numBatches,
      beat_durations: beatDurations,
      beat_start_times: beatStartTimes
    });

  } catch (error) {
    console.error("❌ generateSceneBreakdown error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});