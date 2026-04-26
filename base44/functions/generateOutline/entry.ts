import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import OpenAI from 'npm:openai@4.77.0';

const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY') });

async function callOpenAI(prompt, temperature, retries) {
  temperature = temperature || 0.7;
  retries     = retries     || 3;
  for (var attempt = 0; attempt < retries; attempt++) {
    try {
      var response = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: temperature,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a YouTube content strategist. Always respond with valid JSON.' },
          { role: 'user',   content: prompt },
        ],
      });
      return JSON.parse(response.choices[0].message.content);
    } catch (err) {
      if (attempt === retries - 1) throw err;
      console.warn('OpenAI attempt ' + (attempt + 1) + ' failed: ' + err.message);
      await new Promise(function(r) { setTimeout(r, 2000 * (attempt + 1)); });
    }
  }
}

// ── Genre story configs (double-quoted strings — no apostrophe issues) ─
var STORY_CONFIGS = {
  story_comedy: {
    label: 'Comedy',
    formats: 'Fish Out of Water, Escalating Disaster, Mistaken Identity, Rule of Three',
    phaseGuide: 'Phase 1: Establish the absurd normal world. Phase 2: Something goes wrong, escalate each attempt to fix it. Phase 3: Pattern breaks at the perfect moment. Phase 4: Warm callback landing.',
    synopsisRules: 'Each synopsis must specify the exact joke setup, the escalation mechanism, and the punchline or callback. Include the comic timing — what the reader expects vs what actually happens. Comedy lives in the gap between setup and subverted expectation.',
  },
  story_children: {
    label: 'Children Story',
    formats: 'Three Attempts, Unexpected Helper, Lost and Found, The Lesson',
    phaseGuide: 'Phase 1: Meet the hero in their world — specific detail, immediately lovable. Phase 2: The clear problem appears. Phase 3: Two failed attempts — show effort. Phase 4: Breakthrough and happy resolution.',
    synopsisRules: 'Synopses must name the specific characters, their exact want, and the precise moment of breakthrough. Language should be simple. Include the moral lesson that emerges from events — never stated directly.',
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
    phaseGuide: 'Phase 1: Cold open on the crime or discovery. Phase 2: Investigation with clues and red herrings. Phase 3: Deeper complexity — things are not what they seem. Phase 4: False solution then real revelation. Phase 5: Aftermath and weight.',
    synopsisRules: 'Synopses must identify the specific clues planted in each section and which red herrings are introduced. Map exactly what information the reader has vs what they are missing. The outline is a map of information — what is revealed when, and why that order creates maximum tension.',
  },
  story_love: {
    label: 'Romance',
    formats: 'Enemies to Lovers, Second Chance, Forbidden Love, Slow Burn, The Grand Gesture',
    phaseGuide: 'Phase 1: The meeting. Phase 2: Growing closer through small moments. Phase 3: The obstacle appears. Phase 4: The almost moment — closest they get before it breaks. Phase 5: Lowest point. Phase 6: Vulnerability and breakthrough.',
    synopsisRules: 'Synopses must describe the emotional state of both characters in each section, the tension mechanism, and what each character wants vs what they fear. Romance lives in interiority — what is felt, not just what happens.',
  },
  story_horror: {
    label: 'Horror',
    formats: 'The Haunting, Body Horror, Psychological, Folk Horror, Cosmic Dread',
    phaseGuide: 'Phase 1: Normal world — establish what is precious. Phase 2: Wrongness creeps in — small wrong details. Phase 3: Dread escalates. Phase 4: Confrontation — the horror is faced. Phase 5: Aftermath — what remains.',
    synopsisRules: 'Synopses must specify the exact wrong details in each section — what is off and how it manifests. Describe the dread mechanism: what the reader knows vs what the character knows. At least one question must remain unanswered. Horror lives in what is NOT shown.',
  },
  story_thriller: {
    label: 'Thriller',
    formats: 'Ticking Clock, The Conspiracy, Cat and Mouse, Double Agent, The Setup',
    phaseGuide: 'Phase 1: Crisis already in motion. Phase 2: The pursuit and the clock established. Phase 3: Complications — alliances shift. Phase 4: Reversal — protagonist discovers something critical was wrong. Phase 5: Climax. Phase 6: Cost.',
    synopsisRules: 'Synopses must track the information state — what the protagonist knows, what the antagonist knows, what the reader knows. Specify the reversal moment precisely. Every batch must either raise or answer a question.',
  },
  story_historical: {
    label: 'Historical Fiction',
    formats: 'The Witness, Against the Tide, The Secret, Two Worlds, The Cost',
    phaseGuide: 'Phase 1: Root in period — specific year, place, social position. Phase 2: Personal stakes within the historical moment. Phase 3: Historical forces bear down. Phase 4: The pivotal choice. Phase 5: Consequence and resonance.',
    synopsisRules: 'Synopses must include specific period-accurate details: food, clothing, laws, events in play. Name the actual historical context. Show how large historical forces directly constrain the personal choices of the characters.',
  },
  story_scifi: {
    label: 'Science Fiction',
    formats: 'First Contact, The Last Human, The Experiment, Two Timelines, The Upload',
    phaseGuide: 'Phase 1: Establish the world rules through action, not explanation. Phase 2: Character desire meets the world. Phase 3: System conflict — the world rules prevent what the character wants. Phase 4: Idea escalation. Phase 5: Revelation.',
    synopsisRules: 'Synopses must state the world rule illustrated in each section and the human question it raises. Avoid exposition dumps. The idea must be demonstrated through action. Include the specific mechanism that creates the central problem.',
  },
  story_mystery: {
    label: 'Mystery',
    formats: 'The Closed Room, The Unreliable Witness, The Inheritance, The Perfect Crime, The Amateur',
    phaseGuide: 'Phase 1: The puzzle posed. Phase 2: First clues — establish the investigation method. Phase 3: Red herrings that feel real. Phase 4: Narrowing — truth begins to emerge. Phase 5: Revelation — surprising but inevitable. Phase 6: Resolution.',
    synopsisRules: 'Synopses must list the clues planted and red herrings introduced in each section. Map what the reader is meant to conclude (wrong) vs what is actually true. Every detail must be either a clue or a red herring — nothing is filler in a mystery.',
  },
  story_adventure: {
    label: 'Adventure',
    formats: 'The Quest, The Rescue, The Discovery, Against All Odds, The Return',
    phaseGuide: 'Phase 1: Stable world disrupted — the call comes. Phase 2: The threshold is crossed. Phase 3: Tests and allies — the hero grows through failure. Phase 4: The ordeal — the greatest challenge. Phase 5: Return carrying the transformation.',
    synopsisRules: 'Synopses must describe the specific obstacle in each section and exactly how the hero fails or succeeds. Name the allies encountered. Track the internal change of the hero alongside the external journey.',
  },
};

