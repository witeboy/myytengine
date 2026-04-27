import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v5 — Claude primary + Gemini fallback — SLEEP STORY FIX: fully separated from meditation

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

    // Extract JSON from response
    try { return JSON.parse(rawText); } catch (_) {}

    // Try extracting from markdown code blocks
    let jsonStr = rawText;
    if (rawText.includes('```json')) {
      jsonStr = rawText.split('```json')[1].split('```')[0].trim();
    } else if (rawText.includes('```')) {
      jsonStr = rawText.split('```')[1].split('```')[0].trim();
    }
    try { return JSON.parse(jsonStr); } catch (_) {}

    // Try extracting just the JSON object
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch (_) {}
    }

    if (attempt === retries) throw new Error('Failed to parse Claude JSON after all attempts');
    console.log(`[Claude] JSON parse failed (attempt ${attempt + 1}), retrying...`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// GEMINI FALLBACK — gemini-2.5-pro for best creative writing
// ═══════════════════════════════════════════════════════════════════
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

    // Parse JSON
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

// ═══════════════════════════════════════════════════════════════════
// UNIFIED LLM CALLER — Claude primary, Gemini fallback
// ═══════════════════════════════════════════════════════════════════
async function callLLM(prompt, temperature = 0.85) {
  // Try Claude first
  try {
    const result = await callClaude(prompt, temperature);
    return { result, provider: 'claude' };
  } catch (claudeErr) {
    const msg = claudeErr.message || '';
    const isFatal = /credit balance|billing|purchase credits|api key|unauthorized/i.test(msg);
    console.warn(`[LLM] Claude failed${isFatal ? ' (fatal — switching to Gemini)' : ''}: ${msg.substring(0, 120)}`);

    if (!GEMINI_KEY) throw claudeErr; // No fallback available

    // Fall back to Gemini
    console.log('[LLM] Falling back to Gemini 2.5 Pro...');
    const result = await callGemini(prompt, temperature);
    return { result, provider: 'gemini' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// ROUTER — dispatches to the correct sleep prompt
// ═══════════════════════════════════════════════════════════════════
function buildSleepWritingPrompt({ scriptMode, batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  if (scriptMode === 'sleep_story') {
    return buildSleepStoryWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock });
  }
  return buildSleepMeditationWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock });
}

// ═══════════════════════════════════════════════════════════════════
// MEDITATION WRITING PROMPT — affirmations, second-person, breathing
// ═══════════════════════════════════════════════════════════════════
function buildSleepMeditationWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  return `You are an expert sleep audio script writer. You create professional-grade bedtime motivational meditations following the proven format of top sleep channels (Jason Stephenson, Michael Sealey, The Honest Guys).

**CRITICAL RULE**: You are writing the ACTUAL meditation script — the words the narrator speaks. You are NOT writing ABOUT meditation. You ARE the soothing voice guiding someone to sleep.

**ABSOLUTELY FORBIDDEN CONTENT**:
❌ Explaining what ASMR is, how it works, or its benefits
❌ Mentioning dopamine, oxytocin, neuroscience, or "studies show"
❌ Giving practical sleep tips (caffeine, screen time, sleep schedule)
❌ Referencing "this video", "this channel", or YouTube
❌ First-person anecdotes ("I remember when I...")
❌ Educational content of any kind
❌ Defining meditation, affirmations, or relaxation techniques
❌ Any meta-commentary about what the script is doing
❌ Conflict, tension, danger, stress, urgency, surprises

**PROJECT CONTEXT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Content Type: Motivational Meditation
- Duration: ${project.video_duration_minutes || 10} minutes total
${selectedHook && isFirstBatch ? `- Opening line: "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**FULL SCRIPT ARC** (all sections):
${outlineContext}

**YOU ARE NOW WRITING SECTION ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**SECTION SYNOPSIS** (follow this closely):
${batch.synopsis}

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. NON-NEGOTIABLE. If under ${Math.round(batch.target_words * 0.9)} words, FAILURE. Add more repetition, imagery, [PAUSE] markers. 150 words = 1 minute.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ WRITING STYLE RULES ═══**

**TONE & DELIVERY**:
- Extremely gentle, warm, and soothing — deliberately slow and monotonous
- Hypnotic, trance-inducing rhythm — repetition is your primary tool
- Each key concept stated, then restated 3-5 times in different words
- Progressive deepening: each paragraph calmer and slower than the last

**LANGUAGE**:
- Simple vocabulary — short sentences (8-18 words)
- Second-person "you" — speak directly to the listener as their gentle guide
- Soft consonants preferred — avoid harsh sounds (k, t, hard g)

**PAUSE MARKERS** (ESSENTIAL — include generously):
- [PAUSE 3 SEC] — after key phrases
- [PAUSE 5 SEC] — between thoughts
- [PAUSE 10 SEC] — between major sections
- [BREATHE] — breathing cue
- Use pauses every 2-3 sentences minimum

**SENSORY GROUNDING** (weave throughout):
- Touch: weight of blankets, softness, warmth, gentle pressure
- Sound: rain, ocean waves, rustling leaves, distant gentle sounds
- Sight: soft darkness, starlight, candlelight, gentle colors
- Smell: rain, flowers, wood smoke, fresh air

**NATURE METAPHORS** (core imagery):
- Ocean: vast, constant, waves matching breath
- Mountain: stable, grounded, enduring
- Tree: rooted, growing, patient
- River: flowing, releasing, natural path
- Moon & Stars: gentle light, constant presence

**MEDITATION SECTION STRUCTURE**:
1. Soft Opening — imagery that embodies the theme
2. Energetic Settling — guide awareness inward with soft suggestions
3. Core Affirmation — introduce softly, like a thought
4. Affirmation Expansion — repeat with slight variations
5. Imagery Weaving — blend affirmation with nature imagery
6. Embodied Awareness — breath, body, weight, warmth (invitations, not commands)
7. Breath Rhythm — [BREATHE] cues, expanding intervals
8. Affirmation Deepening — softer, more abstract forms
9. Drift State — reduced language density, longer pauses
10. Seamless Descent — fade into calm, no conclusion

AFFIRMATION FORMAT: State simply → pause → restate → pause → elaborate with imagery → pause → restate again.

**PERMISSION & RELEASE PHRASES** (use liberally):
"You don't have to...", "There's no need to...", "It's okay to...", "Let yourself...", "Allow...", "Release..."

**ANCHORING PHRASES** (repeat every few minutes):
"Safe... held... at peace...", "Let it go... just for now...", "Rest now...", "You are safe here..."

**${isFirstBatch ? 'OPENING: Start with a gentle welcome. Settle the listener physically. Guide 3 slow breaths with [BREATHE] markers. Then ease into the first theme through imagery.' : 'Continue seamlessly from where the previous section ended.'}**
**${isLastBatch ? 'ENDING: Gentlest, most minimal content. Fewer words, more pauses. End with: "Rest now... peaceful dreams... [PAUSE 10 SEC]" then fade to near-silence.' : 'End by gently deepening relaxation, bridging naturally to the next theme.'}**

Return JSON:
{
  "content": "The full meditation script text including all [PAUSE X SEC] and [BREATHE] markers...",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP STORY WRITING PROMPT — real narrative, NOT meditation
// ═══════════════════════════════════════════════════════════════════
function buildSleepStoryWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  // Auto-detect and override meditation bleed in the synopsis
  const meditationBleedPatterns = /\b(affirmation|breathe in|breathe out|body awareness|you are safe|you are loved|you are enough|settle into|settling in|guided relaxation|body scan|feel your body|take a deep breath|opening & welcome|physical settling)\b/i;
  let cleanSynopsis = batch.synopsis;
  if (meditationBleedPatterns.test(batch.synopsis)) {
    console.warn(`[Batch ${batch.batch_number}] ⚠️ MEDITATION BLEED detected in synopsis — overriding`);
    cleanSynopsis = `[MEDITATION CONTENT DETECTED — IGNORE SYNOPSIS AND REPLACE] Write a genuine story scene for "${batch.story_segment}". The protagonist (use the same name from earlier batches or introduce one) performs a peaceful, concrete activity in a specific setting. Describe what they see, hear, smell, and touch. NO affirmations, NO breathing cues, NO second-person "you". Write a real narrative scene.`;
  }

  return `You are an expert bedtime story writer. You write REAL STORIES — narratives with named characters, specific settings, and gentle adventures told in a lullaby-like cadence. Adults fall asleep to your stories because they are warm, immersive, and soothing — NOT because you tell them to relax.

**═══ WHAT YOU ARE ═══**
You are a storyteller. Think: Calm app sleep stories, Headspace sleepcasts, a soothing audiobook.
You tell stories about characters doing things in beautiful places.

**═══ WHAT YOU ARE NOT ═══**
You are NOT a meditation guide. You do NOT write affirmations. You do NOT address the listener.

**HARD RULES — VIOLATING ANY OF THESE IS A COMPLETE FAILURE**:

❌ NEVER use second-person "you" ("you feel calm", "you notice the stars", "you breathe deeply")
   CORRECT: "Elena feels the warmth of the fire" / "Thomas notices the stars"
❌ NEVER write affirmations ("you are safe", "you are loved", "you are enough", "you deserve rest")
❌ NEVER include breathing instructions ("take a deep breath", "breathe in", "feel your breath", [BREATHE])
❌ NEVER include body scan language ("feel your body", "your shoulders relax", "sink into your pillow")
❌ NEVER address "the listener" or break the fourth wall
❌ NEVER write "Opening & Welcome" content — no settling, no grounding, no "welcome to this story"
❌ NEVER use permission phrases ("you don't have to...", "let yourself...", "it's okay to...")
❌ NEVER use anchoring phrases ("safe... held... at peace...", "rest now...")
❌ NO conflict, tension, danger, urgency, or surprises
❌ NO educational content, advice, or meta-commentary

**WRONG vs RIGHT**:

WRONG (meditation bleed — NEVER write this):
"You feel the warmth of the blankets around you... you are safe here... take a deep breath and let yourself sink deeper... you don't have to do anything... just rest... you are enough..."

RIGHT (actual bedtime story):
"Elena pulls the quilt up to her chin and watches the last ember glow orange in the fireplace. The cottage smells of pine and old books. Outside, rain taps against the window in a gentle, unhurried rhythm. She listens to it for a long while, her eyes half-closed, the warmth of the fire still reaching her across the room. [PAUSE 5 SEC] A barn owl calls somewhere in the distance — a soft, hollow sound that seems to come from the woods beyond the garden wall."

**PROJECT CONTEXT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Content Type: SLEEP STORY (narrative fiction — NOT meditation)
- Duration: ${project.video_duration_minutes || 10} minutes total
${selectedHook && isFirstBatch ? `- Opening line: "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**FULL STORY ARC** (all chapters):
${outlineContext}

**YOU ARE NOW WRITING CHAPTER ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**CHAPTER SYNOPSIS** (if it contains meditation language, override with real story content):
${cleanSynopsis}

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. NON-NEGOTIABLE. If under ${Math.round(batch.target_words * 0.9)} words, FAILURE. Add more sensory descriptions, more character actions, more atmospheric texture, more [PAUSE] markers. 150 words = 1 minute.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity — keep same protagonist name, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ STORY WRITING RULES ═══**

**NARRATIVE VOICE**:
- Third-person, present tense: "Elena walks", "Thomas stirs the pot", "Amara watches"
- Warm, gentle, unhurried — like a lullaby told by a favorite grandparent
- Descriptive and immersive — the listener should SEE the world
- Deliberately slow pacing — linger on details, don't rush

**CHARACTER**:
- Named protagonist (use the name from previous batches if continuing)
- Content, peaceful, gently curious — never anxious, rushed, or worried
- Show the character DOING things: walking, cooking, gardening, reading, sailing, painting
- Show quiet enjoyment through actions, not by telling the listener how to feel

**SETTING & SENSORY DETAIL**:
- Specific, vivid settings — "a whitewashed cottage overlooking a turquoise bay"
- Sight: colors, light quality, shapes, distances
- Sound: birdsong, water, wind, fire crackling, distant music
- Smell: flowers, rain, bread baking, pine, sea salt
- Touch: textures, temperatures, grass, stone, fabric, water
- Taste: when relevant — tea, fruit, bread, honey

**PACING MARKERS** (include generously):
- [PAUSE 3 SEC] — after a descriptive paragraph
- [PAUSE 5 SEC] — between scenes or moments
- [PAUSE 8 SEC] — at major transitions or in the final chapter
- Use pauses every 3-4 sentences
- Do NOT use [BREATHE] — that is a meditation marker, not a story marker

**STORY STRUCTURE FOR THIS CHAPTER**:
1. Establish where the character is and what they're doing
2. Describe the environment with layered sensory detail
3. Show the character engaged in a gentle, specific activity
4. Include small, peaceful moments of observation or discovery
5. Transition naturally to the next chapter or wind down

**${isFirstBatch ? 'OPENING: Introduce the protagonist by name and place them in a specific, vivid setting. Describe the environment. Show them beginning a peaceful activity. Do NOT welcome the listener — just begin the story, like a novel opening.' : 'Continue seamlessly from where the previous chapter ended — same character, natural flow.'}**
**${isLastBatch ? 'ENDING: The protagonist settles into rest — finding a cozy spot, pulling up a blanket, watching the last light fade. Narration slows to near-silence. End with a final gentle image and a long pause. Do NOT address the listener. Do NOT say "you are safe" — just let the character drift off.' : 'End at a natural resting point — the character finishing an activity or pausing to observe something beautiful.'}**

Return JSON:
{
  "content": "The full story text for this chapter including [PAUSE X SEC] markers. Third-person narrative, present tense. NO second-person, NO affirmations, NO breathing cues.",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// STANDARD VIRAL SCRIPT WRITING PROMPT (existing logic)
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

    // Get selected hook
    let selectedHook = null;
    if (project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0];
    }

    // Get channel for script mode detection
    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

    // Detect script mode
    const scriptMode = project.project_mode && (project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story')
      ? project.project_mode
      : 'standard';
    const isSleepMode = scriptMode !== 'standard';

    console.log(`[generateScriptBatches] Script mode: ${scriptMode}`);

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

    // Get all batches for this project
    const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const sortedBatches = allBatches.sort((a, b) => a.batch_number - b.batch_number);
    const pendingBatches = sortedBatches.filter(b => b.status === 'pending' || b.status === 'generating');

    if (pendingBatches.length === 0) {
      return Response.json({ success: true, message: 'No pending batches to generate', completed: 0, done: true });
    }

    console.log(`[generateScriptBatches] ${pendingBatches.length} pending batches for project ${project_id}`);

    // Build context from already-completed batches
    const completedBatches = sortedBatches.filter(b => b.status === 'completed' && b.content);

    let completedCount = 0;

    // Process only ONE batch per call to avoid platform timeout
    const batch = pendingBatches[0];
    {
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

      // Sleep scripts use lower temperature for more consistent, soothing output
      const baseTemp = isSleepMode ? 0.65 : 0.85;
      const minWords = Math.round(batch.target_words * 0.92);
      let content = '';
      let wordCount = 0;
      const MAX_ATTEMPTS = 3;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let currentPrompt;
        if (attempt === 1 || !content) {
          currentPrompt = prompt;
        } else {
          // Continuation prompt — ask Claude to extend the existing content
          const wordsNeeded = batch.target_words - wordCount;
          const sleepStoryExtend = scriptMode === 'sleep_story'
            ? 'Add more sensory descriptions of what the character sees, hears, and touches. More atmospheric detail. More [PAUSE] markers. Keep third-person narration — do NOT switch to second-person or affirmations.'
            : 'Add more repetition, more imagery, more [PAUSE] markers, more sensory grounding.';
          currentPrompt = `You previously wrote the following script section but it was too short (${wordCount} words, need ${batch.target_words}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this section. Maintain the same tone, style, and pacing. ${isSleepMode ? sleepStoryExtend : 'Add more detail, more anecdotes, more specific examples, more emotional beats.'}

Return JSON:
{"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
        }

        const { result, provider } = await callLLM(currentPrompt, baseTemp);
        if (attempt === 1) console.log(`[Batch ${batch.batch_number}] Using ${provider}`);
        const newContent = result.content || '';

        if (attempt > 1 && content) {
          // Append continuation to existing content
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
    }

    // Update project status
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3
    });

    // Check if all batches are now completed
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
    // Return error details in a way the frontend can parse
    const msg = error.message || 'Unknown error';
    let code = 500;
    if (/credit balance|billing|purchase credits/i.test(msg)) code = 402;
    else if (/rate limit|too many requests/i.test(msg)) code = 429;
    else if (/api key|unauthorized|authentication/i.test(msg)) code = 401;
    return Response.json({ error: msg }, { status: code });
  }
});
