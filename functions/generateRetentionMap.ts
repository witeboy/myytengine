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
    const { project_id, script_id, category } = body;

    const script = await base44.entities.Scripts.get(script_id);

    const prompt = `For 8-10 minute videos in "${category}", break this script into retention checkpoints:

→ Opening story hook (0–20s)
→ Curiosity build (20–90s)
→ Main reveal (2–4 min)
→ Twist or secret (5–7 min)
→ Final payoff (8–10 min)

Map each checkpoint to visual & auditory intensity.

SCRIPT: ${script.full_script}

RESPOND IN THIS EXACT JSON FORMAT:

{
  "checkpoints": [
    {
      "order_index": 1,
      "checkpoint_name": "Opening Hook",
      "time_start": "0:00",
      "time_end": "0:20",
      "description": "What happens here",
      "visual_intensity": "high",
      "audio_intensity": "peak",
      "retention_strategy": "Strategy to keep viewers"
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.6);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const checkpoints = [];

    for (const cp of result.data.checkpoints) {
      const record = await base44.entities.RetentionMaps.create({
        project_id: project_id,
        script_id: script_id,
        checkpoint_name: cp.checkpoint_name,
        time_start: cp.time_start,
        time_end: cp.time_end,
        description: cp.description,
        visual_intensity: cp.visual_intensity,
        audio_intensity: cp.audio_intensity,
        retention_strategy: cp.retention_strategy,
        order_index: cp.order_index
      });

      checkpoints.push(record);
    }

    await base44.entities.Projects.update(project_id, { current_step: 6 });

    return Response.json({ success: true, checkpoints: checkpoints });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});