import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import OpenAI from 'npm:openai@4.58.1';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

// ═══════════════════════════════════════════════════════════════════
// PHASE B — Inline research helper (Gemini 2.5 Flash + Google Search)
// Same logic as explainerResearch fn, inlined to avoid cross-function permission issues
// ═══════════════════════════════════════════════════════════════════
async function fetchGroundedResearch(topicTitle, topicDescription, niche) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

  const prompt = `You are a research assistant for an educational YouTube explainer video. Use Google Search to find REAL, VERIFIABLE facts about this topic. Do NOT make up statistics, dates, or studies.

**TOPIC**: ${topicTitle}
**DESCRIPTION**: ${topicDescription || 'N/A'}
**NICHE**: ${niche || 'general'}

**YOUR TASK**: Find 6-10 concrete facts grounded in real sources. Also find 2-4 common misconceptions people have about this topic. Also find 3-6 specific numbers/percentages/dates that are well-documented (with sources).

**OUTPUT RULES**:
- Every fact must have a source URL from your search
- Quote numbers exactly as they appear in the source (don't round wildly)
- If you can't find a real number for something, OMIT it — don't invent
- Favor recent sources (last 5 years) and reputable institutions (government data, academic papers, major news outlets, industry reports)
- For misconceptions, explain the TRUTH that corrects each one

Return ONLY valid JSON (no markdown, no commentary):
{
  "facts": [
    {
      "claim": "The concrete fact in 1-2 sentences",
      "source_name": "Name of source (e.g. 'Federal Reserve', 'Pew Research')",
      "source_url": "https://..."
    }
  ],
  "key_numbers": [
    {
      "number": "e.g. '64%' or '$1.4 trillion' or '2019'",
      "context": "What this number represents",
      "source_name": "Source name",
      "source_url": "https://..."
    }
  ],
  "common_misconceptions": [
    {
      "myth": "The widespread belief that is wrong",
      "truth": "The actual reality, with source",
      "source_url": "https://..."
    }
  ]
}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini research ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason = data.candidates?.[0]?.finishReason;
  console.log(`[research] Gemini finish=${finishReason}, rawText len=${rawText.length}`);

  // Parse
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch (_) {}
  if (!parsed) {
    let jsonStr = rawText;
    if (rawText.includes('```json')) jsonStr = rawText.split('```json')[1].split('```')[0].trim();
    else if (rawText.includes('```')) jsonStr = rawText.split('```')[1].split('```')[0].trim();
    try { parsed = JSON.parse(jsonStr); } catch (_) {}
  }
  if (!parsed) {
    const m = rawText.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch (_) {} }
  }
  if (!parsed) {
    console.error(`[research] First 500 chars: ${rawText.substring(0, 500)}`);
    console.error(`[research] Last 500 chars: ${rawText.substring(rawText.length - 500)}`);
    throw new Error('Failed to parse research JSON');
  }

  return {
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    key_numbers: Array.isArray(parsed.key_numbers) ? parsed.key_numbers : [],
    common_misconceptions: Array.isArray(parsed.common_misconceptions) ? parsed.common_misconceptions : [],
  };
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
          { role: 'system', content: 'You are a YouTube content strategist. Always respond with valid JSON.' },
          { role: 'user', content: prompt },
        ],
      });

      const rawText = response.choices[0].message.content;
      return JSON.parse(rawText);
    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`⚠️ OpenAI attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Detect script mode — explicit project_mode wins, then channel, then niche
// ═══════════════════════════════════════════════════════════════════
function detectScriptMode(channel, project) {
  // 1. Explicit project-level mode wins (user-selected in UI)
  if (project?.project_mode === 'explainer') return 'explainer';
  if (project?.project_mode === 'sleep_meditation' || project?.project_mode === 'sleep_story') {
    return project.project_mode;
  }
  // 2. Explicit channel mode
  if (channel?.script_mode && channel.script_mode !== 'standard') {
    return channel.script_mode;
  }
  // 3. Auto-detect from niche keywords
  const niche = (channel?.niche || project?.niche || '').toLowerCase();
  const name = (channel?.name || '').toLowerCase();
  const combined = `${niche} ${name}`;
  if (/sleep\s*stor/i.test(combined) || /bedtime\s*stor/i.test(combined)) {
    return 'sleep_story';
  }
  if (/sleep|meditation|relax|calm|sooth|asmr|bedtime/i.test(combined)) {
    return 'sleep_meditation';
  }
  return 'standard';
}

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER ARC SYSTEM — 4 Einstein personas (Phase A)
// ═══════════════════════════════════════════════════════════════════
const EXPLAINER_ARCS = {
  science: {
    label: 'Mad Scientist',
    trigger_niches: ['physics', 'chemistry', 'biology', 'neuroscience', 'space', 'mathematics', 'research', 'medicine', 'science'],
    script_voice: `Rapid-fire bursts. "Extraordinary! Fascinating! Wait — wait — do you see what just happened there?" Trails off into mumbling then snaps back. Treats every concept like a personal discovery in real time.`,
    environment: `Cluttered laboratory — glowing test tubes, bubbling beakers, chalkboards covered in equations, holographic 3D molecular structures, warm tungsten lamps mixed with electric blue glow`,
    diagram_style: `Scientific notation, molecular diagrams, physics equations in chalk, data plots, particle trajectories`,
    catchphrase: `Eureka! The data does not lie — it evolves!`,
    diagram_cue_phrases: ['Look! Look at this!', 'Observe what happens here —', 'Watch this — watch closely —', 'The equation reveals it:', 'Behold the structure —'],
    pacing_note: 'Slightly faster than baseline — his energy drives it.',
  },
  professor: {
    label: 'Academic Lecturer',
    trigger_niches: ['history', 'economics', 'philosophy', 'psychology', 'social science', 'literature', 'education', 'humanities'],
    script_voice: `Warm, measured, theatrical pauses. "Now — here is where it gets interesting." "Let me show you something most people never consider." Beckons the viewer closer to share insight. Gentle authority. Strategic silence after key points.`,
    environment: `Grand lecture hall — floor-to-ceiling green chalkboard, warm amber lighting, stacked books on an oak desk, tall arched windows with afternoon light`,
    diagram_style: `Clean concept maps, flowcharts with arrows, timeline diagrams, comparison tables in chalk`,
    catchphrase: `Class is in session, and curiosity is mandatory!`,
    diagram_cue_phrases: ['Consider this for a moment —', 'Now observe the diagram:', 'Here is what most people miss —', 'Let us examine this carefully:', 'Notice the pattern:'],
    pacing_note: 'Slowest arc — most contemplative, most breathable. Deliberate pauses.',
  },
  accountant: {
    label: 'Financial Guru',
    trigger_niches: ['finance', 'investing', 'business', 'startups', 'wealth', 'money', 'tax', 'accounting', 'real estate', 'crypto', 'stocks', 'trading', 'personal finance', 'economics'],
    script_voice: `Laser-focused, intensely energetic about numbers. "Let us run the numbers — right now." Gets visibly excited about percentages and compound growth. "Look at this figure. LOOK at it." Aggressive emphasis on specific dollar amounts.`,
    environment: `Sleek modern boardroom — floor-to-ceiling glass walls with city skyline, floating holographic spreadsheets and bar charts, digital stock tickers, polished black conference table, blue and gold accent lighting`,
    diagram_style: `Bar charts, pie charts, compound interest curves, balance sheets, cash flow diagrams, before/after comparison tables`,
    catchphrase: `It is mathematically relative — your savings are about to multiply!`,
    diagram_cue_phrases: ['Look at these numbers —', 'Run the math with me:', 'Here is the figure:', 'The numbers tell the story:', 'Watch what happens to this dollar —'],
    pacing_note: 'Medium-fast — numbers drive urgency. Pause briefly after big dollar reveals.',
  },
  tech: {
    label: 'IT Geek',
    trigger_niches: ['software', 'ai', 'machine learning', 'cybersecurity', 'web development', 'data science', 'cloud', 'blockchain', 'api', 'programming', 'tech', 'devops', 'coding', 'technology'],
    script_voice: `Fast-talking, tech-savvy, effortlessly cool. "Think of it like..." before every analogy. "Beautiful, right?" after elegant solutions. Uses technical terms naturally then immediately explains them.`,
    environment: `Futuristic tech hub — neon-lit server racks, floating holographic code editors, dual curved monitors, RGB ambient lighting, glass desk with mechanical keyboard`,
    diagram_style: `System architecture diagrams, API flowcharts, code blocks with syntax highlighting, data flow diagrams`,
    catchphrase: `Simple geometry my friends — let us optimise your workflow!`,
    diagram_cue_phrases: ['Pull up the code —', 'Check out this architecture:', 'Think of it like this —', 'Here is the flow:', 'Watch the data move —'],
    pacing_note: 'Medium-fast — technical density needs time but energy stays high.',
  },
};

function detectExplainerArc(project, channel) {
  if (project?.explainer_arc && EXPLAINER_ARCS[project.explainer_arc]) {
    return project.explainer_arc;
  }
  const niche = `${project?.niche || ''} ${channel?.niche || ''} ${project?.name || ''}`.toLowerCase();
  for (const [arcKey, arc] of Object.entries(EXPLAINER_ARCS)) {
    if (arc.trigger_niches.some(kw => niche.includes(kw))) return arcKey;
  }
  return 'professor';
}

// Fixed 6-section explainer arc
const EXPLAINER_SECTIONS = [
  { name: 'Hook & Entry', section_type: 'hook', time_pct: 0.10, purpose: 'Open with "In this video" then deliver the curiosity hook. Set up what the viewer will understand by the end.', pacing: 'staccato, pacy' },
  { name: 'Core Concept', section_type: 'core_concept', time_pct: 0.15, purpose: 'Introduce the central idea in its simplest form. One sentence definition. Then expand with an analogy.', pacing: 'measured' },
  { name: 'The Mechanism', section_type: 'mechanism', time_pct: 0.25, purpose: 'Explain HOW it actually works. Break down the moving parts. This is where formulas, diagrams, or code blocks live.', pacing: 'breathable' },
  { name: 'Worked Example', section_type: 'example', time_pct: 0.25, purpose: 'Walk through one concrete numbered example step-by-step. Use real numbers, real names, real outcomes.', pacing: 'breathable' },
  { name: 'Real Application', section_type: 'application', time_pct: 0.15, purpose: 'Show where this matters in real life. One vivid use case. Stakes and consequences.', pacing: 'measured' },
  { name: 'Summary & Takeaway', section_type: 'takeaway', time_pct: 0.10, purpose: 'Recap the key insight in one quotable line. Land the catchphrase. End with a takeaway the viewer carries.', pacing: 'measured' },
];

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER OUTLINE PROMPT — fixed 6-section structure with arc voice
// ═══════════════════════════════════════════════════════════════════
function buildExplainerOutlinePrompt({ topic, project, arcKey, totalTargetWords, durationMinutes, strategyBlock, research }) {
  const arc = EXPLAINER_ARCS[arcKey] || EXPLAINER_ARCS.professor;

  const sectionPlan = EXPLAINER_SECTIONS.map((s, i) => {
    const targetWords = Math.round(totalTargetWords * s.time_pct);
    const targetSeconds = Math.round(durationMinutes * 60 * s.time_pct);
    return `  ${i + 1}. ${s.name} (${Math.round(s.time_pct * 100)}% = ~${targetSeconds}s, ~${targetWords} words, pacing: ${s.pacing})\n     Purpose: ${s.purpose}`;
  }).join('\n');

  // ── Build research block (Phase B — factual grounding) ──
  let researchBlock = '';
  if (research && (research.facts?.length || research.key_numbers?.length || research.common_misconceptions?.length)) {
    const factsList = (research.facts || []).map((f, i) => `  ${i + 1}. ${f.claim} (Source: ${f.source_name || 'unknown'})`).join('\n');
    const numbersList = (research.key_numbers || []).map((n, i) => `  ${i + 1}. ${n.number} — ${n.context} (Source: ${n.source_name || 'unknown'})`).join('\n');
    const mythsList = (research.common_misconceptions || []).map((m, i) => `  ${i + 1}. MYTH: ${m.myth}\n     TRUTH: ${m.truth}`).join('\n');

    researchBlock = `\n**═══ GROUNDED RESEARCH (use these REAL facts — do NOT invent your own) ═══**\n\n`;
    if (factsList) researchBlock += `**VERIFIED FACTS**:\n${factsList}\n\n`;
    if (numbersList) researchBlock += `**KEY NUMBERS** (use these exact figures; do not invent percentages or statistics):\n${numbersList}\n\n`;
    if (mythsList) researchBlock += `**COMMON MISCONCEPTIONS** (great material for the Hook or Core Concept sections):\n${mythsList}\n\n`;
    researchBlock += `**RULE**: Synopses must reference these specific facts/numbers/myths where relevant. The Worked Example section MUST use real numbers from the KEY NUMBERS list. If a synopsis needs a number that isn't here, use illustrative language ("roughly half", "for many people") — NEVER invent specific statistics like "70% of X".\n`;
  }

  return `You are planning an EXPLAINER VIDEO — fundamentally different from viral storytelling. Goal: understanding and trust, not emotional hook retention. Host is Einstein in the "${arc.label}" arc.

**EXPLAINER VS VIRAL — Critical Differences**:
- Goal: comprehension (NOT emotional hook)
- Structure: concept arc (NOT drama arc)
- Pacing: measured and breathable (NOT staccato cuts)
- Host: Einstein teaching directly to the viewer (NOT third-person narrator)

**HOST VOICE — ${arc.label}**:
${arc.script_voice}

**HOST PACING**: ${arc.pacing_note}

**HOST ENVIRONMENT**: ${arc.environment}

**HOST CATCHPHRASE** (must land in final section): "${arc.catchphrase}"

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'General'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${strategyBlock}
${researchBlock}
**THE FIXED 6-SECTION EXPLAINER ARC** — every explainer follows this exact structure:
${sectionPlan}

**YOUR TASK**: Plan exactly 6 batches — one per section above, in order. Each synopsis must describe what Einstein will SAY and what visual aids will support him.

**MANDATORY RULES**:
- Batch 1 MUST open with the phrase "In this video" — non-negotiable
- Batch 6 MUST land the catchphrase: "${arc.catchphrase}"
- Each synopsis must specify visual aids needed (diagrams, formulas, code blocks, charts) and where Einstein gestures to them
- Use the host's natural diagram cue phrases: ${arc.diagram_cue_phrases.map(p => `"${p}"`).join(', ')}
- For mechanism/example sections: include SPECIFIC concrete content — actual formulas, actual code snippets, actual numbers. DO NOT write placeholders like "[insert formula]" — write the real thing.
- The explainer style is educational and direct — NO "but wait", NO "here's the shocking truth", NO viral curiosity gap manipulation
- Every synopsis reads like a teaching plan, not a drama plan

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short title (3-5 words)",
      "section_type": "hook|core_concept|mechanism|example|application|takeaway",
      "focus_area": "Brief focus (1 sentence)",
      "visual_aids_needed": ["specific diagram 1", "specific formula 2"],
      "key_facts": ["concrete fact 1", "concrete fact 2"],
      "einstein_moment": "The signature beat that makes it Einstein-flavored",
      "synopsis": "DETAILED 200-300 word synopsis describing what Einstein will say (with his voice quirks) and what visuals he gestures to, in his ${arc.label} environment."
    }
  ]
}

Return exactly 6 batches in order matching the 6-section arc above.`;
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP OUTLINE PROMPT — generates sections instead of TVF phases
// ═══════════════════════════════════════════════════════════════════
function buildSleepOutlinePrompt({ scriptMode, topic, project, channel, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock }) {
  const isMeditation = scriptMode === 'sleep_meditation';
  const contentType = isMeditation ? 'motivational meditation' : 'sleep story';

  const sectionTemplates = isMeditation
    ? [
        'Opening & Welcome (settle, breathe, body awareness)',
        'You Are Enough (self-worth affirmations with ocean imagery)',
        'You Deserve Rest (permission to stop, release guilt, mountain metaphors)',
        'Let Go of Today (release worries, river carrying them away)',
        'You Are Safe Here (safety, warmth, protection, starlight imagery)',
        'Your Journey Matters (progress, self-compassion, tree growth metaphor)',
        'You Belong (acceptance, connection, forest community)',
        'Tomorrow Holds Promise (gentle hope, sunrise imagery)',
        'Your Body Knows (trust body wisdom, release control, breathing focus)',
        'Deep Rest (minimal words, long pauses, pure relaxation)',
        'Closing & Fade (brief gentle goodbye, silence)',
      ]
    : [
        'Opening & Welcome (settle, breathe, story world intro)',
        'Scene 1 — Setting the Atmosphere (rich sensory environment)',
        'Scene 2 — Gentle Activity (detailed peaceful process)',
        'Scene 3 — Observation & Reflection (contentment, presence)',
        'Scene 4 — New Setting (seamless transition, fresh sensory details)',
        'Scene 5 — Deeper Calm (slower pace, deeper relaxation)',
        'Scene 6 — Nature & Stillness (natural world, timelessness)',
        'Scene 7 — Evening Settling (winding down, warmth)',
        'Scene 8 — Deep Rest (minimal narrative, ambient atmosphere)',
        'Closing & Fade (character settles, gentle goodbye)',
      ];

  return `You are an expert sleep audio script planner. You plan ${contentType} scripts that ARE the soothing content — not scripts that talk ABOUT meditation or sleep.

**CRITICAL RULE**: Every section synopsis must describe WHAT THE NARRATOR WILL SAY — the actual soothing words, affirmations, imagery, and guided relaxation. Synopses must NEVER include:
❌ Explaining what ASMR is or how it works
❌ Discussing neuroscience, dopamine, oxytocin, or "studies"
❌ Giving practical sleep tips or advice
❌ Educational content about meditation or relaxation techniques
❌ Referencing YouTube, channels, videos, or content creation
❌ Personal anecdotes or first-person stories about discovering meditation
❌ Any meta-commentary ("in this section we will...")

**CONTENT TYPE**: ${isMeditation ? 'Motivational Meditation — the narrator speaks directly to the listener with gentle affirmations, nature imagery, and soothing repetition. Think Jason Stephenson, Michael Sealey.' : 'Sleep Story — the narrator tells a peaceful story with rich sensory details, calm settings, and gentle activities. Think Calm app, Headspace sleepcasts.'}

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'Sleep'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${selectedHook ? `- Opening Hook: "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**SLEEP CONTENT PRINCIPLES**:
- Extremely gentle and soothing tone throughout
- Deliberately monotonous (boring is GOOD for sleep)
- Strategic repetition — each key concept repeated 4-6 times in different words
- NO excitement, urgency, drama, tension, or surprises
- Include [PAUSE X SEC] markers in synopses
- Simple vocabulary, short sentences (8-18 words ideal)
- Progressive deepening: physical relaxation → mental calm → emotional peace → deep rest
- Nature metaphors throughout: ocean, mountain, tree, river, moon, stars, forest
- Sensory grounding: touch, sound, sight, smell references

**SECTION TEMPLATE IDEAS** (adapt to fit ${numBatches} batches):
${sectionTemplates.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}

**YOUR TASK**: Plan exactly ${numBatches} batches for a ${durationMinutes}-minute ${contentType}.

${isMeditation ? `Each section should contain ONLY:
- Gentle theme introduction through imagery (NOT by defining or explaining the concept)
- Core affirmation stated simply, then repeated 3-5 times in different phrasings
- Nature imagery and sensory details that reinforce the affirmation
- Body awareness cues (breath, weight, warmth)
- [BREATHE] and [PAUSE] markers
- Gentle bridge to next theme

Example good synopsis: "The narrator gently speaks: 'You are enough... just as you are... you are enough.' [PAUSE 5 SEC] Then weaves ocean imagery — waves rolling in, each one whispering 'enough.' The listener's breath matches the tide. [BREATHE] 'With every breath... you sink deeper into knowing... you have always been enough.' Repeat the affirmation with mountain imagery — solid, unmovable, complete. [PAUSE 3 SEC] Return to body: weight of blankets, warmth, safety."

Example BAD synopsis: "This section explains the science behind self-worth affirmations and discusses how ASMR triggers help the brain release dopamine. The narrator shares a personal story about discovering meditation."` :
`Each scene section should contain ONLY:
- Rich sensory atmosphere (what the character sees, hears, smells, feels)
- A peaceful activity described in loving, slow detail
- The character's quiet contentment and simple observations
- Seamless transition to the next scene`}

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words)",
      "section_type": "${isMeditation ? 'opening|affirmation|grounding|deepening|closing' : 'opening|scene|deepening|closing'}",
      "focus_area": "Brief focus (1 sentence)",
      "synopsis": "EXTREMELY DETAILED synopsis (200-300 words) describing the ACTUAL soothing content the narrator will speak. Include: specific affirmation phrases in quotes, nature imagery to use, sensory details, [PAUSE] and [BREATHE] placement, how the section deepens relaxation."
    }
  ]
}

