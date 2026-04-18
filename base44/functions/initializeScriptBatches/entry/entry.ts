import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// initializeScriptBatches v5 — Claude-powered with diversity seed +
// narrative shape. Replaces OpenAI gpt-4o. Outline is now grounded in
// a project-specific creative seed so every script feels distinct.
// ══════════════════════════════════════════════════════════════════

async function callClaude(prompt, temperature = 0.85, maxTokens = 8000) {
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
    throw new Error(`Claude ${response.status}: ${err.substring(0, 300)}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '';
  let clean = rawText.trim();
  if (clean.startsWith('```json')) clean = clean.substring(7);
  else if (clean.startsWith('```')) clean = clean.substring(3);
  if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
  clean = clean.trim();

  try { return JSON.parse(clean); } catch (_) {}
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(clean.substring(firstBrace, lastBrace + 1)); } catch (_) {}
  }
  throw new Error("Failed to parse Claude JSON");
}

// ══════════════════════════════════════════════════════════════════
// 🎲 DIVERSITY SEED
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
  "retired factory worker in his late 60s, widowed",
  "single father in his 40s driving rideshare at night",
  "middle-aged nurse pulling double shifts",
  "young teacher at an underfunded public school",
  "grandmother in her 70s raising her grandchildren",
  "teenage high-school student working weekends at a gas station",
  "college freshman navigating her first year far from home",
  "man in his 50s recently laid off from a 25-year corporate job",
  "woman in her mid-30s rebuilding after a long relationship ended",
  "first-generation immigrant shopkeeper running a bodega",
  "Nigerian software engineer who moved to a new city six months ago",
  "Korean-American mechanic who took over his father's auto shop",
  "Mexican-American chef opening her first restaurant",
  "Indian graduate student doing her PhD on a tight budget",
  "Filipina caregiver working 12-hour shifts to send money home",
  "Ethiopian taxi driver who used to be a doctor back home",
  "Vietnamese nail salon owner who arrived 20 years ago",
  "long-haul trucker in her mid-40s crossing the country weekly",
  "tattoo artist whose studio just opened in a gentrifying neighborhood",
  "farmer in his 60s facing a bad harvest season",
  "freelance graphic designer chasing unpaid invoices",
  "small-town pastor struggling to keep his congregation together",
  "city bus driver who's seen the same route for 18 years",
  "firefighter recovering from a bad call last month",
  "former college athlete working retail after an injury",
  "hairdresser who knows every secret in her small town",
  "veteran running a small landscaping business",
  "widow in her 80s still running her late husband's bookstore",
  "social worker stretched thin across 40 cases",
  "freelance journalist chasing a story no one else will touch"
];
const NAMES = {
  west_african: ["Adaeze","Chike","Obi","Amara","Kwame","Nneka","Emeka","Ayo"],
  east_asian: ["Hiroshi","Mei-Lin","Jun","Sora","Kenji","Xiuying","Takeshi","Yuna"],
  south_asian: ["Priya","Arjun","Kavita","Raj","Deepika","Vikram","Farhan","Zara"],
  latin: ["Mateo","Sofía","Diego","Camila","Luis","Valeria","Javier","Isabela"],
  arabic: ["Omar","Layla","Khaled","Yasmin","Tariq","Noor","Hassan","Amina"],
  eastern_european: ["Dmitri","Katya","Marek","Agnieszka","Stefan","Ana","Ivan","Olena"],
  anglo: ["Walter","Margaret","Harold","Beatrice","Samuel","Josephine","Arthur","Eleanor"],
  african_american: ["Darnell","Keisha","Malik","Tanya","Jerome","Shanice","Marcus","Aaliyah"],
  mixed_modern: ["Quinn","Rowan","Asha","Kai","Sage","Zion","River","Nia"]
};
const VOICE_REGISTERS = [
  { name: "investigative",  desc: "Journalistic, methodical, citing evidence, skeptical but fair." },
  { name: "fireside",       desc: "Warm storyteller, anecdotal, meandering details, conversational." },
  { name: "professorial",   desc: "Authoritative, expository, confident teacher unpacking complexity." },
  { name: "confessional",   desc: "Personal, vulnerable, first-person inflection, emotionally close." },
  { name: "deadpan",        desc: "Dry, understated, ironic — humor through restraint, never raising voice." },
  { name: "urgent_present", desc: "Present-tense, immediate, breath-quickening — makes the listener lean in." }
];
const RHETORICAL_SCHEMES = [
  { name: "triadic",     desc: "Power of three. Group ideas in threes. Rule of three in examples, warnings, and payoffs." },
  { name: "anaphora",    desc: "Repetition of the opening words of clauses. 'They were tired. They were broke. They were done.'" },
  { name: "contrast",    desc: "Juxtaposition. Constant then/now, before/after, them/us framing." },
  { name: "cumulative",  desc: "Short sentences that stack, building momentum. Each adds weight. Each tightens the spring." },
  { name: "epistrophe",  desc: "Repetition at end of clauses. 'No choice. No warning. No way out.'" }
];

