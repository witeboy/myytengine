import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.58.1';

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER PIPELINE — Step 1: Outline batches anchored to research_notes
// Dedicated function for project_mode === 'explainer'.
// Standard/sleep pipelines use initializeScriptBatches.
// ═══════════════════════════════════════════════════════════════════

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

async function callOpenAI(prompt, temperature = 0.4, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are an educational content strategist. Always respond with valid JSON. Anchor every claim to provided research facts. Never invent statistics or examples.' },
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

function buildExplainerOutlinePrompt({ topic, project, numBatches, totalTargetWords, durationMinutes, researchNotes, strategyBlock }) {
  // Parse research notes into a structured block
  let researchBlock = '';
  if (researchNotes) {
    try {
      const research = typeof researchNotes === 'string' ? JSON.parse(researchNotes) : researchNotes;
      const facts = (research.facts || []).slice(0, 12).map((f, i) => `  ${i + 1}. ${f.claim} [source: ${f.source_name || 'unknown'}]`).join('\n');
      const numbers = (research.key_numbers || []).slice(0, 12).map((n, i) => `  ${i + 1}. ${n.number} — ${n.context}`).join('\n');
      const myths = (research.common_misconceptions || []).slice(0, 6).map((m, i) => `  ${i + 1}. MYTH: ${m.myth}\n     TRUTH: ${m.truth}`).join('\n');
      researchBlock = `
**═══ GROUNDED RESEARCH FACTS — USE THESE EXACTLY ═══**
These are the ONLY facts, numbers, and examples you may reference. Do NOT invent others.

FACTS:
${facts || '  (none — use only topic title for context)'}

KEY NUMBERS:
${numbers || '  (none provided)'}

COMMON MISCONCEPTIONS TO CORRECT:
${myths || '  (none provided)'}
`;
    } catch (_) {
      researchBlock = `\n**RESEARCH NOTES**: ${researchNotes}\n`;
    }
  }

  return `You are an elite educational scriptwriter creating a fact-grounded explainer video outline.

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Topic Description: ${topic?.description || 'No description'}
- Niche: ${project.niche || 'Educational'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
- Tone: clear, authoritative, curious — NOT viral/hype
${strategyBlock || ''}
${researchBlock}

**═══ EXPLAINER PRINCIPLES (NON-NEGOTIABLE) ═══**

✅ DO:
- Cite ONLY facts, numbers, and examples from the RESEARCH block above
- State concrete numbers, percentages, and ranges from the research
- Correct common misconceptions explicitly when relevant
- Use a teacher's voice — patient, clear, evidence-driven
- Build understanding incrementally — each batch deepens the prior
- Define terms before using them

❌ DON'T:
- Invent statistics, percentages, company names, or examples not in research
- Use viral hype phrases: "you won't believe", "wait till you hear", "this will change your life"
- Tease the next batch with mystery — explainers reveal, they don't tease
- Use clickbait curiosity gaps — instead, use logical "and here's why" transitions
- Make claims without backing them in the research notes

**═══ EXPLAINER 5-PART STRUCTURE ═══**
Map across exactly ${numBatches} batches:

1. **FRAME** — Define the question/topic in plain terms. State why it matters factually.
2. **CONTEXT** — Provide background facts, history, scale of the issue (use KEY NUMBERS from research).
3. **MECHANISM** — Explain HOW it actually works. The core teaching. Step-by-step logic.
4. **EVIDENCE & EXAMPLES** — Walk through specific cases from the research facts. Cite numbers.
5. **TAKEAWAY** — Summarize the key insight. Correct misconceptions. End with a clear, useful conclusion.

${numBatches <= 3 ? `With ${numBatches} batches, combine multiple parts per batch.` :
numBatches <= 6 ? `With ${numBatches} batches, dedicate roughly one batch per part, with mechanism getting 2.` :
`With ${numBatches} batches, give mechanism and evidence multiple batches each.`}

**YOUR TASK**: Plan exactly ${numBatches} batches.

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words)",
      "explainer_part": "FRAME|CONTEXT|MECHANISM|EVIDENCE|TAKEAWAY",
      "focus_area": "Brief focus (1 sentence)",
      "synopsis": "DETAILED synopsis (150-250 words) describing the ACTUAL teaching content. Cite SPECIFIC facts and numbers from the RESEARCH block above. Quote exact percentages and ranges. Name the specific misconceptions being corrected. Show the logical progression — what concept is introduced, what evidence supports it, what conclusion follows. NO hype, NO teases, NO viral phrasing."
    }
  ]
}

**RULES**:
- Generate exactly ${numBatches} batches
- Every synopsis MUST reference at least one specific fact or number from the research block
- Every claim must be traceable to the research — if it's not in research, don't include it
- Synopses are PLANS for teaching, not narration drafts
- Use the misconceptions to add value (correct them explicitly in TAKEAWAY)
- No filler, no buzzwords, no "in today's video"`;
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
        error: `Project mode is "${project.project_mode || 'unset'}", not "explainer". Use initializeScriptBatches instead.`
      }, { status: 400 });
    }

    // Get topic
    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    // Get channel (optional)
    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

    // Optional strategy block
    let strategyBlock = '';
    const scriptStrategy = project.script_strategy_override || channel?.script_strategy;
    if (scriptStrategy) {
      try {
        const strat = typeof scriptStrategy === 'string' ? JSON.parse(scriptStrategy) : scriptStrategy;
        strategyBlock = `\n**NICHE STRATEGY** (apply lightly — research facts override):
- Tone: ${strat.tone || 'N/A'}
- Pacing: ${strat.pacing || 'N/A'}\n`;
      } catch (_) {}
    }

    // Delete existing batches
    const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const batch of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
    }

    // Calculate batch count
    const durationMinutes = project.video_duration_minutes || 10;
    const wordsPerMinute = 150;
    const totalTargetWords = Math.round(durationMinutes * wordsPerMinute);
    const WORDS_PER_BATCH = 750; // Explainers benefit from slightly tighter batches for clarity
    const numBatches = Math.max(2, Math.ceil(totalTargetWords / WORDS_PER_BATCH));

    const batchTargets = [];
    let wordsRemaining = totalTargetWords;
    for (let i = 0; i < numBatches; i++) {
      if (i === numBatches - 1) {
        batchTargets.push(wordsRemaining);
      } else {
        batchTargets.push(WORDS_PER_BATCH);
        wordsRemaining -= WORDS_PER_BATCH;
      }
    }

    console.log(`[initializeExplainerBatches] Project: ${durationMinutes} min → ${totalTargetWords} words → ${numBatches} batches`);
    console.log(`[initializeExplainerBatches] Research notes: ${project.research_notes ? 'present' : 'MISSING — content will be ungrounded'}`);

    // Build prompt
    const outlinePrompt = buildExplainerOutlinePrompt({
      topic, project, numBatches, totalTargetWords, durationMinutes,
      researchNotes: project.research_notes,
      strategyBlock,
    });

    console.log('[initializeExplainerBatches] Generating grounded outline at temp 0.4...');
    const outlineResult = await callOpenAI(outlinePrompt, 0.4);

    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error('AI failed to generate outline batches');
    }

    // Create batch records
    const createdBatches = [];
    for (let i = 0; i < numBatches; i++) {
      const aiBatch = outlineResult.batches[i];
      const fallbackSegment = `Part ${i + 1}`;

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: aiBatch?.story_segment || fallbackSegment,
        focus_area: aiBatch?.focus_area || fallbackSegment,
        synopsis: aiBatch?.synopsis || `Teach approximately ${batchTargets[i]} words for part ${i + 1}, citing research facts.`,
        target_words: batchTargets[i],
        status: 'pending'
      });
      createdBatches.push(batch);
    }

    // Update project — preserve project_mode: 'explainer'
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3,
      project_mode: 'explainer',
    });

    console.log(`[initializeExplainerBatches] Created ${createdBatches.length} explainer batches`);

    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      total_target_words: totalTargetWords,
      duration_minutes: durationMinutes,
      script_mode: 'explainer',
      has_research: !!project.research_notes,
      batches: createdBatches,
    });
  } catch (error) {
    console.error('initializeExplainerBatches error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});