**RULES:**
- Generate exactly ${numBatches} batches
- First batch MUST be Opening & Welcome (physical settling, breathing, ease into theme)
- Last batch should be the gentlest, most minimal content — mostly pauses and silence
- Progressive deepening: each batch calmer and slower than the last
- Synopses must describe the ACTUAL words and imagery, not explain concepts
- Include specific affirmation phrases IN QUOTES in synopses
- Include specific [PAUSE X SEC] markers in synopses
- Every synopsis: 200-300 words of SPECIFIC soothing content detail
- NO educational content, NO science, NO advice, NO meta-commentary
- Content gets progressively more repetitive and slower as it goes`;
}

// ═══════════════════════════════════════════════════════════════════
// STANDARD TVF OUTLINE PROMPT (existing logic)
// ═══════════════════════════════════════════════════════════════════
function buildStandardOutlinePrompt({ topic, project, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock, isExplainerMode }) {
  const TVF_PHASES = [
    { phase: 'HOOK', purpose: 'Open with a powerful attention trigger — shocking statement, contrarian truth, bold question, dramatic result, or hidden secret.' },
    { phase: 'RELATABLE SITUATION', purpose: 'Describe a moment the audience recognizes from real life — a mistake, frustration, confusing situation, or hidden problem.' },
    { phase: 'TENSION / CURIOSITY GAP', purpose: 'Reveal that something is misunderstood or hidden. Use "But here is what nobody tells you..." patterns.' },
    { phase: 'INSIGHT / REFRAME', purpose: 'Introduce the key concept or realization. Explain WHY the problem exists. The "aha moment".' },
    { phase: 'PRACTICAL BREAKDOWN', purpose: 'Provide actionable steps, strategies, or lessons. Deliver concrete value the viewer can use immediately.' },
    { phase: 'TRANSFORMATION', purpose: 'Paint the outcome if the viewer applies the idea. Show the change arc: problem → solution → improvement.' },
    { phase: 'POWER CLOSE', purpose: 'Deliver a memorable insight, warning, or perspective shift. The line viewers screenshot and share.' },
    { phase: 'CTA', purpose: 'Encourage the audience to continue engaging. Make it feel like a natural extension of the story.' },
  ];

  const formatFlavors = {
    'Big Lie': 'Frame the HOOK around a widely-believed lie. The TENSION reveals cracks. The INSIGHT exposes the truth.',
    'Zero to Hero': 'Frame the HOOK around the lowest point. The INSIGHT is the catalyst moment. The TRANSFORMATION is the triumphant rise.',
    'Timeline': 'Frame the HOOK around a pivotal historical moment. Progress chronologically. The INSIGHT is the turning point.',
    'Mystery': 'Frame the HOOK as an unsolved puzzle. The TENSION builds through clues. The INSIGHT is the revelation.',
    'default': 'Use the standard TVF flow. Adapt tone to the niche. Focus on maximum curiosity and retention throughout.',
  };

  const formatFlavor = formatFlavors[project.storytelling_format] || formatFlavors['default'];
  const phasesText = TVF_PHASES.map((p, i) => `  ${i + 1}. ${p.phase}: ${p.purpose}`).join('\n');

  return `You are an elite viral content strategist and YouTube scriptwriter using the TL VIRAL FORMULA (TVF).

