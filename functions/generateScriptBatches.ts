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
            maxOutputTokens: 16384
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

function cleanNarration(text) {
  let content = text;
  // Remove bracketed tags: [SCENE: ...], [CUT TO: ...], [MUSIC: ...], etc.
  content = content.replace(/\[[^\]]*\]/gi, '');
  // Remove **VISUAL:** or **AUDIO:** or **MUSIC:** lines
  content = content.replace(/\*\*(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|NOTE|DIRECTION|CAMERA|IMAGE)[:\s]?\*\*[^\n]*/gi, '');
  // Remove standalone visual/audio direction lines
  content = content.replace(/^(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|CAMERA)\s*:.*$/gim, '');
  // Remove timestamp patterns
  content = content.replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '');
  // Remove "Narrator:", "VO:", etc. labels
  content = content.replace(/^(Narrator|VO|Voiceover)\s*:\s*/gim, '');
  // Remove bold markdown headers like **Act 1:** or **Opening:**
  content = content.replace(/^\*\*[^*]+\*\*:?\s*$/gim, '');
  // Remove any markdown formatting
  content = content.replace(/\*\*/g, '');
  content = content.replace(/\*/g, '');
  // Clean up extra blank lines
  content = content.replace(/\n{3,}/g, '\n\n').trim();
  return content;
}

function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
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
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get topic
    const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
    const topic = topics[0];
    if (!topic) return Response.json({ error: 'Topic not found' }, { status: 404 });

    // Get selected hook if provided
    let selectedHook = null;
    if (selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: selected_hook_id });
      selectedHook = hooks[0];
    }

