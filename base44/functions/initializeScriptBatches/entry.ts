import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import OpenAI from 'npm:openai@4.58.1';

// ═══════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════
const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");

// ═══════════════════════════════════════════════════════════════════
// LLM CALLERS
// ═══════════════════════════════════════════════════════════════════
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
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`⚠️ OpenAI attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

async function callClaude(prompt, temperature = 0.7, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (response.status === 429) {
      const waitMs = Math.pow(2, attempt + 1) * 3000;
      console.warn(`⏳ Claude rate limited, waiting ${waitMs / 1000}s`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }
    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Claude error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // Try direct parse
    try { return JSON.parse(rawText); } catch (_) {}
    // Strip markdown fences
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
    // Grab first JSON object
    const obj = rawText.match(/\{[\s\S]*\}/);
    if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }

    if (attempt === retries) throw new Error('Failed to parse Claude JSON after all attempts');
  }
}

// Primary: OpenAI  |  Fallback: Claude
async function callLLM(prompt, temperature = 0.7) {
  try {
    const result = await callOpenAI(prompt, temperature);
    console.log('[initializeScriptBatches] Outline via OpenAI ✅');
    return result;
  } catch (err) {
    console.warn(`[initializeScriptBatches] OpenAI failed: ${err.message} — falling back to Claude`);
    if (!ANTHROPIC_KEY) throw err;
    return await callClaude(prompt, temperature);
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════
function detectScriptMode(channel, project) {
  if (project?.project_mode && project.project_mode !== 'standard') return project.project_mode;
  if (channel?.script_mode && channel.script_mode !== 'standard') return channel.script_mode;
  const combined = `${channel?.niche || ''} ${channel?.name || ''} ${project?.niche || ''}`.toLowerCase();
  if (/sleep\s*stor|bedtime\s*stor/i.test(combined)) return 'sleep_story';
  if (/sleep|meditation|relax|calm|sooth|asmr|bedtime/i.test(combined)) return 'sleep_meditation';
  return 'standard';
}

// ═══════════════════════════════════════════════════════════════════
// BATCH MATH
// ═══════════════════════════════════════════════════════════════════
function computeBatchTargets(totalTargetWords, scriptMode) {
  const WORDS_PER_BATCH = scriptMode === 'sleep_meditation' ? 1100
    : scriptMode === 'sleep_story' ? 900
    : 800;

  const numBatches = Math.max(1, Math.ceil(totalTargetWords / WORDS_PER_BATCH));

  const baseWords = Math.floor(totalTargetWords / numBatches);
  const remainder = totalTargetWords - baseWords * numBatches;

  return Array.from({ length: numBatches }, (_, i) =>
    i === numBatches - 1 ? baseWords + remainder : baseWords
  );
}

// ═══════════════════════════════════════════════════════════════════
// OUTLINE PROMPTS
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

**CONTENT TYPE**: Motivational Meditation — narrator speaks directly to the listener with gentle affirmations, nature imagery, and soothing repetition (Jason Stephenson / Michael Sealey style).

**CRITICAL**: Every synopsis describes WHAT THE NARRATOR WILL SAY. NEVER include:
❌ Explaining ASMR, neuroscience, dopamine, or "studies show"
❌ Practical sleep tips or educational content
❌ References to YouTube, videos, or channels
❌ Meta-commentary ("in this section we will...")

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${selectedHook ? `- Opening Hook: "${selectedHook.hook_text}"` : ''}

**MEDITATION PRINCIPLES**:
- Extremely gentle, monotonous, soothing
- Strategic repetition — each concept restated 4-6 times in different words
- Second-person "you" throughout — speak directly to the listener
- Simple vocabulary, short sentences (8-18 words)
- Progressive deepening: physical → mental → emotional → deep rest
- Nature metaphors: ocean, mountain, tree, river, moon, stars, forest

**SECTION TEMPLATE IDEAS** (adapt to fit ${numBatches} sections):
${sectionTemplates.slice(0, Math.max(numBatches, sectionTemplates.length)).slice(0, numBatches).map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

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

// ─────────────────────────────────────────────────────────────────
// SLEEP STORY — second-person immersive, no named protagonist
// ─────────────────────────────────────────────────────────────────
function buildSleepStoryOutlinePrompt({ topic, project, numBatches, totalTargetWords, durationMinutes }) {

  const chapterArcHints = [];
  chapterArcHints.push(`Chapter 1 — ARRIVAL: The listener arrives at or is already within a specific, vividly described setting. Open like the first line of a novel — ground them in place immediately with sensory detail. Begin a simple, unhurried activity.`);
  for (let i = 2; i < numBatches; i++) {
    chapterArcHints.push(`Chapter ${i} — DRIFTING DEEPER: The listener moves through the world — noticing things, completing a gentle task, following a sound or a light. The world grows quieter and slower with each chapter. "You" appears sparingly; the scene carries them.`);
  }
  if (numBatches > 1) {
    chapterArcHints.push(`Chapter ${numBatches} — DISSOLVING: The listener finds a warm, still place. Sound fades. Movement slows to almost nothing. The narration thins to texture and silence. No instruction to sleep. No affirmations. Just the world, breathing.`);
  }

  return `You are a creative director planning an adult bedtime story — the kind told on the Calm app or Headspace Sleepcasts. This is IMMERSIVE SECOND-PERSON NARRATIVE FICTION.

