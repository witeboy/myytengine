import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v6 — Gemini 2.5 Pro primary, Claude Sonnet 3.5 fallback

// ── JSON extraction (shared by both providers) ──────────────────────────────
function extractJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  try { return JSON.parse(rawText); } catch (_) {}

  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch (_) {}
  }

  const firstBrace = rawText.indexOf('{');
  const lastBrace  = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = rawText.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(slice); } catch (_) {}

    for (const suffix of [']}', '}]}', '"}]}', '"]}', '}} ']) {
      try {
        const parsed = JSON.parse(slice + suffix);
        if (parsed && typeof parsed === 'object') {
          console.log(`Recovered JSON with suffix: "${suffix}"`);
          return parsed;
        }
      } catch (_) {}
    }

    const noTrailing = slice
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    try { return JSON.parse(noTrailing); } catch (_) {}

    for (let i = lastBrace; i > firstBrace; i--) {
      if (rawText[i] === '}') {
        const candidate = rawText.substring(firstBrace, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === 'object') {
            console.log(`Recovered JSON by truncating at position ${i}`);
            return parsed;
          }
        } catch (_) {}
      }
    }
  }

  return null;
}

// ── Gemini 1.5 Pro (primary) ────────────────────────────────────────────────
async function callGemini(prompt, systemText, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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

  console.error(`❌ Gemini JSON parse failed. Sample: ${rawText.substring(0, 500)}`);
  throw new Error(`Failed to parse Gemini JSON. Length: ${rawText.length} chars.`);
}

// ── Claude Sonnet 3.5 (fallback) ────────────────────────────────────────────
async function callClaudeFallback(prompt, systemText, temperature = 0.7) {
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
      max_tokens: 8192,
      temperature,
      system: systemText,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: "{" }
      ]
    })
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try { const e = await response.json(); errMsg = e.error?.message || errMsg; } catch (_) {}
    throw new Error(`Claude API error: ${errMsg}`);
  }

  const data = await response.json();
  if (!data.content || !data.content.length) throw new Error("No content returned from Claude");

  // Prefill means Claude's output starts after the opening {
  const rawText = "{" + data.content[0].text;

  const parsed = extractJSON(rawText);
  if (parsed) return parsed;

  console.error(`❌ Claude JSON parse failed. Sample: ${rawText.substring(0, 500)}`);
  throw new Error(`Failed to parse Claude JSON. stop_reason: ${data.stop_reason || 'unknown'}. Length: ${rawText.length} chars.`);
}