const SHAPES = {
  three_act: {
    name: "three_act",
    rhythm: "Classical Western structure — setup, confrontation, resolution. Clear escalation + catharsis.",
    phases: [
      { name: "cold_open",      weight: 0.10, purpose: "Visceral hook — immediate, specific, intriguing." },
      { name: "rising_tension", weight: 0.25, purpose: "Build the world and the problem. Escalate stakes." },
      { name: "emotional_core", weight: 0.40, purpose: "Heart of the story — maximum impact, deepest complexity." },
      { name: "resolution",     weight: 0.25, purpose: "Deliver the payoff — resolution, transformation, lingering insight." }
    ]
  },
  kishotenketsu: {
    name: "kishotenketsu",
    rhythm: "Japanese 4-act. No villain needed — tension comes from juxtaposition. Contemplative pacing.",
    phases: [
      { name: "ki_introduction", weight: 0.22, purpose: "Introduce calmly — establish the scene." },
      { name: "sho_development", weight: 0.28, purpose: "Develop naturally — no conflict yet." },
      { name: "ten_twist",       weight: 0.28, purpose: "Unexpected element reframes everything." },
      { name: "ketsu_conclusion",weight: 0.22, purpose: "Reconcile twist with original — new understanding." }
    ]
  },
  hero_journey_compact: {
    name: "hero_journey_compact",
    rhythm: "Campbellian monomyth compressed into 6 beats. Archetypal transformation.",
    phases: [
      { name: "ordinary_world",   weight: 0.12, purpose: "Establish protagonist's normal." },
      { name: "call_and_refusal", weight: 0.13, purpose: "Disruption appears — they hesitate." },
      { name: "crossing",         weight: 0.15, purpose: "They commit, enter a new world." },
      { name: "trials",           weight: 0.30, purpose: "Tests, allies, enemies, challenges." },
      { name: "ordeal_reward",    weight: 0.18, purpose: "Central crisis and the prize." },
      { name: "return_changed",   weight: 0.12, purpose: "Back home but transformed." }
    ]
  },
  fireside_tale: {
    name: "fireside_tale",
    rhythm: "Oral tradition — rambling, anecdotal, authority through detail not urgency.",
    phases: [
      { name: "invitation",       weight: 0.15, purpose: "Pull the listener in — 'you won't believe what happened.'" },
      { name: "meandering_setup", weight: 0.35, purpose: "Anecdotal details, tangents, atmosphere over plot." },
      { name: "the_turn",         weight: 0.25, purpose: "The moment the story actually happened." },
      { name: "reflection",       weight: 0.25, purpose: "What it meant — lingered-on, philosophical." }
    ]
  },
  case_study: {
    name: "case_study",
    rhythm: "Investigative / journalistic. Non-linear — start at the end, then walk back.",
    phases: [
      { name: "the_aftermath",  weight: 0.15, purpose: "Start with the outcome." },
      { name: "the_setup",      weight: 0.20, purpose: "Rewind — who was this before?" },
      { name: "the_decisions",  weight: 0.35, purpose: "Walk through key choices chronologically." },
      { name: "the_mechanism",  weight: 0.15, purpose: "Explain WHY it worked / failed." },
      { name: "the_lesson",     weight: 0.15, purpose: "What the viewer can take from this." }
    ]
  },
  contrast_pairs: {
    name: "contrast_pairs",
    rhythm: "Dual-timeline. Constant intercutting. Pair identical scene-types with opposite outcomes.",
    phases: [
      { name: "side_a_intro", weight: 0.15, purpose: "Introduce Person/Path A." },
      { name: "side_b_intro", weight: 0.15, purpose: "Introduce Person/Path B — similar start." },
      { name: "divergence_1", weight: 0.20, purpose: "First divergence — intercut choices." },
      { name: "divergence_2", weight: 0.25, purpose: "Consequences compound — intercut paths." },
      { name: "outcomes",     weight: 0.15, purpose: "Where each ended up." },
      { name: "takeaway",     weight: 0.10, purpose: "What separated them." }
    ]
  },
  tutorial_build: {
    name: "tutorial_build",
    rhythm: "Progressive revelation — each scene stacks on the last.",
    phases: [
      { name: "the_promise", weight: 0.10, purpose: "What you'll learn / be able to do." },
      { name: "foundation",  weight: 0.20, purpose: "The prerequisite concept." },
      { name: "layer_1",     weight: 0.20, purpose: "First skill built on foundation." },
      { name: "layer_2",     weight: 0.20, purpose: "Second skill stacking on first." },
      { name: "synthesis",   weight: 0.20, purpose: "Combining into one working example." },
      { name: "launch",      weight: 0.10, purpose: "Challenge the viewer to apply it." }
    ]
  },
  ensemble_mosaic: {
    name: "ensemble_mosaic",
    rhythm: "Multiple protagonists — each gets a self-contained vignette.",
    phases: [
      { name: "chorus_intro", weight: 0.15, purpose: "Introduce shared world / event." },
      { name: "voice_one",    weight: 0.20, purpose: "First character's perspective." },
      { name: "voice_two",    weight: 0.20, purpose: "Second character's perspective." },
      { name: "voice_three",  weight: 0.20, purpose: "Third character's perspective." },
      { name: "collision",    weight: 0.15, purpose: "Their lives briefly intersect." },
      { name: "chorus_close", weight: 0.10, purpose: "The shared world carries on." }
    ]
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
  true_crime:  ["case_study","three_act","ensemble_mosaic"],
  history:     ["fireside_tale","hero_journey_compact","ensemble_mosaic"],
  education:   ["tutorial_build","case_study","three_act"],
  travel:      ["fireside_tale","kishotenketsu","ensemble_mosaic"],
  relationship:["kishotenketsu","contrast_pairs","fireside_tale"],
  general:     ["three_act","fireside_tale","kishotenketsu","case_study"]
};

function generateScriptSeed(projectId, niche, topic) {
  const seedInt = hashStr(`${projectId}|${niche}|${topic}|${Date.now() % 100000}`);
  const rng = mulberry32(seedInt);
  const archetype = pickFromArr(rng, ARCHETYPES);
  const cultureKey = pickFromArr(rng, Object.keys(NAMES));
  const firstName = pickFromArr(rng, NAMES[cultureKey]);
  const voiceRegister = pickFromArr(rng, VOICE_REGISTERS);
  const rhetoricalScheme = pickFromArr(rng, RHETORICAL_SCHEMES);

  const nicheLower = (niche || 'general').toLowerCase();
  const pool = NICHE_SHAPE_BIAS[nicheLower] || NICHE_SHAPE_BIAS.general;
  const shapeName = pool[Math.floor(rng() * pool.length)];
  const shape = SHAPES[shapeName];

  return { seedInt, firstName, namingCulture: cultureKey, archetype, voiceRegister, rhetoricalScheme, shape };
}

function seedToPromptBlock(seed) {
  return `
**🎲 PROJECT DIVERSITY SEED (NON-NEGOTIABLE):**
This is the creative DNA for this specific script. Do NOT default to generic protagonists or settings.
- Optional central character name (if the topic calls for one): **${seed.firstName}** (${seed.namingCulture.replace(/_/g, ' ')} tradition — NEVER default to Sarah/John/Emma/Mike)
- Archetype context: ${seed.archetype}
- Narrator voice register: **${seed.voiceRegister.name}** — ${seed.voiceRegister.desc}
- Rhetorical scheme quota: **${seed.rhetoricalScheme.name}** — ${seed.rhetoricalScheme.desc}

**📐 NARRATIVE SHAPE: ${seed.shape.name.toUpperCase()}**
Rhythm: ${seed.shape.rhythm}

Phases (in order, with weight % of total runtime):
${seed.shape.phases.map((p, i) => `  ${i + 1}. ${p.name} (${Math.round(p.weight * 100)}%) — ${p.purpose}`).join('\n')}

**CRITICAL:** Your outline MUST follow this shape. Do NOT collapse into a default 3-act structure. Do NOT rename phases. Use exactly these phase names as batch story_segments.
`;
}

// ══════════════════════════════════════════════════════════════════
// Duration estimator — kills crude 150 wpm with real punctuation math
// ══════════════════════════════════════════════════════════════════
function estimateSecondsForWords(wordCount, niche) {
  // Baseline 150 wpm for standard, 100 wpm for sleep (slower delivery)
  const isSleepy = /sleep|meditation|asmr|bedtime/i.test(niche || '');
  const wpm = isSleepy ? 110 : 155;
  return Math.round((wordCount / wpm) * 60);
}

function wordsForDurationMinutes(durationMinutes, niche) {
  const isSleepy = /sleep|meditation|asmr|bedtime/i.test(niche || '');
  const wpm = isSleepy ? 110 : 155;
  return Math.round(durationMinutes * wpm);
}

// ═══════════════════════════════════════════════════════════════════
// Detect sleep script mode from channel or project (v2)
// ═══════════════════════════════════════════════════════════════════
function detectScriptMode(channel, project) {
  // Explicit mode from channel
  if (channel?.script_mode && channel.script_mode !== 'standard') {
    return channel.script_mode;
  }
  // Auto-detect from niche keywords
  const niche = (channel?.niche || project?.niche || '').toLowerCase();
  const name = (channel?.name || '').toLowerCase();
  const combined = `${niche} ${name}`;
  if (/sleep\s*stor/i.test(combined) || /bedtime\s*stor/i.test(combined)) {
    return 'sleep_story';
  }
  if (/sleep|meditation|relax|calm|sooth|asmr|bedtime/i.test(combined)) {
    return 'sleep_meditation';
  }
  return 'standard';
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP OUTLINE PROMPT — generates sections instead of TVF phases
// ═══════════════════════════════════════════════════════════════════
function buildSleepOutlinePrompt({ scriptMode, topic, project, channel, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock }) {
  const isMeditation = scriptMode === 'sleep_meditation';
  const contentType = isMeditation ? 'motivational meditation' : 'sleep story';

  const sectionTemplates = isMeditation
    ? [
        'Opening & Welcome (settle, breathe, body awareness)',
        'You Are Enough (self-worth affirmations with ocean imagery)',
        'You Deserve Rest (permission to stop, release guilt, mountain metaphors)',
        'Let Go of Today (release worries, river carrying them away)',
        'You Are Safe Here (safety, warmth, protection, starlight imagery)',
        'Your Journey Matters (progress, self-compassion, tree growth metaphor)',
        'You Belong (acceptance, connection, forest community)',
        'Tomorrow Holds Promise (gentle hope, sunrise imagery)',
        'Your Body Knows (trust body wisdom, release control, breathing focus)',
        'Deep Rest (minimal words, long pauses, pure relaxation)',
        'Closing & Fade (brief gentle goodbye, silence)',
      ]
    : [
        'Opening & Welcome (settle, breathe, story world intro)',
        'Scene 1 — Setting the Atmosphere (rich sensory environment)',
        'Scene 2 — Gentle Activity (detailed peaceful process)',
        'Scene 3 — Observation & Reflection (contentment, presence)',
        'Scene 4 — New Setting (seamless transition, fresh sensory details)',
        'Scene 5 — Deeper Calm (slower pace, deeper relaxation)',
        'Scene 6 — Nature & Stillness (natural world, timelessness)',
        'Scene 7 — Evening Settling (winding down, warmth)',
        'Scene 8 — Deep Rest (minimal narrative, ambient atmosphere)',
        'Closing & Fade (character settles, gentle goodbye)',
      ];

  return `You are an expert sleep audio script planner. You plan ${contentType} scripts that ARE the soothing content — not scripts that talk ABOUT meditation or sleep.

**CRITICAL RULE**: Every section synopsis must describe WHAT THE NARRATOR WILL SAY — the actual soothing words, affirmations, imagery, and guided relaxation. Synopses must NEVER include:
❌ Explaining what ASMR is or how it works
❌ Discussing neuroscience, dopamine, oxytocin, or "studies"
❌ Giving practical sleep tips or advice
❌ Educational content about meditation or relaxation techniques
❌ Referencing YouTube, channels, videos, or content creation
❌ Personal anecdotes or first-person stories about discovering meditation
❌ Any meta-commentary ("in this section we will...")

**CONTENT TYPE**: ${isMeditation ? 'Motivational Meditation — the narrator speaks directly to the listener with gentle affirmations, nature imagery, and soothing repetition. Think Jason Stephenson, Michael Sealey.' : 'Sleep Story — the narrator tells a peaceful story with rich sensory details, calm settings, and gentle activities. Think Calm app, Headspace sleepcasts.'}

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'Sleep'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${selectedHook ? `- Opening Hook: "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**SLEEP CONTENT PRINCIPLES**:
- Extremely gentle and soothing tone throughout
- Deliberately monotonous (boring is GOOD for sleep)
- Strategic repetition — each key concept repeated 4-6 times in different words
- NO excitement, urgency, drama, tension, or surprises
- Include [PAUSE X SEC] markers in synopses
- Simple vocabulary, short sentences (8-18 words ideal)
- Progressive deepening: physical relaxation → mental calm → emotional peace → deep rest
- Nature metaphors throughout: ocean, mountain, tree, river, moon, stars, forest
- Sensory grounding: touch, sound, sight, smell references

**SECTION TEMPLATE IDEAS** (adapt to fit ${numBatches} batches):
${sectionTemplates.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

**YOUR TASK**: Plan exactly ${numBatches} batches for a ${durationMinutes}-minute ${contentType}.

${isMeditation ? `Each section should contain ONLY:
- Gentle theme introduction through imagery (NOT by defining or explaining the concept)
- Core affirmation stated simply, then repeated 3-5 times in different phrasings
- Nature imagery and sensory details that reinforce the affirmation
- Body awareness cues (breath, weight, warmth)
- [BREATHE] and [PAUSE] markers
- Gentle bridge to next theme

Example good synopsis: "The narrator gently speaks: 'You are enough... just as you are... you are enough.' [PAUSE 5 SEC] Then weaves ocean imagery — waves rolling in, each one whispering 'enough.' The listener's breath matches the tide. [BREATHE] 'With every breath... you sink deeper into knowing... you have always been enough.' Repeat the affirmation with mountain imagery — solid, unmovable, complete. [PAUSE 3 SEC] Return to body: weight of blankets, warmth, safety."

Example BAD synopsis: "This section explains the science behind self-worth affirmations and discusses how ASMR triggers help the brain release dopamine. The narrator shares a personal story about discovering meditation."` :
`Each scene section should contain ONLY:
- Rich sensory atmosphere (what the character sees, hears, smells, feels)
- A peaceful activity described in loving, slow detail
- The character's quiet contentment and simple observations
- Seamless transition to the next scene`}

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words)",
      "section_type": "${isMeditation ? 'opening|affirmation|grounding|deepening|closing' : 'opening|scene|deepening|closing'}",
      "focus_area": "Brief focus (1 sentence)",
      "synopsis": "EXTREMELY DETAILED synopsis (200-300 words) describing the ACTUAL soothing content the narrator will speak. Include: specific affirmation phrases in quotes, nature imagery to use, sensory details, [PAUSE] and [BREATHE] placement, how the section deepens relaxation."
    }
  ]
}

