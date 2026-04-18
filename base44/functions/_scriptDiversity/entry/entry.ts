import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// SCRIPT DIVERSITY SEED — the single source of truth for
// protagonist identity, narrative shape, and voice register.
// 
// Called ONCE per project at script initialization.
// Persists _script_seed into project.script_strategy_override.
// 
// Downstream consumers (extractCharacterDNA, generateSceneBreakdown,
// generateScript*) read the seed and honor its constraints.
// ══════════════════════════════════════════════════════════════════

// ── Cultural naming pools — mapped to archetypes ─────────────────
const NAMING_POOLS = {
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

// ── Archetype pool — who the protagonist IS at their core ────────
const ARCHETYPES = [
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

// ── Narrative shape — the emotional geometry of the story ────────
const NARRATIVE_SHAPES = [
  { name: 'three_act', rhythm: 'setup → confrontation → resolution (classical)' },
  { name: 'spiral_descent', rhythm: 'each act worse than the last, hope thinner each time' },
  { name: 'rising_revelation', rhythm: 'each act uncovers a deeper truth hidden under the last' },
  { name: 'circular_return', rhythm: 'start at the end, unpack how we got here, return changed' },
  { name: 'parallel_threads', rhythm: 'two timelines braiding, meeting at the climax' },
  { name: 'kintsugi_arc', rhythm: 'breaking point first, then the slow gold-filled repair' }
];

// ── Voice register — the narrator's sonic personality ────────────
const VOICE_REGISTERS = [
  { name: 'fireside', desc: 'Warm, measured, storyteller — like NPR at night' },
  { name: 'urgent_confidant', desc: 'Leaning in, low volume, "you need to hear this"' },
  { name: 'amused_skeptic', desc: 'Dry wit, slightly above the chaos, Last Week Tonight energy' },
  { name: 'documentary_weight', desc: 'Restrained gravitas, letting facts land — Ken Burns' },
  { name: 'empathetic_coach', desc: 'Direct but kind, Brené Brown cadence, no condescension' },
  { name: 'poetic_observer', desc: 'Metaphor-rich, rhythmic, Alan Watts meets a novelist' }
];

// ── Rhetorical scheme — the prose-level pattern to repeat ────────
const RHETORICAL_SCHEMES = [
  { name: 'triadic', desc: 'Rule of three in nearly every key claim (X, Y, and Z)' },
  { name: 'anaphora', desc: 'Sentences starting with the same phrase for emphasis' },
  { name: 'antithesis', desc: 'Pairing opposites — "not X, but Y" constructions' },
  { name: 'chiasmus', desc: '"Ask not what A can do for B; ask what B can do for A" mirror structure' },
  { name: 'polysyndeton', desc: 'Deliberate "and ... and ... and" for cumulative weight' },
  { name: 'epistrophe', desc: 'Sentences ending with the same phrase for percussive landing' }
];

// ── Niche → preferred cultural mix (biased, not locked) ──────────
const NICHE_CULTURE_BIAS = {
  true_crime: ['anglo_american','eastern_european','celtic','mediterranean'],
  finance: ['anglo_american','south_asian','east_asian','immigrant_striver'],
  history: ['anglo_american','mediterranean','east_asian','eastern_european','middle_eastern'],
  motivation: ['west_african','latin_american','south_asian','anglo_american','immigrant_striver'],
  technology: ['east_asian','south_asian','anglo_american','scandinavian'],
  health: ['anglo_american','mediterranean','scandinavian'],
  education: ['south_asian','east_asian','west_african','anglo_american'],
  travel: ['latin_american','mediterranean','east_asian','middle_eastern'],
  relationship: ['anglo_american','mediterranean','latin_american','south_asian'],
  horror: ['anglo_american','eastern_european','celtic'],
  retirement: ['anglo_american','mediterranean','scandinavian']
};

function pick(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

// Deterministic RNG from project_id so the same project always gets the same seed
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

// ── THE CORE — generate a full diversity seed for a project ──────
function generateSeed(projectId, niche) {
  const rng = seededRng(projectId || String(Date.now()));
  const nicheKey = (niche || 'general').toLowerCase();
  const culturePool = NICHE_CULTURE_BIAS[nicheKey] || Object.keys(NAMING_POOLS);
  const namingCulture = pick(culturePool.filter(c => NAMING_POOLS[c]), rng);
  const firstName = pick(NAMING_POOLS[namingCulture] || NAMING_POOLS.anglo_american, rng);
  const archetype = pick(ARCHETYPES, rng);
  const shape = pick(NARRATIVE_SHAPES, rng);
  const voiceRegister = pick(VOICE_REGISTERS, rng);
  const rhetoricalScheme = pick(RHETORICAL_SCHEMES, rng);

  return {
    firstName,
    namingCulture,
    archetype: archetype.desc,
    archetypeName: archetype.name,
    shape,
    voiceRegister,
    rhetoricalScheme,
    generated_at: new Date().toISOString()
  };
}

// ── Read existing seed from project.script_strategy_override ─────
function readSeed(project) {
  if (!project?.script_strategy_override) return null;
  try {
    const strat = typeof project.script_strategy_override === 'string'
      ? JSON.parse(project.script_strategy_override)
      : project.script_strategy_override;
    return strat?._script_seed || null;
  } catch (_) {
    return null;
  }
}

// ── Merge seed into strategy and persist on project ──────────────
async function ensureSeed(base44, project) {
  const existing = readSeed(project);
  if (existing) return { seed: existing, created: false };

  const seed = generateSeed(project.id, project.niche);

  let strat = {};
  if (project.script_strategy_override) {
    try {
      strat = typeof project.script_strategy_override === 'string'
        ? JSON.parse(project.script_strategy_override)
        : project.script_strategy_override;
    } catch (_) {}
  }
  strat._script_seed = seed;

  await base44.asServiceRole.entities.Projects.update(project.id, {
    script_strategy_override: JSON.stringify(strat)
  });

  console.log(`🎲 Seed created: ${seed.firstName} (${seed.namingCulture}) | ${seed.archetypeName} | ${seed.shape.name} | ${seed.voiceRegister.name} | ${seed.rhetoricalScheme.name}`);
  return { seed, created: true };
}

// ── HTTP endpoint: POST { project_id } → returns seed ────────────
// Kept as an invokable function so any caller can ensure the seed
// exists even if they missed it during init.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const { seed, created } = await ensureSeed(base44, project);
    return Response.json({ success: true, created, seed });
  } catch (error) {
    console.error('[_scriptDiversity] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});