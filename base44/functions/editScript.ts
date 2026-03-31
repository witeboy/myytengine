import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

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
    const { project_id, script_id, topic_title, full_script } = body;

    const prompt = `I have a draft script about "${topic_title}". Act as a YouTube script editor. Identify:

→ Weak hooks or pacing issues
→ Unnecessary filler
→ Missed emotional beats
→ Overcomplicated narration
→ Missed visual storytelling opportunities

Rewrite it for flow, clarity, and binge potential.

HERE IS THE DRAFT SCRIPT:

${full_script}

RESPOND IN THIS EXACT JSON FORMAT:

{
  "editor_notes": "Summary of changes made and why",
  "title": "Revised title if improved",
  "cold_open": "Revised cold open",
  "act_1": "Revised Act 1",
  "act_2": "Revised Act 2",
  "act_3": "Revised Act 3",
  "outro": "Revised outro",
  "full_script": "Complete revised script",
  "word_count": 1260,
  "estimated_duration_sec": 540
}`;

    const result = await safeGeminiCall(prompt, 0.7);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const original_script = await base44.entities.Scripts.get(script_id);
    const topic_id_ref = original_script.topic_id;

    const edited_script = await base44.entities.Scripts.create({
      project_id: project_id,
      topic_id: topic_id_ref,
      version: "edited",
      title: result.data.title,
      full_script: result.data.full_script,
      cold_open: result.data.cold_open,
      word_count: result.data.word_count,
      estimated_duration_sec: result.data.estimated_duration_sec,
      act_1: result.data.act_1,
      act_2: result.data.act_2,
      act_3: result.data.act_3,
      outro: result.data.outro,
      editor_notes: result.data.editor_notes
    });

    await base44.entities.Projects.update(project_id, {
      script_id: edited_script.id,
      current_step: 5
    });

    return Response.json({ success: true, edited_script: edited_script });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});