**RULES:**
- Generate exactly ${numBatches} batches
- First batch MUST be Opening & Welcome (physical settling, breathing, ease into theme)
- Last batch should be the gentlest, most minimal content — mostly pauses and silence
- Progressive deepening: each batch calmer and slower than the last
- Synopses must describe the ACTUAL words and imagery, not explain concepts
- Include specific affirmation phrases IN QUOTES in synopses
- Include specific [PAUSE X SEC] markers in synopses
- Every synopsis: 200-300 words of SPECIFIC soothing content detail
- NO educational content, NO science, NO advice, NO meta-commentary
- Content gets progressively more repetitive and slower as it goes`;
}

// ═══════════════════════════════════════════════════════════════════
// STANDARD TVF OUTLINE PROMPT (existing logic)
// ═══════════════════════════════════════════════════════════════════
function buildStandardOutlinePrompt({ topic, project, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock, seedBlock, seed }) {
  const TVF_PHASES = [
    { phase: 'HOOK', purpose: 'Open with a powerful attention trigger — shocking statement, contrarian truth, bold question, dramatic result, or hidden secret.' },
    { phase: 'RELATABLE SITUATION', purpose: 'Describe a moment the audience recognizes from real life — a mistake, frustration, confusing situation, or hidden problem.' },
    { phase: 'TENSION / CURIOSITY GAP', purpose: 'Reveal that something is misunderstood or hidden. Use "But here is what nobody tells you..." patterns.' },
    { phase: 'INSIGHT / REFRAME', purpose: 'Introduce the key concept or realization. Explain WHY the problem exists. The "aha moment".' },
    { phase: 'PRACTICAL BREAKDOWN', purpose: 'Provide actionable steps, strategies, or lessons. Deliver concrete value the viewer can use immediately.' },
    { phase: 'TRANSFORMATION', purpose: 'Paint the outcome if the viewer applies the idea. Show the change arc: problem → solution → improvement.' },
    { phase: 'POWER CLOSE', purpose: 'Deliver a memorable insight, warning, or perspective shift. The line viewers screenshot and share.' },
    { phase: 'CTA', purpose: 'Encourage the audience to continue engaging. Make it feel like a natural extension of the story.' },
  ];

  const formatFlavors = {
    'Big Lie': 'Frame the HOOK around a widely-believed lie. The TENSION reveals cracks. The INSIGHT exposes the truth.',
    'Zero to Hero': 'Frame the HOOK around the lowest point. The INSIGHT is the catalyst moment. The TRANSFORMATION is the triumphant rise.',
    'Timeline': 'Frame the HOOK around a pivotal historical moment. Progress chronologically. The INSIGHT is the turning point.',
    'Mystery': 'Frame the HOOK as an unsolved puzzle. The TENSION builds through clues. The INSIGHT is the revelation.',
    'default': 'Use the standard TVF flow. Adapt tone to the niche. Focus on maximum curiosity and retention throughout.',
  };

  const formatFlavor = formatFlavors[project.storytelling_format] || formatFlavors['default'];
  const phasesText = TVF_PHASES.map((p, i) => `  ${i + 1}. ${p.phase}: ${p.purpose}`).join('\n');

  // Use diversity seed's narrative shape if present, otherwise fall back to TVF
  const useShape = !!seed?.shape;
  const shapePhasesText = useShape
    ? seed.shape.phases.map((p, i) => `  ${i + 1}. ${p.name.toUpperCase()}: ${p.purpose}`).join('\n')
    : phasesText;

  return `You are an elite YouTube scriptwriter and narrative director.