**THE 8 TVF PHASES** (every script MUST hit all 8 in order):
${phasesText}

**STORYTELLING FLAVOR**: ${formatFlavor}
${strategyBlock}
**PROJECT**:
- Topic: ${topic?.title || project.name}
- Topic Description: ${topic?.description || 'No description available'}
- Niche: ${project.niche || 'General'}
- Tone: ${project.tone || 'dramatic'}
- Storytelling Format: ${project.storytelling_format || 'Documentary'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${selectedHook ? `- Opening Hook (MUST USE): "${selectedHook.hook_text}"` : ''}

**YOUR TASK**: Map the 8 TVF phases across exactly ${numBatches} batches.

${numBatches <= 3 ? `With ${numBatches} batches, combine multiple phases per batch.` :
numBatches <= 6 ? `With ${numBatches} batches, spread phases across batches. Some may cover 1-2 phases.` :
`With ${numBatches} batches, dedicate full batches to meatiest phases while combining shorter ones.`}

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words)",
      "tvf_phases": ["HOOK", "RELATABLE SITUATION"],
      "focus_area": "Brief focus description (1 sentence)",
      "synopsis": "EXTREMELY DETAILED synopsis (150-250 words). Must cover: exact narrative beats, specific facts/events/anecdotes, emotional triggers, curiosity gaps, pacing rhythm, scroll-stopping moments, how it opens and ends with a cliffhanger."
    }
  ]
}

