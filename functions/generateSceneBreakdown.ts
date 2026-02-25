import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE — DETERMINISTIC CLIP COUNT
// ══════════════════════════════════════════════════════════════════
// Designed for scripts up to 10,000 words (~400+ scenes).
//
// KEY CHANGES FOR SCALE:
// 1. Scenes saved INCREMENTALLY per batch (not all at end)
// 2. Visual batches run with limited parallelism (2 concurrent)
// 3. Frontend polls DB for progress — tolerates 504 timeouts
// ══════════════════════════════════════════════════════════════════

const CLIP_DURATION = 5;
const MIN_CLIPS = 5;
const MAX_CLIPS = 1000;
const VISUAL_BATCH = 12;
const PARALLEL_VISUAL_BATCHES = 4; // Run 4 Gemini visual calls concurrently

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
            if (parsed.scenes || parsed.story_analysis || parsed.visuals) return parsed;
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
// CLIP BUDGET CALCULATOR
// ══════════════════════════════════════════════════════════════════

async function calculateClipBudget(base44, project, wordCount) {
  let estimatedSeconds = 0;
  let source = 'unknown';

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
  } catch (_) {}

  if (estimatedSeconds === 0 && wordCount > 0) {
    estimatedSeconds = Math.round((wordCount / 150) * 60);
    source = 'word_count_estimate';
    console.log(`📝 Estimated from ${wordCount} words @ 150 wpm: ${estimatedSeconds}s`);
  }

  if (estimatedSeconds === 0) {
    const mins = project.video_duration_minutes || 2;
    estimatedSeconds = mins * 60;
    source = 'project_duration_fallback';
    console.log(`⚠️ Fallback to project duration: ${mins}min = ${estimatedSeconds}s`);
  }

  const rawClips = Math.floor(estimatedSeconds / CLIP_DURATION);
  const maxClips = Math.max(MIN_CLIPS, Math.min(MAX_CLIPS, rawClips));

  console.log(`📊 Clip budget: ${estimatedSeconds}s / ${CLIP_DURATION}s = ${rawClips} -> clamped to ${maxClips} clips`);

  return { estimatedSeconds, maxClips, source };
}

// ══════════════════════════════════════════════════════════════════
// DETERMINISTIC NARRATION SPLITTER
// ══════════════════════════════════════════════════════════════════

function splitNarrationIntoBeats(script, numBeats) {
  const sentences = script.match(/[^.!?]+[.!?]+[\s]*/g) || [script];
  const words = script.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;
  const wordsPerBeat = Math.max(1, Math.floor(totalWords / numBeats));

  const beats = [];

  if (sentences.length >= numBeats) {
    const sentencesPerBeat = sentences.length / numBeats;
    for (let i = 0; i < numBeats; i++) {
      const startIdx = Math.round(i * sentencesPerBeat);
      const endIdx = Math.round((i + 1) * sentencesPerBeat);
      const chunk = sentences.slice(startIdx, endIdx).join('').trim();
      beats.push(chunk || sentences[startIdx] || '');
    }
  } else {
    let wordCursor = 0;
    for (let i = 0; i < numBeats; i++) {
      const isLast = i === numBeats - 1;
      const endCursor = isLast ? totalWords : Math.min(wordCursor + wordsPerBeat, totalWords);
      const chunk = words.slice(wordCursor, endCursor).join(' ');
      beats.push(chunk || '');
      wordCursor = endCursor;
    }
  }

  while (beats.length < numBeats) {
    beats.push(beats[beats.length - 1] || '');
  }

  for (let i = 0; i < beats.length; i++) {
    if (!beats[i] || beats[i].trim().length === 0) {
      beats[i] = beats[Math.max(0, i - 1)] || words.slice(-3).join(' ');
    }
  }

  return beats.slice(0, numBeats);
}

// ══════════════════════════════════════════════════════════════════
// ARC POSITION CALCULATOR
// ══════════════════════════════════════════════════════════════════

function getArcPosition(beatIndex, totalBeats) {
  const pct = beatIndex / totalBeats;
  if (pct < 0.10) return { arc: 'setup', phase: 'cold_open' };
  if (pct < 0.35) return { arc: 'rising', phase: 'rising_tension' };
  if (pct < 0.75) return { arc: 'climax', phase: 'emotional_core' };
  return { arc: 'resolution', phase: 'resolution' };
}

