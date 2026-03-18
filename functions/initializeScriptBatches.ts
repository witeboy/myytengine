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