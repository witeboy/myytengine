import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.58.1';

// ═══════════════════════════════════════════════════════════════════
// initializeRepurposeBatches — MERGED FUNCTION
//
// Routes by project_mode:
//   'explainer'  → 6-section explainer arc + Gemini grounded research
//   anything else → repurpose pipeline (splits original script into chunks)
// ═══════════════════════════════════════════════════════════════════

// ─── Shared: OpenAI wrapper ────────────────────────────────────────
async function callOpenAI(prompt, temperature = 0.4, retries = 3) {
  const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an educational content strategist. Always respond with valid JSON. Anchor every claim to provided research facts. Never invent statistics or examples.',
          },
          { role: 'user', content: prompt },
        ],
      });
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`⚠️ OpenAI attempt ${attempt + 1} failed: ${error.message}`);
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// ─── Shared: JSON fence stripper ──────────────────────────────────
function stripFencesAndCitations(text) {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  t = t.replace(/\[\d+(?:,\s*\d+)*\]/g, '');
  return t.trim();
}

function extractJsonObject(text) {
  const cleaned = stripFencesAndCitations(text);
  try {
    return JSON.parse(cleaned);
  } catch (_) {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (_) {}
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER PIPELINE (project_mode === 'explainer')
// ═══════════════════════════════════════════════════════════════════

const EXPLAINER_SECTIONS = [
  { type: 'hook',         label: 'Hook',           time_pct: 0.10 },
  { type: 'core_concept', label: 'Core Concept',   time_pct: 0.15 },
  { type: 'mechanism',    label: 'Mechanism',      time_pct: 0.25 },
  { type: 'example',      label: 'Worked Example', time_pct: 0.25 },
  { type: 'application',  label: 'Application',    time_pct: 0.15 },
  { type: 'takeaway',     label: 'Takeaway',       time_pct: 0.10 },
];

async function fetchGroundedResearch(topicTitle, niche) {
  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) {
    console.warn('[research] No GEMINI_API_KEY — skipping research');
    return null;
  }

  const prompt = `Research the topic "${topicTitle}" (niche: ${niche || 'general'}) using Google Search. Find verified facts, specific numbers/statistics, and common misconceptions.

Return ONLY a JSON object (no markdown, no commentary) in this exact shape:
{
  "facts": [{"claim": "...", "source_name": "..."}],
  "key_numbers": [{"number": "...", "context": "..."}],
  "common_misconceptions": [{"myth": "...", "truth": "..."}]
}

Provide 6-10 facts, 6-10 key numbers, 2-4 misconceptions. Be specific and accurate.`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.3 },
        }),
      }
    );
    if (!resp.ok) {
      console.warn(`[research] Gemini ${resp.status}: ${await resp.text()}`);
      return null;
    }
    const data = await resp.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    const parsed = extractJsonObject(text);
    if (!parsed) {
      console.warn('[research] Could not parse Gemini JSON');
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('[research] Fetch failed:', err.message);
    return null;
  }
}

function hasUsableResearch(notes) {
  if (!notes) return false;
  try {
    const r = typeof notes === 'string' ? JSON.parse(notes) : notes;
    const factCount = (r.facts?.length || 0) + (r.key_numbers?.length || 0);
    return factCount >= 4;
  } catch (_) {
    return false;
  }
}

