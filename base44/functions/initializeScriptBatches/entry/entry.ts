import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import OpenAI from 'npm:openai@4.58.1';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

async function callOpenAI(prompt, temperature = 0.7, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a creative writing and content planning expert. Always respond with valid JSON.' },
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
// Detect sleep script mode from channel or project
// ═══════════════════════════════════════════════════════════════════
function detectScriptMode(channel, project) {
  // 1. Explicit project_mode takes priority
  if (project?.project_mode && project.project_mode !== 'standard') {
    return project.project_mode;
  }
  // 2. Explicit channel script_mode
  if (channel?.script_mode && channel.script_mode !== 'standard') {
    return channel.script_mode;
  }
  // 3. Auto-detect from niche/name keywords
  const combined = `${channel?.niche || ''} ${channel?.name || ''} ${project?.niche || ''}`.toLowerCase();
  if (/sleep\s*stor|bedtime\s*stor/i.test(combined)) return 'sleep_story';
  if (/sleep|meditation|relax|calm|sooth|asmr|bedtime/i.test(combined)) return 'sleep_meditation';
  return 'standard';
}

// ═══════════════════════════════════════════════════════════════════
// Protagonist name picker — keeps sleep stories consistent
// ═══════════════════════════════════════════════════════════════════
function pickProtagonistName(topicTitle) {
  const pools = {
    japanese:      ['Yuki', 'Haruki', 'Sora', 'Ren', 'Nao'],
    nordic:        ['Astrid', 'Sven', 'Freya', 'Bjorn', 'Saga'],
    celtic:        ['Rowan', 'Niamh', 'Callum', 'Isla', 'Finn'],
    mediterranean: ['Elena', 'Marco', 'Sofia', 'Luca', 'Aria'],
    english:       ['Thomas', 'Clara', 'Oliver', 'Mara', 'James'],
    african:       ['Amara', 'Kofi', 'Zara', 'Seun', 'Nia'],
    default:       ['Mara', 'Thomas', 'Elena', 'Rowan', 'Luca', 'Clara', 'Finn', 'Aria'],
  };
  const t = (topicTitle || '').toLowerCase();
  if (/japan|kyoto|tokyo|zen|sakura|bamboo|shrine/i.test(t))          return pools.japanese[Math.floor(Math.random() * pools.japanese.length)];
  if (/norse|viking|nordic|fjord|scandinav/i.test(t))                 return pools.nordic[Math.floor(Math.random() * pools.nordic.length)];
  if (/ireland|scottish|celtic|highland|loch|druid/i.test(t))        return pools.celtic[Math.floor(Math.random() * pools.celtic.length)];
  if (/italy|greek|tuscany|mediterranean|provence|spain/i.test(t))    return pools.mediterranean[Math.floor(Math.random() * pools.mediterranean.length)];
  if (/africa|ghana|nigeria|kenya|savanna/i.test(t))                  return pools.african[Math.floor(Math.random() * pools.african.length)];
  if (/england|english|cottage|village|countryside|british/i.test(t)) return pools.english[Math.floor(Math.random() * pools.english.length)];
  return pools.default[Math.floor(Math.random() * pools.default.length)];
}

// ═══════════════════════════════════════════════════════════════════
// MEDITATION OUTLINE PROMPT — affirmations/second-person are correct here
// ═══════════════════════════════════════════════════════════════════
function buildMeditationOutlinePrompt({ topic, project, selectedHook, numBatches, totalTargetWords, durationMinutes }) {
  const sectionTemplates = [
    'Opening & Welcome (settle, breathe, body awareness)',
    'Core Affirmation Introduction (gentle theme entry through imagery)',
    'Affirmation Deepening (repeat core phrase 4-6 times in different words)',
    'Nature Imagery Weaving (ocean / mountain / forest / river / stars)',
    'Body Awareness & Breath (weight, warmth, breath rhythm, [BREATHE] cues)',
    'Emotional Release (permission to rest, release guilt, let go)',
    'Deeper Stillness (reduced language density, longer pauses)',
    'Drift State (near-silence, minimal words, pure presence)',
    'Closing Fade (final soft affirmation, then silence)',
  ];

  return `You are an expert sleep audio script planner creating a motivational meditation outline.

**CONTENT TYPE**: Motivational Meditation — the narrator speaks directly to the listener with gentle affirmations, nature imagery, and soothing repetition. Think Jason Stephenson, Michael Sealey, The Honest Guys.

**CRITICAL**: Every synopsis describes WHAT THE NARRATOR WILL SAY — actual words, affirmations, imagery. NEVER include:
❌ Explaining ASMR, neuroscience, dopamine, or "studies show"
❌ Practical sleep tips or educational content
❌ References to YouTube, videos, or channels
❌ Meta-commentary ("in this section we will...")
❌ First-person anecdotes from the narrator

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${selectedHook ? `- Opening Hook: "${selectedHook.hook_text}"` : ''}

**MEDITATION PRINCIPLES**:
- Extremely gentle, monotonous, soothing throughout
- Strategic repetition — each concept restated 4-6 times in different words
- NO excitement, urgency, drama, or tension
- Second-person "you" throughout — speak directly to the listener
- Simple vocabulary, short sentences (8-18 words)
- Progressive deepening: physical → mental → emotional → deep rest
- Nature metaphors: ocean, mountain, tree, river, moon, stars, forest
- [PAUSE X SEC] and [BREATHE] markers throughout synopses

**SECTION TEMPLATE IDEAS** (adapt to fit ${numBatches} sections):
${sectionTemplates.slice(0, numBatches).map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

**EXAMPLE GOOD SYNOPSIS**:
"The narrator softly says: 'You are enough... just as you are... you are enough.' [PAUSE 5 SEC] Ocean imagery: waves rolling in, each one whispering 'enough.' The listener's breath matches the tide. [BREATHE] 'With every breath... you sink deeper into knowing... you have always been enough.' Repeat with mountain imagery — solid, unmovable, complete. [PAUSE 3 SEC] Return to body: weight of blankets, warmth, safety. 'You are enough... right now... in this moment... you are enough.'"

Create exactly ${numBatches} sections.

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short title (3-5 words)",
      "focus_area": "Brief focus — what the narrator guides the listener through (1 sentence)",
      "synopsis": "200-300 words describing the ACTUAL meditation content — affirmation phrases in quotes, nature imagery, [PAUSE] and [BREATHE] placement, sensory details, how it deepens relaxation."
    }
  ]
}

Generate exactly ${numBatches} batches.`;
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP STORY OUTLINE PROMPT — v2: pure narrative, NO meditation DNA
// ═══════════════════════════════════════════════════════════════════
function buildSleepStoryOutlinePrompt({ topic, project, numBatches, totalTargetWords, durationMinutes }) {
  const protagonistName = pickProtagonistName(topic?.title || project.name);

  // Chapter arc: arrival → exploration (middle chapters) → natural rest
  const chapterArcHints = [];
  chapterArcHints.push(`Chapter 1 — ARRIVAL: ${protagonistName} arrives at or is already within a specific, vividly described setting. Introduce the world immediately, like the opening line of a novel. ${protagonistName} begins a simple, concrete activity.`);
  for (let i = 2; i < numBatches; i++) {
    chapterArcHints.push(`Chapter ${i} — EXPLORATION: ${protagonistName} moves through the world, notices things, completes a gentle task, or discovers a small detail. The world gets quieter and slower with each chapter.`);
  }
  chapterArcHints.push(`Chapter ${numBatches} — NATURAL REST: ${protagonistName} finds a warm, still place. The world outside is quiet. The narration slows to near-silence. The story simply... stops. No instruction to sleep. No address to any listener. Just stillness.`);

  return `You are a creative director planning an adult bedtime story — the kind told on the Calm app or Headspace Sleepcasts. You are writing a STORY OUTLINE, not a meditation plan.

═══════════════════════════════════════
WHAT THIS IS
═══════════════════════════════════════
A sleep story is NARRATIVE FICTION. A named character moves through a beautiful, specific world. The listener falls asleep because the world is so warm and detailed and unhurried that sleep finds them naturally — not because they are instructed to relax or breathe.

Think: a gentle novel read aloud. A lullaby with plot. A nature documentary in prose.

═══════════════════════════════════════
THE PROTAGONIST
═══════════════════════════════════════
Name: **${protagonistName}**
Use this exact name in EVERY chapter synopsis — no exceptions. Never use "the character", "the listener", or "you". Always ${protagonistName}.

Personality: content, gently curious, unhurried, observant. Never anxious, rushed, or conflicted.

═══════════════════════════════════════
ABSOLUTE RULES FOR EVERY SYNOPSIS
═══════════════════════════════════════

✅ MUST HAVE:
- ${protagonistName}'s name used explicitly at least twice
- A specific, named location ("the stone harbour at Ardmore", "her kitchen in the old mill house" — never just "a peaceful place")
- Concrete actions ${protagonistName} takes: walks, stirs, ties, folds, lifts, opens, watches, picks up
- Rich sensory details: what is seen, heard, smelled, touched (and occasionally tasted)
- Third-person present tense: "${protagonistName} walks...", "${protagonistName} watches..."
- Natural micro-narrative: something happens, even if gently

❌ NEVER include:
- Second-person "you" in any form ("you feel", "you notice", "you breathe", "imagine you're")
- Affirmations ("you are safe", "you are loved", "you deserve rest", "you are enough")
- Breathing instructions ("take a deep breath", "breathe in", "inhale slowly")
- Body scan language ("feel your muscles relax", "your eyelids grow heavy", "sink into your pillow")
- [PAUSE] or [BREATHE] markers — these belong in the SCRIPT not the outline
- Chapter titles like "Opening & Welcome", "Settling In", "Body Awareness", "Closing & Fade"
- "The listener", "the audience", or any reference to someone listening
- Meta-commentary ("this chapter will...", "we now transition to...")
- Conflict, danger, tension, urgency, or anything that raises heart rate

═══════════════════════════════════════
PROJECT DETAILS
═══════════════════════════════════════
- Story topic / setting: ${topic?.title || project.name}
- Setting description: ${topic?.description || ''}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
- Total chapters: ${numBatches}

═══════════════════════════════════════
CHAPTER ARC (follow this structure)
═══════════════════════════════════════
${chapterArcHints.join('\n')}

═══════════════════════════════════════
EXAMPLE OF A GOOD SYNOPSIS
═══════════════════════════════════════
Chapter: "The Harbour at Low Tide"
Synopsis: "${protagonistName} walks the harbour wall as the tide retreats, leaving the fishing boats tilted gently on their moorings. The smell of salt and old rope is thick in the evening air. She moves slowly, one hand trailing along the worn stone, watching a heron pick its way between the exposed rocks below. At the far end of the wall there is a wooden bench, warped by years of sea wind, and she sits there watching the light change — the sky shifting from pale gold to a soft, bruised blue above the headland. A lobster fisherman she knows by sight nods as he passes, carrying a coil of rope over one shoulder. She nods back. Two swallows cut low across the water, almost touching the surface, then arrow up into the pale sky. The village bells ring the half-hour from somewhere behind her. She does not count them. She listens to the water moving against the stone below, the occasional soft knock of a hull against a buoy, and feels in no hurry to be anywhere at all."

═══════════════════════════════════════
EXAMPLE OF A BAD SYNOPSIS (never write this)
═══════════════════════════════════════
"Opening & Welcome: The narrator invites the listener to settle in and get comfortable. Take a deep breath as we begin tonight's story. You are safe here. Let your body relax as you breathe in... [BREATHE] ... and breathe out. You are loved. Let go of the day..."
→ WRONG: second-person, affirmations, breathing cues, no protagonist, no setting, no story.

═══════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════
Return only valid JSON:
{
  "storytelling_format": "sleep story",
  "protagonist_name": "${protagonistName}",
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Evocative chapter title (3-6 words, NOT 'Opening', NOT 'Welcome', NOT 'Settling')",
      "focus_area": "One sentence: what ${protagonistName} does and where — no affirmations, no meditation language",
      "synopsis": "200-300 words of specific story content. ${protagonistName} named explicitly. Specific location. Concrete actions. Layered sensory details. Third-person present tense. Zero second-person. Zero affirmations. Zero breathing cues. Zero [PAUSE] markers."
    }
  ]
}

Generate exactly ${numBatches} chapters.`;
}

// ═══════════════════════════════════════════════════════════════════
// STANDARD TVF OUTLINE PROMPT — unchanged
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
    'Big Lie':    'Frame the HOOK around a widely-believed lie. The TENSION reveals cracks. The INSIGHT exposes the truth.',
    'Zero to Hero': 'Frame the HOOK around the lowest point. The INSIGHT is the catalyst moment. The TRANSFORMATION is the triumphant rise.',
    'Timeline':   'Frame the HOOK around a pivotal historical moment. Progress chronologically. The INSIGHT is the turning point.',
    'Mystery':    'Frame the HOOK as an unsolved puzzle. The TENSION builds through clues. The INSIGHT is the revelation.',
    'default':    'Use the standard TVF flow. Adapt tone to the niche. Focus on maximum curiosity and retention throughout.',
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

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
    const topic = topics[0];

    // Sleep projects don't use hooks
    const scriptMode = detectScriptMode(null, project); // channel loaded below
    const isSleepProject = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';

    let selectedHook = null;
    if (!isSleepProject && project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0];
    }

    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

    // Re-detect now that we have channel
    const resolvedScriptMode = detectScriptMode(channel, project);
    const isSleepMode = resolvedScriptMode === 'sleep_meditation' || resolvedScriptMode === 'sleep_story';
    const isSleepStory = resolvedScriptMode === 'sleep_story';
    const isMeditation = resolvedScriptMode === 'sleep_meditation';

    console.log(`[initializeScriptBatches] Script mode: ${resolvedScriptMode} (channel: ${channel?.name || 'none'})`);

    // ── Strategy block — ONLY for standard mode ──
    // Sleep modes intentionally skip channel strategy to prevent
    // viral/retention writing patterns bleeding into sleep content.
    let strategyBlock = '';
    if (!isSleepMode) {
      const scriptStrategy = project.script_strategy_override || channel?.script_strategy || '';
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
    }

    // Delete existing batches
    const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const batch of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
    }

    // ── Batch sizing ──
    const durationMinutes = project.video_duration_minutes || 10;
    const totalTargetWords = Math.round(durationMinutes * 150);
    const WORDS_PER_BATCH = isMeditation ? 1100 : isSleepStory ? 900 : 800;
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

    console.log(`Project: ${durationMinutes} min → ${totalTargetWords} words → ${numBatches} batches (${resolvedScriptMode})`);

    // ── Build outline prompt ──
    const promptArgs = { topic, project, channel, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock };

    let outlinePrompt;
    if (isMeditation) {
      outlinePrompt = buildMeditationOutlinePrompt(promptArgs);
    } else if (isSleepStory) {
      outlinePrompt = buildSleepStoryOutlinePrompt(promptArgs);
    } else {
      outlinePrompt = buildStandardOutlinePrompt(promptArgs);
    }

    // Temperature: sleep_story slightly higher for narrative variety
    const temperature = isSleepStory ? 0.8 : isMeditation ? 0.6 : 0.7;

    console.log("Generating detailed outline...");
    const outlineResult = await callOpenAI(outlinePrompt, temperature);

    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error("AI failed to generate outline batches");
    }

    // ── For sleep stories: validate and stamp protagonist name on every batch ──
    if (isSleepStory) {
      const protagonist = outlineResult.protagonist_name || pickProtagonistName(topic?.title || project.name);
      for (const batch of outlineResult.batches) {
        batch.protagonist_name = protagonist;
        // Inject name hint if synopsis somehow omits it
        if (!batch.synopsis.includes(protagonist)) {
          batch.synopsis = `[Protagonist: ${protagonist}] ` + batch.synopsis;
        }
        // Strip any [PAUSE] or [BREATHE] markers that leaked into synopses
        batch.synopsis = batch.synopsis.replace(/\[PAUSE[^\]]*\]/gi, '').replace(/\[BREATHE\]/gi, '').trim();
        // Strip any second-person fragments
        batch.synopsis = batch.synopsis.replace(/\byou (feel|notice|breathe|hear|see|sense|are)\b/gi, `${protagonist} $1`);
      }
    }

    // ── Create batch records ──
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
        status: 'pending',
      });
      createdBatches.push(batch);
    }

    // Update project — persist resolved script mode for downstream functions
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3,
      project_mode: isSleepMode ? resolvedScriptMode : (project.project_mode || ''),
    });

    console.log(`Created ${createdBatches.length} batches (${resolvedScriptMode})`);

    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      total_target_words: totalTargetWords,
      duration_minutes: durationMinutes,
      script_mode: resolvedScriptMode,
      protagonist_name: isSleepStory ? (outlineResult.protagonist_name || null) : undefined,
      batches: createdBatches,
    });

  } catch (error) {
    console.error('Error initializing batches:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});