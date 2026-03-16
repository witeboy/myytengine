import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function callGemini(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: "application/json" }
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
  return JSON.parse(rawText);
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

    // Get selected hook if any
    let selectedHook = null;
    if (project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0];
    }

    // Get channel script strategy if available
    let scriptStrategy = '';
    if (project.script_strategy_override) {
      scriptStrategy = project.script_strategy_override;
    } else if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      if (channels[0]?.script_strategy) {
        scriptStrategy = channels[0].script_strategy;
      }
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

    // ── CALCULATE BATCH COUNT ──
    const durationMinutes = project.video_duration_minutes || 10;
    const totalTargetWords = Math.round(durationMinutes * 150);
    const WORDS_PER_BATCH = 1500;
    const numBatches = Math.max(2, Math.ceil(totalTargetWords / WORDS_PER_BATCH));

    const batchTargets = [];
    let wordsRemaining = totalTargetWords;
    for (let i = 0; i < numBatches; i++) {
      if (i === numBatches - 1) {
        batchTargets.push(wordsRemaining);
      } else {
        batchTargets.push(WORDS_PER_BATCH);
        wordsRemaining -= WORDS_PER_BATCH;
      }
    }

    console.log(`Project: ${durationMinutes} min → ${totalTargetWords} words → ${numBatches} batches`);

    // ── TVF (TL VIRAL FORMULA) — 8 PHASES ──
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
      'Big Lie':     'Frame the HOOK around a widely-believed lie. The TENSION reveals cracks. The INSIGHT exposes the truth.',
      'Zero to Hero': 'Frame the HOOK around the lowest point. The INSIGHT is the catalyst moment. The TRANSFORMATION is the triumphant rise.',
      'Timeline':    'Frame the HOOK around a pivotal historical moment. Progress chronologically. The INSIGHT is the turning point.',
      'Mystery':     'Frame the HOOK as an unsolved puzzle. The TENSION builds through clues. The INSIGHT is the revelation.',
      'default':     'Use the standard TVF flow. Adapt tone to the niche. Focus on maximum curiosity and retention throughout.',
    };

    const formatFlavor = formatFlavors[project.storytelling_format] || formatFlavors['default'];
    const phasesText = TVF_PHASES.map((p, i) => `  ${i + 1}. ${p.phase}: ${p.purpose}`).join('\n');

    const outlinePrompt = `You are an elite viral content strategist and YouTube scriptwriter using the TL VIRAL FORMULA (TVF).

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
${selectedHook ? `- Batch 1 MUST open with this hook: "${selectedHook.hook_text}"` : '- Batch 1 MUST open with the most powerful attention trigger possible'}
- Each synopsis: 150-250 words of SPECIFIC detail
- Every batch must contain at least ONE curiosity gap
- Ensure narrative continuity — each batch ends with a hook into the next
- No filler, no generic buzzwords, no "in today's video"`;

    console.log("Generating detailed outline...");
    const outlineResult = await callGemini(outlinePrompt, 0.7);

    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error("AI failed to generate outline batches");
    }

    // ── CREATE BATCH RECORDS ──
    const createdBatches = [];
    for (let i = 0; i < numBatches; i++) {
      const aiBatch = outlineResult.batches[i];
      const fallbackSegment = `Part ${i + 1}`;

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: aiBatch?.story_segment || fallbackSegment,
        focus_area: aiBatch?.focus_area || fallbackSegment,
        synopsis: aiBatch?.synopsis || `Write approximately ${batchTargets[i]} words for part ${i + 1}. Include specific details, facts, and emotional narrative beats.`,
        target_words: batchTargets[i],
        status: 'pending'
      });
      createdBatches.push(batch);
    }

    // Update project status
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3
    });

    console.log(`Created ${createdBatches.length} batches with detailed outlines`);

    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      total_target_words: totalTargetWords,
      duration_minutes: durationMinutes,
      batches: createdBatches
    });
  } catch (error) {
    console.error('Error initializing batches:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});