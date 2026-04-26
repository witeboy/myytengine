import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import OpenAI from 'npm:openai@4.77.0';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

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
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`OpenAI attempt ${attempt + 1} failed: ${error.message}`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

// ── Story genre configs ──────────────────────────────────────────────
const STORY_CONFIGS = {
  story_comedy: {
    label: 'Comedy',
    formats: 'Fish Out of Water, Escalating Disaster, Mistaken Identity, Rule of Three',
    phaseGuide: 'Phase 1: Establish the absurd normal world. Phase 2: Something goes wrong, escalate each attempt to fix it. Phase 3: Pattern breaks at the perfect moment. Phase 4: Warm callback landing.',
    synopsisRules: 'Each synopsis must specify the exact joke setup, the escalation mechanism, and the punchline or callback. Include the comic timing — what the reader expects vs what actually happens.',
  },
  story_children: {
    label: 'Children Story',
    formats: 'Three Attempts, Unexpected Helper, Lost and Found, The Lesson',
    phaseGuide: 'Phase 1: Meet the hero — specific detail, immediately lovable. Phase 2: The clear problem appears. Phase 3: Two failed attempts — show effort. Phase 4: Breakthrough and happy resolution.',
    synopsisRules: 'Synopses must name the specific characters, their exact want, and the precise moment of breakthrough. Language should be simple. Moral lesson emerges from events — never stated directly.',
  },
  story_nursery: {
    label: 'Nursery Rhyme',
    formats: 'AABB Rhyme, ABAB Rhyme, Cumulative Story, Call and Response',
    phaseGuide: 'Phase 1: Opening verse establishes the scene and rhyme scheme. Phases 2-3: Body verses, each a complete visual scene. Phase 4: Final verse completes the rhyme with warmth.',
    synopsisRules: 'Each synopsis must include the rhyme scheme, 2-3 example rhyming words for that section, the visual imagery, and the rhythm pattern. Include the refrain if one exists.',
  },
  story_crime: {
    label: 'Crime / True Crime',
    formats: 'Cold Case, The Investigation, The Heist, Double Cross, The Confession',
    phaseGuide: 'Phase 1: Cold open on the crime or discovery. Phase 2: Investigation with clues and red herrings. Phase 3: Deeper complexity. Phase 4: False solution then real revelation. Phase 5: Aftermath.',
    synopsisRules: 'Synopses must identify the specific clues planted in each section and which red herrings are introduced. Map exactly what information the reader has vs what they are missing.',
  },
  story_love: {
    label: 'Romance',
    formats: 'Enemies to Lovers, Second Chance, Forbidden Love, Slow Burn, The Grand Gesture',
    phaseGuide: 'Phase 1: The meeting. Phase 2: Growing closer through small moments. Phase 3: The obstacle appears. Phase 4: The almost moment. Phase 5: Lowest point. Phase 6: Vulnerability and breakthrough.',
    synopsisRules: 'Synopses must describe the emotional state of both characters in each section, the tension mechanism, and what each character wants vs what they fear.',
  },
  story_horror: {
    label: 'Horror',
    formats: 'The Haunting, Body Horror, Psychological, Folk Horror, Cosmic Dread',
    phaseGuide: 'Phase 1: Normal world. Phase 2: Wrongness creeps in. Phase 3: Dread escalates. Phase 4: Confrontation. Phase 5: Aftermath — what remains.',
    synopsisRules: 'Synopses must specify the exact wrong details in each section. Describe what the reader knows vs what the character knows. At least one question must remain unanswered.',
  },
  story_thriller: {
    label: 'Thriller',
    formats: 'Ticking Clock, The Conspiracy, Cat and Mouse, Double Agent, The Setup',
    phaseGuide: 'Phase 1: Crisis in motion. Phase 2: The pursuit and the clock. Phase 3: Complications — alliances shift. Phase 4: Reversal. Phase 5: Climax. Phase 6: Cost.',
    synopsisRules: 'Synopses must track the information state — what each party knows. Specify the reversal moment precisely. Every batch must either raise or answer a question.',
  },
  story_historical: {
    label: 'Historical Fiction',
    formats: 'The Witness, Against the Tide, The Secret, Two Worlds, The Cost',
    phaseGuide: 'Phase 1: Root in period — specific year, place, social position. Phase 2: Personal stakes. Phase 3: Historical forces bear down. Phase 4: The pivotal choice. Phase 5: Consequence.',
    synopsisRules: 'Synopses must include specific period-accurate details: food, clothing, laws in play. Name the historical context. Show how large forces constrain personal choices.',
  },
  story_scifi: {
    label: 'Science Fiction',
    formats: 'First Contact, The Last Human, The Experiment, Two Timelines, The Upload',
    phaseGuide: 'Phase 1: Establish world rules through action. Phase 2: Character desire meets the world. Phase 3: System conflict. Phase 4: Idea escalation. Phase 5: Revelation.',
    synopsisRules: 'Synopses must state the world rule illustrated in each section and the human question it raises. The idea must be demonstrated through action, not exposition.',
  },
  story_mystery: {
    label: 'Mystery',
    formats: 'The Closed Room, The Unreliable Witness, The Inheritance, The Perfect Crime, The Amateur',
    phaseGuide: 'Phase 1: The puzzle posed. Phase 2: First clues. Phase 3: Red herrings that feel real. Phase 4: Narrowing. Phase 5: Revelation — surprising but inevitable. Phase 6: Resolution.',
    synopsisRules: 'Synopses must list the clues planted and red herrings introduced. Map what the reader concludes (wrong) vs what is actually true.',
  },
  story_adventure: {
    label: 'Adventure',
    formats: 'The Quest, The Rescue, The Discovery, Against All Odds, The Return',
    phaseGuide: 'Phase 1: Stable world disrupted. Phase 2: Threshold crossed. Phase 3: Tests and allies. Phase 4: The ordeal. Phase 5: Return carrying the transformation.',
    synopsisRules: 'Synopses must describe the specific obstacle in each section and how the hero fails or succeeds. Name the allies. Track the internal change alongside the external journey.',
  },
};

