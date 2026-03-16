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
    const { project_id } = body;

    const project = await base44.entities.Projects.get(project_id);

    const topic = await base44.entities.Topics.get(project.selected_topic_id);

    const prompt = `For a faceless YouTube documentary about "${topic.title}", suggest the ideal ratio between:

→ AI-generated visuals
→ Stock B-roll
→ Archival imagery
→ Dynamic text animation

Include sources for high-quality assets and timing rules for transitions.

RESPOND IN THIS EXACT JSON FORMAT:

{
  "ai_visual_percent": 40,
  "stock_broll_percent": 30,
  "archival_percent": 15,
  "text_animation_percent": 15,
  "recommended_sources": "Detailed list of sources with URLs",
  "transition_rules": "Timing rules for transitions between asset types"
}`;

    const result = await safeGeminiCall(prompt, 0.6);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const plan = await base44.entities.AssetPlans.create({
      project_id: project_id,
      ai_visual_percent: result.data.ai_visual_percent,
      stock_broll_percent: result.data.stock_broll_percent,
      archival_percent: result.data.archival_percent,
      text_animation_percent: result.data.text_animation_percent,
      recommended_sources: result.data.recommended_sources,
      transition_rules: result.data.transition_rules,
      full_response: result.raw
    });

    await base44.entities.Projects.update(project_id, { current_step: 10 });

    return Response.json({ success: true, plan: plan });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});