// ══════════════════════════════════════════════════════════════════
// NICHE DIRECTOR PROFILES
// ══════════════════════════════════════════════════════════════════

function getNicheDirectorProfile(niche) {
  const profiles = {
    finance: {
      visual_world: "Corporate glass towers vs intimate kitchen tables, Wall Street grandeur vs suburban vulnerability",
      signature_shots: "Overhead God's-eye documents, tight CU hands gripping objects, silhouettes against windows",
      emotional_palette: "Cool blues/grays shifting to warm ambers/golds, deep shadows, golden hour resolution",
      avoid: "Literal cash flying, generic stock offices, calculator close-ups"
    },
    retirement: {
      visual_world: "Golden-hour suburbs, well-worn family homes, generational gatherings",
      signature_shots: "Slow pans across photo mantles, weathered hands detail, depth through doorways",
      emotional_palette: "Warm amber/honey, golden hour, earth tones, morning mist blues",
      avoid: "Lonely elderly stereotypes, clinical settings, generic beach sunsets"
    },
    motivation: {
      visual_world: "Mountain peaks/valleys, training spaces, pre-dawn cities, sweat made beautiful",
      signature_shots: "Low-angle hero shots, tracking forward motion, silhouettes against epic backdrops",
      emotional_palette: "Dark blues/blacks building to fiery oranges and triumphant golds",
      avoid: "Cheesy flexing, generic mountaintop arms raised, lion/wolf imagery"
    },
    horror: {
      visual_world: "Liminal spaces, barely-lit corridors, familiar places made wrong",
      signature_shots: "Dutch angles, long corridor depth, POV approach, static wide with something wrong",
      emotional_palette: "Sickly greens, desaturated blues, deep blacks, crimson accents",
      avoid: "Over-the-top gore, cheap jump scares, cliche haunted house"
    },
    technology: {
      visual_world: "Clean labs and messy maker spaces, circuit patterns echoing nature",
      signature_shots: "Macro components, rack focus human/machine, reflections in screens",
      emotional_palette: "Cool blues/whites precision, warm ambers human moments, neon innovation",
      avoid: "Matrix code rain, cliche robots, hologram interfaces"
    },
    health: {
      visual_world: "Body as landscape, kitchens as labs, nature as pharmacy",
      signature_shots: "Macro food beauty, mindful human moments, nature parallels",
      emotional_palette: "Fresh greens, clean whites, warm skin tones, sunrise golds",
      avoid: "Clinical imagery, shame shots, unrealistic body standards"
    },
    crime: {
      visual_world: "Rain-slicked streets, interrogation rooms, evidence boards",
      signature_shots: "Noir low-key lighting, over-shoulder reveals, half-shadow profiles",
      emotional_palette: "Deep noir blues/blacks, sodium oranges, forensic whites",
      avoid: "Gratuitous violence, sensationalized victims, cop show cliches"
    },
    history: {
      visual_world: "Weathered textures, vast landscapes dwarfing figures, artifacts as time portals",
      signature_shots: "Epic wides, slow zoom period details, artifact close-ups",
      emotional_palette: "Sepia nostalgia, stone grays authority, jewel tones power",
      avoid: "Cartoonish period stereotypes, too-clean historical settings"
    },
    education: {
      visual_world: "Light-filled spaces, abstract made tangible, discovery joy",
      signature_shots: "Revealing wides, diagram compositions, POV discovery",
      emotional_palette: "Bright clear colors, warm yellows, cool blues contemplation",
      avoid: "Boring classrooms, lecturing framing, academic dryness"
    },
    travel: {
      visual_world: "Golden hour landscapes, local markets, contemplative foreign moments",
      signature_shots: "Sweeping drone establishing, street-level handheld, food macro",
      emotional_palette: "Rich saturated local palettes, golden travel light, azure skies",
      avoid: "Brochure cliches, over-filtered Instagram, cultural stereotypes"
    },
    relationship: {
      visual_world: "Intimate shared spaces, geometry of two people, environment as emotion",
      signature_shots: "Two-shots with negative space, OTS intimacy, hand details",
      emotional_palette: "Warm amber connection, cool blues distance, soft rose intimacy",
      avoid: "Cheesy romance, toxic glorification, superficial beauty shots"
    }
  };

  return profiles[niche?.toLowerCase()] || {
    visual_world: "Environments reflecting narrative emotion, open vs enclosed spaces",
    signature_shots: "Establishing wides, medium connection shots, close-up emotion, macro details",
    emotional_palette: "Cool/muted for tension, warm/saturated for resolution",
    avoid: "Generic stock aesthetics, repetitive compositions"
  };
}