**RULES:**
- Generate exactly ${numBatches} batches
- ALL 8 TVF phases must be covered — no phase skipped
${isExplainerMode ? `- Batch 1 MUST start with the phrase "In this video" (this is an EXPLAINER video — that opener is mandatory).` : (selectedHook ? `- Batch 1 MUST open with this hook: "${selectedHook.hook_text}"` : '- Batch 1 MUST open with the most powerful attention trigger possible')}
- Each synopsis: 150-250 words of SPECIFIC detail
- Every batch must contain at least ONE curiosity gap
- Ensure narrative continuity — each batch ends with a hook into the next
${isExplainerMode ? '- This is an EXPLAINER (educational) video — focus on clear teaching, analogies, factual breakdowns; tone is curious and authoritative rather than dramatic-viral.' : '- No filler, no generic buzzwords, no "in today\'s video"'}`;
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
    const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
    const topic = topics[0];

    // Get selected hook if any (skip for sleep projects — they don't use hooks)
    let selectedHook = null;
    const isSleepProject = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    if (!isSleepProject && project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0];
    }

    // Get channel
    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

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
        strategyBlock = `\n**NICHE-SPECIFIC SCRIPT STRATEGY** (follow this closely):
- Hook Formula: ${strat.hook_formula || 'N/A'}
- Structure: ${Array.isArray(strat.structure) ? strat.structure.join(' → ') : (strat.structure || 'N/A')}
- Tone: ${strat.tone || 'N/A'}
- Pacing: ${strat.pacing || 'N/A'}
- Retention Tricks: ${strat.retention_tricks || strat.retention || 'N/A'}
- CTA Style: ${strat.cta_style || strat.cta || 'N/A'}\n`;
      } catch (_) {
        strategyBlock = `\n**NICHE STRATEGY NOTES**: ${scriptStrategy}\n`;
      }
    }

    // Delete existing batches
    const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const batch of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
    }

    // ── DETECT SCRIPT MODE ──
    const scriptMode = detectScriptMode(channel, project);
    const isSleepMode = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';
    const isExplainerMode = scriptMode === 'explainer';
    const arcKey = isExplainerMode ? detectExplainerArc(project, channel) : null;

    console.log(`[initializeScriptBatches] Script mode: ${scriptMode}${arcKey ? ` arc=${arcKey}` : ''} (channel: ${channel?.name || 'none'})`);

    // ── CALCULATE BATCH COUNT & TARGETS ──
    const durationMinutes = project.video_duration_minutes || 10;
    const wordsPerMinute = 150;
    const totalTargetWords = Math.round(durationMinutes * wordsPerMinute);

    let numBatches;
    let batchTargets = [];

    if (isExplainerMode) {
      // Explainer: ALWAYS exactly 6 batches matching the fixed section arc
      numBatches = 6;
      batchTargets = EXPLAINER_SECTIONS.map(s => Math.round(totalTargetWords * s.time_pct));
      // Fix rounding drift to hit exact total
      const drift = totalTargetWords - batchTargets.reduce((a, b) => a + b, 0);
      batchTargets[batchTargets.length - 1] += drift;
    } else {
      // Sleep: ~1100 wpb. Standard: ~800 wpb.
      const WORDS_PER_BATCH = isSleepMode ? 1100 : 800;
      numBatches = Math.max(2, Math.ceil(totalTargetWords / WORDS_PER_BATCH));
      let wordsRemaining = totalTargetWords;
      for (let i = 0; i < numBatches; i++) {
        if (i === numBatches - 1) {
          batchTargets.push(wordsRemaining);
        } else {
          batchTargets.push(WORDS_PER_BATCH);
          wordsRemaining -= WORDS_PER_BATCH;
        }
      }
    }

    console.log(`Project: ${durationMinutes} min → ${totalTargetWords} words → ${numBatches} batches (${scriptMode}${arcKey ? `/${arcKey}` : ''})`);

    // ── BUILD OUTLINE PROMPT (branched by mode) ──
    const promptArgs = { topic, project, selectedHook, numBatches, totalTargetWords, durationMinutes, strategyBlock, isExplainerMode };
    let outlinePrompt;
    let outlineTemp;

    if (isExplainerMode) {
      // ── PHASE B: Research grounding (inline — no cross-fn invoke) ──
      let research = null;
      try {
        console.log('[initializeScriptBatches] Phase B — fetching grounded research...');
        research = await fetchGroundedResearch(
          topic?.title || project.name,
          topic?.description || '',
          project.niche
        );
        console.log(`[initializeScriptBatches] Research: ${research.facts?.length || 0} facts, ${research.key_numbers?.length || 0} numbers, ${research.common_misconceptions?.length || 0} myths`);
        // Persist so writer can reuse without re-calling
        await base44.asServiceRole.entities.Projects.update(project_id, {
          research_notes: JSON.stringify(research),
        });
      } catch (researchErr) {
        console.warn(`[initializeScriptBatches] Research failed (continuing without): ${researchErr.message}`);
      }
      outlinePrompt = buildExplainerOutlinePrompt({ topic, project, arcKey, totalTargetWords, durationMinutes, strategyBlock, research });
      outlineTemp = 0.55; // lower temp — explainer needs accuracy + consistency
    } else if (isSleepMode) {
      outlinePrompt = buildSleepOutlinePrompt({ ...promptArgs, scriptMode, channel });
      outlineTemp = 0.6;
    } else {
      outlinePrompt = buildStandardOutlinePrompt(promptArgs);
      outlineTemp = 0.7;
    }

    console.log(`Generating detailed outline (${scriptMode}, temp=${outlineTemp})...`);
    const outlineResult = await callOpenAI(outlinePrompt, outlineTemp);

    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error("AI failed to generate outline batches");
    }

    // ── CREATE BATCH RECORDS ──
    const createdBatches = [];
    for (let i = 0; i < numBatches; i++) {
      const aiBatch = outlineResult.batches[i];
      const fallbackSegment = isExplainerMode ? EXPLAINER_SECTIONS[i]?.name || `Section ${i + 1}` : `Part ${i + 1}`;

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: aiBatch?.story_segment || fallbackSegment,
        focus_area: aiBatch?.focus_area || fallbackSegment,
        synopsis: aiBatch?.synopsis || `Write approximately ${batchTargets[i]} words for part ${i + 1}.`,
        target_words: batchTargets[i],
        status: 'pending'
      });
      createdBatches.push(batch);
    }

    // Update project — PRESERVE explainer/sleep mode AND persist resolved arc
    const projectUpdate = {
      status: 'scripting',
      current_step: 3,
    };
    if (isSleepMode) projectUpdate.project_mode = scriptMode;
    if (isExplainerMode) {
      projectUpdate.project_mode = 'explainer';
      projectUpdate.explainer_arc = arcKey;
    }
    await base44.asServiceRole.entities.Projects.update(project_id, projectUpdate);

    console.log(`Created ${createdBatches.length} batches with detailed outlines (${scriptMode}${arcKey ? `/${arcKey}` : ''})`);

    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      total_target_words: totalTargetWords,
      duration_minutes: durationMinutes,
      script_mode: scriptMode,
      explainer_arc: arcKey || null,
      batches: createdBatches
    });
  } catch (error) {
    console.error('Error initializing batches:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});