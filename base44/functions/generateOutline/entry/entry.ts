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
          { role: 'system', content: 'You are a creative writing and content planning expert. Always respond with valid JSON.' },
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
// PROTAGONIST NAME GENERATOR
// Picks a culturally appropriate name based on the story topic.
// Injected into the outline so ALL chapters use the same name.
// ═══════════════════════════════════════════════════════════════════
function pickProtagonistName(topicTitle) {
  // Simple pools — enough variety to feel intentional
  const pools = {
    japanese: ['Yuki', 'Haruki', 'Sora', 'Ren', 'Nao'],
    nordic: ['Astrid', 'Sven', 'Freya', 'Bjorn', 'Saga'],
    celtic: ['Rowan', 'Niamh', 'Callum', 'Isla', 'Finn'],
    mediterranean: ['Elena', 'Marco', 'Sofia', 'Luca', 'Aria'],
    english: ['Thomas', 'Clara', 'Oliver', 'Mara', 'James'],
    african: ['Amara', 'Kofi', 'Zara', 'Seun', 'Nia'],
    default: ['Mara', 'Thomas', 'Elena', 'Rowan', 'Luca', 'Clara', 'Finn', 'Aria'],
  };

  const t = (topicTitle || '').toLowerCase();

  if (/japan|kyoto|tokyo|zen|sakura|bamboo|shrine/i.test(t)) return pools.japanese[Math.floor(Math.random() * pools.japanese.length)];
  if (/norse|viking|nordic|fjord|scandinav/i.test(t)) return pools.nordic[Math.floor(Math.random() * pools.nordic.length)];
  if (/ireland|scottish|celtic|highland|loch|druid/i.test(t)) return pools.celtic[Math.floor(Math.random() * pools.celtic.length)];
  if (/italy|greek|tuscany|mediterranean|provence|spain/i.test(t)) return pools.mediterranean[Math.floor(Math.random() * pools.mediterranean.length)];
  if (/africa|ghana|nigeria|kenya|savanna/i.test(t)) return pools.african[Math.floor(Math.random() * pools.african.length)];
  if (/england|english|cottage|village|countryside|british/i.test(t)) return pools.english[Math.floor(Math.random() * pools.english.length)];

  return pools.default[Math.floor(Math.random() * pools.default.length)];
}

