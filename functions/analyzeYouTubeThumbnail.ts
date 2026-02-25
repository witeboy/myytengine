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
    const forensicDescription = await callGeminiWithImage(`You are a FORENSIC IMAGE ANALYST with expertise in portrait photography, fashion, and facial anatomy. Your job is to describe this YouTube thumbnail with ABSOLUTE EXHAUSTIVE DETAIL — as if you are documenting every single pixel for someone who is completely blind and must recreate it perfectly.

=== YOUR MISSION ===
Write a MINIMUM 800-word description covering EVERY visible detail. Leave NOTHING out. Describe it as if you're scanning the image from top-left to bottom-right, pixel row by pixel row.

=== STEP 1: PERSON COUNT (DO THIS FIRST) ===
Before ANYTHING else, count EVERY person/face visible in the image. State the EXACT number.
Then for EACH person, assign a label (Person 1, Person 2, etc.) going LEFT to RIGHT across the frame.
State PRECISELY which side/zone each person occupies. If 2+ people share the same side, say so explicitly.
Do NOT assume a split-screen = one person per side. COUNT CAREFULLY.

=== STEP 2: OVERALL COMPOSITION ===
- FIRST: "There are exactly [N] people in this image."
- For each person: "Person [X] is positioned in the [left third / center / right third] of the frame."
- Layout structure (split screen, centered, rule of thirds, diagonal, asymmetric, etc.)
- What occupies each zone: top-left, top-center, top-right, center-left, dead-center, center-right, bottom-left, bottom-center, bottom-right
- Visual hierarchy: what is BIGGEST, what is SMALLEST, what overlaps what
- Geometric shapes formed by the composition (triangles, diagonals, V-shapes)

=== STEP 3: EVERY PERSON (for each person, describe ALL of the following) ===

IDENTITY & POSITION:
- Label (Person 1, Person 2, etc.)
- EXACT zone in the frame (left third / center / right third, upper / middle / lower)
- Whether they share a side with another person
- How much of the frame they occupy (percentage estimate)
- Scale relative to others (largest, smallest, similar size)

FACE & FEATURES:
- Skin tone: exact shade (light olive, deep brown, pale peach, caramel, mahogany, etc.)
- Facial structure: round, angular, square jaw, heart-shaped, oval — cheekbone prominence, forehead width
- Eyes: color if visible, shape (almond, round, hooded, deep-set), gaze direction, intensity, eyelids position, eyebrow shape/thickness/arch/position
- Nose: size, shape (button, aquiline, broad, narrow bridge, flat, pointed)
- Mouth: open/closed, teeth visible (how many, whiteness), lip thickness upper vs lower, lip color, expression (smirk, grin, neutral, grimace)
- Facial hair: beard (full, goatee, stubble, patchy, none), mustache, exact color, length, density, style
- Skin details: scars, moles, wrinkles, dimples, acne, shine/sweat, makeup if any

HAIR:
- Style (fade, buzz cut, afro, braids, locs, bald, receding, combover, slicked back, natural curls, etc.)
- Color (jet black, dark brown, dirty blonde, silver grey, dyed — what color?)
- Texture (coily, curly, wavy, straight, kinky)
- Length, volume, part direction
- Any head coverings: caps, hats, beanies, durags, turbans, headbands — exact color and style

ACCESSORIES ON FACE/HEAD:
- Glasses/sunglasses: frame shape (aviator, round, rectangular, wayfarer), frame color, lens color/tint, reflections visible in lenses
- Earrings: type (stud, hoop, dangly), color, which ear(s)
- Piercings: location, type
- Any other face/head accessories

EXPRESSION DECODED:
- Which facial muscles are engaged (corrugator supercilii, zygomaticus major, orbicularis oculi, etc.)
- The specific EMOTION conveyed (joy, intensity, confidence, shock, smugness, defiance, etc.)
- Eye squint level, brow position, mouth corners

CLOTHING (be EXTREMELY specific):
- Exact garment type (t-shirt, polo, blazer, hoodie, jersey, suit jacket, agbada, dashiki, etc.)
- EXACT colors with detail (not just "red" but "bright cherry red with thin white horizontal pinstripes")
- Collar style (crew neck, V-neck, button-down, mandarin, etc.)
- ALL visible logos, crests, insignias, brand names, numbers, text on the clothing — describe exact position and appearance
- Pattern details (solid, striped, checkered, floral, geometric, camo, tie-dye)
- Fabric texture (shiny polyester, matte cotton, leather, silk, denim, velvet, linen)
- Sleeve visibility, fit (tight, loose, oversized)
- Any layering (jacket over shirt, chain over clothing, etc.)

BODY & POSE:
- Angle to camera (facing straight, quarter turn, three-quarter, profile)
- Shoulder position, lean direction
- How much of the body is visible (head only, head and shoulders, down to chest, waist, full body)
- Hand positions if visible, gestures

LIGHTING ON THIS PERSON:
- Key light direction (left, right, above, behind)
- Rim/edge light (which side, color, intensity, separation effect)
- Any colored light cast on their face (warm orange glow, cool blue tint, red cast)
- Shadow patterns on face (under nose, under chin, cheekbone shadow)

=== STEP 4: BACKGROUND ===
- Setting/location (studio, room, outdoor, abstract, gradient, etc.)
- Blur level (sharp, slight defocus, moderate bokeh, completely blown-out)
- Every color visible and where it appears
- Light sources (lamps, spotlights, windows, neon, natural light)
- Atmospheric effects (haze, fog, smoke, particles, lens flare, God rays)
- Objects/structures visible even through blur
- Gradient directions, vignette (which edges, strength)

=== STEP 5: EVERY TEXT ELEMENT ===
- EXACT text verbatim with capitalization
- Position in frame, size relative to frame
- Font: weight, width, serif/sans-serif, style family
- Color, outline/stroke, shadow, glow
- Background behind text (banner, bar, floating, shape)
- Letter spacing, any distortion/rotation/perspective

=== STEP 6: EVERY GRAPHIC ELEMENT ===
- Logos, icons, dividers, shapes, borders, banners, emojis
- Position, size, colors, gradients, opacity
- Any text inside graphic elements

=== STEP 7: COLOR & LIGHT ANALYSIS ===
- Dominant, accent, and secondary colors
- Color temperature (warm/cool/mixed/split)
- Contrast level, saturation level
- Color grading or filters applied

=== STEP 8: EDGES & DETAILS ===
- Subject edge quality (crisp cutout, soft blend, natural)
- Compositing artifacts visible
- Skin texture quality, fabric detail level
- Watermarks, channel logos, small branding

Return as plain JSON:
{
  "forensic_description": "Your 800+ word exhaustive description here. Start with 'There are exactly [N] people in this image.' Then label and describe each person left-to-right. Cover every accessory, every insignia, every color, every shadow. Miss NOTHING."
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
- CRITICAL TEXT RENDERING RULE: ALL text overlays MUST be wrapped in "DOUBLE QUOTATION MARKS" in the prompt. Ideogram V3 ONLY renders text that appears in quotation marks. Write the text EXACTLY as it should appear, e.g. "7 SIDE HUSTLES" not just 7 SIDE HUSTLES.
- EVERY text element must be described with its EXACT visual treatment: font weight, color, background shape/color, outline, shadow, size relative to frame.
- At the END of the recreate_prompt, add a dedicated TEXT BLOCK listing all text overlays again in quotes for reinforcement.

MANDATORY: The recreate_prompt MUST explicitly start with "A high-detail 4K YouTube thumbnail in 16:9 aspect ratio (1280x720), widescreen landscape format, graphic design composition". All YouTube thumbnails are 16:9 wide format. NEVER generate square or portrait format prompts.

=== WORLD-CLASS THUMBNAIL QUALITY CHECKLIST ===
Apply these principles to make the recreate_prompt produce a VIRAL, not educational, thumbnail:
1. CHARACTERS IN ACTION: Describe subjects DOING something (holding, protecting, confronting), not just standing
2. TEXT AS CURIOSITY GAP: If recreating text, ensure it creates a question, not a statement
3. EXTREME COLOR CONTRAST: Warm vs cold sides, heavy vignette, dramatic lighting
4. INTERACTION: Characters must relate to each other (eye contact, confrontation), not stare at camera
5. DEPTH: Heavy bokeh on backgrounds, razor-sharp foreground subjects
6. TEXT PLACEMENT: Text in negative space (bottom center), NEVER covering faces

The recreate_prompt should be 400+ words and incorporate ALL the forensic details — every person's archetype, expression muscles, hair, clothing details, rim lighting, background atmosphere, text design, color grading. It must read like a hyper-detailed creative brief for a CINEMATIC, EMOTIONAL thumbnail that drives clicks.

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
      "subjects": [
        {
          "position_in_frame": "EXACT position: left edge, left-center, dead-center, right-center, right edge — and which zone (top/middle/bottom)",
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
          "scale_relative": "largest in frame / medium / smallest — and overlap with other subjects",
          "description": "Full flowing description of this person"
        }
      ],
      "subject_count": "EXACT number of people in the foreground",
      "spatial_arrangement": "How subjects are arranged: e.g. '2 clustered on the left, 1 isolated on the right' or '3 in a row' or '1 centered large' — be PRECISE about grouping and spacing",
      "description": "Full foreground description including spatial relationships between all subjects"
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
  "layout_breakdown": "PRECISE spatial description: state EXACT number of people visible, which side each person is on, and what fills each zone of the frame. Be specific — e.g. '2 men on the left, 1 man on the right' not '3 men clustered together' if they are split",
  "typography": {
    "text_shown": "ALL text verbatim",
    "font_style": "detailed font description",
    "font_color": "color with effects",
    "font_effects": "all effects in descriptive words"
  },
  "emotional_hook": "What emotion this triggers and the psychology behind it",
  "style_category": "sports / gaming / cinema / reaction / tutorial / documentary",
  "ctr_analysis": "Why this composition makes it impossible to scroll past",
  "recreate_prompt": "A COMPLETE 400+ word natural-language AI image generation prompt that incorporates ALL forensic details. MUST START WITH 'A high-detail 4K YouTube thumbnail in 16:9 aspect ratio (1280x720), widescreen landscape format, graphic design composition.' Then describe composition type → every foreground person (archetype, hair, facial hair, skin, expression muscles, clothing details, crop, rim lighting) → mid-ground subjects with depth → background with blur, atmosphere, light sources, colors → text as unified design units with text in DOUBLE QUOTATION MARKS (max 2-3 text elements) → overall color grading, contrast, saturation, render quality. CRITICAL: Every text overlay MUST be in double quotation marks like \"7 SIDE HUSTLES\" and described with full visual treatment (font, color, background shape, size). At the very END of the prompt, add a line: 'Text overlays that must appear: [list each text in quotes]'. Use color names, spatial relationships, photography terms. NO percentages, NO hex, NO pixels.",
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