// ── Unified AI caller: Gemini first → Claude fallback ───────────────────────
async function callAI(prompt, temperature = 0.7) {
  const systemText = "You are a cinematic data extractor. Output ONLY a single raw JSON object. No markdown fences, no ```json, no preamble, no explanation. Start your response with { and end with }.";

  // Try Gemini first
  try {
    const result = await callGemini(prompt, systemText, temperature);
    console.log(`✅ Gemini succeeded`);
    return result;
  } catch (geminiErr) {
    console.warn(`⚠️ Gemini failed: ${geminiErr.message} — falling back to Claude`);
  }

  // Fallback to Claude Sonnet 3.5
  const result = await callClaudeFallback(prompt, systemText, temperature);
  console.log(`✅ Claude fallback succeeded`);
  return result;
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

function calculateBeatDurations(phases, durationMinutes, isSleep = false) {
  if (isSleep) return calculateSleepBeatDurations(phases, durationMinutes);

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

function calculateSleepBeatDurations(phases, durationMinutes) {
  const sleepPacing = {
    cold_open: { base: 15, variance: 3 },
    rising_tension: { base: 20, variance: 5 },
    emotional_core: { base: 25, variance: 8 },
    resolution: { base: 35, variance: 10 }
  };

  const durations = [];
  for (const phase of phases) {
    const p = sleepPacing[phase.name] || { base: 22, variance: 5 };
    for (let i = 0; i < phase.scenes; i++) {
      const ratio = phase.scenes > 1 ? i / (phase.scenes - 1) : 0.5;
      const d = Math.round((p.base + (ratio - 0.3) * p.variance) * 10) / 10;
      durations.push(Math.max(12, d));
    }
  }

  const totalCurrent = durations.reduce((a, b) => a + b, 0);
  const totalTarget = durationMinutes * 60;
  if (totalCurrent === 0) return durations;
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

function getGenrePhaseStructure(projectMode, storyArch) {
  const arch = storyArch || '';

  const PHASE_MAPS = {
    standard: [
      { name: 'cold_open',       weight: 0.10, purpose: 'Hook — visceral, immediate, impossible to ignore.' },
      { name: 'rising_tension',  weight: 0.25, purpose: 'Build the world and the problem — escalate stakes.' },
      { name: 'emotional_core',  weight: 0.40, purpose: 'Heart of the story — maximum emotional impact.' },
      { name: 'resolution',      weight: 0.25, purpose: 'Deliver the payoff — transformation, consequence.' },
    ],
    explainer: [
      { name: 'hook',            weight: 0.12, purpose: 'The WTF moment — show the thing that breaks assumption.' },
      { name: 'the_problem',     weight: 0.20, purpose: 'Establish what is broken or costly — make it personal.' },
      { name: 'the_mechanism',   weight: 0.38, purpose: 'Show how it actually works — step by step, specific.' },
      { name: 'application',     weight: 0.20, purpose: 'Show the viewer doing it — the before/after, the result.' },
      { name: 'cta',             weight: 0.10, purpose: 'Confident, specific, single action right now.' },
    ],
    story_comedy: [
      { name: 'normal_world',    weight: 0.15, purpose: 'Establish the slightly absurd world.' },
      { name: 'inciting_chaos',  weight: 0.20, purpose: 'Something goes wrong in the most inconvenient way.' },
      { name: 'worse_and_worse', weight: 0.35, purpose: 'Each fix makes things funnier and more disastrous.' },
      { name: 'punchline',       weight: 0.20, purpose: 'Pattern breaks in the most unexpected, perfectly-timed way.' },
      { name: 'callback',        weight: 0.10, purpose: 'Warm landing — a callback that rewards the audience.' },
    ],
    story_children: [
      { name: 'meet_the_hero',   weight: 0.18, purpose: 'Introduce the child hero — warm, specific, lovable.' },
      { name: 'the_problem',     weight: 0.17, purpose: 'A clear, concrete problem appears.' },
      { name: 'try_and_fail_1',  weight: 0.18, purpose: 'First attempt fails.' },
      { name: 'try_and_fail_2',  weight: 0.18, purpose: 'Second attempt fails — things look hopeless.' },
      { name: 'breakthrough',    weight: 0.17, purpose: 'The hero finds a new approach.' },
      { name: 'happy_ending',    weight: 0.12, purpose: 'Warm, satisfying resolution.' },
    ],
    story_nursery: [
      { name: 'intro_verse',     weight: 0.25, purpose: 'Set the scene with the first rhyming verse.' },
      { name: 'middle_verses',   weight: 0.50, purpose: 'The body of the rhyme — each verse its own visual scene.' },
      { name: 'final_verse',     weight: 0.25, purpose: 'The satisfying ending verse.' },
    ],
    story_crime: [
      { name: 'cold_open_crime', weight: 0.10, purpose: 'Drop into the crime or aftermath. Maximum tension.' },
      { name: 'investigation',   weight: 0.25, purpose: 'Investigator pieces it together — show the work.' },
      { name: 'deeper_mystery',  weight: 0.30, purpose: 'Second layer appears — more complicated than it seemed.' },
      { name: 'false_solution',  weight: 0.15, purpose: 'Wrong answer seems right — then undercut it.' },
      { name: 'revelation',      weight: 0.12, purpose: 'The truth. Surprising and inevitable.' },
      { name: 'aftermath',       weight: 0.08, purpose: 'The weight of what happened.' },
    ],
    story_love: [
      { name: 'first_encounter', weight: 0.12, purpose: 'The meeting — something specific makes them notice each other.' },
      { name: 'growing_closer',  weight: 0.22, purpose: 'Small moments of connection.' },
      { name: 'the_obstacle',    weight: 0.22, purpose: 'Something real stands between them.' },
      { name: 'almost_moment',   weight: 0.16, purpose: 'They almost break through — the closest moment.' },
      { name: 'lowest_point',    weight: 0.12, purpose: 'It seems over. The distance feels permanent.' },
      { name: 'breakthrough',    weight: 0.10, purpose: 'Someone chooses to be vulnerable.' },
      { name: 'resolution',      weight: 0.06, purpose: 'The earned landing.' },
    ],
    story_horror: [
      { name: 'normal_world',    weight: 0.15, purpose: 'The world exactly as it should be.' },
      { name: 'wrongness_creeps', weight: 0.20, purpose: 'Something is slightly off. Dread not yet named.' },
      { name: 'escalating_dread', weight: 0.30, purpose: 'The wrongness compounds — each scene more unsettling.' },
      { name: 'confrontation',   weight: 0.20, purpose: 'The horror is faced directly. Maximum tension.' },
      { name: 'aftermath',       weight: 0.15, purpose: 'What remains. Residual wrongness.' },
    ],
    story_thriller: [
      { name: 'inciting_crisis', weight: 0.12, purpose: 'Something is already wrong. Maximum stakes.' },
      { name: 'pursuit_begins',  weight: 0.20, purpose: 'The clock starts. The protagonist is moving.' },
      { name: 'complications',   weight: 0.28, purpose: 'Every step creates a new problem.' },
      { name: 'reversal',        weight: 0.18, purpose: 'Everything believed is wrong. Recalibration under fire.' },
      { name: 'climax',          weight: 0.14, purpose: 'All resources spent in one moment.' },
      { name: 'resolution',      weight: 0.08, purpose: 'The cost of what just happened.' },
    ],
    story_historical: [
      { name: 'world_anchoring',    weight: 0.14, purpose: 'Root in the period — specific detail.' },
      { name: 'personal_stakes',    weight: 0.20, purpose: 'Character personal situation within the historical moment.' },
      { name: 'historical_pressure', weight: 0.30, purpose: 'Large forces of era bear down on individual choices.' },
      { name: 'the_choice',         weight: 0.22, purpose: 'Pivotal decision made necessary and costly by the period.' },
      { name: 'consequence',        weight: 0.14, purpose: 'What follows from the choice.' },
    ],
    story_scifi: [
      { name: 'world_rules',      weight: 0.15, purpose: "Establish the world's rules visually." },
      { name: 'character_desire', weight: 0.18, purpose: 'Show what the protagonist wants — specific, personal.' },
      { name: 'system_conflict',  weight: 0.32, purpose: "World's rules directly prevent protagonist's desire." },
      { name: 'idea_escalation',  weight: 0.22, purpose: 'Big idea unfolds — implications grow.' },
      { name: 'revelation',       weight: 0.13, purpose: 'A new way of seeing.' },
    ],
    story_adventure: [
      { name: 'the_call',           weight: 0.12, purpose: 'Stable world disrupted — hero must leave the known.' },
      { name: 'crossing_threshold', weight: 0.15, purpose: 'Hero steps into the unknown.' },
      { name: 'tests_and_allies',   weight: 0.28, purpose: 'Obstacles, failures, companions found.' },
      { name: 'ordeal',             weight: 0.22, purpose: 'Greatest challenge — hero must transform to survive.' },
      { name: 'road_back',          weight: 0.13, purpose: 'Returning changed.' },
      { name: 'return',             weight: 0.10, purpose: 'The world they left — seen with new eyes.' },
    ],
    story_mystery: [
      { name: 'inciting_puzzle', weight: 0.12, purpose: 'The puzzle is posed — seemingly unsolvable.' },
      { name: 'first_clues',     weight: 0.20, purpose: 'Early evidence — establish the method of thinking.' },
      { name: 'red_herrings',    weight: 0.25, purpose: 'False leads that feel real.' },
      { name: 'narrowing',       weight: 0.20, purpose: 'Truth begins to emerge — one suspect remains credible.' },
      { name: 'revelation',      weight: 0.14, purpose: 'The solution — surprising but inevitable.' },
      { name: 'resolution',      weight: 0.09, purpose: 'Aftermath — loose ends, the cost of knowing.' },
    ],
    sleep_story: [
      { name: 'arrival',            weight: 0.18, purpose: 'Character arrives in the peaceful world.' },
      { name: 'gentle_exploration', weight: 0.25, purpose: 'They move through slowly — each discovery calmer.' },
      { name: 'deepening_peace',    weight: 0.30, purpose: 'World grows quieter — sound, light, movement diminish.' },
      { name: 'near_rest',          weight: 0.27, purpose: 'Character settles. World is still. Longer, slower, emptier.' },
    ],
    sleep_meditation: [
      { name: 'physical_settling', weight: 0.20, purpose: 'Body awareness — environments evoking physical weight.' },
      { name: 'breath_and_calm',   weight: 0.25, purpose: 'Breathing imagery — slow water, candle flame, tide.' },
      { name: 'affirmation_core',  weight: 0.30, purpose: 'Emotional heart — safe spaces, remembered warmth.' },
      { name: 'deep_rest',         weight: 0.25, purpose: 'Near-silence. Long static holds. World going to sleep.' },
    ],
  };

  let key = 'standard';
  if (projectMode === 'sleep_story')         key = 'sleep_story';
  else if (projectMode === 'sleep_meditation') key = 'sleep_meditation';
  else if (projectMode === 'explainer')       key = 'explainer';
  else if (projectMode === 'story' && PHASE_MAPS[arch]) key = arch;
  else if (PHASE_MAPS[projectMode])           key = projectMode;

  return PHASE_MAPS[key] || PHASE_MAPS['standard'];
}

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
      forbidden: 'heavy shadow, extreme angles, visual complexity that distracts',
      emotional_tools: 'medium close-ups during explanation, wide during demonstration',
    },
    story_comedy: {
      prompt_prefix: 'Wide, bright, populated comedic scene',
      mandatory_lighting: 'high-key warm lighting, no heavy shadows',
      color_grade: 'warm saturated tones, slightly elevated brightness',
      reference_directors: 'Edgar Wright kinetic energy, Wes Anderson symmetry',
      forbidden: 'dark shadows, extreme close-ups, dutch angles, desaturation',
      emotional_tools: 'wide shots showing full absurd situation, reaction close-ups after punchlines',
    },
    story_children: {
      prompt_prefix: 'Warm, bright, wonder-filled scene',
      mandatory_lighting: 'soft golden hour or bright daylight, no harsh shadows',
      color_grade: 'warm saturated primary colors, storybook palette',
      reference_directors: 'Pixar visual warmth, Studio Ghibli detail and wonder',
      forbidden: 'desaturation, dutch angles, extreme contrast, dark corners',
      emotional_tools: 'low-angle shots (child eye level), wide shots for the big world',
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
      mandatory_lighting: 'low-key chiaroscuro, single hard source, deep shadow pools',
      color_grade: 'cold desaturated blue-black with amber accent, high contrast',
      reference_directors: 'David Fincher clinical precision, Roger Deakins Blade Runner 2049 shadow',
      forbidden: 'bright daylight, warm soft lighting, cheerful colors',
      emotional_tools: 'dutch angles for psychological wrongness, extreme close-ups on evidence',
    },
    story_love: {
      prompt_prefix: 'Intimate, warm, emotionally charged romantic scene',
      mandatory_lighting: 'golden hour backlight, soft window light, warm practical glow',
      color_grade: 'warm amber, rose gold, soft desaturated backgrounds',
      reference_directors: 'Wong Kar-wai intimate framing, Barry Jenkins Moonlight warmth',
      forbidden: 'harsh lighting, cold blue tones, wide crowd shots, clinical environments',
      emotional_tools: 'OTS shots for tension, medium close-ups for intimacy, slow push-ins',
    },
    story_horror: {
      prompt_prefix: 'Deeply unsettling horror scene with wrong proportions',
      mandatory_lighting: 'extreme low-key, 80-90% shadow, single cold source or sickly green',
      color_grade: 'desaturated cold palette with wrong-hue accent, deep blacks',
      reference_directors: 'Stanley Kubrick cold geometry, James Wan controlled dread',
      forbidden: 'warm lighting, bright environments, cheerful colors',
      emotional_tools: 'dutch angles, long static shots, slow zooms into darkness',
    },
    story_thriller: {
      prompt_prefix: 'Tense, kinetic thriller scene under pressure',
      mandatory_lighting: 'motivated dramatic lighting, high contrast, urgency visible in the light',
      color_grade: 'cool clinical blue-gray with warm accent for human moments',
      reference_directors: 'Christopher Nolan controlled tension, Denis Villeneuve precision',
      forbidden: 'soft casual lighting, warm golden glow, leisurely wide shots',
      emotional_tools: 'tight medium close-ups during pursuit, handheld urgency in action',
    },
    story_historical: {
      prompt_prefix: 'Period-accurate historical cinematic scene',
      mandatory_lighting: 'period-appropriate practical lighting — candles, torches, harsh daylight',
      color_grade: 'desaturated warm period palette, aged texture',
      reference_directors: 'Ridley Scott historical texture, Barry Lyndon candlelight realism',
      forbidden: 'modern lighting quality, clean contemporary environments, anachronistic elements',
      emotional_tools: 'wide shots to show the period world, close-ups on period-specific objects',
    },
    story_scifi: {
      prompt_prefix: 'Precise science fiction scene with lived-in world detail',
      mandatory_lighting: 'cold practical light sources — screens, LEDs, bioluminescence',
      color_grade: 'cool blue-gray future palette or warm analog-future amber',
      reference_directors: 'Denis Villeneuve Blade Runner 2049, Alex Garland Ex Machina',
      forbidden: 'generic future aesthetics, lens flare everywhere',
      emotional_tools: "wide shots to establish scale, close-ups on human face against the inhuman",
    },
    story_mystery: {
      prompt_prefix: 'Atmospheric mystery scene with careful visual misdirection',
      mandatory_lighting: 'overcast day or low interior light, motivated shadows',
      color_grade: 'slightly desaturated, cool undertone, neutral pregnant with potential',
      reference_directors: 'Tomas Alfredson restraint, Coen Brothers precise composition',
      forbidden: 'revealing lighting that shows everything, warm cheerful palette',
      emotional_tools: 'OTS shots to create information asymmetry, inserts on clues',
    },
    story_adventure: {
      prompt_prefix: 'Epic adventure scene with scale and movement',
      mandatory_lighting: 'strong directional light — golden sun, storm light, moonlight',
      color_grade: 'wide dynamic range, deep skies, rich earth tones',
      reference_directors: 'Peter Jackson scale and intimacy, David Lean epic geography',
      forbidden: 'flat overcast lighting, interior corporate environments',
      emotional_tools: 'wide establishing shots for scale, low angle upshots for heroism',
    },
    sleep_story: {
      prompt_prefix: 'Peaceful bedtime atmosphere, warm dim and still',
      mandatory_lighting: 'very dim warm candlelight or moonlight, 80% shadow',
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
      emotional_tools: 'almost static compositions, nature environments only',
    },
  };

  let key = 'standard';
  if (projectMode === 'sleep_story')           key = 'sleep_story';
  else if (projectMode === 'sleep_meditation') key = 'sleep_meditation';
  else if (projectMode === 'explainer')        key = 'explainer';
  else if (projectMode === 'story' && PRESETS[arch]) key = arch;
  else if (PRESETS[projectMode])               key = projectMode;

  return PRESETS[key] || PRESETS['standard'];
}

