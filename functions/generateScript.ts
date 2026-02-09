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
    const { project_id, topic_id, topic_title, topic_description, selected_hook } = body;

    const prompt = `Write a YouTube documentary script about "${topic_title}".

Context: ${topic_description}

Use this hook for the cold open: "${selected_hook}"

Format as narration + scene direction. Include:

→ Cold open that hooks in 7 seconds
→ Emotional arc (curiosity, conflict, payoff)
→ 3-act structure like a Netflix episode
→ Voiceover pacing at 140 words per minute
→ Visual timing for 16:9 Sora animations

Each paragraph should be a new visual scene.

RESPOND IN THIS EXACT JSON FORMAT:

{
  "title": "Video Working Title",
  "cold_open": "The opening 7-second hook narration with [SCENE: direction]",
  "act_1": "Full Act 1 narration with [SCENE: directions] for each paragraph",
  "act_2": "Full Act 2 narration with [SCENE: directions] for each paragraph",
  "act_3": "Full Act 3 narration with [SCENE: directions] for each paragraph",
  "outro": "Closing narration with call to action",
  "full_script": "The complete script combining all acts in order",
  "word_count": 1260,
  "estimated_duration_sec": 540
}`;

    const result = await safeGeminiCall(prompt, 0.8);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const script = await base44.entities.Scripts.create({
      project_id: project_id,
      topic_id: topic_id,
      version: "draft",
      title: result.data.title,
      full_script: result.data.full_script,
      cold_open: result.data.cold_open,
      word_count: result.data.word_count,
      estimated_duration_sec: result.data.estimated_duration_sec,
      act_1: result.data.act_1,
      act_2: result.data.act_2,
      act_3: result.data.act_3,
      outro: result.data.outro
    });

    await base44.entities.Projects.update(project_id, {
      script_id: script.id,
      current_step: 4,
      status: "scripting"
    });

    return Response.json({ success: true, script: script });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});