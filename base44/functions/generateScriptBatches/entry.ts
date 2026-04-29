import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import OpenAI from 'npm:openai@4.77.0';

// ═══════════════════════════════════════════════════════════════════
// CLIENTS
// ═══════════════════════════════════════════════════════════════════
const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_KEY    = Deno.env.get("GEMINI_API_KEY");

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
          { role: 'system', content: 'You are a professional script writer. Always respond with valid JSON containing "content" (string) and "word_count" (number).' },
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

    try { return JSON.parse(rawText); } catch (_) {}
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
    const obj = rawText.match(/\{[\s\S]*\}/);
    if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }

    if (attempt === retries) throw new Error('Failed to parse Claude JSON after all attempts');
  }
}

async function callGemini(prompt, temperature = 0.85, retries = 2) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_KEY}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 16384, responseMimeType: 'application/json' },
      }),
    });
    if (response.status === 429) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 3000));
      continue;
    }
    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini error ${response.status}: ${err.error?.message}`);
    }
    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    try { return JSON.parse(rawText); } catch (_) {}
    const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
    const obj = rawText.match(/\{[\s\S]*\}/);
    if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
    if (attempt === retries) throw new Error('Failed to parse Gemini JSON after all attempts');
  }
}

// ─────────────────────────────────────────────────────────────────
// ROUTING LOGIC
//
//  sleep_story    → Claude primary  (best narrative fiction)
//                   OpenAI fallback → Gemini fallback
//
//  sleep_meditation → OpenAI primary (handles affirmations well, cheaper)
//                     Claude fallback → Gemini fallback
//
//  standard         → OpenAI primary (faster, cheaper for viral scripts)
//                     Claude fallback → Gemini fallback
// ─────────────────────────────────────────────────────────────────
async function callLLM(prompt, temperature, scriptMode) {
  const isSleepStory = scriptMode === 'sleep_story';

  // Primary
  try {
    if (isSleepStory) {
      const result = await callClaude(prompt, temperature);
      console.log(`[LLM] sleep_story via Claude ✅`);
      return { result, provider: 'claude' };
    } else {
      const result = await callOpenAI(prompt, temperature);
      console.log(`[LLM] ${scriptMode} via OpenAI ✅`);
      return { result, provider: 'openai' };
    }
  } catch (primaryErr) {
    const msg = primaryErr.message || '';
    console.warn(`[LLM] Primary failed: ${msg.substring(0, 120)}`);

    // First fallback
    try {
      if (isSleepStory && openai) {
        // Claude failed → try OpenAI
        const result = await callOpenAI(prompt, temperature);
        console.log(`[LLM] sleep_story fallback via OpenAI ✅`);
        return { result, provider: 'openai' };
      } else if (ANTHROPIC_KEY) {
        // OpenAI failed → try Claude
        const result = await callClaude(prompt, temperature);
        console.log(`[LLM] ${scriptMode} fallback via Claude ✅`);
        return { result, provider: 'claude' };
      }
    } catch (fallbackErr) {
      console.warn(`[LLM] First fallback failed: ${fallbackErr.message?.substring(0, 120)}`);
    }

    // Second fallback: Gemini
    if (GEMINI_KEY) {
      console.log('[LLM] Falling back to Gemini 2.5 Pro...');
      const result = await callGemini(prompt, temperature);
      return { result, provider: 'gemini' };
    }

    throw primaryErr;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ═══════════════════════════════════════════════════════════════════

function buildMeditationWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  return `You are an expert sleep audio script writer creating professional-grade bedtime motivational meditations (Jason Stephenson / Michael Sealey style).

You are writing the ACTUAL meditation script — the words the narrator speaks. You are NOT writing ABOUT meditation.

