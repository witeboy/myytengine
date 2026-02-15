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

    const prompt = `You are the world's #1 YouTube thumbnail architect. Design using a Z-DEPTH LAYER SYSTEM on a 1920x1080 canvas.

VIDEO TITLE: "${video_title}"
Brand thumbnail tone: ${thumb_tone}

=== Z-DEPTH LAYER SYSTEM ===
Every thumbnail MUST be described as 4 layers:
LAYER 1 — BACKGROUND (Depth 0): Blurred setting, atmosphere, colors, vignette
LAYER 2 — ANCHORS (Depth 1): Center mid-ground subjects at 50% canvas height
LAYER 3 — CONTENDERS (Depth 2): Foreground subjects on extreme left/right, 110% height, rim-lit, face-off 30° angles
LAYER 4 — UI OVERLAY (Depth 3): Title text, banners, logos with EXACT positioning

=== STYLING RULES ===
- Rim Light: bright edge light on outer face of foreground subjects
- Saturation: boosted +20% hyper-realistic
- Contrast: high — deep blacks, bright highlights
- Text: Impact/Bebas Neue, white fill + thick black stroke + drop shadow

Generate 10 viral thumbnail concepts. Rank top 3 by CTR potential.

RESPOND IN THIS EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "concept_description": "Detailed concept decomposed by layer",
      "facial_expression": "Expression details or null",
      "visual_metaphor": "Central metaphor",
      "color_scheme": "Color approach — saturation, contrast, temperature",
      "text_overlay": "Under 4 words",
      "style_reference": "cinema/minimal/documentary",
      "ctr_score": 9,
      "layers": {
        "background": "Layer 1: Blurred [setting], [colors #hex], blur 25%, vignette",
        "midground": "Layer 2: [center subjects], 50% height, [details]",
        "foreground_left": "Layer 3 Left: [subject] at 0-30%, facing 30° right, [expression], rim light left edge",
        "foreground_right": "Layer 3 Right: [subject] at 70-100%, facing 30° left, [expression], rim light right edge",
        "ui_overlay": "Layer 4: '[TEXT]' top center, white Impact, 3px black outline. [banner details]"
      },
      "image_prompt": "LAYERED BLUEPRINT: 'A 1920x1080 YouTube thumbnail. Layer 1 (Background): [blurred setting, colors, atmosphere]. Layer 2 (Mid-ground): [center subjects, position, scale]. Layer 3 (Foreground): [left subject 0-30% facing right, rim light] and [right subject 70-100% facing left, rim light], 110% height. Layer 4 (UI): [text, font, color, outline, position] and [banners, logos]. Styling: hyper-saturated, high contrast, rim lighting. 4K, sharp.'"
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