function buildExplainerOutlinePrompt({
  topic,
  project,
  totalTargetWords,
  durationMinutes,
  researchNotes,
  strategyBlock,
}) {
  let researchBlock = '';
  if (researchNotes) {
    try {
      const research =
        typeof researchNotes === 'string' ? JSON.parse(researchNotes) : researchNotes;
      const facts = (research.facts || [])
        .slice(0, 12)
        .map((f, i) => `  ${i + 1}. ${f.claim} [source: ${f.source_name || 'unknown'}]`)
        .join('\n');
      const numbers = (research.key_numbers || [])
        .slice(0, 12)
        .map((n, i) => {
          if (typeof n === 'string') return `  ${i + 1}. ${n}`;
          return `  ${i + 1}. ${n.number || n.value || ''} — ${n.context || ''}`;
        })
        .join('\n');
      const myths = (research.common_misconceptions || [])
        .slice(0, 6)
        .map((m, i) => {
          if (typeof m === 'string') return `  ${i + 1}. ${m}`;
          return `  ${i + 1}. MYTH: ${m.myth || ''}\n     TRUTH: ${m.truth || ''}`;
        })
        .join('\n');
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

async function runExplainerPipeline(base44, project, project_id) {
  // ─── Resolve topic & channel ──────────────────────────────────────
  let topic = null;
  if (project.selected_topic_id) {
    const topics = await base44.asServiceRole.entities.Topics.filter({
      id: project.selected_topic_id,
    });
    topic = topics[0];
  }

  let channel = null;
  if (project.channel_id) {
    const channels = await base44.asServiceRole.entities.Channels.filter({
      id: project.channel_id,
    });
    channel = channels[0];
  }

  // ─── Build strategy block ─────────────────────────────────────────
  let strategyBlock = '';
  const scriptStrategy =
    project.script_strategy_override || channel?.script_strategy;
  if (scriptStrategy) {
    try {
      const strat =
        typeof scriptStrategy === 'string'
          ? JSON.parse(scriptStrategy)
          : scriptStrategy;
      strategyBlock = `\n**NICHE STRATEGY** (apply lightly — research facts override):
- Tone: ${strat.tone || 'N/A'}
- Pacing: ${strat.pacing || 'N/A'}\n`;
    } catch (_) {}
  }

  // ─── Auto-research safety net ─────────────────────────────────────
  let researchNotes = project.research_notes;
  if (!hasUsableResearch(researchNotes)) {
    console.log(
      '[initializeRepurposeBatches/explainer] No usable research — running Gemini + Google Search...'
    );
    const topicTitle = topic?.title || project.name;
    const fetched = await fetchGroundedResearch(topicTitle, project.niche);
    if (fetched && (fetched.facts?.length || fetched.key_numbers?.length)) {
      researchNotes = JSON.stringify(fetched);
      await base44.asServiceRole.entities.Projects.update(project_id, {
        research_notes: researchNotes,
      });
      console.log(
        `[initializeRepurposeBatches/explainer] ✅ Research: ${fetched.facts?.length || 0} facts, ${fetched.key_numbers?.length || 0} numbers, ${fetched.common_misconceptions?.length || 0} myths`
      );
    } else {
      console.warn(
        '[initializeRepurposeBatches/explainer] Research fetch failed — continuing without grounded facts'
      );
    }
  }

  // ─── Clear existing batches ───────────────────────────────────────
  const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter(
    { project_id }
  );
  for (const batch of existingBatches) {
    await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
  }

  const durationMinutes = project.video_duration_minutes || 10;
  const totalTargetWords = Math.round(durationMinutes * 150);
  const batchTargets = EXPLAINER_SECTIONS.map((s) =>
    Math.max(50, Math.round(totalTargetWords * s.time_pct))
  );

  console.log(
    `[initializeRepurposeBatches/explainer] ${durationMinutes}min → ${totalTargetWords} words → 6 sections`
  );

  // ─── Generate 6-section outline via OpenAI ────────────────────────
  const outlinePrompt = buildExplainerOutlinePrompt({
    topic,
    project,
    totalTargetWords,
    durationMinutes,
    researchNotes,
    strategyBlock,
  });

  const outlineResult = await callOpenAI(outlinePrompt, 0.4);
  if (!outlineResult.batches || outlineResult.batches.length === 0) {
    throw new Error('AI failed to generate explainer outline batches');
  }

  // ─── Persist batches ──────────────────────────────────────────────
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
      synopsis:
        aiBatch?.synopsis ||
        `Teach approximately ${batchTargets[i]} words for ${canonical.label}, citing research facts.`,
      target_words: batchTargets[i],
      status: 'pending',
    });
    createdBatches.push(batch);
  }

  await base44.asServiceRole.entities.Projects.update(project_id, {
    status: 'scripting',
    current_step: 3,
    project_mode: 'explainer',
  });

  console.log(
    `[initializeRepurposeBatches/explainer] Created ${createdBatches.length} explainer batches`
  );

  return {
    success: true,
    pipeline: 'explainer',
    batches_created: createdBatches.length,
    total_target_words: totalTargetWords,
    duration_minutes: durationMinutes,
    script_mode: 'explainer',
    has_research: hasUsableResearch(researchNotes),
    batches: createdBatches,
  };
}

