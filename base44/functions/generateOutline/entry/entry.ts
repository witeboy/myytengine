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
    const isSleep = project?.project_mode === 'sleep_meditation' || project?.project_mode === 'sleep_story';

    const totalWords = duration_minutes * 150;
    const wordsPerBatchTarget = isSleep ? 1100 : 800;
    const numBatches = Math.max(2, Math.ceil(totalWords / wordsPerBatchTarget));
    const wordsPerBatch = Math.floor(totalWords / numBatches);

    let prompt;

    if (isSleep) {
      const isMeditation = project.project_mode === 'sleep_meditation';

      if (isMeditation) {
        prompt = `You are an expert sleep audio script planner. You plan motivational meditation scripts that ARE the soothing content — not scripts that talk ABOUT meditation or sleep.

**CRITICAL RULE**: Every section synopsis must describe WHAT THE NARRATOR WILL SAY — the actual soothing words, affirmations, imagery, and guided relaxation. Synopses must NEVER include:
❌ Explaining what ASMR is or how it works
❌ Discussing neuroscience, dopamine, oxytocin, or "studies"
❌ Giving practical sleep tips or advice
❌ Educational content about meditation or relaxation techniques
❌ Referencing YouTube, channels, videos, or content creation
❌ Any meta-commentary ("in this section we will...")

**CONTENT TYPE**: Motivational Meditation — the narrator speaks directly to the listener with gentle affirmations, nature imagery, and soothing repetition.

**PROJECT**:
- Topic: ${topic_title}
- Niche: ${niche}
- Duration: ${duration_minutes} minutes (~${totalWords} words at 150 wpm)

**MEDITATION CONTENT PRINCIPLES**:
- Extremely gentle and soothing tone throughout
- Deliberately monotonous (boring is GOOD for sleep)
- Strategic repetition — each key concept repeated 4-6 times in different words
- NO excitement, urgency, drama, tension, or surprises
- Include [PAUSE X SEC] markers in synopses
- Simple vocabulary, short sentences (8-18 words ideal)
- Progressive deepening: physical relaxation → mental calm → emotional peace → deep rest
- Nature metaphors: ocean, mountain, tree, river, moon, stars, forest
- Sensory grounding: touch, sound, sight, smell references
- Second-person "you" — speak directly to the listener

Create exactly ${numBatches} sections for this ${duration_minutes}-minute motivational meditation.

Return JSON:
{"storytelling_format": "motivational meditation", "batches": [{"batch_number": 1, "story_segment": "Short title (3-5 words)", "focus_area": "Brief focus (1 sentence)", "target_words": ${wordsPerBatch}, "synopsis": "EXTREMELY DETAILED synopsis (200-300 words) describing the ACTUAL soothing content."}]}`;
      } else {
        // ═══ SLEEP STORY — real narrative, NOT meditation ═══
        prompt = `You are an expert bedtime story writer. You write REAL STORIES with named characters, specific settings, and gentle plot events. You are NOT a meditation guide. You do NOT write affirmations.

**WHAT YOU ARE WRITING**: A bedtime story for adults — like Calm app sleep stories or Headspace sleepcasts. A real narrative told in a lullaby-like cadence. The listener falls asleep because the story is gentle, warm, and immersive — NOT because you tell them to relax or breathe.

**ABSOLUTE PROHIBITIONS** — violating ANY of these ruins the story:
❌ NEVER use second-person "you" language ("you feel calm", "you notice")
❌ NEVER include affirmations ("you are safe", "you are loved", "you are enough")
❌ NEVER include breathing cues ([BREATHE], "take a deep breath")
❌ NEVER name a section "Opening & Welcome" — this is a STORY
❌ NEVER write "the listener" or address someone directly
❌ NEVER include guided relaxation or body awareness instructions
❌ NEVER write meta-commentary ("in this section we will...")
❌ NO excitement, tension, conflict, danger, or surprises

**WHAT EVERY SYNOPSIS MUST CONTAIN**:
✅ A named protagonist (e.g. "Elena", "Thomas", "Amara")
✅ A specific physical setting ("a stone cottage by a lavender field", not "a peaceful place")
✅ Concrete actions the character takes (walking, cooking, gardening, reading)
✅ Rich sensory details: what the character sees, hears, smells, touches
✅ Third-person narration, present tense ("Elena walks along the path...")
✅ [PAUSE X SEC] markers for pacing — but NO [BREATHE] markers

**PROJECT**:
- Topic: ${topic_title}
- Niche: ${niche}
- Duration: ${duration_minutes} minutes (~${totalWords} words at 150 wpm)

**STORY PRINCIPLES**:
- Extremely gentle pacing — unhurried, like a lullaby
- Lush sensory descriptions that immerse the listener
- The protagonist is content, peaceful, curious — never anxious
- Small activities described in loving, slow detail
- Progressive winding down: the story world gets quieter as it goes
- By the final sections, the protagonist is settling into rest

Create exactly ${numBatches} chapters for this ${duration_minutes}-minute bedtime story.

Rules:
- First chapter introduces the protagonist BY NAME and the setting — NOT "Opening & Welcome"
- Last chapter: the protagonist settles into rest — minimal narration, atmosphere and pauses
- EVERY synopsis must name the protagonist and describe concrete actions
- EVERY synopsis must include sensory details (sights, sounds, smells, textures)
- Include [PAUSE X SEC] markers — NO [BREATHE] markers
- ZERO second-person, ZERO affirmations, ZERO breathing instructions
- Every synopsis: 200-300 words of SPECIFIC story content

Return JSON:
{"storytelling_format": "sleep story", "batches": [{"batch_number": 1, "story_segment": "Short chapter title (3-5 words)", "focus_area": "Brief focus — what happens (1 sentence)", "target_words": ${wordsPerBatch}, "synopsis": "EXTREMELY DETAILED synopsis (200-300 words) describing the ACTUAL STORY — character actions, setting, sensory details. NO affirmations, NO breathing cues."}]}`;
      }
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
