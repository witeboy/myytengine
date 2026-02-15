import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function callGeminiWithImage(prompt, imageUrl, temperature = 0.7) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  // Fetch image and convert to base64
  const imgResp = await fetch(imageUrl);
  const imgBuf = await imgResp.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
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

    // Analyze the thumbnail with Gemini Vision
    const analysis = await callGeminiWithImage(`You are a world-class YouTube thumbnail analyst and designer. Analyze this YouTube thumbnail in extreme detail so another AI can recreate it perfectly.

Describe EVERY element:
1. Layout & Composition - exact positioning of elements (left/right/center, foreground/background)
2. Colors - dominant colors, gradients, contrast levels, color temperature
3. Typography - font style (bold/thin/serif/sans), size relative to image, color, effects (outline, shadow, glow), exact text shown
4. Facial expressions & people - age, emotion, angle, lighting on face
5. Objects & props - what objects are visible, their placement
6. Background - what's behind, blur level, style
7. Visual effects - any overlays, arrows, circles, emojis, borders, glow effects
8. Emotional hook - what emotion does this thumbnail trigger (curiosity, shock, fear, excitement)
9. Style category - is this cinema, minimal, documentary, reaction, tutorial, storytime

Generate a DETAILED image generation prompt that would recreate this thumbnail style for a different video topic.

RESPOND IN THIS EXACT JSON FORMAT:
{
  "detailed_description": "Comprehensive description of every visual element",
  "layout_breakdown": "How elements are arranged spatially",
  "color_palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "typography": {
    "text_shown": "exact text on thumbnail",
    "font_style": "bold sans-serif / thin serif / etc",
    "font_color": "#hex",
    "font_effects": "outline, shadow, glow, etc"
  },
  "emotional_hook": "What emotion this triggers and why",
  "style_category": "cinema / minimal / documentary / reaction / tutorial",
  "ctr_analysis": "Why this thumbnail would get clicks - what makes it impossible to scroll past",
  "recreate_prompt": "Detailed AI image generation prompt to recreate this EXACT style for a different topic. Include composition, colors, lighting, effects, text placement style.",
  "editable_elements": {
    "background_description": "Describe background for editing",
    "subject_description": "Describe the main subject/person",
    "text_overlay": "The text shown",
    "accent_color": "#hex of most eye-catching color",
    "mood": "The overall mood/vibe"
  }
}`, finalThumbUrl, 0.5);

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