function getEmotionalBeat(phaseName, sceneIndexInPhase, totalScenesInPhase, narrativePositionPct) {
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
  const ratio = totalScenesInPhase > 1 ? sceneIndexInPhase / (totalScenesInPhase - 1) : 0.5;
  const emotionIndex = Math.min(Math.floor(ratio * emotions.length), emotions.length - 1);
  const primaryEmotion = emotions[emotionIndex];

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

function getNarrativePosition(sceneNumber, totalScenes) {
  if (totalScenes <= 1) return 50;
  return Math.round(((sceneNumber - 1) / (totalScenes - 1)) * 100);
}

function splitScriptByPhase(script, phases) {
  if (!script || !script.trim() || !phases || phases.length === 0) return [];

  const sentences = script.match(/[^.!?]+[.!?]+[\s]*/g) || [script];
  const totalSentences = sentences.length;
  const totalPhaseScenes = phases.reduce((a, b) => a + b.scenes, 0);

  if (totalPhaseScenes === 0) return [];

  let cursor = 0;
  const chunks = [];

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    if (!phase.scenes || phase.scenes <= 0) continue;

    const proportion = phase.scenes / totalPhaseScenes;
    const sentenceCount = Math.max(1, Math.round(totalSentences * proportion));
    const isLast = i === phases.length - 1;
    const endCursor = isLast ? totalSentences : Math.min(cursor + sentenceCount, totalSentences);

    if (endCursor > cursor) {
      const segment = sentences.slice(cursor, endCursor).join("").trim();
      if (segment.length > 0) {
        chunks.push({
          phase: phase.name,
          purpose: phase.purpose,
          scenes: phase.scenes,
          text: segment
        });
      }
    }
    cursor = endCursor;

    if (cursor >= totalSentences) break;
  }

  return chunks;
}

