import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function callGemini(prompt, temperature = 0.8) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 16384 }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates returned from Gemini");
  return data.candidates[0].content.parts[0].text;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, hook_id } = await req.json();

    // Fetch project
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Fetch topic
    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    // Fetch hook
    let hook = null;
    const effectiveHookId = hook_id || project.selected_hook_id;
    if (effectiveHookId) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: effectiveHookId });
      hook = hooks[0];
    }

    // Fetch batches for this project
    const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const batches = allBatches.sort((a, b) => a.batch_number - b.batch_number);

    if (!batches.length) {
      return Response.json({ error: 'No outline batches found. Generate outline first.' }, { status: 400 });
    }

    // Delete any old scripts for this project
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    for (const s of oldScripts) {
      await base44.asServiceRole.entities.Scripts.delete(s.id);
    }

    // Generate content for each batch sequentially
    let fullScript = "";
    let previousBatchSummary = "";

    for (const batch of batches) {
      // Mark as generating
      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: "generating" });

      const synopsis = batch.synopsis || batch.focus_area;

      let hookInstruction = '';
      if (batch.batch_number === 1 && hook) {
        hookInstruction = `\n**OPENING HOOK (weave into the opening naturally)**: "${hook.hook_text}"`;
      }

      let continuityInstruction = '';
      if (previousBatchSummary) {
        continuityInstruction = `\n**Previous batch ended with**: ${previousBatchSummary}\nContinue seamlessly from where the previous batch left off.`;
      }

      const prompt = `You are writing batch ${batch.batch_number} of ${batches.length} for a ${project.video_duration_minutes}-minute YouTube documentary.

**Topic**: ${topic?.title || project.name}
**Topic Description**: ${topic?.description || ''}
**Niche**: ${project.niche}
**Tone**: ${project.tone || 'dramatic'}
**Storytelling Format**: ${project.storytelling_format || 'narrative'}${hookInstruction}${continuityInstruction}

**This Batch**: "${batch.story_segment}"
**Focus**: ${batch.focus_area}
**Synopsis**: ${synopsis}
**Target Word Count**: EXACTLY ~${batch.target_words || 1500} words (this is critical — you MUST write approximately ${batch.target_words || 1500} words for this batch)

**CRITICAL REQUIREMENTS**:
- You MUST write approximately ${batch.target_words || 1500} words. Do NOT write less. Count carefully.
- Write engaging narration with [SCENE: visual description] markers for scene changes
- Pacing: 140-150 words per minute of video
- Build emotional arc within this batch
- Write ONLY the narration text. No JSON, no labels, no metadata, no word counts.
${batch.batch_number < batches.length ? '- End with a hook/cliffhanger leading into the next segment' : '- End with a strong call to action and closing'}
${batch.batch_number === 1 ? '- Open strong to hook viewers in the first 10 seconds' : '- Continue naturally from the previous batch'}`;

      const content = await callGemini(prompt, 0.8);
      const wordCount = content.split(/\s+/).length;

      // Save a summary of the last ~50 words for continuity
      const words = content.split(/\s+/);
      previousBatchSummary = words.slice(Math.max(0, words.length - 50)).join(' ');

      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
        content,
        word_count: wordCount,
        status: "completed"
      });

      fullScript += content + "\n\n";
    }

    // Create script record from the COMBINED batch content
    const totalWords = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const script = await base44.asServiceRole.entities.Scripts.create({
      project_id,
      topic_id: project.selected_topic_id,
      version: "draft",
      title: topic?.title || project.name,
      full_script: fullScript.trim(),
      word_count: totalWords,
      estimated_duration_sec: Math.round((totalWords / 150) * 60)
    });

    // Update project
    await base44.asServiceRole.entities.Projects.update(project_id, {
      script_id: script.id,
      selected_hook_id: effectiveHookId,
      status: "script_complete",
      current_step: 4
    });

    return Response.json({
      success: true,
      script_id: script.id,
      total_words: totalWords,
      estimated_duration_sec: Math.round((totalWords / 150) * 60)
    });
  } catch (error) {
    console.error("generateFullScript error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});