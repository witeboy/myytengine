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
    const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    
    let finalThumbUrl = thumbnailUrl;
    try {
      const test = await fetch(thumbnailUrl, { method: 'HEAD' });
      if (!test.ok) finalThumbUrl = fallbackUrl;
    } catch {
      finalThumbUrl = fallbackUrl;
    }

    // Analyze thumbnail using Natural Language Blueprint approach
    const analysis = await callGeminiWithImage(`You are a world-class thumbnail reverse-engineer. Describe this YouTube thumbnail so precisely that an AI IMAGE GENERATOR can reproduce it.

=== CRITICAL RULES ===
- Think in VISUAL CONCEPTS and DESCRIPTIVE LANGUAGE, not code or measurements
- NEVER use percentages, pixel coordinates, opacity values, hex codes, or border-radius — AI generators ignore all of these
- Use SPATIAL RELATIONSHIPS: "anchored at the top center", "filling the left third", "spanning the bottom edge", "smaller in the frame to show depth"
- Use PHOTOGRAPHY LANGUAGE: "extreme close-up", "rim lighting on left profile", "shallow depth of field", "heavy bokeh"
- Use ARCHETYPE descriptions for people: "bald man with intense expression and dark goatee" NOT "person in red"
- Use COLOR NAMES not hex codes: "crimson red", "electric blue", "pure white", "deep black"
- Describe text+container as ONE design unit: "a red pill-shaped badge containing white text 'LIVE'" — never describe box and text separately
- Limit text to 2-3 elements MAX (main title + one banner). AI creates glitchy text with too many elements.
- Tell the AI this is a "graphic design composition" to ensure text renders as flat 2D overlays, not 3D objects

=== ANALYZE BY VISUAL LAYERS ===

BACKGROUND:
What is behind everything? Describe the setting using evocative language. What is the blur level (sharp / soft focus / heavy bokeh)? What is the mood and lighting (dark stadium at night with floodlights / bright kitchen / moody forest)? What color temperature dominates? Any atmospheric effects (lens flare, light rays, particles)?

MID-GROUND:
Who or what occupies the CENTER of the frame? Describe their size relative to the foreground subjects using depth language ("smaller in the frame to create depth", "standing further back"). For each person give their ARCHETYPE: age, build, hair style/color, skin tone, facial hair, distinguishing features. Describe clothing using color names. Describe expressions and poses.

FOREGROUND:
Who dominates the LEFT and RIGHT edges? For EACH person describe:
- ARCHETYPE: "mixed-race man with short dark fade haircut and stubble" / "blonde woman with sharp cheekbones"
- EXPRESSION: "mouth open shouting aggressively" / "jaw clenched with a serious focused stare" / "wide-eyed shock"
- CLOTHING: color names and style ("red and white striped Arsenal jersey", "navy blue suit with gold tie")
- CROP: use "extreme close-up" language — "cropped from mid-chest up, head nearly touching the top edge"
- FACING: "looking intensely to the right" / "turned slightly left with eyes locked on camera"
- RIM LIGHTING: "strong cool-white rim lighting on his left profile, cutting him out from the background" / "warm orange edge glow on her right shoulder"

TEXT & GRAPHICS (maximum 2-3 text elements):
For each, describe as a SINGLE DESIGN UNIT:
- "Massive heavy white Impact font reading 'MATCHDAY' anchored prominently at the top center with a thick black drop shadow"
- "A full-width graphic lower-third banner anchored to the bottom edge — left zone is crimson red containing 'ARSENAL' in bold white, right zone is royal blue containing 'WIGAN' in bold white, separated by a center divider square reading 'VS'"
- "A small red pill-shaped badge containing 'LIVE' in white, tucked directly beneath the main title"

STYLE & RENDER:
Describe the overall aesthetic: "HDR photography", "sports broadcast aesthetic", "YouTube clickbait with high contrast", "hyper-realistic skin textures", "Unreal Engine 5 render", "cinematic documentary", etc.

=== NOW PRODUCE ===

1. "recreate_prompt": A COMPLETE 300+ word flowing AI image generation prompt. NO percentages. NO pixels. NO hex codes. Use color names, spatial relationships, archetype descriptions, photography terms. Structure it as: style declaration → composition type → foreground subjects with expressions/clothing/rim lighting → mid-ground with depth cues → background with blur and mood → text as unified design units → render quality keywords.

2. "generic_template": A fill-in-the-blank version replacing specific subjects/text with [SUBJECT A], [SUBJECT B], [CENTER GROUP], [TITLE], [BOTTOM BANNER], [SETTING], [COLOR A], [COLOR B]. Keep ALL spatial relationships and styling descriptors.

RESPOND IN THIS EXACT JSON:
{
  "detailed_description": "400+ word natural-language description of every visual element using archetype descriptions and spatial relationships — no measurements",
  "layout_type": "split-screen face-off / centered hero / reaction / before-after / etc",
  "layers": {
    "background": {
      "setting": "what the location is in plain language",
      "blur": "sharp / soft focus / heavy bokeh",
      "mood": "dark and moody / bright and energetic / warm and inviting",
      "lighting": "floodlights with lens flare / soft diffused / dramatic side shadows",
      "description": "Full natural-language description"
    },
    "midground": {
      "subjects": [
        {
          "archetype": "older bald Black man / young woman with curly red hair / etc",
          "expression": "serious stare / wide smile / shocked open mouth",
          "clothing": "red hoodie / navy suit / white lab coat",
          "pose": "standing shoulder-to-shoulder / pointing at camera / arms crossed",
          "depth_cue": "smaller in the frame to create depth behind the foreground"
        }
      ],
      "description": "Full natural-language mid-ground description"
    },
    "foreground": {
      "left_subject": {
        "archetype": "specific physical archetype description",
        "expression": "detailed expression using descriptive words",
        "clothing": "color name and style",
        "crop": "extreme close-up, mid-chest up, head nearly touching top edge",
        "facing": "looking intensely to the right",
        "rim_light": "strong cool-white rim lighting on left profile, separating from background",
        "description": "Full flowing description"
      },
      "right_subject": {
        "archetype": "specific physical archetype description",
        "expression": "detailed expression",
        "clothing": "color name and style",
        "crop": "extreme close-up, mid-chest up",
        "facing": "looking aggressively to the left",
        "rim_light": "strong warm rim lighting on right profile",
        "description": "Full flowing description"
      }
    },
    "text_and_graphics": {
      "elements": [
        {
          "description": "Complete single-unit description: 'Massive heavy white Impact font reading TITLE anchored at the top center with thick black drop shadow'",
          "text": "EXACT TEXT",
          "type": "title / badge / banner"
        }
      ]
    }
  },
  "styling": {
    "render_quality": "HDR photography, 4K, hyper-realistic skin textures",
    "aesthetic": "sports broadcast / YouTube clickbait / cinematic documentary",
    "contrast": "high contrast with deep blacks and blown highlights",
    "saturation": "vivid and saturated / desaturated moody / natural",
    "rim_lighting": "strong edge lighting on foreground subjects separating them from background",
    "color_temperature": "warm / cool / mixed"
  },
  "color_palette": ["color name 1", "color name 2", "color name 3", "color name 4", "color name 5"],
  "layout_breakdown": "Left third: [what fills it], Center: [what fills it], Right third: [what fills it], Top zone: [text], Bottom zone: [banner]",
  "typography": {
    "text_shown": "ALL text verbatim",
    "font_style": "heavy Impact / bold Bebas Neue / condensed sans-serif",
    "font_color": "white with thick black outline and heavy drop shadow",
    "font_effects": "described in words: thick outline, heavy shadow, subtle glow"
  },
  "emotional_hook": "What emotion this triggers and the psychology behind it",
  "style_category": "sports / gaming / cinema / reaction / tutorial / documentary",
  "ctr_analysis": "Why this composition makes it impossible to scroll past",
  "recreate_prompt": "A COMPLETE 300+ word natural-language prompt. NO percentages, NO pixels, NO hex. Use color names, spatial relationships, archetype descriptions, photography terms. Must read like a creative brief for a photographer, not a CSS stylesheet.",
  "generic_template": "Fill-in-the-blank: 'A [STYLE] YouTube thumbnail for [TOPIC]. A dramatic [LAYOUT] composition. FOREGROUND: An extreme close-up of [SUBJECT A] in [COLOR A] [CLOTHING], looking [DIRECTION] with [EXPRESSION], lit with [RIM LIGHT]. On the opposite side, [SUBJECT B] in [COLOR B]... MID-GROUND: [CENTER GROUP] smaller in frame... BACKGROUND: A blurred [SETTING] with [MOOD]... TEXT: Massive [FONT] reading [TITLE] anchored at top. [BANNER] spanning the bottom. STYLE: [RENDER KEYWORDS].'",
  "editable_elements": {
    "background_description": "Natural language background",
    "subject_description": "Main subject archetypes",
    "text_overlay": "All text shown verbatim",
    "accent_color": "the eye-catching color name",
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