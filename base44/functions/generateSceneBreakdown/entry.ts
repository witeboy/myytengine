import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

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
    '3d_whiteboard_cartoon', 'low_poly_3d_cartoon', 'skeleton_protagonist',
    'afro_nolly_global'
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
RULES: Show FULL BODY in most scenes. Environment FIRST, then character. Character must be DOING something. Include other photorealistic humans in most scenes. Every scene has a CONTINUITY ELEMENT bridging to the next. Use varied camera angles. Blurred backgrounds BANNED.`,
    afro_nolly_global: `
**🌍 MANDATORY — AFRO-NOLLY-GLOBAL STYLE:**
This is a 3D Pixar/Illumination-quality CGI style set in African environments — Nollywood drama meets Disney animation.
TWO SUB-MODES (pick based on story context):
- MODERN URBAN: Colorful West African compound courtyards with mustard/terracotta/blue/green buildings, red laterite dirt ground, corrugated roofs, hand-painted signs with proverbs, hanging laundry, louvered windows. Saturated punchy colors. Bright high-key lighting.
- TRADITIONAL VILLAGE: Thatched-roof huts, central village clearing, large shade trees, campfires, cooking pots, wooden stools. Golden hour cinematic grading. Warm earth tones.
CHARACTER ARCHETYPES: Use recurring cast system — heavyset authority woman (gold lace, ankara wrapper, headwrap, gold earrings, wooden stick), beautiful tall slim young woman (modern fusion clothing, long flowing hair, defiant stance), large police officer (light blue uniform, cap, baton), community crowd (6-15 mixed-age bystanders with shocked/amused expressions), village elder (white beard, agbada, walking stick, kufi cap), child protagonist (large Disney eyes, cornrow braids, traditional cloth, beaded jewelry).
SKIN TONES: Always warm undertone. Range: #4A2E1A dark to #A07850 warm brown. NEVER grey, NEVER ashy.
COMPOSITION: 3-layer depth staging (foreground characters, mid-ground action, background crowd). Below-eye-level camera for dramatic feel. Slight wide-angle distortion.
SIGNS: Include hand-painted signs on buildings that foreshadow the story's moral (proverbs, rules, location names). Black text on white/cream, all caps, slightly uneven hand-lettered look.
RENDERING: Subsurface scattering on skin, soft ambient occlusion, individually rendered hair strands (braids, afros, headwraps show fiber detail), realistic cloth folds and weight.
RULES: Always 3D Pixar-quality CGI. Faces ALWAYS well-lit and readable. Include community bystanders in most scenes. Use dramatic confrontational staging. Show FULL BODY characters in environment.`
  };
  return directives[visualStyle] || '';
}

// ══════════════════════════════════════════════════════════════════
// DURATION-AWARE BEAT CALCULATOR
// ══════════════════════════════════════════════════════════════════

function calculateBeatDurations(phases, durationMinutes, isSleep = false) {
  if (isSleep) {
    return calculateSleepBeatDurations(phases, durationMinutes);
  }

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

// ══════════════════════════════════════════════════════════════════
// SLEEP-SPECIFIC BEAT CALCULATOR — slow, gentle, progressively longer
// ══════════════════════════════════════════════════════════════════

function calculateSleepBeatDurations(phases, durationMinutes) {
  // Sleep scenes are much longer — viewers should see slow, calming visuals
  // Each scene: 15-40 seconds, getting progressively longer toward the end
  const sleepPacing = {
    cold_open: { base: 15, variance: 3 },       // Opening: 12-18s per scene
    rising_tension: { base: 20, variance: 5 },   // Body settling: 15-25s
    emotional_core: { base: 25, variance: 8 },   // Deep relaxation: 17-33s
    resolution: { base: 35, variance: 10 }       // Near-sleep: 25-45s (longest holds)
  };

  const durations = [];

  for (const phase of phases) {
    const p = sleepPacing[phase.name] || { base: 22, variance: 5 };
    for (let i = 0; i < phase.scenes; i++) {
      // Progressive deepening within each phase too
      const ratio = phase.scenes > 1 ? i / (phase.scenes - 1) : 0.5;
      const d = Math.round((p.base + (ratio - 0.3) * p.variance) * 10) / 10;
      durations.push(Math.max(12, d));
    }
  }

  // Scale to match target duration
  const totalCurrent = durations.reduce((a, b) => a + b, 0);
  const totalTarget = durationMinutes * 60;
  const scaleFactor = totalTarget / totalCurrent;

  return durations.map(d => Math.round(d * scaleFactor * 10) / 10);
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
      visual_world: "Real everyday financial moments — kitchen tables with bills, phone screens with banking apps, office desks, coffee shop laptop sessions, apartment living rooms",
      signature_shots: "Character at their desk/table working on finances, hands on keyboard, looking at phone, walking through their neighborhood, at the bank, in their car",
      metaphor_language: "Show the ACTUAL situation — the real moments of earning, saving, spending, planning. Ground every scene in the character's daily financial life.",
      emotional_palette: "Cool institutional blues/grays shifting to warm ambers/golds"
    },
    retirement: {
      visual_world: "Real retirement life — family homes, nature walks, financial planning sessions, grandchildren visits, community activities",
      signature_shots: "Character reviewing their retirement plan, at home with family, walking through their neighborhood, at a financial advisor's office",
      metaphor_language: "Show the actual life moments — planning, saving, enjoying the results of preparation.",
      emotional_palette: "Warm amber/honey tones, soft golden hour light, earth tones"
    },
    motivation: {
      visual_world: "Real training and self-improvement moments — gyms, early morning routines, study sessions, work environments, personal projects",
      signature_shots: "Character waking up early, at the gym, studying, working on their craft, overcoming a specific obstacle",
      metaphor_language: "Show the real work — the alarm clock, the repetitions, the late nights, the breakthroughs.",
      emotional_palette: "Dark blues/blacks building to fiery oranges and triumphant golds"
    },
    horror: {
      visual_world: "Liminal spaces, barely-lit corridors, familiar places made wrong, isolated locations",
      signature_shots: "Dutch angles, long corridors, POV approaches, static wide shots with something wrong",
      metaphor_language: "Show the actual events of the horror narrative as they unfold.",
      emotional_palette: "Sickly greens, desaturated blues, deep blacks, crimson accents"
    },
    technology: {
      visual_world: "Real tech environments — offices, labs, maker spaces, home setups, coffee shops with laptops, server rooms",
      signature_shots: "Character using the technology, building something, debugging, presenting, collaborating with teammates",
      metaphor_language: "Show the actual tech work and its real-world impact on people's lives.",
      emotional_palette: "Electric blues/whites, warm ambers for human moments, neon for innovation"
    },
    health: {
      visual_world: "Real health journeys — kitchens cooking meals, gyms, doctor visits, grocery shopping, morning routines, outdoor exercise",
      signature_shots: "Character preparing healthy food, exercising, at the doctor, reading nutrition labels, meditating",
      metaphor_language: "Show the real daily health decisions and their tangible effects.",
      emotional_palette: "Fresh greens, clean whites, sunrise golds, cool blues"
    },
    crime: {
      visual_world: "Real crime investigation environments — police stations, crime scenes, courtrooms, neighborhoods, detective offices",
      signature_shots: "Investigators working the case, evidence being examined, witnesses being interviewed, the crime as it unfolds",
      metaphor_language: "Show the actual events, investigations, and consequences as the story narrates them.",
      emotional_palette: "Noir blues/blacks, sodium oranges, forensic whites, blood red accents"
    },
    history: {
      visual_world: "Period-accurate historical settings — the actual locations, buildings, landscapes, and daily life of the era",
      signature_shots: "Historical figures in their real environments, key events as they happened, period-accurate details",
      metaphor_language: "Show the actual historical events and settings as the narrative describes them.",
      emotional_palette: "Sepia warmth, stone grays, jewel tones for power, golden glory light"
    },
    education: {
      visual_world: "Real learning environments — classrooms, libraries, labs, home study spaces, workshops, online learning setups",
      signature_shots: "Character learning, practicing, having breakthroughs, applying knowledge in real situations",
      metaphor_language: "Show the real process of learning and applying knowledge in concrete situations.",
      emotional_palette: "Bright clear colors, warm yellows for aha-moments, cool blues for contemplation"
    },
    travel: {
      visual_world: "Real travel moments — airports, local streets, markets, restaurants, landmarks, transportation, accommodations",
      signature_shots: "Character navigating new places, experiencing local culture, at landmarks, trying food, meeting locals",
      metaphor_language: "Show the actual travel experiences and cultural encounters as they happen.",
      emotional_palette: "Rich saturated palettes, golden light, azure skies, warm market tones"
    },
    relationship: {
      visual_world: "Real relationship moments — shared meals, conversations, arguments, reconciliations, daily life together",
      signature_shots: "Characters interacting in their real shared spaces — kitchen, living room, car, restaurant, walking together",
      metaphor_language: "Show the actual relationship dynamics — the conversations, the silences, the gestures, the daily reality.",
      emotional_palette: "Warm amber for connection, cool blues for distance, soft rose for intimacy"
    }
  };

  return profiles[niche?.toLowerCase()] || {
    visual_world: "Real-world environments appropriate to the story — the actual places where the narrative events happen",
    signature_shots: "Character in their real environment performing actions relevant to the plot",
    metaphor_language: "Show the actual events, situations, and consequences as the story describes them. No abstract metaphors.",
    emotional_palette: "Cooler for tension, warmer for resolution, high contrast for conflict"
  };
}

// ══════════════════════════════════════════════════════════════════
// GENRE-ADAPTIVE PHASE STRUCTURES
// Each genre/mode gets its own dramatic shape.
// Comedy peaks at the punchline. Horror needs a NORMAL phase first.
// Romance needs an ALMOST moment. One size does NOT fit all.
// ══════════════════════════════════════════════════════════════════

function getGenrePhaseStructure(projectMode, storyArch) {
  // Determine the effective genre key
  const arch = storyArch || '';

  const PHASE_MAPS = {

    // ── STANDARD / DOCUMENTARY ──────────────────────────────────
    standard: [
      { name: 'cold_open',       weight: 0.10, purpose: 'Hook — visceral, immediate, impossible to ignore. Drop the viewer into the most gripping moment.' },
      { name: 'rising_tension',  weight: 0.25, purpose: 'Build the world and the problem — escalate stakes, layer complexity.' },
      { name: 'emotional_core',  weight: 0.40, purpose: 'Heart of the story — maximum emotional impact, reveal hidden truth.' },
      { name: 'resolution',      weight: 0.25, purpose: 'Deliver the payoff — transformation, consequence, new understanding.' },
    ],

    // ── EXPLAINER VIDEOS ────────────────────────────────────────
    explainer: [
      { name: 'hook',            weight: 0.12, purpose: 'The WTF moment — show the thing that breaks the viewer\'s assumption before any explanation.' },
      { name: 'the_problem',     weight: 0.20, purpose: 'Establish what is broken, confusing, or costly for the viewer right now — make it personal.' },
      { name: 'the_mechanism',   weight: 0.38, purpose: 'Show how it actually works — step by step, concrete, specific, no jargon without analogy.' },
      { name: 'application',     weight: 0.20, purpose: 'Show the viewer doing it — the before/after, the action, the result.' },
      { name: 'cta',             weight: 0.10, purpose: 'Confident, specific, single action the viewer should take right now.' },
    ],

    // ── COMEDY ─────────────────────────────────────────────────
    story_comedy: [
      { name: 'normal_world',    weight: 0.15, purpose: 'Establish the character\'s normal, slightly absurd world. Make the audience like them.' },
      { name: 'inciting_chaos',  weight: 0.20, purpose: 'Something goes wrong in the most inconvenient way possible. Escalation begins.' },
      { name: 'worse_and_worse', weight: 0.35, purpose: 'Each attempt to fix things makes everything funnier and more disastrous. Build the pattern.' },
      { name: 'punchline',       weight: 0.20, purpose: 'The pattern breaks in the most unexpected, perfectly timed way. This is the beat that lands.' },
      { name: 'callback',        weight: 0.10, purpose: 'The warm landing — a callback to the setup that rewards the audience for watching.' },
    ],

    // ── CHILDREN\'S STORY ────────────────────────────────────────
    story_children: [
      { name: 'meet_the_hero',   weight: 0.18, purpose: 'Introduce the child hero in their world — warm, specific, immediately lovable.' },
      { name: 'the_problem',     weight: 0.17, purpose: 'A clear, concrete problem appears. Something the hero wants but cannot have.' },
      { name: 'try_and_fail_1',  weight: 0.18, purpose: 'First attempt fails — show the hero trying hard but falling short.' },
      { name: 'try_and_fail_2',  weight: 0.18, purpose: 'Second attempt fails — things look hopeless. The lowest point.' },
      { name: 'breakthrough',    weight: 0.17, purpose: 'The hero finds a new approach — often from an unexpected source or inner quality.' },
      { name: 'happy_ending',    weight: 0.12, purpose: 'Warm, satisfying resolution. The lesson emerges naturally from events.' },
    ],

    // ── NURSERY RHYME ───────────────────────────────────────────
    story_nursery: [
      { name: 'intro_verse',     weight: 0.25, purpose: 'Set the scene with the first rhyming verse — bright, playful, establishes the rhythm.' },
      { name: 'middle_verses',   weight: 0.50, purpose: 'The body of the rhyme — each verse its own visual scene, rhythm consistent.' },
      { name: 'final_verse',     weight: 0.25, purpose: 'The satisfying ending verse — completes the rhyme, lands with warmth and a smile.' },
    ],

    // ── CRIME / MYSTERY ─────────────────────────────────────────
    story_crime: [
      { name: 'cold_open_crime', weight: 0.10, purpose: 'Drop into the crime or its immediate aftermath. No setup. Maximum tension from frame one.' },
      { name: 'investigation',   weight: 0.25, purpose: 'The investigator pieces it together — show the work, the evidence, the first red herring.' },
      { name: 'deeper_mystery',  weight: 0.30, purpose: 'A second layer appears — things are more complicated than they seemed. Stakes rise.' },
      { name: 'false_solution',  weight: 0.15, purpose: 'The wrong answer seems right. Build to a beat that feels like resolution — then undercut it.' },
      { name: 'revelation',      weight: 0.12, purpose: 'The truth. It must feel both surprising and inevitable. Everything clicks into place.' },
      { name: 'aftermath',       weight: 0.08, purpose: 'The weight of what happened — justice, or its absence. Leave a resonant image.' },
    ],

    // ── LOVE / ROMANCE ──────────────────────────────────────────
    story_love: [
      { name: 'first_encounter', weight: 0.12, purpose: 'The meeting — something specific makes them notice each other. Not a cliché.' },
      { name: 'growing_closer',  weight: 0.22, purpose: 'Small moments of connection — shared glances, accidental touches, the world narrowing.' },
      { name: 'the_obstacle',    weight: 0.22, purpose: 'Something real stands between them — internal or external. The distance grows.' },
      { name: 'almost_moment',   weight: 0.16, purpose: 'They almost break through — the moment that was so close. Most important beat in the film.' },
      { name: 'lowest_point',    weight: 0.12, purpose: 'It seems over. The distance feels permanent. The longing is at its peak.' },
      { name: 'breakthrough',    weight: 0.10, purpose: 'Someone chooses to be vulnerable. The emotional wall comes down.' },
      { name: 'resolution',      weight: 0.06, purpose: 'The earned landing — warmth, rightness, the future implied.' },
    ],

    // ── HORROR ──────────────────────────────────────────────────
    story_horror: [
      { name: 'normal_world',    weight: 0.15, purpose: 'The world exactly as it should be — establish what is precious before you threaten it.' },
      { name: 'wrongness_creeps', weight: 0.20, purpose: 'Something is slightly off. Small details that do not add up. Dread not yet named.' },
      { name: 'escalating_dread', weight: 0.30, purpose: 'The wrongness compounds — each scene more unsettling. Anticipation is the weapon.' },
      { name: 'confrontation',   weight: 0.20, purpose: 'The horror is faced directly. Maximum tension. The character at their limit.' },
      { name: 'aftermath',       weight: 0.15, purpose: 'What remains. Not relief — residual wrongness. One question unanswered.' },
    ],

    // ── THRILLER ────────────────────────────────────────────────
    story_thriller: [
      { name: 'inciting_crisis', weight: 0.12, purpose: 'Something is already wrong. Drop the viewer into the situation at maximum stakes.' },
      { name: 'pursuit_begins',  weight: 0.20, purpose: 'The clock starts. The protagonist is moving — against time, against an enemy, against themselves.' },
      { name: 'complications',   weight: 0.28, purpose: 'Every step forward creates a new problem. Alliances shift. Trust is broken.' },
      { name: 'reversal',        weight: 0.18, purpose: 'Everything the protagonist believed is wrong. The rug is pulled. Recalibration under fire.' },
      { name: 'climax',          weight: 0.14, purpose: 'All resources, all information, all emotion — spent in one moment.' },
      { name: 'resolution',      weight: 0.08, purpose: 'The cost of what just happened. Not fully clean. Not fully safe.' },
    ],

    // ── HISTORICAL FICTION ──────────────────────────────────────
    story_historical: [
      { name: 'world_anchoring', weight: 0.14, purpose: 'Root the viewer in the period — specific detail, not generic "old timey." The year, the place, the smell.' },
      { name: 'personal_stakes', weight: 0.20, purpose: 'Introduce the character\'s personal situation within the historical moment.' },
      { name: 'historical_pressure', weight: 0.30, purpose: 'The large forces of the era bear down on individual choices — war, law, power, poverty.' },
      { name: 'the_choice',      weight: 0.22, purpose: 'The pivotal decision that the period made both necessary and costly.' },
      { name: 'consequence',     weight: 0.14, purpose: 'What follows from the choice — and what it tells us about now.' },
    ],

    // ── SCI-FI ──────────────────────────────────────────────────
    story_scifi: [
      { name: 'world_rules',     weight: 0.15, purpose: 'Establish the world\'s rules visually before dialogue explains them.' },
      { name: 'character_desire', weight: 0.18, purpose: 'Show what the protagonist wants — specific, personal, not "save humanity."' },
      { name: 'system_conflict', weight: 0.32, purpose: 'The world\'s rules directly prevent the protagonist\'s desire. The heart of the story.' },
      { name: 'idea_escalation', weight: 0.22, purpose: 'The big idea unfolds — its implications grow more disturbing or wonderful.' },
      { name: 'revelation',      weight: 0.13, purpose: 'A new way of seeing — the viewer\'s worldview has been quietly dismantled and rebuilt.' },
    ],

    // ── ADVENTURE ───────────────────────────────────────────────
    story_adventure: [
      { name: 'the_call',        weight: 0.12, purpose: 'The stable world is disrupted — something requires the hero to leave the known.' },
      { name: 'crossing_threshold', weight: 0.15, purpose: 'The hero steps into the unknown — the world changes visually.' },
      { name: 'tests_and_allies', weight: 0.28, purpose: 'Obstacles, failures, companions found. The hero grows.' },
      { name: 'ordeal',          weight: 0.22, purpose: 'The greatest challenge — the hero must sacrifice or transform to survive.' },
      { name: 'road_back',       weight: 0.13, purpose: 'Returning changed — carrying the reward or the wound.' },
      { name: 'return',          weight: 0.10, purpose: 'The world they left — seen with new eyes. The transformation visible.' },
    ],

    // ── MYSTERY ─────────────────────────────────────────────────
    story_mystery: [
      { name: 'inciting_puzzle', weight: 0.12, purpose: 'The puzzle is posed — specific, concrete, seemingly unsolvable.' },
      { name: 'first_clues',     weight: 0.20, purpose: 'The detective gathers early evidence — establish the method of thinking.' },
      { name: 'red_herrings',    weight: 0.25, purpose: 'False leads that feel real — the viewer is deliberately misled.' },
      { name: 'narrowing',       weight: 0.20, purpose: 'The truth begins to emerge — one suspect remains credible.' },
      { name: 'revelation',      weight: 0.14, purpose: 'The solution — surprising but inevitable. "Of course."' },
      { name: 'resolution',      weight: 0.09, purpose: 'The aftermath — loose ends, the cost of knowing, what changed.' },
    ],

    // ── SLEEP STORY ─────────────────────────────────────────────
    sleep_story: [
      { name: 'arrival',         weight: 0.18, purpose: 'The character arrives in the peaceful world — ground them in a specific, sensory-rich setting.' },
      { name: 'gentle_exploration', weight: 0.25, purpose: 'They move through this world slowly — each discovery calmer than the last.' },
      { name: 'deepening_peace', weight: 0.30, purpose: 'The world grows quieter — sound, light, and movement all diminish.' },
      { name: 'near_rest',       weight: 0.27, purpose: 'The character settles. The world is still. Images longer, slower, emptier.' },
    ],

    // ── SLEEP MEDITATION ────────────────────────────────────────
    sleep_meditation: [
      { name: 'physical_settling', weight: 0.20, purpose: 'Body awareness — environments that evoke physical weight and warmth.' },
      { name: 'breath_and_calm',   weight: 0.25, purpose: 'Breathing imagery — slow water, candle flame, tide, mist.' },
      { name: 'affirmation_core',  weight: 0.30, purpose: 'The emotional heart — safe spaces, remembered warmth, belonging.' },
      { name: 'deep_rest',         weight: 0.25, purpose: 'Near-silence. Long static holds. The world going to sleep.' },
    ],
  };

  // Map project mode + story arch to a phase key
  let key = 'standard';
  if (projectMode === 'sleep_story')    key = 'sleep_story';
  else if (projectMode === 'sleep_meditation') key = 'sleep_meditation';
  else if (projectMode === 'explainer') key = 'explainer';
  else if (projectMode === 'story' && PHASE_MAPS[arch]) key = arch;
  else if (PHASE_MAPS[projectMode])     key = projectMode;

  return PHASE_MAPS[key] || PHASE_MAPS['standard'];
}

// ══════════════════════════════════════════════════════════════════
// GENRE CINEMATOGRAPHY PRESETS
// Used in BOTH scene breakdown (director notes) and
// scene prompt generation (image prompt language).
// Each genre gets: prompt_prefix, mandatory_lighting, color_grade,
// forbidden, reference_directors, emotional_tools.
// ══════════════════════════════════════════════════════════════════

function getGenreCinematographyPreset(projectMode, storyArch) {
  const arch = storyArch || '';

  const PRESETS = {

    standard: {
      prompt_prefix: 'Cinematic documentary scene',
      mandatory_lighting: 'motivated practical lighting, golden hour or high-contrast interior',
      color_grade: 'teal-orange blockbuster grade, high detail midtones',
      reference_directors: 'Roger Deakins, Emmanuel Lubezki',
      forbidden: 'flat lighting, studio backdrop, blurred backgrounds',
      emotional_tools: 'slow push-ins for revelation, wide shots for isolation, close-ups for humanity',
    },

    explainer: {
      prompt_prefix: 'Clean cinematic educational scene',
      mandatory_lighting: 'soft motivated key light, warm practical fill, clean shadows',
      color_grade: 'slightly desaturated warm palette, emphasis on clarity not drama',
      reference_directors: 'David Gelb food-documentary style, clean and bright',
      forbidden: 'heavy shadow, extreme angles, visual complexity that distracts from the concept',
      emotional_tools: 'medium close-ups during explanation, wide during demonstration, insert shots of the tool or object being explained',
    },

    story_comedy: {
      prompt_prefix: 'Wide, bright, populated comedic scene',
      mandatory_lighting: 'high-key warm lighting, no heavy shadows — comedy lives in visibility',
      color_grade: 'warm saturated tones, slightly elevated brightness, vibrant practical colors',
      reference_directors: 'Edgar Wright kinetic energy, Wes Anderson symmetry',
      forbidden: 'dark shadows, extreme close-ups, dutch angles, desaturation',
      emotional_tools: 'wide shots that show the full absurd situation, tight timing cuts, reaction close-ups after punchlines',
    },

    story_children: {
      prompt_prefix: 'Warm, bright, wonder-filled scene',
      mandatory_lighting: 'soft golden hour or bright daylight, no harsh shadows',
      color_grade: 'warm saturated primary colors, storybook palette',
      reference_directors: 'Pixar visual warmth, Studio Ghibli detail and wonder',
      forbidden: 'desaturation, dutch angles, extreme contrast, dark corners',
      emotional_tools: 'low-angle shots (child eye level), wide shots to show the big world, close-ups on expressive faces',
    },

    story_nursery: {
      prompt_prefix: 'Playful, colorful, storybook scene',
      mandatory_lighting: 'bright even lighting, saturated primary colors',
      color_grade: 'bold primary palette, clean and bright, illustration-like',
      reference_directors: 'classic illustrated storybook, Mary Blair Disney color design',
      forbidden: 'realism, muted colors, heavy shadows, adult-feeling environments',
      emotional_tools: 'symmetrical compositions, bold color blocks, simple clear silhouettes',
    },

    story_crime: {
      prompt_prefix: 'Noir cinematic crime scene',
      mandatory_lighting: 'low-key chiaroscuro, single hard source, deep shadow pools, sodium streetlight',
      color_grade: 'cold desaturated blue-black with amber accent, high contrast',
      reference_directors: 'David Fincher clinical precision, Roger Deakins Blade Runner 2049 shadow',
      forbidden: 'bright daylight, warm soft lighting, cheerful colors, shallow motivation',
      emotional_tools: 'dutch angles for psychological wrongness, extreme close-ups on evidence, wide cold shots for isolation and consequence',
    },

    story_love: {
      prompt_prefix: 'Intimate, warm, emotionally charged romantic scene',
      mandatory_lighting: 'golden hour backlight, soft window light, warm practical glow — always warm, always soft',
      color_grade: 'warm amber, rose gold, soft desaturated backgrounds to make subjects glow',
      reference_directors: 'Wong Kar-wai intimate framing, Barry Jenkins Moonlight warmth',
      forbidden: 'harsh lighting, cold blue tones, wide crowd shots, clinical environments',
      emotional_tools: 'OTS shots for tension, medium close-ups for intimacy, slow push-ins for vulnerability, soft focus backgrounds',
    },

    story_horror: {
      prompt_prefix: 'Deeply unsettling horror scene with wrong proportions',
      mandatory_lighting: 'extreme low-key, 80-90% shadow, single cold source or sickly green, NEVER overhead warm',
      color_grade: 'desaturated cold palette with wrong-hue accent (sickly green, bruise purple), deep blacks',
      reference_directors: 'Stanley Kubrick cold geometry, James Wan controlled dread, Robert Eggers texture',
      forbidden: 'warm lighting, bright environments, full faces clearly lit, cheerful colors, happy populated crowds',
      emotional_tools: 'dutch angles for psychological wrongness, long static shots letting the dread build, wide shots of wrong spaces, slow zooms into darkness',
    },

    story_thriller: {
      prompt_prefix: 'Tense, kinetic thriller scene under pressure',
      mandatory_lighting: 'motivated dramatic lighting, high contrast, urgency visible in the light',
      color_grade: 'cool clinical blue-gray with warm accent for human moments, high contrast',
      reference_directors: 'Christopher Nolan controlled tension, Denis Villeneuve precision',
      forbidden: 'soft casual lighting, warm golden glow, leisurely wide shots',
      emotional_tools: 'tight medium close-ups during pursuit, handheld urgency in action, static wide shots for entrapment feeling',
    },

    story_historical: {
      prompt_prefix: 'Period-accurate historical cinematic scene with authentic texture',
      mandatory_lighting: 'period-appropriate practical lighting — candles, torches, harsh daylight through small windows, no electric light',
      color_grade: 'desaturated warm period palette, aged texture, light through atmosphere',
      reference_directors: 'Ridley Scott historical texture, Barry Lyndon candlelight realism',
      forbidden: 'modern lighting quality, clean contemporary environments, anachronistic elements',
      emotional_tools: 'wide shots to show the period world, close-ups on period-specific objects and faces, slow deliberate pacing',
    },

    story_scifi: {
      prompt_prefix: 'Precise science fiction scene with lived-in world detail',
      mandatory_lighting: 'cold practical light sources — screens, LEDs, bioluminescence, harsh work lights',
      color_grade: 'cool blue-gray future palette or warm analog-future amber, always purposeful',
      reference_directors: 'Denis Villeneuve Blade Runner 2049 precision, Alex Garland Ex Machina sterility',
      forbidden: 'generic future aesthetics, lens flare everywhere, neon without motivation',
      emotional_tools: 'wide shots to establish the world\'s scale, close-ups on the human face against the inhuman, reflection and glass for duality',
    },

    story_mystery: {
      prompt_prefix: 'Atmospheric mystery scene with careful visual misdirection',
      mandatory_lighting: 'overcast day or low interior light, motivated shadows that could hide or reveal',
      color_grade: 'slightly desaturated, cool undertone, neutral that feels pregnant with potential',
      reference_directors: 'Tomas Alfredson Let the Right One In restraint, Coen Brothers precise composition',
      forbidden: 'revealing lighting that shows everything, warm cheerful palette, busy uncontrolled backgrounds',
      emotional_tools: 'OTS shots to create information asymmetry, inserts on clues, wide observation shots',
    },

    story_adventure: {
      prompt_prefix: 'Epic adventure scene with scale and movement',
      mandatory_lighting: 'strong directional light — golden sun, storm light, moonlight — always dramatic source',
      color_grade: 'wide dynamic range, deep skies, rich earth tones, saturated but grounded',
      reference_directors: 'Peter Jackson scale and intimacy, David Lean epic geography',
      forbidden: 'flat overcast lighting, interior corporate environments, small cramped spaces unless specifically claustrophobic',
      emotional_tools: 'wide establishing shots to show scale, low angle upshots for heroism, tracking shots for movement',
    },

    sleep_story: {
      prompt_prefix: 'Peaceful bedtime atmosphere, warm dim and still',
      mandatory_lighting: 'very dim warm candlelight or moonlight, 80% shadow, no bright areas',
      color_grade: 'deep amber, burnt sienna, midnight navy, muted and dim',
      reference_directors: 'Terrence Malick stillness, slow nature documentary calm',
      forbidden: 'bright daylight, vivid colors, busy environments, people in action',
      emotional_tools: 'long static holds, slow gentle pans, simple uncluttered compositions',
    },

    sleep_meditation: {
      prompt_prefix: 'Dark atmospheric pure environment for sleep meditation',
      mandatory_lighting: 'extremely dim, barely visible warm glow, deep shadow',
      color_grade: 'dark moody oil painting palette, Rembrandt shadow, warm amber only',
      reference_directors: 'pure atmosphere, painterly darkness',
      forbidden: 'any human figures, bright light, vivid colors, busy compositions',
      emotional_tools: 'almost static compositions, nature environments only, symbolic peaceful imagery',
    },
  };

  let key = 'standard';
  if (projectMode === 'sleep_story')         key = 'sleep_story';
  else if (projectMode === 'sleep_meditation') key = 'sleep_meditation';
  else if (projectMode === 'explainer')       key = 'explainer';
  else if (projectMode === 'story' && PRESETS[arch]) key = arch;
  else if (PRESETS[projectMode])              key = projectMode;

  return PRESETS[key] || PRESETS['standard'];
}

// ══════════════════════════════════════════════════════════════════
// EMOTIONAL BEAT LIBRARY
// Maps narrative position (0-100) + phase to viewer emotion.
// Used to give each scene a target emotional state for the viewer.
// ══════════════════════════════════════════════════════════════════

function getEmotionalBeat(phaseName, sceneIndexInPhase, totalScenesInPhase, narrativePositionPct) {
  // Base emotion from phase name
  const PHASE_EMOTIONS = {
    cold_open:          ['intrigue', 'shock', 'curiosity'],
    inciting_crisis:    ['alarm', 'tension', 'disorientation'],
    normal_world:       ['warmth', 'familiarity', 'calm'],
    rising_tension:     ['unease', 'concern', 'building dread'],
    emotional_core:     ['empathy', 'investment', 'urgency'],
    resolution:         ['satisfaction', 'reflection', 'peace'],
    investigation:      ['curiosity', 'tension', 'focus'],
    deeper_mystery:     ['confusion', 'unease', 'doubt'],
    false_solution:     ['false relief', 'dawning wrongness'],
    revelation:         ['shock', 'clarity', 'catharsis'],
    aftermath:          ['weight', 'melancholy', 'acceptance'],
    wrongness_creeps:   ['unease', 'subtle dread', 'wrongness'],
    escalating_dread:   ['fear', 'dread', 'anticipation of horror'],
    confrontation:      ['terror', 'adrenaline', 'extreme tension'],
    first_encounter:    ['curiosity', 'attraction', 'hope'],
    growing_closer:     ['warmth', 'longing', 'intimacy'],
    the_obstacle:       ['heartache', 'frustration', 'distance'],
    almost_moment:      ['yearning', 'suspended breath', 'vulnerability'],
    lowest_point:       ['sadness', 'loss', 'resignation'],
    breakthrough:       ['relief', 'joy', 'emotional release'],
    hook:               ['surprise', 'curiosity', 'engagement'],
    the_problem:        ['recognition', 'frustration', 'relatability'],
    the_mechanism:      ['understanding', 'clarity', 'aha moment'],
    application:        ['empowerment', 'confidence', 'motivation'],
    cta:                ['decisiveness', 'readiness', 'action'],
    inciting_chaos:     ['amusement', 'sympathy', 'anticipation'],
    worse_and_worse:    ['escalating amusement', 'delighted tension'],
    punchline:          ['release', 'laughter', 'joy'],
    callback:           ['warmth', 'recognition', 'satisfaction'],
    arrival:            ['calm', 'peace', 'settling'],
    gentle_exploration: ['gentle curiosity', 'slow delight'],
    deepening_peace:    ['heaviness', 'drowsiness', 'letting go'],
    near_rest:          ['near-sleep', 'stillness', 'dissolution'],
    physical_settling:  ['heaviness', 'warmth', 'bodily peace'],
    breath_and_calm:    ['slowing', 'rhythm', 'surrender'],
    affirmation_core:   ['safety', 'acceptance', 'belonging'],
    deep_rest:          ['dissolution', 'silence', 'sleep'],
  };

  const emotions = PHASE_EMOTIONS[phaseName] || ['engagement', 'investment'];
  // Progress through the emotions within the phase
  const ratio = totalScenesInPhase > 1 ? sceneIndexInPhase / (totalScenesInPhase - 1) : 0.5;
  const emotionIndex = Math.min(Math.floor(ratio * emotions.length), emotions.length - 1);
  const primaryEmotion = emotions[emotionIndex];

  // Emotional intensity follows a curve: builds through middle, peaks near climax
  let intensity;
  if (narrativePositionPct < 15) intensity = 0.3 + (narrativePositionPct / 15) * 0.2;
  else if (narrativePositionPct < 70) intensity = 0.5 + ((narrativePositionPct - 15) / 55) * 0.4;
  else if (narrativePositionPct < 85) intensity = 0.9 + ((narrativePositionPct - 70) / 15) * 0.1;
  else intensity = 1.0 - ((narrativePositionPct - 85) / 15) * 0.3;

  return {
    viewer_emotion: primaryEmotion,
    emotional_intensity: Math.round(Math.min(1.0, Math.max(0.1, intensity)) * 100) / 100,
  };
}

// ══════════════════════════════════════════════════════════════════
// NARRATIVE POSITION HELPER
// Returns position 0-100 for any scene in the film.
// ══════════════════════════════════════════════════════════════════

function getNarrativePosition(sceneNumber, totalScenes) {
  if (totalScenes <= 1) return 50;
  return Math.round(((sceneNumber - 1) / (totalScenes - 1)) * 100);
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
  beatDurationsSlice, nicheProfile,
  cinemaPreset, sceneStartGlobal, totalScenes
}) {
  const durLine = beatDurationsSlice.length > 0
    ? `\n**DURATION TARGETS (seconds per scene):** [${beatDurationsSlice.map(d => d.toFixed(1)).join(', ')}]`
    : '';

  // Build emotional beat targets for each scene in this batch
  const narrativeStart = getNarrativePosition(sceneStartGlobal || sceneStart, totalScenes || sceneStart + sceneCount);
  const narrativeEnd   = getNarrativePosition((sceneStartGlobal || sceneStart) + sceneCount - 1, totalScenes || sceneStart + sceneCount);
  const emotionalBeats = [];
  for (let i = 0; i < sceneCount; i++) {
    const posPct = sceneCount > 1
      ? narrativeStart + (i / (sceneCount - 1)) * (narrativeEnd - narrativeStart)
      : (narrativeStart + narrativeEnd) / 2;
    emotionalBeats.push(getEmotionalBeat(phaseName, i, sceneCount, posPct));
  }
  const beatTable = emotionalBeats.map((b, i) =>
    `Scene ${sceneStart + i}: viewer feels "${b.viewer_emotion}" | intensity ${b.emotional_intensity}`
  ).join('\n');

  // Visual motifs from story analysis
  const motifs = storyAnalysis.recurring_visual_motifs || [];
  const motifLine = motifs.length > 0
    ? `\n**RECURRING VISUAL MOTIFS (plant at least one per phase):** ${motifs.join(', ')}`
    : '';

  // Genre cinema preset
  const preset = cinemaPreset || {};
  const cinemaBlock = preset.prompt_prefix ? `
