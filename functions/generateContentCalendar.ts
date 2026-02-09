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
    const { project_id, niche, posts_per_week } = body;

    const prompt = `I can post ${posts_per_week} times per week. I'm in the "${niche}" niche. Create a 12-week content calendar including:

→ Uploads schedule by topic variety
→ Alternation between short and long formats
→ Thematic storytelling rhythm
→ B-roll or animation reuse plan
→ Audience engagement system

Consistency compounds visibility.

RESPOND IN THIS EXACT JSON FORMAT:

{
  "entries": [
    {
      "week_number": 1,
      "day_of_week": "Monday",
      "topic_title": "Topic for this upload",
      "format": "short or long or series_episode",
      "content_theme": "Thematic arc",
      "reuse_assets": "Which assets to reuse",
      "engagement_action": "Community action for this upload"
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.7);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const entries = [];

    for (const entry of result.data.entries) {
      const record = await base44.entities.CalendarEntries.create({
        project_id: project_id,
        week_number: entry.week_number,
        day_of_week: entry.day_of_week,
        topic_title: entry.topic_title,
        format: entry.format,
        content_theme: entry.content_theme,
        reuse_assets: entry.reuse_assets,
        engagement_action: entry.engagement_action,
        status: "planned"
      });

      entries.push(record);
    }

    await base44.entities.Projects.update(project_id, { current_step: 14 });

    return Response.json({ success: true, entries: entries, total_entries: entries.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});