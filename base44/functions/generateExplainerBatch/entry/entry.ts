import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER PIPELINE — Step 2: Generate ONE script batch grounded in research.
// Dedicated function for project_mode === 'explainer'.
// Standard/sleep pipelines use generateScriptBatches.
// ═══════════════════════════════════════════════════════════════════

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

async function callClaude(prompt, temperature = 0.55, retries = 2) {
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
      throw new Error(`Claude ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }
    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    try { return JSON.parse(rawText); } catch (_) {}
    let jsonStr = rawText;
    if (rawText.includes('```json')) jsonStr = rawText.split('```json')[1].split('```')[0].trim();
    else if (rawText.includes('```')) jsonStr = rawText.split('```')[1].split('```')[0].trim();
    try { return JSON.parse(jsonStr); } catch (_) {}
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }

    if (attempt === retries) throw new Error('Failed to parse Claude JSON');
  }
}

async function callGemini(prompt, temperature = 0.55, retries = 2) {
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
      throw new Error(`Gemini ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }
    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    try { return JSON.parse(rawText); } catch (_) {}
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }
    if (attempt === retries) throw new Error('Failed to parse Gemini JSON');
  }
}

async function callLLM(prompt, temperature = 0.55) {
  try {
    const result = await callClaude(prompt, temperature);
    return { result, provider: 'claude' };
  } catch (claudeErr) {
    console.warn(`[LLM] Claude failed: ${claudeErr.message.substring(0, 120)}`);
    if (!GEMINI_KEY) throw claudeErr;
    console.log('[LLM] Falling back to Gemini...');
    const result = await callGemini(prompt, temperature);
    return { result, provider: 'gemini' };
  }
}

function buildExplainerWritingPrompt({ batch, project, topic, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, researchNotes }) {
  // Parse research into a tight reference block
  let researchBlock = '';
  if (researchNotes) {
    try {
      const research = typeof researchNotes === 'string' ? JSON.parse(researchNotes) : researchNotes;
      const facts = (research.facts || []).map((f, i) => `  [F${i + 1}] ${f.claim}`).join('\n');
      const numbers = (research.key_numbers || []).map((n, i) => `  [N${i + 1}] ${n.number} — ${n.context}`).join('\n');
      const myths = (research.common_misconceptions || []).map((m, i) => `  [M${i + 1}] MYTH: ${m.myth}\n         TRUTH: ${m.truth}`).join('\n');
      researchBlock = `
**═══ GROUNDED RESEARCH — THE ONLY FACTS YOU MAY USE ═══**

FACTS:
${facts || '  (none)'}

KEY NUMBERS:
${numbers || '  (none)'}

MISCONCEPTIONS TO CORRECT:
${myths || '  (none)'}
`;
    } catch (_) {
      researchBlock = `\n**RESEARCH NOTES**: ${researchNotes}\n`;
    }
  }

  return `You are an expert educational scriptwriter narrating a fact-grounded explainer video. You write in the patient, clear voice of a great teacher — never in the hype voice of a viral YouTuber.

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'Educational'}
- Video Duration: ${project.video_duration_minutes || 10} minutes
${researchBlock}

**FULL STORY ARC** (all batches):
${outlineContext}

**YOU ARE WRITING BATCH ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**BATCH SYNOPSIS**:
${batch.synopsis}

**MANDATORY WORD COUNT**: AT LEAST ${batch.target_words} words. Below ${Math.round(batch.target_words * 0.9)} = failure. Add more specific examples, more numbers from research, more step-by-step mechanism explanation. 150 words = 1 minute of narration.

${previousContent ? `**PREVIOUSLY WRITTEN** (continue seamlessly, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ EXPLAINER WRITING RULES (NON-NEGOTIABLE) ═══**

✅ DO:
1. Quote SPECIFIC numbers, percentages, and ranges from the research block above — use them verbatim
2. When citing a fact, weave it naturally: "Self-storage businesses typically operate with profit margins between 40 and 60 percent..."
3. Explain mechanisms step by step — show your reasoning
4. Define terms before using them
5. Correct misconceptions head-on when this batch covers them
6. Use a calm, teacherly cadence — varied sentence lengths
7. Use concrete examples from the research, not invented ones

❌ DO NOT:
1. Invent any statistic, percentage, company name, dollar amount, or example not in the research block
2. Use viral hype phrases — banned list: "you won't believe", "wait till you hear", "this changes everything", "what happened next", "buckle up", "here's the kicker", "trust me", "I know, I know"
3. Tease future batches mysteriously ("but first..."). Use logical transitions ("Now that we understand X, let's see how Y follows.")
4. Use clickbait curiosity gaps
5. Make sweeping claims ("90% success rate") unless EXACTLY in the research (and correct it if it's a misconception)
6. Write rhetorical hype questions ("Sounds crazy, right?")
7. Address the audience as "guys" or "you" excessively — use occasional "we" for shared exploration

**WRITING STYLE**:
- Voice: a great college professor explaining to curious adults
- Sentence rhythm: mix short declarative ("That's a real number.") with explanatory longer sentences
- Numbers: spell out small ones, use digits for percentages and dollar figures ("40 to 60 percent", "$100,000 to $300,000")
- No scene directions, no [SCENE:], no stage directions — narration text only
- No "in today's video", no "welcome back", no meta-commentary

**${isFirstBatch ? 'OPENING: State the central question or claim directly. No hype intro. Example: "Self-storage businesses regularly post profit margins of 40 to 60 percent. That number sounds high — let\'s look at why it holds."' : 'Continue logically from the previous batch. Use a transitional bridge that references what was just established.'}**

**${isLastBatch ? 'CLOSING: Summarize the 2-3 most important takeaways. Explicitly correct any major misconception from the research. End with a clear, useful conclusion — not a CTA hype line. Example: "The takeaway is simple: boring businesses succeed because demand is constant, not because they\'re easy."' : 'End with a logical bridge into the next batch — not a teaser. Example: "With the profit picture clear, the next question is what actually drives those margins day to day."'}**

Return JSON:
{
  "content": "The full narration text for this batch — pure spoken words, no directions...",
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

    // Guard: explainer only
    if (project.project_mode !== 'explainer') {
      return Response.json({
        error: `Project mode is "${project.project_mode || 'unset'}", not "explainer". Use generateScriptBatches instead.`
      }, { status: 400 });
    }

    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const sortedBatches = allBatches.sort((a, b) => a.batch_number - b.batch_number);
    const pendingBatches = sortedBatches.filter(b => b.status === 'pending' || b.status === 'generating');

    if (pendingBatches.length === 0) {
      return Response.json({ success: true, message: 'No pending batches', completed: 0, done: true });
    }

    const completedBatches = sortedBatches.filter(b => b.status === 'completed' && b.content);
    console.log(`[generateExplainerBatch] ${pendingBatches.length} pending, ${completedBatches.length} completed`);

    const batch = pendingBatches[0];
    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: 'generating' });

    const previousContent = completedBatches
      .sort((a, b) => a.batch_number - b.batch_number)
      .map(b => `--- BATCH ${b.batch_number}: ${b.story_segment} ---\n${b.content}`)
      .join('\n\n');

    const isFirstBatch = batch.batch_number === 1;
    const isLastBatch = batch.batch_number === sortedBatches.length;

    const outlineContext = sortedBatches
      .map(b => `Batch ${b.batch_number} "${b.story_segment}": ${b.focus_area}`)
      .join('\n');

    const prompt = buildExplainerWritingPrompt({
      batch, project, topic, sortedBatches,
      previousContent, outlineContext, isFirstBatch, isLastBatch,
      researchNotes: project.research_notes,
    });

    console.log(`[generateExplainerBatch] Batch ${batch.batch_number}: ~${batch.target_words} words`);

    const baseTemp = 0.55; // Lower than standard (0.85) — explainers reward consistency
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
        currentPrompt = `You previously wrote this explainer section but it's too short (${wordCount}/${batch.target_words} words).

EXISTING CONTENT (do NOT repeat — continue from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing the explanation. Same teacherly tone. Add: more step-by-step mechanism detail, more specific numbers from the research, more concrete examples from the research. NO hype, NO teases.

Return JSON: {"content": "additional text only...", "word_count": ${wordsNeeded}}`;
      }

      const { result, provider } = await callLLM(currentPrompt, baseTemp);
      if (attempt === 1) console.log(`[generateExplainerBatch] Using ${provider}`);
      const newContent = result.content || '';

      if (attempt > 1 && content) {
        content = content.trim() + '\n\n' + newContent.trim();
      } else {
        content = newContent;
      }
      wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

      if (wordCount >= minWords || attempt === MAX_ATTEMPTS) {
        if (wordCount < minWords) {
          console.warn(`[generateExplainerBatch] Only ${wordCount}/${batch.target_words} words — accepting`);
        }
        break;
      }
      console.log(`[generateExplainerBatch] Only ${wordCount}/${batch.target_words} words — extending...`);
    }

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
      content,
      word_count: wordCount,
      status: 'completed',
    });

    console.log(`[generateExplainerBatch] ✅ Batch ${batch.batch_number}: ${wordCount} words`);

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3,
    });

    const remainingPending = sortedBatches.filter(b =>
      b.id !== batch.id && (b.status === 'pending' || b.status === 'generating')
    ).length;
    const allDone = remainingPending === 0;

    return Response.json({
      success: true,
      completed: 1,
      total_batches: sortedBatches.length,
      remaining: remainingPending,
      done: allDone,
      script_mode: 'explainer',
    });
  } catch (error) {
    console.error('generateExplainerBatch error:', error.message);
    const msg = error.message || 'Unknown error';
    let code = 500;
    if (/credit balance|billing|purchase credits/i.test(msg)) code = 402;
    else if (/rate limit|too many requests/i.test(msg)) code = 429;
    else if (/api key|unauthorized|authentication/i.test(msg)) code = 401;
    return Response.json({ error: msg }, { status: code });
  }
});