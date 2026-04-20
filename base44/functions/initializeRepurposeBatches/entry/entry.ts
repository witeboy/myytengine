import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Splits the original script into batches for repurpose rewriting.
// Each batch gets a chunk of the original + style instructions.

async function callLLM(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a world-class scriptwriter and content strategist. Always respond in valid JSON only. No markdown, no code fences, no commentary." },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: 8192,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenAI error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("No content in OpenAI response");

  try { return JSON.parse(text); } catch (_) {}
  // Fallback: extract JSON from fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return JSON.parse(fenceMatch[1].trim());
  throw new Error("Failed to parse OpenAI JSON");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, original_script, new_title, analysis, tweak_notes, target_duration_minutes, target_total_words } = await req.json();
    if (!project_id || !original_script) {
      return Response.json({ error: 'Missing project_id or original_script' }, { status: 400 });
    }

    // Delete existing batches for this project
    const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const batch of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
    }

    // Calculate target word count from user-specified duration (150 wpm benchmark)
    const originalWords = original_script.split(/\s+/).filter(w => w.length > 0);
    const originalTotalWords = originalWords.length;
    const finalTargetWords = target_total_words || originalTotalWords; // fallback to original length
    const scaleFactor = finalTargetWords / Math.max(originalTotalWords, 1); // e.g. 1.5 = expand 50%, 0.5 = condense 50%

    const WORDS_PER_BATCH = 1500;
    const numBatches = Math.max(2, Math.ceil(finalTargetWords / WORDS_PER_BATCH));
    const wordsPerBatch = Math.ceil(finalTargetWords / numBatches);

    const targetDurationMin = target_duration_minutes || Math.ceil(originalTotalWords / 150);
    const scalePct = Math.round((scaleFactor - 1) * 100);
    const scaleLabel = scalePct > 0 ? `expanding +${scalePct}%` : scalePct < 0 ? `condensing ${scalePct}%` : 'same length';
    console.log(`Repurpose: ${originalTotalWords} original → ${finalTargetWords} target (${scaleLabel}) → ${numBatches} batches @ ~${wordsPerBatch} words`);

    // Split original script into chunks for each batch
    const sentences = original_script.match(/[^.!?]+[.!?]+[\s]*/g) || [original_script];
    const sentencesPerBatch = Math.ceil(sentences.length / numBatches);

    const originalChunks = [];
    for (let i = 0; i < numBatches; i++) {
      const start = i * sentencesPerBatch;
      const end = Math.min((i + 1) * sentencesPerBatch, sentences.length);
      originalChunks.push(sentences.slice(start, end).join('').trim());
    }

    // Ask AI to create segment descriptions for each chunk
    const outlinePrompt = `You are analyzing a script that has been split into ${numBatches} segments for rewriting.

ORIGINAL TITLE: "${analysis?.title || 'Unknown'}"
NEW TITLE: "${new_title}"
NICHE: ${analysis?.niche || 'General'}
TOTAL WORDS: ${originalTotalWords}

For each of the ${numBatches} segments below, provide a brief description of what that segment covers and the emotional arc within it.

${originalChunks.map((chunk, i) => `SEGMENT ${i + 1} (${chunk.split(/\s+/).length} words):\n"${chunk.substring(0, 500)}..."`).join('\n\n')}

Return JSON:
{
  "segments": [
    {
      "segment_number": 1,
      "story_segment": "Short title (3-5 words)",
      "focus_area": "Brief description of what this segment covers",
      "emotional_arc": "The emotional journey within this segment",
      "key_beats": "Main narrative beats to preserve"
    }
  ]
}

Generate exactly ${numBatches} segments.`;

    let segments = [];
    try {
      const result = await callLLM(outlinePrompt, 0.6);
      segments = result.segments || [];
    } catch (e) {
      console.warn('Outline generation failed, using defaults:', e.message);
    }

    // Create batch records — each batch gets scaled target word count
    const createdBatches = [];
    for (let i = 0; i < numBatches; i++) {
      const seg = segments[i];
      const originalChunkWords = originalChunks[i]?.split(/\s+/).filter(w => w.length > 0).length || 0;
      // Scale this chunk proportionally to hit overall target
      const scaledTarget = Math.round(originalChunkWords * scaleFactor) || wordsPerBatch;
      // Clamp between reasonable bounds
      const batchTarget = Math.max(200, Math.min(3000, scaledTarget));

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: seg?.story_segment || `Segment ${i + 1}`,
        focus_area: seg?.focus_area || `Part ${i + 1} of the repurposed script`,
        synopsis: JSON.stringify({
          original_chunk: originalChunks[i] || '',
          original_chunk_words: originalChunkWords,
          emotional_arc: seg?.emotional_arc || '',
          key_beats: seg?.key_beats || '',
          new_title,
          tweak_notes: tweak_notes || '',
          analysis_style: analysis?.script_style || '',
          analysis_tone: analysis?.tone_description || '',
          analysis_pacing: analysis?.pacing || '',
          analysis_hook: analysis?.hook_technique || '',
          scale_factor: scaleFactor,
          target_duration_minutes: targetDurationMin,
          total_target_words: finalTargetWords,
        }),
        target_words: batchTarget,
        status: 'pending',
      });
      createdBatches.push(batch);
    }

    console.log(`Created ${createdBatches.length} repurpose batches`);

    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      original_words: originalTotalWords,
      total_target_words: finalTargetWords,
      scale_factor: scaleFactor,
      target_duration_minutes: targetDurationMin,
      batches: createdBatches,
    });
  } catch (error) {
    console.error('initializeRepurposeBatches error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});