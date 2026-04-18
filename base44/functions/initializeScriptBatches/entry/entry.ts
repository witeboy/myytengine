import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import OpenAI from 'npm:openai@4.58.1';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

// ══════════════════════════════════════════════════════════════════
// DIVERSITY SEED — inlined (Base44 functions can't share modules)
// Source of truth for protagonist identity across the pipeline.
// ══════════════════════════════════════════════════════════════════
const SEED_NAMING_POOLS = {
  eastern_european: ['Katya','Dimitri','Anya','Mikhail','Nadia','Viktor','Elena','Yuri','Sasha','Irina'],
  west_african: ['Kwame','Amara','Tunde','Nneka','Kofi','Adaeze','Femi','Zainab','Chibuzo','Oluchi'],
  south_asian: ['Priya','Arjun','Divya','Rohan','Meera','Vikram','Ananya','Karan','Ishita','Raj'],
  east_asian: ['Mei','Jun','Hana','Ren','Yuki','Wei','Akira','Lin','Takeshi','Xiaolin'],
  latin_american: ['Mateo','Sofia','Diego','Camila','Ezequiel','Valentina','Rafael','Lucia','Joaquin','Isabela'],
  middle_eastern: ['Layla','Omar','Yasmin','Karim','Farah','Sami','Noor','Hassan','Zahra','Tariq'],
  anglo_american: ['Sarah','James','Emily','Michael','Rachel','David','Jessica','Daniel','Hannah','Benjamin'],
  celtic: ['Siobhan','Declan','Aoife','Cian','Niamh','Eamon','Saoirse','Finn','Caoimhe','Lorcan'],
  scandinavian: ['Astrid','Mikkel','Freja','Lars','Ingrid','Soren','Maja','Anders','Linnea','Bjorn'],
  mediterranean: ['Giulia','Matteo','Francesca','Alessandro','Chiara','Stefano','Elena','Luca','Sofia','Marco']
};
const SEED_ARCHETYPES = [
  { name: 'solo_hustler', desc: 'Self-employed, grinding, balancing ambition with burnout' },
  { name: 'single_parent', desc: 'Carrying a household alone, every dollar accounted for' },
  { name: 'immigrant_striver', desc: 'First-generation, carrying family expectations, building from nothing' },
  { name: 'recovering_failure', desc: 'Crashed once, rebuilding smarter, humility earned the hard way' },
  { name: 'quiet_professional', desc: 'Senior employee, competent, under-recognized, late-career pivot' },
  { name: 'young_optimist', desc: 'Early 20s, still forming identity, mentor-hungry' },
  { name: 'skeptical_veteran', desc: 'Has seen every fad, trusts evidence only, hard to impress' },
  { name: 'blue_collar_builder', desc: 'Trades, hands-on, practical wisdom, distrusts office thinking' },
  { name: 'creative_outsider', desc: 'Artist, writer, musician — unconventional path, financial anxiety' },
  { name: 'late_bloomer', desc: '40+, starting over, wisdom without the scars of youthful overconfidence' }
];
const SEED_SHAPES = [
  { name: 'three_act', rhythm: 'setup → confrontation → resolution (classical)' },
  { name: 'spiral_descent', rhythm: 'each act worse than the last, hope thinner each time' },
  { name: 'rising_revelation', rhythm: 'each act uncovers a deeper truth hidden under the last' },
  { name: 'circular_return', rhythm: 'start at the end, unpack how we got here, return changed' },
  { name: 'parallel_threads', rhythm: 'two timelines braiding, meeting at the climax' },
  { name: 'kintsugi_arc', rhythm: 'breaking point first, then the slow gold-filled repair' }
];
const SEED_VOICES = [
  { name: 'fireside', desc: 'Warm, measured, storyteller — like NPR at night' },
  { name: 'urgent_confidant', desc: 'Leaning in, low volume, "you need to hear this"' },
  { name: 'amused_skeptic', desc: 'Dry wit, slightly above the chaos, Last Week Tonight energy' },
  { name: 'documentary_weight', desc: 'Restrained gravitas, letting facts land — Ken Burns' },
  { name: 'empathetic_coach', desc: 'Direct but kind, Brené Brown cadence, no condescension' },
  { name: 'poetic_observer', desc: 'Metaphor-rich, rhythmic, Alan Watts meets a novelist' }
];
const SEED_SCHEMES = [
  { name: 'triadic', desc: 'Rule of three in nearly every key claim (X, Y, and Z)' },
  { name: 'anaphora', desc: 'Sentences starting with the same phrase for emphasis' },
  { name: 'antithesis', desc: 'Pairing opposites — "not X, but Y" constructions' },
  { name: 'chiasmus', desc: '"Ask not what A can do for B; ask what B can do for A" mirror structure' },
  { name: 'polysyndeton', desc: 'Deliberate "and ... and ... and" for cumulative weight' },
  { name: 'epistrophe', desc: 'Sentences ending with the same phrase for percussive landing' }
];
const SEED_NICHE_BIAS = {
  true_crime: ['anglo_american','eastern_european','celtic','mediterranean'],
  finance: ['anglo_american','south_asian','east_asian'],
  history: ['anglo_american','mediterranean','east_asian','eastern_european','middle_eastern'],
  motivation: ['west_african','latin_american','south_asian','anglo_american'],
  technology: ['east_asian','south_asian','anglo_american','scandinavian'],
  health: ['anglo_american','mediterranean','scandinavian'],
  education: ['south_asian','east_asian','west_african','anglo_american'],
  travel: ['latin_american','mediterranean','east_asian','middle_eastern'],
  relationship: ['anglo_american','mediterranean','latin_american','south_asian'],
  horror: ['anglo_american','eastern_european','celtic'],
  retirement: ['anglo_american','mediterranean','scandinavian']
};
function seededRng(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
function ensureSeedInline(project) {
  // Return existing seed if already persisted
  if (project.script_strategy_override) {
    try {
      const strat = typeof project.script_strategy_override === 'string'
        ? JSON.parse(project.script_strategy_override)
        : project.script_strategy_override;
      if (strat?._script_seed) return { data: strat._script_seed, isNew: false };
    } catch (_) {}
  }
  // Generate a new deterministic seed
  const rng = seededRng(project.id || String(Date.now()));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const nicheKey = (project.niche || 'general').toLowerCase();
  const culturePool = SEED_NICHE_BIAS[nicheKey] || Object.keys(SEED_NAMING_POOLS);
  const namingCulture = pick(culturePool.filter(c => SEED_NAMING_POOLS[c]));
  const firstName = pick(SEED_NAMING_POOLS[namingCulture] || SEED_NAMING_POOLS.anglo_american);
  const archetype = pick(SEED_ARCHETYPES);
  const shape = pick(SEED_SHAPES);
  const voiceRegister = pick(SEED_VOICES);
  const rhetoricalScheme = pick(SEED_SCHEMES);
  return {
    data: {
      firstName, namingCulture,
      archetype: archetype.desc,
      archetypeName: archetype.name,
      shape, voiceRegister, rhetoricalScheme,
      generated_at: new Date().toISOString()
    },
    isNew: true
  };
}

async function callOpenAI(prompt, temperature = 0.7, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a YouTube content strategist. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
      });

      const rawText = response.choices[0].message.content;
      return JSON.parse(rawText);
    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`⚠️ OpenAI attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
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
function buildStandardOutlinePrompt({ topic, project, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock }) {
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

  return `You are an elite viral content strategist and YouTube scriptwriter using the TL VIRAL FORMULA (TVF).

