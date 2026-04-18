import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE — CLAUDE POWERED
// ══════════════════════════════════════════════════════════════════
// Upgraded with:
// - Diversity seed (breaks "always Sarah / kitchen table" convergence)
// - Narrative shape picker (breaks hardcoded 3-act template)
// - Shot distribution randomizer (breaks visual monotony)
// - Plot-native visual world (no more static niche buckets)
// - Claude Sonnet as the director LLM (better creative diversity than Gemini)
// ══════════════════════════════════════════════════════════════════

// ── CLAUDE API WRAPPER ──
// Uses Anthropic Messages API. Returns parsed JSON from the response.
async function callClaude(prompt, temperature = 0.9, maxTokens = 16000) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt + "\n\nRespond with ONLY valid JSON. No markdown fences, no commentary." }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude error ${response.status}: ${err.substring(0, 300)}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '';
  if (!rawText) throw new Error("No text from Claude");

  // Strip markdown fences if present
  let clean = rawText.trim();
  if (clean.startsWith('```json')) clean = clean.substring(7);
  else if (clean.startsWith('```')) clean = clean.substring(3);
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
  clean = clean.trim();

  try { return JSON.parse(clean); } catch (_) {}

  // Recovery: find the first { and the matching last }
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = clean.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(candidate); } catch (_) {}
    for (const suffix of [']}', '}]}', '']) {
      try {
        const parsed = JSON.parse(candidate + suffix);
        if (parsed.scenes && Array.isArray(parsed.scenes)) return parsed;
        if (parsed.story_analysis) return parsed;
      } catch (_) {}
    }
  }
  throw new Error("Failed to parse Claude JSON");
}

