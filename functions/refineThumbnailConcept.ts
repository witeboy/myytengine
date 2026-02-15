import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8, maxTokens = 12288) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
  }

  const data = await response.json();
  if (!data.candidates || data.candidates.length === 0) throw new Error("No candidates from Gemini");
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

    const { thumbnail_id, feedback } = await req.json();

    if (!thumbnail_id || !feedback) {
      return Response.json({ error: 'thumbnail_id and feedback are required' }, { status: 400 });
    }

    const thumb = await base44.entities.ThumbnailConcepts.get(thumbnail_id);

    const prompt = `You are the world's #1 YouTube thumbnail designer and prompt engineer.

You previously created a thumbnail concept. The user wants to REFINE it based on their feedback.

=== CURRENT THUMBNAIL CONCEPT ===
Concept Description: ${thumb.concept_description || ''}
Subject/Expression: ${thumb.facial_expression || ''}
Visual Metaphor/Template: ${thumb.visual_metaphor || ''}
Color Scheme: ${thumb.color_scheme || ''}
Text Overlay: ${thumb.text_overlay || ''}
Style Reference: ${thumb.style_reference || ''}
CTR Score: ${thumb.ctr_score || ''}

=== CURRENT AI IMAGE PROMPT ===
${thumb.image_prompt || ''}

=== USER FEEDBACK ===
"${feedback}"

=== YOUR MISSION ===
Apply the user's feedback to improve the concept. Modify ONLY what the user asks for — keep everything else intact. Then regenerate a complete, improved image prompt.

=== CRITICAL PROMPT RULES (for image_prompt) ===
- Think in VISUAL CONCEPTS and DESCRIPTIVE LANGUAGE, not code/measurements
- NEVER use percentages, pixel coordinates, opacity values, or hex color codes
- Use SPATIAL RELATIONSHIPS: "anchored at the top center", "filling the left third"
- Use PHOTOGRAPHY LANGUAGE: "extreme close-up", "rim lighting on left profile", "shallow depth of field"
- Use ARCHETYPE descriptions: "bald man with intense expression" NOT "person"
- Use COLOR NAMES: "crimson red", "electric blue" — never #FF0000
- Describe text+container as ONE unit: "a red pill-shaped badge containing white text 'LIVE'"
- MAX 2-3 text elements
- Include "graphic design composition" for flat 2D text overlays
- The image_prompt MUST be 250+ words

RESPOND IN THIS EXACT JSON:
{
  "concept_description": "Updated 2-3 sentence concept (keep original if unchanged)",
  "facial_expression": "Updated subject description (keep original if unchanged)",
  "visual_metaphor": "Updated template type (keep original if unchanged)",
  "color_scheme": "Updated color approach (keep original if unchanged)",
  "text_overlay": "Updated text (keep original if unchanged, max 4 words)",
  "style_reference": "cinema / minimal / documentary (keep original if unchanged)",
  "ctr_score": 9,
  "image_prompt": "COMPLETE 250+ word refined AI image prompt incorporating the user's feedback while preserving all other details. NO percentages. NO hex codes.",
  "changes_made": "Brief summary of what was changed based on feedback"
}`;

    console.log("Refining thumbnail concept with feedback:", feedback);
    const result = await safeGeminiCall(prompt, 0.7, 12288);

    const validStyles = ['cinema', 'minimal', 'documentary'];
    const styleRef = (result.style_reference || thumb.style_reference || 'cinema').split('/')[0].trim().toLowerCase();

    // Update the thumbnail concept
    await base44.entities.ThumbnailConcepts.update(thumbnail_id, {
      concept_description: result.concept_description || thumb.concept_description,
      facial_expression: result.facial_expression || thumb.facial_expression,
      visual_metaphor: result.visual_metaphor || thumb.visual_metaphor,
      color_scheme: result.color_scheme || thumb.color_scheme,
      text_overlay: result.text_overlay || thumb.text_overlay,
      style_reference: validStyles.includes(styleRef) ? styleRef : 'cinema',
      ctr_score: result.ctr_score || thumb.ctr_score,
      image_prompt: result.image_prompt || thumb.image_prompt,
      // Clear the image so user regenerates with the new prompt
      image_url: ''
    });

    return Response.json({
      success: true,
      changes_made: result.changes_made,
      updated_prompt: result.image_prompt
    });
  } catch (error) {
    console.error("refineThumbnailConcept error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});