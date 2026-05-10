import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v5 — Gemini primary + Claude fallback | sleep story separated from meditation

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
        model: 'claude-sonnet-4-6',
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
    const result = await callGemini(prompt, temperature);
    return { result, provider: 'gemini' };
  } catch (geminiErr) {
    const msg = geminiErr.message || '';
    const isFatal = /credit balance|billing|purchase credits|api key|unauthorized/i.test(msg);
    console.warn(`[LLM] Gemini failed${isFatal ? ' (fatal — switching to Claude)' : ''}: ${msg.substring(0, 120)}`);

    if (!ANTHROPIC_KEY) throw geminiErr;

    console.log('[LLM] Falling back to Claude...');
    const result = await callClaude(prompt, temperature);
    return { result, provider: 'claude' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP MEDITATION WRITING PROMPT
// ═══════════════════════════════════════════════════════════════════
function buildMeditationWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  return `You are an expert sleep audio script writer. You create professional-grade bedtime motivational meditations following the proven format of top sleep channels (Jason Stephenson, Michael Sealey, The Honest Guys).

**CRITICAL RULE — READ THIS FIRST**:
You are writing the ACTUAL meditation script — the words the narrator speaks. You are NOT writing ABOUT meditation. You are NOT explaining what ASMR is. You are NOT giving sleep tips or advice. You ARE the soothing voice guiding someone to sleep. Every single word must serve that purpose.

**ABSOLUTELY FORBIDDEN CONTENT**:
❌ Explaining what ASMR is, how it works, or its benefits
❌ Mentioning dopamine, oxytocin, neuroscience, or "studies show"
❌ Giving practical sleep tips (caffeine, screen time, sleep schedule)
❌ Referencing "this video", "this channel", or YouTube
❌ First-person anecdotes ("I remember when I...")
❌ Educational content of any kind — no teaching, no explaining
❌ Defining meditation, affirmations, or relaxation techniques
❌ Suggesting the listener try other videos or content
❌ Any meta-commentary about what the script is doing
❌ Conflict, tension, danger, stress, urgency, surprises
❌ Questions requiring active thinking or answers
❌ Energizing words: "exciting", "alert", "energy", "suddenly"
❌ Unresolved storylines or cliffhangers

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

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. This is NON-NEGOTIABLE. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Add more repetition, more imagery, more [PAUSE] markers, more sensory grounding until you reach the target.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

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
- Smell: rain, flowers, wood smoke, fresh air (subtle mentions)

**NATURE METAPHORS** (core imagery):
- Ocean: vast, constant, waves matching breath
- Mountain: stable, grounded, enduring
- Tree: rooted, growing, patient
- River: flowing, releasing, natural path
- Moon & Stars: gentle light, constant presence

**MEDITATION SECTION STRUCTURE**:
1. Soft Opening (Indirect Theme Emergence)
2. Energetic Settling (Nervous System Downshift)
3. Core Affirmation Introduction (First Whisper)
4. Affirmation Expansion (Layered Repetition)
5. Imagery Weaving (Emotion Through Nature)
6. Embodied Awareness (Grounding Without Effort)
7. Breath Rhythm Integration ([BREATHE] Cycle)
8. Affirmation Deepening (Subconscious Layer)
9. Drift State (Thought Dissolution)
10. Seamless Descent (Bridge to Silence or Sleep)

**AFFIRMATION FLOW**: State simply → pause → restate → pause → elaborate with imagery → pause → restate again. Do NOT explain WHY the affirmation matters. Just say it, softly, repeatedly.

**PERMISSION & RELEASE PHRASES** (use liberally):
"You don't have to...", "There's no need to...", "It's okay to...", "Let yourself...", "Allow...", "Release...", "Let go of..."

**ANCHORING PHRASES** (repeat every few minutes):
"Safe... held... at peace...", "Let it go... just for now...", "Rest now...", "You are safe here..."

**${isFirstBatch ? 'OPENING: Start with a gentle welcome. Settle the listener physically (body sinking, pillows, warmth). Guide 3 slow breaths with [BREATHE] markers. Then ease into the first theme through imagery — NOT by explaining what you\'re about to do.' : 'Continue seamlessly from where the previous section ended — maintain the deepening relaxation arc.'}**
**${isLastBatch ? 'ENDING: This is the final section — the gentlest, most minimal content. Fewer words, more pauses. End with: "Rest now... peaceful dreams... [PAUSE 10 SEC]" then fade to near-silence with one final "You are safe... you are loved... [PAUSE 10 SEC]"' : 'End by gently deepening relaxation, bridging naturally to the next theme.'}**

Return JSON:
{
  "content": "The full script text for this section including all [PAUSE X SEC] and [BREATHE] markers...",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP STORY WRITING PROMPT — pure narrative, no meditation language
// ═══════════════════════════════════════════════════════════════════
function buildSleepStoryWritingPrompt({ batch, project, topic, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch }) {
  const protagonistMatch = batch.synopsis?.match(/\[Protagonist:\s*([^\]]+)\]/) ||
                           batch.synopsis?.match(/^Protagonist:\s*(.+?)[\.\n]/);
  const protagonist = batch.protagonist_name ||
                      (protagonistMatch ? protagonistMatch[1].trim() : 'the traveller');

  return `You are an expert sleep audio fiction writer. You write professional-grade bedtime stories in the style of Calm app Sleepcasts and Headspace Sleep — warm, unhurried, sensory-rich third-person narrative fiction.

**YOUR ONE JOB**: Write a story. You are a narrator telling a tale about ${protagonist}. The listener falls asleep because the world is so warm and detailed and unhurried that sleep finds them naturally. You never address the listener directly. You never instruct anyone to breathe or relax. You are simply a storyteller.

**ABSOLUTELY FORBIDDEN — THESE WILL RUIN THE SCRIPT**:
❌ Any form of "welcome" — do NOT open with "Welcome", "Hello", "Good evening", or any greeting
❌ Second-person address of any kind — no "you", "your", "yourself"
❌ Affirmations — no "you are safe", "you are loved", "you are enough", or any variant
❌ Breathing instructions — no "take a breath", "breathe in", "breathe out"
❌ Body scan language — no "feel your body sink", "notice your legs", "relax your shoulders"
❌ [BREATHE] markers — forbidden entirely in sleep story
❌ Listener-directed pauses — no "take a moment now", "let yourself settle"
❌ Meditation phrases — no "let go", "release", "you don't have to", "allow yourself"
❌ Meta-commentary — no "in this story", "tonight we follow", "our story begins"
❌ Explaining what ASMR is, or any educational content
❌ Conflict, tension, danger, urgency, unresolved drama
❌ Energizing words: "suddenly", "exciting", "alert", "startling"
❌ Cliffhangers or questions requiring the listener to think

**PROJECT CONTEXT**:
- Story: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Content Type: Sleep Story (third-person narrative fiction)
- Duration: ${project.video_duration_minutes || 10} minutes total
- Protagonist: ${protagonist}

**FULL STORY ARC** (all chapters):
${outlineContext}

**YOU ARE NOW WRITING CHAPTER ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**CHAPTER SYNOPSIS** (follow this closely):
${batch.synopsis}

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. This is NON-NEGOTIABLE. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Add more sensory detail, slower movement, more specific description of ${protagonist}'s surroundings until you reach the target.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**WRITING STYLE**:
- Third-person present tense throughout: "${protagonist} walks...", "${protagonist} notices...", "${protagonist} watches..."
- Unhurried, deliberate pacing — linger on details, slow the world down
- Rich sensory texture: what ${protagonist} sees, hears, smells, touches
- Simple, warm vocabulary — sentences 10-25 words, varied rhythm
- No urgency, no goals, no plot — just a character moving through a beautiful world

**PACING MARKERS** (use generously — these create audio breathing room):
- [PAUSE 3 SEC] — after vivid descriptive phrases
- [PAUSE 5 SEC] — between scene shifts or new observations
- [PAUSE 10 SEC] — between major location or mood transitions
- Place a pause every 3-4 sentences minimum

**SENSORY DETAIL** (ground every paragraph in at least two senses):
- What ${protagonist} sees: light quality, colour, texture, distance, movement
- What ${protagonist} hears: ambient sounds, near and far, rhythm of nature
- What ${protagonist} feels physically: temperature, air, surfaces, weight of clothing
- What ${protagonist} smells: earth, water, wood, season, night air

**SCENE TEXTURE IDEAS** (use as inspiration, not prescription):
- Light: soft lamplight, pale moon, last of dusk, candle glow, grey dawn
- Sound: rain on a roof, distant water, wind in trees, an animal's quiet movement
- Environment: worn paths, old buildings, still water, open country, harbour stone
- Time: late evening, early night, the quiet hour before sleep

**NARRATIVE RHYTHM**:
- Open each paragraph with what ${protagonist} observes or does
- Move slowly through space — describe what is passed, not just what is reached
- Allow long pauses in the action: ${protagonist} stands still, watches, listens
- The world gets quieter and more still as the chapter progresses

**${isFirstBatch
  ? `OPENING — CHAPTER 1 RULES (CRITICAL):
  - First word is NOT "Welcome", "Hello", or any greeting — it is the story
  - Open mid-scene: ${protagonist} is already somewhere specific, already doing something
  - First sentence = character + place + action. Example pattern: "${protagonist} [verb]s along the [specific place], where [sensory detail]."
  - The listener steps into the world on the first word — there is no preamble`
  : `Continue seamlessly from where the previous chapter ended. ${protagonist} is still in the world — pick up the moment naturally.`}**

**${isLastBatch
  ? `ENDING — FINAL CHAPTER RULES:
  - The world grows very still and very quiet
  - ${protagonist} finds a warm, sheltered place to rest — naturally, without announcement
  - Reduce sentence length and sensory density gradually — fewer words, more space
  - End with a single quiet image: a sound fading, a light dimming, stillness settling
  - No conclusion, no sign-off, no "and so ${protagonist} slept" — just the world becoming silence
  - Final [PAUSE 10 SEC] after the last image`
  : `End with ${protagonist} moving toward the next part of the world — a natural transition, no cliffhanger.`}**

Return JSON:
{
  "content": "The full story text for this chapter including all [PAUSE X SEC] markers...",
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

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. This is NON-NEGOTIABLE. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Count your words. Add more detail, more anecdotes, more specific examples, more emotional beats until you reach the target.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**WRITING RULES**:
1. Write ONLY narration text — words the narrator will speak aloud
2. NO scene directions, NO [SCENE:], NO [VISUAL:], NO stage directions
3. NO "In this video", NO "Welcome back", NO meta-commentary
4. Every sentence must EARN its place — zero filler
5. Mix punchy short sentences (3-7 words) with flowing longer ones (20-30 words)
6. Include micro-hooks every 60-90 seconds ("But that wasn't the real story...", "What happened next changed everything...")
7. ${isFirstBatch
  ? `HOOK PACING LAW (first batch only — NON-NEGOTIABLE):
   - The opening hook MUST use ultra-short staccato sentences: 2–5 words each, maximum
   - Write 4–6 of these short punchy sentences back to back — no conjunctions, no padding
   - After the hook (roughly 30–40 words in), transition to normal pacing: 8–15 word sentences
   - The hook should feel breathless and urgent; the rest of the batch flows but stays tight
   - Example hook rhythm: "He had nothing. No money. No plan. No way out. Then one phone call changed everything."
   - BAD example: "This is the incredible story of a man who had nothing but managed to change his life through sheer determination."`
  : 'Continue seamlessly from where the previous batch ended'}
8. ${isLastBatch ? 'End with a powerful closing line — memorable, quotable, perspective-shifting. Include a subtle CTA.' : 'End on a cliffhanger or curiosity hook that pulls into the next batch'}
9. Use specific details: names, numbers, dates, places — not vague generalities
10. Write for the EAR, not the eye — natural spoken rhythm, not essay prose

Return JSON:
{
  "content": "The full narration text for this batch...",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// PROMPT ROUTER — picks the right writing function by scriptMode
// ═══════════════════════════════════════════════════════════════════
function buildWritingPrompt(scriptMode, promptArgs) {
  if (scriptMode === 'sleep_story') {
    return buildSleepStoryWritingPrompt(promptArgs);
  }
  if (scriptMode === 'sleep_meditation') {
    return buildMeditationWritingPrompt(promptArgs);
  }
  return buildStandardWritingPrompt(promptArgs);
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

    // Get selected hook (not used for sleep modes)
    let selectedHook = null;
    if (project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0];
    }

    // Get channel
    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

    // Detect script mode — project_mode is authoritative
    const scriptMode = (project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story')
      ? project.project_mode
      : 'standard';
    const isSleepMode = scriptMode !== 'standard';

    console.log(`[generateScriptBatches] Script mode: ${scriptMode}`);

    // Build strategy block (standard mode only — not relevant for sleep)
    let strategyBlock = '';
    if (!isSleepMode) {
      const scriptStrategy = project.script_strategy_override || channel?.script_strategy || '';
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
        .map(b => `--- ${scriptMode === 'sleep_story' ? 'CHAPTER' : 'BATCH'} ${b.batch_number}: ${b.story_segment} ---\n${b.content}`)
        .join('\n\n');

      const isFirstBatch = batch.batch_number === 1;
      const isLastBatch = batch.batch_number === sortedBatches.length;

      const outlineContext = sortedBatches
        .map(b => `${scriptMode === 'sleep_story' ? 'Chapter' : 'Batch'} ${b.batch_number} "${b.story_segment}": ${b.focus_area}`)
        .join('\n');

      // All args available to every prompt builder
      const promptArgs = {
        batch,
        project,
        topic,
        selectedHook: isSleepMode ? null : selectedHook,
        sortedBatches,
        previousContent,
        outlineContext,
        isFirstBatch,
        isLastBatch,
        strategyBlock,
      };

      const prompt = buildWritingPrompt(scriptMode, promptArgs);

      console.log(`[${scriptMode === 'sleep_story' ? 'Chapter' : 'Batch'} ${batch.batch_number}] Generating ~${batch.target_words} words (${scriptMode})...`);

      // Sleep story uses slightly higher temp for narrative variety; meditation lower for consistency
      const baseTemp = scriptMode === 'sleep_story' ? 0.75
        : scriptMode === 'sleep_meditation' ? 0.65
        : 0.85;

      const minWords = Math.round(batch.target_words * 0.92);
      let content = '';
      let wordCount = 0;
      const MAX_ATTEMPTS = 3;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let currentPrompt;
        if (attempt === 1 || !content) {
          currentPrompt = prompt;
        } else {
          // Continuation prompt — ask LLM to extend the existing content
          const wordsNeeded = batch.target_words - wordCount;
          const unitLabel = scriptMode === 'sleep_story' ? 'chapter' : 'section';
          const extendInstruction = scriptMode === 'sleep_story'
            ? `Add more sensory detail, slower movement, longer descriptions of what ${batch.protagonist_name || 'the protagonist'} observes. Maintain third-person present tense. Do NOT address the listener. Do NOT add affirmations or breathing cues.`
            : scriptMode === 'sleep_meditation'
              ? 'Add more repetition, more imagery, more [PAUSE] markers, more sensory grounding.'
              : 'Add more detail, more anecdotes, more specific examples, more emotional beats.';

          currentPrompt = `You previously wrote the following script ${unitLabel} but it was too short (${wordCount} words, need ${batch.target_words}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this ${unitLabel}. Maintain the same tone, style, and pacing. ${extendInstruction}

Return JSON:
{"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
        }

        const { result, provider } = await callLLM(currentPrompt, baseTemp);
        if (attempt === 1) console.log(`[${scriptMode === 'sleep_story' ? 'Chapter' : 'Batch'} ${batch.batch_number}] Using ${provider}`);
        const newContent = result.content || '';

        if (attempt > 1 && content) {
          content = content.trim() + '\n\n' + newContent.trim();
        } else {
          content = newContent;
        }
        wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

        if (wordCount >= minWords || attempt === MAX_ATTEMPTS) {
          if (wordCount < minWords) {
            console.warn(`[${scriptMode === 'sleep_story' ? 'Chapter' : 'Batch'} ${batch.batch_number}] ⚠️ Only ${wordCount}/${batch.target_words} words after ${MAX_ATTEMPTS} attempts — accepting`);
          }
          break;
        }
        console.log(`[${scriptMode === 'sleep_story' ? 'Chapter' : 'Batch'} ${batch.batch_number}] ⚠️ Only ${wordCount}/${batch.target_words} words (attempt ${attempt}/${MAX_ATTEMPTS}) — extending...`);
      }

      // Post-process sleep story: strip any meditation language that leaked through
      if (scriptMode === 'sleep_story') {
        content = content
          .replace(/\[BREATHE\]/gi, '[PAUSE 5 SEC]')
          .replace(/\bWelcome[,.]?\s*/gi, '')
          .replace(/\bGood evening[,.]?\s*/gi, '')
          .replace(/\bHello[,.]?\s*/gi, '');
        wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
      }

      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
        content,
        word_count: wordCount,
        status: 'completed',
      });

      completedCount++;
      console.log(`[${scriptMode === 'sleep_story' ? 'Chapter' : 'Batch'} ${batch.batch_number}] ✅ ${wordCount} words written (${scriptMode})`);
    }

    // Update project status
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3,
    });

    // Check if all batches are now completed
    const remainingPending = sortedBatches.filter(b =>
      b.id !== batch.id && (b.status === 'pending' || b.status === 'generating')
    ).length;
    const allDone = remainingPending === 0;

    console.log(`[generateScriptBatches] Completed ${scriptMode === 'sleep_story' ? 'chapter' : 'batch'} ${batch.batch_number}. ${remainingPending} remaining.`);

    return Response.json({
      success: true,
      completed: completedCount,
      total_batches: sortedBatches.length,
      remaining: remainingPending,
      done: allDone,
      script_mode: scriptMode,
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