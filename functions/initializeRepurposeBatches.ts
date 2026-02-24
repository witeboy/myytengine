import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Splits the original script into batches for repurpose rewriting.
// Each batch gets a chunk of the original + style instructions.

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
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, original_script, new_title, analysis, tweak_notes } = await req.json();
    if (!project_id || !original_script) {
      return Response.json({ error: 'Missing project_id or original_script' }, { status: 400 });
    }

    // Delete existing batches for this project
    const existingBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    for (const batch of existingBatches) {
      await base44.asServiceRole.entities.ScriptBatches.delete(batch.id);
    }

    // Calculate batch count based on original word count
    const originalWords = original_script.split(/\s+/).filter(w => w.length > 0);
    const totalWords = originalWords.length;
    const WORDS_PER_BATCH = 1500;
    const numBatches = Math.max(2, Math.ceil(totalWords / WORDS_PER_BATCH));
    const wordsPerBatch = Math.ceil(totalWords / numBatches);

    console.log(`Repurpose batches: ${totalWords} words → ${numBatches} batches @ ~${wordsPerBatch} words each`);

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
TOTAL WORDS: ${totalWords}

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
      const result = await callGemini(outlinePrompt, 0.6);
      segments = result.segments || [];
    } catch (e) {
      console.warn('Outline generation failed, using defaults:', e.message);
    }

    // Create batch records
    const createdBatches = [];
    for (let i = 0; i < numBatches; i++) {
      const seg = segments[i];
      const chunkWordCount = originalChunks[i]?.split(/\s+/).filter(w => w.length > 0).length || wordsPerBatch;

      const batch = await base44.asServiceRole.entities.ScriptBatches.create({
        project_id,
        batch_number: i + 1,
        story_segment: seg?.story_segment || `Segment ${i + 1}`,
        focus_area: seg?.focus_area || `Part ${i + 1} of the repurposed script`,
        synopsis: JSON.stringify({
          original_chunk: originalChunks[i] || '',
          emotional_arc: seg?.emotional_arc || '',
          key_beats: seg?.key_beats || '',
          new_title,
          tweak_notes: tweak_notes || '',
          analysis_style: analysis?.script_style || '',
          analysis_tone: analysis?.tone_description || '',
          analysis_pacing: analysis?.pacing || '',
          analysis_hook: analysis?.hook_technique || '',
        }),
        target_words: chunkWordCount,
        status: 'pending',
      });
      createdBatches.push(batch);
    }

    console.log(`Created ${createdBatches.length} repurpose batches`);

    return Response.json({
      success: true,
      batches_created: createdBatches.length,
      total_target_words: totalWords,
      batches: createdBatches,
    });
  } catch (error) {
    console.error('initializeRepurposeBatches error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});