// ── Explainer subject configs ────────────────────────────────────────
const EXPLAINER_CONFIGS = {
  explainer_tech: {
    label: 'Tech and IT Explainer',
    hook_type: 'WTF moment — show the thing that breaks the viewer assumption about how technology works',
    structure: 'Hook, Common Misconception Destroyed, How It Actually Works in 3 steps, Real-World Applications, Future Implications, CTA',
    synopsis_rules: 'Each synopsis must include the specific technical concept explained, the analogy that makes it tangible, and the real-world example that proves it. Name the company, the product, the year, the engineer.',
  },
  explainer_finance: {
    label: 'Personal Finance Explainer',
    hook_type: 'Personal stakes — show exactly how much this costs the viewer in dollars and time right now',
    structure: 'Dollar Hook, Myth Destruction, The Real Mechanism, Step-by-Step Action, Worked Example with Specific Numbers, Risk Acknowledgment, CTA',
    synopsis_rules: 'Every synopsis must include specific dollar amounts, percentages, and time horizons. Name the exact financial products, platforms, or regulations discussed. Finance audiences distrust vagueness.',
  },
  explainer_legal: {
    label: 'Legal and Tax Education',
    hook_type: 'A real case or law that has already cost ordinary people money or freedom',
    structure: 'Real Case Hook, Plain-Language Translation, 3 Common Mistakes, Jurisdiction Clarity, What To Actually Do, When To Get a Lawyer, CTA',
    synopsis_rules: 'Each synopsis must cite the specific law or regulation, translate one piece of legal jargon into plain language, and describe the real-world consequence. Always note which jurisdiction applies.',
  },
  explainer_ai: {
    label: 'AI Tools and Tutorial',
    hook_type: 'Show the output before the input — the result that seems impossible until you see how it was made',
    structure: 'Impossible Output Hook, Before vs After Comparison, Setup Walkthrough step by step, 5 Pro Tips Nobody Shows, Honest Limitations, Salary and Career Impact, CTA',
    synopsis_rules: 'Each synopsis must describe the specific prompt or action the viewer will take and the exact output they should expect. Include the comparison to the old way. AI tutorials must be immediately actionable.',
  },
};

