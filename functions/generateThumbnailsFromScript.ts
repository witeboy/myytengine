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
      ? `\n\nIMPORTANT — REFERENCE STYLE:\nYou MUST replicate this EXACT visual style, layout, and composition for the new topic:\n${reference_style}\nAdapt the subjects and text to the video's content but keep the IDENTICAL composition, rim lighting, depth relationships, text treatment, and overall aesthetic.`
      : '';

    const prompt = `You are the world's #1 YouTube thumbnail designer. Your thumbnails get BILLIONS of views.

VIDEO TOPIC: "${topic.title}"
VIDEO TITLE: "${script.title}"
NICHE: "${project.niche}"

SCRIPT EXCERPT (find the most shocking/emotional/curiosity-inducing moments):
${truncatedScript}
${styleInstruction}

=== CRITICAL PROMPT RULES ===
Your "image_prompt" output must follow these rules strictly:
- Think in VISUAL CONCEPTS and DESCRIPTIVE LANGUAGE, not CSS/code/measurements
- NEVER use percentages, pixel coordinates, opacity values, or hex color codes
- Use SPATIAL RELATIONSHIPS: "anchored at the top center", "filling the left third", "spanning the bottom edge"
- Use PHOTOGRAPHY LANGUAGE: "extreme close-up", "rim lighting on profile", "shallow depth of field"
- Use ARCHETYPE descriptions: "bald man with intense expression and dark goatee" NOT "person in red"
- Use COLOR NAMES: "crimson red", "electric blue", "pure white" — never #FF0000
- Describe text+container as ONE unit: "a red pill-shaped badge containing white text 'LIVE'"
- MAX 2-3 text elements. AI creates glitchy text with more.
- Say "graphic design composition" to force flat 2D text overlays
- Use depth cues: "smaller in the frame to show depth" instead of "50% height"
- Use "extreme close-up, cropped mid-chest up" instead of "110% height"

=== COMPOSITION TYPES TO MIX ===
- "Face-Off" split-screen with rim-lit subjects on opposing sides
- "The Reveal" — something being uncovered/exposed
- "The Contrast" — before/after, good vs evil
- "The Reaction" — extreme human emotion center-frame
- "The Bold Statement" — massive text dominating the frame
- "The Mystery" — blurred/redacted element creating curiosity gap
- "The Warning" — danger/urgency visual

Create 10 KILLER thumbnail concepts.

RESPOND IN THIS EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "template_type": "Face-Off / The Reveal / The Contrast / etc",
      "concept_description": "Detailed visual concept described in natural language",
      "emotional_hook": "What emotion this triggers and WHY it's impossible to scroll past",
      "text_overlay": "3-4 word text (HUGE, readable at thumbnail size)",
      "font_style": "heavy Impact / bold condensed sans-serif / etc",
      "font_color": "white with thick black outline",
      "font_effects": "thick black outline, heavy drop shadow — described in words",
      "background_description": "Natural language: blurred dark stadium at night with floodlight lens flare",
      "subject_description": "Archetype descriptions: bald man with goatee in red hoodie, blonde woman with shocked expression",
      "accent_color": "the eye-catching color name (crimson red, electric blue, etc)",
      "color_scheme": "Overall approach: warm saturated, cold moody, high contrast vivid",
      "visual_effects": "rim lighting on profiles, heavy bokeh background, lens flare, vignette",
      "style_reference": "cinema / minimal / documentary / sports / gaming",
      "ctr_score": 9,
      "scroll_stop_reason": "1 sentence why NO ONE can scroll past this",
      "image_prompt": "A COMPLETE 200+ word natural-language AI image prompt. Structure: 'A high-contrast 4K YouTube thumbnail graphic design composition featuring [COMPOSITION TYPE]. FOREGROUND: [describe each subject with archetype, expression, clothing color names, crop, facing direction, rim lighting]. MID-GROUND: [center subjects, smaller in frame for depth, archetypes, clothing, expressions]. BACKGROUND: [blurred setting with mood lighting, atmospheric effects]. TEXT & GRAPHICS: [main title as single design unit with font and shadow]. [Bottom banner as single unit]. STYLE: [HDR photography, hyper-realistic, render quality keywords].' NO percentages. NO hex codes. NO pixel values."
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