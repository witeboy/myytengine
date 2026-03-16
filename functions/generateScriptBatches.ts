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

        return `You are an elite viral content strategist writing batch ${batch.batch_number} of ${totalBatches} for a ${durationMinutes}-minute YouTube video.

You follow the **TL VIRAL FORMULA (TVF)** — a battle-tested structure that keeps viewers glued from the first second to the last.

**TOPIC**: ${topic.title}
**TOPIC DESCRIPTION**: ${topic.description}
**NICHE**: ${project.niche}
**STORYTELLING FORMAT**: ${project.storytelling_format || 'Documentary'}
**TONE**: ${projectTone} — ${toneInstruction}${audienceInstruction}
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

**══════════════════════════════════════════════════════════**
**TVF VIRAL WRITING LAWS — FOLLOW EVERY SINGLE ONE**
**══════════════════════════════════════════════════════════**

**1. PACING IS KING**:
- Every sentence must EARN its place. If it does not move the story forward, create emotion, or deliver value — DELETE IT.
- Mix punchy 3-7 word power sentences with flowing 25-35 word narrative ones. Never write 3 long sentences in a row.
- After every major point, drop a SHORT sentence that hits like a punch: "And nobody saw it coming." / "That changed everything." / "But here is the part nobody talks about."
- Write for 150 wpm spoken delivery. Think RHYTHM — fast-slow-fast-slow. A rollercoaster, not a highway.

**2. CURIOSITY GAPS — THE RETENTION ENGINE**:
- Plant a curiosity gap every ~150-200 words. Tease what is coming without revealing it.
- Patterns: "But what happened next defies logic." / "And this is where the story takes a dark turn." / "There is one detail that changes everything — and we will get to it in a moment."
- The viewer should ALWAYS have an unanswered question pulling them forward. NEVER resolve everything before planting the next hook.

**3. EMOTIONAL TRIGGERS — MAKE THEM FEEL**:
- Rotate through: fear, curiosity, hope, urgency, surprise, outrage, empathy.
- Do NOT stay on one emotion for more than 2 paragraphs — SHIFT. The audience habituates to any single emotion. Keep them off-balance.
- Use "you" language to make it personal: "You have probably done this without realizing." / "Think about the last time you..."
- Include at least ONE moment that makes the viewer's stomach drop, laugh, or say "wait, what?"

**4. ZERO FILLER TOLERANCE**:
- BANNED phrases: "In today's video", "Without further ado", "Before we begin", "As we all know", "It goes without saying", "At the end of the day", "In this day and age".
- BANNED patterns: throat-clearing openings, summarizing what you are about to say, restating what you just said.
- Every paragraph must open with a DIFFERENT structure — statement, question, anecdote, statistic, quote, or vivid image. NEVER repeat the same opening pattern twice in a row.

**5. SPECIFICITY OVER GENERALITY**:
- Use specific facts, names, dates, numbers, and places. "A study from MIT in 2019 found that..." NOT "Studies show that..."
- Include micro-stories and anecdotes — real moments that the viewer can visualize. Not abstractions.
- When explaining a concept, use a concrete example within 2 sentences. Never explain for more than 3 sentences without grounding it in reality.

**6. THE SPOKEN WORD TEST**:
- Read every sentence aloud in your head. If it sounds like a textbook — rewrite it. If it sounds like a friend telling you something mind-blowing — keep it.
- Use contractions (don't, can't, won't, here's, that's). Write the way people TALK.
- Use rhetorical questions to create mental engagement: "So what happens when everything you believed turns out to be wrong?"

**7. SEGMENT-SPECIFIC RULES**:
${batch.batch_number === 1 ? `- You are writing the OPENING. The first 2 sentences must be an absolute scroll-stopper. No warm-up. No context-setting. Drop the viewer into the most compelling moment IMMEDIATELY.
- Within the first 50 words, the viewer must think: "I NEED to hear this."
- Use one of these hook types: shocking statement, contrarian truth, relatable scenario, bold question, dramatic result, countdown/urgency, or hidden secret.` : '- Continue naturally from where the previous batch left off. Your first sentence must be the logical NEXT thought — not a recap.'}
${batch.batch_number === totalBatches ? `- You are writing the FINALE. The last 3 paragraphs must deliver:
  (a) A POWER CLOSE — a memorable insight, truth bomb, or perspective shift that recontextualizes the entire video. This is the line viewers screenshot.
  (b) A TRANSFORMATION moment — show the viewer how their understanding has shifted from the beginning to now.
  (c) A NATURAL CTA — "If this changed how you think about [topic], hit subscribe because next week we are going deeper." Make it feel like a promise, not a plea.` : '- End with a CLIFFHANGER or BRIDGE — tease what comes next without resolving the current thread. The viewer should feel COMPELLED to keep watching.'}

**ANTI-REPETITION**:
- NEVER repeat a sentence, phrase, or idea that appeared earlier in your own output.
- NEVER use the same opening structure for consecutive paragraphs.
- If you catch yourself restating something, DELETE it and write something new.
- Each paragraph must introduce at least ONE new fact, angle, or narrative development.

**REMEMBER: You MUST write at least ${minimumWords} words. Write deep, rich, punchy, fast-paced narration that keeps viewers GLUED. Every sentence earns its place. Every paragraph moves the story forward. No filler. No fluff. Pure viral energy.**`;
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