// ── Explainer subject configs ────────────────────────────────────────
var EXPLAINER_CONFIGS = {
  explainer_tech: {
    label: 'Tech and IT Explainer',
    hook_type: 'WTF moment — show the thing that breaks the viewer assumption about how technology works',
    structure: 'Hook, Common Misconception Destroyed, How It Actually Works in 3 steps, Real-World Applications, Future Implications, CTA',
    synopsis_rules: 'Each synopsis must include the specific technical concept explained, the analogy that makes it tangible, and the real-world example that proves it. Tech explainers live in specifics — name the company, the product, the year, the engineer.',
  },
  explainer_finance: {
    label: 'Personal Finance Explainer',
    hook_type: 'Personal stakes — show exactly how much this costs the viewer in dollars and time right now',
    structure: 'Dollar Hook, Myth Destruction, The Real Mechanism, Step-by-Step Action, Worked Example with Specific Numbers, Risk Acknowledgment, CTA',
    synopsis_rules: 'Every synopsis must include specific dollar amounts, percentages, and time horizons. Name the exact financial products, platforms, or regulations discussed. Include worked example numbers. Finance audiences distrust vagueness.',
  },
  explainer_legal: {
    label: 'Legal and Tax Education',
    hook_type: 'A real case or law that has already cost ordinary people money or freedom — make it personal and concrete',
    structure: 'Real Case Hook, Plain-Language Translation, 3 Common Mistakes, Jurisdiction Clarity, What To Actually Do, When To Get a Lawyer, CTA',
    synopsis_rules: 'Each synopsis must cite the specific law or regulation being explained, translate one piece of legal jargon into plain language, and describe the real-world consequence of getting this wrong. Always note which jurisdiction applies.',
  },
  explainer_ai: {
    label: 'AI Tools and Tutorial',
    hook_type: 'Show the output before the input — the result that seems impossible until you see how it was made',
    structure: 'Impossible Output Hook, Before vs After Comparison, Setup Walkthrough step by step, 5 Pro Tips Nobody Shows, Honest Limitations, Salary and Career Impact, CTA',
    synopsis_rules: 'Each synopsis must describe the specific prompt or action the viewer will take, the exact output they should expect, and which platform or tool version is used. Include the comparison to the old way. AI tutorials must be immediately actionable.',
  },
};