There is no named protagonist. The LISTENER is the protagonist — addressed as "you" — but sparingly. The world is described so richly that the listener slips into it naturally. "You" appears roughly once every 3-4 sentences. The rest is pure scene: light, texture, smell, sound, movement.

═══════════════════════════════════════
THE GOLDEN RATIO: 80% WORLD / 20% YOU
═══════════════════════════════════════
Most sentences paint the environment. A few gently place the listener inside it.

✅ GOOD EXAMPLE:
"The cobblestones are still warm from the afternoon sun. A cat stretches along a low wall, watching nothing. The smell of jasmine drifts down from a window somewhere above — and something cooking slowly, garlic and oil. You turn down a narrower lane. A hand finds yours, warm and unhurried. Neither of you speaks."

❌ BAD EXAMPLE (too much "you", too meditation-like):
"You notice your breathing slowing. You feel the warmth beneath your feet. You are safe here. You are at peace. Let yourself relax deeper with every step you take."

═══════════════════════════════════════
RULES FOR EVERY SYNOPSIS
═══════════════════════════════════════

✅ MUST HAVE:
- A specific, named location (never just "a peaceful place")
- Rich layered sensory detail: what is seen, heard, smelled, felt
- Concrete things happening in the world: water moving, a fire settling, bread cooling, wind in leaves
- "You" used sparingly — to place the listener, not to instruct them
- Present tense throughout
- Pacing that slows chapter by chapter

❌ NEVER:
- Named protagonist (no Thomas, Elena, Rowan, or any name)
- Affirmations: "you are safe", "you are loved", "you are enough"
- Breathing instructions or body scan language
- [PAUSE] or [BREATHE] markers in synopses
- Chapter titles like "Opening & Welcome" or "Settling In"
- "The listener", "the audience", or any meta-commentary
- Conflict, danger, tension, or urgency
- Overuse of "you" — never more than once every 3 sentences

═══════════════════════════════════════
PROJECT DETAILS
═══════════════════════════════════════
- Story setting / topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
- Total chapters: ${numBatches}

CHAPTER ARC:
${chapterArcHints.join('\n')}

EXAMPLE GOOD SYNOPSIS (Alexandria, evening):
"The harbour has grown quiet. The last fishing boats rock gently on their moorings, their reflections fractured on the dark water below. The air carries salt and something faintly sweet — jasmine from the terraces above the old seawall. You walk slowly along the edge, one hand trailing the worn stone. A lantern hangs at the end of a jetty, swaying very slightly in a breeze you can barely feel. Somewhere behind you, the city hums softly — voices, the clink of glass, music from an open door. But out here it is almost still. The water makes small sounds against the hull of a wooden boat. You stop and watch the light move on the surface."

Return only valid JSON:
{
  "storytelling_format": "sleep story",
  "pov": "second_person",
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Evocative chapter title (3-6 words — NOT 'Opening', NOT 'Welcome', NOT 'Settling In')",
      "focus_area": "One sentence: where the listener is and what is happening around them",
      "synopsis": "200-300 words. Specific named location. Rich layered sensory detail. 'You' used sparingly — no more than once every 3-4 sentences. Present tense. Zero affirmations. Zero breathing cues. Zero named protagonist."
    }
  ]
}

Generate exactly ${numBatches} chapters.`;
}

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

  return `You are an elite viral content strategist and YouTube scriptwriter using the TL VIRAL FORMULA (TVF).