**GENRE CINEMATOGRAPHY MANDATE (${preset.reference_directors}):**
- Visual identity: ${preset.prompt_prefix}
- Lighting law: ${preset.mandatory_lighting}
- Color grade: ${preset.color_grade}
- Emotional tools: ${preset.emotional_tools}
- FORBIDDEN: ${preset.forbidden}
Every scene must feel like it belongs to this specific visual world. No generic cinema.` : '';

  // Narrative position label
  const positionLabel = narrativeStart < 15 ? 'OPENING — establish the world, set the hook'
    : narrativeStart < 40 ? 'BUILDING — escalate stakes, deepen complexity'
    : narrativeStart < 70 ? 'CORE — maximum emotional and narrative intensity'
    : narrativeStart < 85 ? 'CLIMAX — everything at stake, peak tension'
    : 'RESOLUTION — the earned landing, resonant and complete';

  return `You are a world-class film director — the visual intelligence behind a cinematic narrative. Your job is not to illustrate the script. Your job is to make the viewer FEEL something specific at every single moment.
${styleDirective}
${cinemaBlock}

**STORY ANALYSIS:**
- Central Theme: ${storyAnalysis.central_theme}
- Narrative Arc: ${storyAnalysis.narrative_arc_summary}
- Emotional Trajectory: ${JSON.stringify(storyAnalysis.emotional_trajectory)}
- Visual World: ${storyAnalysis.visual_world}
- Color Arc: ${storyAnalysis.color_arc}${motifLine}

