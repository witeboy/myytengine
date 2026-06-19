import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v4 — Claude primary + Gemini fallback

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");


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
  try {
    const result = await callGemini(prompt, temperature);
    return { result, provider: 'gemini' };
  } catch (geminiErr) {
    console.error(`[LLM] Gemini failed: ${geminiErr.message?.substring(0, 120)}`);
    throw geminiErr;
  }
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP SCRIPT WRITING PROMPT
// ═══════════════════════════════════════════════════════════════════
function buildSleepWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  return `You are an expert bedtime sleep-story writer. You write classic, character-driven folk and fairy tales — retold slowly and gently so the listener drifts peacefully to sleep. Think of the soothing storytelling of Calm and Headspace sleepcasts: a real story, with characters, a setting, and a quiet plot, told at a tranquil, unhurried pace.

**CRITICAL RULE — READ THIS FIRST**:
You are writing an ACTUAL STORY — a narrative with characters, a place, and gentle events that unfold. This is NOT a guided meditation. This is NOT affirmations. You are a gentle narrator telling a soothing bedtime tale. Tell the story.

**ABSOLUTELY FORBIDDEN CONTENT** (including these will ruin the script):
❌ Affirmations or self-talk ("you are enough", "you are safe", "you are loved")
❌ Second-person guided meditation ("notice your breath", "feel your body sinking")
❌ Breathing instructions or [BREATHE] cues
❌ Explaining what ASMR/meditation is, neuroscience, or "studies show"
❌ Giving sleep tips or advice
❌ Referencing "this video", "this channel", or YouTube
❌ First-person anecdotes from the narrator ("I remember when I...")
❌ Meta-commentary about what the script is doing
❌ Conflict, danger, stress, urgency, jump-scares, or sharp surprises
❌ Energizing words: "exciting", "alert", "suddenly", "shocking"
❌ Cliffhangers or unresolved tension between sections

**PROJECT CONTEXT**:
- Story / Title: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Content Type: Bedtime Sleep Story (folk / fairy tale)
- Duration: ${project.video_duration_minutes || 10} minutes total
${strategyBlock}

**FULL STORY ARC** (all chapters):
${outlineContext}

**YOU ARE NOW WRITING CHAPTER ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**CHAPTER SYNOPSIS** (follow this closely — write THIS part of the story):
${batch.synopsis}

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. This is NON-NEGOTIABLE. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Add more gentle description, more soft sensory detail, more unhurried moments in the story until you reach the target. (150 words ≈ 1 minute of narration.)

${previousContent ? `**PREVIOUSLY WRITTEN** (continue the SAME story seamlessly — keep the same characters, place, and events; do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ STORYTELLING STYLE RULES ═══**

**NARRATIVE VOICE**:
- Third-person, past tense — a gentle storyteller voice ("Once, in a quiet valley, there lived a small grey rabbit named Pim...")
- Tell a real story with named characters, a setting, and gentle events that flow one into the next
- Warm, slow, soothing — every scene unhurried and peaceful
- Low-stakes throughout: kindness, curiosity, small discoveries, quiet wonder — never danger

**LANGUAGE**:
- Simple vocabulary, mostly short flowing sentences (8-20 words)
- Soft, lulling rhythm — gentle repetition of soothing phrases is welcome
- Rich but calm sensory detail: warm light, soft moss, the smell of bread, a slow river, distant birdsong

**PACING MARKERS** (include gently, between story beats — NOT breathing cues):
- [PAUSE 3 SEC] — after a soft moment
- [PAUSE 5 SEC] — between scenes
- Use a pause every few sentences to let the story breathe — but keep the prose flowing as a story, not a list of cues

**${isFirstBatch
  ? 'OPENING: Begin the story the classic way — establish the character(s), the gentle setting, and the calm mood. "Once upon a time..." style openings are perfect. Ease the listener into the world.'
  : 'CONTINUE: Pick up the SAME story exactly where the previous chapter left off — same characters, same place. Move the gentle plot forward.'}**
**${isLastBatch
  ? 'ENDING: Bring the story to a soft, contented close — the characters settle, all is well and peaceful. End on a calm, resolved note (e.g. everyone drifting off to sleep), trailing into stillness. No CTA, no cliffhanger.'
  : 'END: Close this chapter on a calm, settled beat that flows naturally into the next part of the story — no dramatic cliffhanger.'}**

Return JSON:
{
  "content": "The full story narration for this chapter, including occasional [PAUSE X SEC] markers...",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER SCRIPT WRITING PROMPT — fact-driven, educational narration
// ═══════════════════════════════════════════════════════════════════
function buildExplainerWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  // Pull research notes if available
  let researchBlock = '';
  if (project.research_notes) {
    try {
      const r = typeof project.research_notes === 'string' ? JSON.parse(project.research_notes) : project.research_notes;
      const facts = Array.isArray(r.facts) ? r.facts.slice(0, 12).map(f => `- ${f.claim || f}`).join('\n') : '';
      const numbers = Array.isArray(r.key_numbers) ? r.key_numbers.slice(0, 10).map(n => `- ${n}`).join('\n') : '';
      const miscons = Array.isArray(r.common_misconceptions) ? r.common_misconceptions.slice(0, 6).map(m => `- ${m}`).join('\n') : '';
      researchBlock = `\n**GROUNDED RESEARCH** (use these facts — do NOT invent new statistics):
${facts ? `Facts:\n${facts}\n` : ''}${numbers ? `Key Numbers:\n${numbers}\n` : ''}${miscons ? `Common Misconceptions:\n${miscons}\n` : ''}`;
    } catch (_) {}
  }

  return `You are an expert explainer-video scriptwriter (think Veritasium, Vox, Kurzgesagt, Wendover, Polymatter).

You write EDUCATIONAL narration that teaches the viewer something real and useful. You do NOT write viral storytelling, fake suspense, "nobody tells you" hooks, or invented characters.

**PROJECT CONTEXT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'General'}
- Tone: ${project.tone || 'educational'} — clear, intelligent, grounded
- Video Duration: ${project.video_duration_minutes || 10} minutes
${selectedHook && isFirstBatch ? `- Opening Line (MUST use as first sentence): "${selectedHook.hook_text}"` : ''}
${strategyBlock}${researchBlock}

**FULL SCRIPT ARC** (all batches):
${outlineContext}

**YOU ARE NOW WRITING BATCH ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**BATCH SYNOPSIS** (follow this closely):
${batch.synopsis}

**MANDATORY WORD COUNT**: AT LEAST ${batch.target_words} words. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Add more worked examples, more concrete numbers, more mechanism detail until you reach the target. (150 words ≈ 1 minute of narration.)

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ EXPLAINER WRITING RULES ═══**

✅ DO:
- Write narration only — words the narrator will speak.
- Use precise, specific language. Real numbers, real names, real mechanisms.
- Explain HOW and WHY, not just WHAT. Walk through cause→effect step by step.
- Use worked examples ("Imagine a laundromat with $8,000/month in revenue and $5,200 in costs...").
- Define jargon the first time you use it.
- Use logical transitions: "This means...", "So when we ask why...", "The reason is...", "But there's a catch:...".
- Treat the viewer as intelligent and curious.
- Vary sentence rhythm: punchy declarative sentences mixed with longer explanatory ones.

❌ DO NOT:
- NO "but here's what nobody tells you", "the SHOCKING truth", "you won't believe", "hiding in plain sight".
- NO fake suspense or invented characters ("meet Jim, a frustrated office worker").
- NO curiosity gaps for their own sake — curiosity should come from real, answered questions.
- NO "In this video", "Welcome back", "Stay tuned", or meta-commentary.
- NO scene directions, [SCENE:], [VISUAL:], or stage directions — narration only.
- NO unsourced statistics or made-up studies. If you don't have a real number, describe the mechanism qualitatively.
- NO generic motivational filler.
- NO dramatic cliffhangers between batches — use logical bridges instead.

**${isFirstBatch ? 'OPENING: Frame the question precisely. State what we are going to understand and why it matters. No shock-bait.' : 'CONTINUE: Pick up logically from the previous batch. Use a bridge like "Now that we understand X, the next question is Y."'}**
**${isLastBatch ? 'ENDING: Synthesize the one durable insight the viewer should remember. End with a clean, quotable line — not a cliffhanger. Include a subtle CTA.' : 'END: Set up the next batch with a logical question, not a dramatic cliffhanger.'}**

Return JSON:
{
  "content": "The full narration text for this batch...",
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

    // Detect script mode — respect project_mode (sleep_*, explainer) or fall back to standard
    const KNOWN_MODES = ['sleep_meditation', 'sleep_story', 'explainer'];
    const scriptMode = KNOWN_MODES.includes(project.project_mode) ? project.project_mode : 'standard';
    const isSleepMode = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';
    const isExplainerMode = scriptMode === 'explainer';

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
        : isExplainerMode
        ? buildExplainerWritingPrompt(promptArgs)
        : buildStandardWritingPrompt(promptArgs);

      console.log(`[Batch ${batch.batch_number}] Generating ~${batch.target_words} words (${scriptMode})...`);

      // Sleep scripts use lower temperature for soothing consistency.
      // Explainer scripts use lower temperature to stay factual and reduce hallucination.
      const baseTemp = isSleepMode ? 0.65 : isExplainerMode ? 0.55 : 0.85;
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