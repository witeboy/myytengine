import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// ANALYZE YOUTUBE THUMBNAIL — Template DNA Forensics
// Maps any thumbnail to the 26-template vault
// Extracts face/emotion specs, composition rules, CTR psychology
// Output: recreate_prompt + template_match + shorts_detection
// ══════════════════════════════════════════════════════════════════

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
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
  }
  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");

  const text = data.candidates[0].content.parts[0].text;
  let jsonStr = text;
  if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

  jsonStr = jsonStr
    .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');

  try { return JSON.parse(jsonStr); } catch (_) {}
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) try { return JSON.parse(objMatch[0]); } catch (_) {}
  throw new Error("Failed to parse Gemini response as JSON");
}

// ── Template DNA Reference for matching ────────────────────────────
const TEMPLATE_REFERENCE = `
TEMPLATE VAULT — 26 Templates × 7 Niches
Map this thumbnail to the closest matching template:

FINANCE (8): shock_face | income_reveal | warning_alert | secret_hidden | breaking_news | before_after | numbered_list | identity_challenge
FINANCE EXTENDED (3): finance_versus | lifestyle_proof | finance_audit
STORYTELLING (2): cliffhanger | true_account
TRUE CRIME (2): cold_case_file | suspect_reveal
LOVE & RELATIONSHIPS (2): heartbreak_headline | relationship_red_flag
TRAVEL (2): destination_wow | hidden_gem
IT & AI (3): ai_takeover | cheat_code_reveal | tech_comparison
MOVIES & RECAP (3): plot_twist_tease | deep_lore_dive | reaction_recap
UNIVERSAL (1): shorts_hook_frame

TEMPLATE FACE/EMOTION SPECS:
- shock_face: EXTREME SHOCK — eyes blown wide, eyebrows maximum arch, jaw dropped in O shape, both hands to cheeks
- income_reveal: PROUD CONFIDENCE — chest out, chin raised, calm knowing smile of someone who figured it out
- warning_alert: URGENT WARNING — intense stare into camera, eyebrows furrowed, jaw set, pointing finger at viewer
- secret_hidden: CONSPIRATORIAL WHISPER — finger to lips, sideways glance, knowing half-smile, sharing forbidden knowledge
- breaking_news: URGENT PRESENTER — pointing at screen/chart, leaning toward camera, wide awake urgency
- before_after: LEFT=defeated/stressed/hunched | RIGHT=confident/liberated/smiling
- identity_challenge: DIRECT ACCUSATORY — eye contact, raised single eyebrow, pointing finger at lens, half-smirk
- cliffhanger: TENSE ANTICIPATION — eyes wide looking OFF-FRAME, jaw tensed, frozen mid-gesture, NOT at camera
- cold_case_file: HAUNTED — troubled expression, dark circles, looking down or away, residual fear
- suspect_reveal: HALF-SHADOWED AMBIGUITY — exactly half face in shadow, one eye visible with penetrating gaze
- heartbreak_headline: RAW EMOTIONAL PAIN — red-rimmed eyes, trembling lip, chin dimpled, shoulders collapsed, zero performance
- relationship_red_flag: PROTECTIVE WARNING — raised eyebrow + caring urgency, stop gesture, trusted friend intervening
- destination_wow: AWESTRUCK JOY — jaw slightly dropped, eyes wide with genuine wonder, arms spread embracing view
- hidden_gem: DISCOVERER'S EXCITEMENT — breathless joy, pointing at discovery, sharing-a-secret energy
- ai_takeover: ALARMED URGENCY — wide eyes of someone who saw the threat, raised stop-hand at camera, forward lean
- cheat_code_reveal: CONSPIRATORIAL SECRET SHARER — leaning forward, one eyebrow raised, half-smile of giving forbidden access
- plot_twist_tease: MIND-BLOWN MAXIMUM — both hands on head, eyes ABSOLUTELY maximum width, mouth in O, leaning back from impact
- reaction_recap: COMPLETELY AUTHENTIC UNFILTERED — real tears, genuine open-mouth laugh OR hand covering mouth in gasp, ZERO performance
- finance_versus: DECISIVE AUTHORITY — arms crossed, confident half-smile of someone who's tested both options and knows the answer. No face required — split design with VS divider
- lifestyle_proof: CASUAL ABUNDANT CONFIDENCE — one hand casually on luxury item, other in pocket, body language of someone for whom wealth is now ordinary. NOT flexing.
- finance_audit: AUDITOR'S HORROR-DISBELIEF — eyes wide squinting as if looking at something painful, head tilted back, hand raised to temple/jaw, mouth in grimace of 'HOW did this happen'. The Caleb Hammer face. Pained disbelief mixed with dark humor.
- shorts_hook_frame: EXTREME version of video's core emotion, fills 80%+ of vertical 9:16 frame
`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { youtube_url, project_id } = await req.json();

    // ── Extract video ID ──────────────────────────────────────────
    let videoId = '';
    if (youtube_url.includes('youtu.be/')) videoId = youtube_url.split('youtu.be/')[1].split('?')[0];
    else if (youtube_url.includes('v=')) videoId = youtube_url.split('v=')[1].split('&')[0];
    else if (youtube_url.includes('/shorts/')) videoId = youtube_url.split('/shorts/')[1].split('?')[0];
    if (!videoId) return Response.json({ error: 'Could not extract YouTube video ID' }, { status: 400 });

    // Detect Shorts from URL
    const isShorts = youtube_url.includes('/shorts/');
    const dimensionSpec = isShorts
      ? "1080x1920 Full HD 9:16 vertical YouTube Shorts thumbnail, graphic design composition"
      : "1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail, graphic design composition";

    // ── Get highest res thumbnail ────────────────────────────────
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    let finalThumbUrl = thumbnailUrl;
    try {
      const test = await fetch(thumbnailUrl, { method: 'HEAD' });
      if (!test.ok) finalThumbUrl = fallbackUrl;
    } catch { finalThumbUrl = fallbackUrl; }

    console.log(`Analyzing thumbnail: ${videoId} | Shorts: ${isShorts}`);

    // ══════════════════════════════════════════════════════════════
    // PHASE 1: EXHAUSTIVE FORENSIC PIXEL DESCRIPTION
    // ══════════════════════════════════════════════════════════════
    const forensicDescription = await callGeminiWithImage(`You are a FORENSIC IMAGE ANALYST with expertise in portrait photography, facial anatomy, and YouTube thumbnail psychology. Describe this thumbnail with ABSOLUTE EXHAUSTIVE DETAIL — as if documenting every pixel for someone who must recreate it perfectly.

MINIMUM 800 WORDS. Scan from top-left to bottom-right. Leave NOTHING out.

═══ STEP 1: PERSON COUNT (DO THIS FIRST) ═══
Count EVERY person/face visible. State EXACT number.
Label each: Person 1, Person 2 left-to-right.
State PRECISELY which zone each occupies.

═══ STEP 2: OVERALL COMPOSITION ═══
- "There are exactly [N] people in this image."
- For each person: exact zone (left/center/right third, upper/middle/lower)
- Layout structure (split screen, centered, rule of thirds, diagonal)
- Visual hierarchy: biggest → smallest, overlaps
- Geometric shapes formed by the composition

═══ STEP 3: EVERY PERSON — FOR EACH: ═══

IDENTITY & POSITION:
- Exact zone in frame, percentage of frame occupied

FACE/EMOTION (CRITICAL — describe with muscle-level precision):
- Skin tone: exact shade name
- Facial structure: shape, cheekbone prominence, forehead width
- Eyes: color, shape (almond/round/hooded/deep-set), gaze direction, intensity, eyebrow shape/arch/position/height
- Nose: size, shape (button/aquiline/broad/flat/pointed)
- Mouth: open/closed, teeth visible, lip details, expression
- Facial hair: style, color, length, density
- EXPRESSION DECODED: which muscles are engaged (corrugator supercilii, zygomaticus major, orbicularis oculi, etc.), exact emotion convey, eye squint level, brow position, mouth corners
- Can this expression stop a scroll? Would it be readable at 120px thumbnail size?

HAIR: style, color, texture, length, direction, any coverings

ACCESSORIES: glasses (frame shape/color/lens), earrings, chains, piercings — exact detail

CLOTHING (EXTREMELY specific):
- Exact garment type, EXACT colors with detail (not "red" but "bright cherry red with white pinstripes")
- ALL visible logos, text, numbers, insignias — exact position
- Pattern: solid/striped/checkered/etc.
- Fabric texture, fit, layering

BODY & POSE:
- Angle to camera, shoulder position, lean direction, visible body portion
- Hand positions, gestures — what story does the pose tell?
- Is this character ACTIVE (doing something) or PASSIVE (just standing)?

LIGHTING ON THIS PERSON:
- Key light direction, rim/edge light (which side, color, intensity)
- Any colored light cast on face (warm orange glow, cool blue tint)
- Shadow patterns (under nose, under chin, cheekbone shadow)

═══ STEP 4: BACKGROUND ═══
- Setting/location, blur level (sharp/slight/moderate/blown-out)
- Every color visible and where
- Light sources, atmospheric effects (haze, fog, particles, lens flare, god rays)
- Vignette (which edges, strength), gradient directions

═══ STEP 5: EVERY TEXT ELEMENT ═══
- EXACT text verbatim with capitalization
- Position, size relative to frame
- Font: weight, width, serif/sans-serif, style family
- Color, outline/stroke, shadow, glow
- Background behind text (banner/bar/floating/shape)

═══ STEP 6: GRAPHIC ELEMENTS ═══
- Logos, icons, dividers, shapes, borders, banners, emojis
- Position, size, colors, gradients, opacity

═══ STEP 7: COLOR & LIGHT ANALYSIS ═══
- Dominant, accent, secondary colors
- Color temperature (warm/cool/mixed/split)
- Contrast level, saturation, color grading/filters

═══ STEP 8: CTR ASSESSMENT ═══
- Does the face expression stop the scroll at 120px?
- What is the psychological hook (curiosity gap / loss aversion / mirror neurons / social proof)?
- What template type does this match from the vault?

${isShorts ? "NOTE: This is a YouTube SHORTS thumbnail (9:16 vertical). Describe the vertical composition — how text fills the top 30%, how the subject fills the bottom 70%." : "NOTE: This is a standard 16:9 horizontal thumbnail."}

Return as plain JSON:
{
  "forensic_description": "Your 800+ word exhaustive description. Start with 'There are exactly [N] people.' Cover every detail.",
  "face_count": 0,
  "has_face": true,
  "is_shorts_format": ${isShorts},
  "face_expression_summary": "What exact expression is being used — muscle-level detail",
  "expression_scroll_stop_rating": "1-10 — how well does this face stop the scroll at 120px?",
  "ctr_hook_type": "curiosity_gap / loss_aversion / shock / social_proof / emotional_contagion / information_gap / etc"
}`, finalThumbUrl, 0.2, 16384);

    // ══════════════════════════════════════════════════════════════
    // PHASE 2: TEMPLATE DNA MAPPING + STRUCTURED ANALYSIS
    // ══════════════════════════════════════════════════════════════
    const analysis = await callGeminiWithImage(`You are given a FORENSIC PIXEL-BY-PIXEL DESCRIPTION of a YouTube thumbnail AND you can see the actual thumbnail. Your job is to:
1. Map this thumbnail to the closest template from our vault
2. Produce a structured analysis with full CTR psychology
3. Generate a world-class recreate_prompt for Ideogram V3

${TEMPLATE_REFERENCE}

═══ FORENSIC DESCRIPTION FROM PHASE 1 ═══
${forensicDescription.forensic_description}

═══ FACE/EMOTION DATA FROM PHASE 1 ═══
Face count: ${forensicDescription.face_count}
Expression: ${forensicDescription.face_expression_summary}
CTR hook type: ${forensicDescription.ctr_hook_type}
Expression scroll-stop rating: ${forensicDescription.expression_scroll_stop_rating}/10

═══ FORMAT ═══
${isShorts ? "SHORTS FORMAT: 9:16 vertical. First frame IS the thumbnail. Text fills top 30%, subject bottom 70%." : "STANDARD FORMAT: 16:9 horizontal, 1920x1080."}

═══ RULES FOR recreate_prompt ═══
- ALL text overlays in "DOUBLE QUOTATION MARKS" — Ideogram ONLY renders quoted text
- MUST start with: "${dimensionSpec}."
- If contains real people: add photorealism block immediately after: "Photorealistic photograph, DSLR camera shot, real human skin with visible pores, professional portrait photography, NOT illustration, NOT cartoon, NOT 3D render, NOT anime."
- Face/emotion description MUST use the EXACT muscle-level detail from our forensic description — this is what determines CTR
- 400+ words
- NO hex codes — use color names
- NO pixel/percentage values
- End with: "Critical text overlays that MUST appear: [list each in quotes]"

═══ FACE/EMOTION LAW ═══
The face expression in the recreate_prompt is the #1 CTR driver. A generic expression = 2% CTR. The exact correct expression = 10% CTR.
Always describe the expression with:
- Specific muscles engaged
- Eye configuration (width, gaze direction, squint level)
- Eyebrow position (arch height, furrowing, inner vs outer corners)
- Mouth position (jaw drop level, lip configuration, teeth visibility)
- Body language that amplifies the emotion

RESPOND IN THIS EXACT JSON:
{
  "template_matched": "The template ID from the vault that best matches this thumbnail (e.g. shock_face, plot_twist_tease)",
  "template_match_confidence": "1-10",
  "template_match_reasoning": "Why this matches the template — what specific elements align",
  "face_emotion_spec": "The exact face/emotion specification extracted from this thumbnail — describe it as a template spec that could be used to recreate this expression in any other thumbnail",
  "ctr_psychology": "The specific psychological mechanism this thumbnail uses to force clicks",
  "detailed_description": "600+ word narrative covering every visual element and WHY each drives CTR",
  "layout_type": "split-screen / centered-hero / reaction / before-after / bold-statement / etc",
  "layers": {
    "background": {
      "setting": "what the location/environment is",
      "blur": "sharp / soft focus / heavy bokeh",
      "mood": "emotional mood of the background",
      "lighting": "all light sources and their effects",
      "atmosphere": "haze, particles, lens flare, vignette details",
      "colors": "every background color by name",
      "description": "Full background description"
    },
    "foreground": {
      "subject_count": "EXACT number of people",
      "spatial_arrangement": "How subjects are positioned — precise zones and grouping",
      "subjects": [
        {
          "position_in_frame": "EXACT zone (left-third/center/right-third, upper/middle/lower)",
          "archetype": "full physical description: age, ethnicity, build, skin tone, face shape",
          "hair": "style, color, texture, length",
          "facial_hair": "style, color, density / clean-shaven",
          "expression_muscles": "DETAILED muscle-level expression: which muscles, eye config, brow position, mouth state",
          "emotion_conveyed": "exact emotion and its CTR function",
          "expression_authenticity": "authentic/staged/forced — this matters for CTR",
          "clothing": "exact garment, color names, patterns, logos",
          "pose_and_action": "body language, gesture, what they're DOING (active not passive)",
          "rim_light": "side, color, intensity, separation effect",
          "crop": "how much of body is visible",
          "facing": "angle to camera"
        }
      ],
      "description": "Full foreground description"
    },
    "text_and_graphics": {
      "elements": [
        {
          "text": "EXACT TEXT verbatim",
          "type": "title / badge / banner / label",
          "position": "spatial position",
          "font": "weight, width, style family",
          "color": "fill color name",
          "outline": "stroke details",
          "shadow": "shadow details",
          "background_shape": "what sits behind the text",
          "ctr_function": "what psychological trigger this text serves",
          "curiosity_gap_rating": "1-10 — does this create a curiosity gap?",
          "description": "Complete single-unit description"
        }
      ]
    }
  },
  "styling": {
    "render_quality": "HDR photography / cinematic / editorial / etc",
    "aesthetic": "visual style name",
    "contrast": "level and character",
    "color_grading": "overall grade/filter",
    "color_temperature": "warm / cool / mixed / split",
    "edge_quality": "crisp cutout / soft blended / natural"
  },
  "color_palette": ["color1", "color2", "color3", "color4", "color5"],
  "typography": {
    "text_shown": "ALL text verbatim",
    "font_style": "detailed font description",
    "font_color": "color with effects",
    "font_effects": "all effects"
  },
  "is_shorts_format": ${isShorts},
  "shorts_analysis": "${isShorts ? 'How the vertical composition works — top 30% text zone, bottom 70% subject zone, scroll-stop first frame' : 'N/A'}",
  "scroll_stop_analysis": "WHY this thumbnail stops the scroll in under 0.3 seconds — be specific about what the eye hits first",
  "ctr_weaknesses": "What could be improved for higher CTR — be honest",
  "ctr_strengths": "What makes this impossible to scroll past",
  "contains_real_people": true,
  "quality_score": 9,
  "recreate_prompt": "400+ word Ideogram prompt starting with '${dimensionSpec}.' then photorealism block if needed, then composition, then each person with exact muscle-level expression description, then background, then text in DOUBLE QUOTATION MARKS, then: 'Critical text overlays: [list in quotes]'",
  "generic_template": "Fill-in-the-blank version preserving all spatial/lighting/style rules. Replace subjects with [SUBJECT A], [SUBJECT B], etc. Text with [TEXT OVERLAY]",
  "editable_elements": {
    "background_description": "Natural language background",
    "subject_description": "Main subject archetypes with physical details",
    "text_overlay": "All text verbatim",
    "accent_color": "eye-catching color name",
    "mood": "overall mood/vibe",
    "face_emotion_to_swap": "The expression spec — easiest element to customize per content"
  }
}`, finalThumbUrl, 0.3, 16384);

    console.log(`Template matched: ${analysis.template_matched} (${analysis.template_match_confidence}/10)`);
    console.log(`Face emotion: ${analysis.face_emotion_spec?.substring(0, 100)}...`);

    return Response.json({
      success: true,
      thumbnail_url: finalThumbUrl,
      video_id: videoId,
      is_shorts: isShorts,
      template_match: {
        template_id: analysis.template_matched,
        confidence: analysis.template_match_confidence,
        reasoning: analysis.template_match_reasoning,
        face_emotion_spec: analysis.face_emotion_spec,
        ctr_psychology: analysis.ctr_psychology
      },
      analysis
    });

  } catch (error) {
    console.error('analyzeYouTubeThumbnail error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});