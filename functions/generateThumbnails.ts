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

    const prompt = `You are the world's #1 YouTube thumbnail designer.

VIDEO TITLE: "${video_title}"
Brand thumbnail tone: ${thumb_tone}

=== CRITICAL PROMPT RULES ===
- Think in VISUAL CONCEPTS, not code/measurements
- NEVER use percentages, pixels, hex codes, opacity values
- Use SPATIAL RELATIONSHIPS: "anchored at the top", "filling the left third", "spanning the bottom"
- Use PHOTOGRAPHY LANGUAGE: "extreme close-up", "rim lighting on profile", "heavy bokeh"
- Use ARCHETYPE descriptions: "bald man with intense stare" not "person"
- Use COLOR NAMES: "crimson red", "electric blue" — never #FF0000
- Describe text+container as ONE unit: "red badge containing white text 'LIVE'"
- MAX 2-3 text elements in the image prompt
- Say "graphic design composition" to force flat 2D text overlays

MANDATORY: ALL thumbnails MUST be in 16:9 landscape aspect ratio (1280x720). Every image_prompt MUST explicitly state "16:9 aspect ratio, 1280x720 resolution, widescreen landscape format" at the beginning.

Generate 10 viral thumbnail concepts. Rank top 3 by CTR potential.

RESPOND IN THIS EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "concept_description": "Detailed concept in natural language",
      "facial_expression": "Archetype expression description or null",
      "visual_metaphor": "Central metaphor",
      "color_scheme": "Color approach using color names, saturation, contrast",
      "text_overlay": "Under 4 words",
      "style_reference": "cinema/minimal/documentary",
      "ctr_score": 9,
      "image_prompt": "A COMPLETE 150+ word natural-language prompt: 'A high-contrast 4K YouTube thumbnail in 16:9 aspect ratio (1280x720), widescreen landscape format, graphic design composition. FOREGROUND: [subjects with archetype descriptions, expressions, clothing colors, crop, rim lighting]. MID-GROUND: [center subjects smaller in frame for depth]. BACKGROUND: [blurred setting with mood]. TEXT: [title as single design unit]. STYLE: [render keywords].' NO percentages. NO hex codes. MUST specify 16:9 aspect ratio."
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