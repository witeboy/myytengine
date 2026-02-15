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
          generationConfig: { temperature, maxOutputTokens: 8192 }
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

    let jsonStr = text;
    if (text.includes("```json")) {
      jsonStr = text.split("```json")[1].split("```")[0].trim();
    } else if (text.includes("```")) {
      jsonStr = text.split("```")[1].split("```")[0].trim();
    }

    const parsed = JSON.parse(jsonStr);

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
    const { project_id, video_title } = body;

    const brand_list = await base44.entities.BrandIdentities.list();
    const brand_identities = brand_list.filter(b => b.project_id === project_id);
    const thumb_tone = brand_identities.length > 0 ? brand_identities[0].thumbnail_tone : "cinematic documentary";

    const prompt = `Generate 10 viral thumbnail concepts for the title "${video_title}." Each should include:

→ Emotional facial expression (if used)
→ Central visual metaphor
→ Bold contrast in color and lighting
→ Minimal text (under 4 words)
→ Style reference (cinema, minimal, documentary)

Rank top 3 by CTR potential and clarity.

Brand thumbnail tone: ${thumb_tone}

RESPOND IN THIS EXACT JSON FORMAT:

{
  "thumbnails": [
    {
      "rank": 1,
      "concept_description": "Full concept description",
      "facial_expression": "Expression or null if no face",
      "visual_metaphor": "Central metaphor",
      "color_scheme": "Color and lighting approach",
      "text_overlay": "Under 4 words",
      "style_reference": "cinema/minimal/documentary",
      "ctr_score": 9,
      "image_prompt": "Ready-to-use DALL-E or Midjourney prompt for this thumbnail"
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.9);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    // Delete existing thumbnails for this project before creating new ones
    const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
    for (const e of existing) {
      await base44.entities.ThumbnailConcepts.delete(e.id);
    }

    const thumbnails = [];

    for (const t of result.data.thumbnails) {
      const record = await base44.entities.ThumbnailConcepts.create({
        project_id: project_id,
        rank: t.rank,
        concept_description: t.concept_description,
        facial_expression: t.facial_expression,
        visual_metaphor: t.visual_metaphor,
        color_scheme: t.color_scheme,
        text_overlay: t.text_overlay,
        style_reference: t.style_reference,
        ctr_score: t.ctr_score,
        image_prompt: t.image_prompt,
        is_selected: false
      });

      thumbnails.push(record);
    }

    await base44.entities.Projects.update(project_id, { current_step: 12 });

    return Response.json({ success: true, thumbnails: thumbnails });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});