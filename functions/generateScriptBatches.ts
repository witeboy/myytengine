import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

async function callGemini(prompt, temperature = 0.85, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 16384, responseMimeType: "application/json" }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini error: ${err.error?.message || response.status}`);
    }

    const data = await response.json();
    if (!data.candidates?.length) throw new Error("No candidates from Gemini");
    const rawText = data.candidates[0].content.parts[0].text;

    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      console.log(`[Gemini] JSON parse failed (attempt ${attempt + 1}): ${parseErr.message}`);
      try {
        let cleaned = rawText
          .replace(/```json\s*/g, '').replace(/```\s*/g, '');
        cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, (c) => {
          switch (c) {
            case '\n': return '\\n';
            case '\r': return '\\r';
            case '\t': return '\\t';
            default: return ' ';
          }
        });
        return JSON.parse(cleaned);
      } catch (_) {
        if (attempt === retries) throw new Error(`JSON parse failed after ${retries + 1} attempts: ${parseErr.message}`);
        console.log(`[Gemini] Retrying...`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// SLEEP SCRIPT WRITING PROMPT
// ═══════════════════════════════════════════════════════════════════
function buildSleepWritingPrompt({ scriptMode, batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock }) {
  const isMeditation = scriptMode === 'sleep_meditation';

  return `You are an expert sleep script writer specializing in ${isMeditation ? 'bedtime motivational meditations' : 'bedtime sleep stories'} designed to help listeners fall asleep. You create professional-grade scripts following proven formats from successful sleep channels.

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

**TARGET**: ~${batch.target_words} words.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat):\n${previousContent.slice(-4000)}\n` : ''}

**═══ SLEEP SCRIPT WRITING RULES ═══**

**TONE & DELIVERY**:
1. Extremely gentle and soothing — deliberately monotonous (boring is GOOD)
2. Consistent rhythm throughout — NO excitement, urgency, drama, or emotional peaks
3. NO surprises, plot twists, or tension — hypnotic, trance-inducing quality
4. Slow and deliberate pacing — strategic repetition is ESSENTIAL
5. Each key concept repeated 4-6 times in different phrasings

**LANGUAGE**:
6. Simple, accessible vocabulary — short to medium sentences (12-20 words ideal)
7. Comforting, warm language — ${isMeditation ? 'second-person "you"' : 'third-person narrative, present tense'}
8. AVOID: complex words, long winding sentences, harsh consonant sounds, alerting words (suddenly, shocking, alarm, urgent), medical jargon, anything requiring active problem-solving

**PAUSE MARKERS** (ESSENTIAL — include these throughout):
- [PAUSE 3 SEC] — short contemplative pause (use after key phrases)
- [PAUSE 5 SEC] — medium integration pause (use between thoughts)
- [PAUSE 10 SEC] — deep integration pause (use between major sections)
- [BREATHE] — breathing cue marker
- Insert pauses generously — at least every 2-3 sentences

**SENSORY GROUNDING** (weave throughout):
- Touch: weight of blankets, softness, warmth, gentle pressure
- Sound: rain, ocean waves, rustling leaves, soft breathing, distant sounds
- Sight: darkness, soft light, stars, candlelight, gentle colors
- Smell: fresh bread, rain, flowers, wood smoke (subtle)

**NATURE METAPHORS** (use repeatedly):
- Ocean: deep, vast, constant, waves of breath
- Mountain: stable, grounded, enduring
- Tree: rooted, growing, patient, seasonal cycles
- River: flowing, letting go, natural path
- Moon: perfect in every phase, gentle light
- Stars: always present, constant light in darkness

**PSYCHOLOGICAL TECHNIQUES**:
- Progressive relaxation: physical → mental → emotional settling
- Cognitive defusion: "thoughts are like clouds passing", "let it drift away"
- Positive suggestion: "you are safe", "rest comes naturally"
- Temporal distortion: "time passes... though it's hard to say how much..."
- Anchoring phrases every 5-10 minutes: "let it go... just for now...", "safe... held... at peace...", "rest now..."

${isMeditation ? `**MEDITATION SECTION STRUCTURE**:
- Start: Introduce sub-theme gently
- Core: State main affirmation clearly, repeat 2-3 ways
- Elaborate: Nature imagery, sensory details, peaceful mental pictures
- Repeat: Same core message in new phrasing, "You are..." statements
- Ground: Return to body awareness, breath, weight, warmth
- Breathe: Guided breath cycle with [BREATHE] markers
- Transition: Gentle bridge, deepen relaxation` :

`**STORY SCENE STRUCTURE**:
- Setting: Rich sensory environment, NO action yet, just atmosphere
- Activity: Character does something peaceful (making tea, walking, reading) — describe in LOVING detail, focus on process not outcome
- Reflection: Character's peaceful thoughts, observations, contentment — NO problems to solve
- Transition: Natural movement to next setting, seamless flow`}

**WHAT TO NEVER INCLUDE**:
❌ Conflict, tension, danger, or stress
❌ Sudden sounds or events, surprises
❌ Complex problem-solving, puzzles, decisions
❌ Unresolved storylines or cliffhangers
❌ Energizing language ("exciting", "alert", "wake up", "energy")
❌ Time pressure, deadlines, rushing
❌ Negative emotions dwelt upon
❌ Questions requiring answers or active thinking
❌ Sudden tone changes

**PERMISSION & RELEASE PHRASES** (use liberally):
"You don't have to...", "There's no need to...", "It's okay to...", "Let yourself...", "Allow...", "Release...", "Let go of..."

**${isFirstBatch ? 'OPENING: Start with gentle welcome, physical settling cues, breathing exercise (3 slow breaths), then ease into content' : 'Continue seamlessly — maintain the deepening relaxation arc'}**
**${isLastBatch ? 'ENDING: This is the final section — content should be the gentlest, most sleep-inducing. End with: "Rest now... peaceful dreams... [PAUSE 10 SEC]" then fade to silence' : 'End this section by gently deepening relaxation, bridging naturally to the next theme'}**

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

**TARGET**: ~${batch.target_words} words of pure narration/voiceover text.

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

    // Detect script mode
    const scriptMode = project.project_mode && (project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story')
      ? project.project_mode
      : 'standard';
    const isSleepMode = scriptMode !== 'standard';

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

      const prompt = isSleepMode
        ? buildSleepWritingPrompt({ ...promptArgs, scriptMode })
        : buildStandardWritingPrompt(promptArgs);

      console.log(`[Batch ${batch.batch_number}] Generating ~${batch.target_words} words (${scriptMode})...`);

      // Sleep scripts use lower temperature for more consistent, soothing output
      const result = await callGemini(prompt, isSleepMode ? 0.65 : 0.85);

      const content = result.content || '';
      const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

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
    return Response.json({ error: error.message }, { status: 500 });
  }
});