// ══════════════════════════════════════════════════════════════════
// DEFAULT SHOT TYPES
// ══════════════════════════════════════════════════════════════════

const SHOT_CYCLE = [
  'WS — Wide Shot', 'MS — Medium Shot', 'CU — Close-Up',
  'MCU — Medium Close-Up', 'EWS — Extreme Wide Shot',
  'OTS — Over The Shoulder', 'LOW ANGLE', 'HIGH ANGLE',
  'INSERT — Detail Shot', 'ECU — Extreme Close-Up',
  'MWS — Medium Wide Shot', 'DUTCH ANGLE', 'POV'
];

// ══════════════════════════════════════════════════════════════════
// BATCH VISUAL FETCH — processes one batch of beats
// ══════════════════════════════════════════════════════════════════

async function fetchVisualsForBatch(bStart, bEnd, narrationBeats, maxClips, estimatedSeconds, storyAnalysis, nicheProfile, niche, characters) {
  const batchBeats = narrationBeats.slice(bStart, bEnd);
  const characterBlock = characters.length > 0
    ? `**CHARACTERS:**\n${characters.map(c => `• ${c.name}: ${c.visual_description || ''}`).join('\n')}`
    : '';

  const batchBeatList = batchBeats.map((text, i) => {
    const beatNum = bStart + i + 1;
    const { arc } = getArcPosition(bStart + i, maxClips);
    return `BEAT ${beatNum} [${arc.toUpperCase()}]: "${text}"`;
  }).join('\n');

  const visualPrompt = `You are an award-winning film director with 30 years of experience. You feel stories through images.
Every frame must carry EMOTIONAL WEIGHT — you don't just "show" narration, you INTERPRET it cinematically.

I have ${maxClips} pre-defined narration beats for a ${estimatedSeconds}-second video.
Direct the visual language for beats ${bStart + 1} through ${bEnd}.

**THE SOUL OF THIS STORY:**
Theme: ${storyAnalysis.central_theme}
Arc: ${storyAnalysis.narrative_arc_summary}
Visual World: ${storyAnalysis.visual_world}
Color Arc: ${storyAnalysis.color_arc}
Motifs: ${JSON.stringify(storyAnalysis.recurring_visual_motifs)}
${characterBlock}

**NARRATION BEATS TO DIRECT:**
${batchBeatList}

**YOUR CINEMATOGRAPHIC RULES:**
1. Each beat = one ${CLIP_DURATION}-second EMOTIONAL MOMENT.
2. Visual concept must be a SPECIFIC frozen moment (2-4 rich sentences).
3. Abstract ideas → CONCRETE physical metaphors.
4. EMOTIONAL ESCALATION within the sequence.
5. Adjacent beats share ONE visual continuity thread.
6. Shot variety is sacred — NEVER two consecutive identical shot types.
7. Camera movement tells emotion: STILLNESS = dread, PUSH-IN = intimacy, PULL-BACK = isolation, TRACKING = journey, HANDHELD = urgency
8. Lighting is character: HARD LIGHT = truth, SOFT LIGHT = memory, RIM LIGHT = separation, UNDER-LIGHT = menace

Niche (${niche}): ${nicheProfile.visual_world} | Signature: ${nicheProfile.signature_shots} | AVOID: ${nicheProfile.avoid}

**RESPOND with JSON — one object per beat, ${batchBeats.length} objects:**
{
  "visuals": [
    {
      "beat_number": ${bStart + 1},
      "visual_concept": "Rich 2-4 sentence cinematic frozen moment",
      "shot_type": "e.g. 'ECU — Extreme Close-Up'",
      "camera_angle": "e.g. 'Low angle, 15 degrees'",
      "camera_movement": "e.g. 'Slow push-in over 5s'",
      "lighting": "e.g. 'Single warm key left'",
      "color_palette": "e.g. 'Warm amber #D4A574'",
      "mood": "2-3 visceral words",
      "depth_of_field": "e.g. 'Shallow f/1.4'",
      "niche_visual_element": "One specific metaphor",
      "continuity_bridge": "Visual thread to next beat",
      "emotional_intensity": 0.5
    }
  ]
}

${batchBeats.length} objects for beats ${bStart + 1}-${bEnd}. NEVER include text, charts, or UI in visuals.`;

  const visualResult = await callGemini(visualPrompt, 0.7, 16384);
  const visuals = visualResult.visuals || visualResult.scenes || [];

  const result = {};
  for (const v of visuals) {
    const num = v.beat_number || v.scene_number;
    if (num >= 1 && num <= maxClips) {
      result[num] = v;
    }
  }

  // Also map by array index if beat_number is missing
  if (visuals.length > 0 && !visuals[0].beat_number && !visuals[0].scene_number) {
    visuals.forEach((v, i) => {
      const num = bStart + i + 1;
      if (!result[num]) result[num] = v;
    });
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════
// SAVE ONE BATCH OF SCENES TO DB
// ══════════════════════════════════════════════════════════════════

async function saveBatchScenes(base44, projectId, narrationBeats, visualsMap, startIdx, endIdx, maxClips, nicheProfile) {
  const promises = [];

  for (let i = startIdx; i < endIdx; i++) {
    const sceneNum = i + 1;
    const { arc, phase } = getArcPosition(i, maxClips);
    const visual = visualsMap[sceneNum];
    const cleanedNarration = cleanNarrationText(narrationBeats[i]);

    const arcDefaults = {
      setup:      { movement: 'Slow drift right, establishing', angle: 'Eye level, slightly wide', dof: 'Deep f/5.6', intensity: 0.3 },
      rising:     { movement: 'Steady push-in, building', angle: 'Slightly low, 10 degrees', dof: 'Medium f/2.8', intensity: 0.55 },
      climax:     { movement: 'Assertive push-in, tight', angle: 'Low angle, 20 degrees', dof: 'Shallow f/1.4', intensity: 0.85 },
      resolution: { movement: 'Gentle pull-back, releasing', angle: 'Eye level, centered', dof: 'Moderate f/4', intensity: 0.4 }
    };
    const arcDef = arcDefaults[arc] || arcDefaults.rising;

    const directorNotes = {
      visual_concept: visual?.visual_concept || `Cinematic moment capturing: ${cleanedNarration.substring(0, 120)}`,
      shot_type: visual?.shot_type || SHOT_CYCLE[i % SHOT_CYCLE.length],
      camera_angle: visual?.camera_angle || arcDef.angle,
      camera_movement: visual?.camera_movement || arcDef.movement,
      lighting: visual?.lighting || (arc === 'climax' ? 'Hard key light with dramatic shadows' : 'Natural ambient, soft fill'),
      color_palette: visual?.color_palette || nicheProfile.emotional_palette?.split(',')[0] || 'Warm neutral tones',
      mood: visual?.mood || (arc === 'setup' ? 'quiet anticipation' : arc === 'rising' ? 'building tension' : arc === 'climax' ? 'raw intensity' : 'gentle resolve'),
      depth_of_field: visual?.depth_of_field || arcDef.dof,
      niche_visual_element: visual?.niche_visual_element || '',
      continuity_bridge: visual?.continuity_bridge || '',
      emotional_intensity: visual?.emotional_intensity || arcDef.intensity,
      arc_position: arc,
      phase: phase,
      _has_llm_visual: !!visual
    };

    const arcIntensityMap = { setup: 'gentle, observant', rising: 'building, purposeful', climax: 'dynamic, emotionally charged', resolution: 'softening, contemplative' };
    const arcMotionQuality = arcIntensityMap[arc] || 'measured, cinematic';
    const initAnimPrompt = `${directorNotes.camera_movement} over ${CLIP_DURATION} seconds. The motion quality is ${arcMotionQuality}. ${directorNotes.lighting ? `Light: ${directorNotes.lighting}.` : ''} Mood: ${directorNotes.mood || 'cinematic tension'}. Subtle atmospheric particles drift through the frame.`;

    promises.push(
      base44.asServiceRole.entities.Scenes.create({
        project_id: projectId,
        scene_number: sceneNum,
        narration_text: cleanedNarration,
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: initAnimPrompt,
        duration_seconds: CLIP_DURATION,
        status: "breakdown_ready"
      }).then(() => ({ ok: true, visual: !!visual }))
        .catch(err => {
          console.error(`Failed to save scene ${sceneNum}:`, err.message);
          return { ok: false, visual: false };
        })
    );
  }

  return Promise.all(promises);
}

// ══════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, selected_hook } = await req.json();

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

    const cleanedScript = cleanScriptText(script.full_script);
    let finalScript = cleanedScript;
    if (selected_hook) {
      finalScript = `${selected_hook}. ${cleanedScript.replace(selected_hook, "").trim()}`;
    }

    const wordCount = finalScript.split(/\s+/).filter(w => w.length > 0).length;
    const niche = project.niche || 'general';
    const nicheProfile = getNicheDirectorProfile(niche);

    // ══════════════════════════════════════════════════════════════
    // CLIP BUDGET
    // ══════════════════════════════════════════════════════════════
    const budget = await calculateClipBudget(base44, project, wordCount);
    const maxClips = budget.maxClips;
    const estimatedSeconds = budget.estimatedSeconds;

    // ══════════════════════════════════════════════════════════════
    // DETERMINISTIC NARRATION SPLIT
    // ══════════════════════════════════════════════════════════════
    const narrationBeats = splitNarrationIntoBeats(finalScript, maxClips);

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 SCENE BREAKDOWN — DETERMINISTIC COUNT`);
    console.log(`📖 ${wordCount} words | ~${estimatedSeconds}s | 🎬 ${maxClips} clips (${budget.source})`);
    console.log(`✂️ Narration pre-split into EXACTLY ${narrationBeats.length} beats`);
    console.log(`📊 Avg words/beat: ${Math.round(wordCount / maxClips)}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ── Delete existing scenes ─────────────────────────────────────
    try {
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      if (oldScenes.length > 0) {
        // Delete in parallel batches of 20
        for (let d = 0; d < oldScenes.length; d += 20) {
          const batch = oldScenes.slice(d, d + 20);
          await Promise.all(batch.map(s => base44.asServiceRole.entities.Scenes.delete(s.id)));
        }
        console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
      }
    } catch (e) {
      console.warn(`Scene deletion warning: ${e.message}`);
    }

    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown", current_step: 5
      });
    } catch (_) {}

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PASS 1: STORY ANALYSIS (truncate script for analysis to save tokens)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    // For very long scripts, only send first ~3000 words + last ~1000 words for analysis
    let analysisScript = finalScript;
    if (wordCount > 4000) {
      const words = finalScript.split(/\s+/);
      const first3000 = words.slice(0, 3000).join(' ');
      const last1000 = words.slice(-1000).join(' ');
      analysisScript = `${first3000}\n\n[... middle section omitted for analysis — ${wordCount - 4000} words ...]\n\n${last1000}`;
      console.log(`📝 Truncated script for analysis: ${wordCount} → ~4000 words (first 3000 + last 1000)`);
    }

    const analysisPrompt = `You are a world-class film director. Study this script and understand its soul.

**FULL SCRIPT:**
${analysisScript}

**NICHE:** ${niche} | **TOPIC:** ${project.name} | **RUNTIME:** ~${estimatedSeconds}s | **CLIPS:** ${maxClips}

Respond with JSON:
{
  "story_analysis": {
    "central_theme": "The deeper human truth (NOT the topic)",
    "narrative_arc_summary": "2-3 sentence emotional journey",
    "emotional_trajectory": ["curiosity", "concern", "empathy", "hope"],
    "key_turning_points": ["Emotional shift 1", "Stakes escalation", "Climax"],
    "visual_world": "SPECIFIC sensory description",
    "recurring_visual_motifs": ["Motif 1", "Motif 2", "Motif 3"],
    "color_arc": "How palette shifts across the video",
    "characters": [
      {
        "name": "Character name/archetype",
        "visual_description": "EXACT: age, gender, ethnicity, build, hair, clothing",
        "emotional_arc": "How they change"
      }
    ]
  }
}

NICHE (${niche}): ${nicheProfile.visual_world} | Palette: ${nicheProfile.emotional_palette} | AVOID: ${nicheProfile.avoid}`;

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

    const characters = storyAnalysis.characters || [];

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PASS 2: VISUAL DIRECTION — PARALLEL BATCHES + INCREMENTAL SAVE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Process VISUAL_BATCH beats at a time, run PARALLEL_VISUAL_BATCHES
    // Gemini calls concurrently. Save scenes to DB after each wave.
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const visualsMap = {};
    const totalVisualBatches = Math.ceil(maxClips / VISUAL_BATCH);
    let batchesDone = 0;
    let totalCreated = 0;
    let totalWithVisuals = 0;

    // Build all batch ranges
    const batchRanges = [];
    for (let bStart = 0; bStart < maxClips; bStart += VISUAL_BATCH) {
      batchRanges.push({ start: bStart, end: Math.min(bStart + VISUAL_BATCH, maxClips) });
    }

    // Process in waves of PARALLEL_VISUAL_BATCHES
    for (let wave = 0; wave < batchRanges.length; wave += PARALLEL_VISUAL_BATCHES) {
      const waveBatches = batchRanges.slice(wave, wave + PARALLEL_VISUAL_BATCHES);

      console.log(`🎬 Wave ${Math.floor(wave / PARALLEL_VISUAL_BATCHES) + 1}: Visuals for ${waveBatches.map(b => `${b.start + 1}-${b.end}`).join(', ')} (${waveBatches.length} parallel)...`);

      // Run visual calls in parallel
      const waveResults = await Promise.allSettled(
        waveBatches.map(b =>
          fetchVisualsForBatch(b.start, b.end, narrationBeats, maxClips, estimatedSeconds, storyAnalysis, nicheProfile, niche, characters)
        )
      );

      // Merge results
      for (const result of waveResults) {
        if (result.status === 'fulfilled') {
          Object.assign(visualsMap, result.value);
        } else {
          console.warn(`⚠️ Visual batch failed: ${result.reason?.message}`);
        }
      }

      // SAVE scenes for this wave IMMEDIATELY to DB
      for (const batch of waveBatches) {
        const saveResults = await saveBatchScenes(
          base44, project_id, narrationBeats, visualsMap,
          batch.start, batch.end, maxClips, nicheProfile
        );

        const created = saveResults.filter(r => r.ok).length;
        const withVis = saveResults.filter(r => r.ok && r.visual).length;
        totalCreated += created;
        totalWithVisuals += withVis;
        batchesDone += 1;

        console.log(`💾 Saved scenes ${batch.start + 1}-${batch.end}: ${created} created (${withVis} with visuals) | Total: ${totalCreated}/${maxClips}`);
      }

      // Small delay between waves to avoid rate limits
      if (wave + PARALLEL_VISUAL_BATCHES < batchRanges.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`📊 Visual coverage: ${Object.keys(visualsMap).length}/${maxClips} beats have LLM visuals`);

    // ── Save blueprint ──────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        scene_blueprint: JSON.stringify({
          story_analysis: storyAnalysis,
          clip_budget: {
            estimated_seconds: estimatedSeconds,
            max_clips: maxClips,
            clip_duration: CLIP_DURATION,
            source: budget.source,
            strategy: 'deterministic_split',
            scenes_created: totalCreated,
            with_llm_visuals: totalWithVisuals,
            with_defaults: totalCreated - totalWithVisuals
          }
        })
      });
    } catch (_) { console.warn('scene_blueprint field may not exist — OK'); }

    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "breakdown_complete", current_step: 5
      });
    } catch (_) {}

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 BREAKDOWN COMPLETE — DETERMINISTIC`);
    console.log(`📊 ${totalCreated}/${maxClips} scenes created`);
    console.log(`🎨 ${totalWithVisuals} with LLM visuals · ${totalCreated - totalWithVisuals} with defaults`);
    console.log(`⏱️ ${estimatedSeconds}s runtime · ${CLIP_DURATION}s per clip`);
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
        source: budget.source,
        strategy: 'deterministic_split'
      },
      scenes_created: totalCreated,
      total_target: maxClips,
      with_llm_visuals: totalWithVisuals,
      with_defaults: totalCreated - totalWithVisuals
    });

  } catch (error) {
    console.error("❌ generateSceneBreakdown error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});