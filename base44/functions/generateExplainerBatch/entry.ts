import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER PIPELINE — Step 2: Generate ONE script batch grounded in research.
//   hook batch  → ultra-short staccato sentences (≤7 words)
//   body/take.  → natural educational pacing (12-18 words avg)
// ═══════════════════════════════════════════════════════════════════

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

function hasUsableResearch(researchNotes) {
  if (!researchNotes) return false;
  try {
    const r = typeof researchNotes === 'string' ? JSON.parse(researchNotes) : researchNotes;
    return ((r.facts || []).length + (r.key_numbers || []).length) >= 4;
  } catch (_) { return false; }
}

// Grounded web research safety net — only runs if research_notes missing/thin
async function researchTopicGrounded(topicTitle, topicDescription, niche) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const prompt = `Use Google Search to find REAL, VERIFIABLE facts for an educational explainer video. Do NOT invent numbers, companies, studies, or dollar figures.

TOPIC: ${topicTitle}
DESCRIPTION: ${topicDescription || 'N/A'}
NICHE: ${niche || 'general'}

Find 8-12 sourced facts, 6-10 specific numbers (with sources), 2-4 misconceptions with truths. For list-style topics, find a real example + revenue/margin range for each item.

Return ONLY a single valid JSON object (no markdown, no citations after):
{"facts":[{"claim":"...","source_name":"...","source_url":"..."}],"key_numbers":[{"number":"...","context":"...","source_name":"...","source_url":"..."}],"common_misconceptions":[{"myth":"...","truth":"...","source_url":"..."}]}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });
  if (!response.ok) throw new Error(`Gemini research ${response.status}`);
  const data = await response.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const rawText = parts.map(p => p.text || '').join('').trim();
  if (!rawText) throw new Error('Empty Gemini response');

  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch (_) {}
  if (!parsed) {
    let jsonStr = rawText;
    if (rawText.includes('```json')) jsonStr = rawText.split('```json')[1].split('```')[0].trim();
    else if (rawText.includes('```')) jsonStr = rawText.split('```')[1].split('```')[0].trim();
    try { parsed = JSON.parse(jsonStr); } catch (_) {}
  }
  if (!parsed) {
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { parsed = JSON.parse(rawText.slice(start, end + 1)); } catch (_) {}
    }
  }
  if (!parsed) throw new Error('Failed to parse research JSON');
  return {
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    key_numbers: Array.isArray(parsed.key_numbers) ? parsed.key_numbers : [],
    common_misconceptions: Array.isArray(parsed.common_misconceptions) ? parsed.common_misconceptions : [],
  };
}

function extractSectionType(focusArea, batchNumber) {
  const m = (focusArea || '').match(/^\[([a-z_]+)\|s\d+\]/);
  if (m) return m[1];
  const canonical = ['hook', 'core_concept', 'mechanism', 'example', 'application', 'takeaway'];
  return canonical[batchNumber - 1] || 'core_concept';
}

async function callClaude(prompt, temperature = 0.55, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 16384, temperature, messages: [{ role: 'user', content: prompt }] }),
    });
    if (response.status === 429) { await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 3000)); continue; }
    if (!response.ok) { const err = await response.json(); throw new Error(`Claude ${response.status}: ${err.error?.message || JSON.stringify(err)}`); }
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
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature, maxOutputTokens: 16384, responseMimeType: 'application/json' } }),
    });
    if (response.status === 429) { await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 3000)); continue; }
    if (!response.ok) { const err = await response.json(); throw new Error(`Gemini ${response.status}: ${err.error?.message || JSON.stringify(err)}`); }
    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    try { return JSON.parse(rawText); } catch (_) {}
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }
    if (attempt === retries) throw new Error('Failed to parse Gemini JSON');
  }
}

async function callLLM(prompt, temperature = 0.55) {
  try { return { result: await callClaude(prompt, temperature), provider: 'claude' }; }
  catch (claudeErr) {
    console.warn(`[LLM] Claude failed: ${claudeErr.message.substring(0, 120)}`);
    if (!GEMINI_KEY) throw claudeErr;
    return { result: await callGemini(prompt, temperature), provider: 'gemini' };
  }
}