function getPhaseCinematicEnergy(phaseName) {
  const energyMap = {
    cold_open: {
      camera_mandate: "Camera is ALREADY MOVING when the scene opens — mid-push, mid-track, zero ease-in. Assert the world immediately. No slow reveals. No establishing-then-finding.",
      shot_bias: "MCU or LOW ANGLE or POV — intimate or imposing, never neutral",
      movement_speed: "FAST — assertive, deliberate, no drift",
      cut_style: "SMASH CUT — no hold at end of scene",
      forbidden: "slow pans, gentle drifts, wide establishing without immediate subject"
    },
    hook: {
      camera_mandate: "Single most arresting image possible. Camera locked or single decisive move. One thing, perfectly framed.",
      shot_bias: "ECU or LOW ANGLE — make it feel too close or too powerful",
      movement_speed: "LOCKED or single decisive push",
      cut_style: "HARD CUT on the beat",
      forbidden: "busy compositions, multiple subjects, decorative movement"
    },
    rising_tension: {
      camera_mandate: "Camera grows bolder each scene. Each push-in slightly faster, each angle slightly more extreme than the last. The escalation is PHYSICAL — the camera itself gets more aggressive.",
      shot_bias: "MS to MCU progression — tightening across the phase",
      movement_speed: "BUILDING — each scene 10% faster than previous",
      cut_style: "CUT ON MOTION — never cut when subject is at rest",
      forbidden: "pull-backs, static locked shots (unless for shock contrast), wide establishing"
    },
    the_problem: {
      camera_mandate: "Show the problem at HUMAN SCALE — not wide and abstract, but close enough to feel the weight. Camera at eye-level or slightly below, looking up at what's impossible.",
      shot_bias: "MS or LOW ANGLE — make the problem feel bigger than the person",
      movement_speed: "SLOW deliberate push toward the problem",
      cut_style: "HOLD — let the problem land before cutting",
      forbidden: "bird's-eye (removes humanity), comedy angles, fast movement"
    },
    emotional_core: {
      camera_mandate: "Camera slows to a crawl. Every millimeter of movement earns its place. HOLD longer than feels comfortable — the silence IS the scene.",
      shot_bias: "CU or MCU — face and hands are the subject",
      movement_speed: "NEAR STILL — micro-movements only, meaningful holds",
      cut_style: "HOLD 6-8 frames past peak emotion. Then cut.",
      forbidden: "fast movement, wide shots, busy compositions, rack focus for drama (rack focus only if already close)"
    },
    climax: {
      camera_mandate: "RACK FOCUS snap to subject's eyes or hands. Everything else blurs. Camera goes still after the snap — let the subject move, not the camera.",
      shot_bias: "CU or ECU — the face IS the climax",
      movement_speed: "STILL after the initial snap — stillness IS the tension",
      cut_style: "CUT TO BLACK for 8 frames — then smash to next scene",
      forbidden: "camera movement during the peak moment, wide shots"
    },
    resolution: {
      camera_mandate: "Camera exhales. Pull back slowly — character becomes smaller against the world they've changed or been changed by. Wide reveals context that wasn't visible before.",
      shot_bias: "WS or EWS — the world is bigger than the person again, and that's okay",
      movement_speed: "SLOW pull-back or slow lateral drift",
      cut_style: "LONG HOLD — let breathing return to normal",
      forbidden: "push-ins, tight close-ups, fast movement"
    },
    investigation: {
      camera_mandate: "Camera moves like a detective — purposeful, observant, finding details. Insert shots on evidence. OTS during conversation. Never wide when a close-up would reveal more.",
      shot_bias: "INSERT (evidence) + OTS (interrogation) + MCU (realization)",
      movement_speed: "DELIBERATE — each move has a reason",
      cut_style: "CUT ON DISCOVERY — the cut IS the find",
      forbidden: "decorative movement, shots without a clear investigative purpose"
    },
    revelation: {
      camera_mandate: "HOLD on the face during the reveal — don't cut away to show what's revealed, show the CHARACTER learning it. The face IS the revelation.",
      shot_bias: "CU — hold on the reaction, not the information",
      movement_speed: "STILL — let the information hit",
      cut_style: "LONG HOLD before any cut",
      forbidden: "cutting to show the information before the reaction"
    },
    confrontation: {
      camera_mandate: "Dutch angle OR rapid alternation between LOW (power) and HIGH (vulnerability). Camera is unstable because the world is unstable.",
      shot_bias: "DUTCH ANGLE or alternating LOW/HIGH",
      movement_speed: "ERRATIC — controlled chaos, not smooth",
      cut_style: "FAST — cuts on beats, never between them",
      forbidden: "eye-level neutral shots, smooth camera movement"
    },
  };

  const defaultEnergy = {
    camera_mandate: "Camera movement serves the emotional beat. Push toward conflict, pull away from resolution. Never move the camera without a dramatic reason.",
    shot_bias: "MS or MCU — human scale, emotionally readable",
    movement_speed: "MODERATE — deliberate, purposeful",
    cut_style: "CUT ON BEAT — land on the emotional moment",
    forbidden: "unmotivated camera movement, static shots during action"
  };

  return energyMap[phaseName] || defaultEnergy;
}

