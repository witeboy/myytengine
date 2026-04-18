import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v5 — Claude primary + Gemini fallback; sleep mode split into story + meditation writers

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

async function callClaude(prompt, temperature = 0.85, retries = 2) {
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
      console.warn(`⏳ Claude rate limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Claude error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    try { return JSON.parse(rawText); } catch (_) {}

    let jsonStr = rawText;
    if (rawText.includes('```json')) {
      jsonStr = rawText.split('```json')[1].split('```')[0].trim();
    } else if (rawText.includes('```')) {
      jsonStr = rawText.split('```')[1].split('```')[0].trim();
    }
    try { return JSON.parse(jsonStr); } catch (_) {}

    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch (_) {}
    }

    if (attempt === retries) throw new Error('Failed to parse Claude JSON after all attempts');
    console.log(`[Claude] JSON parse failed (attempt ${attempt + 1}), retrying...`);
  }
}

async function callGemini(prompt, temperature = 0.85, retries = 2) {
  const model = 'gemini-2.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (response.status === 429) {
      const waitMs = Math.pow(2, attempt + 1) * 3000;
      console.warn(`⏳ Gemini rate limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    try { return JSON.parse(rawText); } catch (_) {}

    let jsonStr = rawText;
    if (rawText.includes('```json')) {
      jsonStr = rawText.split('```json')[1].split('```')[0].trim();
    } else if (rawText.includes('```')) {
      jsonStr = rawText.split('```')[1].split('```')[0].trim();
    }
    try { return JSON.parse(jsonStr); } catch (_) {}

    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch (_) {}
    }

    if (attempt === retries) throw new Error('Failed to parse Gemini JSON after all attempts');
    console.log(`[Gemini] JSON parse failed (attempt ${attempt + 1}), retrying...`);
  }
}