// ── Prompt builder helpers ───────────────────────────────────────────
function buildMeditationPrompt(topic_title, totalWords, numBatches, wordsPerBatch) {
  const lines = [
    'You are an expert sleep meditation script planner.',
    'You plan guided meditation scripts that ARE the soothing content — not scripts that talk ABOUT meditation.',
    '',
    'CRITICAL: Every synopsis describes the EXACT narrator words, affirmations, and guided imagery.',
    'The narrator speaks directly to the listener in second-person (you).',
    '',
    'CONTENT TYPE: Guided Sleep Meditation.',
    'Gentle second-person affirmations, guided breathing cues, progressive body relaxation, nature imagery.',
    'Deliberately repetitive and monotonous.',
    '',
    'PROJECT:',
    `Topic: ${topic_title}`,
    `Duration: batches of ~${wordsPerBatch} words each, ${numBatches} total sections`,
    '',
    'SECTION ARC:',
    'Section 1: Opening and Welcome — physical settling, body awareness, first breath cues',
    'Middle sections: Progressive deepening — each section calmer than the last.',
    'Final section: Deep rest — near silence, maximum PAUSE markers, gentle final affirmations',
    '',
    'SYNOPSIS RULES:',
    'Include specific affirmation phrases in quotes, for example: "You are safe", "All is well"',
    'Include [PAUSE X SEC] and [BREATHE] markers throughout',
    '200-300 words per synopsis describing the ACTUAL narrator words and imagery',
    'Deliberately monotonous — repetition is the tool, not a flaw',
    'Second-person only: your body, you feel, you are',
    'NO educational content, NO science, NO meta-commentary',
    '',
    'Return ONLY valid JSON:',
    `{"storytelling_format":"Sleep Meditation","batches":[{"batch_number":1,"story_segment":"Short title 3-5 words","focus_area":"One sentence focus","target_words":${wordsPerBatch},"synopsis":"200-300 words of specific narrator words, affirmations in quotes, pause markers, and imagery."}]}`,
  ];
  return lines.join('\n');
}

function buildSleepStoryPrompt(topic_title, totalWords, numBatches, wordsPerBatch) {
  const lines = [
    'You are a world-class bedtime story author planning an original sleep story for adults,',
    'in the tradition of the Calm app Sleep Stories.',
    '',
    'THIS IS A REAL STORY — not a meditation, not affirmations, not guided breathing.',
    'A sleep story has: named characters, a specific setting, a gentle plot that resolves peacefully.',
    'The narration is THIRD PERSON — she walked, he noticed, the cat slept — never second person.',
    '',
    `STORY SEED: ${topic_title}`,
    `BATCHES: ${numBatches} story sections of ~${wordsPerBatch} words each`,
    '',
    'YOUR JOB:',
    'Invent a complete original bedtime story around the topic seed.',
    'Give the protagonist a name, age, and specific situation.',
    'Choose a specific setting with rich sensory detail.',
    'Create a gentle plot arc that resolves peacefully by the final section.',
    '',
    'STORY ARC:',
    'Section 1: The protagonist arrives in or settles into a peaceful place.',
    'Rich sensory grounding — what they see, smell, hear. Establish the world.',
    'Middle sections: A gentle exploration or discovery.',
    'The world grows quieter and more peaceful with each section. Pacing slows.',
    'Final section: The protagonist finds rest. The world is still.',
    'End on a single image of complete peace.',
    '',
    'WHAT MAKES A GOOD SLEEP STORY:',
    'Interesting enough to follow, calm enough to sleep through',
    'Sentences get longer and slower as the story progresses',
    'Sounds, textures, and smells are as important as what is seen',
    'No conflict, danger, or unresolved tension',
    '[PAUSE 3 SEC] markers at natural breath points in the narration',
    'Each section feels like one chapter of a book read at bedtime',
    '',
    'SYNOPSIS RULES:',
    'Name the protagonist — for example: Elara, a lighthouse keeper in her 40s',
    'Name the setting specifically — for example: a stone cottage on a Scottish island',
    'Describe specific plot events: what happens, what is discovered, how it resolves',
    'Include sensory details: the smell of the sea, the sound of rain on the roof',
    '200-300 words per synopsis with specific story beats — not vague mood descriptions',
    'Third-person narration throughout — never "you", never "your body", never breathing instructions',
    'NO affirmations, NO meditation language, NO guided relaxation instructions',
    '',
    'FORBIDDEN in synopses:',
    '"Opening and Welcome" as a section name — that is a meditation structure',
    '"Guide the listener into relaxation" — that is meditation language',
    'Second-person narration such as "you feel" or "your body"',
    'Breathing cues as plot beats',
    'Affirmation phrases',
    '',
    'Return ONLY valid JSON:',
    `{"storytelling_format":"Sleep Story","batches":[{"batch_number":1,"story_segment":"Evocative 3-5 word section title","focus_area":"One sentence: what happens in this section","target_words":${wordsPerBatch},"synopsis":"200-300 words of specific story events, named characters, setting details, sensory imagery."}]}`,
  ];
  return lines.join('\n');
}

