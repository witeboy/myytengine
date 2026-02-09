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

    const visuals_list = await base44.entities.VisualPrompts.list();
    const visuals = visuals_list.filter(v => v.project_id === project_id && v.script_id === script_id).sort((a, b) => a.scene_number - b.scene_number);

    const visual_summary = visuals.map(v => `Scene ${v.scene_number}: ${v.sora_prompt.substring(0, 100)}`).join("\n");

    const prompt = `Take this voiceover script and match ideal animation durations per line (in seconds). Output in table format:

→ Timestamp start-end
→ Text spoken
→ Scene concept or visual cue
→ Transition type

Make sure pacing fits 9-minute total runtime.

SCRIPT: ${script.full_script}

VISUAL DIRECTION REFERENCE:

${visual_summary}

RESPOND IN THIS EXACT JSON FORMAT:

{
  "entries": [
    {
      "entry_order": 1,
      "timestamp_start": "0:00",
      "timestamp_end": "0:08",
      "spoken_text": "The voiceover text",
      "scene_concept": "Visual description",
      "transition_type": "cut/dissolve/fade/zoom/match_cut",
      "duration_seconds": 8
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.5);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const entries = [];

    for (const entry of result.data.entries) {
      const record = await base44.entities.TimingEntries.create({
        project_id: project_id,
        script_id: script_id,
        entry_order: entry.entry_order,
        timestamp_start: entry.timestamp_start,
        timestamp_end: entry.timestamp_end,
        spoken_text: entry.spoken_text,
        scene_concept: entry.scene_concept,
        transition_type: entry.transition_type,
        duration_seconds: entry.duration_seconds
      });

      entries.push(record);
    }

    await base44.entities.Projects.update(project_id, { current_step: 11, status: "production" });

    return Response.json({ success: true, entries: entries });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});