// ═══════════════════════════════════════════════════════════════════
// REPURPOSE PIPELINE (all other project_mode values)
// ═══════════════════════════════════════════════════════════════════

async function callLLM(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a world-class scriptwriter and content strategist. Always respond in valid JSON only. No markdown, no code fences, no commentary.',
        },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenAI error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No content in OpenAI response');

  try {
    return JSON.parse(text);
  } catch (_) {}
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1].trim());
  throw new Error('Failed to parse OpenAI JSON');
}

async function runRepurposePipeline(
  base44,
  project_id,
  {
    original_script,
    new_title,
    analysis,
    tweak_notes,
    target_duration_minutes,
    target_total_words,
  }
) {
  // ─── Clear existing batches ───────────────────────────────────────
  const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter(
    { project_id }
  );
  for (const batch of existingBatches) {
    await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
  }

  // ─── Word-count / scale maths ─────────────────────────────────────
  const originalWords = original_script.split(/\s+/).filter((w) => w.length > 0);
  const originalTotalWords = originalWords.length;
  const finalTargetWords = target_total_words || originalTotalWords;
  const scaleFactor = finalTargetWords / Math.max(originalTotalWords, 1);

  const WORDS_PER_BATCH = 1500;
  const numBatches = Math.max(2, Math.ceil(finalTargetWords / WORDS_PER_BATCH));
  const wordsPerBatch = Math.ceil(finalTargetWords / numBatches);

  const targetDurationMin =
    target_duration_minutes || Math.ceil(originalTotalWords / 150);
  const scalePct = Math.round((scaleFactor - 1) * 100);
  const scaleLabel =
    scalePct > 0
      ? `expanding +${scalePct}%`
      : scalePct < 0
      ? `condensing ${scalePct}%`
      : 'same length';
  console.log(
    `[initializeRepurposeBatches/repurpose] ${originalTotalWords} original → ${finalTargetWords} target (${scaleLabel}) → ${numBatches} batches @ ~${wordsPerBatch} words`
  );

  // ─── Split original script into per-batch chunks ──────────────────
  const sentences =
    original_script.match(/[^.!?]+[.!?]+[\s]*/g) || [original_script];
  const sentencesPerBatch = Math.ceil(sentences.length / numBatches);

  const originalChunks = [];
  for (let i = 0; i < numBatches; i++) {
    const start = i * sentencesPerBatch;
    const end = Math.min((i + 1) * sentencesPerBatch, sentences.length);
    originalChunks.push(sentences.slice(start, end).join('').trim());
  }

  // ─── Ask AI for segment descriptions ─────────────────────────────
  const outlinePrompt = `You are analyzing a script that has been split into ${numBatches} segments for rewriting.

ORIGINAL TITLE: "${analysis?.title || 'Unknown'}"
NEW TITLE: "${new_title}"
NICHE: ${analysis?.niche || 'General'}
TOTAL WORDS: ${originalTotalWords}

For each of the ${numBatches} segments below, provide a brief description of what that segment covers and the emotional arc within it.

${originalChunks
  .map(
    (chunk, i) =>
      `SEGMENT ${i + 1} (${chunk.split(/\s+/).length} words):\n"${chunk.substring(0, 500)}..."`
  )
  .join('\n\n')}

Return JSON:
{
  "segments": [
    {
      "segment_number": 1,
      "story_segment": "Short title (3-5 words)",
      "focus_area": "Brief description of what this segment covers",
      "emotional_arc": "The emotional journey within this segment",
      "key_beats": "Main narrative beats to preserve"
    }
  ]
}

Generate exactly ${numBatches} segments.`;

  let segments = [];
  try {
    const result = await callLLM(outlinePrompt, 0.6);
    segments = result.segments || [];
  } catch (e) {
    console.warn(
      '[initializeRepurposeBatches/repurpose] Outline generation failed, using defaults:',
      e.message
    );
  }

  // ─── Persist batch records ────────────────────────────────────────
  const createdBatches = [];
  for (let i = 0; i < numBatches; i++) {
    const seg = segments[i];
    const originalChunkWords =
      originalChunks[i]?.split(/\s+/).filter((w) => w.length > 0).length || 0;
    const scaledTarget =
      Math.round(originalChunkWords * scaleFactor) || wordsPerBatch;
    const batchTarget = Math.max(200, Math.min(3000, scaledTarget));

    const batch = await base44.asServiceRole.entities.ScriptBatches.create({
      project_id,
      batch_number: i + 1,
      story_segment: seg?.story_segment || `Segment ${i + 1}`,
      focus_area:
        seg?.focus_area || `Part ${i + 1} of the repurposed script`,
      synopsis: JSON.stringify({
        original_chunk: originalChunks[i] || '',
        original_chunk_words: originalChunkWords,
        emotional_arc: seg?.emotional_arc || '',
        key_beats: seg?.key_beats || '',
        new_title,
        tweak_notes: tweak_notes || '',
        analysis_style: analysis?.script_style || '',
        analysis_tone: analysis?.tone_description || '',
        analysis_pacing: analysis?.pacing || '',
        analysis_hook: analysis?.hook_technique || '',
        scale_factor: scaleFactor,
        target_duration_minutes: targetDurationMin,
        total_target_words: finalTargetWords,
      }),
      target_words: batchTarget,
      status: 'pending',
    });
    createdBatches.push(batch);
  }

  console.log(
    `[initializeRepurposeBatches/repurpose] Created ${createdBatches.length} repurpose batches`
  );

  return {
    success: true,
    pipeline: 'repurpose',
    batches_created: createdBatches.length,
    original_words: originalTotalWords,
    total_target_words: finalTargetWords,
    scale_factor: scaleFactor,
    target_duration_minutes: targetDurationMin,
    batches: createdBatches,
  };
}

// ═══════════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      project_id,
      // Repurpose-only fields (ignored in explainer mode)
      original_script,
      new_title,
      analysis,
      tweak_notes,
      target_duration_minutes,
      target_total_words,
    } = body;

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    // ── Fetch project ──────────────────────────────────────────────
    const projects = await base44.asServiceRole.entities.Projects.filter({
      id: project_id,
    });
    const project = projects[0];
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // ── Route by project_mode ──────────────────────────────────────
    if (project.project_mode === 'explainer') {
      console.log(
        `[initializeRepurposeBatches] Detected explainer mode — routing to explainer pipeline`
      );
      const result = await runExplainerPipeline(base44, project, project_id);
      return Response.json(result);
    }

    // ── Repurpose mode — original_script is required ───────────────
    if (!original_script) {
      return Response.json(
        {
          error:
            'Missing original_script. Required for non-explainer projects. For explainer projects ensure project_mode is set to "explainer".',
        },
        { status: 400 }
      );
    }

    const result = await runRepurposePipeline(base44, project_id, {
      original_script,
      new_title,
      analysis,
      tweak_notes,
      target_duration_minutes,
      target_total_words,
    });
    return Response.json(result);
  } catch (error) {
    console.error('[initializeRepurposeBatches] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
