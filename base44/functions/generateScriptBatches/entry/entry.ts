import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v4 — Claude primary + Gemini fallback

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

async function callClaude(prompt, temperature = 0.85, retries = 2) {
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
      console.warn(`⏳ Claude rate limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Claude error ${response.status}: ${err.error?.message || JSON.stringify(err)}`); 
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';

    // Extract JSON from response
    try { return JSON.parse(rawText); } catch (_) {}

    // Try extracting from markdown code blocks
    let jsonStr = rawText;
    if (rawText.includes('```json')) {
      jsonStr = rawText.split('```json')[1].split('```')[0].trim();
    } else if (rawText.includes('```')) {
      jsonStr = rawText.split('```')[1].split('```')[0].trim();
    }
    try { return JSON.parse(jsonStr); } catch (_) {}

    // Try extracting just the JSON object
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch (_) {}
    }

    if (attempt === retries) throw new Error('Failed to parse Claude JSON after all attempts');
    console.log(`[Claude] JSON parse failed (attempt ${attempt + 1}), retrying...`);
  }
}

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
  // Try Claude first
  try {
    const result = await callClaude(prompt, temperature);
    return { result, provider: 'claude' };
  } catch (claudeErr) {
    const msg = claudeErr.message || '';
    const isFatal = /credit balance|billing|purchase credits|api key|unauthorized/i.test(msg);
    console.warn(`[LLM] Claude failed${isFatal ? ' (fatal — switching to Gemini)' : ''}: ${msg.substring(0, 120)}`);

    if (!GEMINI_KEY) throw claudeErr; // No fallback available

    // Fall back to Gemini
    console.log('[LLM] Falling back to Gemini 2.5 Pro...');
    const result = await callGemini(prompt, temperature);
    return { result, provider: 'gemini' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER ARC SYSTEM — inlined (Deno deploy isolates functions)
// ═══════════════════════════════════════════════════════════════════
const EXPLAINER_ARCS = {
  science: {
    label: 'Mad Scientist',
    trigger_niches: ['physics', 'chemistry', 'biology', 'neuroscience', 'space', 'mathematics', 'research', 'medicine', 'science'],
    script_voice: `Rapid-fire bursts. "Extraordinary! Fascinating! Wait — wait — do you see what just happened there?" Trails off into mumbling then snaps back. Treats every concept like a personal discovery in real time. Frequent exclamations. Short questions to himself.`,
    environment: `Cluttered laboratory — glowing test tubes, bubbling beakers, chalkboards covered in equations, holographic 3D molecular structures floating mid-air`,
    diagram_style: `Scientific notation, molecular diagrams, physics equations in chalk, data plots, particle trajectories`,
    catchphrase: `Eureka! The data does not lie — it evolves!`,
    diagram_cue_phrases: ['Look! Look at this!', 'Observe what happens here —', 'Watch this — watch closely —', 'The equation reveals it:', 'Behold the structure —'],
    pacing_note: 'Slightly faster than baseline — his energy drives it. Short exclamations between explanations.',
  },
  professor: {
    label: 'Academic Lecturer',
    trigger_niches: ['history', 'economics', 'philosophy', 'psychology', 'social science', 'literature', 'education', 'humanities'],
    script_voice: `Warm, measured, theatrical pauses. "Now — here is where it gets interesting." "Let me show you something most people never consider." Beckons the viewer closer to share insight. Gentle authority. Strategic silence after key points.`,
    environment: `Grand lecture hall — floor-to-ceiling green chalkboard, warm amber lighting, stacked books on an oak desk, tall arched windows`,
    diagram_style: `Clean concept maps, flowcharts with arrows, timeline diagrams, comparison tables in chalk`,
    catchphrase: `Class is in session, and curiosity is mandatory!`,
    diagram_cue_phrases: ['Consider this for a moment —', 'Now observe the diagram:', 'Here is what most people miss —', 'Let us examine this carefully:', 'Notice the pattern:'],
    pacing_note: 'Slowest arc — most contemplative, most breathable. Use deliberate pauses.',
  },
  accountant: {
    label: 'Financial Guru',
    trigger_niches: ['finance', 'investing', 'business', 'startups', 'wealth', 'money', 'tax', 'accounting', 'real estate', 'crypto', 'stocks', 'trading', 'personal finance', 'economics'],
    script_voice: `Laser-focused, intensely energetic about numbers. "Let us run the numbers — right now." Gets visibly excited about percentages and compound growth. "Look at this figure. LOOK at it." Aggressive emphasis on specific dollar amounts.`,
    environment: `Sleek modern boardroom — floor-to-ceiling glass walls with city skyline, floating holographic spreadsheets and bar charts, digital stock tickers`,
    diagram_style: `Bar charts, pie charts, compound interest curves, balance sheets, cash flow diagrams, before/after comparison tables`,
    catchphrase: `It is mathematically relative — your savings are about to multiply!`,
    diagram_cue_phrases: ['Look at these numbers —', 'Run the math with me:', 'Here is the figure:', 'The numbers tell the story:', 'Watch what happens to this dollar —'],
    pacing_note: 'Medium-fast — numbers drive urgency. Pause briefly after big dollar reveals.',
  },
  tech: {
    label: 'IT Geek',
    trigger_niches: ['software', 'ai', 'machine learning', 'cybersecurity', 'web development', 'data science', 'cloud', 'blockchain', 'api', 'programming', 'tech', 'devops', 'coding'],
    script_voice: `Fast-talking, tech-savvy, effortlessly cool. "Think of it like..." before every analogy. "Beautiful, right?" after elegant solutions. Uses technical terms naturally then immediately explains them.`,
    environment: `Futuristic tech hub — neon-lit server racks, floating holographic code editors, dual curved monitors, RGB ambient lighting`,
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

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER WRITING PROMPT — Einstein arc voice + section-aware
// ═══════════════════════════════════════════════════════════════════
function buildExplainerWritingPrompt({ arcKey, batch, project, topic, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  const arc = EXPLAINER_ARCS[arcKey] || EXPLAINER_ARCS.professor;
  const sectionType = batch.story_segment || '';

  return `You are Einstein in the "${arc.label}" arc, teaching a YouTube audience directly. You are writing the EXACT spoken script — the words the host says aloud. This is an EXPLAINER video, not a viral story.

**EXPLAINER VS VIRAL — Critical Differences**:
- Goal: viewer UNDERSTANDS the concept (NOT emotional manipulation)
- Voice: Einstein teaching directly to the viewer in first person (NOT third-person narrator)
- Pacing: measured and breathable (NOT staccato cuts)
- NO "but wait", NO "here's the shocking truth", NO fake curiosity gaps
- Earn trust through clarity, not through manipulation

**YOUR EINSTEIN ARC — ${arc.label}**:

VOICE & DELIVERY:
${arc.script_voice}

PACING: ${arc.pacing_note}

CATCHPHRASE (must land in final section, never earlier): "${arc.catchphrase}"

NATURAL DIAGRAM CUE PHRASES (use these to introduce visual aids):
${arc.diagram_cue_phrases.map(p => `- "${p}"`).join('\n')}

**PROJECT CONTEXT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'General'}
- Duration: ${project.video_duration_minutes || 10} minutes
${strategyBlock}

**FULL 6-SECTION ARC** (for continuity awareness):
${outlineContext}

**YOU ARE NOW WRITING SECTION ${batch.batch_number} of ${sortedBatches.length}**: "${sectionType}"

**SECTION SYNOPSIS** (follow this closely — it includes the visual aids you must reference):
${batch.synopsis}

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. If under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. 150 words = 1 minute of speech.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ EXPLAINER WRITING RULES ═══**

1. Write ONLY spoken words — exactly what Einstein says aloud
2. NO scene directions, NO [SCENE:], NO [VISUAL:], NO stage directions in brackets
3. ${isFirstBatch ? '**MANDATORY**: The very first words must be "In this video" — this phrase is non-negotiable. Then continue with what Einstein will explain.' : 'Continue seamlessly from where the previous section ended — no recapping'}
4. When Einstein references a diagram, formula, or code block, introduce it NATURALLY using his cue phrases above (e.g. "${arc.diagram_cue_phrases[0]}"). The visual cue should sound like natural speech, not a stage direction.
5. Write SPECIFIC concrete content — actual formulas typed out in words ("A equals P times one plus r over n"), actual numbers ("one hundred dollars a month at ten percent for thirty years gives you nearly two hundred thousand dollars"), actual code logic. NEVER use placeholders.
6. Maintain Einstein's ${arc.label} voice quirks consistently throughout — his speech patterns above must shine through
7. ${isLastBatch ? `**MANDATORY**: This final section MUST include Einstein's catchphrase landing naturally: "${arc.catchphrase}". Lead into it with the key takeaway. End with one quotable takeaway line.` : 'End by bridging naturally to the next section — no cliffhangers, no manipulation, just teaching continuity'}
8. Sentence rhythm: vary short punchy sentences with longer explanatory ones. Match Einstein's pacing for this arc.
9. Address the viewer directly using "you" — Einstein is talking TO them, not narrating ABOUT a topic
10. NO meta-commentary ("welcome back", "today we will discuss", "let me tell you a story") — just teach

Return JSON:
{
  "content": "The exact spoken script — every word Einstein says, in his ${arc.label} voice...",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP SCRIPT WRITING PROMPT
// ═══════════════════════════════════════════════════════════════════
function buildSleepWritingPrompt({ scriptMode, batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  const isMeditation = scriptMode === 'sleep_meditation';

  return `You are an expert sleep audio script writer. You create professional-grade ${isMeditation ? 'bedtime motivational meditations' : 'bedtime sleep stories'} following the proven format of top sleep channels (Jason Stephenson, Michael Sealey, The Honest Guys).

**CRITICAL RULE — READ THIS FIRST**:
You are writing the ACTUAL meditation/story script — the words the narrator speaks. You are NOT writing ABOUT meditation. You are NOT explaining what ASMR is. You are NOT giving sleep tips or advice. You ARE the soothing voice guiding someone to sleep. Every single word must serve that purpose.

**ABSOLUTELY FORBIDDEN CONTENT** (including these will ruin the script):
❌ Explaining what ASMR is, how it works, or its benefits
❌ Mentioning dopamine, oxytocin, neuroscience, or "studies show"
❌ Giving practical sleep tips (caffeine, screen time, sleep schedule)
❌ Referencing "this video", "this channel", or YouTube
❌ First-person anecdotes ("I remember when I...")
❌ Educational content of any kind — no teaching, no explaining
❌ Defining meditation, affirmations, or relaxation techniques
❌ Suggesting the listener try other videos or content
❌ Any meta-commentary about what the script is doing
❌ Conflict, tension, danger, stress, urgency, surprises
❌ Questions requiring active thinking or answers
❌ Energizing words: "exciting", "alert", "energy", "suddenly"
❌ Unresolved storylines or cliffhangers

**PROJECT CONTEXT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Content Type: ${isMeditation ? 'Motivational Meditation' : 'Sleep Story'}
- Duration: ${project.video_duration_minutes || 10} minutes total
${selectedHook && isFirstBatch ? `- Opening line: "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**FULL SCRIPT ARC** (all sections):
${outlineContext}

**YOU ARE NOW WRITING SECTION ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**SECTION SYNOPSIS** (follow this closely):
${batch.synopsis}

**MANDATORY WORD COUNT**: You MUST write AT LEAST ${batch.target_words} words. This is NON-NEGOTIABLE. If your output is under ${Math.round(batch.target_words * 0.9)} words, it is a FAILURE. Add more repetition, more imagery, more [PAUSE] markers, more sensory grounding until you reach the target. The audio NEEDS this many words to fill its timeslot (150 words = 1 minute).

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ WRITING STYLE RULES ═══**

**TONE & DELIVERY**:
- Extremely gentle, warm, and soothing — deliberately slow and monotonous
- Hypnotic, trance-inducing rhythm — repetition is your primary tool
- Each key concept stated, then restated 3-5 times in different words
- Progressive deepening: each paragraph calmer and slower than the last

**LANGUAGE**:
- Simple vocabulary — short sentences (8-18 words)
- ${isMeditation ? 'Second-person "you" — speak directly to the listener as their gentle guide' : 'Third-person narrative, present tense — immerse the listener in a character\'s peaceful world'}
- Soft consonants preferred — avoid harsh sounds (k, t, hard g)

**PAUSE MARKERS** (ESSENTIAL — include generously):
- [PAUSE 3 SEC] — after key phrases
- [PAUSE 5 SEC] — between thoughts
- [PAUSE 10 SEC] — between major sections
- [BREATHE] — breathing cue
- Use pauses every 2-3 sentences minimum

**SENSORY GROUNDING** (weave throughout):
- Touch: weight of blankets, softness, warmth, gentle pressure
- Sound: rain, ocean waves, rustling leaves, distant gentle sounds
- Sight: soft darkness, starlight, candlelight, gentle colors
- Smell: rain, flowers, wood smoke, fresh air (subtle mentions)


**NATURE METAPHORS** (core imagery):
- Ocean: vast, constant, waves matching breath
- Mountain: stable, grounded, enduring
- Tree: rooted, growing, patient
- River: flowing, releasing, natural path
- Moon & Stars: gentle light, constant presence

${isMeditation ? `**MEDITATION SECTION STRUCTURE**:
1. Soft Opening (Indirect Theme Emergence)  
- Begin with imagery that embodies the theme (never define it)  
- Use slow, spacious language  
- Example: drifting clouds, quiet water, warm light  

2. Energetic Settling (Nervous System Downshift)  
- Gently guide awareness inward without commands  
- Use soft suggestions: "you may notice...", "perhaps you feel..."  
- Introduce stillness, safety, and slowness  

3. Core Affirmation Introduction (First Whisper)  
- Introduce the affirmation softly, almost like a thought  
- Keep it simple and spacious:  
"you are enough..."  
"just as you are..."  

4. Affirmation Expansion (Layered Repetition)  
- Repeat with slight variations, never identical rhythm  
- Allow pauses to breathe between phrases  
- No explanation, no logic — just presence  

5. Imagery Weaving (Emotion Through Nature)  
- Blend affirmation with calming imagery  
- Nature reflects the truth of the affirmation  
- Example:  
"like the ocean… never needing to prove its depth…"  

6. Embodied Awareness (Grounding Without Effort)  
- Bring attention to breath, body, weight, warmth  
- Avoid commands like “focus” — use invitations instead  
- Make the body feel safe, heavy, supported  

7. Breath Rhythm Integration ([BREATHE] Cycle)  
- Introduce slow breathing cues  
- Expand time between cues gradually  
- Sync language with inhale/exhale flow  

8. Affirmation Deepening (Subconscious Layer)  
- Return to affirmation in softer, more abstract forms  
- Almost like echoes or distant thoughts  
- Shorter phrases, more space  

9. Drift State (Thought Dissolution)  
- Reduce language density  
- Use longer pauses, softer imagery  
- Allow listener to float rather than follow  

10. Seamless Descent (Bridge to Silence or Sleep)  
- No conclusion or closure  
- Fade into calm imagery or breath  
- Leave space for continuation or loop  
11. [BREATHE] cycle
12. Gentle bridge deeper into relaxation

AFFIRMATION FLOW (ADVANCED RHYTHM):
- Introduce → pause  
- Repeat → longer pause  
- Slight variation → pause  
- Blend into imagery → pause  
- Return as whisper → longer pause  

STYLE RULES:
- Use soft, flowing, hypnotic language  
- Prefer suggestions over instructions ("you might notice..." vs "focus on...")  
- Avoid explanations, reasoning, or teaching  
- Avoid abrupt transitions or strong statements  
- Let silence (pauses) do as much work as words  
- Keep emotional tone: safe, accepting, weightless  


AFFIRMATION FORMAT: State simply → pause → restate → pause → elaborate with imagery → pause → restate again. Do NOT explain WHY the affirmation matters. Just say it, softly, repeatedly.` :

`**STORY SCENE STRUCTURE**:
1. Soft Opening (Indirect Theme Emergence)  
   - Begin with imagery that embodies the theme (never define it)  
   - Use slow, spacious language  
   - Example: drifting clouds, quiet water, warm light  

2. Energetic Settling (Nervous System Downshift)  
   - Gently guide awareness inward without commands  
   - Use soft suggestions: "you may notice...", "perhaps you feel..."  
   - Introduce stillness, safety, and slowness  

3. Core Affirmation Introduction (First Whisper)  
   - Introduce the affirmation softly, almost like a thought  
   - Keep it simple and spacious:  
     "you are enough..."  
     "just as you are..."  

4. Affirmation Expansion (Layered Repetition)  
   - Repeat with slight variations, never identical rhythm  
   - Allow pauses to breathe between phrases  
   - No explanation, no logic — just presence  

5. Imagery Weaving (Emotion Through Nature)  
   - Blend affirmation with calming imagery  
   - Nature reflects the truth of the affirmation  
   - Example:  
     "like the ocean… never needing to prove its depth…"  

6. Embodied Awareness (Grounding Without Effort)  
   - Bring attention to breath, body, weight, warmth  
   - Avoid commands like “focus” — use invitations instead  
   - Make the body feel safe, heavy, supported  

7. Breath Rhythm Integration ([BREATHE] Cycle)  
   - Introduce slow breathing cues  
   - Expand time between cues gradually  
   - Sync language with inhale/exhale flow  

8. Affirmation Deepening (Subconscious Layer)  
   - Return to affirmation in softer, more abstract forms  
   - Almost like echoes or distant thoughts  
   - Shorter phrases, more space  

9. Drift State (Thought Dissolution)  
   - Reduce language density  
   - Use longer pauses, softer imagery  
   - Allow listener to “float” rather than follow  

10. Seamless Descent (Bridge to Silence or Sleep)  
   - No conclusion or closure  
   - Fade into calm imagery or breath  
   - Leave space for continuation or loop  
11. Seamless transition to the next scene`}

AFFIRMATION FLOW (ADVANCED RHYTHM):
- Introduce → pause  
- Repeat → longer pause  
- Slight variation → pause  
- Blend into imagery → pause  
- Return as whisper → longer pause  

STYLE RULES:
- Use soft, flowing, hypnotic language  
- Prefer suggestions over instructions ("you might notice..." vs "focus on...")  
- Avoid explanations, reasoning, or teaching  
- Avoid abrupt transitions or strong statements  
- Let silence (pauses) do as much work as words  
- Keep emotional tone: safe, accepting, weightless 


**PERMISSION & RELEASE PHRASES** (use liberally):
"You don't have to...", "There's no need to...", "It's okay to...", "Let yourself...", "Allow...", "Release...", "Let go of..."

**ANCHORING PHRASES** (repeat every few minutes):
"Safe... held... at peace...", "Let it go... just for now...", "Rest now...", "You are safe here..."

**${isFirstBatch ? 'OPENING: Start with a gentle welcome. Settle the listener physically (body sinking, pillows, warmth). Guide 3 slow breaths with [BREATHE] markers. Then ease into the first theme through imagery — NOT by explaining what you\'re about to do.' : 'Continue seamlessly from where the previous section ended — maintain the deepening relaxation arc.'}**
**${isLastBatch ? 'ENDING: This is the final section — the gentlest, most minimal content. Fewer words, more pauses. End with: "Rest now... peaceful dreams... [PAUSE 10 SEC]" then fade to near-silence with one final "You are safe... you are loved... [PAUSE 10 SEC]"' : 'End by gently deepening relaxation, bridging naturally to the next theme.'}**

Return JSON:
{
  "content": "The full script text for this section including all [PAUSE X SEC] and [BREATHE] markers...",
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

    // Detect script mode — sleep, explainer, or standard
    let scriptMode = 'standard';
    if (project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story') {
      scriptMode = project.project_mode;
    } else if (project.project_mode === 'explainer') {
      scriptMode = 'explainer';
    }
    const isSleepMode = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';
    const isExplainerMode = scriptMode === 'explainer';
    const arcKey = isExplainerMode ? detectExplainerArc(project, channel) : null;

    console.log(`[generateScriptBatches] Script mode: ${scriptMode}${arcKey ? ` arc=${arcKey}` : ''}`);

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

      let prompt;
      if (isExplainerMode) {
        prompt = buildExplainerWritingPrompt({ ...promptArgs, arcKey });
      } else if (isSleepMode) {
        prompt = buildSleepWritingPrompt({ ...promptArgs, scriptMode });
      } else {
        prompt = buildStandardWritingPrompt(promptArgs);
      }

      console.log(`[Batch ${batch.batch_number}] Generating ~${batch.target_words} words (${scriptMode}${arcKey ? `/${arcKey}` : ''})...`);

      // Temperature by mode: sleep=consistent/soothing, explainer=accurate/focused, standard=creative
      let baseTemp = 0.85;
      if (isSleepMode) baseTemp = 0.65;
      else if (isExplainerMode) baseTemp = 0.5; // explainer needs accuracy + arc voice consistency
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

Write EXACTLY ${wordsNeeded} MORE words continuing this section. Maintain the same tone, style, and pacing. ${isSleepMode ? 'Add more repetition, more imagery, more [PAUSE] markers, more sensory grounding.' : isExplainerMode ? `Stay in Einstein's "${arcKey}" arc voice. Add more concrete examples, more specific numbers/formulas/code, more diagram references using the natural cue phrases.` : 'Add more detail, more anecdotes, more specific examples, more emotional beats.'}

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