// Delete any pre-existing scripts so the UI doesn't show stale previews
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    for (const s of oldScripts) {
      await base44.asServiceRole.entities.Scripts.delete(s.id);
    }

    // Get batches created by initializeScriptBatches
    let batches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    batches = batches.sort((a, b) => a.batch_number - b.batch_number);

    // If no batches exist, initialize them first
    if (batches.length === 0) {
      console.log("No batches found, initializing...");
      await base44.asServiceRole.functions.invoke('initializeScriptBatches', { project_id });

      batches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
      batches = batches.sort((a, b) => a.batch_number - b.batch_number);

      if (batches.length === 0) {
        return Response.json({ error: 'No batches found after initialization' }, { status: 404 });
      }
    }

    const totalBatches = batches.length;
    const durationMinutes = project.video_duration_minutes || 10;

    // Generate each batch sequentially with continuity context
    let previousBatchEnding = "";
    let fullScript = "";

    for (const batch of batches) {
      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: "generating" });

      const targetWords = batch.target_words || 1500;
      // Set a minimum acceptable threshold — at least 80% of target
      const minimumWords = Math.round(targetWords * 0.8);

      const batchIndex = batches.findIndex(b => b.id === batch.id);
      const prevBatch = batches[batchIndex - 1];
      const nextBatch = batches[batchIndex + 1];

      let hookInstruction = '';
      if (batch.batch_number === 1 && selectedHook) {
        hookInstruction = `\n**OPENING HOOK (MUST USE)**: "${selectedHook.hook_text}"
This hook MUST appear naturally in the very first paragraph to grab viewers instantly.`;
      }

      let continuityInstruction = '';
      if (previousBatchEnding) {
        continuityInstruction = `\n**CONTINUITY — the previous batch ended with these exact words**:
"...${previousBatchEnding}"

CRITICAL ANTI-REPETITION RULES:
1. Do NOT repeat, rephrase, summarize, or echo ANY sentence or idea from the ending above.
2. Do NOT re-introduce characters, concepts, or facts already established — the audience already heard them.
3. Start your narration with a BRAND NEW thought, fact, or narrative beat that moves the story FORWARD.
4. If the ending mentions a person/event/concept, do NOT re-explain it — reference it briefly and advance.
5. Imagine the ending above is the last sentence the audience just heard — your FIRST sentence must be the logical NEXT thought, not a recap.`;
      }

      let nextBatchHint = '';
      if (nextBatch) {
        nextBatchHint = `\n**WHAT COMES NEXT**: The next segment is "${nextBatch.story_segment}" about "${nextBatch.focus_area}". End this batch with a natural bridge, transition, or cliffhanger leading into that topic.`;
      }

      // Build the main prompt
      const buildPrompt = (isRetry, existingContent, existingWordCount) => {
        let retryBlock = '';
        if (isRetry && existingContent) {
          retryBlock = `
**IMPORTANT — EXPANSION REQUIRED**:
Your previous attempt was only ${existingWordCount} words. The target is ${targetWords} words. You need to write approximately ${targetWords - existingWordCount} MORE words.

Here is what you wrote before — you must EXPAND and ENRICH this, not replace it:
"""
${existingContent}
"""

Expand by:
- Adding more specific details, facts, and examples to each point
- Including additional anecdotes, stories, or case studies
- Deepening the emotional narrative with more descriptive language
- Adding more context, background, and implications
- Exploring sub-topics and tangents that enrich the main narrative
- Using more vivid imagery and sensory language

Write the COMPLETE expanded version (not just the additions).`;
        }

        const toneGuide = {
          dramatic: 'Use intense, high-stakes language. Build tension. Create urgency and emotional weight.',
          educational: 'Be clear, informative, and structured. Use facts and data. Explain concepts simply.',
          humorous: 'Be witty, playful, and entertaining. Use clever analogies, comedic timing, and self-aware commentary.',
          conversational: 'Write like talking to a friend. Use casual language, rhetorical questions, and relatable examples.',
          inspirational: 'Be uplifting and motivating. Use powerful imagery, success stories, and hopeful language.',
          suspenseful: 'Build mystery and anticipation. Use cliffhangers, reveals, and "what happens next" pacing.',
          sarcastic: 'Use dry wit, irony, and sharp observations. Be clever and cutting but not mean-spirited.',
        };
        const projectTone = project.tone || 'dramatic';
        const toneInstruction = toneGuide[projectTone] || toneGuide.dramatic;
        const audienceInstruction = project.target_audience ? `\n**Target Audience**: ${project.target_audience} — tailor vocabulary, references, and examples to resonate with this specific audience.` : '';

        return `You are writing batch ${batch.batch_number} of ${totalBatches} for a ${durationMinutes}-minute YouTube documentary.

**Topic**: ${topic.title}
**Topic Description**: ${topic.description}
**Niche**: ${project.niche}
**Storytelling Format**: ${project.storytelling_format || 'Documentary'}
**Tone**: ${projectTone} — ${toneInstruction}${audienceInstruction}
${hookInstruction}${continuityInstruction}
${nextBatchHint}

**THIS BATCH**:
- **Segment**: ${batch.story_segment}
- **Focus**: ${batch.focus_area}
- **Detailed Synopsis**: ${batch.synopsis || 'No synopsis available — write compelling narrative based on the focus area.'}

**═══════════════════════════════════════════════════**
**WORD COUNT TARGET: EXACTLY ${targetWords} WORDS**
**MINIMUM ACCEPTABLE: ${minimumWords} WORDS**
**═══════════════════════════════════════════════════**

This is NOT optional. Your output MUST contain at least ${minimumWords} words of narration. Count carefully. A ${targetWords}-word narration is approximately ${Math.round(targetWords / 250)} pages of text or ${Math.round(targetWords / 150)} minutes of spoken audio at 150 wpm.

To reach ${targetWords} words, you need approximately ${Math.round(targetWords / 100)} substantial paragraphs, each 80-120 words long.
${retryBlock}

**OUTPUT FORMAT — CRITICAL**:
- Write ONLY the spoken narration — the exact words a voiceover artist reads aloud.
- Do NOT include [SCENE:], [CUT TO:], [MUSIC:], or ANY bracketed directions.
- Do NOT include "Narrator:", "VO:", act labels, timestamps, or section headers.
- Do NOT include **bold headers** or any formatting — just flowing prose paragraphs.
- NO visual descriptions, camera directions, or production notes.
- PURE narration text only, paragraph by paragraph.

**WRITING QUALITY**:
- Pacing: 140-150 words per minute, natural speaking rhythm
- Use vivid, evocative language that paints pictures with words
- Build emotional arc within this segment: setup → tension → mini-payoff
- Include specific facts, names, dates, and numbers — not vague generalities
- Use rhetorical questions, dramatic pauses (short sentences), and callbacks
- Vary sentence length: mix punchy 5-word sentences with flowing 30-word ones
- Write for the EAR not the eye — use conversational language, contractions, natural phrasing
${batch.batch_number === 1 ? '- Open STRONG — the first 2 sentences must hook the viewer immediately' : '- Continue naturally from where the previous batch left off'}
${batch.batch_number === totalBatches ? '- End with a powerful conclusion and call to action (like, subscribe, comment)' : '- End with a hook or cliffhanger leading into the next segment'}
- Keep character/subject references consistent throughout

**ANTI-REPETITION**:
- NEVER repeat a sentence, phrase, or idea that appeared earlier in your own output.
- NEVER use the same opening structure for consecutive paragraphs.
- If you catch yourself restating something, DELETE it and write something new.
- Each paragraph must introduce at least ONE new fact, angle, or narrative development.
- Vary your paragraph openings: alternate between statements, questions, anecdotes, and descriptions.

**REMEMBER: You MUST write at least ${minimumWords} words. Write deep, rich, detailed narration. Do NOT rush through the synopsis — explore every beat thoroughly.**`;
      };

      // ── GENERATE WITH RETRY LOGIC ──
      let finalContent = '';
      let finalWordCount = 0;
      const MAX_ATTEMPTS = 3;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const isRetry = attempt > 1;
        const prompt = buildPrompt(isRetry, finalContent, finalWordCount);

        console.log(`Batch ${batch.batch_number}: attempt ${attempt}/${MAX_ATTEMPTS} (target: ${targetWords} words, min: ${minimumWords})...`);

        const result = await safeGeminiCall(prompt, 0.8);

        if (!result.success) {
          if (attempt === MAX_ATTEMPTS) {
            // If all attempts fail, mark as pending and abort
            await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: "pending" });
            return Response.json({ error: `Batch ${batch.batch_number} failed: ${result.error}` }, { status: 500 });
          }
          console.log(`Batch ${batch.batch_number} attempt ${attempt} failed, retrying...`);
          continue;
        }

        const cleaned = cleanNarration(result.text);
        const wordCount = countWords(cleaned);

        console.log(`Batch ${batch.batch_number} attempt ${attempt}: got ${wordCount} words`);

        // If this attempt is better than previous, keep it
        if (wordCount > finalWordCount) {
          finalContent = cleaned;
          finalWordCount = wordCount;
        }

        // If we hit the minimum threshold, we're good
        if (finalWordCount >= minimumWords) {
          console.log(`Batch ${batch.batch_number}: ✓ accepted with ${finalWordCount} words`);
          break;
        }

        // If still too short and we have retries left, try again
        if (attempt < MAX_ATTEMPTS) {
          console.log(`Batch ${batch.batch_number}: ${finalWordCount}/${minimumWords} words — retrying with expansion prompt...`);
        } else {
          // Out of retries — use what we have
          console.log(`Batch ${batch.batch_number}: accepting ${finalWordCount} words after ${MAX_ATTEMPTS} attempts`);
        }
      }

      // Save the last ~80 words for continuity
      const words = finalContent.split(/\s+/);
      previousBatchEnding = words.slice(Math.max(0, words.length - 80)).join(' ');

      await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
        content: finalContent,
        word_count: finalWordCount,
        status: "completed"
      });

      fullScript += finalContent + "\n\n";
    }

    // ── CREATE / UPDATE FINAL SCRIPT ──
    const totalWords = countWords(fullScript);
    const estimatedDuration = Math.round((totalWords / 150) * 60);

    const existingScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const existingDraft = existingScripts.find(s => s.version === 'draft');

    let script;
    if (existingDraft) {
      await base44.asServiceRole.entities.Scripts.update(existingDraft.id, {
        full_script: fullScript.trim(),
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration,
        title: topic.title,
      });
      script = existingDraft;
    } else {
      script = await base44.asServiceRole.entities.Scripts.create({
        project_id,
        topic_id: project.selected_topic_id,
        version: "draft",
        title: topic.title,
        full_script: fullScript.trim(),
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration
      });
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      script_id: script.id,
      status: "script_complete",
      current_step: 4
    });

    console.log(`Script complete! ${totalWords} words, ~${Math.round(estimatedDuration / 60)} min`);

    return Response.json({ 
      success: true, 
      script_id: script.id,
      total_words: totalWords,
      estimated_duration_sec: estimatedDuration
    });
  } catch (error) {
    console.error("generateScriptBatches error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});