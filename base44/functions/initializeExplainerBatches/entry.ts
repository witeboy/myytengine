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

// ═══════════════════════════════════════════════════════════════════
// LIST TOPIC DETECTOR — detects "6 Boring Businesses", "Top 5 X", "7 Habits"
// Returns N (item count, capped 3-10) or null if not a list topic.
// ═══════════════════════════════════════════════════════════════════
function detectListTopic(title, description) {
  if (!title) return null;
  const combined = `${title} ${description || ''}`.toLowerCase();

  // Pattern 1: leading digit "6 boring businesses", "5 mistakes"
  let m = combined.match(/\b(\d{1,2})\s+(boring|best|worst|weird|unusual|simple|easy|insane|crazy|surprising|hidden|secret|proven|essential|common|biggest|smartest|stupidest|profitable|deadly|silent|odd|underrated|overlooked)?\s*([a-z]+)/);
  if (m) {
    const n = parseInt(m[1]);
    if (n >= 3 && n <= 10) return n;
  }

  // Pattern 2: "top 5", "top 7"
  m = combined.match(/\btop\s+(\d{1,2})\b/);
  if (m) {
    const n = parseInt(m[1]);
    if (n >= 3 && n <= 10) return n;
  }

  // Pattern 3: word-form numbers "seven habits", "six businesses"
  const wordToNum = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  for (const [word, num] of Object.entries(wordToNum)) {
    if (new RegExp(`\\b${word}\\s+[a-z]+`, 'i').test(combined)) return num;
  }

  return null;
}

// Build dynamic LIST arc: hook + N items + takeaway
// Hook=8%, Takeaway=8%, items share 84% equally
function buildListSections(itemCount) {
  const itemPct = 0.84 / itemCount;
  const sections = [{ type: 'hook', label: 'Hook', time_pct: 0.08 }];
  for (let i = 1; i <= itemCount; i++) {
    sections.push({ type: 'item', label: `Item ${i}`, time_pct: itemPct, item_number: i });
  }
  sections.push({ type: 'takeaway', label: 'Takeaway', time_pct: 0.08 });
  return sections;
}

