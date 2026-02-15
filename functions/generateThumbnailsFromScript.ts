import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
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
  if (!data.candidates || data.candidates.length === 0) throw new Error("No candidates");
  const text = data.candidates[0].content.parts[0].text;
  let jsonStr = text;
  if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();
  return JSON.parse(jsonStr);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, reference_style } = await req.json();

    const project = await base44.entities.Projects.get(project_id);
    const script = await base44.entities.Scripts.get(project.script_id);
    const topic = await base44.entities.Topics.get(project.selected_topic_id);

    const scriptContent = script.full_script || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
    const truncatedScript = scriptContent.substring(0, 3000);

    const styleInstruction = reference_style 
      ? `\n\nIMPORTANT — REFERENCE STYLE BLUEPRINT:\nYou MUST replicate this EXACT layout/layer structure for the new topic:\n${reference_style}\nAdapt the subjects and text to the video's content but keep the IDENTICAL layer composition, positioning, rim lighting, text styling, and banner structure.`
      : '';

    const prompt = `You are the world's #1 YouTube thumbnail architect. You design thumbnails using a Z-DEPTH LAYER SYSTEM on a 1920x1080 canvas.

VIDEO TOPIC: "${topic.title}"
VIDEO TITLE: "${script.title}"
NICHE: "${project.niche}"

SCRIPT EXCERPT (find the most shocking/emotional/curiosity-inducing moments):
${truncatedScript}
${styleInstruction}

=== Z-DEPTH LAYER SYSTEM ===
Every thumbnail MUST be described as 4 layers:

LAYER 1 — BACKGROUND (Depth 0): Blurred setting, atmosphere, colors, vignette
LAYER 2 — ANCHORS (Depth 1): Center mid-ground subjects (2-3 figures at 50% height)
LAYER 3 — CONTENDERS (Depth 2): Foreground face-off subjects on extreme left/right (110% height, rim-lit, 30° face angles)
LAYER 4 — UI OVERLAY (Depth 3): Title text, banners, logos, badges with EXACT positioning

=== STYLING RULES ===
- Rim Light: bright edge light on outer face of foreground subjects
- Saturation: boosted +20% hyper-realistic
- Contrast: high — deep blacks, bright highlights  
- Text: Impact/Bebas Neue, white fill + thick black stroke + drop shadow
- 3-SECOND RULE: concept must be understood instantly at thumbnail size

Create 10 KILLER thumbnail concepts using this layer system.

RESPOND IN THIS EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "template_type": "Face-Off / The Reveal / The Contrast / etc",
      "concept_description": "Detailed visual concept decomposed by layers",
      "emotional_hook": "What emotion this triggers and WHY it's impossible to scroll past",
      "text_overlay": "3-4 word text (HUGE, readable at thumbnail size)",
      "layers": {
        "background": "Layer 1: Blurred [setting] with [atmosphere], [colors #hex], gaussian blur 25%, dark vignette edges",
        "midground": "Layer 2: [center subjects] at center, 50% canvas height, [clothing], [expressions]",
        "foreground_left": "Layer 3 Left: [Subject] at left 0-30%, facing 30° right, [expression], [clothing color], rim light on left edge, cropped mid-chest up, 110% canvas height",
        "foreground_right": "Layer 3 Right: [Subject] at right 70-100%, facing 30° left, [expression], [clothing color], rim light on right edge, cropped mid-chest up, 110% canvas height",
        "ui_overlay": "Layer 4: '[TITLE]' top center 3% from top, white Impact bold, 3px black outline, drop shadow. Bottom banner spanning full width [color #hex] with '[LEFT TEXT] vs [RIGHT TEXT]' and logos on corners"
      },
      "font_style": "extra-bold Impact/Bebas sans-serif",
      "font_color": "#FFFFFF",
      "font_effects": "3px black outline #000000, drop shadow 4px down-right, 60% opacity",
      "background_description": "Detailed background with blur level, colors, atmosphere",
      "subject_description": "Main visual subjects with positions, expressions, clothing",
      "accent_color": "#hex of the color that pops most",
      "color_scheme": "Overall color approach — warm/cold, saturation +20%, high contrast",
      "visual_effects": "rim lighting, vignette, bokeh, split composition, etc",
      "style_reference": "cinema / minimal / documentary / sports / gaming",
      "ctr_score": 9,
      "scroll_stop_reason": "1 sentence why NO ONE can scroll past this",
      "image_prompt": "LAYERED BLUEPRINT PROMPT: 'A 1920x1080 YouTube thumbnail. Layer 1 (Background): [blurred setting, colors, atmosphere]. Layer 2 (Mid-ground): [center subjects, position, scale, details]. Layer 3 (Foreground): [left subject at 0-30% facing right, expression, clothing, rim light] and [right subject at 70-100% facing left, expression, clothing, rim light], both 110% canvas height, cropped mid-chest up. Layer 4 (UI): [exact text, font, color, outline, shadow, position] and [banners, logos, badges with positions and colors]. Styling: hyper-saturated +20%, high contrast, rim lighting on foreground subjects. 4K resolution, sharp focus.'"
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.95);

    // Delete existing thumbnails for this project before creating new ones
    const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
    for (const e of existing) {
      await base44.entities.ThumbnailConcepts.delete(e.id);
    }

    const thumbnails = [];
    for (const t of result.thumbnails) {
      const layerSummary = t.layers ? `\n\n📐 LAYERS:\nBG: ${t.layers.background}\nMid: ${t.layers.midground}\nLeft: ${t.layers.foreground_left}\nRight: ${t.layers.foreground_right}\nUI: ${t.layers.ui_overlay}` : '';
      const record = await base44.entities.ThumbnailConcepts.create({
        project_id,
        rank: t.rank,
        concept_description: `[${t.template_type}] ${t.concept_description}\n\n🎯 Hook: ${t.emotional_hook}\n🛑 Scroll-stop: ${t.scroll_stop_reason}${layerSummary}`,
        facial_expression: t.subject_description,
        visual_metaphor: t.template_type,
        color_scheme: `${t.color_scheme} | Accent: ${t.accent_color} | Font: ${t.font_color} ${t.font_style} ${t.font_effects} | Effects: ${t.visual_effects}`,
        text_overlay: t.text_overlay,
        style_reference: (t.style_reference || 'cinema').split('/')[0].trim().toLowerCase(),
        ctr_score: t.ctr_score,
        image_prompt: t.image_prompt,
        is_selected: false
      });
      thumbnails.push(record);
    }

    return Response.json({ success: true, thumbnails });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});