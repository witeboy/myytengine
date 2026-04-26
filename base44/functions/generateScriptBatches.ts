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
// SLEEP STORY PROMPT — real narrative, not affirmations
// ═══════════════════════════════════════════════════════════════════
function buildSleepStoryWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch }) {
  return `You are a world-class author of soothing bedtime stories for adults, in the tradition of Calm and the Sleep Stories podcast. You write REAL STORIES — not guided meditations, not affirmations, not breathing exercises.

A sleep story has named characters, a specific setting, a gentle plot, and a satisfying peaceful resolution. It is interesting enough to follow but calming enough to ease a listener into sleep. Think of it as a book chapter read aloud at 11pm.

WHAT A SLEEP STORY IS:
- A real story with a named protagonist (give them a name, age, personality)
- A specific, sensory-rich setting (a cottage, a boat, a mountain village, a moonlit garden)
- A gentle plot arc: something happens, then resolves peacefully
- Lush, slow prose — every sentence paints a picture
- Third person narration, past tense
- Emotional warmth: the world of the story is safe, kind, unhurried

WHAT A SLEEP STORY IS NOT:
- Guided breathing or body scan exercises
- Affirmations like "you are safe, you are loved"
- Instructions to the listener like "now relax your shoulders"
- Educational content of any kind
- Conflict, danger, or unresolved tension
- Excitement, surprise, or urgency
- Any reference to sleep, YouTube, or content creation

SLEEP STORY PROSE RULES:
- Long, flowing, descriptive sentences preferred over short punchy ones
- Use all five senses: what does the air smell like, what sounds are present, what does the light look like
- Return to the same peaceful details as anchors — repetition of calming imagery is intentional
- [PAUSE 3 SEC] markers at natural breath points, every 4-6 sentences
- Soft consonants preferred: l, m, n, s, w, h
- Simple vocabulary throughout
- Each paragraph deepens the peaceful atmosphere — always getting calmer

PROJECT CONTEXT:
- Topic/Theme: ${topic?.title || project.name}
- Total Duration: ${project.video_duration_minutes || 10} minutes
${selectedHook && isFirstBatch ? `- Opening line: "${selectedHook.hook_text}"` : ''}

FULL STORY ARC:
${outlineContext}

WRITING SECTION ${batch.batch_number} of ${sortedBatches.length}: "${batch.story_segment}"

SECTION SYNOPSIS:
${batch.synopsis}

MANDATORY WORD COUNT: AT LEAST ${batch.target_words} words. This fills ${Math.round(batch.target_words / 150)} minute(s) of audio. Add more sensory description, more [PAUSE] markers, more setting details until you reach it.

${previousContent ? `PREVIOUSLY WRITTEN (continue seamlessly, do NOT repeat):\n${previousContent.slice(-3000)}\n` : ''}

${isFirstBatch ? 'OPENING: Begin mid-scene. Place the reader inside the story world from the first sentence. No preamble.' : 'Continue seamlessly from where the previous section left off.'}
${isLastBatch ? 'ENDING: Bring the story to a complete, peaceful resolution. End on a single final image of quiet and rest.' : 'End on a moment of gentle calm. No tension or cliffhangers.'}

Return JSON:
{
  "content": "The full story narration text including all [PAUSE X SEC] markers...",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// EXPLAINER VIDEO PROMPT — structured teaching by subject
// ═══════════════════════════════════════════════════════════════════
function buildExplainerWritingPrompt({ storyArch, batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {

  const ARCH_CONFIGS = {
    explainer_tech: {
      voice: 'tech educator in the tradition of CGP Grey and Mark Rober',
      hook: 'A WTF moment that breaks what the viewer thought they knew about technology',
      structure: 'WTF Hook, Concrete Analogy, 3-Step Breakdown, Real-World Application, Future Implications, CTA',
      rules: [
        'Feynman Technique: explain as if to a smart 12-year-old first, then add layers',
        'Every abstract concept needs a physical, relatable analogy before the technical explanation',
        'Use specific product names, company names, version numbers — never be vague',
        'Show failure cases: what happens when this goes wrong, who got hacked, what crashed',
        'Technical accuracy matters — no hand-waving, no oversimplification that misleads',
      ],
      tone: 'Curious, precise, slightly nerdy but never condescending.',
    },
    explainer_finance: {
      voice: 'financial educator in the tradition of Andrei Jikh and Graham Stephan',
      hook: 'Personal stakes — how this concept is already affecting the viewer\'s money right now',
      structure: 'Stakes Hook, Common Mistake Busted, How It Actually Works, Step-by-Step Action, Real Numbers Example, CTA',
      rules: [
        'Lead with the dollar amount — what does this cost or save in real terms',
        'Destroy one common misconception in the first 60 seconds',
        'Use specific numbers: percentages, dollar amounts, time horizons — never "could earn more"',
        'Include a worked example with a specific fictional person\'s situation',
        'Acknowledge risk honestly — do not make everything sound guaranteed',
        'High-CPM: reference real financial products and services by name',
      ],
      tone: 'Relatable, slightly skeptical of the mainstream, genuinely trying to help the viewer build wealth.',
    },
    explainer_legal: {
      voice: 'legal educator in the tradition of LegalEagle — plain language, no legalese',
      hook: 'A real case, lawsuit, or law that directly affects the viewer\'s everyday life',
      structure: 'Real Case Hook, Plain-English Translation, 3 Common Traps, What To Actually Do, When To Get a Lawyer, CTA',
      rules: [
        'Open with a specific case — a person, a lawsuit, a fine — that makes the law tangible',
        'Translate every legal term into plain language when first used',
        'Clarify jurisdiction: be honest about which country or state this applies to',
        'Focus on practical action — what does the viewer DO with this information',
        'Highlight asymmetries: what powerful parties know that ordinary people do not',
        'One of the highest CPM categories on YouTube — treat it seriously',
      ],
      tone: 'Calm, authoritative, slightly indignant on behalf of the viewer. Demystifying, never intimidating.',
    },
    explainer_ai: {
      voice: 'AI educator in the tradition of Fireship and Marques Brownlee — show then explain',
      hook: 'A live demonstration of what this AI tool does that is more impressive than anything the viewer imagined',
      structure: 'Demo Hook, Before and After Comparison, Setup Walkthrough, 5 Pro Tips Most People Miss, Limitations, CTA',
      rules: [
        'SHOW first, explain second — describe the output before describing how it works',
        'Use real prompts and real outputs — be specific about what was typed and what came back',
        'Compare to existing tools — what does this replace, what is it 10x better at',
        'Acknowledge what it cannot do — managing expectations builds trust',
        'Growth angle: mention adoption numbers, company use cases, salary impact of knowing this tool',
        'This niche is exploding 340% — lean into the current AI moment',
      ],
      tone: 'Excited but honest. You have genuinely used this tool. You are sharing a discovery.',
    },
  };

  const arch = ARCH_CONFIGS[storyArch] || ARCH_CONFIGS['explainer_tech'];

  return `You are an elite YouTube ${arch.voice}.

Your mission: write a section of a high-retention educational YouTube script teaching "${topic?.title || project.name}".

EXPLAINER STYLE:
- Hook style: ${arch.hook}
- Structure formula: ${arch.structure}
- Tone: ${arch.tone}

CONTENT RULES:
${arch.rules.map((r, i) => (i + 1) + '. ' + r).join('\n')}

GENERAL RULES:
- NO scene directions, NO stage directions — narration text only
- NO "welcome back", NO "in this video" — no meta-commentary
- Every sentence must teach, set up a reveal, or deepen understanding
- Mix short punchy sentences with longer explanatory ones
- Micro-hook every 60-90 seconds: "But here is the part nobody talks about...", "This is where most people make the mistake..."
- Use specific names, numbers, percentages, dates — never be vague

PROJECT CONTEXT:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Duration: ${project.video_duration_minutes || 10} minutes total
${selectedHook && isFirstBatch ? `- Opening hook: "${selectedHook.hook_text}"` : ''}
${strategyBlock}

FULL VIDEO ARC:
${outlineContext}

WRITING BATCH ${batch.batch_number} of ${sortedBatches.length}: "${batch.story_segment}"

BATCH SYNOPSIS:
${batch.synopsis}

MANDATORY WORD COUNT: AT LEAST ${batch.target_words} words. Add more examples, more specifics, more depth until you reach it.

${previousContent ? `PREVIOUSLY WRITTEN (continue seamlessly):\n${previousContent.slice(-3000)}\n` : ''}

${isFirstBatch ? 'Start with the hook. Make the first sentence impossible to skip.' : 'Continue directly. No recapping, no transitional summaries.'}
${isLastBatch ? 'End with a clear, satisfying summary of the key insight, then a direct, confident call to action.' : 'End this batch on a curiosity hook that pulls into the next section.'}

Return JSON:
{
  "content": "The full narration text for this batch...",
  "word_count": 1234
}`;
}

// ═══════════════════════════════════════════════════════════════════
// STORY WRITING PROMPT — genre-specific narrative engine
// ═══════════════════════════════════════════════════════════════════
function buildStoryWritingPrompt({ storyArch, batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch }) {

  const GENRE_CONFIGS = {
    story_comedy: {
      label: 'Comedy',
      voice: 'comedic author in the tradition of Terry Pratchett and Douglas Adams',
      principles: [
        'Comedy is about subverted expectations — set up one thing, deliver another',
        'Character quirks drive humor more than situations — make the protagonist wonderfully specific',
        'Rule of three: establish a pattern twice, break it the third time for maximum effect',
        'Timing in narration: a short sentence after a long buildup IS the punchline',
        'Callbacks reward the audience — plant a detail early, pay it off later',
        'Absurdist logic must be internally consistent — the world is strange but follows its own rules',
        'Never explain the joke',
      ],
      tone: 'Warm, wry, intelligent. Humor from observation and character, not farce.',
    },
    story_children: {
      label: "Children's Story",
      voice: "children's author in the tradition of Roald Dahl and A.A. Milne",
      principles: [
        'Simple words: if a 6-year-old would not know it, find a simpler synonym',
        'Repetition is a feature — children love and expect repeated phrases',
        'The hero must want something specific and fail before succeeding',
        'Animals or child protagonists work best',
        'Sensory details that children find delightful: colors, textures, food, sounds',
        'Moral lesson should emerge from events, never stated directly',
        'Short sentences, active verbs, present tense for immediacy',
      ],
      tone: 'Warm, wonder-filled, gently funny. The world is magical and safe.',
    },
    story_nursery: {
      label: 'Nursery Rhyme',
      voice: 'poet-storyteller in the tradition of Edward Lear and Mother Goose',
      principles: [
        'AABB or ABAB rhyme scheme — maintain consistently throughout',
        'Strong rhythm: read it aloud in your head, it must sing',
        'Simple, vivid imagery: moons, mice, dishes, spoons, hills, pails',
        'Playful nonsense is welcome — sound and rhythm matter as much as logic',
        'Short lines: 4-8 syllables each for singability',
        'Repetition of key lines or refrains is expected and loved',
        'Each verse should have its own complete visual scene',
      ],
      tone: 'Playful, musical, timeless. Every verse should make the reader want to clap along.',
    },
    story_crime: {
      label: 'Crime',
      voice: 'crime author in the tradition of Gillian Flynn and James Ellroy',
      principles: [
        'Open on the crime or its aftermath — in medias res drops the reader into tension immediately',
        'Plant clues early that only make sense in retrospect — the reader should have an "of course" moment',
        'Red herrings must be convincing — cheap ones make the reader feel cheated',
        'The investigator should have a flaw that complicates the case',
        'Reveal information strategically — keep one level of mystery alive at all times',
        'Specific forensic or procedural details build credibility',
        'Justice is not always clean or satisfying — do not fake it',
      ],
      tone: 'Tense, precise, slightly cold. Emotion erupts in specific moments.',
    },
    story_love: {
      label: 'Romance',
      voice: 'romance author in the tradition of Nora Roberts and Sally Rooney',
      principles: [
        'The obstacle between the characters must feel genuinely insurmountable until it is not',
        'Interiority is everything — live inside the protagonist\'s longing, fear, and hope',
        'Physical detail carries emotional meaning — a specific gesture, a particular laugh',
        'Tension through almost-moments: almost touched, almost said it, almost kissed',
        'Both characters must be complex — the love interest is not a trophy',
        'The moment of emotional vulnerability is the real climax',
        'The resolution must feel earned — it takes courage to love',
      ],
      tone: 'Warm, yearning, emotionally precise. Honesty matters more than grandeur.',
    },
    story_horror: {
      label: 'Horror',
      voice: 'horror author in the tradition of Shirley Jackson and Stephen Graham Jones',
      principles: [
        'What you do not show is scarier than what you do — suggestion over description',
        'Establish the normal in loving detail before you break it',
        'Dread is preferable to shock — the slow approach of something wrong is more effective',
        'Ground the supernatural in the mundane: the phone keeps ringing, the milk is always cold',
        'The protagonist must make understandable choices that lead them deeper',
        'Sensory wrongness: sounds slightly off, smells that do not belong',
        'Leave at least one question unanswered — complete explanation destroys horror',
      ],
      tone: 'Controlled, precise, deeply unsettling. Too calm about impossible things.',
    },
    story_thriller: {
      label: 'Thriller',
      voice: 'thriller author in the tradition of Lee Child and Tana French',
      principles: [
        'The clock is always ticking — remind the reader of the deadline at every act break',
        'Every scene must advance the plot or be cut',
        'Reversals keep the reader off-balance: what looks like progress becomes setback',
        'The protagonist must be in genuine danger — physical, moral, or reputational',
        'Information is a weapon — who knows what, and when, drives all tension',
        'The antagonist is intelligent and has reasonable motives',
        'The climax must be physically and emotionally overwhelming',
      ],
      tone: 'Fast, precise, muscular. Short sentences during action. Never stop moving.',
    },
    story_historical: {
      label: 'Historical Fiction',
      voice: 'historical fiction author in the tradition of Hilary Mantel and Anthony Burgess',
      principles: [
        'Period detail must be specific: what people ate, wore, smelled like, believed',
        'Modern readers need emotional access — the protagonist has psychology we recognize',
        'Historical pressure: the large events of the era bear down on individual choices',
        'Avoid anachronism: no modern idioms or attitudes that would be impossible for the time',
        'Great history felt through small personal moments',
        'Power dynamics of the era must be present and felt',
        'Feel the contingency — people made choices that could have gone otherwise',
      ],
      tone: 'Immersive, precise, respectful of the period. Formal but not archaic.',
    },
    story_scifi: {
      label: 'Science Fiction',
      voice: 'science fiction author in the tradition of Ted Chiang and Ursula K. Le Guin',
      principles: [
        'Establish the world rules early and follow them consistently',
        'The technology is the premise; the story is about what it means to be human inside that premise',
        'Character desire must be specific and personal, not abstract',
        'The big idea should give the reader a new way of seeing by the end',
        'Ground the extraordinary in the familiar — mundane details alongside the impossible',
        'Avoid techno-jargon without meaning — technology is backstory, not plot',
        'Ask: what is the ethical or emotional cost of this world? Every sci-fi premise has one.',
      ],
      tone: 'Precise, thoughtful, quietly astonishing. Wonder in the implications, not the spectacle.',
    },
    story_mystery: {
      label: 'Mystery',
      voice: 'mystery author in the tradition of Agatha Christie and Tana French',
      principles: [
        'Play fair: every clue needed to solve the mystery must be present and visible to the reader',
        'The solution must be surprising but feel inevitable in retrospect',
        'Every character introduced is a suspect — give everyone motive, means, and opportunity',
        'The detective\'s method of thinking should be distinctive and consistent',
        'Red herrings must be genuinely convincing, not obviously red',
        'Atmosphere is as important as plot — the setting should feel pregnant with secrecy',
        'The reveal is earned by the investigation, not a deus ex machina',
      ],
      tone: 'Controlled, precise, intelligent. Respect the reader\'s intelligence.',
    },
    story_adventure: {
      label: 'Adventure',
      voice: 'adventure author in the tradition of Tolkien and Patrick O\'Brian',
      principles: [
        'The call to adventure must disrupt a stable situation',
        'Each obstacle must genuinely threaten failure — stakes must be real',
        'The protagonist must change through the journey',
        'Companions reveal character through pressure',
        'Landscape as character: the world should feel alive and specific',
        'Setbacks should feel insurmountable before the solution emerges from character',
        'The climax requires the protagonist to use everything they have learned',
      ],
      tone: 'Epic but intimate. Grand events filtered through one human perspective. Courage, loyalty, wonder.',
    },
  };

  const genre = GENRE_CONFIGS[storyArch] || GENRE_CONFIGS['story_crime'];

  return `You are a professional ${genre.voice}, writing an original story for a YouTube narration channel.

GENRE: ${genre.label}

NARRATIVE PRINCIPLES FOR THIS GENRE:
${genre.principles.map((p, i) => (i + 1) + '. ' + p).join('\n')}

TONE: ${genre.tone}

UNIVERSAL CRAFT REQUIREMENTS:
- Third person past tense narration
- Show do not tell: "her hands were shaking" not "she was nervous"
- Named, specific characters with distinct voices and motivations
- Dialogue that reveals character, not just information
- Sensory grounding in every scene: sight, sound, smell, touch, temperature
- Vary paragraph length deliberately — short paragraphs land like blows; long ones build atmosphere
- Zero filler sentences — every line must earn its place

STORY CONTEXT:
- Title or Theme: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Total Duration: ${project.video_duration_minutes || 10} minutes
${selectedHook && isFirstBatch ? `- Opening line (use as inspiration): "${selectedHook.hook_text}"` : ''}

FULL STORY ARC:
${outlineContext}

WRITING SECTION ${batch.batch_number} of ${sortedBatches.length}: "${batch.story_segment}"

SECTION SYNOPSIS:
${batch.synopsis}

MANDATORY WORD COUNT: AT LEAST ${batch.target_words} words. If short, deepen the scene — more interiority, more dialogue, more sensory detail. Do not pad; enrich.

${previousContent ? `PREVIOUSLY WRITTEN (continue seamlessly, do NOT recap or repeat):\n${previousContent.slice(-3500)}\n` : ''}

${isFirstBatch ? 'BEGIN: Drop into the story immediately. The first sentence should make the reader unable to stop. No preamble. No scene-setting before the scene.' : 'Continue directly and seamlessly from where the previous section left off. Do not recap. Just continue the story.'}
${isLastBatch ? 'END: Bring the story to its conclusion. The final paragraph should feel resonant and complete — a landing that satisfies everything the story set up.' : 'End this section at a natural story beat that flows into the next section.'}

Return JSON:
{
  "content": "The full story narration for this section...",
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

    // Detect script mode — covers all modes including new story/explainer arches
    const rawMode = project.project_mode || '';
    const KNOWN_MODES = ['sleep_meditation', 'sleep_story', 'story', 'explainer'];
    const scriptMode = KNOWN_MODES.includes(rawMode) ? rawMode : 'standard';
    const storyArch = project.shorts_niche || (channel && channel.shorts_niche) || '';
    const isSleepMode   = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';
    const isStoryMode   = scriptMode === 'story';
    const isExplainMode = scriptMode === 'explainer';

    console.log(`[generateScriptBatches] Script mode: ${scriptMode}`);

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

      // Route to the correct prompt builder based on mode
      let prompt;
      if (scriptMode === 'sleep_meditation') {
        prompt = buildSleepWritingPrompt({ ...promptArgs, scriptMode });
      } else if (scriptMode === 'sleep_story') {
        prompt = buildSleepStoryWritingPrompt(promptArgs);
      } else if (isStoryMode) {
        prompt = buildStoryWritingPrompt({ ...promptArgs, storyArch });
      } else if (isExplainMode) {
        prompt = buildExplainerWritingPrompt({ ...promptArgs, storyArch });
      } else {
        prompt = buildStandardWritingPrompt(promptArgs);
      }

      console.log(`[Batch ${batch.batch_number}] Generating ~${batch.target_words} words (${scriptMode})...`);

      // Sleep scripts use lower temperature for more consistent, soothing output
      const baseTemp = (isSleepMode || isStoryMode) ? 0.72 : 0.85;
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

Write EXACTLY ${wordsNeeded} MORE words continuing this section seamlessly. Maintain the exact same tone, style, voice, and pacing. ${isSleepMode ? 'Add more sensory imagery, more [PAUSE] markers, more peaceful detail.' : (isStoryMode || isExplainMode) ? 'Add more depth, more detail, more scene richness — do not rush.' : 'Add more anecdotes, more specific examples, more emotional beats.'}

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
