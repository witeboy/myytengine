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

    // Analyze the thumbnail with Gemini Vision — Z-Depth layered blueprint system
    const analysis = await callGeminiWithImage(`You are a FORENSIC thumbnail architect. Your job is to reverse-engineer this YouTube thumbnail into a LAYERED BLUEPRINT so precise that an AI image generator can reproduce it VERBATIM.

=== Z-DEPTH LAYER SYSTEM ===
Analyze this thumbnail by decomposing it into 4 distinct Z-Depth layers on a 1920x1080 canvas:

LAYER 1 — BACKGROUND (Depth 0):
- What is the background? (stadium, kitchen, studio, map, gradient, etc.)
- Gaussian blur level (0-100%)
- Lighting: darker than foreground? Vignette on edges?
- Colors (#hex), gradients, bokeh, light rays, particles
- Overall atmosphere (dark/moody, bright/energetic, warm, cold)

LAYER 2 — ANCHORS / MID-GROUND (Depth 1):
- Who/what is in the CENTER of the frame?
- Scale relative to canvas height (e.g. "50% height")
- How many figures? What are they doing?
- Are they the "bridge" between two opposing sides?
- Clothing, expressions, poses, lighting

LAYER 3 — CONTENDERS / FOREGROUND (Depth 2):
- Who/what is on the EXTREME LEFT and EXTREME RIGHT?
- Scale: do they fill 100%+ of frame height? (heads touch top, chests touch bottom?)
- FACE-OFF POSE: Left subject angle (e.g. 30° right), Right subject angle (e.g. 30° left)
- Crop point: mid-chest up? Shoulders up?
- For EACH person: expression (mouth open/closed, eyebrows, eyes), clothing (exact colors), hair, skin tone
- RIM LIGHTING: bright edge light on the outer side of each face? Color of rim light?

LAYER 4 — UI OVERLAY (Depth 3, topmost):
For EACH text/graphic element:
- EXACT text verbatim (case-sensitive)
- Position: percentage from edges (e.g. "top center, 3% from top")
- Font: weight (bold/black/extra-bold), family (Impact/Bebas/Montserrat), size relative to canvas
- Color (#hex), outline (color + thickness), drop shadow (direction + color + blur), glow
- Background shape: rectangle (color, border-radius, padding), banner, pill, none
- Letter spacing, text transform (uppercase/lowercase)

For EACH graphic element (logos, icons, banners, dividers, badges):
- Type, position, size, colors, shape details

=== STYLING RULES (The "Vibe") ===
Identify these constants:
- Rim Light Rule: do foreground subjects have bright edge lighting? Which side? Color?
- Saturation: normal, boosted +20% (hyper-real), desaturated?
- Contrast: low/medium/high/extreme? Deep blacks? Blown highlights?
- Text Rule: font family, fill color, stroke color + thickness, drop shadow specs
- Color Temperature: warm/cool/neutral?

=== RECREATION TEMPLATE ===
Now produce TWO things:

1. A "recreate_prompt" — a VERBATIM architectural blueprint (300+ words) that describes:
   - LAYER 1: Exact background with blur, colors, lighting
   - LAYER 2: Center subjects with position, scale, clothing, expressions
   - LAYER 3: Left/Right foreground subjects with face-off poses, expressions, rim lighting, clothing, crop
   - LAYER 4: Every text element with exact words, font, color, effects, position. Every graphic element.
   - Styling: saturation, contrast, rim lighting rules
   Use spatial language: "left 0-30% of canvas", "bottom 12% of canvas", "centered at 50%"

2. A "generic_template" — a fill-in-the-blank version that can recreate this EXACT layout for ANY topic:
   Replace specific people/text with [SUBJECT A], [SUBJECT B], [CENTER GROUP], [TITLE], [SETTING], [COLOR A], [COLOR B], etc.
   Keep ALL positioning, styling, and layer rules intact.

RESPOND IN THIS EXACT JSON:
{
  "detailed_description": "500+ word forensic description of every visual element decomposed by layer",
  "layers": {
    "background": {
      "content": "what the background shows",
      "blur_percent": 25,
      "colors": ["#hex1", "#hex2"],
      "lighting": "dark vignette edges, floodlights at top, etc",
      "atmosphere": "dark/moody, bright/energetic, etc"
    },
    "midground": {
      "subjects": [
        {
          "position": "center, 50% height",
          "description": "who/what",
          "expression": "expression details",
          "clothing": "clothing details",
          "scale": "50% of canvas height"
        }
      ]
    },
    "foreground": {
      "left_subject": {
        "position": "left 0-30%, full height",
        "face_angle": "30° right",
        "expression": "serious, mouth closed, focused eyes",
        "clothing": "red jersey, white trim",
        "rim_light": "bright white edge on left shoulder/face",
        "crop": "mid-chest up",
        "scale": "110% canvas height"
      },
      "right_subject": {
        "position": "right 70-100%, full height",
        "face_angle": "30° left",
        "expression": "intense, mouth open, wide eyes",
        "clothing": "blue jersey",
        "rim_light": "bright white edge on right shoulder/face",
        "crop": "mid-chest up",
        "scale": "110% canvas height"
      }
    },
    "ui_overlay": {
      "text_elements": [
        {
          "text": "EXACT TEXT",
          "position": "top center, 3% from top",
          "size": "8% canvas height",
          "font": "extra-bold Impact/Bebas sans-serif",
          "color": "#FFFFFF",
          "outline": "3px #000000",
          "shadow": "4px down-right #000000 60% opacity",
          "background_shape": "none / red rectangle #FF0000 border-radius 4px / etc",
          "transform": "uppercase"
        }
      ],
      "graphic_elements": [
        {
          "type": "logo/banner/divider/badge/icon",
          "position": "where on canvas %",
          "colors": ["#hex"],
          "size": "% of canvas",
          "details": "shape, content, etc"
        }
      ]
    }
  },
  "styling_rules": {
    "rim_light": "bright white edge light on outer face edge of foreground subjects",
    "saturation": "boosted +20%, hyper-realistic",
    "contrast": "high — deep blacks, bright highlights",
    "text_style": "Impact/Bebas, white fill, thick black stroke, drop shadow",
    "color_temperature": "warm/cool/neutral"
  },
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "layout_breakdown": "Grid description: left third, center third, right third, top/bottom zones",
  "typography": {
    "text_shown": "ALL text verbatim",
    "font_style": "exact font description",
    "font_color": "#hex",
    "font_effects": "outline + shadow + glow details"
  },
  "emotional_hook": "What emotion this triggers and the psychology behind it",
  "style_category": "cinema / minimal / documentary / reaction / sports / gaming",
  "ctr_analysis": "Why this specific layer composition + colors + text makes it impossible to scroll past",
  "recreate_prompt": "ULTRA-DETAILED 400+ word layered blueprint: Layer 1 background (blur, colors, atmosphere), Layer 2 center subjects (position, scale, details), Layer 3 foreground face-off subjects (left/right positions, angles, expressions, rim lighting, clothing, crop), Layer 4 all text elements (exact words, font, color, outline, shadow, position) and all graphics (logos, banners, dividers with positions and colors). Include styling rules (saturation, contrast, rim light). Use percentages for ALL positions. This must be so detailed that someone who has NEVER seen the original can recreate it identically.",
  "generic_template": "Fill-in-the-blank version: 'A YouTube thumbnail for [INSERT TOPIC] featuring [LAYOUT TYPE]. Layer 1: Blurred [SETTING] background... Layer 2: [CENTER GROUP] at center 50% scale... Layer 3: [SUBJECT A] on far left facing right in [COLOR A], [SUBJECT B] on far right facing left in [COLOR B], both with rim lighting... Layer 4: [TITLE] text top center in white Impact with black stroke, [BOTTOM BANNER] spanning full width...' Keep ALL positioning and styling rules.",
  "editable_elements": {
    "background_description": "Detailed background for editing",
    "subject_description": "Main subjects with full detail",
    "text_overlay": "All text shown",
    "accent_color": "#hex pop color",
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