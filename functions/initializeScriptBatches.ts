import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function callGemini(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: "application/json" }
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
  return JSON.parse(rawText);
}

// ═══════════════════════════════════════════════════════════════════
// Detect sleep script mode from channel or project
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
        'Opening & Welcome (settle, breathe, topic intro)',
        'You Are Enough (self-worth affirmations)',
        'You Deserve Rest (permission to stop, release productivity guilt)',
        'Let Go of Today (release worries, tomorrow takes care of itself)',
        'You Are Safe Here (safety, warmth, protection)',
        'Your Journey Matters (progress, self-compassion)',
        'You Belong (acceptance, connection)',
        'Tomorrow Holds Promise (gentle hope)',
        'Your Body Knows (trust body wisdom, release control)',
        'Deep Rest (minimal words, long pauses, pure relaxation)',
        'Closing & Fade (brief gentle goodbye)',
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

  return `You are an expert sleep script planner specializing in ${contentType} content designed to help listeners fall asleep.

**CONTENT TYPE**: ${isMeditation ? 'Motivational Meditation — gentle affirmations, self-improvement themes, soothing repetition' : 'Sleep Story — narrative content with rich sensory details, peaceful settings, gentle activities'}

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
- Strategic repetition — each key concept repeated 4-6 times
- NO excitement, urgency, drama, tension, or surprises
- Include [PAUSE X SEC] markers in synopses
- Simple vocabulary, short sentences (12-20 words ideal)
- Progressive deepening: physical relaxation → mental calm → emotional peace → deep rest
- Use nature metaphors: ocean, mountain, tree, river, moon, stars, forest
- Sensory grounding: touch, sound, sight, smell references

**SECTION TEMPLATE IDEAS** (adapt to fit ${numBatches} batches):
${sectionTemplates.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

**YOUR TASK**: Plan exactly ${numBatches} batches for a ${durationMinutes}-minute ${contentType}.

${isMeditation ? `Each 15-minute section should follow:
- Minutes 1-2: Introduce sub-theme (~300 words)
- Minutes 3-4: Core affirmation stated clearly, repeated 2-3 ways (~300 words)
- Minutes 5-8: Elaborate with nature imagery and sensory details (~600 words)
- Minutes 9-11: Repeat affirmation in new phrasing (~450 words)
- Minutes 12-13: Sensory grounding, body awareness (~300 words)
- Minutes 14-15: Breathing reminder + transition to next theme (~300 words)` :
`Each scene section should follow:
- Scene Opening (2-3 min): Set immediate environment, rich sensory details, no action yet
- Gentle Activity (5-8 min): Character does something peaceful, described in loving detail
- Reflection (2-3 min): Character's peaceful thoughts, observations, contentment
- Scene Transition (1-2 min): Natural movement to next setting, seamless flow`}

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words)",
      "section_type": "${isMeditation ? 'opening|affirmation|grounding|deepening|closing' : 'opening|scene|deepening|closing'}",
      "focus_area": "Brief focus (1 sentence)",
      "synopsis": "EXTREMELY DETAILED synopsis (200-300 words). Include: exact imagery, sensory details, affirmation phrases, [PAUSE] placement, breathing cues, nature metaphors to use, emotional arc within section, how it deepens relaxation progressively."
    }
  ]
}

**RULES:**
- Generate exactly ${numBatches} batches
- First batch MUST be the Opening & Welcome section
- Last batch should be the gentlest, most sleep-inducing content
- Progressive deepening: each batch should be calmer and slower than the last
- Include specific [PAUSE X SEC] markers in synopses
- Include specific affirmation phrases and nature metaphors in synopses
- Every synopsis: 200-300 words of SPECIFIC detail
- NO conflict, tension, excitement, urgency, or surprises anywhere
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
    // Standard: ~1500 words per batch
    const WORDS_PER_BATCH = isSleepMode ? 1100 : 1500;
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
    const outlineResult = await callGemini(outlinePrompt, isSleepMode ? 0.6 : 0.7);

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