**THE 8 TVF PHASES** (every script MUST hit all 8 in order):
${phasesText}

**STORYTELLING FLAVOR**: ${formatFlavor}
${strategyBlock}
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

    // ═══ ENSURE DIVERSITY SEED EXISTS (inlined — functions can't share modules) ═══
    // The seed is the single source of truth for protagonist identity,
    // narrative shape, and voice register across the entire pipeline.
    // It's persisted into project.script_strategy_override._script_seed
    // and read verbatim by extractCharacterDNA + generateSceneBreakdown.
    let seed = ensureSeedInline(project);
    if (seed.isNew) {
      // Persist the newly generated seed back to the project
      let stratObj = {};
      if (project.script_strategy_override) {
        try {
          stratObj = typeof project.script_strategy_override === 'string'
            ? JSON.parse(project.script_strategy_override)
            : project.script_strategy_override;
        } catch (_) {}
      }
      stratObj._script_seed = seed.data;
      await base44.asServiceRole.entities.Projects.update(project_id, {
        script_strategy_override: JSON.stringify(stratObj)
      });
      scriptStrategy = JSON.stringify(stratObj);
      console.log(`🎲 Seed created: ${seed.data.firstName} (${seed.data.namingCulture}) | ${seed.data.archetypeName} | ${seed.data.shape.name} | ${seed.data.voiceRegister.name} | ${seed.data.rhetoricalScheme.name}`);
    } else {
      console.log(`🎲 Seed already exists: ${seed.data.firstName} (${seed.data.namingCulture})`);
    }

    // Build seed block to inject into the outline prompt
    const seedData = seed.data;
    const seedBlock = `
**🎲 PROJECT DIVERSITY SEED — honor these choices when planning the outline:**
- Protagonist first name: **${seedData.firstName}** (${seedData.namingCulture.replace(/_/g, ' ')})
- Archetype: ${seedData.archetype}
- Narrative shape: ${seedData.shape.name} — ${seedData.shape.rhythm}
- Voice register: ${seedData.voiceRegister.name} — ${seedData.voiceRegister.desc}
- Rhetorical scheme (use at least twice per section): ${seedData.rhetoricalScheme.name} — ${seedData.rhetoricalScheme.desc}
`;
    strategyBlock = seedBlock + strategyBlock;

    // ── DETECT SCRIPT MODE ──
    const scriptMode = detectScriptMode(channel, project);
    const isSleepMode = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';

    console.log(`[initializeScriptBatches] Script mode: ${scriptMode} (channel: ${channel?.name || 'none'})`);

    // ── CALCULATE BATCH COUNT ──
    const durationMinutes = project.video_duration_minutes || 10;
    // Sleep content uses 150 wpm (deliberately slow speaking pace)
    const wordsPerMinute = 150;
    const totalTargetWords = Math.round(durationMinutes * wordsPerMinute);
    // Sleep scripts: ~1100 words per batch (~7 min each) for more granular sections
    // Standard: ~800 words per batch (~5 min each) for quality and granularity
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

    console.log(`Project: ${durationMinutes} min → ${totalTargetWords} words → ${numBatches} batches (${scriptMode})`);

    // ── BUILD OUTLINE PROMPT ──
    const promptArgs = { topic, project, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock };
    const outlinePrompt = isSleepMode
      ? buildSleepOutlinePrompt({ ...promptArgs, scriptMode, channel })
      : buildStandardOutlinePrompt(promptArgs);

    console.log("Generating detailed outline...");
    const outlineResult = await callOpenAI(outlinePrompt, isSleepMode ? 0.6 : 0.7);

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

    // Update project status — also store the detected script_mode for downstream use
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3,
      project_mode: isSleepMode ? scriptMode : ''
    });

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