import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER PIPELINE — Step 2: Generate ONE script batch grounded in research.
//   hook batch  → ultra-short staccato sentences (≤7 words)
//   body/take.  → natural educational pacing (12-18 words avg)
// ═══════════════════════════════════════════════════════════════════

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

function extractSectionType(focusArea, batchNumber) {
  const m = (focusArea || '').match(/^\[([a-z_]+)\|s\d+\]/);
  if (m) return m[1];
  const canonical = ['hook', 'core_concept', 'mechanism', 'example', 'application', 'takeaway'];
  return canonical[batchNumber - 1] || 'core_concept';
}

// Extract item ordinal ("Number 3", "Item 5") from story_segment / focus_area
function extractItemNumber(batch) {
  const text = `${batch.story_segment || ''} ${batch.focus_area || ''}`;
  const m = text.match(/(?:number|item|#)\s*(\d{1,2})/i);
  if (m) return parseInt(m[1]);
  return null;
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
  const isItem = sectionType === 'item';
  const itemNumber = isItem ? extractItemNumber(batch) : null;

  // Detect list-mode from sibling batches (presence of any 'item' batches)
  const isListVideo = sortedBatches.some(b => /\[item\|s\d+\]/.test(b.focus_area || ''));

  const pacingRules = isHook ? `
**═══ HOOK SECTION — CONVERSATIONAL TEASE ═══**
✅ HOOK STYLE (90-150 seconds of narration):
- Open with a casual observation or skeptical question: "You know what's funny?" / "While everyone's chasing X, there are people quietly..."
- Drop the most striking number from research IN CASUAL FORM ("making millions selling trash. Literally.")
- Acknowledge the listener's likely assumption ("I know, when you think X you're probably picturing Y, right?")
- Tease the WILDEST/MOST SHOCKING item or fact ("stick with me because ${isListVideo ? 'number four' : 'point three'} involves something you probably flushed this morning. I'm serious.")
- End with a casual "Let's jump in" / "Here we go" — NOT a formal transition
- Mix sentence lengths freely. Short punchy lines AND medium 12-15 word lines. No 7-word cap.

❌ HOOK BANS:
- NO "in this video" / "today we'll explore" / "buckle up" / "let me show you"
- NO academic preamble ("A 90% success rate exists. For certain business owners.")
- NO stating thesis up front like a school essay
- NO "this raises a question" / "let us examine"
` : isItem ? `
**═══ ITEM ${itemNumber || ''} SECTION — CONVERSATIONAL STORY-DRIVEN ═══**
✅ ITEM STRUCTURE (in order):
1. ANNOUNCE the item by name: "Number ${itemNumber || 'N'}: [thing]." OR "Alright, ${itemNumber === 1 ? 'first up' : itemNumber === 2 ? 'number two' : `number ${itemNumber}`}, [thing]."
2. Acknowledge skepticism: "I know, I know, you're thinking [obvious objection]. But hear me out."
3. Tell ONE specific anonymous-character story with CONCRETE numbers:
   - "There's this guy who used to work in accounting..." OR "I read about this woman who..."
   - Starting capital (e.g. "$2k", "ten grand")
   - Time-to-scale (e.g. "5 years later")
   - Current operation size (e.g. "800 vending machines", "4 storage facilities")
   - Annual revenue/profit (e.g. "$2.3 million a year", "$1.8 million in profit annually")
4. Explain why this business WORKS — recession-proof, low overhead, recurring, passive — in casual language
5. Drop 2-3 MORE specific numbers (profit margins, monthly figures, employee counts)
6. End with ONE punchy line that bridges to the next item OR cements the takeaway
7. Add at least ONE casual aside, joke, or skeptical interjection ("Is it sexy? Absolutely not. Will your friends be impressed at parties? Probably not.")

EXAMPLE OPENING (vending machines):
"Number one: vending machines. I know, I know, you're thinking, vending machines? Really? That's your big millionaire secret? But hear me out. There's this guy who used to work in accounting. Regular dude. Hated every second of it. One day he buys one vending machine for about two grand..."

❌ ITEM BANS:
- NO academic vocabulary (inelastic demand, barriers to entry, economies of scale, discretionary purchases)
- NO formal sourcing ("According to IBISWorld..." / "The U.S. Census Bureau notes...") — sources stay implicit
- NO bullet points or numbered sub-lists inside narration
- NO "Let's examine" / "Let's distill" / "This raises a question"
- NO generic statements without a specific story ("People always need X" must be followed by a real-numbers anecdote)
` : isTakeaway ? `
**═══ TAKEAWAY SECTION — CASUAL WRAP-UP ═══**
✅ TAKEAWAY STYLE:
- Casual: "So there you have it." / "Here's the thing everyone misses." / "Alright, let's wrap this up."
- Restate the THROUGH-LINE in plain language ("Boring is beautiful. Boring is predictable. Boring means proven.")
- 2-3 punchy insights that feel like advice from a friend, NOT lessons from a teacher
- Acknowledge the elephant in the room ("These won't get featured in TechCrunch")
- Soft CTA at the end is OK: "If this opened your eyes, like the video and drop a comment..."
- End with a memorable kicker line

❌ TAKEAWAY BANS:
- NO "Let's distill these lessons into critical insights."
- NO "The data shows otherwise."
- NO formal recap structure ("The first key insight... The second key insight...")
- NO academic conclusion ("This directly addresses the most pervasive misconception")
` : `
**═══ BODY SECTION — CONVERSATIONAL TEACHING ═══**
- Casual friend-explaining-something voice. Mix 5-word sentences with 15-20 word ones.
- Use "there's this guy who..." / "I read about a woman who..." anonymous-character stories with REAL DOLLAR FIGURES
- Drop concrete numbers every 2-3 sentences
- Add skeptical/curious asides ("Sounds simple, right? It is.")
- NO academic vocabulary

**DELIVER WHAT YOU PROMISE:**
If you write "let's look at the numbers", the very NEXT sentences MUST contain spoken numbers.
WRONG: "Let's run the maths. As you can see, margins are excellent."
RIGHT: "Let's do some quick math. Revenue: 100 grand. Costs: 40 grand. Sixty thousand profit. A 60% margin."
`;

  const audienceLine = isListVideo
    ? `**TOTAL FORMAT**: This is a LIST video with multiple ITEM sections. Each item batch is one entry on the list. You are writing ${isItem ? `ITEM ${itemNumber || batch.batch_number - 1} of the list` : sectionType.toUpperCase() + ' (frames the list)'}.`
    : `**TOTAL FORMAT**: Standard conversational explainer.`;

  return `You are a top YouTube explainer scriptwriter writing a CONVERSATIONAL, story-driven narration. Imagine you're talking to a friend over coffee — casual, punchy, full of specific dollar figures and "there's this guy who..." anecdotes. Never lecture mode.

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'Educational'}
- Video Duration: ${project.video_duration_minutes || 10} minutes

${audienceLine}
${researchBlock}

**FULL STORY ARC**:
${outlineContext}

**YOU ARE WRITING BATCH ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"
**SECTION TYPE**: ${sectionType.toUpperCase()}${isItem && itemNumber ? ` (Item #${itemNumber} on the list)` : ''}

**BATCH SYNOPSIS**:
${batch.synopsis}

**MANDATORY WORD COUNT**: AT LEAST ${batch.target_words} words. Below ${Math.round(batch.target_words * 0.9)} = failure. Hit it via MORE specific anecdotes, MORE concrete numbers, MORE casual asides — never via academic padding.

${previousContent ? `**PREVIOUSLY WRITTEN** (continue seamlessly, do NOT repeat the same items/stories):\n${previousContent.slice(-4000)}\n` : ''}

${pacingRules}

**═══ UNIVERSAL CONVERSATIONAL RULES ═══**

✅ DO (every batch):
1. Use casual contractions: "you're", "it's", "they're", "won't", "doesn't"
2. Drop concrete dollar figures and numbers naturally ("$2.3 million a year", "60% margin", "800 units")
3. Use anonymous-character stories ("there's this guy who...", "this woman started with one...")
4. Add at least 2-3 casual interjections per batch ("I know, I know", "hear me out", "I'm serious", "stick with me")
5. Mix sentence lengths freely — punchy 4-word lines + flowing 15-20 word lines
6. Light humor / skepticism / self-deprecation when natural
7. ${researchNotes ? 'Anchor numbers to the research provided. You MAY invent realistic illustrative anecdotes around those numbers, but never invent percentages or dollar figures not supported by research.' : 'Use plausible realistic numbers consistent with industry norms.'}

❌ DO NOT (every batch — list of BANNED phrases/structures):
1. ACADEMIC VOCAB: "inelastic demand", "barriers to entry", "economies of scale", "discretionary purchases", "this combination creates", "this directly addresses", "let us examine", "let's distill", "the data shows", "this raises a question"
2. FORMAL SOURCING: "According to IBISWorld...", "The U.S. Bureau of Labor Statistics confirms...", "Entrepreneur magazine reports..." — sources stay IMPLICIT inside anecdotes
3. ESSAY STRUCTURE: "First... Second... Third... Finally..." rigid listing inside one section
4. TEXTBOOK FRAMING: "We will now reveal", "We have covered", "Now that we understand"
5. HYPE PHRASES: "you won't believe", "wait till you hear", "buckle up"
6. META: "in today's video" / "welcome back" / scene directions / [SCENE:]
7. Phrases starting with "Let's" except natural ones like "Let's jump in", "Let's do some quick math"
8. Inventing statistics not in research

**${isFirstBatch ? 'OPENING: Casual observation or "you know what\'s funny?" — drop a striking number IMPLICITLY through a story. No textbook thesis.' : 'Continue naturally from previous batch — like a friend continuing a conversation, NOT a chapter transition.'}**
**${isLastBatch ? 'CLOSING: Casual wrap-up. Restate through-line conversationally. Soft CTA OK.' : 'End with a casual bridge — "Number ' + ((extractItemNumber(batch) || batch.batch_number) + 1) + '..." OR a punchy one-liner setting up what\'s next. NOT a formal section close.'}**

Return JSON:
{
  "content": "Full narration text — pure spoken words, no directions, no headings...",
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

    const prompt = buildExplainerWritingPrompt({
      batch, sectionType, project, topic, sortedBatches,
      previousContent, outlineContext, isFirstBatch, isLastBatch,
      researchNotes: project.research_notes,
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

EXISTING CONTENT (do NOT repeat — continue from last line in the SAME casual conversational voice):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing the ${sectionType} in casual, conversational YouTube-explainer voice. ADD: more specific dollar figures, another "there's this guy/woman who..." anecdote with concrete numbers, casual asides, light humor. NO academic vocabulary (no "inelastic demand", "barriers to entry", "let's distill", "the data shows"). NO formal sourcing. NO hype phrases ("you won't believe").

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