import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v4 — Claude primary + Gemini fallback

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
// SLEEP SCRIPT WRITING PROMPT
// ═══════════════════════════════════════════════════════════════════
function buildSleepWritingPrompt({ scriptMode, batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  const isMeditation = scriptMode === 'sleep_meditation';

  const meditationStructure = `**MEDITATION SECTION STRUCTURE**:
PURPOSE: This is CALMING motivation — restoring the listener's sense of enoughness, worthiness, and peace. NOT energizing, NOT goal-activation. NOT motivational in the gym-coach sense. The listener is already enough. The meditation simply reminds them, softly, until they believe it in their body. Every affirmation should feel like a hand on a shoulder — not a push from behind.

1. Soft Opening (Presence, Not Purpose)
   - Begin with body awareness and breath — no theme yet
   - Use slow, spacious language that asks nothing of the listener
   - Example: warmth of the bed, the weight of the body, the rhythm of breath

2. Nervous System Settling
   - Gently guide awareness inward without commands
   - Soft suggestions only: "you may notice…", "perhaps you feel…", "there is nothing you need to do"
   - Introduce stillness, safety, and permission to rest

3. First Whisper of the Affirmation
   - Introduce the core affirmation almost like a passing thought — not a declaration
   - Keep it simple and spacious: "you are enough…", "you are allowed to rest…", "just as you are…"
   - No explanation. No why. Just the words, gently.

4. Layered Repetition (The Heart of the Meditation)
   - Repeat the affirmation with slight variations — never identical rhythm
   - Allow long pauses between phrases
   - Weave nature imagery around the affirmation: the ocean doesn't explain its depth, the mountain doesn't justify its stillness
   - The affirmation becomes a feeling, not a thought

5. Body Grounding
   - Bring attention to weight, warmth, breath, softness
   - No commands — only invitations: "you might feel…", "perhaps there is…", "allow…"
   - Make the body feel safe, heavy, held

6. Breath Rhythm Integration
   - Introduce slow [BREATHE] cues
   - Expand time between cues gradually — let silence grow
   - Sync language with inhale/exhale: "breathe in… and you are safe… breathe out… and you can let go…"

7. Affirmation as Echo
   - Return to the affirmation in shorter, softer fragments
   - Almost like the listener is thinking it themselves, not being told
   - Fewer words, more space between them

8. Drift State
   - Language becomes minimal — fragments, single phrases, long pauses
   - No logic, no structure — just warmth and permission
   - "You are held… [PAUSE 10 SEC]… you are safe… [PAUSE 10 SEC]…"

9. Seamless Fade
   - No conclusion. No closure. No "and now you will sleep."
   - Simply allow the words to trail into breath and silence
   - Bridge gently to the next section if not last

ABSOLUTELY FORBIDDEN in meditation:
❌ Goal-setting language ("you will achieve", "tomorrow you will", "you can do anything")
❌ Motivational urgency ("push through", "believe in yourself", "you are capable of great things")
❌ Future-focused thinking ("imagine your success", "visualize your goals")
❌ Explaining why affirmations work
❌ Any energy, drive, or activation — only rest, release, and return

AFFIRMATION FLOW (ADVANCED RHYTHM):
- Introduce → [PAUSE 5 SEC]
- Restate with slight variation → [PAUSE 5 SEC]
- Blend into nature imagery → [PAUSE 5 SEC]
- Return as shorter whisper → [PAUSE 10 SEC]
- Echo once more, very softly → [PAUSE 10 SEC]

AFFIRMATION FORMAT: State simply → pause → restate → pause → dissolve into imagery → pause → return as whisper. Do NOT explain why the affirmation is true. Just say it, softly, again and again, until the listener stops thinking and starts feeling.`;

  const storyStructure = `**SLEEP STORY SCENE STRUCTURE** (pure narrative — NO affirmations, NO second-person guidance):
PURPOSE: The listener disappears into a peaceful world. They follow a character through a calm, sensory-rich environment. Nothing needs to happen. There is no plot — only presence. The story is a window, not a lesson.

1. Scene Grounding (Arrival)
   - Establish where the character is with slow, deliberate sensory inventory
   - What do they see? What sounds surround them? What do they feel on their skin?
   - No action yet. Just arrival. Just being there.
   - Third person, present tense: "She stands at the edge of the water…", "He settles into the old chair by the window…"

2. Gentle Movement (Drifting)
   - The character moves softly through the world — a slow walk, a gentle drift, a quiet journey
   - No destination. No purpose. Movement for its own sake.
   - The environment responds: leaves shift, water ripples, light changes
   - Pace every sentence to the length of a slow breath

3. World Deepening (Expansion)
   - Expand the sensory world — more detail, more texture, more quiet beauty
   - Introduce subtle sounds: distant rain, a fire crackling, water moving over stones
   - The character notices small things with quiet delight — a moth, a beam of light, a smell of wood smoke
   - No urgency, no meaning, no message — only noticing

4. Settling (Finding Rest)
   - The character finds a natural place to slow down — a clearing, a window seat, a blanket by water
   - They sit. They breathe. They watch.
   - The world narrows to the immediate: the warmth around them, the sounds that hold them
   - This is where the story begins to slow — fewer events, more sensation

5. Environment as Lullaby (The World Becomes the Story)
   - Describe only what soothes — rain on a roof, a fire's gentle crackle, the weight of warmth
   - The character's thoughts slow and soften — no goals, no worries, just the moment
   - Language becomes more rhythmic, more repetitive — like the sound of waves
   - Introduce [PAUSE] markers here more frequently

6. Dissolution (Edge of Sleep)
   - The character's thoughts begin to lose their edges
   - Half-formed images, soft impressions — not sleep yet, but the doorway to it
   - Language fragments gently: shorter sentences, longer pauses, fewer verbs
   - The world goes quiet around the character without announcement

7. Seamless Fade
   - No ending. No "and so she slept." No conclusion.
   - Simply let the world grow quieter and quieter
   - Bridge naturally to the next section if not last — a sound, a shift in light, a deepening warmth

STORY RULES (non-negotiable):
- Third person, present tense throughout: "She walks…", "He rests…", "They drift…"
- The character is calm and safe at ALL times — no problems, no decisions, no other characters with dialogue
- Sensory richness IS the plot — nothing needs to happen
- Settings must be inherently peaceful: a lakeside cottage, a forest at dusk, a slow river at sunrise, a meadow under stars, a warm kitchen in winter
- NEVER introduce anything requiring attention: conflict, dialogue, choices, danger, or surprise
- Repetition of sensory details is a FEATURE — return to the same images with slight variation`;

  return `You are an expert sleep audio script writer. You create professional-grade ${isMeditation ? 'calming motivation meditations — soothing, acceptance-based, restorative affirmations that remind the listener they are already enough' : 'bedtime sleep stories — immersive narrative journeys through peaceful worlds that carry the listener gently toward sleep'} following the proven format of top sleep channels (Jason Stephenson, Michael Sealey, The Honest Guys).

**CRITICAL RULE — READ THIS FIRST**:
You are writing the ACTUAL ${isMeditation ? 'meditation' : 'story'} script — the words the narrator speaks. You are NOT writing ABOUT ${isMeditation ? 'meditation or wellness' : 'storytelling or sleep'}. You ARE the soothing voice. Every single word must serve one purpose: helping the listener release the day and drift toward rest.

**ABSOLUTELY FORBIDDEN CONTENT** (any of these will ruin the script):
❌ Explaining what ASMR is, how it works, or its benefits
❌ Mentioning dopamine, oxytocin, neuroscience, or "studies show"
❌ Giving practical sleep tips (caffeine, screen time, sleep schedule)
❌ Referencing "this video", "this channel", or YouTube
❌ First-person anecdotes ("I remember when I…")
❌ Educational content of any kind — no teaching, no explaining
❌ Defining meditation, affirmations, or relaxation techniques
❌ Suggesting the listener try other videos or content
❌ Any meta-commentary about what the script is doing
❌ Conflict, tension, danger, stress, urgency, or surprises
❌ Questions requiring active thinking or answers
❌ Energizing words: "exciting", "alert", "energy", "suddenly", "powerful", "amazing"
❌ Unresolved storylines or cliffhangers

**PROJECT CONTEXT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Content Type: ${isMeditation ? 'Calming Motivation Meditation' : 'Sleep Story'}
- Duration: ${project.video_duration_minutes || 10} minutes total
${selectedHook && isFirstBatch ? `- Opening line: "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**FULL SCRIPT ARC** (all sections):
${outlineContext}

**YOU ARE NOW WRITING SECTION ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**SECTION SYNOPSIS** (follow this closely):
${batch.synopsis}

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. This is NON-NEGOTIABLE. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Add more repetition, more imagery, more [PAUSE] markers, more sensory grounding until you reach the target. The audio NEEDS this many words to fill its timeslot (150 words = 1 minute).

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ UNIVERSAL WRITING STYLE RULES ═══**

**TONE & DELIVERY**:
- Extremely gentle, warm, and soothing — deliberately slow and monotonous
- Hypnotic, trance-inducing rhythm — repetition is your primary tool
- Each key concept or image stated, then restated 3-5 times in different words
- Progressive deepening: each paragraph calmer and slower than the last
- Boring is GOOD. Predictable is GOOD. Sameness invites sleep.

**LANGUAGE**:
- Simple vocabulary — short sentences (8-18 words)
- ${isMeditation ? 'Second-person "you" — speak directly to the listener as their gentle, accepting guide' : 'Third-person narrative, present tense — immerse the listener in a character\'s peaceful world'}
- Soft consonants preferred — avoid harsh sounds (hard k, t, hard g, sh)
- Rhythm over meaning — the sound of the words matters as much as their content

**PAUSE MARKERS** (ESSENTIAL — include generously, every 2-3 sentences):
- [PAUSE 3 SEC] — after key phrases
- [PAUSE 5 SEC] — between thoughts
- [PAUSE 10 SEC] — between major moments or after affirmations
- [BREATHE] — breathing cue with the narrator's rhythm
- Let silence carry weight — pauses are not empty, they are the deepening

**SENSORY GROUNDING** (weave throughout every paragraph):
- Touch: weight of blankets, softness of pillows, warmth spreading through the body, gentle pressure
- Sound: rain on a roof, ocean waves, rustling leaves, a distant river, a fire crackling, silence between sounds
- Sight: soft darkness, the light of stars, candlelight, moonlight through curtains, gentle shades of blue and grey
- Smell: rain on earth, wood smoke, flowers, fresh night air (mention subtly, briefly)

**NATURE METAPHORS** (return to these throughout — they are anchors):
- Ocean: vast, constant, each wave releasing, breath matching the tide
- Mountain: stable, patient, enduring without effort
- Tree: rooted, unhurried, growing in its own time
- River: always moving, always releasing, natural and effortless
- Moon & Stars: always present, always watching, gentle and constant

${isMeditation ? meditationStructure : storyStructure}

**PERMISSION & RELEASE PHRASES** (use liberally throughout):
"You don't have to…", "There's no need to…", "It's okay to…", "Let yourself…", "Allow…", "Release…", "Let go of…", "There is nothing you need to do…", "You are allowed to rest…"

**ANCHORING PHRASES** (return to these every few minutes like a gentle heartbeat):
"Safe… held… at peace…", "Let it go… just for now…", "Rest now…", "You are safe here…", "All is well…", "You can let go…"

**${isFirstBatch ? `OPENING: Begin with a gentle, wordless welcome — no announcement, no "welcome back". Simply arrive into the space with the listener. Settle them physically first: body sinking into the bed, the weight of warmth, pillows and blankets holding them. Guide 3 slow breaths with [BREATHE] markers, expanding the time between each. Then ease into the first ${isMeditation ? 'affirmation or theme through imagery — arrive at it like mist, not like a spotlight' : 'scene with slow sensory arrival — let the listener find themselves already there'}.` : 'Continue seamlessly from where the previous section ended. Maintain the deepening arc — each section should feel calmer, slower, and more dissolved than the last.'}**

**${isLastBatch ? 'ENDING: This is the final section — the gentlest, most minimal content of the entire script. Fewer words. More pauses. Let language dissolve. End with the softest possible landing: "Rest now… [PAUSE 10 SEC]… peaceful dreams… [PAUSE 10 SEC]…" then one final breath of presence: "You are safe… you are loved… you are held… [PAUSE 10 SEC]" — then silence.' : 'End by deepening the relaxation one layer further, bridging gently into the next section with a soft sensory or imagery transition — no announcement, just a natural drift.'}**

Return JSON:
{
  "content": "The full script text for this section including all [PAUSE X SEC] and [BREATHE] markers…",
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
          currentPrompt = `You previously wrote the following script section but it was too short (${wordCount} words, need ${batch.target_words}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this section. Maintain the same tone, style, and pacing. ${isSleepMode ? 'Add more repetition, more imagery, more [PAUSE] markers, more sensory grounding.' : 'Add more detail, more anecdotes, more specific examples, more emotional beats.'}

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