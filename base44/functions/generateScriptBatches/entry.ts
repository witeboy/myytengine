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
// SLEEP STORY WRITING PROMPT — authentic folk / fairy-tale narrative
// ═══════════════════════════════════════════════════════════════════
function buildSleepWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  return `You are a master bedtime storyteller. You retell classic folk tales and fairy tales in a slow, soothing voice that gently carries a listener to sleep — in the tradition of the Calm app sleep stories and the Nothing Much Happens podcast.

**CRITICAL RULE — READ THIS FIRST**:
You are writing an ACTUAL STORY. A real narrative with named characters, a real setting, and a gentle plot that unfolds and resolves peacefully. You are NOT writing a guided meditation. You are NOT speaking to the listener. You are TELLING A TALE.

**ABSOLUTELY FORBIDDEN — these RUIN a sleep story:**
❌ Second-person guided-meditation address ("you are at ease", "feel your breath", "allow yourself", "imagine yourself walking")
❌ Affirmations ("you are enough", "you are safe", "you deserve rest")
❌ Breathing cues, body scans, or relaxation instructions ("feel the weight settle in your bones")
❌ [BREATHE] markers (this is a STORY, not a meditation)
❌ Speaking ABOUT the listener, their feelings, their body, or their breath
❌ Meta-commentary, ASMR talk, neuroscience, sleep tips
❌ Conflict, danger, jump-scares, suspense, cliffhangers, urgency
❌ "this video", "this channel", first-person author anecdotes

**WHAT YOU ARE WRITING — a CLASSIC TALE, RETOLD SLOWLY:**
✓ A real folk/fairy tale told in third person about characters who have names and do things
✓ A clear setting (a village, a cottage, a forest path, a snowy kingdom, a quiet harbour)
✓ A gentle plot that moves forward — someone goes somewhere, meets someone, makes something, finds something
✓ Low, warm stakes only — a lost mitten found, a kindness repaid, a long walk home, a feast prepared, a small wish granted. Nothing frightening, nothing tense.
✓ Cozy, abundant sensory detail woven into the ACTION (the smell of bread from the baker's window AS the heroine passes it — not "notice the smell of bread")
✓ A soft, unhurried storyteller's cadence — gentle, melodic, slightly old-fashioned ("Once, in a village at the foot of a green hill, there lived a girl named...")

**PROJECT CONTEXT**:
- Tale / Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Duration: ${project.video_duration_minutes || 10} minutes total
${strategyBlock}

**FULL STORY ARC** (all chapters):
${outlineContext}

**YOU ARE NOW WRITING CHAPTER ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**CHAPTER SYNOPSIS** (follow this closely — tell THIS part of the tale):
${batch.synopsis}

**MANDATORY WORD COUNT**: AT LEAST ${batch.target_words} words. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Slow the pace, add more cozy sensory detail, more gentle description of the place and the characters, until you reach the target. (150 words ≈ 1 minute of narration.)

${previousContent ? `**PREVIOUSLY TOLD** (continue the SAME story seamlessly — same characters, same place, do NOT restart or repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ STORYTELLING STYLE RULES ═══**

**VOICE & CADENCE:**
- Third person, past tense, like a grandparent telling a bedtime tale by the fire.
- Slow, warm, melodic, slightly old-fashioned. Long flowing sentences mixed with short gentle ones.
- Unhurried — let small moments breathe. There is no rush in this world.
- Soft, simple vocabulary. Nothing jarring, clever, or modern-sounding.

**STORY CRAFT:**
- Keep characters consistent across chapters — same names, same little details.
- Move the plot GENTLY forward in this chapter, following the synopsis. Something small and pleasant happens.
- Linger lovingly on cozy sensory detail woven INTO the action: warm lamplight, the crackle of a hearth, soft snow, the scent of stew, the rustle of a quilt, a cat curling on a windowsill.
- Keep ALL stakes low and warm. Every small problem is solved gently and kindly.
- Use soft pause markers sparingly to let a calm moment settle: [PAUSE 3 SEC] after a peaceful beat, [PAUSE 5 SEC] between scenes. Do NOT use [BREATHE]. Do NOT overuse pauses — the story itself should be calming.

**${isFirstBatch ? 'OPENING THE TALE: Begin like a real story — "Once, in a..." or "Long ago, in a..." Introduce the named main character, the cozy setting, and the small gentle thing that begins the tale. Set a warm, safe, sleepy mood from the first line. Do NOT welcome or address the listener.' : 'Continue the SAME tale seamlessly from where the previous chapter ended — same characters, same place, same gentle momentum.'}**
**${isLastBatch ? 'ENDING THE TALE: Bring the story to a soft, satisfying, fully-resolved close — the character safe and content, the small quest complete, everyone settling in for the night. End on a peaceful, drowsy final image (a candle guttering low, snow falling on a quiet roof, a contented sigh). The very last lines should be the calmest of all. [PAUSE 5 SEC]' : 'End this chapter on a calm, settled beat that flows naturally into the next part of the tale — never a cliffhanger or a question.'}**

Return JSON:
{
  "content": "The full story text for this chapter, in third-person narrative prose, with occasional [PAUSE X SEC] markers...",
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

    // Detect script mode — respect project_mode (sleep_story, explainer) or fall back to standard.
    // Legacy sleep_meditation projects are folded into sleep_story.
    let rawMode = project.project_mode;
    if (rawMode === 'sleep_meditation') rawMode = 'sleep_story';
    const KNOWN_MODES = ['sleep_story', 'explainer'];
    const scriptMode = KNOWN_MODES.includes(rawMode) ? rawMode : 'standard';
    const isSleepMode = scriptMode === 'sleep_story';
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
        ? buildSleepWritingPrompt(promptArgs)
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