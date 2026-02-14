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

      // Re-fetch batches after initialization
      const updatedBatches = await base44.asServiceRole.entities.ScriptBatches.list();
      batches = updatedBatches
        .filter(b => b.project_id === project_id)
        .sort((a, b) => a.batch_number - b.batch_number);

      if (batches.length === 0) {
        return Response.json({ error: 'No batches found after initialization' }, { status: 404 });
      }
    }

    // Generate each batch sequentially with continuity context
    let previousBatchEnding = "";
    let fullScript = "";

    for (const batch of batches) {
      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
        status: "generating"
      });

      const synopsis = batch.synopsis || batch.focus_area;
      const prevBatch = batches[batches.findIndex(b => b.id === batch.id) - 1];
      const nextBatch = batches[batches.findIndex(b => b.id === batch.id) + 1];
      
      let hookInstruction = '';
      if (batch.batch_number === 1 && selectedHook) {
        hookInstruction = `\n**OPENING HOOK (MUST INCLUDE)**: "${selectedHook.hook_text}"\nEnsure this hook appears naturally at the very beginning of batch 1 to grab viewer attention immediately.`;
      }

      let continuityInstruction = '';
      if (previousBatchEnding) {
        continuityInstruction = `\n**CONTINUITY — the previous batch ended with these exact words**:\n"...${previousBatchEnding}"\nYou MUST continue seamlessly from this point. Do NOT repeat or paraphrase the ending above. Pick up the narrative naturally as if it's the same script flowing forward.\n`;
      }

      let nextBatchHint = '';
      if (nextBatch) {
        nextBatchHint = `\n**NEXT BATCH PREVIEW**: The next segment is "${nextBatch.story_segment}" focusing on "${nextBatch.focus_area}". End this batch with a natural bridge or hook leading into that topic.`;
      }

      const prompt = `You are writing batch ${batch.batch_number} of ${batches.length} for a ${project.video_duration_minutes}-minute YouTube documentary in "${project.storytelling_format}" format.

**Topic**: ${topic.title}
**Topic Description**: ${topic.description}
**Niche**: ${project.niche}
${hookInstruction}${continuityInstruction}

**BATCH SYNOPSIS & CONTEXT**:
${synopsis}

${prevBatch ? `**Previous Batch was about**: ${prevBatch.story_segment} — ${prevBatch.focus_area}` : ''}
${nextBatchHint}

**This Batch**: ${batch.story_segment}
**Focus Areas**: ${batch.focus_area}
**Target Word Count**: ~${batch.target_words || 1500} words (${Math.round((batch.target_words || 1500) / 150)} minutes)

**CRITICAL OUTPUT FORMAT**:
- Write ONLY the spoken narration text — the exact words the voiceover artist will read aloud.
- Do NOT include any scene directions, visual descriptions, stage directions, or camera cues.
- Do NOT include [SCENE: ...], [CUT TO: ...], [MUSIC: ...], [SOUND: ...] or any bracketed tags.
- Do NOT include labels like "Narrator:", "VO:", "Act 1", or any speaker/section labels.
- Do NOT include any metadata, JSON, or formatting instructions.
- Do NOT include timestamps like (0:00-2:00) or any time markers.
- Do NOT include **VISUAL:** descriptions, **AUDIO:** cues, or any production directions.
- Do NOT use markdown bold headers like **Act 1:** or **Opening:** — just write flowing narration.
- The output should be PURE narration text, paragraph by paragraph, ready to be converted directly to speech.

**Narrative Requirements**:
- Match the established tone, cadence, and character perspective from earlier batches
- Maintain consistent pacing: 140-150 words per minute
- Develop emotional arc: build curiosity, tension, then payoff
- Use dramatic pauses and strategic emphasis on key terms
- Write vivid, evocative language that paints pictures with words (since visuals will be added separately)
${batch.batch_number < batches.length ? '- End with a hook/cliffhanger leading into the next segment' : '- End with a strong call to action and closing'}
${batch.batch_number === 1 ? '- Open strong to hook viewers in the first 10 seconds' : '- Continue naturally and seamlessly from where the previous batch left off'}
- Keep character/subject voice consistent throughout`;

      const result = await safeGeminiCall(prompt, 0.8);

      if (!result.success) {
        await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
          status: "pending"
        });
        return Response.json({ error: result.error }, { status: 500 });
      }

      // Aggressively clean any residual non-narration content
      let content = result.text;
      // Remove bracketed tags: [SCENE: ...], [CUT TO: ...], [MUSIC: ...], etc.
      content = content.replace(/\[[^\]]*\]/gi, '');
      // Remove **VISUAL:** or **AUDIO:** or **MUSIC:** lines (with everything until next paragraph)
      content = content.replace(/\*\*(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|NOTE|DIRECTION|CAMERA|IMAGE)[:\s]?\*\*[^\n]*/gi, '');
      // Remove standalone visual/audio direction lines without bold markers
      content = content.replace(/^(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|CAMERA)\s*:.*$/gim, '');
      // Remove timestamp patterns like (0:00-2:00) or (0:00 - 2:00) or 0:00-2:00
      content = content.replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '');
      // Remove "Narrator:", "VO:", etc. labels
      content = content.replace(/^(Narrator|VO|Voiceover)\s*:\s*/gim, '');
      // Remove bold markdown headers like **Act 1:** or **Opening:**
      content = content.replace(/^\*\*[^*]+\*\*:?\s*$/gim, '');
      // Clean up extra blank lines
      content = content.replace(/\n{3,}/g, '\n\n').trim();
      const wordCount = content.split(/\s+/).length;

      // Save the last ~80 words for continuity into the next batch
      const words = content.split(/\s+/);
      previousBatchEnding = words.slice(Math.max(0, words.length - 80)).join(' ');

      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
        content: content,
        word_count: wordCount,
        status: "completed"
      });

      fullScript += content + "\n\n";
    }

    // Create or update draft script (avoid duplicates)
    const totalWords = fullScript.split(/\s+/).length;
    const estimatedDuration = Math.round((totalWords / 150) * 60);

    const existingScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id: project_id });
    const existingDraft = existingScripts.find(s => s.version === 'draft');

    let script;
    if (existingDraft) {
      await base44.asServiceRole.entities.Scripts.update(existingDraft.id, {
        full_script: fullScript,
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration,
        title: topic.title,
      });
      script = existingDraft;
    } else {
      script = await base44.asServiceRole.entities.Scripts.create({
        project_id: project_id,
        topic_id: project.selected_topic_id,
        version: "draft",
        title: topic.title,
        full_script: fullScript,
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration
      });
    }

    // Update project — mark as script_complete so the UI knows we're done
    await base44.asServiceRole.entities.Projects.update(project_id, {
      script_id: script.id,
      status: "script_complete",
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