${characterBlock}

${continuityContext}

**NARRATIVE POSITION: ${positionLabel}**
Scene ${sceneStartGlobal || sceneStart} of ${totalScenes || '?'} — approximately ${Math.round(narrativeStart)}% through the film.
This position determines everything: shot intimacy, light intensity, emotional register, pacing.

**CURRENT PHASE: ${phaseName.toUpperCase().replace(/_/g, ' ')}**
Dramatic purpose: ${phasePurpose}
Scenes to create: ${sceneCount} (numbers ${sceneStart} through ${sceneStart + sceneCount - 1})
${durLine}

**EMOTIONAL BEAT TARGETS — the viewer must feel THIS at each scene:**
${beatTable}

These are not suggestions. Every choice — shot size, lighting angle, color temperature, camera movement — exists to deliver the target emotion at the target intensity. Before each scene ask: "Will this make the viewer feel [emotion] at [intensity]?"

**SCRIPT SEGMENT:**
${scriptText}

**DIRECTOR'S LAWS:**
1. PLOT-DRIVEN SCENES: Show what is HAPPENING in the story at this exact moment — the real situation, action, or consequence. Never a symbolic substitute. Ask: "What is the character actually doing right now in this narrative?"
2. EMOTIONAL DELIVERY FIRST: Every technical choice serves the emotional beat target. A scene targeting "dread at 0.8" gets deep shadow, low angle, slow push-in. A scene targeting "joy at 0.7" gets wide shot, warm light, populated world.
3. NARRATIVE POSITION: Opening (0-15%) — wider, cooler, establishing. Building (15-40%) — medium, warming. Core (40-70%) — tighter, peak contrast. Climax (70-85%) — closest, hottest or darkest. Resolution (85-100%) — wide again, settled.
4. visual_concept: 2-4 sentences. Environment FIRST (sets the world), character ACTION second (anchors the story beat), atmosphere third (locks the emotion). Every word earns its place.
5. SHOT DISTRIBUTION: Minimum 50% wide/wider (WS, EWS, MWS, HIGH ANGLE, ESTABLISHING). Mix MS, LOW, OTS, MCU, CU. Never same shot type twice in a row. Close-ups maximum 15% of total.
6. NAMED PROPS: Use specific objects from the narration — "clutching her iPhone", "staring at the overdue bill". Never describe what is ON a screen or paper — no text, UI, numbers, app names.
7. NO ABSTRACT METAPHORS: Every visual is a plausible real-world scene from the character's actual life. Never floating symbols, surreal imagery, or impossible visuals.
8. MOTIF WEAVING: Plant the recurring visual motifs naturally. Not forced, not every scene — but consistently enough that they become the film's visual heartbeat.
9. SCENE CONTINUITY: Each scene shares at least one visual element with the next — a color shift, matched geometry, motion direction, environmental bridge, or light quality continuation. The continuity_bridge must be specific and actionable, not generic.
10. POPULATED WORLD: Most scenes include other people. The world breathes.
11. IMMERSION: Every scene needs at least 2 of: (a) foreground element, (b) sensory texture, (c) character micro-action, (d) background storytelling detail, (e) specific time-of-day light, (f) scale contrast.
12. TONE SAFETY: No imagery readable as violence, self-harm, or danger in non-horror/thriller content.