**ABSOLUTELY FORBIDDEN**:
❌ Explaining what ASMR is or how it works
❌ Mentioning dopamine, oxytocin, neuroscience, or "studies show"
❌ Giving practical sleep tips or educational content
❌ Referencing "this video", "this channel", or YouTube
❌ First-person anecdotes ("I remember when I...")
❌ Any meta-commentary about what the script is doing
❌ Conflict, tension, danger, stress, urgency

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Content Type: Motivational Meditation
- Duration: ${project.video_duration_minutes || 10} minutes total
${selectedHook && isFirstBatch ? `- Opening line: "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**FULL SCRIPT ARC**:
${outlineContext}

**NOW WRITING SECTION ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**SECTION SYNOPSIS**:
${batch.synopsis}

**MANDATORY WORD COUNT**: Write AT LEAST ${batch.target_words} words. If under ${Math.round(batch.target_words * 0.9)} words = FAILURE. Add repetition, imagery, [PAUSE] markers.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**STYLE RULES**:
- Extremely gentle, warm, soothing — deliberately slow and monotonous
- Each key concept stated, then restated 3-5 times in different words
- Simple vocabulary — short sentences (8-18 words)
- Second-person "you" — speak directly to the listener
- [PAUSE 3 SEC] after key phrases, [PAUSE 5 SEC] between thoughts, [PAUSE 10 SEC] between major sections, [BREATHE] for breathing cues
- Use pauses every 2-3 sentences minimum
- Nature metaphors throughout: ocean, mountain, tree, river, moon, stars
- Permission phrases: "You don't have to...", "Let yourself...", "Allow...", "Release..."

${isFirstBatch ? 'OPENING: Start with a gentle welcome. Settle the listener physically. Guide 3 slow breaths with [BREATHE] markers. Then ease into the first theme through imagery.' : 'Continue seamlessly from where the previous section ended.'}
${isLastBatch ? 'ENDING: Fewest words, most pauses. End with: "Rest now... peaceful dreams... [PAUSE 10 SEC]" then fade to near-silence.' : 'End by gently deepening relaxation, bridging naturally to the next theme.'}

Return JSON:
{
  "content": "The full meditation script text including all [PAUSE X SEC] and [BREATHE] markers...",
  "word_count": 1234
}`;
}

function buildSleepStoryWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch }) {
  // Extract protagonist name from batch or detect from previous content
  let protagonistName = batch.protagonist_name || '';
  if (!protagonistName && previousContent) {
    const nameMatch = previousContent.match(/\b([A-Z][a-z]{2,12})\b(?= walks| stands| sits| looks| watches| feels| steps| moves| carries| holds| opens| turns| settles)/);
    if (nameMatch) protagonistName = nameMatch[1];
  }
  const protagonistHint = protagonistName
    ? `\n- The protagonist's name is **${protagonistName}** — use this name consistently throughout.\n`
    : '';

  const storyTheme       = topic?.title || project.name || 'a peaceful journey';
  const storyDescription = topic?.description || '';

  // Scrub any meditation bleed from the synopsis before sending to writer
  const meditationPattern = /\b(affirmation|breathe in|breathe out|body awareness|body scan|you are safe|you are loved|you are enough|settle into|settling in|guided relaxation|feel your body|take a deep breath|opening & welcome|physical settling|permission to rest|anchoring phrase|soft opening|energetic settling)\b/gi;
  let cleanSynopsis = batch.synopsis.replace(meditationPattern, '[omit]').trim();
  const meditationHits = (batch.synopsis.match(meditationPattern) || []).length;
  if (meditationHits >= 2) {
    console.warn(`[Batch ${batch.batch_number}] ⚠️ Synopsis has ${meditationHits} meditation terms — replacing`);
    cleanSynopsis = `Write a scene where the protagonist continues their journey through "${batch.story_segment}". Focus on what they observe, the atmosphere around them, and one small gentle activity or discovery. Pure third-person narrative — no inner monologue, no self-affirmation.`;
  }

  const openingInstruction = isFirstBatch
    ? `START THE STORY IMMEDIATELY. Open with a single vivid sentence placing the protagonist in a specific location at a specific moment — like the first line of a novel. ${selectedHook?.hook_text ? `Use or adapt this as your very first line: "${selectedHook.hook_text}"` : 'No welcome, no preamble. Just: character + place + moment.'}`
    : `Continue seamlessly from the final sentence of the previous chapter. Do not recap. Do not re-introduce the character. Simply carry on.`;

  const endingInstruction = isLastBatch
    ? `Close by letting the protagonist naturally settle into stillness — finding a warm spot, watching the last light fade, the world quieting around them. Sentences shorten. The world softens. End on a single final image — something gentle and still. No moral. No address to the listener. No "goodnight". Let the story dissolve into quiet.`
    : `End at a natural pause — the protagonist completing an activity, pausing to watch something, or moving into a new space. Leave a sense of gentle continuation, not a cliffhanger.`;

  return `You are a master of adult bedtime fiction — the kind told on the Calm app or Headspace Sleepcasts. You write immersive, sensory narratives that carry listeners into sleep through the weight of a beautiful world, not through instruction.

You are writing NARRATIVE FICTION. Third-person. A named character in a rich, specific world. You are NOT a meditation guide. You do not address the listener. You tell a story.

═══════════════════════════════════════
CARDINAL RULES — BREAKING ANY = FAILURE
═══════════════════════════════════════

✅ ALWAYS:
- Write in third-person: "Mara lifts the lantern" / "He watches the tide"
- Use present tense: "The fog drifts" not "The fog drifted"
- Name your protagonist and use that name consistently
- Fill every paragraph with specific sensory texture — sight, sound, smell, touch
- Use [PAUSE 3 SEC], [PAUSE 5 SEC], [PAUSE 8 SEC] after vivid images
- Write at lullaby pace — slow, unhurried, detailed — but always moving forward

❌ NEVER:
- Use "you", "your", or address the listener in any form
- Write affirmations ("you are safe", "you are worthy", "you deserve rest")
- Write breathing instructions ("take a deep breath", "breathe in slowly")
- Write body scan or relaxation instructions ("feel your muscles relax", "your eyelids grow heavy")
- Open with a welcome, intro, or preamble
- Use [BREATHE] — this is a meditation marker. Use only [PAUSE X SEC].
- Include conflict, threat, urgency, or anything that raises heart rate

WRONG EXAMPLE (do not write this):
"You find yourself in a quiet forest. Take a deep breath and feel the peace around you. You are safe here. Let your body relax... [BREATHE]"

RIGHT EXAMPLE (write like this):
"The path narrows between two ancient oaks, their roots raised above the soil like sleeping animals. Mara steps carefully, her lantern throwing a warm circle of gold onto the moss below. [PAUSE 5 SEC] An owl calls from somewhere deep in the canopy — one long, hollow note that fades into the trees before she can place it."

═══════════════════════════════════════
STORY CONTEXT
═══════════════════════════════════════
- Story/Theme: ${storyTheme}
- Setting: ${storyDescription}
- Total chapters: ${sortedBatches.length}
- Total runtime: ${project.video_duration_minutes || 10} minutes
${protagonistHint}

FULL STORY ARC:
${outlineContext}

═══════════════════════════════════════
THIS CHAPTER: ${batch.batch_number} of ${sortedBatches.length} — "${batch.story_segment}"
═══════════════════════════════════════

CHAPTER DIRECTION:
${cleanSynopsis}

MANDATORY WORD COUNT: ${batch.target_words} words minimum. Under ${Math.round(batch.target_words * 0.9)} words = FAILURE.
Add word count by: more environmental detail, more sensory layers, the character noticing small things, the world shifting subtly, longer pauses between events. Never pad with repetition or affirmations.

${previousContent ? `PREVIOUS CHAPTERS (same protagonist, same world — do NOT recap or repeat):\n${previousContent.slice(-3500)}\n` : ''}

PACING: [PAUSE 3 SEC] after vivid images. [PAUSE 5 SEC] after scene transitions. [PAUSE 8 SEC] at close of major sections. Aim for a pause every 4-6 sentences. Pause frequency increases as the chapter progresses.

WORLD BUILDING: Named locations. Objects with weight and history. Small ambient sounds. Specific light quality.

${openingInstruction}

${endingInstruction}

Return only valid JSON:
{
  "content": "The full chapter text. Third-person present tense. Named protagonist. Rich sensory detail. [PAUSE X SEC] markers. NO second-person. NO affirmations. NO breathing cues.",
  "word_count": 1234
}`;
}

function buildStandardWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  return `You are an elite YouTube scriptwriter creating a viral narration script.

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'General'}
- Tone: ${project.tone || 'dramatic'}
- Duration: ${project.video_duration_minutes || 10} minutes
${selectedHook && isFirstBatch ? `- Opening Hook (MUST use as first line): "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**FULL STORY ARC**:
${outlineContext}

**NOW WRITING BATCH ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**BATCH SYNOPSIS**:
${batch.synopsis}

**MANDATORY WORD COUNT**: Write AT LEAST ${batch.target_words} words. Under ${Math.round(batch.target_words * 0.9)} words = FAILURE. Add more detail, anecdotes, specific examples, emotional beats.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**RULES**:
1. Write ONLY narration text — words the narrator speaks aloud
2. NO scene directions, NO [SCENE:], NO [VISUAL:], NO stage directions
3. NO "In this video", NO "Welcome back", NO meta-commentary
4. Mix punchy short sentences (3-7 words) with flowing longer ones (20-30 words)
5. Include micro-hooks every 60-90 seconds ("But that wasn't the real story...", "What happened next changed everything...")
6. ${isFirstBatch ? 'Open STRONG — first 5 seconds determine if they stay' : 'Continue seamlessly from where the previous batch ended'}
7. ${isLastBatch ? 'End with a powerful closing line — memorable, perspective-shifting. Include a subtle CTA.' : 'End on a cliffhanger or curiosity hook that pulls into the next batch'}
8. Specific details: names, numbers, dates, places — no vague generalities
9. Write for the EAR, not the eye — natural spoken rhythm

Return JSON:
{
  "content": "The full narration text for this batch...",
  "word_count": 1234
}`;
}

function buildExtensionPrompt({ scriptMode, content, wordCount, targetWords }) {
  const wordsNeeded = targetWords - wordCount;

  if (scriptMode === 'sleep_story') {
    return `The following sleep story chapter is too short (${wordCount} words — need ${targetWords}).

