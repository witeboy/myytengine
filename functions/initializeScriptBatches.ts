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

    // ── STORYTELLING FORMAT STRUCTURE ──
    const formatStructures = {
      'Big Lie': {
        acts: ['The Hook & The Lie', 'Building The Case', 'Cracks In The Story', 'The Truth Revealed', 'The Real Impact'],
        guidance: 'Start with a bold, widely-believed claim. Build evidence supporting it. Then systematically dismantle it with the shocking truth. End with why this matters.'
      },
      'Zero to Hero': {
        acts: ['The Humble Beginning', 'The Catalyst', 'The Struggle & Growth', 'The Breakthrough', 'The Legacy'],
        guidance: 'Start with the lowest point or most ordinary beginning. Show what triggered the journey. Detail the struggles and setbacks. Build to the triumph. End with lasting impact.'
      },
      'Timeline': {
        acts: ['The Origins', 'Early Development', 'The Turning Points', 'The Modern Era', 'The Future'],
        guidance: 'Start at the very beginning with rich historical context. Progress chronologically through key eras. Highlight pivotal moments that changed everything. Connect to the present and future.'
      },
      'Mystery': {
        acts: ['The Puzzle', 'The Clues', 'The Investigation', 'The Revelation', 'The Aftermath'],
        guidance: 'Open with an unsolved question or mystery. Present clues and red herrings. Build tension through investigation. Deliver a satisfying reveal. Show the consequences.'
      },
      'default': {
        acts: ['The Opening', 'Setting The Stage', 'The Core Story', 'The Climax', 'The Resolution'],
        guidance: 'Hook the viewer immediately. Provide essential context. Tell the main narrative with rising tension. Hit the emotional peak. Close with lasting impact.'
      }
    };

    const format = formatStructures[project.storytelling_format] || formatStructures['default'];

    // ── AI-GENERATED DETAILED OUTLINE ──
    const outlinePrompt = `You are a world-class YouTube documentary scriptwriter. You need to create a DETAILED outline for a ${durationMinutes}-minute documentary.

**Topic**: ${topic?.title || project.name}
**Topic Description**: ${topic?.description || 'No description available'}
**Niche**: ${project.niche || 'General'}
**Storytelling Format**: ${project.storytelling_format || 'Documentary'}
**Format Guidance**: ${format.guidance}
${selectedHook ? `**Opening Hook**: "${selectedHook.hook_text}"` : ''}

**Total Target**: ${totalTargetWords} words across ${numBatches} batches

The script will be split into ${numBatches} sequential batches. Each batch will be written separately, so the outline must give each batch enough detail to write ~${WORDS_PER_BATCH} words of rich narration.

Return JSON:
{
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "Short segment title (3-5 words)",
      "focus_area": "Brief focus description (1 sentence)",
      "synopsis": "EXTREMELY DETAILED synopsis for this batch. This must be 150-250 words covering: the exact narrative beats to hit, specific facts/events/anecdotes to include, the emotional tone and arc within this segment, key quotes or dialogue moments to weave in, how this segment opens and how it should end to transition to the next. The more detail here, the better the final script will be. Think of this as a mini-brief that a scriptwriter could use to write 1500 words of compelling narration WITHOUT needing any other reference material."
    }
  ]
}

**RULES:**
- Generate exactly ${numBatches} batches
- Batch 1 must open with a powerful hook that grabs attention in the first 10 seconds
${selectedHook ? `- Batch 1 MUST incorporate this hook: "${selectedHook.hook_text}"` : ''}
- Each synopsis must be 150-250 words of SPECIFIC detail — not vague descriptions
- Include specific facts, names, dates, numbers, anecdotes, and emotional beats in each synopsis
- Each batch should have a clear emotional arc (setup → tension → mini-payoff)
- The last batch must end with a strong conclusion and call to action
- Ensure narrative continuity — each batch should flow naturally into the next
- The overall story should follow the "${project.storytelling_format || 'Documentary'}" format
- Cover the COMPLETE story — do not leave major aspects unaddressed
- Distribute the most compelling/dramatic content across batches, don't front-load everything`;

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