function buildBreakdownPrompt({
  styleDirective, storyAnalysis, characterBlock, continuityContext,
  phaseName, phasePurpose, sceneCount, sceneStart, scriptText,
  beatDurationsSlice, nicheProfile,
  cinemaPreset, sceneStartGlobal, totalScenes
}) {
  const durLine = beatDurationsSlice.length > 0
    ? `\n**DURATION TARGETS (seconds per scene):** [${beatDurationsSlice.map(d => d.toFixed(1)).join(', ')}]`
    : '';

  const narrativeStart = getNarrativePosition(sceneStartGlobal || sceneStart, totalScenes || sceneStart + sceneCount);
  const narrativeEnd   = getNarrativePosition((sceneStartGlobal || sceneStart) + sceneCount - 1, totalScenes || sceneStart + sceneCount);
  const emotionalBeats = [];
  for (let i = 0; i < sceneCount; i++) {
    const posPct = sceneCount > 1
      ? narrativeStart + (i / (sceneCount - 1)) * (narrativeEnd - narrativeStart)
      : (narrativeStart + narrativeEnd) / 2;
    emotionalBeats.push(getEmotionalBeat(phaseName, i, sceneCount, posPct));
  }
  const beatTable = emotionalBeats.map((b, i) => {
    const intensity = b.emotional_intensity;
    const cameraRule = intensity >= 0.85 ? 'TIGHT (CU/ECU) — handheld if tension genre, locked if drama. Long hold.'
      : intensity >= 0.65 ? 'MEDIUM-CLOSE (MCU/MS) — deliberate push-in. Cut on the beat.'
      : intensity >= 0.40 ? 'MEDIUM (MS/WS) — motivated movement. World visible around character.'
      : 'WIDE (WS/EWS) — camera distant, world establishing, slow or static.';
    return `Scene ${sceneStart + i}: viewer feels "${b.viewer_emotion}" | intensity ${b.emotional_intensity} → CAMERA RULE: ${cameraRule}`;
  }).join('\n');

  const motifs = storyAnalysis.recurring_visual_motifs || [];
  const motifLine = motifs.length > 0
    ? `\n**RECURRING VISUAL MOTIFS (plant at least one per phase):** ${motifs.join(', ')}`
    : '';

  const preset = cinemaPreset || {};
  const cinemaBlock = preset.prompt_prefix ? `
**GENRE CINEMATOGRAPHY MANDATE (${preset.reference_directors}):**
- Visual identity: ${preset.prompt_prefix}
- Lighting law: ${preset.mandatory_lighting}
- Color grade: ${preset.color_grade}
- Emotional tools: ${preset.emotional_tools}
- FORBIDDEN: ${preset.forbidden}
Every scene must feel like it belongs to this specific visual world. No generic cinema.` : '';

  const phaseEnergy = getPhaseCinematicEnergy(phaseName);
  const phaseEnergyBlock = `
**PHASE CINEMATIC ENERGY — ${phaseName.toUpperCase().replace(/_/g, ' ')} (overrides defaults):**
- Camera mandate: ${phaseEnergy.camera_mandate}
- Shot bias for this phase: ${phaseEnergy.shot_bias}
- Movement speed: ${phaseEnergy.movement_speed}
- Cut style: ${phaseEnergy.cut_style}
- FORBIDDEN in this phase: ${phaseEnergy.forbidden}
Every scene in this phase must feel cinematically distinct from the previous phase. The camera behavior IS the phase transition.`;

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

**CURRENT PHASE: ${phaseName.toUpperCase().replace(/_/g, ' ')}**
Dramatic purpose: ${phasePurpose}
Scenes to create: ${sceneCount} (numbers ${sceneStart} through ${sceneStart + sceneCount - 1})
${durLine}
${phaseEnergyBlock}

**EMOTIONAL BEAT TARGETS:**
${beatTable}

**SCRIPT SEGMENT:**
${scriptText}

**DIRECTOR'S LAWS:**
1. PLOT-DRIVEN SCENES: Show what is HAPPENING in the story at this exact moment. Real action, real location, real stakes.
2. EMOTIONAL DELIVERY FIRST: Every technical choice — shot type, angle, lighting, movement — serves the emotional beat target for that scene. "urgency 0.8" means handheld shake, fast push-in, cut on motion. "melancholy 0.6" means slow pull-back, dim key, long hold.
3. NARRATIVE POSITION RULES:
   - Opening (0-15%): WIDE shots, cooler tones, camera discovering the world — assertive but not intimate.
   - Building (15-40%): MEDIUM shots warming up, camera growing bolder, push-ins becoming deliberate.
   - Core (40-70%): CLOSE shots, peak warmth or peak cold (per genre), camera earning every inch.
   - Climax (70-85%): TIGHTEST shots, highest contrast, camera still but world moving OR camera moving toward stillness.
   - Resolution (85-100%): WIDE pull-backs, settled warmth, camera exhaling.
4. SHOT SEQUENCE GRAMMAR — MANDATORY: Before choosing each shot type, state the previous shot. The new shot MUST:
   - Be a DIFFERENT shot type from the immediately preceding scene.
   - Shift camera angle by minimum 30 degrees (e.g. eye-level → low angle, OTS → bird's-eye, MS → POV).
   - FORBIDDEN: two consecutive MS eye-level shots. FORBIDDEN: same angle twice in a row.
5. POV SHOT MANDATE: Every video MUST include at least one Point-of-View shot — looking through the character's eyes. Best placed at a moment of discovery, confrontation, or interaction. Skeleton protagonist: bone hands visible at bottom of frame. All others: first-person embodied perspective.
6. SHOT DISTRIBUTION: Minimum 40% wide or wider (WS, EWS, MWS, HIGH ANGLE, ESTABLISHING). These are not "filler" — they are the scenes where the world breathes.
7. visual_concept: Camera-first shot description (see format above). NEVER a prose caption.
8. NAMED PROPS: Use specific objects from the narration. Never describe readable text on screens or paper.
9. NO ABSTRACT METAPHORS: Every visual is a plausible real-world scene a film crew could actually shoot.
10. CONTINUITY BRIDGE: The continuity_bridge must name a SPECIFIC PHYSICAL OBJECT or LIGHT QUALITY that will appear in the NEXT scene — not a mood or feeling.
11. POPULATED WORLD: Most scenes include other people. The character lives in a world with reactions, crowds, witnesses.
12. TONE SAFETY: No imagery readable as violence or self-harm in non-horror/thriller content.

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

GENERATE EXACTLY ${sceneCount} SCENES. NARRATION TEXT FROM SCRIPT WORDS ONLY.`;
}

Deno.serve(async (req) => {
  const callStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    // ── Passthrough mode for directApi.js (Gemini primary, Claude fallback) ──
    if (body.__claude_passthrough) {
      const { system, prompt, max_tokens = 2000 } = body;
      if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });

      let text = '';

      // Try Gemini first
      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      if (geminiKey) {
        try {
          const geminiBody = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: max_tokens, temperature: 0.7 },
          };
          if (system) geminiBody.systemInstruction = { parts: [{ text: system }] };

          const gRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiBody) }
          );
          const gData = await gRes.json();
          text = gData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            console.log(`✅ Passthrough: Gemini succeeded`);
            return Response.json({ text });
          }
          throw new Error('Gemini returned empty text');
        } catch (gErr) {
          console.warn(`⚠️ Passthrough Gemini failed: ${gErr.message} — falling back to Claude`);
        }
      }

      // Fallback to Claude
      const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!apiKey) return Response.json({ error: 'Neither GEMINI_API_KEY nor ANTHROPIC_API_KEY available' }, { status: 500 });

      const claudeBody = {
        model: 'claude-sonnet-3-5',
        max_tokens,
        messages: [{ role: 'user', content: prompt }],
      };
      if (system) claudeBody.system = system;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(claudeBody),
      });

      const data = await response.json();
      text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      if (!text) return Response.json({ error: 'No text from Claude fallback' }, { status: 500 });
      console.log(`✅ Passthrough: Claude fallback succeeded`);
      return Response.json({ text });
    }
    // ── End passthrough ──────────────────────────────────────────────────────

    const { project_id, batch_index, selected_hook } = body;

    if (!project_id) {
      return Response.json({ error: 'Missing required field: project_id' }, { status: 400 });
    }

    const startBatch = batch_index || 0;

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found. Please generate a script first.' }, { status: 400 });
    }

    const cleanedScript = cleanScriptText(script.full_script);
    if (!cleanedScript || cleanedScript.trim().length < 10) {
      return Response.json({ error: 'Script is empty or too short after cleaning.' }, { status: 400 });
    }

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

    const isSleep = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';

    const densityAnchors = isSleep
      ? [{m:5,d:15},{m:10,d:20},{m:15,d:22},{m:20,d:25},{m:30,d:28},{m:60,d:32}]
      : [{m:1,d:4.2},{m:3,d:5.0},{m:5,d:5.5},{m:8,d:6.0},{m:10,d:6.2},{m:15,d:7.0},{m:30,d:8.0},{m:60,d:9.0}];

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

    const projectMode = project.project_mode || '';
    const storyArch   = project.shorts_niche  || '';
    const genrePhases = getGenrePhaseStructure(projectMode, storyArch);
    const cinemaPreset = getGenreCinematographyPreset(projectMode, storyArch);

    const phases = (() => {
      let allocated = 0;
      return genrePhases.map((phase, index) => {
        if (index === genrePhases.length - 1) {
          const remaining = Math.max(1, totalTargetScenes - allocated);
          return { ...phase, scenes: remaining };
        }
        const count = Math.max(1, Math.round(totalTargetScenes * phase.weight));
        allocated += count;
        return { ...phase, scenes: count };
      });
    })();

    const totalAllocatedScenes = phases.reduce((sum, p) => sum + p.scenes, 0);
    if (totalAllocatedScenes === 0) {
      return Response.json({ error: 'Phase allocation produced zero scenes. Check video_duration_minutes on the project.' }, { status: 400 });
    }

    const scriptChunks = splitScriptByPhase(finalScript, phases);

    if (scriptChunks.length === 0) {
      return Response.json({ error: 'Script could not be split into scene chunks. Script may be too short.' }, { status: 400 });
    }

    console.log(`🎭 Genre: ${projectMode || 'standard'}/${storyArch || 'none'} → ${phases.length} phases: ${phases.map(p => p.name + '(' + p.scenes + ')').join(', ')}`);
    console.log(`🎬 Cinema preset: ${cinemaPreset.reference_directors}`);

    const numBatches = scriptChunks.length;
    const nicheProfile = getNicheDirectorProfile(niche);

    console.log(`🎯 ${durationMinutes}min → ${totalTargetScenes} scenes (avg ${avgSceneDuration.toFixed(1)}s) | ${numBatches} phases | Style: ${visualStyle || 'default'} | AI: Gemini→Claude`);

    let blueprint;
    let freshProject = project;
    let storyAnalysis;
    let beatDurations = [];
    let beatStartTimes = [];
    let phaseStart = 0;

    if (startBatch === 0) {
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      if (oldScenes.length > 0) {
        for (let i = 0; i < oldScenes.length; i += 10) {
          await Promise.all(oldScenes.slice(i, i + 10).map(s =>
            base44.asServiceRole.entities.Scenes.delete(s.id).catch(_ => {})
          ));
        }
        console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
      }

      const analysisPrompt = `You are a world-class film director. Study this script and respond with JSON.
${styleDirective}

**SCRIPT:**
${finalScript}

**NICHE:** ${niche} | **TOPIC:** ${project.name} | **DURATION:** ~${durationMinutes}min | **SCENES:** ${totalTargetScenes}

Respond with this JSON (raw JSON only, no markdown fences):
{
  "story_analysis": {
    "plot_summary": "What ACTUALLY HAPPENS — concrete sequence of events, situations, and outcomes.",
    "central_theme": "The deeper human truth (NOT the topic)",
    "narrative_arc_summary": "2-3 sentence emotional journey",
    "emotional_trajectory": ["curiosity","concern","empathy","hope"],
    "key_turning_points": ["Moment 1","Moment 2","Moment 3"],
    "visual_world": "Specific sensory description of this story's visual universe",
    "recurring_visual_motifs": ["Motif 1","Motif 2","Motif 3"],
    "color_arc": "e.g. cool blues to warm amber to vibrant gold",
    "pov_moment": "Identify the ONE scene in the story where a POV shot (looking through the character's eyes) would be most powerful — the moment of discovery, confrontation, or first contact. Describe what the character would SEE in that moment.",
    "shot_motif": "One recurring compositional motif that defines this story visually — e.g. 'always find the character through a foreground object', 'hands are always visible and active', 'world always slightly too big for the character'.",
    "characters": [{
      "name": "Name/archetype",
      "identity_core": "Casting-sheet: exact age, specific gender (male or female — never neutral), skin tone, face shape, eye color, hair, build, 2-3 distinguishing marks.",
      "default_clothing": "Typical outfit",
      "emotional_arc": "How they change emotionally"
    }]
  }
}

NICHE SENSIBILITY: ${nicheProfile.visual_world} | ${nicheProfile.emotional_palette}`;

      console.log(`🎬 Story analysis (Gemini primary)...`);
      const analysis = await callAI(analysisPrompt, 0.6);
      storyAnalysis = analysis.story_analysis || analysis;

      if (!storyAnalysis || typeof storyAnalysis !== 'object') {
        return Response.json({ error: 'Story analysis returned invalid data. Try again.' }, { status: 500 });
      }

      beatDurations = calculateBeatDurations(phases, durationMinutes, isSleep);
      beatStartTimes = calculateStartTimes(beatDurations);

      console.log(`📊 Beats: ${beatDurations.length} scenes | Range: ${Math.min(...beatDurations).toFixed(1)}s – ${Math.max(...beatDurations).toFixed(1)}s`);

      const saForSave = { ...storyAnalysis };
      delete saForSave.characters;
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

      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown",
        current_step: 5,
        scene_blueprint: `{"ready":true,"niche":"${niche}","ts":${totalTargetScenes}}`,
        character_descriptions: storyAnalysis.characters
          ? JSON.stringify(storyAnalysis.characters)
          : project.character_descriptions
      });

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
      phaseStart = Math.max(0, startBatch - 1);

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

    let grandTotalCreated = 0;
    const MAX_WALL_MS = 55000;
    const MAX_SCENES_PER_CALL = 20;

    for (let batchIdx = phaseStart; batchIdx < scriptChunks.length; batchIdx++) {
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

      if (!currentChunk.text || currentChunk.text.trim().length === 0 || currentChunk.scenes <= 0) {
        console.warn(`⚠️ Skipping empty chunk for phase ${currentChunk.phase}`);
        continue;
      }

      const existingScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      const sceneOffset = existingScenes.length;

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

        const elapsed2 = Date.now() - callStart;
        if (elapsed2 > MAX_WALL_MS && phaseCreated > 0) {
          console.log(`⏱️ ${(elapsed2/1000).toFixed(1)}s — saving mid-phase progress`);
          break;
        }

        const wordStart = (sub.offset - sceneOffset) * wordsPerScene;
        const wordEnd = Math.min(wordStart + sub.count * wordsPerScene, chunkWords.length);

        if (wordStart >= chunkWords.length) {
          console.warn(`⚠️ Sub-batch ${si+1} has no words — skipping`);
          continue;
        }

        const subText = chunkWords.slice(wordStart, wordEnd).join(' ');
        if (!subText || subText.trim().length === 0) {
          console.warn(`⚠️ Sub-batch ${si+1} produced empty text — skipping`);
          continue;
        }

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
          result = await callAI(prompt, 0.7);
        } catch (err) {
          console.error(`❌ Scenes ${sub.offset+1}-${sub.offset+sub.count} FAILED: ${err.message}`);
          if (sub.count > 10) {
            console.log(`🔄 Retrying with ${Math.ceil(sub.count/2)} scenes...`);
            try {
              const halfCount = Math.ceil(sub.count / 2);
              const halfWordEnd = Math.min(wordStart + halfCount * wordsPerScene, chunkWords.length);
              const halfText = chunkWords.slice(wordStart, halfWordEnd).join(' ');
              const halfPrompt = buildBreakdownPrompt({
                styleDirective, storyAnalysis, characterBlock, continuityContext,
                phaseName: currentChunk.phase, phasePurpose: currentChunk.purpose,
                sceneCount: halfCount,
                sceneStart: sub.offset + 1,
                scriptText: halfText,
                beatDurationsSlice: subBeats.slice(0, halfCount),
                nicheProfile,
                cinemaPreset,
                sceneStartGlobal: sub.offset + 1,
                totalScenes: totalTargetScenes
              });
              result = await callAI(halfPrompt, 0.7);
            } catch (retryErr) {
              console.error(`❌ Retry also failed: ${retryErr.message} — skipping`);
              continue;
            }
          } else {
            continue;
          }
        }

        let scenesArr = result?.scenes;
        if (!scenesArr || !Array.isArray(scenesArr)) {
          scenesArr = result?.prompts || result?.scene || null;
          if (Array.isArray(scenesArr)) {
            console.warn(`⚠️ Scenes found under non-standard key`);
          } else {
            console.error(`❌ No scenes array in result. Keys: ${JSON.stringify(Object.keys(result || {}))}`);
            continue;
          }
        }

        for (const scene of scenesArr) {
          const sceneNum = sceneOffset + phaseCreated + 1;
          const cleanedNarration = cleanNarrationText(scene.narration_text);
          const targetDuration = beatDurations[sceneNum - 1] || scene.duration_seconds || 5;

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

        if (si < subBatches.length - 1 && blueprint.scenes.length >= 3) {
          const last3 = blueprint.scenes.slice(-3);
          continuityContext = `**LAST 3 SCENES:**\n${last3.map(s =>
            `  Scene ${s.scene_number}: [${s.shot_type}] ${(s.visual_concept || '').substring(0, 80)} | Mood: ${s.mood}`
          ).join('\n')}`;
        }
      }

      grandTotalCreated += phaseCreated;
      console.log(`✓ ${currentChunk.phase}: ${phaseCreated} scenes (total: ${grandTotalCreated}/${totalTargetScenes}) [${((Date.now()-callStart)/1000).toFixed(1)}s]`);
    }

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
    console.error("❌ generateSceneBreakdown error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});