async function callLLM(prompt, temperature = 0.85) {
  try {
    const result = await callClaude(prompt, temperature);
    return { result, provider: 'claude' };
  } catch (claudeErr) {
    const msg = claudeErr.message || '';
    const isFatal = /credit balance|billing|purchase credits|api key|unauthorized/i.test(msg);
    console.warn(`[LLM] Claude failed${isFatal ? ' (fatal — switching to Gemini)' : ''}: ${msg.substring(0, 120)}`);
    if (!GEMINI_KEY) throw claudeErr;
    console.log('[LLM] Falling back to Gemini 2.5 Pro...');
    const result = await callGemini(prompt, temperature);
    return { result, provider: 'gemini' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP WRITER — routes to story vs meditation
// ═══════════════════════════════════════════════════════════════════
function buildSleepWritingPrompt(args) {
  return args.scriptMode === 'sleep_story'
    ? buildSleepStoryWritingPrompt(args)
    : buildSleepMeditationWritingPrompt(args);
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP STORY WRITER — immersive bedtime narrative
// ═══════════════════════════════════════════════════════════════════
function buildSleepStoryWritingPrompt({ batch, project, topic, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch }) {
  const title = topic?.title || project.name;
  const description = topic?.description || '';

  return `You are a master bedtime-story writer in the tradition of Calm's Sleep Stories (Stephen Fry, Matthew McConaughey), Headspace Sleepcasts, and the Nothing Much Happens podcast. You write immersive, slow-unfolding prose that carries a listener gently into sleep.

**═══ YOU ARE WRITING A STORY. NOT A MEDITATION. ═══**

This is a STORY. You are NOT a meditation guide. You are a storyteller sitting at the bedside, telling a soft, beautiful tale that the listener drifts off inside.

**HARD DIFFERENCES FROM MEDITATION**:
❌ DO NOT write affirmations ("you are safe," "you are enough," "you deserve rest")
❌ DO NOT give breathing instructions ("breathe in, breathe out," "notice your breath")
❌ DO NOT do body scans ("feel your feet, feel your legs, feel your shoulders")
❌ DO NOT use generic nature-metaphor clichés unless they're literal parts of the story's setting
❌ DO NOT address the listener's feelings, emotions, or inner state
❌ DO NOT say "let go" or "release" abstract things
❌ DO NOT repeat phrases as affirmations

✅ INSTEAD, write ACTUAL STORY PROSE:
- Describe SPECIFIC PLACES (a lighthouse, a harbor, a cottage, a train car, a garden)
- Describe SPECIFIC OBJECTS (an oil lamp, a kettle, a wool blanket, a wooden stool)
- Describe SPECIFIC SMALL EVENTS (water boiling, a page turning, a cat stretching, a door closing)
- Use the FIVE SENSES constantly (sight, sound, smell, touch, taste)
- Let scenes WANDER — the reader should feel time slow
- Use gentle rhythmic prose — not broken-up single sentences with pauses after each

**═══ STORY WORLD ═══**
Title: **"${title}"**
${description ? `Description: ${description}` : ''}

Everything you write must belong to the world this title promises. If the title is "A Quiet Night at the Lighthouse," we are at a lighthouse. If the title is "The Lavender Fields of Provence," we are in a Provence lavender field. The world is already set — your job is to live in it.

**═══ YOUR SECTION ═══**

You are writing **Section ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

Section purpose: ${batch.focus_area}

**DETAILED BLUEPRINT FOR THIS SECTION** (follow closely — this defines what happens):
${batch.synopsis}

**FULL STORY ARC** (so you know where this section fits):
${outlineContext}

${previousContent ? `**PREVIOUSLY WRITTEN** (continue seamlessly from where this left off — do NOT repeat):\n${previousContent.slice(-3500)}\n` : ''}

**═══ WORD COUNT ═══**
Write AT LEAST **${batch.target_words} words**. This is non-negotiable. To reach this, WANDER — describe objects more slowly, add small detours (what the cat is doing, what the light looks like through the window, what can be heard in the distance), linger on textures and colors. Don't pad with affirmations or repetition — pad with richer sensory detail.

**═══ VOICE & CRAFT ═══**

**Prose style**: Gentle, warm, slightly old-fashioned. Think of a grandparent telling a bedtime tale. Unhurried. Flowing sentences mixed with short, soft ones. Rhythmic. Melodic. Occasional poetic touches, never purple.

**Point of view**: ${isFirstBatch ? 'Open by placing the listener into the world — "you" can be used sparingly as a way to invite them in, but shift quickly to describing the world and its characters. Think "Imagine a small cottage at the edge of a lavender field. The evening light is the color of honey..."' : 'Stay in the world. Continue the narrative thread from where the last section ended.'}

**Tense**: Present tense preferred — it's immersive and dreamlike.

**Sentence rhythm**:
- Mix short sentences (5-12 words) with longer, flowing ones (20-35 words)
- Use commas generously — they create the cadence of slow breath
- Occasionally let a sentence run long and gentle, like a thought drifting
- Use soft conjunctions: "and," "as," "while"

**Pauses**: Include [PAUSE 3 SEC] or [PAUSE 5 SEC] markers at NATURAL scene transitions or moments of stillness — maybe 4-8 times across the section. DO NOT pause after every sentence — that shatters the story's flow. Pause when a moment has landed and deserves to breathe.

**Sensory richness (use ALL of these in every section)**:
- SIGHT: colors, shapes, light quality, small visual details
- SOUND: gentle sounds — rain, a kettle, distant bells, a page turning, a cat purring
- SMELL: wood smoke, bread, old paper, sea salt, lavender, tea
- TOUCH: textures — wool, warm stone, smooth wood, soft cotton
- TASTE: only when relevant (tea, bread, honey)

**Characters (if any)**: Sketch them lightly — a lighthouse keeper with silver hair, a baker with flour on her apron, a train conductor with a kind smile. Give them quiet, simple actions. They never speak dialogue with tension — they might hum, whisper a word, or move silently.

**═══ ${isFirstBatch ? 'THIS IS THE OPENING — SECTION 1' : isLastBatch ? 'THIS IS THE FINAL SECTION — DESCENT INTO DREAM' : 'THIS IS A MIDDLE SECTION — THE STORY UNFOLDS'} ═══**

${isFirstBatch ? `Open by gently placing the listener into the world. Use a soft welcoming rhythm. Example opening patterns:
- "Imagine a small [place]. The light is [color]. The air smells of [smell]..."
- "Somewhere, in a quiet [setting], a [character] is [doing small peaceful thing]..."
- "Tonight, we travel together to [place]. It is [time of day]. The [thing] is [doing something]..."

Establish the WORLD: place, time of day, weather, light, smells, sounds. Introduce any character with gentle detail. Do NOT start with "close your eyes" or "breathe in." Start with STORY. Within the first 60 words, the listener should know exactly where they are.` : isLastBatch ? `This is the DESCENT INTO DREAM. The story is ending, but not with a conclusion — it's fading, like someone telling a story whose voice is growing quieter.

Write in SHORTER, SOFTER sentences as the section progresses. Return to IMAGES from earlier in the story — the lamp still burning, the cat still sleeping, the kettle cooling — like echoes. Use fragments toward the end. Use more [PAUSE 5 SEC] and [PAUSE 10 SEC] markers in the final third. The last 100 words should feel like a candle slowly guttering out.

End on a VERY gentle fragment or two — like the story itself is falling asleep. Something like:
"...the lamp, still glowing. The sea, still breathing, in and out. And the night, so quiet now... [PAUSE 10 SEC] ...so very quiet..."

NO "goodnight, sleep well, thank you for listening." Just the story fading to silence.` : `Continue the story seamlessly from where the previous section ended. This is where the story UNFOLDS — a small scene, a quiet event, a moment of observation. Let it breathe. Let it wander. Describe lovingly and slowly. End by gently handing off to the next section — a character moving toward the next place, a light dimming, a sound fading.`}

**═══ RETURN FORMAT ═══**

Return JSON:
{
  "content": "The full prose for this section, including any [PAUSE X SEC] markers where they feel natural. Write it as flowing, beautiful storytelling prose — not as a list of instructions.",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP MEDITATION WRITER — theme-aware affirmation flow
// ═══════════════════════════════════════════════════════════════════
function buildSleepMeditationWritingPrompt({ batch, project, topic, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch }) {
  const title = topic?.title || project.name;
  const description = topic?.description || '';

  return `You are an expert sleep-meditation writer in the tradition of Jason Stephenson and Michael Sealey. You write guided meditations that carry the listener into deep, peaceful sleep.

**═══ CRITICAL — READ FIRST ═══**

You are writing the ACTUAL spoken meditation — the words the narrator says aloud. Every affirmation and every image must serve the specific theme of the title: **"${title}"**
${description ? `(${description})` : ''}

Do NOT default to generic "you are enough" content unless the title demands it. Read the title. Understand what the listener needs. Write affirmations that answer THAT need.

**ABSOLUTELY FORBIDDEN**:
❌ Explaining what meditation, ASMR, or affirmations are
❌ Neuroscience, dopamine, oxytocin, "studies show"
❌ Sleep tips, caffeine advice, screen-time advice
❌ Referencing YouTube, videos, or channels
❌ First-person anecdotes
❌ Any meta-commentary about the meditation itself
❌ Tension, urgency, surprises, questions that require thinking
❌ Energizing words

**═══ YOUR SECTION ═══**

You are writing **Section ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

Section purpose: ${batch.focus_area}

**DETAILED BLUEPRINT FOR THIS SECTION**:
${batch.synopsis}

**FULL MEDITATION ARC**:
${outlineContext}

${previousContent ? `**PREVIOUSLY WRITTEN** (continue seamlessly — do NOT repeat):\n${previousContent.slice(-3500)}\n` : ''}

**═══ WORD COUNT ═══**
Write AT LEAST **${batch.target_words} words**. To reach this, layer the section's affirmation with more repetition, more nature imagery, more [PAUSE] markers, more permission phrases.

**═══ CRAFT RULES ═══**

**Tone**: Extremely gentle. Deliberately monotonous (monotony is good for sleep). Hypnotic. Each key phrase stated, then restated 3-5 times in subtle variations.

**Voice**: Second-person "you." Speak directly to the listener as their gentle guide.

**Sentences**: Short (8-18 words). Soft consonants. Avoid harsh sounds.

**Pauses**: Include generous [PAUSE 3 SEC], [PAUSE 5 SEC], [PAUSE 10 SEC], [BREATHE] markers — every 2-3 sentences is normal for meditations.

**Permission phrases** (use liberally): "You don't have to...", "It's okay to...", "Allow yourself to...", "Let yourself...", "There's no need to..."

**Nature imagery**: Weave in ocean, mountain, tree, river, moon, stars — but let the title's theme guide which images feel right.

**Section rhythm**: Introduce affirmation softly → [PAUSE] → repeat with slight variation → [PAUSE] → blend with nature imagery → [BREATHE] → return as whisper → [PAUSE 5 SEC]

**═══ ${isFirstBatch ? 'OPENING SECTION' : isLastBatch ? 'FINAL SECTION — DESCENT TO SLEEP' : 'MIDDLE SECTION'} ═══**

${isFirstBatch ? `Start with a gentle welcome. Settle the listener physically (body sinking, pillows, warmth). Guide 2-3 slow breaths with [BREATHE] markers. Then ease into the theme through imagery — NOT by explaining what you're about to do.` : isLastBatch ? `Final section — gentlest, most minimal. Long pauses. Short fragments. Echo earlier affirmations softly. End with: "Rest now... peaceful dreams... [PAUSE 10 SEC] ...so safe... so still..." fading to silence. No "goodnight" or meta-commentary.` : `Continue the deepening arc. The affirmation of this section should feel like a natural next wave after the last. Bridge gently to the next section at the end.`}

**═══ RETURN FORMAT ═══**

Return JSON:
{
  "content": "The full meditation text for this section, with all [PAUSE X SEC] and [BREATHE] markers in natural places.",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// STANDARD VIRAL SCRIPT WRITING PROMPT
// ═══════════════════════════════════════════════════════════════════
function buildStandardWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  return `You are an elite YouTube scriptwriter creating a viral narration script.

**PROJECT CONTEXT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'General'}
- Tone: ${project.tone || 'dramatic'}
- Video Duration: ${project.video_duration_minutes || 10} minutes
- Orientation: ${project.orientation || 'landscape'}
${selectedHook && isFirstBatch ? `- Opening Hook (MUST use as first line): "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**FULL STORY ARC** (all batches):
${outlineContext}

**YOU ARE NOW WRITING BATCH ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**BATCH SYNOPSIS** (follow this closely):
${batch.synopsis}

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. This is NON-NEGOTIABLE. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Count your words. Add more detail, more anecdotes, more specific examples, more emotional beats until you reach the target. The video NEEDS this many words to fill its timeslot (150 words = 1 minute of narration).

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**WRITING RULES**:
1. Write ONLY narration text — words the narrator will speak aloud
2. NO scene directions, NO [SCENE:], NO [VISUAL:], NO stage directions
3. NO "In this video", NO "Welcome back", NO meta-commentary
4. Every sentence must EARN its place — zero filler
5. Mix punchy short sentences (3-7 words) with flowing longer ones (20-30 words)
6. Include micro-hooks every 60-90 seconds ("But that wasn't the real story...", "What happened next changed everything...")
7. ${isFirstBatch ? 'Open STRONG — the first 5 seconds determine if they stay' : 'Continue seamlessly from where the previous batch ended'}
8. ${isLastBatch ? 'End with a powerful closing line — memorable, quotable, perspective-shifting. Include a subtle CTA.' : 'End on a cliffhanger or curiosity hook that pulls into the next batch'}
9. Use specific details: names, numbers, dates, places — not vague generalities
10. Write for the EAR, not the eye — natural spoken rhythm, not essay prose

Return JSON:
{
  "content": "The full narration text for this batch...",
  "word_count": 1234
}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    let selectedHook = null;
    if (project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0];
    }

    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

    const scriptMode = project.project_mode && (project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story')
      ? project.project_mode
      : 'standard';
    const isSleepMode = scriptMode !== 'standard';

    console.log(`[generateScriptBatches] Script mode: ${scriptMode}`);

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
        strategyBlock = `
**NICHE-SPECIFIC SCRIPT STRATEGY** (YOU MUST follow this writing style):
- Hook Formula: ${strat.hook_formula || 'N/A'}
- Structure: ${Array.isArray(strat.structure) ? strat.structure.join(' → ') : (strat.structure || 'N/A')}
- Tone: ${strat.tone || 'N/A'}
- Pacing: ${strat.pacing || 'N/A'}
- Retention Tricks: ${strat.retention_tricks || strat.retention || 'N/A'}
- CTA Style: ${strat.cta_style || strat.cta || 'N/A'}
`;
      } catch (_) {
        strategyBlock = `\n**NICHE STRATEGY NOTES**: ${scriptStrategy}\n`;
      }
    }

    const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const sortedBatches = allBatches.sort((a, b) => a.batch_number - b.batch_number);
    const pendingBatches = sortedBatches.filter(b => b.status === 'pending' || b.status === 'generating');

    if (pendingBatches.length === 0) {
      return Response.json({ success: true, message: 'No pending batches to generate', completed: 0, done: true });
    }

    console.log(`[generateScriptBatches] ${pendingBatches.length} pending batches for project ${project_id}`);

    const completedBatches = sortedBatches.filter(b => b.status === 'completed' && b.content);
    let completedCount = 0;
    const batch = pendingBatches[0];

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: 'generating' });

    const previousContent = completedBatches
      .concat(sortedBatches.filter(b => b.status === 'completed' && b.content && !completedBatches.find(c => c.id === b.id)))
      .sort((a, b) => a.batch_number - b.batch_number)
      .map(b => `--- BATCH ${b.batch_number}: ${b.story_segment} ---\n${b.content}`)
      .join('\n\n');

    const isFirstBatch = batch.batch_number === 1;
    const isLastBatch = batch.batch_number === sortedBatches.length;

    const outlineContext = sortedBatches
      .map(b => `Batch ${b.batch_number} "${b.story_segment}": ${b.focus_area}`)
      .join('\n');

    const promptArgs = {
      batch, project, topic, selectedHook, sortedBatches,
      previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock
    };

    const prompt = isSleepMode
      ? buildSleepWritingPrompt({ ...promptArgs, scriptMode })
      : buildStandardWritingPrompt(promptArgs);

    console.log(`[Batch ${batch.batch_number}] Generating ~${batch.target_words} words (${scriptMode})...`);

    const baseTemp = isSleepMode ? 0.7 : 0.85;
    const minWords = Math.round(batch.target_words * 0.92);
    let content = '';
    let wordCount = 0;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let currentPrompt;
      if (attempt === 1 || !content) {
        currentPrompt = prompt;
      } else {
        const wordsNeeded = batch.target_words - wordCount;
        currentPrompt = `You previously wrote the following script section but it was too short (${wordCount} words, need ${batch.target_words}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this section. Maintain the same tone, style, and pacing. ${isSleepMode ? 'Add more sensory detail, more specific objects, more small events, more textures — not more repetition.' : 'Add more detail, more anecdotes, more specific examples, more emotional beats.'}

Return JSON:
{"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
      }

      const { result, provider } = await callLLM(currentPrompt, baseTemp);
      if (attempt === 1) console.log(`[Batch ${batch.batch_number}] Using ${provider}`);
      const newContent = result.content || '';

      if (attempt > 1 && content) {
        content = content.trim() + '\n\n' + newContent.trim();
      } else {
        content = newContent;
      }
      wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

      if (wordCount >= minWords || attempt === MAX_ATTEMPTS) {
        if (wordCount < minWords) {
          console.warn(`[Batch ${batch.batch_number}] ⚠️ Only ${wordCount}/${batch.target_words} words after ${MAX_ATTEMPTS} attempts — accepting`);
        }
        break;
      }
      console.log(`[Batch ${batch.batch_number}] ⚠️ Only ${wordCount}/${batch.target_words} words (attempt ${attempt}/${MAX_ATTEMPTS}) — extending...`);
    }

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
      content: content,
      word_count: wordCount,
      status: 'completed'
    });

    completedCount++;
    console.log(`[Batch ${batch.batch_number}] ✅ ${wordCount} words written (${scriptMode})`);

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3
    });

    const remainingPending = sortedBatches.filter(b =>
      b.id !== batch.id && (b.status === 'pending' || b.status === 'generating')
    ).length;
    const allDone = remainingPending === 0;

    console.log(`[generateScriptBatches] Completed batch ${batch.batch_number}. ${remainingPending} remaining.`);

    return Response.json({
      success: true,
      completed: completedCount,
      total_batches: sortedBatches.length,
      remaining: remainingPending,
      done: allDone,
      script_mode: scriptMode
    });
  } catch (error) {
    console.error('generateScriptBatches error:', error.message);
    const msg = error.message || 'Unknown error';
    let code = 500;
    if (/credit balance|billing|purchase credits/i.test(msg)) code = 402;
    else if (/rate limit|too many requests/i.test(msg)) code = 429;
    else if (/api key|unauthorized|authentication/i.test(msg)) code = 401;
    return Response.json({ error: msg }, { status: code });
  }
});