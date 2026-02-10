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
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
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
      throw new Error("Gemini returned no candidates. Possibly content filtered.");
    }

    const text = data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(text);

    return { success: true, data: parsed, raw: text };
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
    const { project_id, topic_id, topic_title, niche, duration_minutes } = body;

    const storytellingFormats = {
      "S": ["Big Lie", "Untold Truth", "Domino", "Reveal"],
      "A": ["Top to Bottom", "Zero to Hero", "Turning Point", "Bounce Back"],
      "B": ["Glow Up", "Timeline", "Lesson", "Two Paths", "Forgotten One"],
      "C": ["Origin Story", "Chase"],
      "D": ["Discovery", "Broke to Rich"]
    };

    const totalWords = duration_minutes * 150;
    const numBatches = Math.max(2, Math.round(totalWords / 1500));
    const wordsPerBatch = Math.floor(totalWords / numBatches);

    const batchStructures = {
      2: [
        { segment: "The Hook & Deep Dive", focus: "Establish atmosphere, introduce topic, key facts and backstory" },
        { segment: "The Climax & Resolution", focus: "Peak revelation, aftermath, and Call to Action" }
      ],
      3: [
        { segment: "The Hook & Inciting Incident", focus: "Establish atmosphere, introduce topic, end on major discovery" },
        { segment: "The Deep Dive & Complication", focus: "Backstory, investigation, midpoint twist" },
        { segment: "The Climax & Resolution", focus: "Peak moment, aftermath, and Call to Action" }
      ],
      4: [
        { segment: "The Hook & Inciting Incident", focus: "Establish atmosphere, introduce topic, end on major discovery" },
        { segment: "The Deep Dive", focus: "Backstory, investigation, introduce obstacles" },
        { segment: "The Complication & Climax", focus: "Midpoint twist and final confrontation" },
        { segment: "The Resolution & Outro", focus: "Aftermath, lessons learned, and Call to Action" }
      ],
      5: [
        { segment: "The Hook & Inciting Incident", focus: "Establish atmosphere, introduce victim/protagonist, end on Big Discovery" },
        { segment: "The Deep Dive", focus: "Backstory, early investigation, introduce suspects or obstacles" },
        { segment: "The Complication", focus: "Midpoint Twist - information that changes everything" },
        { segment: "The Climax", focus: "Final confrontation, aha moment, or high-intensity peak" },
        { segment: "The Resolution & Outro", focus: "Aftermath, legal results, lessons learned, and Call to Action" }
      ]
    };

    const batchesList = batchStructures[numBatches] || batchStructures[5];

    const batchJson = batchesList.map((batch, i) => `{"batch_number": ${i + 1}, "story_segment": "${batch.segment}", "focus_area": "${batch.focus}", "target_words": ${wordsPerBatch}}`).join(',');

    const prompt = `You are a YouTube documentary expert. Create a detailed outline for a ${duration_minutes}-minute video about "${topic_title}" in the ${niche} niche.

    STORYTELLING FORMATS (by tier):
    S-Tier: ${storytellingFormats.S.join(', ')}
    A-Tier: ${storytellingFormats.A.join(', ')}
    B-Tier: ${storytellingFormats.B.join(', ')}
    C-Tier: ${storytellingFormats.C.join(', ')}
    D-Tier: ${storytellingFormats.D.join(', ')}

    Instructions:
    1. Select the BEST storytelling format from the list above that fits this topic
    2. Create ${numBatches} batches, each ~${wordsPerBatch} words (150 words = 1 minute of video)
    3. Total script: ${totalWords} words for a ${duration_minutes}-minute video
    4. Follow the universal story structure: Hook → Deep Dive → Complication → Climax → Resolution
    5. For EACH batch, write a detailed 2-paragraph synopsis covering:
       - Paragraph 1: Plot points, key information, characters/subjects, emotional arc, and specific scenes
       - Paragraph 2: Pacing style, tone, narrative voice, transitions, and how this batch connects to surrounding batches
    6. Batch 1 MUST be titled with the hook/opening line that grabs attention

    Return ONLY valid JSON (no line breaks in strings):
    {"storytelling_format": "Selected Format Name", "total_target_words": ${totalWords}, "batches": [{"batch_number": 1, "story_segment": "[THE HOOK] Opening Line", "focus_area": "What this batch focuses on", "target_words": ${wordsPerBatch}, "synopsis": "PARAGRAPH 1: ... PARAGRAPH 2: ..."}]}`;

    const result = await safeGeminiCall(prompt, 0.7);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const outline = result.data;

    // Create batch records with synopses
    for (const batch of outline.batches) {
      await base44.asServiceRole.entities.ScriptBatches.create({
        project_id: project_id,
        batch_number: batch.batch_number,
        story_segment: batch.story_segment,
        focus_area: batch.focus_area,
        synopsis: batch.synopsis || batch.focus_area,
        status: "pending"
      });
    }

    // Update project
    await base44.asServiceRole.entities.Projects.update(project_id, {
      video_duration_minutes: duration_minutes,
      storytelling_format: outline.storytelling_format,
      outline: JSON.stringify(outline.batches),
      status: "outline_ready",
      current_step: 3
    });

    return Response.json({ 
      success: true, 
      storytelling_format: outline.storytelling_format,
      batches: outline.batches 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});