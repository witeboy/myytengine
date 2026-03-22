import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");

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
1. Gently introduce the theme through imagery (NOT by naming or defining it)
2. State the core affirmation: "You are enough... you are enough..."
3. Elaborate with nature scenes and sensory details
4. Restate the affirmation in new words: "You are whole... complete... just as you are..."
5. Ground in body awareness: breath, weight, warmth
6. [BREATHE] cycle
7. Gentle bridge deeper into relaxation

AFFIRMATION FORMAT: State simply → pause → restate → pause → elaborate with imagery → pause → restate again. Do NOT explain WHY the affirmation matters. Just say it, softly, repeatedly.` :

`**STORY SCENE STRUCTURE**:
1. Set the atmosphere: rich sensory details, no action yet
2. Peaceful activity: character does something calming (making tea, walking a path, watching rain) — describe every small detail lovingly
3. Reflection: character's quiet contentment, simple observations
4. Seamless transition to the next scene`}

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
      const baseTemp = isSleepMode ? 0.65 : 0.85;
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

Write EXACTLY ${wordsNeeded} MORE words continuing this section. Maintain the same tone, style, and pacing. ${isSleepMode ? 'Add more repetition, more imagery, more [PAUSE] markers, more sensory grounding.' : 'Add more detail, more anecdotes, more specific examples, more emotional beats.'}

Return JSON:
{"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
        }

        const result = await callClaude(currentPrompt, baseTemp);
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});