async function callOpenAI(prompt, temperature = 0.7, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a top YouTube scriptwriter who writes conversational, story-driven explainers. You write like you are talking to a friend — casual, punchy, full of specific named-anonymous-person stories with exact dollar figures and numbers. You NEVER use academic vocabulary. Always respond with valid JSON. Anchor every claim to provided research facts. Never invent statistics or company names not in research, but you MAY invent illustrative "there is this guy who..." stories that are realistic and consistent with research.' },
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

function buildExplainerOutlinePrompt({ topic, project, totalTargetWords, durationMinutes, researchNotes, strategyBlock, isList, itemCount, sectionsArray }) {
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

  const sectionSpec = sectionsArray.map((s, i) => {
    const wordTarget = Math.round(totalTargetWords * s.time_pct);
    const itemLabel = s.type === 'item' ? ` (the #${s.item_number} item on the list)` : '';
    return `${i + 1}. ${s.label}${itemLabel} (${s.type}) — ${Math.round(s.time_pct * 100)}% of video, ~${wordTarget} words`;
  }).join('\n');

  const sectionGuidance = isList
    ? `SECTION-SPECIFIC GUIDANCE (LIST VIDEO):
- HOOK: Conversational opening. Tease the wildest item on the list ("number four involves something you probably flushed this morning"). Punchy, casual. NO academic preamble.
- ITEM_1...ITEM_${itemCount}: EACH item gets its own batch. Each item MUST include: (a) the item's name announced clearly ("Number two: self-storage facilities"), (b) ONE specific "there's this guy/woman who..." millionaire story with concrete numbers (starting capital, current revenue, profit margin, units owned, years in business), (c) why this business works (recession-proof, low overhead, recurring, etc.), (d) a casual aside / joke / skeptical interjection.
- TAKEAWAY: Wrap it up casually. "So there you have it." Recap the through-line ("boring is beautiful"). Direct CTA to like/comment/subscribe is OK here — be friendly, not preachy.`
    : `SECTION-SPECIFIC GUIDANCE:
- HOOK: Conversational opening. Drop the most striking number. Pose THE question. Casual, like talking to a friend. NO "in this video" / "today we'll explore" / "buckle up".
- CORE CONCEPT: Plain-language definition of the central idea — with a real number from research in the first 3 sentences.
- MECHANISM: How it actually works. Use a "there's this guy/woman who..." example with specific numbers wherever possible. Avoid academic vocab.
- WORKED EXAMPLE: ONE concrete walkthrough with real dollar figures. Show the math casually ("revenue: 100 grand. Costs: 40 grand. That's 60k profit, 60% margin.").
- APPLICATION: Practical implications. "Here's why this matters to you."
- TAKEAWAY: 2-3 key insights, casual recap. Correct the biggest misconception. Soft CTA OK at end.`;

  return `You are a top YouTube explainer scriptwriter outlining a CONVERSATIONAL, story-driven video.

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Topic Description: ${topic?.description || 'No description'}
- Niche: ${project.niche || 'Educational'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
- Format Detected: ${isList ? `LIST VIDEO with ${itemCount} items` : 'STANDARD EXPLAINER'}
- Voice: casual, friendly, slightly skeptical — NEVER academic/textbook
${strategyBlock || ''}
${researchBlock}

**═══ ${isList ? `LIST ARC — HOOK + ${itemCount} ITEMS + TAKEAWAY` : 'FIXED 6-SECTION EXPLAINER ARC'} ═══**
${sectionSpec}

${sectionGuidance}

**═══ VOICE & STYLE RULES (APPLY TO EVERY SYNOPSIS) ═══**
✅ DO write synopses that demand:
- Specific "there's this guy/woman who..." millionaire/expert stories with concrete dollar figures (starting capital, annual revenue, profit margin, number of units, years)
- Casual interjections, asides, mild humor, light self-deprecation
- Numbers in nearly every paragraph — quoted as the writer would SAY them ("two grand", "$2.3 million a year", "60% margin")
- Skeptical/curious framing ("I know what you're thinking..." / "Hear me out..." / "Sounds simple, right? It is.")

❌ NEVER include academic/textbook vocabulary in synopses:
- BANNED words/phrases: "inelastic demand", "barriers to entry", "economies of scale", "discretionary purchases", "let's distill", "let us examine", "consumer", "stakeholder", "this raises a question", "this combination creates", "we have covered"
- BANNED structures: bullet points inside narration, formal section headers, "First... Second... Third..." rigid listing inside a section
- BANNED phrases: "fundamental mistake", "the data shows", "U.S. Bureau of Labor Statistics confirms", "according to market research firm" (use sources implicitly — "this guy told Forbes...", not "Forbes reported that...")

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "section_type": "${isList ? 'hook | item | takeaway' : 'hook | core_concept | mechanism | example | application | takeaway'}",
      "story_segment": "Short title (3-5 words)${isList ? ', e.g. \"Number 1: Vending Machines\" for items' : ''}",
      "focus_area": "Brief focus (1 sentence)",
      "synopsis": "DETAILED synopsis (150-250 words). MUST briefly name the specific anonymous-character story you intend to use in this batch, MUST list 3-5 specific numbers/dollar figures the writer will weave in, AND describe the casual conversational angle."
    }
  ]
}

**RULES**:
- Generate EXACTLY ${sectionsArray.length} batches in section order
- Every synopsis MUST reference at least one specific number from research OR a clear placeholder number range (e.g. "starting capital ~$2k, scales to $300k/yr")
- ${isList ? `For each item batch, include the item's NAME in the story_segment ("Number ${'<N>'}: ${'<thing>'}")` : 'No filler, no "in today\'s video"'}
- No academic vocabulary. No textbook tone.`;
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

    // ═══ LIST DETECTION ═══
    const itemCount = detectListTopic(topic?.title || project.name, topic?.description);
    const isList = itemCount !== null;
    const sectionsArray = isList ? buildListSections(itemCount) : EXPLAINER_SECTIONS;
    const batchTargets = sectionsArray.map(s => Math.max(50, Math.round(totalTargetWords * s.time_pct)));

    console.log(`[initializeExplainerBatches] ${durationMinutes}min → ${totalTargetWords} words → ${sectionsArray.length} sections${isList ? ` (LIST: ${itemCount} items)` : ''}`);

    const outlinePrompt = buildExplainerOutlinePrompt({
      topic, project, totalTargetWords, durationMinutes,
      researchNotes: project.research_notes,
      strategyBlock,
      isList, itemCount, sectionsArray,
    });

    const outlineResult = await callOpenAI(outlinePrompt, 0.7);
    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error('AI failed to generate outline batches');
    }

    const createdBatches = [];
    for (let i = 0; i < sectionsArray.length; i++) {
      const aiBatch = outlineResult.batches[i];
      const canonical = sectionsArray[i];
      const sectionType = aiBatch?.section_type || canonical.type;
      const focusBase = aiBatch?.focus_area || canonical.label;
      const taggedFocus = `[${sectionType}|s${i + 1}] ${focusBase}`;

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: aiBatch?.story_segment || canonical.label,
        focus_area: taggedFocus,
        synopsis: aiBatch?.synopsis || `Write approximately ${batchTargets[i]} words for ${canonical.label} in a conversational, story-driven voice with specific numbers.`,
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
      is_list: isList,
      item_count: itemCount,
      has_research: !!project.research_notes,
      batches: createdBatches,
    });
  } catch (error) {
    console.error('initializeExplainerBatches error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});