${seedBlock || ''}

**PRIMARY NARRATIVE STRUCTURE** (follow EXACTLY — use these as story_segment names):
${shapePhasesText}

${useShape ? '' : `**STORYTELLING FLAVOR**: ${formatFlavor}\n`}${strategyBlock}
**PROJECT**:
- Topic: ${topic?.title || project.name}
- Topic Description: ${topic?.description || 'No description available'}
- Niche: ${project.niche || 'General'}
- Tone: ${project.tone || 'dramatic'}
- Storytelling Format: ${project.storytelling_format || 'Documentary'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${selectedHook ? `- Opening Hook (MUST USE): "${selectedHook.hook_text}"` : ''}

**YOUR TASK**: Map the 8 TVF phases across exactly ${numBatches} batches.

${numBatches <= 3 ? `With ${numBatches} batches, combine multiple phases per batch.` :
numBatches <= 6 ? `With ${numBatches} batches, spread phases across batches. Some may cover 1-2 phases.` :
`With ${numBatches} batches, dedicate full batches to meatiest phases while combining shorter ones.`}

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words)",
      "tvf_phases": ["HOOK", "RELATABLE SITUATION"],
      "focus_area": "Brief focus description (1 sentence)",
      "synopsis": "EXTREMELY DETAILED synopsis (150-250 words). Must cover: exact narrative beats, specific facts/events/anecdotes, emotional triggers, curiosity gaps, pacing rhythm, scroll-stopping moments, how it opens and ends with a cliffhanger."
    }
  ]
}