function buildStoryPrompt(topic_title, storyArch, totalWords, numBatches, wordsPerBatch) {
  const config = STORY_CONFIGS[storyArch] || STORY_CONFIGS.story_crime;
  const lines = [
    `You are a world-class story architect planning a ${config.label} script for a narrated YouTube video.`,
    '',
    `GENRE: ${config.label}`,
    `STORY SEED: ${topic_title}`,
    `BATCHES: ${numBatches} sections of ~${wordsPerBatch} words each`,
    '',
    `AVAILABLE FORMATS FOR THIS GENRE: ${config.formats}`,
    'Pick the ONE format that best fits the topic and creates the most compelling arc.',
    '',
    `DRAMATIC PHASE GUIDE: ${config.phaseGuide}`,
    '',
    `SYNOPSIS RULES FOR THIS GENRE: ${config.synopsisRules}`,
    '',
    'UNIVERSAL REQUIREMENTS:',
    'Every synopsis is 200-300 words of SPECIFIC dramatic content — not a vague summary',
    'Name all characters with specific names, ages, and professions — never "a man" or "our hero"',
    'Specify the emotional state of the story in each section',
    'Include the specific story beats, turning points, and revelations in order',
    'Every synopsis tells the script writer EXACTLY what to write — no interpretation needed',
    '',
    'Return ONLY valid JSON:',
    `{"storytelling_format":"${config.label} — [specific format chosen]","batches":[{"batch_number":1,"story_segment":"Evocative 3-5 word section title","focus_area":"One sentence: the dramatic function of this section","target_words":${wordsPerBatch},"synopsis":"200-300 words of specific story content, character names, emotional beats, and exact dramatic events."}]}`,
  ];
  return lines.join('\n');
}

function buildExplainerPrompt(topic_title, storyArch, totalWords, numBatches, wordsPerBatch) {
  const config = EXPLAINER_CONFIGS[storyArch] || EXPLAINER_CONFIGS.explainer_tech;
  const lines = [
    `You are a world-class YouTube content strategist specialising in ${config.label} videos.`,
    '',
    `TOPIC: ${topic_title}`,
    `BATCHES: ${numBatches} sections of ~${wordsPerBatch} words each`,
    '',
    `HOOK TYPE: ${config.hook_type}`,
    `STRUCTURE: ${config.structure}`,
    `SYNOPSIS RULES: ${config.synopsis_rules}`,
    '',
    `YOUR JOB: Create ${numBatches} batches where each is a self-contained teaching unit.`,
    '',
    'QUALITY STANDARDS:',
    'Every synopsis is 180-250 words of SPECIFIC teaching content — not vague summaries',
    'Include specific facts, examples, names, numbers, and analogies for each section',
    'The script writer must be able to write the section from the synopsis alone — no research needed',
    'Batch 1 MUST open with the hook type specified above',
    'Final batch MUST end with a direct, specific, confident CTA',
    'Each batch title should be a question the viewer has at that point in the video',
    '',
    'Return ONLY valid JSON:',
    `{"storytelling_format":"${config.label}","batches":[{"batch_number":1,"story_segment":"The question this section answers","focus_area":"One sentence: the teaching objective of this section","target_words":${wordsPerBatch},"synopsis":"180-250 words of specific teaching content, examples, numbers, analogies."}]}`,
  ];
  return lines.join('\n');
}

