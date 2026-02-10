import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { 
            temperature, 
            maxOutputTokens: 8192
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Gemini returned no candidates.");
    }

    const text = data.candidates[0].content.parts[0].text;
    return { success: true, text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
     const { project_id, selected_hook_id } = body;

     // Get project details
     const projects = await base44.asServiceRole.entities.Projects.list();
     const project = projects.find(p => p.id === project_id);

     if (!project) {
       return Response.json({ error: 'Project not found' }, { status: 404 });
     }

     // Get topic
     const topics = await base44.asServiceRole.entities.Topics.list();
     const topic = topics.find(t => t.id === project.selected_topic_id);

     // Get selected hook if provided
     let selectedHook = null;
     if (selected_hook_id) {
       const hooks = await base44.asServiceRole.entities.Hooks.list();
       selectedHook = hooks.find(h => h.id === selected_hook_id);
     }

    // Get batches created by generateOutline
    const allBatches = await base44.asServiceRole.entities.ScriptBatches.list();
    let batches = allBatches
      .filter(b => b.project_id === project_id)
      .sort((a, b) => a.batch_number - b.batch_number);

    // If no batches exist from generateOutline, initialize them
    if (batches.length === 0) {
      const initResult = await base44.asServiceRole.functions.invoke('initializeScriptBatches', {
        project_id: project_id,
      });
      batches = initResult.data?.batches || [];
      
      if (batches.length === 0) {
        return Response.json({ error: 'No batches found' }, { status: 404 });
      }
    }

    // Generate each batch
    let previousContent = "";
    let fullScript = "";

    for (const batch of batches) {
      // Update status to generating
      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
        status: "generating"
      });

      const synopsis = batch.synopsis || batch.focus_area;
      const previousSynopsis = batches[batches.findIndex(b => b.id === batch.id) - 1]?.synopsis || '';
      
      let hookInstruction = '';
      if (batch.batch_number === 1 && selectedHook) {
        hookInstruction = `\n**OPENING HOOK (MUST INCLUDE)**: "${selectedHook.hook_text}"\nEnsure this hook appears naturally at the very beginning of batch 1 to grab viewer attention immediately.`;
      }

      const prompt = `You are writing batch ${batch.batch_number} of ${batches.length} for a ${project.video_duration_minutes}-minute YouTube documentary in "${project.storytelling_format}" format.

**Topic**: ${topic.title}
**Topic Description**: ${topic.description}
**Niche**: ${project.niche}
${hookInstruction}

**BATCH SYNOPSIS & CONTEXT**:
${synopsis}

${previousSynopsis ? `**Previous Batch Context**: ${previousSynopsis}` : ''}

**This Batch**: ${batch.story_segment}
**Focus Areas**: ${batch.focus_area}
**Target Word Count**: ~${batch.target_words || 1500} words (${Math.round((batch.target_words || 1500) / 150)} minutes)

**Narrative Requirements**:
- Match the established tone, cadence, and character perspective from earlier batches
- Maintain consistent pacing: 140-150 words per minute
- Develop emotional arc: build curiosity, tension, then payoff
- Each paragraph = one visual scene [SCENE: description]
- Use dramatic pauses and strategic emphasis on key terms
- End with hook to next segment (except final batch)
- Keep character/subject voice consistent throughout

Write ONLY the narration for this batch. Do not include JSON, labels, or metadata.`;

      const result = await safeGeminiCall(prompt, 0.8);

      if (!result.success) {
        await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
          status: "pending"
        });
        return Response.json({ error: result.error }, { status: 500 });
      }

      const content = result.text;
      const wordCount = content.split(/\s+/).length;

      // Update batch with content
      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
        content: content,
        word_count: wordCount,
        status: "completed"
      });

      fullScript += content + "\n\n";
      previousContent = content;
    }

    // Create final script
    const totalWords = fullScript.split(/\s+/).length;
    const estimatedDuration = Math.round((totalWords / 150) * 60);

    const script = await base44.asServiceRole.entities.Scripts.create({
      project_id: project_id,
      topic_id: project.selected_topic_id,
      version: "draft",
      title: topic.title,
      full_script: fullScript,
      word_count: totalWords,
      estimated_duration_sec: estimatedDuration
    });

    // Update project
    await base44.asServiceRole.entities.Projects.update(project_id, {
      script_id: script.id,
      status: "scripting",
      current_step: 4
    });

    return Response.json({ 
      success: true, 
      script_id: script.id,
      total_words: totalWords,
      estimated_duration_sec: estimatedDuration
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});