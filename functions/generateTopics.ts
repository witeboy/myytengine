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
          generationConfig: { temperature, maxOutputTokens: 4096 }
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
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

    const parsed = JSON.parse(jsonStr);
    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

function validateTopic(topic) {
  const issues = [];
  if (!topic.title || topic.title.trim().length === 0) issues.push('Missing title');
  if (!topic.description || topic.description.trim().length < 50) issues.push('Description too short');
  if (!topic.viral_score || topic.viral_score < 1 || topic.viral_score > 10) issues.push('Invalid viral score');
  const weakTitles = ['how to', 'what is', 'guide to', 'introduction to', 'basics of'];
  if (weakTitles.some(w => (topic.title || '').toLowerCase().startsWith(w))) {
    issues.push('Title starts with weak generic opener');
  }
  return { valid: issues.length === 0, issues };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, niche } = body;

    if (!project_id || !niche) {
      return Response.json({ error: 'Missing required fields: project_id, niche' }, { status: 400 });
    }

    console.log('================================================');
    console.log('GENERATING VIRAL TOPICS');
    console.log(`Niche: ${niche}`);
    console.log('================================================');

    const prompt = `You are an elite YouTube strategist specializing in faceless documentary channels.

NICHE: "${niche}"

Generate 5 viral video topics that are:
- Surgical deep-dives into "${niche}" mechanics/psychology
- Counterintuitive truths that contradict common beliefs
- Emotionally compelling with clear stakes (money lost, years wasted)
- Specific and actionable (NOT generic listicles)

Each topic must:
- Have a villain (system/institution working against viewer)
- Create curiosity gap (unanswered question)
- Be executable with research only (no on-camera presenter)
- Score 8+ on viral potential

JSON FORMAT:
{
  "niche_analysis": "Brief understanding of viral potential",
  "content_strategy": "Overarching content approach",
  "topics": [
    {
      "rank": 1,
      "title": "Viral, specific, curiosity-driven title",
      "description": "2-3 sentences explaining stakes and why viewers NEED this",
      "viral_angle": "hidden_truth/betrayal/discovery/warning/shortcut/myth",
      "villain": "The system working against viewers",
      "unanswered_question": "The burning question this answers",
      "search_intent": "What people type when desperate for this info",
      "recommendation_hook": "Why someone would share this",
      "viral_score": 9,
      "storytelling_score": 8,
      "emotional_score": 9,
      "keyword_potential": "high/medium/low",
      "monthly_searches": "10K-50K",
      "competition_level": "low/medium/high",
      "content_depth": "How many minutes of valuable content this supports",
      "engagement_notes": "Comment triggers and discussion angles"
    }
  ]
}

Generate 5 topics ranked by viral potential. Return ONLY valid JSON, no extra text.`;

    const result = await safeGeminiCall(prompt, 0.85);

    if (!result.success) {
      console.error('Gemini failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.topics || !Array.isArray(result.data.topics)) {
      return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });
    }

    console.log(`Niche analysis: ${result.data.niche_analysis}`);
    console.log(`Topics generated: ${result.data.topics.length}`);

    let qualityWarnings = 0;

    const savePromises = result.data.topics.map(async (topic, i) => {
      const validation = validateTopic(topic);
      if (!validation.valid) {
        qualityWarnings++;
        console.warn(`Topic ${topic.rank} issues: ${validation.issues.join(', ')}`);
      }

      try {
        const record = await base44.entities.Topics.create({
          project_id: project_id,
          rank: topic.rank || i + 1,
          title: topic.title || '',
          description: topic.description || '',
          viral_angle: topic.viral_angle || '',
          villain: topic.villain || '',
          unanswered_question: topic.unanswered_question || '',
          search_intent: topic.search_intent || '',
          recommendation_hook: topic.recommendation_hook || '',
          viral_score: topic.viral_score || 7,
          storytelling_score: topic.storytelling_score || 7,
          emotional_score: topic.emotional_score || 7,
          keyword_potential: topic.keyword_potential || 'medium',
          monthly_searches: topic.monthly_searches || 'unknown',
          competition_level: topic.competition_level || 'medium',
          content_depth: topic.content_depth || '',
          engagement_notes: topic.engagement_notes || '',
          quality_valid: validation.valid,
          is_selected: false
        });
        return { success: true, record };
      } catch (saveErr) {
        console.error(`Failed to save topic ${topic.rank}:`, saveErr.message);
        return { success: false, rank: topic.rank, error: saveErr.message };
      }
    });

    const saveResults = await Promise.all(savePromises);
    const created_topics = saveResults.filter(r => r.success).map(r => r.record);
    const skipped_topics = saveResults.filter(r => !r.success);

    try {
      await base44.entities.Projects.update(project_id, {
        status: "topics_ready",
        current_step: 1,
        completed_steps: JSON.stringify([1])
      });
    } catch (updateErr) {
      console.warn('Failed to update project status:', updateErr.message);
    }

    console.log('================================================');
    console.log(`Topics saved: ${created_topics.length}`);
    console.log(`Topics skipped: ${skipped_topics.length}`);
    console.log(`Quality warnings: ${qualityWarnings}`);
    console.log('================================================');

    return Response.json({
      success: true,
      topics: created_topics,
      meta: {
        niche_analysis: result.data.niche_analysis,
        content_strategy: result.data.content_strategy,
        total_generated: result.data.topics.length,
        total_saved: created_topics.length,
        total_skipped: skipped_topics.length,
        quality_warnings: qualityWarnings
      }
    });

  } catch (error) {
    console.error('generateTopics error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});