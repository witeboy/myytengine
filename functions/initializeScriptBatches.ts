import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Calculate per-batch word targets (last batch gets the remainder)
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
    console.log(`Batch targets: ${batchTargets.join(', ')}`);

    // ── TVF (TL VIRAL FORMULA) — 8 PHASES ──
    // These phases are the backbone of every viral script.
    // The AI will map them across however many batches the duration requires.
    const TVF_PHASES = [
      { phase: 'HOOK', purpose: 'Open with a powerful attention trigger — shocking statement, contrarian truth, bold question, dramatic result, or hidden secret. The viewer must immediately think: "I need to hear this." This is the most critical 5-10 seconds.' },
      { phase: 'RELATABLE SITUATION', purpose: 'Describe a moment the audience recognizes from real life — a mistake, frustration, confusing situation, or hidden problem they did not notice. This creates deep psychological connection and makes viewers feel personally involved.' },
      { phase: 'TENSION / CURIOSITY GAP', purpose: 'Reveal that something is misunderstood or hidden. Use patterns like "But here is what nobody tells you..." or "Most people think this works… but it actually does the opposite." This is the engine that keeps viewers watching.' },
      { phase: 'INSIGHT / REFRAME', purpose: 'Introduce the key concept or realization. Explain WHY the problem exists. This is the "aha moment" — the viewer should feel their understanding shift. Make it feel like a revelation, not a lecture.' },
      { phase: 'PRACTICAL BREAKDOWN', purpose: 'Provide actionable steps, strategies, or lessons. Use step-by-step solutions, simple frameworks, real-world examples, comparisons, or quick demonstrations. Deliver concrete value the viewer can use immediately.' },
      { phase: 'TRANSFORMATION', purpose: 'Paint the outcome if the viewer applies the idea. Show the change arc: problem → solution → improvement. Make the viewer visualize their life being better. Use before/after contrast.' },
      { phase: 'POWER CLOSE', purpose: 'Deliver a memorable insight, warning, or perspective shift. This is the line viewers screenshot and share — a mindset change, hidden truth, or big-picture lesson that recontextualizes everything.' },
      { phase: 'CTA', purpose: 'Encourage the audience to continue engaging — watch another video, subscribe, apply the lesson, comment their experience. Make it feel like a natural extension of the story, not a bolt-on request.' },
    ];

    // Storytelling format still influences the FLAVOR of each phase
    const formatFlavors = {
      'Big Lie':     'Frame the HOOK around a widely-believed lie. The TENSION reveals cracks. The INSIGHT exposes the truth. The TRANSFORMATION shows life after knowing the truth.',
      'Zero to Hero': 'Frame the HOOK around the lowest point. The RELATABLE SITUATION is the struggle everyone relates to. The INSIGHT is the catalyst moment. The TRANSFORMATION is the triumphant rise.',
      'Timeline':    'Frame the HOOK around a pivotal historical moment. Progress chronologically through phases. The INSIGHT is the turning point that changed everything. The POWER CLOSE connects past to present.',
      'Mystery':     'Frame the HOOK as an unsolved puzzle. The TENSION builds through clues and red herrings. The INSIGHT is the revelation. The POWER CLOSE shows the aftermath and consequences.',
      'default':     'Use the standard TVF flow. Adapt tone to the niche. Focus on maximum curiosity and retention throughout.',
    };

    const formatFlavor = formatFlavors[project.storytelling_format] || formatFlavors['default'];

    // ── AI-GENERATED TVF OUTLINE ──
    const phasesText = TVF_PHASES.map((p, i) => `  ${i + 1}. ${p.phase}: ${p.purpose}`).join('\n');

    const outlinePrompt = `You are an elite viral content strategist and YouTube scriptwriter. You use the TL VIRAL FORMULA (TVF) — a proven 8-phase structure that maximizes curiosity, retention, and shareability.

**THE 8 TVF PHASES** (every script MUST hit all 8 in order):
${phasesText}

**STORYTELLING FLAVOR**: ${formatFlavor}

**PROJECT**:
- Topic: ${topic?.title || project.name}
- Topic Description: ${topic?.description || 'No description available'}
- Niche: ${project.niche || 'General'}
- Storytelling Format: ${project.storytelling_format || 'Documentary'}
- Duration: ${durationMinutes} minutes (~${totalTargetWords} words at 150 wpm)
${selectedHook ? `- Opening Hook (MUST USE): "${selectedHook.hook_text}"` : ''}

**YOUR TASK**: Map the 8 TVF phases across exactly ${numBatches} batches.

${numBatches <= 3 ? `With ${numBatches} batches, combine multiple phases per batch. Example: Batch 1 = HOOK + RELATABLE SITUATION + TENSION, Batch 2 = INSIGHT + PRACTICAL BREAKDOWN, Batch 3 = TRANSFORMATION + POWER CLOSE + CTA.` : 
numBatches <= 6 ? `With ${numBatches} batches, spread phases across batches. Some batches may cover 1-2 phases, giving room to go deep on each.` :
`With ${numBatches} batches, you have room to dedicate full batches to the meatiest phases (PRACTICAL BREAKDOWN, INSIGHT) while combining shorter phases (HOOK+RELATABLE, POWER CLOSE+CTA).`}

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words)",
      "tvf_phases": ["HOOK", "RELATABLE SITUATION"],
      "focus_area": "Brief focus description (1 sentence)",
      "synopsis": "EXTREMELY DETAILED synopsis (150-250 words). Must cover: exact narrative beats, specific facts/events/anecdotes, the emotional triggers to deploy (fear, curiosity, hope, urgency, surprise), how to create curiosity gaps within this batch, the pacing rhythm (when to be punchy vs flowing), specific 'scroll-stopping' moments to include, how this batch opens and how it ends with a cliffhanger or bridge to the next batch. Every sentence in the final script must EARN its place — no filler."
    }
  ]
}

**RULES:**
- Generate exactly ${numBatches} batches
- ALL 8 TVF phases must be covered across the batches — no phase skipped
- The tvf_phases array shows which phases each batch covers
${selectedHook ? `- Batch 1 MUST open with this hook: "${selectedHook.hook_text}"` : '- Batch 1 MUST open with the most powerful attention trigger possible — the viewer decides in 3 seconds'}
- Each synopsis must be 150-250 words of SPECIFIC, actionable detail
- Include specific emotional triggers for each batch: which emotions to hit and when
- Every batch must contain at least ONE curiosity gap (tease what comes next)
- Pacing mandate: mix punchy 3-7 word sentences with flowing 25-35 word ones
- The PRACTICAL BREAKDOWN phase must deliver REAL, actionable value — not vague advice
- The POWER CLOSE must contain a line worth screenshotting — a truth bomb or perspective shift
- Ensure narrative continuity — each batch ends with a hook pulling into the next
- The CTA must feel like a natural part of the story, not a bolted-on request
- No filler, no generic buzzwords, no "in today's video" — every word must earn its place`;

    console.log("Generating detailed outline...");
    const outlineResult = await callGemini(outlinePrompt, 0.7);

    if (!outlineResult.batches || outlineResult.batches.length === 0) {
      throw new Error("AI failed to generate outline batches");
    }

    // ── CREATE BATCH RECORDS ──
    const createdBatches = [];
    for (let i = 0; i < numBatches; i++) {
      // Use AI outline if available, otherwise fall back to format structure
      const aiBatch = outlineResult.batches[i];
      const fallbackAct = format.acts[i % format.acts.length];

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: aiBatch?.story_segment || fallbackAct,
        focus_area: aiBatch?.focus_area || fallbackAct,
        synopsis: aiBatch?.synopsis || `Write approximately ${batchTargets[i]} words covering: ${fallbackAct}. Include specific details, facts, and emotional narrative beats.`,
        target_words: batchTargets[i],
        status: 'pending'
      });
      createdBatches.push(batch);
    }

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