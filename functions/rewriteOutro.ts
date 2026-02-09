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
    const { project_id, script_id } = body;

    const script = await base44.entities.Scripts.get(script_id);

    const prompt = `Rewrite this video outro to:

→ Invite emotional conversation
→ Encourage viewers to share opinions
→ Pose a polarizing but safe question
→ Make call-to-action feel natural

CURRENT OUTRO:

${script.outro}

RESPOND IN THIS EXACT JSON FORMAT:

{
  "rewritten_outro": "The new outro text with scene directions",
  "polarizing_question": "The question that drives comments",
  "cta_text": "The natural call to action"
}`;

    const result = await safeGeminiCall(prompt, 0.8);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const final_script = await base44.entities.Scripts.create({
      project_id: project_id,
      topic_id: script.topic_id,
      version: "final",
      title: script.title,
      full_script: script.full_script.replace(script.outro, result.data.rewritten_outro),
      cold_open: script.cold_open,
      word_count: script.word_count,
      estimated_duration_sec: script.estimated_duration_sec,
      act_1: script.act_1,
      act_2: script.act_2,
      act_3: script.act_3,
      outro: result.data.rewritten_outro
    });

    await base44.entities.Projects.update(project_id, {
      script_id: final_script.id,
      current_step: 7
    });

    return Response.json({ success: true, final_script: final_script, polarizing_question: result.data.polarizing_question });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});