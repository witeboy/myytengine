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
    const { project_id, topic_id, topic_title } = body;

    const prompt = `I'm covering "${topic_title}". Generate 10 viral hooks that:

→ Trigger curiosity gaps
→ Use power words like "before", "exposed", "the last time"
→ Work as both voiceover and thumbnail text
→ Fit under 100 characters
→ Have pattern-break potential

Rank by emotional intensity.

RESPOND IN THIS EXACT JSON FORMAT:

{
  "hooks": [
    {
      "rank": 1,
      "hook_text": "Hook text under 100 chars",
      "hook_type": "curiosity_gap or power_word or pattern_break",
      "intensity_score": 9,
      "use_as_thumbnail": true,
      "use_as_voiceover": true
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.9);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const created_hooks = [];

    for (const hook of result.data.hooks) {
      const record = await base44.entities.Hooks.create({
        project_id: project_id,
        topic_id: topic_id,
        rank: hook.rank,
        hook_text: hook.hook_text,
        hook_type: hook.hook_type,
        intensity_score: hook.intensity_score,
        use_as_thumbnail: hook.use_as_thumbnail,
        use_as_voiceover: hook.use_as_voiceover,
        is_selected: false
      });

      created_hooks.push(record);
    }

    await base44.entities.Topics.update(topic_id, { is_selected: true });

    await base44.entities.Projects.update(project_id, {
      selected_topic_id: topic_id,
      current_step: 3
    });

    return Response.json({ success: true, hooks: created_hooks });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});