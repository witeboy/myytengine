import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Generates a single repurpose batch — rewriting one chunk of the original script

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
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
    throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
  }

  const data = await response.json();
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("Gemini returned no candidates.");
  }

  return data.candidates[0].content.parts[0].text;
}

function cleanNarration(text) {
  let content = text;
  content = content.replace(/\[[^\]]*\]/gi, '');
  content = content.replace(/\*\*(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|NOTE|DIRECTION|CAMERA|IMAGE)[:\s]?\*\*[^\n]*/gi, '');
  content = content.replace(/^(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|CAMERA)\s*:.*$/gim, '');
  content = content.replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '');
  content = content.replace(/^(Narrator|VO|Voiceover)\s*:\s*/gim, '');
  content = content.replace(/^\*\*[^*]+\*\*:?\s*$/gim, '');
  content = content.replace(/\*\*/g, '').replace(/\*/g, '');
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
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { batch_id, previous_ending } = await req.json();
    if (!batch_id) return Response.json({ error: 'Missing batch_id' }, { status: 400 });

    // Get batch
    const batches = await base44.asServiceRole.entities.ScriptBatches.filter({ id: batch_id });
    const batch = batches[0];
    if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: 'generating' });

    // Parse synopsis (contains original chunk + style info)
    let synopsisData = {};
    try {
      synopsisData = JSON.parse(batch.synopsis || '{}');
    } catch (_) {
      synopsisData = { original_chunk: batch.synopsis || '' };
    }

    const originalChunk = synopsisData.original_chunk || '';
    const targetWords = batch.target_words || 1500;
    const minimumWords = Math.round(targetWords * 0.8);
    const originalChunkWords = countWords(originalChunk);

    let continuityInstruction = '';
    if (previous_ending) {
      continuityInstruction = `\n**CONTINUITY — the previous batch ended with**:
"...${previous_ending}"
Continue seamlessly from this point. Do NOT repeat or paraphrase the ending above.`;
    }

    const scaleFactor = synopsisData.scale_factor || 1;
    const isExpanding = scaleFactor > 1.1;
    const isCondensing = scaleFactor < 0.9;
    const scalePct = Math.round(Math.abs(scaleFactor - 1) * 100);
    const totalTargetWords = synopsisData.total_target_words || targetWords;
    const targetDurationMin = synopsisData.target_duration_minutes || Math.ceil(totalTargetWords / 150);

    let scaleInstruction = '';
    if (isExpanding) {
      scaleInstruction = `
**🔺 EXPANSION MODE (+${scalePct}%): Original is ${originalChunkWords} words → You must write ${targetWords} words.**
You are EXPANDING this segment. The user wants a LONGER video (${targetDurationMin} min).
HOW TO EXPAND (while keeping it compelling):
- Add MORE examples, case studies, and anecdotes (all NEW for "${synopsisData.new_title}")
- Deepen emotional moments — add inner monologue, sensory details, "imagine this" scenarios
- Expand transitions between ideas — add rhetorical questions, callbacks, foreshadowing
- Add "story within the story" — mini-narratives that illustrate each point
- Include more data points, comparisons, analogies that make concepts tangible
- Expand the hook/opening with additional tension-building lines (batch 1 only)
- Add "pause and reflect" moments — direct audience address ("Think about that for a second...")
- NEVER pad with filler or repetition — every added sentence must carry NEW information or emotion
- Maintain the SAME pacing rhythm — just more beats, not slower delivery`;
    } else if (isCondensing) {
      scaleInstruction = `
**🔻 CONDENSING MODE (-${scalePct}%): Original is ${originalChunkWords} words → You must write ${targetWords} words.**
You are CONDENSING this segment. The user wants a SHORTER video (${targetDurationMin} min).
HOW TO CONDENSE (while keeping maximum impact):
- Keep the STRONGEST hook, emotional peaks, and climax moments INTACT
- Merge multiple examples into the single most powerful one
- Cut setup/context that can be implied — get to the point faster
- Combine consecutive similar ideas into one punchy statement
- Remove redundant transitions — use sharper cuts between ideas
- Preserve the COMPLETE emotional arc (setup → tension → climax → resolution) but compress each phase
- Keep ALL rhetorical devices (questions, callbacks, reversals) — just fewer of them
- The opening hook and closing payoff must be FULL STRENGTH — condense the middle
- NEVER cut the emotional climax — that's the soul of the content`;
    } else {
      scaleInstruction = `
**= MATCHING LENGTH: Original is ${originalChunkWords} words → Target is ${targetWords} words (same length).**
Rewrite at approximately the same length, preserving all beats and pacing.`;
    }

    const buildPrompt = (isRetry, existingContent, existingWordCount) => {
      let retryBlock = '';
      if (isRetry && existingContent) {
        retryBlock = `
**WORD COUNT FIX REQUIRED**: Previous attempt was ${existingWordCount} words but target is ${targetWords}.
${existingWordCount < minimumWords ? 'EXPAND' : 'CONDENSE'} the following to hit EXACTLY ${targetWords} words:
"""
${existingContent}
"""
Write the COMPLETE ${existingWordCount < minimumWords ? 'expanded' : 'condensed'} version.`;
      }

      return `You are rewriting a segment of a YouTube script for a NEW topic while preserving the EXACT same style, emotion, storytelling DNA, and narrative structure.

**ORIGINAL SEGMENT** (${originalChunkWords} words):
"""
${originalChunk}
"""

**NEW TITLE**: "${synopsisData.new_title || 'New Video'}"
**TARGET DURATION**: ${targetDurationMin} minutes total video (this is batch ${batch.batch_number})
**SEGMENT**: ${batch.story_segment} — ${batch.focus_area}
**EMOTIONAL ARC**: ${synopsisData.emotional_arc || 'Match the original'}
**KEY BEATS**: ${synopsisData.key_beats || 'Preserve all narrative beats'}
**USER NOTES**: ${synopsisData.tweak_notes || 'None'}
**STYLE**: ${synopsisData.analysis_style || 'Match original'} | Tone: ${synopsisData.analysis_tone || 'Match original'} | Pacing: ${synopsisData.analysis_pacing || 'Match original'}
${batch.batch_number === 1 ? `**HOOK TECHNIQUE**: ${synopsisData.analysis_hook || 'Match original hook style — the hook MUST grab attention in the first 5 seconds'}` : ''}
${continuityInstruction}
${scaleInstruction}

**═══════════════════════════════════════════════════════════════**
**WORD COUNT TARGET: EXACTLY ${targetWords} WORDS (±5%)**
**MINIMUM ACCEPTABLE: ${minimumWords} WORDS**
**MAXIMUM ACCEPTABLE: ${Math.round(targetWords * 1.1)} WORDS**
**═══════════════════════════════════════════════════════════════**

**STORYTELLING RULES (non-negotiable regardless of length)**:
- HOOK: ${batch.batch_number === 1 ? 'Open with a powerful hook that creates immediate curiosity or emotional tension. Match the original hook technique.' : 'Continue the momentum from the previous section.'}
- EMOTIONAL ARC: Every segment must have its own mini arc — setup → tension → payoff
- CLIMAX PRESERVATION: If this segment contains the emotional peak, give it FULL POWER — never rush or flatten the climax
- SHOW DON'T TELL: Use sensory details, specific imagery, and "put yourself there" language
- PACING RHYTHM: Short punchy sentences for tension. Longer flowing sentences for reflection. Match the original's rhythm DNA.
- CALLBACKS: Reference earlier elements to create cohesion
- AUDIENCE CONNECTION: Direct address ("you"), rhetorical questions, "imagine" prompts

**ORIGINALITY RULES**:
- STRIP all names, brands, companies, locations, channel references from the original
- REPLACE every example, anecdote, case study with COMPLETELY NEW ones for "${synopsisData.new_title}"
- The rewrite must be UNTRACEABLE to the original
- Preserve the SOUL: emotional journey, pacing DNA, rhetorical devices, energy signature
- Make completely NEW: all names, examples, statistics, dates, locations, anecdotes
${retryBlock}

**OUTPUT**: Write ONLY the spoken narration. No headers, no formatting, no meta-commentary. Pure script text that sounds natural when read aloud at 150 words per minute.`;
    };

    // Generate with retry logic
    let finalContent = '';
    let finalWordCount = 0;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const isRetry = attempt > 1;
      const prompt = buildPrompt(isRetry, finalContent, finalWordCount);

      console.log(`Batch ${batch.batch_number}: attempt ${attempt}/${MAX_ATTEMPTS} (target: ${targetWords}, min: ${minimumWords})...`);

      const rawText = await safeGeminiCall(prompt, 0.8);
      const cleaned = cleanNarration(rawText);
      const wordCount = countWords(cleaned);

      console.log(`Batch ${batch.batch_number} attempt ${attempt}: got ${wordCount} words`);

      if (wordCount > finalWordCount) {
        finalContent = cleaned;
        finalWordCount = wordCount;
      }

      if (finalWordCount >= minimumWords) {
        console.log(`Batch ${batch.batch_number}: ✓ accepted with ${finalWordCount} words`);
        break;
      }

      if (attempt < MAX_ATTEMPTS) {
        console.log(`Batch ${batch.batch_number}: ${finalWordCount}/${minimumWords} — retrying...`);
      }
    }

    // Save
    const words = finalContent.split(/\s+/);
    const ending = words.slice(Math.max(0, words.length - 80)).join(' ');

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
      content: finalContent,
      word_count: finalWordCount,
      status: 'completed',
    });

    return Response.json({
      success: true,
      batch_number: batch.batch_number,
      word_count: finalWordCount,
      target_words: targetWords,
      ending,
    });
  } catch (error) {
    console.error('generateRepurposeBatch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});