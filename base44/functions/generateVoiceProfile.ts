import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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
    const { project_id, tone } = body;

    const prompt = `I'm creating a faceless brand with the tone of "${tone}". Design a unique AI voice style that:

→ Matches tone through pacing and emotion
→ Has vocal pauses at story peaks
→ Uses emphasis strategically
→ Feels human but not overly expressive
→ Works seamlessly with ElevenLabs or Sora voice module

Give me 2 example voice samples in short monologue form.

RESPOND IN THIS EXACT JSON FORMAT:

{
  "pacing_style": "Description of pacing approach",
  "pause_rules": "When and where to pause",
  "emphasis_rules": "What words to emphasize and how",
  "emotion_range": "Emotional range description",
  "sample_monologue_1": "First sample monologue text",
  "sample_monologue_2": "Second sample monologue text",
  "elevenlabs_settings": {
    "stability": 0.5,
    "similarity_boost": 0.75,
    "style": 0.4,
    "use_speaker_boost": true
  }
}`;

    const result = await safeGeminiCall(prompt, 0.8);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const profile = await base44.entities.VoiceProfiles.create({
      project_id: project_id,
      tone: tone,
      pacing_style: result.data.pacing_style,
      pause_rules: result.data.pause_rules,
      emphasis_rules: result.data.emphasis_rules,
      emotion_range: result.data.emotion_range,
      sample_monologue_1: result.data.sample_monologue_1,
      sample_monologue_2: result.data.sample_monologue_2,
      elevenlabs_settings: JSON.stringify(result.data.elevenlabs_settings),
      full_response: result.raw
    });

    await base44.entities.Projects.update(project_id, {
      voice_profile_id: profile.id,
      current_step: 8
    });

    return Response.json({ success: true, profile: profile });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});