import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function callGeminiWithImage(prompt, imageUrl, temperature = 0.7, maxTokens = 8192) {
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
        generationConfig: { temperature, maxOutputTokens: maxTokens }
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
    const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    
    let finalThumbUrl = thumbnailUrl;
    try {
      const test = await fetch(thumbnailUrl, { method: 'HEAD' });
      if (!test.ok) finalThumbUrl = fallbackUrl;
    } catch {
      finalThumbUrl = fallbackUrl;
    }

    // PHASE 1: Exhaustive forensic pixel-by-pixel description
    const forensicDescription = await callGeminiWithImage(`You are a FORENSIC IMAGE ANALYST. Your job is to describe this YouTube thumbnail with ABSOLUTE EXHAUSTIVE DETAIL — as if you are documenting every single pixel for someone who is completely blind and must recreate it perfectly.

=== YOUR MISSION ===
Write a MINIMUM 800-word description covering EVERY visible detail. Leave NOTHING out. Describe it as if you're scanning the image from top-left to bottom-right, pixel row by pixel row.

=== DESCRIBE ALL OF THE FOLLOWING ===

OVERALL COMPOSITION:
- Exact layout structure (split screen, centered, rule of thirds, diagonal, etc.)
- What occupies each zone: top-left, top-center, top-right, center-left, dead-center, center-right, bottom-left, bottom-center, bottom-right
- The visual hierarchy: what is BIGGEST, what is SMALLEST, what overlaps what
- Any geometric shapes formed by the composition (triangles, diagonals, V-shapes)

EVERY PERSON (for each person visible, describe):
- Exact position in the frame (which third, which edge, how much space they occupy)
- Face: skin tone (exact shade — light olive, deep brown, pale peach, etc.), facial structure (round, angular, square jaw), forehead shape, cheekbone prominence
- Eyes: color if visible, shape (almond, round, hooded), direction of gaze, intensity, eyelids (half-closed, wide open), eyebrows (thick, thin, arched, furrowed, raised)
- Nose: size, shape (button, aquiline, broad, narrow bridge)
- Mouth: open/closed, teeth visible (how many, white/yellow), lip thickness, lip color, any snarl or smirk or neutral
- Facial hair: beard (length, style, color, density, patchy/full), mustache, stubble, clean-shaven
- Hair: style (fade, buzz cut, long flowing, braids, bald, receding), color (jet black, dark brown, dirty blonde, silver grey), texture (curly, straight, wavy, coily), length, any hair accessories
- Ears: visible or hidden, any earrings or accessories
- Neck: visible, thickness, any jewelry (chains, chokers), Adam's apple visible
- Expression decoded: which muscles are engaged — is the corrugator supercilii (brow furrower) active? Is the zygomaticus major (smile muscle) engaged? Orbicularis oculi (eye squint)? Describe the EMOTION conveyed.
- Clothing: exact garment type, exact colors (not just "red" but "bright cherry red with thin white horizontal pinstripes"), collar style, any logos/crests/numbers/text on clothing, sleeve visibility, fabric texture (shiny polyester, matte cotton, leather, silk)
- Body: angle to camera (facing straight, quarter turn, three-quarter turn, profile), shoulder position, lean direction, how much of the body is visible (head only, head and shoulders, down to chest, down to waist)
- Lighting ON this person: where is the key light coming from (left, right, above, behind), fill light, rim/edge light (which side, color, intensity), any colored light cast on their face (red glow, blue tint), shadow patterns on face (under nose, under chin, cheekbone shadow)

BACKGROUND:
- What is the actual setting/location (stadium, room, abstract, gradient, outdoor scene, etc.)
- Blur level (pin-sharp, slight defocus, moderate bokeh, completely blown-out bokeh)
- Every color visible in the background and where it appears
- Light sources in the background (lamps, spotlights, windows, neon, sun, stadium floodlights)
- Atmospheric effects (haze, fog, smoke, dust particles, rain, light rays, God rays, lens flare locations)
- Any objects, structures, or patterns visible even through blur (goalposts, crowd shapes, buildings, trees)
- Gradient directions (does it go dark at edges and light in center? Dark at bottom, light at top?)
- Vignette: is there darkening at the corners/edges? How strong? Which corners?

EVERY TEXT ELEMENT (for each piece of text):
- The EXACT text verbatim, preserving capitalization
- Position: where exactly is it anchored in the frame
- Size: relative to the frame (does it span the full width? Half? A quarter?)
- Font characteristics: weight (thin, regular, bold, black, ultra-heavy), width (condensed, normal, extended), serif vs sans-serif, style family (looks like Impact, looks like Bebas Neue, looks like Futura, custom)
- Color of the text fill
- Outline/stroke: is there one? Color, thickness (thin hairline, medium, thick chunky)
- Shadow: direction, color, blur amount, offset distance
- Glow: any outer glow effect? Color?
- Background behind text: is the text floating on the image, or does it sit on a colored bar/banner/shape?
- Letter spacing: tight/normal/wide
- Any distortion, perspective, rotation, curve, or warp on the text

EVERY GRAPHIC ELEMENT (logos, icons, dividers, shapes, borders, banners):
- What it is (team logo, channel logo, VS divider, colored bar, decorative line, badge, arrow, emoji)
- Exact position and size relative to frame
- Colors, gradients, borders
- Any text inside it
- Opacity (solid, semi-transparent, ghosted)

COLOR & LIGHT ANALYSIS:
- The dominant color (the color that takes up the most area)
- The accent/pop color (the color that grabs attention)
- Secondary colors
- Color temperature overall (warm golden, cool blue, neutral, mixed — left side warm / right side cool)
- Contrast level (low/medium/high/extreme — are the darks truly black? Are the highlights blown out white?)
- Saturation level (muted/natural/saturated/hyper-saturated/selectively saturated)
- Any color grading or filters applied (teal-and-orange grade, vintage warm, cold clinical, etc.)

EDGES & DETAILS:
- Are subject edges crisp and sharp or soft and blended into the background?
- Any visible compositing artifacts (hard cutout edges, halo around hair, etc.)
- Skin texture: smooth airbrushed or detailed with visible pores
- Fabric detail level
- Any watermarks, channel logos, or small branding elements

Return as plain JSON:
{
  "forensic_description": "Your 800+ word exhaustive description here. Every person, every text, every color, every shadow, every strand of hair, every graphic element. Miss NOTHING."
}`, finalThumbUrl, 0.2, 16384);

    // PHASE 2: Use the forensic description to generate structured analysis + AI image prompt
    const analysis = await callGeminiWithImage(`You are given a FORENSIC PIXEL-BY-PIXEL DESCRIPTION of a YouTube thumbnail (below), AND you can also see the actual thumbnail image. Your job is to produce a structured analysis AND an AI image generation prompt.

=== FORENSIC DESCRIPTION (from Phase 1) ===
${forensicDescription.forensic_description}

=== RULES FOR THE "recreate_prompt" ===
The recreate_prompt is what an AI IMAGE GENERATOR will use. It must follow these rules:
- Think in VISUAL CONCEPTS and DESCRIPTIVE LANGUAGE
- NEVER use percentages, pixel coordinates, opacity values, hex codes, or border-radius
- Use SPATIAL RELATIONSHIPS: "anchored at the top center", "filling the left third", "spanning the bottom edge"
- Use PHOTOGRAPHY LANGUAGE: "extreme close-up", "rim lighting on left profile", "shallow depth of field"
- Use ARCHETYPE descriptions: "bald man with intense expression and dark goatee" NOT "person in red"
- Use COLOR NAMES: "crimson red", "electric blue" — never hex codes
- Describe text+container as ONE design unit: "a red pill-shaped badge containing white text 'LIVE'"
- MAX 2-3 text elements in the prompt. Consolidate where possible.
- Include "graphic design composition" to force flat 2D text overlays

MANDATORY: The recreate_prompt MUST explicitly state "16:9 aspect ratio, 1280x720 resolution, widescreen landscape format" at the very beginning. All YouTube thumbnails are 16:9 wide format.

The recreate_prompt should be 400+ words and incorporate ALL the forensic details — every person's archetype, expression muscles, hair, clothing details, rim lighting, background atmosphere, text design, color grading. It must read like a hyper-detailed creative brief.

RESPOND IN THIS EXACT JSON:
{
  "detailed_description": "The full forensic description reformatted into a readable narrative — 600+ words covering every visual element",
  "layout_type": "split-screen face-off / centered hero / reaction / before-after / etc",
  "layers": {
    "background": {
      "setting": "what the location is",
      "blur": "sharp / soft focus / heavy bokeh",
      "mood": "dark and moody / bright and energetic",
      "lighting": "description of all light sources and their effects",
      "atmosphere": "haze, particles, lens flare, vignette details",
      "colors": "every color visible in the background by name",
      "description": "Full exhaustive background description"
    },
    "midground": {
      "subjects": [
        {
          "archetype": "full physical archetype: age, ethnicity, build, skin tone, face shape",
          "hair": "style, color, texture, length",
          "expression": "exact expression with facial muscle details",
          "clothing": "garment type, exact color names, patterns, logos, fabric",
          "pose": "body angle, shoulder position, lean direction",
          "lighting_on_subject": "key light direction, rim light, colored light cast",
          "depth_cue": "how depth is conveyed (smaller, further back, slightly defocused)"
        }
      ],
      "description": "Full mid-ground description"
    },
    "foreground": {
      "left_subject": {
        "archetype": "full physical description: age, ethnicity, build, skin tone, face shape, jaw, cheekbones",
        "hair": "style, color, texture, length, hairline",
        "facial_hair": "beard style, length, color, density / clean-shaven",
        "eyes": "color, shape, gaze direction, intensity, eyelid position, eyebrow position",
        "mouth": "open/closed, teeth visible, lip details, expression",
        "expression_decoded": "which facial muscles are active and what emotion it conveys",
        "clothing": "exact garment with detailed color names, patterns, logos, collar, fabric texture",
        "crop": "how much is visible and how they fill the frame",
        "facing": "exact angle and direction",
        "rim_light": "which side, color, intensity, separation effect",
        "skin_detail": "texture quality, any shadows, color cast on skin",
        "description": "Full flowing description of this person"
      },
      "right_subject": {
        "archetype": "full physical description",
        "hair": "style, color, texture",
        "facial_hair": "details",
        "eyes": "details",
        "mouth": "details",
        "expression_decoded": "facial muscle analysis and emotion",
        "clothing": "full details",
        "crop": "framing details",
        "facing": "angle and direction",
        "rim_light": "details",
        "skin_detail": "texture and lighting",
        "description": "Full flowing description"
      }
    },
    "text_and_graphics": {
      "elements": [
        {
          "text": "EXACT TEXT verbatim with capitalization",
          "type": "title / badge / banner / label",
          "position": "where in the frame using spatial language",
          "font": "weight, width, style family",
          "color": "fill color name",
          "outline": "stroke details if any",
          "shadow": "shadow details if any",
          "glow": "glow details if any",
          "background_shape": "what sits behind the text (colored bar, pill shape, banner, nothing)",
          "description": "Complete single-unit description combining text + container + effects"
        }
      ]
    }
  },
  "styling": {
    "render_quality": "HDR photography, 4K, skin texture level, etc",
    "aesthetic": "overall visual style name",
    "contrast": "level and character of contrast",
    "saturation": "level and any selective saturation",
    "color_grading": "any overall color grade or filter applied",
    "rim_lighting": "global rim lighting approach",
    "color_temperature": "warm / cool / mixed / split",
    "skin_texture": "smooth airbrushed / detailed pores / hyper-real",
    "edge_quality": "crisp cutout / soft blended / natural"
  },
  "color_palette": ["color name 1", "color name 2", "color name 3", "color name 4", "color name 5"],
  "layout_breakdown": "Spatial description of what fills each zone of the frame",
  "typography": {
    "text_shown": "ALL text verbatim",
    "font_style": "detailed font description",
    "font_color": "color with effects",
    "font_effects": "all effects in descriptive words"
  },
  "emotional_hook": "What emotion this triggers and the psychology behind it",
  "style_category": "sports / gaming / cinema / reaction / tutorial / documentary",
  "ctr_analysis": "Why this composition makes it impossible to scroll past",
  "recreate_prompt": "A COMPLETE 400+ word natural-language AI image generation prompt that incorporates ALL forensic details. Start with 'A high-detail 4K YouTube thumbnail graphic design composition.' Then describe composition type → every foreground person (archetype, hair, facial hair, skin, expression muscles, clothing details, crop, rim lighting) → mid-ground subjects with depth → background with blur, atmosphere, light sources, colors → text as unified design units (max 2-3) → overall color grading, contrast, saturation, render quality. Use color names, spatial relationships, photography terms. NO percentages, NO hex, NO pixels.",
  "generic_template": "Fill-in-the-blank version preserving all spatial, lighting, and style descriptors. Replace subjects with [SUBJECT A], [SUBJECT B], etc.",
  "editable_elements": {
    "background_description": "Natural language background",
    "subject_description": "Main subject archetypes with all physical details",
    "text_overlay": "All text shown verbatim",
    "accent_color": "the eye-catching color name",
    "mood": "Overall mood/vibe"
  }
}`, finalThumbUrl, 0.3, 16384);

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