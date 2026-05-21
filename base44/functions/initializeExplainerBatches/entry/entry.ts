import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.58.1';

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER PIPELINE — Step 1: Outline batches anchored to research_notes
// Dedicated function for project_mode === 'explainer'.
// Standard/sleep pipelines use initializeScriptBatches.
// ═══════════════════════════════════════════════════════════════════

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

// Canonical 6-section explainer arc (matches the cuts-per-min cadence table
// in explainerSceneBreakdown). Section_type drives downstream pacing.
const EXPLAINER_SECTIONS = [
  { type: 'hook',         label: 'Hook',          time_pct: 0.10 },
  { type: 'core_concept', label: 'Core Concept',  time_pct: 0.15 },
  { type: 'mechanism',    label: 'Mechanism',     time_pct: 0.25 },
  { type: 'example',      label: 'Worked Example',time_pct: 0.25 },
  { type: 'application',  label: 'Application',   time_pct: 0.15 },
  { type: 'takeaway',     label: 'Takeaway',      time_pct: 0.10 },
];

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

function buildExplainerOutlinePrompt({ topic, project, totalTargetWords, durationMinutes, researchNotes, strategyBlock }) {
  let researchBlock = '';
  if (researchNotes) {
    try {
      const research = typeof researchNotes === 'string' ? JSON.parse(researchNotes) : researchNotes;
      const facts = (research.facts || []).slice(0, 12).map((f, i) => `  ${i + 1}. ${f.claim} [source: ${f.source_name || 'unknown'}]`).join('\n');
      const numbers = (research.key_numbers || []).slice(0, 12).map((n, i) => {
        if (typeof n === 'string') return `  ${i + 1}. ${n}`;
        return `  ${i + 1}. ${n.number || n.value || ''} — ${n.context || ''}`;
      }).join('\n');
      const myths = (research.common_misconceptions || []).slice(0, 6).map((m, i) => {
        if (typeof m === 'string') return `  ${i + 1}. ${m}`;
        return `  ${i + 1}. MYTH: ${m.myth || ''}\n     TRUTH: ${m.truth || ''}`;
      }).join('\n');
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

  // Build per-section spec with allocated words
  const sectionSpec = EXPLAINER_SECTIONS.map((s, i) => {
    const wordTarget = Math.round(totalTargetWords * s.time_pct);
    return `${i + 1}. ${s.label} (${s.type}) — ${Math.round(s.time_pct * 100)}% of video, ~${wordTarget} words`;
  }).join('\n');

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

**═══ FIXED 6-SECTION EXPLAINER ARC ═══**
You MUST generate exactly 6 batches, one per section:

${sectionSpec}

SECTION-SPECIFIC GUIDANCE:
- HOOK (batch 1): Short punchy sentences. Pose the central question. State the most striking number from research. NO storytelling preamble. World-class hook = Cleo Abram / Vox cold-open density.
- CORE CONCEPT (batch 2): Define the central idea in plain language. Define terms before using them.
- MECHANISM (batch 3): How does it actually work? Step-by-step reasoning. This is the longest teaching section.
- WORKED EXAMPLE (batch 4): Walk through ONE concrete example end-to-end with real numbers from research.
- APPLICATION (batch 5): Where the viewer encounters this in real life. Practical implications.
- TAKEAWAY (batch 6): Summarize 2-3 key insights. Correct the biggest misconception. Land the lesson. NO CTA hype.

**YOUR TASK**: Plan exactly 6 batches matching the section arc above.

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "section_type": "hook",
      "story_segment": "Short segment title (3-5 words)",
      "focus_area": "Brief focus (1 sentence)",
      "synopsis": "DETAILED synopsis (150-250 words) describing the ACTUAL teaching content. Cite SPECIFIC facts and numbers from the RESEARCH block above. Quote exact percentages and ranges. Name the specific misconceptions being corrected. Show the logical progression — what concept is introduced, what evidence supports it, what conclusion follows. NO hype, NO teases, NO viral phrasing."
    }
  ]
}

**RULES**:
- Generate EXACTLY 6 batches in this exact section order: hook → core_concept → mechanism → example → application → takeaway
- section_type must be one of: hook, core_concept, mechanism, example, application, takeaway
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

    const durationMinutes = project.video_duration_minutes || 10;
    const wordsPerMinute = 150;
    const totalTargetWords = Math.round(durationMinutes * wordsPerMinute);

    // Per-section word targets driven by time_pct
    const batchTargets = EXPLAINER_SECTIONS.map(s => Math.max(50, Math.round(totalTargetWords * s.time_pct)));

    console.log(`[initializeExplainerBatches] Project: ${durationMinutes} min → ${totalTargetWords} words → 6 sections`);
    console.log(`[initializeExplainerBatches] Research notes: ${project.research_notes ? 'present' : 'MISSING — content will be ungrounded'}`);

    const outlinePrompt = buildExplainerOutlinePrompt({
      topic, project, totalTargetWords, durationMinutes,
      researchNotes: project.research_notes,
      strategyBlock,
    });

    console.log('[initializeExplainerBatches] Generating grounded outline at temp 0.4...');
    const outlineResult = await callOpenAI(outlinePrompt, 0.4);

    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error('AI failed to generate outline batches');
    }

    // Create batch records — tag focus_area with [section_type|sN] so
    // generateExplainerBatch and explainerSceneBreakdown can read section_type
    // back via regex (same convention as initializeScriptBatches).
    const createdBatches = [];
    for (let i = 0; i < 6; i++) {
      const aiBatch = outlineResult.batches[i];
      const canonical = EXPLAINER_SECTIONS[i];
      const sectionType = aiBatch?.section_type || canonical.type;
      const focusBase = aiBatch?.focus_area || canonical.label;
      const taggedFocus = `[${sectionType}|s${i + 1}] ${focusBase}`;

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: aiBatch?.story_segment || canonical.label,
        focus_area: taggedFocus,
        synopsis: aiBatch?.synopsis || `Teach approximately ${batchTargets[i]} words for ${canonical.label}, citing research facts.`,
        target_words: batchTargets[i],
        status: 'pending'
      });
      createdBatches.push(batch);
    }

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