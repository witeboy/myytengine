import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.7, maxTokens = 8192) {
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

async function analyzeImageWithGemini(imageUrl, conceptDescription, textOverlay) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  // Fetch the image and convert to base64
  const imgResponse = await fetch(imageUrl);
  const imgBuffer = await imgResponse.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
  const mimeType = imgResponse.headers.get('content-type') || 'image/jpeg';

  const prompt = `You are a YouTube thumbnail CTR analysis expert. Analyze this generated thumbnail image and provide a detailed CTR prediction.

CONCEPT: ${conceptDescription || 'N/A'}
INTENDED TEXT OVERLAY: "${textOverlay || 'None'}"

Score each category from 1-10 and provide brief reasoning:

1. VISUAL APPEAL: Color contrast, composition quality, professional look, eye-catching factor
2. TEXT CLARITY: Is text readable at small sizes? Is it legible? Does it create curiosity? (If no text visible, score based on whether the image works without text)
3. EMOTIONAL IMPACT: Does it trigger curiosity, shock, fear, excitement? How strong is the emotional hook?
4. SUBJECT FOCUS: Is there a clear focal point? Is the subject compelling?
5. SCROLL-STOP POWER: Would this make someone stop scrolling in their YouTube feed?
6. ASPECT RATIO COMPLIANCE: Is this a proper 16:9 widescreen landscape composition? (Not square, not portrait, not oddly cropped)

RESPOND IN THIS EXACT JSON:
{
  "visual_appeal": { "score": 8, "reason": "brief reason" },
  "text_clarity": { "score": 7, "reason": "brief reason" },
  "emotional_impact": { "score": 9, "reason": "brief reason" },
  "subject_focus": { "score": 8, "reason": "brief reason" },
  "scroll_stop_power": { "score": 8, "reason": "brief reason" },
  "aspect_ratio_ok": { "score": 10, "reason": "Proper 16:9 widescreen" },
  "overall_ctr_score": 8.2,
  "ctr_summary": "1-2 sentence summary of CTR potential",
  "improvement_tips": ["tip 1", "tip 2"]
}`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ]
        }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4096 }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini Vision Error: ${err.error?.message || "Unknown"}`);
  }

  const data = await response.json();
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

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const thumbnails = await base44.entities.ThumbnailConcepts.filter({ project_id });
    const withImages = thumbnails.filter(t => t.image_url);

    if (withImages.length === 0) {
      return Response.json({ error: 'No thumbnails with images to analyze' }, { status: 400 });
    }

    const results = [];

    for (const thumb of withImages) {
      console.log(`Analyzing thumbnail #${thumb.rank}...`);
      const analysis = await analyzeImageWithGemini(
        thumb.image_url,
        thumb.concept_description,
        thumb.text_overlay
      );

      // Update the CTR score on the entity
      const newScore = Math.round(analysis.overall_ctr_score * 10) / 10;
      await base44.entities.ThumbnailConcepts.update(thumb.id, {
        ctr_score: newScore
      });

      results.push({
        thumbnail_id: thumb.id,
        rank: thumb.rank,
        ...analysis
      });
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error("analyzeThumbnailCtr error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});