function buildStandardPrompt(topic_title, niche, numBatches, wordsPerBatch) {
  const lines = [
    'You are a YouTube documentary expert.',
    `Create a detailed outline for a video about "${topic_title}" in the ${niche} niche.`,
    '',
    'Pick the BEST storytelling format from:',
    'Big Lie, Untold Truth, Domino, Reveal, Zero to Hero, Turning Point, Timeline, Origin Story.',
    '',
    `Create exactly ${numBatches} batches, each ~${wordsPerBatch} words (150 words per minute).`,
    '',
    'For each batch write a DETAILED synopsis (5-8 sentences, 150-200 words, no newlines inside the string).',
    'Include specific narrative beats, facts, names, events, anecdotes, emotional turning points,',
    'and how the segment should open and close. The more detail, the better the final script.',
    '',
    'Respond with ONLY valid JSON:',
    `{"storytelling_format":"Format Name","batches":[{"batch_number":1,"story_segment":"Segment Title","focus_area":"Focus description","target_words":${wordsPerBatch},"synopsis":"Detailed synopsis here."}]}`,
  ];
  return lines.join('\n');
}

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, topic_title, niche, duration_minutes } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project  = projects[0];

    const projectMode = project.project_mode || '';
    const storyArch   = project.shorts_niche  || '';
    const isSleep     = projectMode === 'sleep_meditation' || projectMode === 'sleep_story';
    const isStory     = projectMode === 'story';
    const isExplainer = projectMode === 'explainer';

    const totalWords          = duration_minutes * 150;
    const wordsPerBatchTarget = isSleep ? 1100 : (isStory || isExplainer) ? 900 : 800;
    const numBatches          = Math.max(2, Math.ceil(totalWords / wordsPerBatchTarget));
    const wordsPerBatch       = Math.floor(totalWords / numBatches);

    let prompt = '';

    if (projectMode === 'sleep_meditation') {
      prompt = buildMeditationPrompt(topic_title, totalWords, numBatches, wordsPerBatch);
    } else if (projectMode === 'sleep_story') {
      prompt = buildSleepStoryPrompt(topic_title, totalWords, numBatches, wordsPerBatch);
    } else if (isStory) {
      prompt = buildStoryPrompt(topic_title, storyArch, totalWords, numBatches, wordsPerBatch);
    } else if (isExplainer) {
      prompt = buildExplainerPrompt(topic_title, storyArch, totalWords, numBatches, wordsPerBatch);
    } else {
      prompt = buildStandardPrompt(topic_title, niche || '', numBatches, wordsPerBatch);
    }

    const outline = await callOpenAI(prompt, 0.7);

    if (!outline.batches || !Array.isArray(outline.batches) || outline.batches.length === 0) {
      throw new Error('Outline returned no batches');
    }

    // Delete old batches
    const oldBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const ob of oldBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(ob.id);
    }

    // Create new batch records
    for (const batch of outline.batches) {
      await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number:  batch.batch_number,
        story_segment: batch.story_segment,
        focus_area:    batch.focus_area,
        synopsis:      batch.synopsis || batch.focus_area,
        target_words:  batch.target_words || wordsPerBatch,
        status:        'pending',
      });
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      video_duration_minutes: duration_minutes,
      storytelling_format:    outline.storytelling_format,
      outline:                JSON.stringify(outline.batches),
      status:                 'hooks_ready',
      current_step:           4,
    });

    return Response.json({
      success:             true,
      storytelling_format: outline.storytelling_format,
      batches:             outline.batches,
    });

  } catch (error) {
    console.error('generateOutline error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
