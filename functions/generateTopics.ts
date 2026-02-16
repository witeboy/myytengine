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
          generationConfig: { 
            temperature, 
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          }
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
    const parsed = JSON.parse(text);

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

    const prompt = `
I want to build a faceless YouTube channel. 
CORE TOPIC: "${niche}"

Your task: Generate 10 viral video topics that are 100% focused ONLY on "${niche}". 

For every topic, you must apply a "Viral Filter" to the CORE TOPIC:
1. THE SHOCKING ANGLE: Take a standard fact about "${niche}" and frame it as a hidden danger or a "lie" everyone believes.
2. THE EMOTIONAL STAKES: Explain how failing to understand "${niche}" ruins lives, creates "financial' slavery," or steals a viewer's future.
3. THE "US VS THEM" NARRATIVE: Frame the topic as a secret the "1%" or "Banks" don't want the viewer to know.

CRITICAL RULE: Do NOT suggest general finance topics like "Landlords," "Car costs," or "Coffee habits." If the topic is "${niche}", every single suggestion must be a surgical deep-dive into the math, psychology, or strategy of "${niche}".

Return ONLY valid JSON in this exact format:
{
  "topics": [
    {
      "rank": 1,
      "title": "A Shocking, Curiosity-Driven Title",
      "description": "A high-stakes, emotional synopsis that explains why NOT knowing this about ${niche} is a disaster.",
      "viral_score": 10,
      ...
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