**RESPONSE FORMAT:**
{
  "scenes": [
    {
      "scene_number": ${sceneStart},
      "narration_text": "EXACT words from script only — never paraphrase.",
      "visual_concept": "2-4 sentences. Environment first, character action second, atmosphere third.",
      "viewer_emotion": "The target emotion from the beat table above.",
      "emotional_intensity": 0.7,
      "shot_type": "e.g. WS — Wide Shot",
      "camera_angle": "e.g. Low angle, 15 degrees",
      "camera_movement": "e.g. Slow push-in over 5 seconds",
      "lighting": "e.g. Single hard side light, 80 percent shadow, cold blue",
      "color_palette": "e.g. Deep navy #1A2744, amber accent #D4A574",
      "mood": "2-3 words",
      "depth_of_field": "e.g. Shallow f/1.4, subject sharp, world soft",
      "continuity_bridge": "Specific visual element linking this scene to the next.",
      "duration_seconds": 5,
      "characters_present": ["Name1"]
    }
  ]
}

CHARACTER PRESENCE: List only characters who physically appear on screen. Pure environment scenes use []. Use exact names from the CHARACTER block above — the image generator uses this field to inject character DNA.

GENERATE EXACTLY ${sceneCount} SCENES. NARRATION TEXT FROM SCRIPT WORDS ONLY.`;
}



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

    // Detect if this is a sleep project
    const isSleep = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';

    // ═══ DURATION-AWARE SCENE DENSITY ═══
    const densityAnchors = isSleep
      ? [
          // Sleep: much fewer scenes, longer holds (15-35s avg per scene)
          {m:5,d:15},{m:10,d:20},{m:15,d:22},{m:20,d:25},{m:30,d:28},{m:60,d:32}
        ]
      : [
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
      return isSleep ? 22 : 5.5;
    }
    const avgSceneDuration = getAvgSceneDuration(durationMinutes);
    const totalTargetScenes = Math.max(isSleep ? 4 : 8, Math.round((durationMinutes * 60) / avgSceneDuration));

    // Genre-aware phase structure — comedy, horror, romance all get different dramatic shapes
    const projectMode = project.project_mode || '';
    const storyArch   = project.shorts_niche  || '';
    const genrePhases = getGenrePhaseStructure(projectMode, storyArch);
    const cinemaPreset = getGenreCinematographyPreset(projectMode, storyArch);

    // Convert genre phase weights to scene counts
    const phases = genrePhases.map((phase, index) => {
      if (index === genrePhases.length - 1) {
        const usedSoFar = genrePhases.slice(0, index).reduce((sum, p) => {
          return sum + Math.max(1, Math.round(totalTargetScenes * p.weight));
        }, 0);
        return { ...phase, scenes: Math.max(1, totalTargetScenes - usedSoFar) };
      }
      return { ...phase, scenes: Math.max(1, Math.round(totalTargetScenes * phase.weight)) };
    });

    const scriptChunks = splitScriptByPhase(finalScript, phases);

    console.log(`🎭 Genre: ${projectMode || 'standard'}/${storyArch || 'none'} → ${phases.length} phases: ${phases.map(p => p.name + '(' + p.scenes + ')').join(', ')}`);
    console.log(`🎬 Cinema preset: ${cinemaPreset.reference_directors}`);
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
    "plot_summary": "What ACTUALLY HAPPENS in this story from start to finish — the concrete sequence of events, situations, and outcomes. This is the backbone that every scene must connect to.",
    "central_theme": "The deeper human truth (NOT the topic)",
    "narrative_arc_summary": "2-3 sentence emotional journey",
    "emotional_trajectory": ["curiosity","concern","empathy","hope"],
    "key_turning_points": ["Moment 1","Moment 2","Moment 3"],
    "visual_world": "Specific sensory description of this story's visual universe",
    "recurring_visual_motifs": ["Motif 1","Motif 2","Motif 3"],
    "color_arc": "e.g. cool blues → warm amber → vibrant gold",
    "characters": [{
      "name": "Name/archetype",
      "identity_core": "Casting-sheet: exact age, SPECIFIC gender (must be 'male' or 'female' — NEVER 'neutral' or 'any'), skin tone shade, face shape, eye color+shape, nose, lips, hair (color/length/style), build+height, 2-3 distinguishing marks. Must be specific enough for 20 artists to draw the SAME person. GENDER RULE: Analyze the story context, niche, and cultural norms to pick the gender that BEST FITS the narrative. Finance/corporate stories may suit male or female depending on the arc. Parenting stories should match the parent described. Crime/history should match the real subjects. If truly ambiguous, pick the gender that creates the most compelling visual contrast with the story's conflict. NEVER default to female automatically.",
      "default_clothing": "Typical outfit (can change per scene)",
      "emotional_arc": "How they change emotionally"
    }]
  }
}

NICHE SENSIBILITY: ${nicheProfile.visual_world} | ${nicheProfile.emotional_palette}

**PLOT SUMMARY (use this to ground EVERY scene in the story):**
Analyze the script above and identify: WHO is the main character? WHAT is their situation? WHAT journey do they go through? Every scene must show a moment from THIS character's journey — not a disconnected visual metaphor.`;

      console.log(`🎬 Story analysis...`);
      const analysis = await callGemini(analysisPrompt, 0.6);
      storyAnalysis = analysis.story_analysis || analysis;

      // ── Beat durations ──
      beatDurations = calculateBeatDurations(phases, durationMinutes, isSleep);
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
          nicheProfile,
          cinemaPreset,
          sceneStartGlobal: sub.offset + 1,
          totalScenes: totalTargetScenes
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
                nicheProfile,
                cinemaPreset,
                sceneStartGlobal: sub.offset + 1,
                totalScenes: totalTargetScenes
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
            phase: currentChunk.phase,
            characters_present: scene.characters_present || []
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