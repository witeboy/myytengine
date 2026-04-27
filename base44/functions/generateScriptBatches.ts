import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v6 — Sleep story FULL REWRITE: genuine narrative fiction, not meditation

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
// ROUTER
// ═══════════════════════════════════════════════════════════════════
function buildSleepWritingPrompt(args) {
  if (args.scriptMode === 'sleep_story') {
    return buildSleepStoryWritingPrompt(args);
  }
  return buildSleepMeditationWritingPrompt(args);
}

// ═══════════════════════════════════════════════════════════════════
// MEDITATION WRITING PROMPT — unchanged, affirmations/second-person OK
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
// SLEEP STORY WRITING PROMPT — v6 COMPLETE REWRITE
// Pure narrative fiction. NO meditation DNA whatsoever.
// ═══════════════════════════════════════════════════════════════════
function buildSleepStoryWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch }) {
  // ── Extract protagonist name from previous content if available ──
  let protagonistHint = '';
  if (previousContent) {
    // Try to find a name that appears near the start of the first batch
    const nameMatch = previousContent.match(/\b([A-Z][a-z]{2,12})\b(?= walks| stands| sits| looks| watches| feels| steps| moves| carries| holds| opens| turns| settles)/);
    if (nameMatch) {
      protagonistHint = `\n- The protagonist's name is **${nameMatch[1]}** — use this name consistently.\n`;
    }
  }

  // ── Derive a clean setting/theme from topic or project ──
  const storyTheme = topic?.title || project.name || 'a peaceful journey';
  const storyDescription = topic?.description || '';

  // ── Strip any meditation language from the synopsis ──
  const meditationBleedPattern = /\b(affirmation|breathe in|breathe out|body awareness|body scan|you are safe|you are loved|you are enough|settle into|settling in|guided relaxation|feel your body|take a deep breath|opening & welcome|physical settling|permission to rest|anchoring phrase|soft opening|energetic settling)\b/gi;
  let cleanSynopsis = batch.synopsis.replace(meditationBleedPattern, '[omit]').trim();
  
  // If synopsis is mostly meditation content, replace entirely
  const meditationHits = (batch.synopsis.match(meditationBleedPattern) || []).length;
  if (meditationHits >= 2) {
    console.warn(`[Batch ${batch.batch_number}] ⚠️ Synopsis has ${meditationHits} meditation terms — replacing with scene direction`);
    cleanSynopsis = `Write a scene where the protagonist continues their journey through "${batch.story_segment}". Focus on what they observe, the atmosphere around them, and one small gentle activity or discovery. Keep it purely narrative — no inner monologue about feelings, no self-affirmation.`;
  }

  // ── Opening hook instruction ──
  const openingInstruction = isFirstBatch
    ? `START THE STORY IMMEDIATELY. Open with a single vivid sentence placing the protagonist in a specific location at a specific moment — like the first line of a novel. ${selectedHook?.hook_text ? `Use this as your very first line or adapt it naturally: "${selectedHook.hook_text}"` : 'No welcome, no preamble, no setup. Just: character + place + moment.'}`
    : `Continue seamlessly from the final sentence of the previous chapter. Do not recap. Do not re-introduce the character. Simply carry on.`;

  // ── Ending instruction ──
  const endingInstruction = isLastBatch
    ? `Close the story by letting the protagonist naturally settle into stillness — finding a warm spot, watching the last light fade, the world quieting around them. The narration slows, sentences shorten, the world softens. End on a single final image — something gentle and still. No moral. No address to the listener. No "goodnight". Just let the story dissolve into quiet.`
    : `End this chapter at a natural pause — the protagonist completing an activity, pausing to watch something, or moving into a new space. Leave a sense of gentle continuation, not a cliffhanger.`;

  return `You are a master of adult bedtime fiction — the kind of story told on the Calm app or Headspace's "Sleepcasts". You write immersive, sensory narratives that carry listeners into sleep through the weight of a beautiful world, not through instruction.

═══════════════════════════════════════
WHAT YOU ARE WRITING
═══════════════════════════════════════
A SLEEP STORY: third-person narrative fiction set in a rich, specific world. Think: a cosy audiobook. A gentle novel. A nature documentary narrated in prose. The listener falls asleep because the world you build is so warm and detailed and unhurried that sleep finds them naturally.

You are NOT writing a meditation. You are NOT a guide. You do not address the listener. You tell a story.

═══════════════════════════════════════
THE CARDINAL RULES — BREAKING ANY = FAILURE
═══════════════════════════════════════

✅ ALWAYS:
- Write in third-person: "Mara lifts the lantern" / "He watches the tide" / "She follows the stone path"
- Use present tense for immediacy: "The fog drifts" not "The fog drifted"
- Name your protagonist and use that name consistently
- Describe the world through what the character DOES and OBSERVES
- Fill every paragraph with specific sensory texture — sight, sound, smell, touch, occasionally taste
- Use [PAUSE 3 SEC], [PAUSE 5 SEC], [PAUSE 8 SEC] after vivid images to let them land
- Write at lullaby pace — slow, unhurried, detailed — but ALWAYS moving forward narratively

❌ NEVER:
- Use "you", "your", or address the listener in ANY form ("you feel...", "imagine you're...", "as you breathe...")
- Write affirmations ("you are safe", "you are worthy", "you deserve rest", "you are enough")
- Write breathing instructions ("take a deep breath", "breathe in slowly", [BREATHE], "inhale...", "exhale...")
- Write body scan or relaxation instructions ("feel your muscles relax", "your eyelids grow heavy", "sink into your pillow")
- Open with a welcome, intro, or preamble ("Welcome to tonight's story", "Get comfortable", "Let's begin")
- Include life advice, moral lessons, or self-help framing
- Include conflict, threat, urgency, danger, suspense, or anything that raises heart rate
- Break the fourth wall or refer to "this story", "the narrator", or "tonight"
- Use [BREATHE] — this is a meditation marker. Use only [PAUSE X SEC] for pacing.

═══════════════════════════════════════
FORBIDDEN EXAMPLE vs CORRECT EXAMPLE
═══════════════════════════════════════

❌ WRONG (meditation bleed — do not write this):
"You find yourself in a quiet forest. Take a deep breath and feel the peace around you. You are safe here. You are held. Let your body relax... [BREATHE] ... you don't have to do anything right now. Just rest."

✅ RIGHT (sleep story — write like this):
"The path narrows between two ancient oaks, their roots raised above the soil like sleeping animals. Mara steps carefully, her lantern throwing a warm circle of gold onto the moss below. [PAUSE 5 SEC] An owl calls from somewhere deep in the canopy — one long, hollow note that fades into the trees before she can place it. She pauses, listening. The forest holds its breath with her."

═══════════════════════════════════════
STORY CONTEXT
═══════════════════════════════════════
- Story/Theme: ${storyTheme}
- Setting description: ${storyDescription}
- Total chapters: ${sortedBatches.length}
- Total runtime: ${project.video_duration_minutes || 10} minutes (150 words ≈ 1 minute)
${protagonistHint}

FULL STORY ARC (all chapters):
${outlineContext}

═══════════════════════════════════════
THIS CHAPTER: Chapter ${batch.batch_number} of ${sortedBatches.length}
"${batch.story_segment}"
═══════════════════════════════════════

CHAPTER DIRECTION:
${cleanSynopsis}

MANDATORY WORD COUNT: ${batch.target_words} words minimum. If under ${Math.round(batch.target_words * 0.9)} words = FAILURE.
Reach the target by adding: more environmental detail, more sensory layers, the character noticing small things, the world shifting subtly around them, longer pauses between events. Never pad with repetition or affirmations.

${previousContent ? `PREVIOUS CHAPTERS (maintain continuity — same protagonist, same world, do NOT repeat or recap):
${previousContent.slice(-3500)}

` : ''}═══════════════════════════════════════
CRAFT GUIDELINES
═══════════════════════════════════════

NARRATIVE VOICE:
- Warm, intimate, unhurried — like a story told by a favourite grandparent
- Observational and precise — describe exactly what is there, not vague impressions
- Dwell on small things: the texture of bark, the colour of a doorway, the weight of a cup
- Sentence rhythm: mix short punchy observations with long flowing descriptions
  Short: "The fire has died to embers."
  Long: "Somewhere beyond the garden wall, a night bird is singing a song she has never heard before — three rising notes and then a long, low fall, repeated into the dark."

PACING (essential):
- After every vivid image or sensory moment: [PAUSE 3 SEC]
- After a scene transition or significant beat: [PAUSE 5 SEC]  
- At the close of a major chapter section: [PAUSE 8 SEC]
- Aim for a pause every 4-6 sentences
- Pause frequency should increase as the chapter progresses — the world slows

WORLD BUILDING:
- Give locations specific names: "The Harbour Inn", "Ashford Lane", "The Blue Boat"
- Give objects weight and history: "a teapot her grandmother brought from another country"
- Give the world small sounds: a gate hinge, a distant ferry horn, leaves on stone
- Give the light quality: "the blue hour before full dark", "candle-shadow on plaster"

CHARACTER:
- The protagonist is content, gently curious, unhurried
- They notice things: a sparrow, a reflection, a smell from another house
- They do small things: stir a pot, fold a letter, tie a boat, sweep a step
- They feel the world through their senses — don't narrate emotions, show what they observe

${openingInstruction}

${endingInstruction}

═══════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════
Return only valid JSON:
{
  "content": "The full chapter text. Third-person present tense. Named protagonist. Rich sensory detail. [PAUSE X SEC] markers throughout. NO second-person. NO affirmations. NO breathing cues.",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// STANDARD VIRAL SCRIPT WRITING PROMPT — unchanged
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

// ═══════════════════════════════════════════════════════════════════
// EXTENSION PROMPT — mode-aware retry when word count is short
// ═══════════════════════════════════════════════════════════════════
function buildExtensionPrompt({ scriptMode, content, wordCount, targetWords }) {
  const wordsNeeded = targetWords - wordCount;

  if (scriptMode === 'sleep_story') {
    return `You previously wrote the following sleep story chapter, but it is too short (${wordCount} words — need ${targetWords}).

EXISTING CONTENT (do NOT repeat — continue seamlessly from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this chapter. Rules:
- Third-person present tense. Named protagonist. Same world and tone.
- Add more sensory detail: what the character sees, hears, smells, touches
- Add small narrative beats: something noticed, something done, a moment of stillness
- Add more [PAUSE 3 SEC] and [PAUSE 5 SEC] markers after vivid images
- NO second-person "you". NO affirmations. NO breathing cues. NO "you are safe".
- Do NOT welcome or address any listener. This is pure story narration.

Return JSON: {"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
  }

  if (scriptMode === 'sleep_meditation') {
    return `You previously wrote the following meditation section but it was too short (${wordCount} words, need ${targetWords}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this section. Maintain the same tone, style, and pacing. Add more repetition, more imagery, more [PAUSE] markers, more [BREATHE] cues, more sensory grounding.

Return JSON: {"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
  }

  // Standard
  return `You previously wrote the following script section but it was too short (${wordCount} words, need ${targetWords}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this section. Maintain the same tone, style, and pacing. Add more detail, more anecdotes, more specific examples, more emotional beats.

Return JSON: {"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
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

    // Detect script mode
    const scriptMode = (project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story')
      ? project.project_mode
      : 'standard';
    const isSleepMode = scriptMode !== 'standard';

    console.log(`[generateScriptBatches] Script mode: ${scriptMode}`);

    // ── Strategy block — ONLY used for standard mode ──
    // Sleep story intentionally skips channel script strategy to prevent
    // meditation/viral writing styles from bleeding into narrative fiction.
    let strategyBlock = '';
    if (scriptMode === 'standard') {
      let scriptStrategy = project.script_strategy_override || channel?.script_strategy || '';
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
    // NOTE: strategyBlock is intentionally empty for sleep_story and sleep_meditation
    // to avoid channel strategy (often optimised for viral/retention) contaminating sleep content.

    const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const sortedBatches = allBatches.sort((a, b) => a.batch_number - b.batch_number);
    const pendingBatches = sortedBatches.filter(b => b.status === 'pending' || b.status === 'generating');

    if (pendingBatches.length === 0) {
      return Response.json({ success: true, message: 'No pending batches to generate', completed: 0, done: true });
    }

    console.log(`[generateScriptBatches] ${pendingBatches.length} pending batches for project ${project_id}`);

    const completedBatches = sortedBatches.filter(b => b.status === 'completed' && b.content);

    let completedCount = 0;

    // Process one batch per call to avoid platform timeout
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

      const promptArgs = {
        batch, project, topic, selectedHook, sortedBatches,
        previousContent, outlineContext, isFirstBatch, isLastBatch,
        strategyBlock, scriptMode
      };

      const prompt = isSleepMode
        ? buildSleepWritingPrompt(promptArgs)
        : buildStandardWritingPrompt(promptArgs);

      // Temperature: sleep_story slightly higher than meditation for narrative variety
      const baseTemp = scriptMode === 'sleep_story' ? 0.72 : scriptMode === 'sleep_meditation' ? 0.65 : 0.85;
      const minWords = Math.round(batch.target_words * 0.92);
      let content = '';
      let wordCount = 0;
      const MAX_ATTEMPTS = 3;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let currentPrompt;
        if (attempt === 1 || !content) {
          currentPrompt = prompt;
        } else {
          currentPrompt = buildExtensionPrompt({ scriptMode, content, wordCount, targetWords: batch.target_words });
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
        content,
        word_count: wordCount,
        status: 'completed'
      });

      completedCount++;
      console.log(`[Batch ${batch.batch_number}] ✅ ${wordCount} words written (${scriptMode})`);
    }

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
