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
      ? `\n\nIMPORTANT: Use this reference thumbnail style as inspiration:\n${reference_style}\nAdapt this EXACT visual style to the video's content.`
      : '';

    const prompt = `You are the world's #1 YouTube thumbnail designer. Your thumbnails have generated BILLIONS of views. You understand the psychology of clicking better than anyone alive.

VIDEO TOPIC: "${topic.title}"
VIDEO TITLE: "${script.title}"
NICHE: "${project.niche}"

SCRIPT EXCERPT (use this to find the most shocking/emotional/curiosity-inducing moments):
${truncatedScript}
${styleInstruction}

Create 10 KILLER thumbnail concepts. These must be SCROLL-STOPPING, IMPOSSIBLE TO IGNORE thumbnails.

Each concept must follow these YouTube thumbnail laws:
🔥 HIGH CONTRAST - Colors must POP and be visible at small sizes
🔥 EMOTIONAL TRIGGER - Must trigger curiosity, shock, fear, awe, or urgency
🔥 3-SECOND RULE - Viewer must understand the concept in under 3 seconds
🔥 TEXT IS MINIMAL - Max 3-4 words, HUGE, readable at thumbnail size
🔥 VISUAL MYSTERY - Show enough to intrigue but NOT enough to satisfy (curiosity gap)
🔥 PATTERN INTERRUPT - Must look different from other thumbnails in the niche
🔥 FACE RULE - If using faces, extreme emotions (shock, terror, excitement)

Mix these proven thumbnail TEMPLATES:
- "The Reveal" - something being uncovered/exposed
- "The Contrast" - before/after, good vs evil, expected vs reality
- "The Warning" - danger/urgency visual
- "The Mystery" - blurred element, redacted text, hidden object
- "The Reaction" - extreme human emotion
- "The Bold Statement" - massive text dominating the frame
- "The Evidence" - screenshot/document/proof style
- "The Countdown" - numbered list teaser
- "The Transformation" - dramatic change visual
- "The Forbidden" - crossed out, banned, restricted look

RESPOND IN THIS EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "template_type": "The Reveal / The Contrast / etc",
      "concept_description": "Detailed visual concept — what EXACTLY the viewer sees",
      "emotional_hook": "What emotion this triggers and WHY it's impossible to scroll past",
      "text_overlay": "3-4 word text (HUGE, readable)",
      "font_style": "Impact bold / condensed / handwritten / etc",
      "font_color": "#hex",
      "font_effects": "black outline, drop shadow, glow, etc",
      "background_description": "Detailed background — colors, elements, mood",
      "subject_description": "Main visual subject — face, object, scene",
      "accent_color": "#hex of the color that pops most",
      "color_scheme": "Overall color approach — warm/cold, saturated, contrast level",
      "visual_effects": "arrows, circles, blur, glow, split, etc",
      "style_reference": "cinema / minimal / documentary / reaction / bold",
      "ctr_score": 9,
      "scroll_stop_reason": "1 sentence why NO ONE can scroll past this",
      "image_prompt": "DETAILED AI image prompt — include composition, camera angle, lighting, colors, mood, style, text placement, all visual elements. Be extremely specific."
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
      const record = await base44.entities.ThumbnailConcepts.create({
        project_id,
        rank: t.rank,
        concept_description: `[${t.template_type}] ${t.concept_description}\n\n🎯 Hook: ${t.emotional_hook}\n🛑 Scroll-stop: ${t.scroll_stop_reason}`,
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