**THE 8 TVF PHASES** (every script MUST hit all 8 in order):
${TVF_PHASES.map((p, i) => `  ${i + 1}. ${p.phase}: ${p.purpose}`).join('\n')}
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
      "synopsis": "EXTREMELY DETAILED synopsis (150-250 words). Must cover: exact narrative beats, specific facts/events/anecdotes, emotional triggers, curiosity gaps, pacing rhythm, scroll-stopping moments, how it opens and ends."
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
- **BATCH 1 HOOK PACING LAW**: The synopsis for Batch 1 must describe an opening of 4-6 ultra-short sentences (2-5 words each, staccato rhythm, no filler). After those hook sentences the pacing opens up to normal 8-15 word sentences. Describe the exact hook sentences to use in the synopsis.`;
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

    const topics = project.selected_topic_id
      ? await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id })
      : [];
    const topic = topics[0] || null;

    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0] || null;
    }

    const resolvedScriptMode = detectScriptMode(channel, project);
    const isSleepMode   = resolvedScriptMode === 'sleep_meditation' || resolvedScriptMode === 'sleep_story';
    const isSleepStory  = resolvedScriptMode === 'sleep_story';
    const isMeditation  = resolvedScriptMode === 'sleep_meditation';

    console.log(`[initializeScriptBatches] mode=${resolvedScriptMode} channel=${channel?.name || 'none'}`);

    // ── Strategy block (standard mode only) ──
    let strategyBlock = '';
    if (!isSleepMode) {
      const raw = project.script_strategy_override || channel?.script_strategy || '';
      if (raw) {
        try {
          const strat = typeof raw === 'string' ? JSON.parse(raw) : raw;
          strategyBlock = `\n**NICHE-SPECIFIC SCRIPT STRATEGY**:
- Hook Formula: ${strat.hook_formula || 'N/A'}
- Structure: ${Array.isArray(strat.structure) ? strat.structure.join(' → ') : (strat.structure || 'N/A')}
- Tone: ${strat.tone || 'N/A'}
- Pacing: ${strat.pacing || 'N/A'}
- Retention Tricks: ${strat.retention_tricks || strat.retention || 'N/A'}
- CTA Style: ${strat.cta_style || strat.cta || 'N/A'}\n`;
        } catch (_) {
          strategyBlock = `\n**NICHE STRATEGY NOTES**: ${raw}\n`;
        }
      }
    }

    // Sleep projects don't use hooks
    let selectedHook = null;
    if (!isSleepMode && project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0] || null;
    }

    // ── Word / batch math ──
    const durationMinutes   = project.video_duration_minutes || 10;
    const totalTargetWords  = Math.round(durationMinutes * 150);
    const batchTargets      = computeBatchTargets(totalTargetWords, resolvedScriptMode);
    const numBatches        = batchTargets.length;

    console.log(`[initializeScriptBatches] ${durationMinutes}min → ${totalTargetWords}w → ${numBatches} batches → targets: [${batchTargets.join(', ')}]`);

    // ── Delete existing batches ──
    const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const b of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(b.id);
    }

    // ── Build outline prompt ──
    const promptArgs = { topic, project, channel, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock };
    let outlinePrompt;
    if (isMeditation)      outlinePrompt = buildMeditationOutlinePrompt(promptArgs);
    else if (isSleepStory) outlinePrompt = buildSleepStoryOutlinePrompt(promptArgs);
    else                   outlinePrompt = buildStandardOutlinePrompt(promptArgs);

    const temperature = isSleepStory ? 0.85 : isMeditation ? 0.6 : 0.7;
    const outlineResult = await callLLM(outlinePrompt, temperature);

    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error('AI failed to generate outline batches');
    }

    // ── Sleep story: sanitize synopses — strip any named protagonist or meditation bleed-through ──
    if (isSleepStory) {
      for (const b of outlineResult.batches) {
        b.synopsis = b.synopsis
          // Remove any [PAUSE] / [BREATHE] markers that leaked in
          .replace(/\[PAUSE[^\]]*\]/gi, '')
          .replace(/\[BREATHE\]/gi, '')
          // Strip accidental affirmation clusters
          .replace(/you are (safe|loved|enough|at peace|where you need to be)[.,]?/gi, '')
          // Collapse double spaces left behind
          .replace(/  +/g, ' ')
          .trim();
      }
    }

    // ── Create batch records ──
    const createdBatches = [];
    for (let i = 0; i < numBatches; i++) {
      const aiBatch = outlineResult.batches[i];
      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number:  i + 1,
        story_segment: aiBatch?.story_segment || `Part ${i + 1}`,
        focus_area:    aiBatch?.focus_area    || `Part ${i + 1}`,
        synopsis:      aiBatch?.synopsis      || `Write approximately ${batchTargets[i]} words for part ${i + 1}.`,
        target_words:  batchTargets[i],
        status:        'pending',
      });
      createdBatches.push(batch);
    }

    // ── Update project ──
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status:       'scripting',
      current_step: 3,
      project_mode: isSleepMode ? resolvedScriptMode : (project.project_mode || ''),
    });

    console.log(`[initializeScriptBatches] ✅ ${createdBatches.length} batches created (${resolvedScriptMode})`);

    return Response.json({
      success:           true,
      batches_created:   createdBatches.length,
      total_target_words: totalTargetWords,
      duration_minutes:  durationMinutes,
      script_mode:       resolvedScriptMode,
      batch_targets:     batchTargets,
      pov:               isSleepStory ? 'second_person' : undefined,
      batches:           createdBatches,
    });

  } catch (error) {
    console.error('[initializeScriptBatches] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});