function buildExplainerWritingPrompt({ batch, sectionType, project, topic, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, researchNotes }) {
  let researchBlock = '';
  if (researchNotes) {
    try {
      const research = typeof researchNotes === 'string' ? JSON.parse(researchNotes) : researchNotes;
      const facts = (research.facts || []).map((f, i) => `  [F${i + 1}] ${f.claim}`).join('\n');
      const numbers = (research.key_numbers || []).map((n, i) => {
        if (typeof n === 'string') return `  [N${i + 1}] ${n}`;
        return `  [N${i + 1}] ${n.number || n.value || ''} — ${n.context || ''}`;
      }).join('\n');
      const myths = (research.common_misconceptions || []).map((m, i) => {
        if (typeof m === 'string') return `  [M${i + 1}] ${m}`;
        return `  [M${i + 1}] MYTH: ${m.myth || ''}\n         TRUTH: ${m.truth || ''}`;
      }).join('\n');
      researchBlock = `\n**═══ GROUNDED RESEARCH — THE ONLY FACTS YOU MAY USE ═══**\nFACTS:\n${facts || '  (none)'}\n\nKEY NUMBERS:\n${numbers || '  (none)'}\n\nMISCONCEPTIONS TO CORRECT:\n${myths || '  (none)'}\n`;
    } catch (_) { researchBlock = `\n**RESEARCH NOTES**: ${researchNotes}\n`; }
  }

  const isHook = sectionType === 'hook';
  const isTakeaway = sectionType === 'takeaway';

  const pacingRules = isHook ? `
**═══ HOOK SECTION — STACCATO PACY MODE (CRITICAL) ═══**
✅ HOOK RULES:
- EVERY sentence ≤ 7 words. Hard cap. Most sentences 3-6 words.
- Each sentence ≈ 2-3 seconds of narration
- Each sentence becomes ITS OWN SCENE in the breakdown
- Open with the most striking number from research
- Then central question. Then misconception flip. Then promise.

❌ HOOK BANS:
- NO long sentences. NO compound clauses exceeding 7 words.
- NO "in this video" / "today we'll explore" / "buckle up"
- NO storytelling preamble. Numbers and questions only.

EXAMPLE:
"Forty-five percent of small businesses fail. Year one. Why?
Most owners blame the economy. Wrong.
The real killer is invisible. It hides in plain sight."
` : `
**═══ ${isTakeaway ? 'TAKEAWAY' : 'BODY'} SECTION — TEACHERLY PACING ═══**
- Natural educational rhythm. Average sentence: 12-18 words.
- Mix short declaratives with longer explanatory sentences.
- ${isTakeaway ? 'Slow down. Land 2-3 takeaways. Correct biggest misconception. NO CTA.' : 'Build step-by-step. Each idea earned before the next.'}

**DELIVER WHAT YOU PROMISE:**
If you write "let's look at the numbers", the very NEXT sentences MUST contain actual spoken numbers from research.
WRONG: "Let's run the maths. As you can see, margins are excellent."
RIGHT: "Let's run the maths. Revenue: one hundred thousand. Costs: forty thousand. Sixty thousand profit. A sixty percent margin."
`;

  return `You are an expert educational scriptwriter narrating a fact-grounded explainer video. Patient, clear teacher voice — never viral YouTuber hype.

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'Educational'}
- Video Duration: ${project.video_duration_minutes || 10} minutes
${researchBlock}

**FULL STORY ARC**:
${outlineContext}

**YOU ARE WRITING BATCH ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"
**SECTION TYPE**: ${sectionType.toUpperCase()}

**BATCH SYNOPSIS**:
${batch.synopsis}

**MANDATORY WORD COUNT**: AT LEAST ${batch.target_words} words. Below ${Math.round(batch.target_words * 0.9)} = failure. ${isHook ? 'Hit count via MORE short sentences — never lengthen past 7 words.' : 'Add more examples, numbers, mechanism detail.'}

${previousContent ? `**PREVIOUSLY WRITTEN** (continue seamlessly, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

${pacingRules}

**═══ EXPLAINER WRITING RULES ═══**
✅ DO:
1. Quote SPECIFIC numbers from research verbatim
2. Explain mechanisms step by step
3. Define terms before using them
4. Correct misconceptions head-on
5. Concrete examples from research only

❌ DO NOT:
1. Invent statistics, percentages, company names, or examples not in research
2. Hype phrases — banned: "you won't believe", "wait till you hear", "buckle up", "here's the kicker"
3. Tease future batches mysteriously
4. Clickbait curiosity gaps or rhetorical hype questions
5. Scene directions, [SCENE:], stage directions — narration ONLY
6. "in today's video" / "welcome back" / meta-commentary

**${isFirstBatch ? 'OPENING: Most striking number or question. No hype intro.' : 'Continue logically from previous batch with transitional bridge.'}**
**${isLastBatch ? 'CLOSING: 2-3 takeaways. Correct major misconception. Clear conclusion — not CTA.' : 'End with logical bridge to next batch — not a teaser.'}**

Return JSON:
{
  "content": "Full narration text — pure spoken words, no directions...",
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

    if (project.project_mode !== 'explainer') {
      return Response.json({ error: `Project mode is "${project.project_mode || 'unset'}", not "explainer".` }, { status: 400 });
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
    const batch = pendingBatches[0];
    const sectionType = extractSectionType(batch.focus_area, batch.batch_number);
    console.log(`[generateExplainerBatch] Batch ${batch.batch_number} → ${sectionType}`);

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: 'generating' });

    const previousContent = completedBatches
      .sort((a, b) => a.batch_number - b.batch_number)
      .map(b => `--- BATCH ${b.batch_number}: ${b.story_segment} ---\n${b.content}`)
      .join('\n\n');

    const isFirstBatch = batch.batch_number === 1;
    const isLastBatch = batch.batch_number === sortedBatches.length;
    const outlineContext = sortedBatches.map(b => `Batch ${b.batch_number} "${b.story_segment}": ${b.focus_area}`).join('\n');

    // Safety net: fetch grounded research if missing/thin before writing
    let researchNotes = project.research_notes;
    if (!hasUsableResearch(researchNotes)) {
      console.log(`[generateExplainerBatch] No usable research — fetching grounded facts...`);
      try {
        const r = await researchTopicGrounded(topic?.title || project.name, topic?.description || '', project.niche);
        researchNotes = JSON.stringify(r);
        await base44.asServiceRole.entities.Projects.update(project_id, { research_notes: researchNotes });
        console.log(`[generateExplainerBatch] ✅ Fetched ${r.facts.length} facts, ${r.key_numbers.length} numbers`);
      } catch (e) {
        console.warn(`[generateExplainerBatch] ⚠️ Research fallback failed: ${e.message}`);
      }
    }

    const prompt = buildExplainerWritingPrompt({
      batch, sectionType, project, topic, sortedBatches,
      previousContent, outlineContext, isFirstBatch, isLastBatch,
      researchNotes,
    });

    const baseTemp = sectionType === 'hook' ? 0.5 : 0.55;
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
        currentPrompt = `You previously wrote this explainer ${sectionType} section but it's too short (${wordCount}/${batch.target_words} words).

EXISTING CONTENT (do NOT repeat — continue from last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing the ${sectionType}. ${sectionType === 'hook' ? 'Staccato mode — every sentence ≤ 7 words. MORE short sentences.' : 'Same teacherly tone. Add: mechanism detail, specific numbers, concrete examples.'} NO hype, NO teases.

Return JSON: {"content": "additional text only...", "word_count": ${wordsNeeded}}`;
      }

      const { result, provider } = await callLLM(currentPrompt, baseTemp);
      if (attempt === 1) console.log(`[generateExplainerBatch] Using ${provider}`);
      const newContent = result.content || '';

      if (attempt > 1 && content) content = content.trim() + '\n\n' + newContent.trim();
      else content = newContent;
      wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

      if (wordCount >= minWords || attempt === MAX_ATTEMPTS) {
        if (wordCount < minWords) console.warn(`[generateExplainerBatch] Only ${wordCount}/${batch.target_words} — accepting`);
        break;
      }
      console.log(`[generateExplainerBatch] Only ${wordCount}/${batch.target_words} — extending...`);
    }

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
      content, word_count: wordCount, status: 'completed',
    });

    console.log(`[generateExplainerBatch] ✅ Batch ${batch.batch_number} (${sectionType}): ${wordCount} words`);

    await base44.asServiceRole.entities.Projects.update(project_id, { status: 'scripting', current_step: 3 });

    const remainingPending = sortedBatches.filter(b =>
      b.id !== batch.id && (b.status === 'pending' || b.status === 'generating')
    ).length;

    return Response.json({
      success: true,
      completed: 1,
      section_type: sectionType,
      total_batches: sortedBatches.length,
      remaining: remainingPending,
      done: remainingPending === 0,
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