Deno.serve(async (req) => {
  try {
    // ── BUNNY CONFIG ROUTE ─────────────────────────────────────────
    // Detected by header flag — runs before auth, returns env vars so
    // the browser can upload directly to Bunny Storage via XHR.
    if (req.headers.get('x-bunny-config') === '1') {
      return Response.json({
        storage_zone:     Deno.env.get('BUNNY_STORAGE_ZONE')     || '',
        storage_password: Deno.env.get('BUNNY_STORAGE_PASSWORD') || '',
        storage_region:   Deno.env.get('BUNNY_STORAGE_REGION')   || 'ny',
        cdn_url:          Deno.env.get('BUNNY_CDN_URL')          || '',
      });
    }
    // ── END BUNNY CONFIG ROUTE ─────────────────────────────────────

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, topic_id, topic_title, niche, duration_minutes } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    const isSleep = project?.project_mode === 'sleep_meditation' || project?.project_mode === 'sleep_story';
    const isSleepStory = project?.project_mode === 'sleep_story';
    const isMeditation = project?.project_mode === 'sleep_meditation';

    const totalWords = duration_minutes * 150;

    // ── Batch sizing ──
    // Meditation: larger batches (repetition fills words naturally)
    // Sleep story: smaller batches (narrative needs more structure per chapter)
    // Standard: baseline
    const wordsPerBatchTarget = isMeditation ? 1100 : isSleepStory ? 900 : 800;
    const numBatches = Math.max(2, Math.ceil(totalWords / wordsPerBatchTarget));
    const wordsPerBatch = Math.floor(totalWords / numBatches);

    let prompt;

    if (isMeditation) {
      // ── MEDITATION OUTLINE — unchanged, affirmations/second-person OK ──
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
- Simple vocabulary, short sentences (8-18 words ideal)
- Progressive deepening: physical relaxation → mental calm → emotional peace → deep rest
- Nature metaphors: ocean, mountain, tree, river, moon, stars, forest
- Sensory grounding: touch, sound, sight, smell references
- Second-person "you" — speak directly to the listener

Create exactly ${numBatches} sections for this ${duration_minutes}-minute motivational meditation.

Return JSON:
{"storytelling_format": "motivational meditation", "batches": [{"batch_number": 1, "story_segment": "Short title (3-5 words)", "focus_area": "Brief focus (1 sentence)", "target_words": ${wordsPerBatch}, "synopsis": "EXTREMELY DETAILED synopsis (200-300 words) describing the ACTUAL soothing content — affirmations, imagery, and gentle guidance the narrator will speak."}]}`;

    } else if (isSleepStory) {
      // ── SLEEP STORY OUTLINE — v2 REWRITE ──
      const protagonistName = pickProtagonistName(topic_title);

      prompt = `You are a creative director planning an adult bedtime story — the kind told on the Calm app or Headspace's Sleepcasts. You are writing a STORY OUTLINE, not a meditation plan.

═══════════════════════════════════════
WHAT THIS IS
═══════════════════════════════════════
A sleep story is NARRATIVE FICTION. A named character moves through a beautiful, specific world. The listener falls asleep because the world is so warm and detailed and unhurried that sleep finds them naturally — not because they are instructed to relax.

Think: a gentle novel read aloud. A nature documentary in prose. A lullaby with plot.

═══════════════════════════════════════
THE PROTAGONIST
═══════════════════════════════════════
Name: **${protagonistName}**
Use this exact name in EVERY chapter synopsis. This is non-negotiable — every synopsis must refer to ${protagonistName} by name. Consistency across chapters is essential.

Personality: content, gently curious, unhurried, observant. Never anxious, rushed, or conflicted.

═══════════════════════════════════════
ABSOLUTE RULES FOR EVERY SYNOPSIS
═══════════════════════════════════════

✅ MUST HAVE:
- ${protagonistName}'s name used explicitly
- A specific, named location ("the stone harbour at Ardmore", "her kitchen in the old mill house", not "a peaceful place")
- Concrete actions ${protagonistName} takes (walks the cliffpath, stirs a pot of soup, ties the boat, folds a letter)
- Rich sensory details: what is seen, heard, smelled, touched
- Third-person present tense framing ("${protagonistName} walks...", "${protagonistName} watches...")
- Natural narrative progression — something happens, even if gently

❌ NEVER include:
- Second-person "you" language of any kind ("you feel", "you notice", "you breathe")
- Affirmations ("you are safe", "you are loved", "you deserve rest", "you are enough")
- Breathing instructions ("take a deep breath", "breathe in", "inhale slowly")
- Body scan or relaxation instructions ("feel your muscles relax", "your eyelids grow heavy")
- [PAUSE] or [BREATHE] markers in synopses — these belong in the script, not the outline
- Section titles like "Opening & Welcome", "Settling In", "Body Awareness", or any meditation phrasing
- "The listener" or any reference to an audience
- Meta-commentary ("this section will...")
- Conflict, danger, tension, urgency, or anything that raises heart rate

═══════════════════════════════════════
STORY STRUCTURE
═══════════════════════════════════════

Chapter 1 — ARRIVAL: ${protagonistName} arrives at or begins in a specific, vivid setting. Describe the environment in loving detail. She/he begins a simple, peaceful activity. Open like a novel: place the character in the world immediately.

Middle chapters — EXPLORATION: ${protagonistName} moves through the world, discovering small things, completing gentle tasks, pausing to observe. Each chapter has its own micro-arc: a walk completed, a meal prepared, a view discovered, a conversation with a neighbour, a found object, a familiar ritual. The world gets quieter and gentler with each chapter.

Final chapter — NATURAL REST: ${protagonistName} finds a warm, still place — a fire, a window, a bed, a sheltered spot outdoors. The world outside is quiet. The character is content. The narration slows. The chapter ends not with sleep being "instructed" but with ${protagonistName} simply... still. The story dissolves into the night.

═══════════════════════════════════════
PROJECT DETAILS
═══════════════════════════════════════
- Story topic / setting: ${topic_title}
- Duration: ${duration_minutes} minutes (~${totalWords} words at 150 wpm)
- Total chapters: ${numBatches}
- Words per chapter: ~${wordsPerBatch}

═══════════════════════════════════════
EXAMPLE OF A GOOD SYNOPSIS
═══════════════════════════════════════
Chapter: "The Harbour at Low Tide"
synopsis: "${protagonistName} walks the harbour wall as the tide retreats, leaving the fishing boats tilted gently on their moorings. The smell of salt and old rope is thick in the evening air. She moves slowly, one hand trailing along the worn stone, watching a heron pick its way between the exposed rocks below. At the far end of the wall there is a wooden bench, warped by years of sea wind, and she sits there watching the light change — the sky shifting from pale gold to a soft, bruised blue above the headland. A lobster fisherman she knows by sight nods as he passes, carrying a coil of rope over one shoulder. She nods back. Two swallows cut low across the water, almost touching the surface, then arrow up into the pale sky. The village bells ring the half-hour from somewhere behind her. She does not count them. She listens to the water moving against the stone below, the occasional soft knock of a hull against a buoy, and feels in no hurry to be anywhere at all."

═══════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════
Return only valid JSON:
{
  "storytelling_format": "sleep story",
  "protagonist_name": "${protagonistName}",
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short evocative chapter title (3-6 words, NO 'Opening', NO 'Welcome')",
      "focus_area": "One sentence: what ${protagonistName} does and where (no affirmations, no meditation language)",
      "target_words": ${wordsPerBatch},
      "synopsis": "200-300 words of specific story content. ${protagonistName} named explicitly. Specific location. Concrete actions. Sensory details. Third-person present tense. Zero second-person, zero affirmations, zero breathing cues."
    }
  ]
}`;

    } else {
      // ── STANDARD YOUTUBE OUTLINE — unchanged ──
      prompt = `You are a YouTube documentary expert. Create a detailed outline for a ${duration_minutes}-minute video about "${topic_title}" in the ${niche} niche.

Pick the BEST storytelling format from: Big Lie, Untold Truth, Domino, Reveal, Zero to Hero, Turning Point, Timeline, Origin Story.

Create exactly ${numBatches} batches, each ~${wordsPerBatch} words (150 words per minute).

For each batch write a DETAILED synopsis (5-8 sentences, 150-200 words, no newlines inside the string). Include specific narrative beats, facts, names, events, anecdotes, emotional turning points, and how the segment should open and close. The more detail, the better the final script.

Respond with ONLY valid JSON:
{"storytelling_format": "Format Name", "batches": [{"batch_number": 1, "story_segment": "Segment Title", "focus_area": "Focus description", "target_words": ${wordsPerBatch}, "synopsis": "Detailed synopsis here."}]}`;
    }

    const outline = await callOpenAI(prompt, isSleepStory ? 0.8 : 0.7);

    if (!outline.batches || !Array.isArray(outline.batches) || outline.batches.length === 0) {
      throw new Error("OpenAI returned an outline with no batches");
    }

    // ── For sleep stories: stamp protagonist_name onto every batch ──
    // This ensures the writing function always has the name available
    // even if the outline prompt missed it in a synopsis.
    if (isSleepStory) {
      const protagonist = outline.protagonist_name || pickProtagonistName(topic_title);
      for (const batch of outline.batches) {
        batch.protagonist_name = protagonist;
        // If synopsis somehow doesn't contain the name, prepend a note
        if (!batch.synopsis.includes(protagonist)) {
          batch.synopsis = `[Protagonist: ${protagonist}] ` + batch.synopsis;
        }
      }
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
        batch_number: batch.batch_number,
        story_segment: batch.story_segment,
        focus_area: batch.focus_area,
        synopsis: batch.synopsis || batch.focus_area,
        target_words: batch.target_words || wordsPerBatch,
        status: "pending"
      });
    }

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
      protagonist_name: isSleepStory ? (outline.protagonist_name || null) : undefined,
      batches: outline.batches
    });

  } catch (error) {
    console.error("generateOutline error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});