**RULES:**
- Generate exactly ${numBatches} batches
- ALL 8 TVF phases must be covered — no phase skipped
${selectedHook ? `- Batch 1 MUST open with this hook: "${selectedHook.hook_text}"` : '- Batch 1 MUST open with the most powerful attention trigger possible'}
- Each synopsis: 150-250 words of SPECIFIC detail
- Every batch must contain at least ONE curiosity gap
- Ensure narrative continuity — each batch ends with a hook into the next
- No filler, no generic buzzwords, no "in today's video"`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    // Get project
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get topic
    const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
    const topic = topics[0];

    // Get selected hook if any (skip for sleep projects — they don't use hooks)
    let selectedHook = null;
    const isSleepProject = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    if (!isSleepProject && project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0];
    }

    // Get channel
    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

    // Get channel script strategy
    let scriptStrategy = '';
    if (project.script_strategy_override) {
      scriptStrategy = project.script_strategy_override;
    } else if (channel?.script_strategy) {
      scriptStrategy = channel.script_strategy;
    }

    let strategyBlock = '';
    if (scriptStrategy) {
      try {
        const strat = typeof scriptStrategy === 'string' ? JSON.parse(scriptStrategy) : scriptStrategy;
        strategyBlock = `\n**NICHE-SPECIFIC SCRIPT STRATEGY** (follow this closely):