// ── Main handler ─────────────────────────────────────────────────────
Deno.serve(async function(req) {
  try {
    var base44 = createClientFromRequest(req);
    var user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    var body             = await req.json();
    var project_id       = body.project_id;
    var topic_title      = body.topic_title;
    var niche            = body.niche || '';
    var duration_minutes = body.duration_minutes;

    var projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    var project  = projects[0];

    var projectMode  = project.project_mode || '';
    var storyArch    = project.shorts_niche  || '';
    var isSleep      = projectMode === 'sleep_meditation' || projectMode === 'sleep_story';
    var isStory      = projectMode === 'story';
    var isExplainer  = projectMode === 'explainer';

    var totalWords          = duration_minutes * 150;
    var wordsPerBatchTarget = isSleep ? 1100 : (isStory || isExplainer) ? 900 : 800;
    var numBatches          = Math.max(2, Math.ceil(totalWords / wordsPerBatchTarget));
    var wordsPerBatch       = Math.floor(totalWords / numBatches);

    var prompt = '';

    // ── SLEEP MEDITATION ───────────────────────────────────────────
    if (projectMode === 'sleep_meditation') {

      prompt =
        'You are an expert sleep meditation script planner.' +
        ' You plan guided meditation scripts that ARE the soothing content, not scripts that talk ABOUT meditation.\n\n' +
        'CRITICAL: Every synopsis describes the EXACT narrator words, affirmations, and guided imagery.' +
        ' The narrator speaks directly to the listener in second-person (you).\n\n' +
        'CONTENT TYPE: Guided Sleep Meditation.\n' +
        'Gentle second-person affirmations, guided breathing cues, progressive body relaxation, nature imagery.' +
        ' Deliberately repetitive and monotonous.\n\n' +
        'PROJECT:\n' +
        'Topic: ' + topic_title + '\n' +
        'Duration: ' + duration_minutes + ' minutes (~' + totalWords + ' words at 150 wpm)\n' +
        'Batches: ' + numBatches + ' sections of ~' + wordsPerBatch + ' words each\n\n' +
        'SECTION ARC:\n' +
        'Section 1: Opening and Welcome — physical settling, body awareness, first breath cues\n' +
        'Middle sections: Progressive deepening. Each section calmer than the last.' +
        ' Breathing guidance, body relaxation, nature imagery, affirmations.\n' +
        'Final section: Deep rest — near silence, maximum PAUSE markers, gentle final affirmations\n\n' +
        'SYNOPSIS RULES:\n' +
        'Include specific affirmation phrases in quotes, for example: "You are safe", "All is well"\n' +
        'Include [PAUSE X SEC] and [BREATHE] markers throughout\n' +
        '200-300 words per synopsis describing the ACTUAL narrator words and imagery\n' +
        'Deliberately monotonous — repetition is the tool, not a flaw\n' +
        'Second-person only: your body, you feel, you are\n' +
        'NO educational content, NO science, NO meta-commentary\n\n' +
        'Return ONLY valid JSON:\n' +
        '{"storytelling_format":"Sleep Meditation","batches":[{"batch_number":1,"story_segment":"Short title 3-5 words","focus_area":"One sentence focus","target_words":' + wordsPerBatch + ',"synopsis":"200-300 words of specific narrator words, affirmations in quotes, pause markers, and imagery."}]}';

    // ── SLEEP STORY ────────────────────────────────────────────────
    } else if (projectMode === 'sleep_story') {

      prompt =
        'You are a world-class bedtime story author planning an original sleep story for adults,' +
        ' in the tradition of the Calm app Sleep Stories.\n\n' +
        'THIS IS A REAL STORY — not a meditation, not affirmations, not guided breathing.\n' +
        'A sleep story has: named characters, a specific setting, a gentle plot that resolves peacefully.\n' +
        'The narration is THIRD PERSON — she walked, he noticed, the cat slept — never second person.\n\n' +
        'STORY SEED: ' + topic_title + '\n' +
        'DURATION: ' + duration_minutes + ' minutes (~' + totalWords + ' words at 150 wpm)\n' +
        'BATCHES: ' + numBatches + ' story sections of ~' + wordsPerBatch + ' words each\n\n' +
        'YOUR JOB:\n' +
        'Invent a complete original bedtime story around the topic seed.\n' +
        'Give the protagonist a name, age, and specific situation.\n' +
        'Choose a specific setting with rich sensory detail.\n' +
        'Create a gentle plot arc that resolves peacefully by the final section.\n\n' +
        'STORY ARC:\n' +
        'Section 1: The protagonist arrives in or settles into a peaceful place.' +
        ' Rich sensory grounding — what they see, smell, hear. Establish the world.\n' +
        'Middle sections: A gentle exploration or discovery.' +
        ' The world grows quieter and more peaceful with each section. Pacing slows.\n' +
        'Final section: The protagonist finds rest. The world is still.' +
        ' End on a single image of complete peace.\n\n' +
        'WHAT MAKES A GOOD SLEEP STORY:\n' +
        'Interesting enough to follow, calm enough to sleep through\n' +
        'Sentences get longer and slower as the story progresses\n' +
        'Sounds, textures, and smells are as important as what is seen\n' +
        'No conflict, danger, or unresolved tension\n' +
        '[PAUSE 3 SEC] markers at natural breath points in the narration\n' +
        'Each section feels like one chapter of a book read at bedtime\n\n' +
        'SYNOPSIS RULES:\n' +
        'Name the protagonist — for example: Elara, a lighthouse keeper in her 40s\n' +
        'Name the setting specifically — for example: a stone cottage on a Scottish island\n' +
        'Describe specific plot events: what happens, what is discovered, how it resolves\n' +
        'Include sensory details: the smell of the sea, the sound of rain on the roof\n' +
        '200-300 words per synopsis with specific story beats — not vague mood descriptions\n' +
        'Third-person narration throughout — never "you", never "your body", never breathing instructions\n' +
        'NO affirmations, NO meditation language, NO guided relaxation instructions\n\n' +
        'FORBIDDEN in synopses:\n' +
        '"Opening and Welcome" as a section name — that is a meditation structure\n' +
        '"Guide the listener into relaxation" — that is meditation language\n' +
        'Second-person narration such as "you feel" or "your body"\n' +
        'Breathing cues as plot beats\n' +
        'Affirmation phrases\n\n' +
        'Return ONLY valid JSON:\n' +
        '{"storytelling_format":"Sleep Story","batches":[{"batch_number":1,"story_segment":"Evocative 3-5 word section title","focus_area":"One sentence: what happens in this section","target_words":' + wordsPerBatch + ',"synopsis":"200-300 words of specific story events, named characters, setting details, sensory imagery."}]}';

    // ── GENRE STORY ────────────────────────────────────────────────
    } else if (isStory) {

      var storyConfig = STORY_CONFIGS[storyArch] || STORY_CONFIGS.story_crime;

      prompt =
        'You are a world-class story architect planning a ' + storyConfig.label + ' script' +
        ' for a ' + duration_minutes + '-minute narrated YouTube video.\n\n' +
        'GENRE: ' + storyConfig.label + '\n' +
        'STORY SEED: ' + topic_title + '\n' +
        'DURATION: ' + duration_minutes + ' minutes (~' + totalWords + ' words at 150 wpm)\n' +
        'BATCHES: ' + numBatches + ' sections of ~' + wordsPerBatch + ' words each\n\n' +
        'AVAILABLE FORMATS FOR THIS GENRE:\n' + storyConfig.formats + '\n' +
        'Pick the ONE format that best fits the topic and creates the most compelling arc.\n\n' +
        'DRAMATIC PHASE GUIDE:\n' + storyConfig.phaseGuide + '\n\n' +
        'SYNOPSIS RULES FOR THIS GENRE:\n' + storyConfig.synopsisRules + '\n\n' +
        'UNIVERSAL REQUIREMENTS:\n' +
        'Every synopsis is 200-300 words of SPECIFIC dramatic content — not a vague summary\n' +
        'Name all characters with specific names, ages, and professions — never "a man" or "our hero"\n' +
        'Specify the emotional state of the story in each section\n' +
        'Include specific story beats, turning points, and revelations in order\n' +
        'Every synopsis tells the script writer EXACTLY what to write — no interpretation needed\n\n' +
        'Return ONLY valid JSON:\n' +
        '{"storytelling_format":"' + storyConfig.label + ' — [specific format chosen]",' +
        '"batches":[{"batch_number":1,"story_segment":"Evocative 3-5 word section title",' +
        '"focus_area":"One sentence: the dramatic function of this section",' +
        '"target_words":' + wordsPerBatch + ',' +
        '"synopsis":"200-300 words of specific story content, character names, emotional beats, and exact dramatic events."}]}';

    // ── EXPLAINER VIDEO ────────────────────────────────────────────
    } else if (isExplainer) {

      var explainConfig = EXPLAINER_CONFIGS[storyArch] || EXPLAINER_CONFIGS.explainer_tech;

      prompt =
        'You are a world-class YouTube content strategist specialising in ' + explainConfig.label + ' videos.\n\n' +
        'TOPIC: ' + topic_title + '\n' +
        'DURATION: ' + duration_minutes + ' minutes (~' + totalWords + ' words at 150 wpm)\n' +
        'BATCHES: ' + numBatches + ' sections of ~' + wordsPerBatch + ' words each\n\n' +
        'HOOK TYPE: ' + explainConfig.hook_type + '\n' +
        'STRUCTURE: ' + explainConfig.structure + '\n' +
        'SYNOPSIS RULES: ' + explainConfig.synopsis_rules + '\n\n' +
        'YOUR JOB: Create ' + numBatches + ' batches where each is a self-contained teaching unit.\n\n' +
        'QUALITY STANDARDS:\n' +
        'Every synopsis is 180-250 words of SPECIFIC teaching content — not vague summaries\n' +
        'Include specific facts, examples, names, numbers, and analogies for each section\n' +
        'The script writer must be able to write the section from the synopsis alone — no research needed\n' +
        'Batch 1 MUST open with the hook type specified above\n' +
        'Final batch MUST end with a direct, specific, confident CTA\n' +
        'Each batch title should be a question the viewer has at that point in the video\n\n' +
        'Return ONLY valid JSON:\n' +
        '{"storytelling_format":"' + explainConfig.label + '",' +
        '"batches":[{"batch_number":1,"story_segment":"The question this section answers",' +
        '"focus_area":"One sentence: the teaching objective of this section",' +
        '"target_words":' + wordsPerBatch + ',' +
        '"synopsis":"180-250 words of specific teaching content, examples, numbers, analogies."}]}';

    // ── STANDARD VIRAL DOCUMENTARY ─────────────────────────────────
    } else {

      prompt =
        'You are a YouTube documentary expert.' +
        ' Create a detailed outline for a ' + duration_minutes + '-minute video' +
        ' about "' + topic_title + '" in the ' + niche + ' niche.\n\n' +
        'Pick the BEST storytelling format from:' +
        ' Big Lie, Untold Truth, Domino, Reveal, Zero to Hero, Turning Point, Timeline, Origin Story.\n\n' +
        'Create exactly ' + numBatches + ' batches, each ~' + wordsPerBatch + ' words (150 words per minute).\n\n' +
        'For each batch write a DETAILED synopsis (5-8 sentences, 150-200 words, no newlines inside the string).' +
        ' Include specific narrative beats, facts, names, events, anecdotes, emotional turning points,' +
        ' and how the segment should open and close.\n\n' +
        'Respond with ONLY valid JSON:\n' +
        '{"storytelling_format":"Format Name","batches":[{"batch_number":1,"story_segment":"Segment Title","focus_area":"Focus description","target_words":' + wordsPerBatch + ',"synopsis":"Detailed synopsis here."}]}';
    }

    // ── Call the AI ─────────────────────────────────────────────────
    var outline = await callOpenAI(prompt, 0.7);

    if (!outline.batches || !Array.isArray(outline.batches) || outline.batches.length === 0) {
      throw new Error('Outline returned no batches');
    }

    // Delete old batches
    var oldBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id: project_id });
    for (var i = 0; i < oldBatches.length; i++) {
      await base44.asServiceRole.entities.ScriptBatches.delete(oldBatches[i].id);
    }

    // Create new batch records
    for (var j = 0; j < outline.batches.length; j++) {
      var batch = outline.batches[j];
      await base44.asServiceRole.entities.ScriptBatches.create({
        project_id:    project_id,
        batch_number:  batch.batch_number,
        story_segment: batch.story_segment,
        focus_area:    batch.focus_area,
        synopsis:      batch.synopsis || batch.focus_area,
        target_words:  batch.target_words || wordsPerBatch,
        status:        'pending',
      });
    }

    // Update project
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