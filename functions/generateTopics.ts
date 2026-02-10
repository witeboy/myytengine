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

    const prompt = `I want to build a faceless YouTube channel creating short documentaries in ${niche}. Find 30 trending topics that:

- Have underexploited keyword potential
- Have 100K-2M monthly searches
- Are emotional, shocking, or curiosity-driven
- Can be told in under 10 minutes
- Have strong comment section engagement

Rank them by viral potential, storytelling strength, and emotional payoff.

Return ONLY valid JSON in this exact format (no extra text before or after):

{
  "topics": [
    {
      "rank": 1,
      "title": "Topic Title Here",
      "description": "Why this topic is trending and compelling",
      "keyword_potential": "Keyword opportunity analysis",
      "monthly_searches": "Estimated range e.g. 500K-800K",
      "viral_score": 9,
      "storytelling_score": 8,
      "emotional_score": 9,
      "engagement_notes": "Why comments will be strong"
    }
  ]
}`;

    const result = await safeGeminiCall(prompt, 0.8);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    const created_topics = [];

    for (const topic of result.data.topics) {
      const record = await base44.entities.Topics.create({
        project_id: project_id,
        rank: topic.rank,
        title: topic.title,
        description: topic.description,
        keyword_potential: topic.keyword_potential,
        monthly_searches: topic.monthly_searches,
        viral_score: topic.viral_score,
        storytelling_score: topic.storytelling_score,
        emotional_score: topic.emotional_score,
        engagement_notes: topic.engagement_notes,
        is_selected: false
      });

      created_topics.push(record);
    }

    await base44.entities.Projects.update(project_id, {
      status: "topics_ready",
      current_step: 1,
      completed_steps: JSON.stringify([1])
    });

    return Response.json({ success: true, topics: created_topics });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});