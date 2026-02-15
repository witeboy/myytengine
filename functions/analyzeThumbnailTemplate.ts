import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function callGeminiWithImage(prompt, imageUrl, temperature = 0.3, maxTokens = 16384) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
  const imgBuf = await imgResp.arrayBuffer();
  const bytes = new Uint8Array(imgBuf);
  
  let base64 = '';
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    base64 += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  base64 = btoa(base64);
  
  const mimeType = imgResp.headers.get('content-type') || 'image/jpeg';

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } }
          ]
        }],
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
  
  jsonStr = jsonStr
    .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ch : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
    throw new Error("Failed to parse Gemini response as JSON: " + e.message);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, source_url, niche_tags, library_category, niche_id } = await req.json();
    
    if (!image_url) return Response.json({ error: 'image_url is required' }, { status: 400 });

    const analysis = await callGeminiWithImage(`You are the world's #1 YouTube thumbnail analyst. Analyze this WORLD-CLASS thumbnail and extract REUSABLE COMPOSITION RULES that can be applied to ANY topic.

Your goal is to understand WHY this thumbnail works and create a TEMPLATE BLUEPRINT that can generate equally powerful thumbnails for different subjects.

=== ANALYZE THESE DIMENSIONS ===

1. COMPOSITION BLUEPRINT: 
   - What is the exact layout structure? (split-screen, centered hero, face-off, etc.)
   - How is the frame divided? What fills each zone?
   - What are the visual vectors (lines that guide the eye)?
   - What is the visual hierarchy — what's biggest, sharpest, most prominent?

2. CHARACTER ACTION PATTERN:
   - What are the characters DOING? (not just standing — holding, shielding, pointing, confronting)
   - How do characters INTERACT with each other? (eye contact, confrontation, protection)
   - What body language and expressions create emotion?
   - What micro-details sell the story? (tears, clenched fists, protective gestures)

3. TEXT STRATEGY:
   - How does the text create a CURIOSITY GAP? (question, not answer)
   - Where is text placed relative to subjects? (negative space, bottom, top)
   - What makes the text readable at tiny size? (font weight, outline, contrast)
   - What emotional function does the text serve?

4. COLOR & CONTRAST STRATEGY:
   - How is color contrast used to create emotion? (warm vs cold, saturated vs desaturated)
   - What is the "Heaven vs Hell" color split?
   - Where are the brightest and darkest areas?
   - How does the color guide the eye?

5. DEPTH & FOCUS STRATEGY:
   - What is sharp vs blurred? How does depth create hierarchy?
   - Where is the vignette? How strong?
   - What atmospheric effects are used? (smoke, embers, lens flare, god rays)

6. EMOTIONAL TRIGGER:
   - What emotion hits in 0.3 seconds?
   - Why is it IMPOSSIBLE to scroll past this?
   - What psychological principle makes it work? (curiosity gap, loss aversion, tension, contrast)

7. QUALITY SCORE: Rate this thumbnail 1-10 for viral potential

RESPOND IN THIS EXACT JSON:
{
  "template_type": "face_off / centered_hero / the_reveal / the_contrast / the_reaction / bold_statement / the_mystery / the_warning / before_after / other",
  "emotional_tone": "primary emotion (tension, shock, mystery, triumph, etc)",
  "forensic_description": "500+ word exhaustive analysis of EVERY visual element — composition, subjects, text, colors, lighting, atmosphere, and WHY each element works for CTR",
  "composition_blueprint": "200+ word REUSABLE composition rules — layout structure, zone assignments, visual vectors, hierarchy, depth layers. Written as RULES that can be applied to ANY topic. e.g. 'Left 40%: Hero subject in extreme close-up, chest up, facing right toward threat. Warm golden rim light on left profile...'",
  "color_strategy": "Detailed reusable color rules — what goes warm, what goes cold, where contrast is highest, vignette rules, saturation zones",
  "text_strategy": "Reusable text rules — curiosity gap technique, placement rules, font weight/size/outline/shadow approach, how many words, what type of words create clicks",
  "character_action_notes": "What makes the characters ACTIVE not passive — body language, gestures, interactions, micro-details that tell the story. Written as RULES for posing future characters.",
  "recreate_prompt": "A GENERIC 400+ word AI image prompt TEMPLATE with [HERO SUBJECT], [ANTAGONIST/CONTRAST], [SETTING], [TEXT OVERLAY] placeholders. This template preserves ALL composition, lighting, color, depth, and emotional rules but allows ANY subject to be plugged in. MUST start with '16:9 aspect ratio, 1280x720 resolution, widescreen landscape format YouTube thumbnail.' MUST include all spatial, lighting, color contrast, depth of field, vignette, text design rules from the original.",
  "quality_score": 8
}`, image_url, 0.3, 16384);

    // Save as template
    const template = await base44.entities.ThumbnailTemplates.create({
      niche_id: niche_id || '',
      source_url: source_url || '',
      thumbnail_image_url: image_url,
      niche_tags: niche_tags || '',
      template_type: analysis.template_type || 'other',
      emotional_tone: analysis.emotional_tone || '',
      forensic_description: analysis.forensic_description || '',
      composition_blueprint: analysis.composition_blueprint || '',
      color_strategy: analysis.color_strategy || '',
      text_strategy: analysis.text_strategy || '',
      character_action_notes: analysis.character_action_notes || '',
      recreate_prompt: analysis.recreate_prompt || '',
      quality_score: analysis.quality_score || 7,
      is_favorite: false,
    });

    return Response.json({ success: true, template });
  } catch (error) {
    console.error("analyzeThumbnailTemplate error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});