EXISTING CONTENT (do NOT repeat — continue seamlessly from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this chapter.
- Third-person present tense. Same named protagonist. Same world and tone.
- Add more sensory detail: what the character sees, hears, smells, touches
- Add small narrative beats: something noticed, something done, a moment of stillness
- Add [PAUSE 3 SEC] and [PAUSE 5 SEC] markers after vivid images
- NO second-person "you". NO affirmations. NO [BREATHE]. NO "you are safe".

Return JSON: {"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
  }

  if (scriptMode === 'sleep_meditation') {
    return `The following meditation section is too short (${wordCount} words — need ${targetWords}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words. Same tone, style, pacing. Add more repetition, imagery, [PAUSE] markers, [BREATHE] cues, sensory grounding.

Return JSON: {"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
  }

  return `The following script section is too short (${wordCount} words — need ${targetWords}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words. Same tone, style, pacing. Add more detail, anecdotes, specific examples, emotional beats.

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
      topic = topics[0] || null;
    }

    let selectedHook = null;
    if (project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0] || null;
    }

    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0] || null;
    }

    // Detect script mode
    const scriptMode = (() => {
      const pm = project.project_mode || '';
      if (pm === 'sleep_meditation' || pm === 'sleep_story') return pm;
      const sm = channel?.script_mode || '';
      if (sm === 'sleep_meditation' || sm === 'sleep_story') return sm;
      return 'standard';
    })();

    const isSleepMode  = scriptMode !== 'standard';
    const isSleepStory = scriptMode === 'sleep_story';

    console.log(`[generateScriptBatches] mode=${scriptMode} project=${project_id}`);

    // ── Strategy block (standard only) ──
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

    const allBatches     = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const sortedBatches  = allBatches.sort((a, b) => a.batch_number - b.batch_number);
    const pendingBatches = sortedBatches.filter(b => b.status === 'pending' || b.status === 'generating');

    if (pendingBatches.length === 0) {
      return Response.json({ success: true, message: 'No pending batches to generate', completed: 0, done: true });
    }

    const completedBatches = sortedBatches.filter(b => b.status === 'completed' && b.content);

    // Process ONE batch per call (avoids platform timeout)
    const batch = pendingBatches[0];

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: 'generating' });

    const previousContent = completedBatches
      .sort((a, b) => a.batch_number - b.batch_number)
      .map(b => `--- ${isSleepStory ? 'CHAPTER' : 'BATCH'} ${b.batch_number}: ${b.story_segment} ---\n${b.content}`)
      .join('\n\n');

    const isFirstBatch = batch.batch_number === 1;
    const isLastBatch  = batch.batch_number === sortedBatches.length;

    const outlineContext = sortedBatches
      .map(b => `${isSleepStory ? 'Chapter' : 'Batch'} ${b.batch_number} "${b.story_segment}": ${b.focus_area}`)
      .join('\n');

    const promptArgs = {
      batch, project, topic, selectedHook, sortedBatches,
      previousContent, outlineContext, isFirstBatch, isLastBatch,
      strategyBlock, scriptMode,
    };

    const prompt = scriptMode === 'sleep_story'
      ? buildSleepStoryWritingPrompt(promptArgs)
      : scriptMode === 'sleep_meditation'
        ? buildMeditationWritingPrompt(promptArgs)
        : buildStandardWritingPrompt(promptArgs);

    // Temperature: sleep_story slightly higher for narrative variety
    const baseTemp = scriptMode === 'sleep_story' ? 0.72
      : scriptMode === 'sleep_meditation' ? 0.65
      : 0.85;

    const minWords  = Math.round(batch.target_words * 0.92);
    const maxWords  = Math.round(batch.target_words * 1.20); // cap to prevent runaway extension
    const MAX_ATTEMPTS = 3;

    let content   = '';
    let wordCount = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const currentPrompt = (attempt === 1 || !content)
        ? prompt
        : buildExtensionPrompt({ scriptMode, content, wordCount, targetWords: batch.target_words });

      const { result, provider } = await callLLM(currentPrompt, baseTemp, scriptMode);
      if (attempt === 1) console.log(`[Batch ${batch.batch_number}] Provider: ${provider}`);

      const newContent = result.content || '';
      content   = attempt > 1 && content ? content.trim() + '\n\n' + newContent.trim() : newContent;
      wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

      if (wordCount >= minWords || wordCount >= maxWords || attempt === MAX_ATTEMPTS) {
        if (wordCount < minWords) {
          console.warn(`[Batch ${batch.batch_number}] ⚠️ ${wordCount}/${batch.target_words} words after ${MAX_ATTEMPTS} attempts — accepting`);
        }
        if (wordCount > maxWords) {
          console.warn(`[Batch ${batch.batch_number}] ✂️ ${wordCount} words — over cap, accepting as-is`);
        }
        break;
      }

      console.log(`[Batch ${batch.batch_number}] ${wordCount}/${batch.target_words} words (attempt ${attempt}/${MAX_ATTEMPTS}) — extending...`);
    }

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
      content,
      word_count: wordCount,
      status:     'completed',
    });

    console.log(`[Batch ${batch.batch_number}] ✅ ${wordCount}/${batch.target_words} words (${scriptMode})`);

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status:       'scripting',
      current_step: 3,
    });

    const remainingPending = sortedBatches.filter(b =>
      b.id !== batch.id && (b.status === 'pending' || b.status === 'generating')
    ).length;

    return Response.json({
      success:      true,
      completed:    1,
      total_batches: sortedBatches.length,
      remaining:    remainingPending,
      done:         remainingPending === 0,
      script_mode:  scriptMode,
      word_count:   wordCount,
      target_words: batch.target_words,
    });

  } catch (error) {
    console.error('[generateScriptBatches] error:', error.message);
    const msg  = error.message || 'Unknown error';
    const code = /credit balance|billing|purchase credits/i.test(msg) ? 402
      : /rate limit|too many requests/i.test(msg) ? 429
      : /api key|unauthorized|authentication/i.test(msg) ? 401
      : 500;
    return Response.json({ error: msg }, { status: code });
  }
});