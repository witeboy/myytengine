import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import OpenAI from 'npm:openai@4.77.0';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, topic_id, topic_title, niche, duration_minutes } = await req.json();

    // Check if this is a sleep project to use smaller batch sizes
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    const isSleep     = project?.project_mode === 'sleep_meditation' || project?.project_mode === 'sleep_story';
    const isStory     = project?.project_mode === 'story';
    const isExplainer = project?.project_mode === 'explainer';
    const storyArch   = project?.shorts_niche || '';

    const totalWords = duration_minutes * 150;
    const wordsPerBatchTarget = isSleep ? 1100 : (isStory || isExplainer) ? 900 : 800;
    const numBatches = Math.max(2, Math.ceil(totalWords / wordsPerBatchTarget));
    const wordsPerBatch = Math.floor(totalWords / numBatches);

    let prompt;

    if (isSleep) {
      const isMeditation = project.project_mode === 'sleep_meditation';
      const contentType = isMeditation ? 'motivational meditation' : 'sleep story';

      prompt = `You are an expert sleep audio script planner. You plan ${contentType} scripts that ARE the soothing content — not scripts that talk ABOUT meditation or sleep.

**CRITICAL RULE**: Every section synopsis must describe WHAT THE NARRATOR WILL SAY — the actual soothing words, affirmations, imagery, and guided relaxation. Synopses must NEVER include:
❌ Explaining what ASMR is or how it works
❌ Discussing neuroscience, dopamine, oxytocin, or "studies"
❌ Giving practical sleep tips or advice
❌ Educational content about meditation or relaxation techniques
❌ Referencing YouTube, channels, videos, or content creation
❌ Any meta-commentary ("in this section we will...")

**CONTENT TYPE**: ${isMeditation ? 'Motivational Meditation — the narrator speaks directly to the listener with gentle affirmations, nature imagery, and soothing repetition.' : 'Sleep Story — the narrator tells a peaceful story with rich sensory details, calm settings, and gentle activities.'}

**PROJECT**:
- Topic: ${topic_title}
- Niche: ${niche}
- Duration: ${duration_minutes} minutes (~${totalWords} words at 150 wpm)

**SLEEP CONTENT PRINCIPLES**:
- Extremely gentle and soothing tone throughout
- Deliberately monotonous (boring is GOOD for sleep)
- Strategic repetition — each key concept repeated 4-6 times in different words
- NO excitement, urgency, drama, tension, or surprises
- Include [PAUSE X SEC] markers in synopses
- Simple vocabulary, short sentences (8-18 words ideal)
- Progressive deepening: physical relaxation → mental calm → emotional peace → deep rest
- Nature metaphors: ocean, mountain, tree, river, moon, stars, forest
- Sensory grounding: touch, sound, sight, smell references

Create exactly ${numBatches} sections for this ${duration_minutes}-minute ${contentType}.

Rules:
- First section MUST be Opening & Welcome (physical settling, breathing, body awareness)
- Last section should be the gentlest, most minimal — mostly pauses and silence
- Progressive deepening: each section calmer and slower than the last
- Synopses must describe the ACTUAL words and imagery, not explain concepts
- Include specific affirmation phrases IN QUOTES in synopses
- Include [PAUSE X SEC] markers in synopses
- Every synopsis: 200-300 words of SPECIFIC soothing content detail
- NO educational content, NO science, NO advice, NO meta-commentary

Return JSON:
{"storytelling_format": "${contentType}", "batches": [{"batch_number": 1, "story_segment": "Short title (3-5 words)", "focus_area": "Brief focus (1 sentence)", "target_words": ${wordsPerBatch}, "synopsis": "EXTREMELY DETAILED synopsis (200-300 words) describing the ACTUAL soothing content."}]}`;
    } else if (isStory) {

      // ── GENRE STORY OUTLINE ──────────────────────────────────
      const STORY_ARCH_CONFIGS = {
        story_comedy: {
          label: 'Comedy',
          formats: 'Fish Out of Water, Escalating Disaster, Mistaken Identity, Rule of Three',
          phaseGuide: 'Phase 1: Establish the absurd normal. Phase 2: Something goes wrong — escalate each attempt to fix it. Phase 3: Pattern breaks at the perfect moment. Phase 4: Warm callback landing.',
          synopsisRules: 'Each synopsis must specify the exact JOKE SETUP, the ESCALATION mechanism, and the PUNCHLINE or CALLBACK. Include the precise comic timing — what the reader expects vs what actually happens. Comedy lives in the gap between setup and subverted expectation.',
        },
        story_children: {
          label: "Children's Story",
          formats: 'Three Attempts, Unexpected Helper, Lost and Found, The Lesson',
          phaseGuide: 'Phase 1: Meet the hero in their world — specific detail, immediately lovable. Phase 2: The clear problem appears. Phase 3: Two failed attempts — show effort. Phase 4: Breakthrough and happy resolution.',
          synopsisRules: 'Synopses must name the specific characters (give them names), their exact want, and the precise moment of breakthrough. Language should be simple. Include the moral lesson that emerges naturally from events — never stated directly.',
        },
        story_nursery: {
          label: 'Nursery Rhyme',
          formats: 'AABB Rhyme, ABAB Rhyme, Cumulative Story, Call and Response',
          phaseGuide: 'Phase 1: Opening verse — establishes the scene and rhyme scheme. Phases 2-3: Body verses — each complete visual scene. Phase 4: Final verse — completes the rhyme with warmth.',
          synopsisRules: 'Each synopsis must include the RHYME SCHEME being used, 2-3 example rhyming words for that section, the visual imagery, and the rhythm pattern. Include the refrain if one exists.',
        },
        story_crime: {
          label: 'Crime / True Crime',
          formats: 'Cold Case, The Investigation, The Heist, Double Cross, The Confession',
          phaseGuide: 'Phase 1: Cold open on the crime or discovery. Phase 2: Investigation — clues and red herrings. Phase 3: Deeper complexity — things are not what they seem. Phase 4: False solution then real revelation. Phase 5: Aftermath and weight.',
          synopsisRules: 'Synopses must identify the specific clues planted in each section, which red herrings are introduced, and exactly what information the reader has vs what they are missing. The outline is a map of information — what is revealed when, and why that order creates maximum tension.',
        },
        story_love: {
          label: 'Romance',
          formats: 'Enemies to Lovers, Second Chance, Forbidden Love, Slow Burn, The Grand Gesture',
          phaseGuide: 'Phase 1: The meeting — something specific. Phase 2: Growing closer — small moments. Phase 3: The obstacle appears — real and serious. Phase 4: The almost moment — closest they get before it breaks. Phase 5: Lowest point. Phase 6: Vulnerability and breakthrough.',
          synopsisRules: 'Synopses must describe the specific EMOTIONAL STATE of both characters in each section, the precise tension mechanism, and what each character wants vs what they fear. Romance lives in interiority — what is felt, not just what happens.',        },
        story_horror: {
          label: 'Horror',
          formats: 'The Haunting, Body Horror, Psychological, Folk Horror, Cosmic Dread',
          phaseGuide: 'Phase 1: Normal world — establish what is precious. Phase 2: Wrongness creeps in — small wrong details. Phase 3: Dread escalates — the shape of the threat becomes clearer. Phase 4: Confrontation — the horror faced. Phase 5: Aftermath — what remains.',
          synopsisRules: 'Synopses must specify the EXACT wrong details in each section — what is off, how it manifests. Describe the dread mechanism: what the reader knows vs what the character knows. At least one question must remain unanswered at the end. Horror lives in what is NOT shown.',
        },
        story_thriller: {
          label: 'Thriller',
          formats: 'Ticking Clock, The Conspiracy, Cat and Mouse, Double Agent, The Setup',
          phaseGuide: 'Phase 1: Crisis already in motion. Phase 2: The pursuit — clock established. Phase 3: Complications — alliances shift, information weaponised. Phase 4: Reversal — protagonist discovers they were wrong about something critical. Phase 5: Climax — everything spent. Phase 6: Cost.',
          synopsisRules: 'Synopses must track the INFORMATION STATE — what the protagonist knows, what the antagonist knows, what the reader knows. Specify the reversal moment precisely: what was believed vs what is true. Every batch must either raise or answer a question.',
        },
        story_historical: {
          label: 'Historical Fiction',
          formats: 'The Witness, Against the Tide, The Secret, Two Worlds, The Cost',
          phaseGuide: 'Phase 1: Root in period — specific year, place, social position. Phase 2: Personal stakes established within historical moment. Phase 3: Historical forces bear down — the large meets the small. Phase 4: The pivotal choice under historical pressure. Phase 5: Consequence and resonance.',
          synopsisRules: 'Synopses must include specific period-accurate details: what the character eats, wears, the specific laws or events in play. Name the actual historical context. Show how the large historical forces directly constrain the character\'s personal choices.',        },
        story_scifi: {
          label: 'Science Fiction',
          formats: 'First Contact, The Last Human, The Experiment, Two Timelines, The Upload',
          phaseGuide: 'Phase 1: Establish the world rules through action, not explanation. Phase 2: Character desire meets the world. Phase 3: The system conflict — the world rules prevent what the character wants. Phase 4: Idea escalation — implications grow. Phase 5: Revelation — a new way of seeing.',
          synopsisRules: 'Synopses must state the WORLD RULE being illustrated in each section and the HUMAN QUESTION it raises. Avoid exposition dumps. The idea should be demonstrated through action. Include the specific technological or social mechanism that creates the story\'s central problem.',  },
        story_mystery: {
          label: 'Mystery',
          formats: 'The Closed Room, The Unreliable Witness, The Inheritance, The Perfect Crime, The Amateur',
          phaseGuide: 'Phase 1: The puzzle posed — specific, concrete, seemingly impossible. Phase 2: First clues — establish the detective\'s method. Phase 3: Red herrings that feel real. Phase 4: Narrowing — truth emerges. Phase 5: Revelation — surprising but inevitable. Phase 6: Resolution.',    synopsisRules: 'Synopses must list the CLUES planted and RED HERRINGS introduced in each section. Map what the reader is meant to conclude (wrong) vs what is actually true. Every detail planted must be either a clue or a red herring — nothing is filler in a mystery.',
        },
        story_adventure: {
          label: 'Adventure',
          formats: 'The Quest, The Rescue, The Discovery, Against All Odds, The Return',
          phaseGuide: 'Phase 1: Stable world disrupted — the call comes. Phase 2: Threshold crossed — the known world left behind. Phase 3: Tests and allies — the hero grows through failure. Phase 4: The ordeal — the greatest challenge. Phase 5: Return — carrying the transformation.',
          synopsisRules: 'Synopses must describe the specific OBSTACLE in each section and exactly HOW the hero fails or succeeds. Name the allies encountered. Track the hero\'s internal change alongside the external journey.',        },
      };

      const archConfig = STORY_ARCH_CONFIGS[storyArch] || STORY_ARCH_CONFIGS['story_crime'];

      prompt = `You are a world-class story architect planning a ${archConfig.label} script for a ${duration_minutes}-minute narrated YouTube video.

GENRE: ${archConfig.label}
TOPIC / STORY SEED: ${topic_title}
DURATION: ${duration_minutes} minutes (~${totalWords} words at 150wpm)
BATCHES: ${numBatches} sections of ~${wordsPerBatch} words each

STRUCTURAL FORMATS AVAILABLE FOR THIS GENRE:
${archConfig.formats}
Pick the ONE format that best fits the topic and creates the most compelling arc.

DRAMATIC PHASE GUIDE:
${archConfig.phaseGuide}

YOUR JOB: Create a ${numBatches}-batch outline where each batch is a self-contained dramatic section with a clear beginning, middle, and end — that also flows seamlessly into the next batch.

SYNOPSIS RULES FOR THIS GENRE:
${archConfig.synopsisRules}

UNIVERSAL REQUIREMENTS:
- Every synopsis is 200-300 words of SPECIFIC dramatic content — not a vague summary
- Name characters (invent specific names, ages, professions — not "a man" or "our hero")
- Specify the EMOTIONAL STATE of the story in each section
- Include the specific story beats, turning points, and revelations in order
- Every synopsis must tell the script writer EXACTLY what to write — no interpretation needed

Return ONLY valid JSON:
{"storytelling_format": "${archConfig.label} — [specific format chosen]", "batches": [{"batch_number": 1, "story_segment": "Evocative 3-5 word section title", "focus_area": "One sentence: the dramatic function of this section", "target_words": ${wordsPerBatch}, "synopsis": "200-300 words of specific story content, character names, emotional beats, and exact dramatic events for this section."}]}`;

    } else if (isExplainer) {

      // ── EXPLAINER VIDEO OUTLINE ──────────────────────────────
      const EXPLAINER_ARCH_CONFIGS = {
        explainer_tech: {
          label: 'Tech & IT Explainer',
          hook_type: 'WTF moment — show the thing that breaks the viewer\'s assumption about how technology works',
          structure: 'Hook → Common Misconception Destroyed → How It Actually Works (3 steps max) → Real-World Applications → Future Implications → CTA',
          synopsis_rules: 'Each synopsis must include the SPECIFIC technical concept being explained in that section, the ANALOGY that makes it tangible, and the real-world EXAMPLE that proves it. Tech explainers live in specifics — name the company, the product, the year, the engineer.',
        },
        explainer_finance: {
          label: 'Personal Finance Explainer',
          hook_type: 'Personal stakes — show exactly how much this costs the viewer in dollars and time right now',
          structure: 'Dollar Hook → Myth Destruction → The Real Mechanism → Step-by-Step Action → Worked Example with Specific Numbers → Risk Acknowledgment → CTA',
          synopsis_rules: 'Every synopsis must include SPECIFIC DOLLAR AMOUNTS, PERCENTAGES, and TIME HORIZONS. Name the exact financial products, platforms, or regulations being discussed. Include the worked example numbers for the section. Finance audiences distrust vagueness.',
        },
        explainer_legal: {
          label: 'Legal & Tax Education',
          hook_type: 'A real case or law that has already cost ordinary people money or freedom — make it personal and concrete',
          structure: 'Real Case Hook → Plain-Language Translation → 3 Common Mistakes → Jurisdiction Clarity → What To Actually Do → When To Get a Lawyer → CTA',
          synopsis_rules: 'Each synopsis must cite the SPECIFIC LAW OR REGULATION being explained, translate one piece of legal jargon into plain language, and describe the real-world consequence of getting this wrong. Always note which jurisdiction applies.',
        },
        explainer_ai: {
          label: 'AI Tools & Tutorial',
          hook_type: 'Show the output before the input — the result that seems impossible until you see how it was made',
          structure: 'Impossible Output Hook → Before vs After Comparison → Setup Walkthrough (step by step) → 5 Pro Tips Nobody Shows → Honest Limitations → Salary/Career Impact → CTA',
          synopsis_rules: 'Each synopsis must describe the SPECIFIC PROMPT OR ACTION the viewer will take, the EXACT OUTPUT they should expect, and which platform/tool version is being used. Include the comparison to the old way of doing this. AI tutorials must be immediately actionable.',
        },
      };

      const archConfig = EXPLAINER_ARCH_CONFIGS[storyArch] || EXPLAINER_ARCH_CONFIGS['explainer_tech'];

      prompt = `You are a world-class YouTube content strategist specialising in ${archConfig.label} videos.

TOPIC: ${topic_title}
DURATION: ${duration_minutes} minutes (~${totalWords} words at 150wpm)
BATCHES: ${numBatches} sections of ~${wordsPerBatch} words each

HOOK TYPE: ${archConfig.hook_type}
STRUCTURE: ${archConfig.structure}
SYNOPSIS RULES: ${archConfig.synopsis_rules}

YOUR JOB: Create a ${numBatches}-batch outline where each batch is a self-contained teaching unit that builds on the previous one.

OUTLINE QUALITY STANDARDS:
- Every synopsis is 180-250 words of SPECIFIC teaching content — not vague summaries
- Include the specific facts, examples, names, numbers, and analogies for each section
- The script writer must be able to write the section from the synopsis alone — no research needed
- Batch 1 MUST open with the hook type specified above
- Final batch MUST end with a direct, specific, confident CTA
- Each batch title should be a question the viewer has at that point in the video

Return ONLY valid JSON:
{"storytelling_format": "${archConfig.label}", "batches": [{"batch_number": 1, "story_segment": "The question this section answers", "focus_area": "One sentence: the teaching objective of this section", "target_words": ${wordsPerBatch}, "synopsis": "180-250 words of specific teaching content, examples, numbers, analogies, and exact facts for this section."}]}`;

    } else {
      prompt = `You are a YouTube documentary expert. Create a detailed outline for a ${duration_minutes}-minute video about "${topic_title}" in the ${niche} niche.

Pick the BEST storytelling format from: Big Lie, Untold Truth, Domino, Reveal, Zero to Hero, Turning Point, Timeline, Origin Story.

Create exactly ${numBatches} batches, each ~${wordsPerBatch} words (150 words per minute).

For each batch write a DETAILED synopsis (5-8 sentences, 150-200 words, no newlines inside the string). Include specific narrative beats, facts, names, events, anecdotes, emotional turning points, and how the segment should open and close. The more detail, the better the final script.

Respond with ONLY valid JSON:
{"storytelling_format": "Format Name", "batches": [{"batch_number": 1, "story_segment": "Segment Title", "focus_area": "Focus description", "target_words": ${wordsPerBatch}, "synopsis": "Detailed synopsis here."}]}`;
    }

    const outline = await callOpenAI(prompt, 0.7);

    // Validate we got usable batches
    if (!outline.batches || !Array.isArray(outline.batches) || outline.batches.length === 0) {
      throw new Error("Gemini returned an outline with no batches");
    }

    // Delete any old batches for this project
    const oldBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const ob of oldBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(ob.id);
    }

    // Create new batch records
    for (const batch of outline.batches) {
      await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: batch.batch_number,
        story_segment: batch.story_segment,
        focus_area: batch.focus_area,
        synopsis: batch.synopsis || batch.focus_area,
        target_words: batch.target_words || wordsPerBatch,
        status: "pending"
      });
    }

    // Skip hooks step — hook is embedded in script generation
    await base44.asServiceRole.entities.Projects.update(project_id, {
      video_duration_minutes: duration_minutes,
      storytelling_format: outline.storytelling_format,
      outline: JSON.stringify(outline.batches),
      status: "hooks_ready",
      current_step: 4
    });


    return Response.json({
      success: true,
      storytelling_format: outline.storytelling_format,
      batches: outline.batches
    });
  } catch (error) {
    console.error("generateOutline error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});