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

    const buildPrompt = (isRetry, existingContent, existingWordCount) => {
      let retryBlock = '';
      if (isRetry && existingContent) {
        retryBlock = `
**EXPANSION REQUIRED**: Previous attempt was only ${existingWordCount} words. Target is ${targetWords}. 
Expand the following by adding more details, examples, emotional depth, and elaboration:
"""
${existingContent}
"""
Write the COMPLETE expanded version.`;
      }

      return `You are rewriting a segment of a YouTube script for a NEW topic while preserving the EXACT same style, rhythm, emotion, and length.

**ORIGINAL SEGMENT** (${originalChunkWords} words — your rewrite MUST match this length):
"""
${originalChunk}
"""

**NEW TITLE**: "${synopsisData.new_title || 'New Video'}"
**SEGMENT**: ${batch.story_segment} — ${batch.focus_area}
**EMOTIONAL ARC**: ${synopsisData.emotional_arc || 'Match the original'}
**KEY BEATS**: ${synopsisData.key_beats || 'Preserve all narrative beats'}
**USER NOTES**: ${synopsisData.tweak_notes || 'None'}
**STYLE**: ${synopsisData.analysis_style || 'Match original'} | Tone: ${synopsisData.analysis_tone || 'Match original'} | Pacing: ${synopsisData.analysis_pacing || 'Match original'}
${batch.batch_number === 1 ? `**HOOK TECHNIQUE**: ${synopsisData.analysis_hook || 'Match original hook style'}` : ''}
${continuityInstruction}

**═══════════════════════════════════════════════════**
**WORD COUNT TARGET: EXACTLY ${targetWords} WORDS (±5%)**
**MINIMUM ACCEPTABLE: ${minimumWords} WORDS**
**═══════════════════════════════════════════════════**

**ORIGINALITY RULES**:
- STRIP all names, brands, companies, locations, channel references from the original
- REPLACE every example, anecdote, case study with COMPLETELY NEW ones for "${synopsisData.new_title}"
- The rewrite must be UNTRACEABLE to the original
- Preserve the SOUL: emotional journey, pacing DNA, rhetorical devices, energy signature
- Make completely NEW: all names, examples, statistics, dates, locations, anecdotes
${retryBlock}

**OUTPUT**: Write ONLY the spoken narration. No headers, no formatting, no meta-commentary. Pure script text.`;
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