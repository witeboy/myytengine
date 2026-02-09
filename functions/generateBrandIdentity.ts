import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
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
      throw new Error("Gemini returned no candidates. Possibly content filtered.");
    }

    const text = data.candidates[0].content.parts[0].text;

    let jsonStr = text;
    if (text.includes("```json")) {
      jsonStr = text.split("```json")[1].split("```")[0].trim();
    } else if (text.includes("```")) {
      jsonStr = text.split("```")[1].split("```")[0].trim();
    }

    const parsed = JSON.parse(jsonStr);

    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, niche } = body;

    const prompt = `I'm launching a faceless YouTube brand in ${niche}. Build a complete brand identity including:

→ Channel name with keyword depth
→ Short tagline
→ Color palette and typography
→ Logo direction and visual consistency rules
→ Intro/outro concept
→ Emotional tone for thumbnails
→ Sound identity (intro stinger, tone theme)

Make sure it feels premium and bingeable.

RESPOND IN THIS EXACT JSON FORMAT:

{
  "channel_name": "Name Here",
  "tagline": "Tagline here",
  "color_primary": "#hexcode",
  "color_secondary": "#hexcode",
  "color_accent": "#hexcode",
  "typography_heading": "Font Name",
  "typography_body": "Font Name",
  "logo_direction": "Detailed logo design description",
  "visual_rules": "Visual consistency rules",
  "intro_concept": "Intro sequence description",
  "outro_concept": "Outro sequence description",
  "thumbnail_tone": "Emotional tone guide for thumbnails",
  "sound_identity": "Intro stinger and tone theme description"
}`;

    const result = await safeGeminiCall(prompt, 0.8);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const brand = await base44.entities.BrandIdentities.create({
      project_id: project_id,
      niche: niche,
      channel_name: result.data.channel_name,
      tagline: result.data.tagline,
      color_primary: result.data.color_primary,
      color_secondary: result.data.color_secondary,
      color_accent: result.data.color_accent,
      typography_heading: result.data.typography_heading,
      typography_body: result.data.typography_body,
      logo_direction: result.data.logo_direction,
      visual_rules: result.data.visual_rules,
      intro_concept: result.data.intro_concept,
      outro_concept: result.data.outro_concept,
      thumbnail_tone: result.data.thumbnail_tone,
      sound_identity: result.data.sound_identity,
      full_response: result.raw
    });

    await base44.entities.Projects.update(project_id, {
      brand_identity_id: brand.id
    });

    return Response.json({ success: true, brand: brand });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});