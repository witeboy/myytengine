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

    const prompt = `You are a YouTube documentary expert. Create an outline for a ${duration_minutes}-minute video about "${topic_title}" in the ${niche} niche.

STORYTELLING FORMATS (by tier):
S-Tier: ${storytellingFormats.S.join(', ')}
A-Tier: ${storytellingFormats.A.join(', ')}
B-Tier: ${storytellingFormats.B.join(', ')}
C-Tier: ${storytellingFormats.C.join(', ')}
D-Tier: ${storytellingFormats.D.join(', ')}

Instructions:
1. Select the BEST storytelling format from the list above that fits this topic
2. Create 5 batches, each ~1500 words (150 words = 1 minute)
3. Structure: Hook & Inciting Incident → Deep Dive → Complication → Climax → Resolution & Outro

Return ONLY valid JSON in this exact format:

{
  "storytelling_format": "Selected Format Name",
  "total_target_words": ${duration_minutes * 150},
  "batches": [
    {
      "batch_number": 1,
      "story_segment": "The Hook & Inciting Incident",
      "focus_area": "Establish atmosphere, introduce victim/protagonist, end on the Big Discovery",
      "target_words": 1500
    },
    {
      "batch_number": 2,
      "story_segment": "The Deep Dive",
      "focus_area": "Backstory, early investigation, introduce suspects or obstacles",
      "target_words": 1500
    },
    {
      "batch_number": 3,
      "story_segment": "The Complication",
      "focus_area": "Midpoint Twist - information that changes everything or major setback",
      "target_words": 1500
    },
    {
      "batch_number": 4,
      "story_segment": "The Climax",
      "focus_area": "Final confrontation, the aha moment, or high-intensity chase",
      "target_words": 1500
    },
    {
      "batch_number": 5,
      "story_segment": "The Resolution & Outro",
      "focus_area": "Aftermath, legal results, lessons learned, and Call to Action",
      "target_words": 1500
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.7);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const outline = result.data;

    // Create batch records
    for (const batch of outline.batches) {
      await base44.asServiceRole.entities.ScriptBatches.create({
        project_id: project_id,
        batch_number: batch.batch_number,
        story_segment: batch.story_segment,
        focus_area: batch.focus_area,
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