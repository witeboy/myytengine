import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.58.1';

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER PIPELINE — Step 1: Outline batches anchored to research_notes
// ═══════════════════════════════════════════════════════════════════

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

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
      console.warn(`⚠️ OpenAI attempt ${attempt + 1} failed: ${error.message}`);
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

**═══ FIXED 6-SECTION EXPLAINER ARC ═══**
${sectionSpec}

SECTION-SPECIFIC GUIDANCE:
- HOOK: Short punchy sentences. Pose the central question. State the most striking number. NO storytelling preamble.
- CORE CONCEPT: Define the central idea in plain language.
- MECHANISM: Step-by-step reasoning. Longest teaching section.
- WORKED EXAMPLE: Walk through ONE concrete example with real numbers.
- APPLICATION: Practical implications.
- TAKEAWAY: 2-3 key insights. Correct the biggest misconception. NO CTA hype.

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "section_type": "hook",
      "story_segment": "Short title (3-5 words)",
      "focus_area": "Brief focus (1 sentence)",
      "synopsis": "DETAILED synopsis (150-250 words) citing SPECIFIC facts and numbers from research."
    }
  ]
}

**RULES**:
- Generate EXACTLY 6 batches in section order: hook → core_concept → mechanism → example → application → takeaway
- Every synopsis MUST reference at least one specific fact or number from research
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

    if (project.project_mode !== 'explainer') {
      return Response.json({
        error: `Project mode is "${project.project_mode || 'unset'}", not "explainer". Use initializeScriptBatches instead.`
      }, { status: 400 });
    }

    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

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

    const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const batch of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
    }

    const durationMinutes = project.video_duration_minutes || 10;
    const totalTargetWords = Math.round(durationMinutes * 150);
    const batchTargets = EXPLAINER_SECTIONS.map(s => Math.max(50, Math.round(totalTargetWords * s.time_pct)));

    console.log(`[initializeExplainerBatches] ${durationMinutes}min → ${totalTargetWords} words → 6 sections`);

    const outlinePrompt = buildExplainerOutlinePrompt({
      topic, project, totalTargetWords, durationMinutes,
      researchNotes: project.research_notes,
      strategyBlock,
    });

    const outlineResult = await callOpenAI(outlinePrompt, 0.4);
    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error('AI failed to generate outline batches');
    }

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