// ══════════════════════════════════════════════════════════════════
// 🎲 DIVERSITY SEED — breaks the "always Sarah / kitchen table" rut
// ══════════════════════════════════════════════════════════════════
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
function pickFromArr(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

const ARCHETYPES = [
  "retired factory worker in his late 60s, widowed, lives alone in a small apartment",
  "single father in his early 40s driving a rideshare at night while his kids sleep",
  "middle-aged nurse pulling double shifts at a county hospital",
  "young teacher in her late 20s at an underfunded public school",
  "grandmother in her 70s raising her grandchildren after a family tragedy",
  "teenage high-school student working weekends at a gas station",
  "college freshman navigating her first year far from home",
  "man in his 50s recently laid off from a 25-year corporate job",
  "woman in her mid-30s who just left a long relationship",
  "first-generation immigrant shopkeeper running a small bodega",
  "Nigerian software engineer who moved to a new city six months ago",
  "Korean-American mechanic who took over his father's auto shop",
  "Mexican-American chef opening her first restaurant",
  "Indian graduate student doing her PhD on a tight budget",
  "Filipina caregiver working 12-hour shifts to send money home",
  "Ethiopian taxi driver who used to be a doctor back home",
  "Vietnamese nail salon owner who arrived in the country 20 years ago",
  "Brazilian construction foreman building a house for his own family",
  "Haitian immigrant mother juggling three jobs",
  "Pakistani convenience-store owner who works 16-hour days",
  "long-haul trucker in her mid-40s crossing the country every week",
  "tattoo artist whose studio just opened in a gentrifying neighborhood",
  "farmer in his 60s facing a bad harvest season",
  "fisherman whose small boat is falling apart",
  "freelance graphic designer chasing unpaid invoices",
  "emergency-room nurse running on three hours of sleep",
  "small-town pastor struggling to keep his congregation together",
  "traveling salesman who hates his job but can't quit",
  "city bus driver who's seen the same route for 18 years",
  "firefighter recovering from a bad call last month",
  "former college athlete working retail after an injury ended her career",
  "warehouse worker saving up to go back to school",
  "hairdresser who knows every secret in her small town",
  "courthouse janitor who overhears more than anyone realizes",
  "veteran running a small landscaping business",
  "widow in her 80s still running her late husband's bookstore",
  "social worker stretched thin across 40 cases",
  "trauma therapist quietly burning out",
  "freelance journalist chasing a story no one else will touch",
  "auto-body painter with dreams of opening his own shop"
];

const NAMES = {
  west_african: ["Adaeze","Chike","Obi","Amara","Kwame","Nneka","Emeka","Ayo","Fatou","Kojo"],
  east_asian: ["Hiroshi","Mei-Lin","Jun","Sora","Kenji","Xiuying","Daiyu","Takeshi","Yuna","Min-jun"],
  south_asian: ["Priya","Arjun","Kavita","Raj","Deepika","Vikram","Anita","Farhan","Zara","Ishaan"],
  latin: ["Mateo","Sofía","Diego","Camila","Luis","Valeria","Javier","Isabela","Rafael","Lucía"],
  arabic: ["Omar","Layla","Khaled","Yasmin","Tariq","Noor","Hassan","Amina","Faisal","Salma"],
  eastern_european: ["Dmitri","Katya","Marek","Agnieszka","Stefan","Ana","Ivan","Olena","Viktor","Lena"],
  anglo: ["Walter","Margaret","Harold","Beatrice","Samuel","Josephine","Arthur","Eleanor","Frank","Ruth"],
  african_american: ["Darnell","Keisha","Malik","Tanya","Jerome","Shanice","Marcus","Aaliyah","Terrence","Monique"],
  mixed_modern: ["Quinn","Rowan","Asha","Kai","Sage","Zion","River","Nia","Finn","Imani"]
};

const SETTINGS = [
  "a cramped city bus at 6am with condensation on the windows",
  "a late-night diner booth under flickering fluorescent lights",
  "a subway platform during rush hour, echoing with announcements",
  "the back of a taxi cab stuck in traffic on a rainy night",
  "a mechanic's garage with oil-stained concrete and open hood lamps",
  "a hospital break room with vending machine light and linoleum floor",
  "a laundromat at midnight with one dryer running and a TV on mute",
  "a construction site trailer at dawn, coffee cups and blueprints",
  "a motel room on the edge of a highway, neon sign bleeding through blinds",
  "a church basement with folding chairs and a single floor lamp",
  "a barbershop with vinyl chairs and a cracked mirror",
  "a corner store behind bulletproof glass in a quiet neighborhood",
  "a small-town library after hours, green desk lamps still on",
  "a farmhouse kitchen with a screen door that won't close properly",
  "a corner office tower at 2am with only the protagonist's desk lit",
  "a crowded street market with vendors packing up at dusk",
  "a riverbank under a highway overpass, graffiti on the concrete",
  "a desert road with a broken-down truck and a distant gas station",
  "a courthouse hallway with marble floors and echoing footsteps",
  "a cargo ship's engine room, industrial blues and clanging metal",
  "a radio station studio at 3am with red 'ON AIR' light glowing",
  "a classroom after school, sunlight slanting through Venetian blinds",
  "a suburban driveway at golden hour, sprinklers hissing softly",
  "a temple courtyard with incense smoke curling in still air",
  "a rooftop at twilight overlooking sodium-orange street lights",
  "a fishing pier in fog, ropes and tackle boxes scattered",
  "a rural roadside produce stand with hand-painted signs",
  "an urgent-care waiting room at 11pm with CNN on mute",
  "a corner of a coffee shop at closing time, chairs upside down on tables",
  "a university lecture hall being mopped after the last class"
];

const POV_MODES = [
  { name: "single_protagonist", desc: "One central character — we follow their journey start to finish." },
  { name: "observer_narrator", desc: "An unseen witness narrates events that happen to a different central character." },
  { name: "dual_character", desc: "Two characters whose arcs interweave — intercut between them." },
  { name: "ensemble_mosaic", desc: "3-5 characters whose separate moments build a collective picture." },
  { name: "second_person", desc: "Narrated as 'you' — the viewer IS the character." },
  { name: "epistolary", desc: "Told through fragments — letters, voicemails, diary entries, text messages." }
];

const SHOT_PROFILES = [
  { name: "verité_handheld",    desc: "70% medium/close, mostly handheld, intimate observational feel. Minimal wides. Eye-level mostly." },
  { name: "epic_scope",         desc: "60% wide/aerial/establishing, dwarf-the-character framing. Few close-ups. Low angles common." },
  { name: "claustrophobic",     desc: "50% close-ups and extreme close-ups. Frame-within-frame. Tight spaces. Off-center compositions." },
  { name: "observational",      desc: "Static eye-level + OTS dominant. Camera doesn't move much. Lets life happen in the frame." },
  { name: "kinetic_dynamic",    desc: "Heavy tracking, Dutch angles, push-ins. Camera is a character. No static shots." },
  { name: "balanced_classical", desc: "Traditional Hollywood coverage — wide / medium / close rotation. 30% wide, 40% medium, 30% close." }
];

function generateDiversitySeed(projectId, niche, topic) {
  const seedInt = hashStr(`${projectId}|${niche}|${topic}|${Date.now() % 100000}`);
  const rng = mulberry32(seedInt);
  const archetype = pickFromArr(rng, ARCHETYPES);
  const cultureKey = pickFromArr(rng, Object.keys(NAMES));
  const firstName = pickFromArr(rng, NAMES[cultureKey]);
  const setting = pickFromArr(rng, SETTINGS);
  const secondarySetting = pickFromArr(rng, SETTINGS.filter(s => s !== setting));
  const pov = pickFromArr(rng, POV_MODES);
  const shotProfile = pickFromArr(rng, SHOT_PROFILES);
  const genderHint =
    /\bher\b|\bshe\b|\bmother\b|\bwidow\b|\bgrandmother\b|\bwoman\b|\bfilipina\b/i.test(archetype) ? "female"
    : /\bhis\b|\bhe\b|\bfather\b|\bwidower\b|\bgrandfather\b|\bman\b|\bfisherman\b|\bsalesman\b|\bpastor\b|\bforeman\b|\btrucker\b|\bveteran\b/i.test(archetype) ? "male"
    : (rng() > 0.5 ? "male" : "female");
  return { seedInt, firstName, namingCulture: cultureKey, archetype, genderHint, primarySetting: setting, secondarySetting, povMode: pov, shotProfile };
}

function seedToPromptBlock(seed) {
  return `
**🎲 DIVERSITY SEED (HIGHEST PRIORITY — NON-NEGOTIABLE):**
Ground the ENTIRE story in this creative seed. Do NOT invent a different character. Do NOT default to a different setting. These override your instincts.

**PROTAGONIST:**
- Name: **${seed.firstName}** (${seed.namingCulture.replace(/_/g, ' ')} naming tradition — DO NOT rename to Sarah, Emma, John, or any other default)
- Archetype: ${seed.archetype}
- Gender: ${seed.genderHint} (use pronouns consistent with this)

**PRIMARY SETTING:** ${seed.primarySetting}
**SECONDARY SETTING (appears in 2-3 scenes):** ${seed.secondarySetting}

**POV MODE:** ${seed.povMode.name} — ${seed.povMode.desc}

**SHOT DISTRIBUTION PROFILE:** ${seed.shotProfile.name} — ${seed.shotProfile.desc}
(Override the default "50% wide" rule — follow THIS profile's shot distribution.)

**ABSOLUTE RULES:**
- Protagonist's name is "${seed.firstName}". Must appear exactly as given in character block and narration_text.
- The world must reflect the PRIMARY SETTING above. No falling back to generic "kitchen table with bills" or "coffee shop with laptop".
- Follow the POV mode — it dictates how the story is told.
- Follow the shot profile — it dictates visual rhythm.
`;
}

// ══════════════════════════════════════════════════════════════════
// 📐 NARRATIVE SHAPES — replaces hardcoded 3-act template
// ══════════════════════════════════════════════════════════════════
const SHAPES = {
  three_act: {
    name: "three_act",
    phases: [
      { name: "cold_open",      weight: 0.10, purpose: "Hook — visceral, immediate, intriguing." },
      { name: "rising_tension", weight: 0.25, purpose: "Build the world and problem — escalate stakes." },
      { name: "emotional_core", weight: 0.40, purpose: "Heart of the story — maximum emotional impact." },
      { name: "resolution",     weight: 0.25, purpose: "Deliver the payoff — resolution, transformation." }
    ],
    rhythm: "Classical Western structure. Clear conflict escalation. Cathartic release."
  },
  kishotenketsu: {
    name: "kishotenketsu",
    phases: [
      { name: "ki_introduction", weight: 0.22, purpose: "Ki (起) — introduce the world and protagonist calmly." },
      { name: "sho_development", weight: 0.28, purpose: "Shō (承) — develop the situation naturally, no conflict." },
      { name: "ten_twist",       weight: 0.28, purpose: "Ten (転) — unexpected element enters that re-frames everything." },
      { name: "ketsu_conclusion",weight: 0.22, purpose: "Ketsu (結) — reconcile the twist with the original scene." }
    ],
    rhythm: "Japanese 4-act. No villain or conflict needed. Tension from juxtaposition. Contemplative pacing."
  },
  hero_journey_compact: {
    name: "hero_journey_compact",
    phases: [
      { name: "ordinary_world",   weight: 0.12, purpose: "Establish the protagonist's normal." },
      { name: "call_and_refusal", weight: 0.13, purpose: "A disruption appears — they hesitate." },
      { name: "crossing",         weight: 0.15, purpose: "They commit and enter a new world." },
      { name: "trials",           weight: 0.30, purpose: "Tests, allies, enemies, escalating challenges." },
      { name: "ordeal_reward",    weight: 0.18, purpose: "The central crisis and the prize." },
      { name: "return_changed",   weight: 0.12, purpose: "Back to the ordinary world but transformed." }
    ],
    rhythm: "Campbellian monomyth compressed. 6 beats. Archetypal."
  },
  fireside_tale: {
    name: "fireside_tale",
    phases: [
      { name: "invitation",       weight: 0.15, purpose: "Pull the listener in — 'you won't believe what happened.'" },
      { name: "meandering_setup", weight: 0.35, purpose: "Anecdotal details, tangents, color. Atmosphere over plot." },
      { name: "the_turn",         weight: 0.25, purpose: "The moment the story actually happened." },
      { name: "reflection",       weight: 0.25, purpose: "What it meant — lingered-on, philosophical." }
    ],
    rhythm: "Oral tradition. Rambling, anecdotal, authority through detail not urgency."
  },
  case_study: {
    name: "case_study",
    phases: [
      { name: "the_aftermath",  weight: 0.15, purpose: "Start with the outcome — end state first." },
      { name: "the_setup",      weight: 0.20, purpose: "Rewind — who was this person before?" },
      { name: "the_decisions",  weight: 0.35, purpose: "Walk through the key choices chronologically." },
      { name: "the_mechanism",  weight: 0.15, purpose: "Explain WHY this worked / failed." },
      { name: "the_lesson",     weight: 0.15, purpose: "What can the viewer take from this." }
    ],
    rhythm: "Investigative / journalistic. Non-linear — start at the end."
  },
  contrast_pairs: {
    name: "contrast_pairs",
    phases: [
      { name: "side_a_intro", weight: 0.15, purpose: "Introduce Person/Path A." },
      { name: "side_b_intro", weight: 0.15, purpose: "Introduce Person/Path B — similar start." },
      { name: "divergence_1", weight: 0.20, purpose: "First divergence — intercut their choices." },
      { name: "divergence_2", weight: 0.25, purpose: "Consequences compound — intercut their paths." },
      { name: "outcomes",     weight: 0.15, purpose: "Where each ended up." },
      { name: "the_takeaway", weight: 0.10, purpose: "What separated them." }
    ],
    rhythm: "Dual-timeline. Constant intercutting. Pairing identical scene types with opposite outcomes."
  },
  tutorial_build: {
    name: "tutorial_build",
    phases: [
      { name: "the_promise", weight: 0.10, purpose: "What you'll learn / be able to do." },
      { name: "foundation",  weight: 0.20, purpose: "The prerequisite concept." },
      { name: "layer_1",     weight: 0.20, purpose: "First skill/idea built on the foundation." },
      { name: "layer_2",     weight: 0.20, purpose: "Second skill stacking on the first." },
      { name: "synthesis",   weight: 0.20, purpose: "Combining everything into one working example." },
      { name: "the_launch",  weight: 0.10, purpose: "Challenge the viewer to apply it." }
    ],
    rhythm: "Progressive revelation. Each scene builds on the last."
  },
  ensemble_mosaic: {
    name: "ensemble_mosaic",
    phases: [
      { name: "chorus_intro", weight: 0.15, purpose: "Introduce the shared world / event." },
      { name: "voice_one",    weight: 0.20, purpose: "First character's perspective / moment." },
      { name: "voice_two",    weight: 0.20, purpose: "Second character's perspective / moment." },
      { name: "voice_three",  weight: 0.20, purpose: "Third character's perspective / moment." },
      { name: "collision",    weight: 0.15, purpose: "Their lives briefly intersect." },
      { name: "chorus_close", weight: 0.10, purpose: "The shared world carries on." }
    ],
    rhythm: "Multiple protagonists. Each gets a self-contained vignette."
  }
};

const NICHE_SHAPE_BIAS = {
  finance:     ["case_study","contrast_pairs","tutorial_build","three_act"],
  retirement:  ["fireside_tale","case_study","three_act"],
  motivation:  ["hero_journey_compact","three_act","contrast_pairs"],
  horror:      ["three_act","kishotenketsu","fireside_tale"],
  technology:  ["tutorial_build","case_study","three_act"],
  health:      ["case_study","tutorial_build","three_act"],
  crime:       ["case_study","three_act","ensemble_mosaic"],
  history:     ["fireside_tale","hero_journey_compact","ensemble_mosaic"],
  education:   ["tutorial_build","case_study","three_act"],
  travel:      ["fireside_tale","kishotenketsu","ensemble_mosaic"],
  relationship:["kishotenketsu","contrast_pairs","fireside_tale"],
  general:     ["three_act","fireside_tale","kishotenketsu","case_study"]
};

function pickNarrativeShape(projectId, niche, topic, povMode) {
  if (povMode?.name === "ensemble_mosaic") return SHAPES.ensemble_mosaic;
  if (povMode?.name === "dual_character") return SHAPES.contrast_pairs;
  const pool = NICHE_SHAPE_BIAS[niche?.toLowerCase()] || NICHE_SHAPE_BIAS.general;
  const rng = mulberry32(hashStr(`shape|${projectId}|${niche}|${topic}|${Date.now() % 10000}`));
  const shapeName = pool[Math.floor(rng() * pool.length)];
  return SHAPES[shapeName] || SHAPES.three_act;
}

function shapeToPromptBlock(shape) {
  return `
**📐 NARRATIVE SHAPE: ${shape.name.toUpperCase()}**
Rhythm: ${shape.rhythm}

Phases (in order):
${shape.phases.map((p, i) => `  ${i + 1}. ${p.name} (${Math.round(p.weight * 100)}% of runtime) — ${p.purpose}`).join('\n')}

**CRITICAL:** Your story MUST follow this shape. Do not default to a different structure.
`;
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
// PHASE STRUCTURE
// ══════════════════════════════════════════════════════════════════

function calculatePhaseAllocation(totalTargetScenes, shape) {
  // Uses the picked narrative shape's phases instead of hardcoded 4-act
  const phaseWeights = shape?.phases || [
    { name: "cold_open",      weight: 0.10, purpose: "Hook — visceral, immediate, intriguing." },
    { name: "rising_tension", weight: 0.25, purpose: "Build the world and problem — escalate stakes." },
    { name: "emotional_core", weight: 0.40, purpose: "Heart of the story — maximum emotional impact." },
    { name: "resolution",     weight: 0.25, purpose: "Deliver the payoff — resolution, transformation." }
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
  beatDurationsSlice, nicheProfile, diversitySeedBlock, shapeBlock
}) {
  const durLine = beatDurationsSlice.length > 0
    ? `\n**DURATION TARGETS (seconds per scene):** [${beatDurationsSlice.map(d => d.toFixed(1)).join(', ')}]`
    : '';

  return `You are a world-class film director blocking out scenes for a visual narrative.
${styleDirective}
${diversitySeedBlock || ''}
${shapeBlock || ''}

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
1. **PLOT-DRIVEN SCENES (MOST IMPORTANT RULE):** Every scene must serve the STORY'S PLOT. Before creating any scene, ask: "What is happening in the STORY at this moment?" The visual must show THAT — the actual narrative event, situation, or consequence being described. If the narration says "You're leaving $1200 on the table every month" and the story is about side hustles, show someone at their kitchen table with bills and a laptop showing missed freelance opportunities — NOT an abstract metaphor of someone hanging from a building.
2. **STORY CONTEXT OVER SENTENCE LITERAL:** Each scene exists within the FULL story arc. A scene for "Rule #3: Automate your savings" in a finance story should show the CHARACTER performing that action in THEIR world (e.g., setting up auto-transfer on their phone at their desk) — not a generic savings concept. The CHARACTER, their ENVIRONMENT, and their JOURNEY inform every visual.
3. Scenes are VISUAL BEATS, not sentences. Change scene when the visual changes.
4. visual_concept: 2-4 sentences. Environment FIRST, then character ACTION, then atmosphere. The visual concept must clearly connect to what is HAPPENING in the plot at this moment.
5. **CINEMATIC SHOT DISTRIBUTION:** Follow the SHOT DISTRIBUTION PROFILE from the Diversity Seed (above). NEVER use the same shot type consecutively. Vary angles at least 30° between cuts.
6. ALWAYS name specific objects from the narration (cellphone, laptop, bill, receipt, etc.) as PROPS — "clutching her cellphone", "staring at the overdue bill". But NEVER describe what's ON the screen/paper — no text, UI, dollar amounts, app names.
7. **NO ABSTRACT METAPHORS.** Do NOT create symbolic or metaphorical visuals. If the narration talks about "leaving money on the table," show the CHARACTER in their actual life situation where they're missing that opportunity — NOT a surreal image of floating money or someone dangling from a building. Every visual must be a PLAUSIBLE SCENE from the character's life that illustrates the narrative point.
8. **POPULATED WORLD:** Most scenes should include MULTIPLE PEOPLE — passersby, crowds, coworkers, family members, bystanders. The world feels alive and busy.
9. **CHARACTER PRESENCE RULE:** Only include human characters when the narration implies or requires them. If the narration describes a pure environment — render it as environment. But when the narration describes a situation, action, or consequence — the CHARACTER should be IN that situation.
10. **SCENE FLOW & CONTINUITY:** Adjacent scenes MUST share visual elements. Use: shared color shifts, matched geometry, motion echo, environmental bridges, light continuity. The continuity_bridge field MUST describe which visual thread connects this scene to the next.
11. IMMERSION — every scene must include at least 2 of: (a) foreground element, (b) sensory texture, (c) character micro-action, (d) background storytelling detail, (e) specific time-of-day lighting, (f) scale contrast.
12. **TONE SAFETY:** NEVER create visuals that could be misread as violence, self-harm, suicide, or danger — especially when the story tone is about opportunity, education, or motivation. A finance video about saving money must NEVER show imagery that looks like someone falling, hanging, drowning, or in peril.
13. NICHE SENSIBILITY: ${nicheProfile.visual_world} | ${nicheProfile.emotional_palette}

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
      "duration_seconds": 5,
      "characters_present": ["Name1"]
    }
  ]
}

**CHARACTER PRESENCE TAGGING (CRITICAL):**
For each scene, list the characters_present — the names of characters who VISUALLY APPEAR in this scene.
- Only include characters who would be SEEN on screen. Narrated references alone don't count.
- If a scene is a pure environment/landscape/concept shot with NO people, use an empty array [].
- Use the EXACT character names from the CHARACTER block above.
- This field is used by the image generator to know which character DNA to inject.

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

    // ═══ 🎲 DIVERSITY SEED + 📐 NARRATIVE SHAPE ═══
    // Generated once per project (at batch 0), saved to ProductionSettings for resume batches.
    let diversitySeed, narrativeShape;
    if (startBatch === 0) {
      diversitySeed = generateDiversitySeed(project_id, niche, project.name || '');
      narrativeShape = pickNarrativeShape(project_id, niche, project.name || '', diversitySeed.povMode);
      console.log(`🎲 Diversity seed: ${diversitySeed.firstName} (${diversitySeed.namingCulture}) | ${diversitySeed.povMode.name} | Shots: ${diversitySeed.shotProfile.name}`);
      console.log(`📐 Narrative shape: ${narrativeShape.name} (${narrativeShape.phases.length} phases)`);
    } else {
      // Load seed+shape from ProductionSettings on resume batches
      const psListForSeed = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
      const psRow = psListForSeed[0];
      try {
        diversitySeed = psRow?.story_analysis ? (JSON.parse(psRow.story_analysis)._diversity_seed || null) : null;
        narrativeShape = psRow?.story_analysis ? (JSON.parse(psRow.story_analysis)._narrative_shape || null) : null;
      } catch (_) {}
      if (!diversitySeed) {
        diversitySeed = generateDiversitySeed(project_id, niche, project.name || '');
        narrativeShape = pickNarrativeShape(project_id, niche, project.name || '', diversitySeed.povMode);
      }
    }
    const diversitySeedBlock = seedToPromptBlock(diversitySeed);
    const shapeBlock = shapeToPromptBlock(narrativeShape);

    const phases = calculatePhaseAllocation(totalTargetScenes, narrativeShape);
    const scriptChunks = splitScriptByPhase(finalScript, phases);
    const numBatches = scriptChunks.length;
    const nicheProfile = getNicheDirectorProfile(niche);

    console.log(`🎯 ${durationMinutes}min → ${totalTargetScenes} scenes (avg ${avgSceneDuration.toFixed(1)}s) | ${numBatches} phases [${narrativeShape.name}] | Style: ${visualStyle || 'default'}`);

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

      // ── Story Analysis (Claude-powered, with diversity seed + shape) ──
      const analysisPrompt = `You are a world-class film director. Study this script and respond with JSON.
${styleDirective}
${diversitySeedBlock}
${shapeBlock}

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

      console.log(`🎬 Story analysis (Claude)...`);
      const analysis = await callClaude(analysisPrompt, 0.9, 8000);
      storyAnalysis = analysis.story_analysis || analysis;

      // ── Beat durations ──
      beatDurations = calculateBeatDurations(phases, durationMinutes, isSleep);
      beatStartTimes = calculateStartTimes(beatDurations);

      console.log(`📊 Beats: ${beatDurations.length} scenes | Range: ${Math.min(...beatDurations).toFixed(1)}s – ${Math.max(...beatDurations).toFixed(1)}s | Total: ${beatDurations.reduce((a,b)=>a+b,0).toFixed(1)}s`);

      // ── Save story analysis + beats + seed/shape to ProductionSettings ──
      const saForSave = { ...storyAnalysis };
      delete saForSave.characters; // saved separately on Project
      // Embed the seed+shape inside story_analysis so resume batches can read them
      saForSave._diversity_seed = diversitySeed;
      saForSave._narrative_shape = narrativeShape;
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
          diversitySeedBlock,
          shapeBlock
        });

        const subLabel = subBatches.length > 1 ? ` (sub ${si+1}/${subBatches.length})` : '';
        console.log(`🎬 Phase ${batchIdx+1}/${numBatches}: ${currentChunk.phase} — scenes ${sub.offset+1}-${sub.offset+sub.count}${subLabel} [${subText.split(/\s+/).length} words]`);

        let result;
        try {
          result = await callClaude(prompt, 0.9, 14000);
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
                diversitySeedBlock,
                shapeBlock
              });
              result = await callClaude(halfPrompt, 0.9, 14000);
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