- Hook Formula: ${strat.hook_formula || 'N/A'}
- Structure: ${Array.isArray(strat.structure) ? strat.structure.join(' → ') : (strat.structure || 'N/A')}
- Tone: ${strat.tone || 'N/A'}
- Pacing: ${strat.pacing || 'N/A'}
- Retention Tricks: ${strat.retention_tricks || strat.retention || 'N/A'}
- CTA Style: ${strat.cta_style || strat.cta || 'N/A'}\n`;
      } catch (_) {
        strategyBlock = `\n**NICHE STRATEGY NOTES**: ${scriptStrategy}\n`;
      }
    }

    // Delete existing batches
    const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const batch of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
    }

    // ── DETECT SCRIPT MODE ──
    const scriptMode = detectScriptMode(channel, project);
    const isSleepMode = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';

    console.log(`[initializeScriptBatches] Script mode: ${scriptMode} (channel: ${channel?.name || 'none'})`);

    // ── CALCULATE DURATION-AWARE BATCH COUNT ──
    const durationMinutes = project.video_duration_minutes || 10;
    const totalTargetWords = wordsForDurationMinutes(durationMinutes, project.niche);
    // Sleep scripts use smaller batches for granularity, standard ~800 words
    const WORDS_PER_BATCH = isSleepMode ? 1100 : 800;
    const numBatches = Math.max(2, Math.ceil(totalTargetWords / WORDS_PER_BATCH));

    const batchTargets = [];
    let wordsRemaining = totalTargetWords;
    for (let i = 0; i < numBatches; i++) {
      if (i === numBatches - 1) {
        batchTargets.push(wordsRemaining);
      } else {
        batchTargets.push(WORDS_PER_BATCH);
        wordsRemaining -= WORDS_PER_BATCH;
      }
    }

    // ── 🎲 GENERATE DIVERSITY SEED (skip for sleep — different tonal needs) ──
    let seed = null;
    let seedBlock = '';
    if (!isSleepMode) {
      seed = generateScriptSeed(project_id, project.niche, topic?.title || project.name);
      seedBlock = seedToPromptBlock(seed);
      console.log(`🎲 Script seed: ${seed.firstName} (${seed.namingCulture}) | Voice: ${seed.voiceRegister.name} | Shape: ${seed.shape.name} | Scheme: ${seed.rhetoricalScheme.name}`);
    }

    console.log(`Project: ${durationMinutes} min → ${totalTargetWords} words → ${numBatches} batches (${scriptMode})`);

    // ── BUILD OUTLINE PROMPT ──
    const promptArgs = { topic, project, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock, seedBlock, seed };
    const outlinePrompt = isSleepMode
      ? buildSleepOutlinePrompt({ ...promptArgs, scriptMode, channel })
      : buildStandardOutlinePrompt(promptArgs);

    console.log("Generating outline with Claude...");
    const outlineResult = await callClaude(outlinePrompt, isSleepMode ? 0.65 : 0.9, 6000);

    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error("AI failed to generate outline batches");
    }

    // ── CREATE BATCH RECORDS ──
    const createdBatches = [];
    for (let i = 0; i < numBatches; i++) {
      const aiBatch = outlineResult.batches[i];
      const fallbackSegment = `Part ${i + 1}`;

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: aiBatch?.story_segment || fallbackSegment,
        focus_area: aiBatch?.focus_area || fallbackSegment,
        synopsis: aiBatch?.synopsis || `Write approximately ${batchTargets[i]} words for part ${i + 1}.`,
        target_words: batchTargets[i],
        status: 'pending'
      });
      createdBatches.push(batch);
    }

    // Update project status — also store the detected script_mode for downstream use.
    // Persist seed inside script_strategy_override (merged into existing strat) so
    // generateScriptBatches can read it on every batch call without re-randomizing.
    const projectPatch = {
      status: 'scripting',
      current_step: 3,
      project_mode: isSleepMode ? scriptMode : ''
    };
    if (seed) {
      // Embed seed into script_strategy_override under a reserved key
      let stratObj = {};
      try {
        if (project.script_strategy_override) {
          stratObj = typeof project.script_strategy_override === 'string'
            ? JSON.parse(project.script_strategy_override)
            : project.script_strategy_override;
        }
      } catch (_) {}
      stratObj._script_seed = seed;
      projectPatch.script_strategy_override = JSON.stringify(stratObj);
    }
    await base44.asServiceRole.entities.Projects.update(project_id, projectPatch);

    console.log(`Created ${createdBatches.length} batches with detailed outlines (${scriptMode})`);

    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      total_target_words: totalTargetWords,
      duration_minutes: durationMinutes,
      script_mode: scriptMode,
      batches: createdBatches
    });
  } catch (error) {
    console.error('Error initializing batches:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});