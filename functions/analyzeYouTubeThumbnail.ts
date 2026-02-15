import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function callGeminiWithImage(prompt, imageUrl, temperature = 0.7) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  // Fetch image and convert to base64 safely
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
  const imgBuf = await imgResp.arrayBuffer();
  const bytes = new Uint8Array(imgBuf);
  
  // Convert to base64 in chunks to avoid stack overflow on large images
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
    throw new Error("No response from Gemini");
  }

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

    const { youtube_url, project_id } = await req.json();

    // Extract video ID from YouTube URL
    let videoId = '';
    if (youtube_url.includes('youtu.be/')) {
      videoId = youtube_url.split('youtu.be/')[1].split('?')[0];
    } else if (youtube_url.includes('v=')) {
      videoId = youtube_url.split('v=')[1].split('&')[0];
    } else if (youtube_url.includes('/shorts/')) {
      videoId = youtube_url.split('/shorts/')[1].split('?')[0];
    }

    if (!videoId) {
      return Response.json({ error: 'Could not extract YouTube video ID from URL' }, { status: 400 });
    }

    // Get the highest res thumbnail
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    // Fallback
    const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    
    // Test if maxres exists
    let finalThumbUrl = thumbnailUrl;
    try {
      const test = await fetch(thumbnailUrl, { method: 'HEAD' });
      if (!test.ok) finalThumbUrl = fallbackUrl;
    } catch {
      finalThumbUrl = fallbackUrl;
    }

    // Analyze the thumbnail with Gemini Vision — pixel-perfect verbatim recreation prompt
    const analysis = await callGeminiWithImage(`You are a FORENSIC thumbnail analyst. Your job is to describe this YouTube thumbnail with such SURGICAL PRECISION that an AI image generator can reproduce it VERBATIM — pixel-for-pixel, element-for-element, position-for-position.

Treat the thumbnail as a 1280x720 canvas. Describe EVERY element using EXACT coordinates and percentages.

=== MANDATORY ANALYSIS CHECKLIST ===

1. CANVAS & GRID:
   - Divide the image into a 3x3 grid. What is in each cell?
   - What percentage of the canvas does each major element occupy?

2. PEOPLE (for EACH person visible):
   - Exact position (e.g. "left 10%-35% of canvas width, top 5%-95% of canvas height")
   - Face angle (straight-on, 3/4 left, 3/4 right, profile)
   - Expression (mouth open/closed, eyebrows raised/furrowed, eyes wide/squinting)
   - What they're wearing (colors, style)
   - Lighting direction on their face (left, right, top, rim light)
   - Cutoff point (head only, shoulders, waist, full body)
   - Size relative to canvas height (e.g. "face occupies ~30% of canvas height")

3. TEXT OVERLAYS (for EACH text element):
   - EXACT text shown (verbatim, case-sensitive)
   - Position: top/center/bottom, left/center/right + percentage from edges
   - Font size relative to canvas (e.g. "text height is ~8% of canvas height")
   - Font weight: thin/regular/bold/extra-bold/black
   - Font family: sans-serif (Impact/Bebas/Montserrat-like), serif, handwritten, etc.
   - EXACT font color (#hex)
   - Text effects: outline (color + thickness), drop shadow (direction + color + blur), glow (color + spread), 3D extrude, gradient fill
   - Letter spacing: tight/normal/wide
   - Text transform: uppercase/lowercase/mixed
   - Background behind text: none, solid rectangle (color + opacity), gradient bar, banner shape
   - If text is inside a shape/banner: describe shape, color (#hex), border radius, padding

4. BACKGROUND:
   - What is the background? (solid color, gradient, photo, blurred scene, pattern)
   - Exact colors (#hex) and gradient direction if applicable
   - Blur level (sharp, slight blur, heavy blur, bokeh)
   - Any overlays on background (dark vignette, color tint, light rays, particles)

5. GRAPHIC ELEMENTS:
   - Arrows (position, color, size, style — solid/outlined/hand-drawn)
   - Circles/highlights (position, color, thickness, dashed/solid)
   - Emojis (which emoji, position, size)
   - Logos/icons (position, size, what they depict)
   - Borders/frames (color, thickness, position)
   - Split lines/dividers (vertical/horizontal/diagonal, color, position)
   - Banners/ribbons/badges (shape, color, position, text inside)

6. COLOR ANALYSIS:
   - Dominant color (#hex) and % of canvas it covers
   - Secondary color (#hex) and % coverage
   - Accent/pop color (#hex) — the color that draws the eye
   - Overall temperature: warm/cool/neutral
   - Contrast level: low/medium/high/extreme
   - Saturation: desaturated/normal/vivid/hyper-saturated

7. LIGHTING & MOOD:
   - Primary light source direction
   - Light color temperature (warm yellow, cool blue, neutral white)
   - Dramatic shadows? Where?
   - Overall mood: dark/moody, bright/energetic, warm/cozy, cold/clinical

NOW — generate a "recreate_prompt" that is an EXACT blueprint. This prompt must:
- Describe the EXACT composition using spatial language ("left third", "bottom 15%", "centered at 50% width")
- Specify EVERY text element with exact words, font style, color, size, effects, and position
- Describe EVERY person's position, expression, clothing, and lighting
- Include ALL graphic elements (arrows, circles, banners, overlays) with positions and colors
- Specify the EXACT background treatment
- Include color hex codes for every color mentioned
- Be so detailed that someone who has NEVER seen the original could recreate it identically

RESPOND IN THIS EXACT JSON FORMAT:
{
  "detailed_description": "500+ word forensic description of every visual element with positions, sizes, colors",
  "layout_breakdown": "Grid-based spatial breakdown — what's in each third of the canvas",
  "people": [
    {
      "position": "left 5%-30%, full height",
      "description": "detailed description of person",
      "expression": "mouth open, shocked eyes, raised eyebrows",
      "clothing": "what they wear",
      "lighting": "rim light from right, warm key light from left"
    }
  ],
  "text_elements": [
    {
      "text": "EXACT TEXT",
      "position": "top center, 5% from top edge",
      "size": "8% of canvas height",
      "font": "extra-bold condensed sans-serif (Impact/Bebas style)",
      "color": "#FFFFFF",
      "effects": "2px black outline, drop shadow 3px down-right #000000 50% opacity",
      "background": "none / red rectangle #FF0000 with 4px border radius / etc",
      "letter_spacing": "tight",
      "transform": "uppercase"
    }
  ],
  "graphic_elements": [
    {
      "type": "arrow/circle/emoji/logo/banner/divider",
      "position": "where on canvas",
      "color": "#hex",
      "size": "relative to canvas",
      "details": "any additional details"
    }
  ],
  "background": {
    "type": "solid/gradient/photo/blurred",
    "colors": ["#hex1", "#hex2"],
    "blur_level": "none/slight/heavy",
    "overlays": "dark vignette, color tint, etc"
  },
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "typography": {
    "text_shown": "ALL text verbatim, separated by newlines",
    "font_style": "exact font description",
    "font_color": "#hex primary text color",
    "font_effects": "all effects described"
  },
  "emotional_hook": "What emotion this triggers and why — the psychology behind it",
  "style_category": "cinema / minimal / documentary / reaction / tutorial / sports / gaming",
  "ctr_analysis": "Why this SPECIFIC layout + color + text combo makes it impossible to scroll past",
  "recreate_prompt": "ULTRA-DETAILED 300+ word AI image generation prompt that specifies EXACT positions (use percentages), EXACT colors (#hex), EXACT text with styling, EXACT expressions, EXACT lighting, EXACT background — everything needed to recreate this thumbnail VERBATIM. Include spatial coordinates for every element. Describe text overlays with exact words, font size, weight, color, outline, shadow, and position. This must read like architectural blueprints for the thumbnail.",
  "editable_elements": {
    "background_description": "Detailed background for editing",
    "subject_description": "Main subject with full detail",
    "text_overlay": "All text shown",
    "accent_color": "#hex of the eye-catching pop color",
    "mood": "Overall mood/vibe"
  }
}`, finalThumbUrl, 0.3);

    return Response.json({
      success: true,
      thumbnail_url: finalThumbUrl,
      video_id: videoId,
      analysis
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});