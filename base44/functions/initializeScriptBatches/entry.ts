import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import OpenAI from 'npm:openai@4.58.1';

async function callOpenAI(prompt, temperature = 0.7, retries = 3, systemPrompt = 'You are a YouTube content strategist. Always respond with valid JSON.') {
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
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
  // 1. HIGHEST PRIORITY: explicit project_mode set by the user on the project itself.
  //    Legacy sleep_meditation is folded into sleep_story.
  if (project?.project_mode === 'sleep_meditation' || project?.project_mode === 'sleep_story') {
    return 'sleep_story';
  }
  if (project?.project_mode === 'explainer') {
    return 'explainer';
  }
  // 2. Explicit mode from channel (sleep_meditation folded into sleep_story)
  if (channel?.script_mode && channel.script_mode !== 'standard') {
    return channel.script_mode === 'sleep_meditation' ? 'sleep_story' : channel.script_mode;
  }
  // 3. Auto-detect from niche keywords — any sleepy keyword → sleep_story
  const niche = (channel?.niche || project?.niche || '').toLowerCase();
  const name = (channel?.name || '').toLowerCase();
  const combined = `${niche} ${name}`;
  if (/sleep|meditation|relax|calm|sooth|asmr|bedtime/i.test(combined)) {
    return 'sleep_story';
  }
  return 'standard';
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP STORY OUTLINE PROMPT — plans a classic folk/fairy-tale, retold slowly
// ═══════════════════════════════════════════════════════════════════
function buildSleepOutlinePrompt({ topic, project, channel, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock }) {
  return `You are a master bedtime-story planner. You outline classic folk tales and fairy tales, retold slowly as soothing sleep stories — in the tradition of the Calm app sleep stories and the Nothing Much Happens podcast.

**WHAT YOU ARE PLANNING — an ACTUAL STORY:**
You are breaking a real, gentle narrative into chapters. The tale has named characters, a real setting, and a soft plot that unfolds and resolves peacefully. This is NOT a guided meditation and NOT a list of relaxation themes.

**ABSOLUTELY FORBIDDEN in every synopsis:**
❌ Affirmations ("you are enough", "you are safe", "you deserve rest")
❌ Second-person guided-meditation address ("you feel", "allow yourself", "imagine yourself")
❌ Breathing cues, body scans, relaxation instructions, [BREATHE] markers
❌ Abstract "themes" instead of actual plot events
❌ Explaining meditation/ASMR/sleep science, or any meta-commentary
❌ Conflict, danger, suspense, jump-scares, cliffhangers, urgency

**WHAT EACH CHAPTER SYNOPSIS MUST DESCRIBE — the ACTUAL STORY EVENTS:**
✓ WHO is in this chapter (named characters) and WHERE it takes place (a real, cozy setting)
✓ WHAT GENTLY HAPPENS — the small, calm plot beat of this chapter (a journey begun, a kind stranger met, a meal shared, a small task done, a treasure found)
✓ The cozy sensory texture of the scene (lamplight, hearth-smoke, soft snow, the smell of bread, a purring cat) woven into the action
✓ A soft, satisfying handoff into the next chapter — never a cliffhanger

**THE TALE TO RETELL:**
- Title / Tale: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'Bedtime'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)

If the title names a known folk tale or fairy tale (e.g. "The Elves and the Shoemaker", "The Snow Queen", "Thumbelina"), retell THAT tale — gentle, abridged of any scary parts, slowed right down. If the title is just a theme or place, invent a simple original folk tale that fits it, with a named hero and a cozy little quest.

**STORY-PLANNING PRINCIPLES:**
- A clear, very low-stakes arc: a small wish → a gentle journey → small kind encounters → the wish softly fulfilled → everyone settling in for the night.
- Strip out anything frightening or tense from classic tales — keep it warm and safe throughout.
- Pace it SLOWLY. There is no rush. Linger on cozy detail.
- Keep characters and setting consistent across all chapters.

**YOUR TASK**: Break this tale into exactly ${numBatches} chapters that tell the WHOLE story start to finish, slowly.

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short chapter title (3-5 words, e.g. 'The Cottage on the Hill')",
      "section_type": "opening|rising|middle|resolution|closing",
      "focus_area": "Brief focus (1 sentence — the plot beat of this chapter)",
      "synopsis": "EXTREMELY DETAILED synopsis (200-300 words) describing the ACTUAL STORY EVENTS of this chapter: which named characters appear, where they are, what gently happens, the cozy sensory detail, and how it flows softly into the next chapter. Describe PLOT, not relaxation themes. No affirmations, no second-person address, no [BREATHE]."
    }
  ]
}

**RULES:**
- Generate exactly ${numBatches} chapters that together tell ONE complete tale.
- Chapter 1 OPENS the tale ("Once, in a...") — introduce the named hero and the cozy setting and the small thing that begins the story.
- The LAST chapter fully RESOLVES the tale — the small quest complete, everyone safe, content, and drifting off to sleep.
- Each synopsis: 200-300 words of SPECIFIC story events (names, places, actions) — NOT abstract calming themes.
- Keep continuity: same characters, same place, gentle forward momentum.
- Everything stays warm, safe, and soothing — no tension, no fear, no cliffhangers.`;
}

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER OUTLINE PROMPT — listicle / educational structure
// ═══════════════════════════════════════════════════════════════════
function buildExplainerOutlinePrompt({ topic, project, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock }) {
  const title = topic?.title || project.name || '';
  const description = topic?.description || '';

  const listicleMatch = title.match(/^\s*(\d+)\s+/);
  const itemCount = listicleMatch ? parseInt(listicleMatch[1], 10) : 0;
  const isListicle = itemCount >= 2 && itemCount <= 20;

  const listicleBlock = isListicle
    ? `\n**LISTICLE FORMAT DETECTED** — Title implies ${itemCount} discrete items.
- Plan an INTRO batch (hook + premise + tease the list)
- Then one batch per item OR group items if ${itemCount} > ${numBatches - 2}
- End with a CLOSE batch (recap + CTA)
- For each item batch, the synopsis MUST include:
  • The item name as a clear header
  • At least ONE named real-world operator/example with backstory
  • Concrete dollar figures (revenue, margins, startup cost) — minimum 3 numbers per item
  • How the mechanic actually works (the boring/unsexy reality)
  • A "tease the next item" cliffhanger at the end\n`
    : `\n**EDUCATIONAL EXPLAINER FORMAT** — Plan as concept → mechanics → examples → implications.
- Each batch should anchor on ONE concrete sub-topic, not abstract themes
- Every synopsis must include specific named examples, numbers, dates, places
- No vague "we will explore" framing — describe WHAT will be said\n`;

  return `You are an expert YouTube educator and explainer script planner. You plan scripts in the style of Wendover, Polymatter, Modern MBA, Logically Answered — dense, fact-packed, conversational, packed with specific numbers and real-world examples.

**CRITICAL RULES**:
❌ NO cinematic novel prose — this is education, not a film treatment
❌ NO "Dave sat in traffic..." dramatic curtain-raiser openings
❌ NO TVF phases (HOOK/TENSION/INSIGHT) — those are for viral story scripts
❌ NO vague themes — every batch must commit to specific facts, names, and numbers
✅ Casual, conversational educator voice ("here's the thing...", "I know, I know...")
✅ Density of named operators, dollar figures, mechanics
✅ Inter-batch teases to maintain retention

**PROJECT**:
- Title: ${title}
- Description: ${description}
- Niche: ${project.niche || 'Educational'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${selectedHook ? `- Opening Hook (MUST USE in batch 1): "${selectedHook.hook_text}"` : ''}
${strategyBlock}
${listicleBlock}

**YOUR TASK**: Plan exactly ${numBatches} batches.

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words) — for listicles use the item name",
      "focus_area": "Brief focus (1 sentence)",
      "synopsis": "EXTREMELY DETAILED synopsis (200-300 words) describing exactly what the narrator will SAY. Include: specific company/person names, dollar amounts (revenue, costs, margins), how the mechanic works step-by-step, at least one short anecdote, and a tease into the next batch. NO cinematic prose."
    }
  ]
}

**RULES**:
- Generate exactly ${numBatches} batches
${selectedHook ? `- Batch 1 MUST open with this hook: "${selectedHook.hook_text}"` : '- Batch 1 must open punchy — premise + tease, no novelistic scene-setting'}
- Every synopsis: 200-300 words of SPECIFIC, factual detail
- Every item/concept batch must name AT LEAST one real operator and contain AT LEAST 3 dollar figures
- Each batch ends with a 1-line tease into the next batch
- Last batch is a quick recap + CTA naming 2 specific items/concepts viewers should remember`;
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
    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    // Get selected hook if any (skip for sleep projects — they don't use hooks)
    let selectedHook = null;
    const isSleepProject = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    // (sleep_meditation is legacy — treated as sleep_story everywhere below)
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
    const isSleepMode = scriptMode === 'sleep_story';
    const isExplainerMode = project.project_mode === 'explainer';

    console.log(`[initializeScriptBatches] Script mode: ${scriptMode} | explainer: ${isExplainerMode} (channel: ${channel?.name || 'none'})`);

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
      ? buildSleepOutlinePrompt({ ...promptArgs, channel })
      : isExplainerMode
        ? buildExplainerOutlinePrompt(promptArgs)
        : buildStandardOutlinePrompt(promptArgs);

    console.log(`Generating detailed outline... (${isSleepMode ? 'sleep' : isExplainerMode ? 'explainer' : 'standard TVF'})`);
    const sleepSystemPrompt = `You are a professional bedtime-story writer specializing in classic folk tales and fairy tales retold slowly as soothing sleep stories — in the tradition of the Calm app and the Nothing Much Happens podcast. You write gentle third-person NARRATIVE with named characters and a cozy plot — never guided meditations or affirmations. Always respond with valid JSON.`;
    const systemPrompt = isSleepMode
      ? sleepSystemPrompt
      : 'You are a YouTube content strategist. Always respond with valid JSON.';
    const outlineResult = await callOpenAI(outlinePrompt, isSleepMode ? 0.6 : isExplainerMode ? 0.75 : 0.7, 3, systemPrompt);

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

    // Update project status — ONLY set project_mode if sleep is detected.
    // NEVER wipe an existing project_mode (sleep/explainer) the user already chose.
    const updatePayload = {
      status: 'scripting',
      current_step: 3,
    };
    if (isSleepMode) {
      updatePayload.project_mode = scriptMode;
    }
    // else: leave project_mode untouched — preserves explainer, sleep, or empty as-is
    await base44.asServiceRole.entities.Projects.update(project_id, updatePayload);

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