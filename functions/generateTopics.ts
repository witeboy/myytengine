import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function repairJSON(str) {
  // Remove trailing commas before } or ]
  str = str.replace(/,\s*([}\]])/g, '$1');
  // Fix unescaped newlines inside strings
  str = str.replace(/(?<=":[\s]*"[^"]*)\n([^"]*")/g, '\\n$1');
  // Remove control characters
  str = str.replace(/[\x00-\x1F\x7F]/g, (ch) => {
    if (ch === '\n' || ch === '\r' || ch === '\t') return ch;
    return '';
  });
  return str;
}

function extractJSON(text) {
  let jsonStr = text;
  if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn("First parse failed, attempting repair...");
    try {
      return JSON.parse(repairJSON(jsonStr));
    } catch (e2) {
      // Last resort: find the outermost { }
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        return JSON.parse(repairJSON(jsonStr.substring(start, end + 1)));
      }
      throw e2;
    }
  }
}

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
            maxOutputTokens: 4096,
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
    const parsed = extractJSON(text);
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
    const { project_id, niche, exact_topic, tone, target_audience } = body;

    if (!project_id || !niche) {
      return Response.json({ error: 'Missing required fields: project_id, niche' }, { status: 400 });
    }

    const effectiveTone = tone || 'dramatic';
    const audienceContext = target_audience ? `\nTARGET AUDIENCE: "${target_audience}" — tailor language, examples, and references to resonate with this specific audience.` : '';

    console.log('================================================');
    console.log(exact_topic ? 'REFINING USER TOPIC' : 'GENERATING VIRAL TOPICS');
    console.log(`Niche: ${niche} | Tone: ${effectiveTone} | Audience: ${target_audience || 'general'}`);
    if (exact_topic) console.log(`Exact topic: ${exact_topic}`);
    console.log('================================================');

    const prompt = exact_topic
      ? `You are an elite YouTube strategist specializing in faceless documentary channels.

The user has a specific video topic they want to create. Your job is to REFINE and OPTIMIZE it for maximum viral potential — do NOT change the core idea, just make the title punchier, the angle sharper, and fill in the strategic details.

USER'S TOPIC: "${exact_topic}"
TONE: "${effectiveTone}" — the topic title, description, and all angles must match this tone.${audienceContext}

CRITICAL RULES:
- The topic MUST stay directly about "${exact_topic}" — do NOT drift to a different subject
- Keep the core subject matter IDENTICAL to what the user typed
- The final topic should be immediately recognizable as the user's original idea
- The title MUST contain the user's key phrase or a very close synonym — do NOT replace it with a dramatic rewrite
- Use SEO-friendly title formats that people actually SEARCH for:
  • "How [topic] Actually Works" / "How to [topic]"
  • "Why [topic] Is [surprising truth]"  
  • "What Nobody Tells You About [topic]"
  • "[Topic]: The Complete Truth" / "[Topic] Explained"
  • "Here's Why [topic] [claim]"
- Do NOT make every title sound like a conspiracy or scandal — match the "${effectiveTone}" tone
- The title should work as a YouTube SEARCH RESULT, not just a clickbait thumbnail

Return a JSON object with this exact structure:
{
  "niche_analysis": "Brief understanding of viral potential for this topic",
  "content_strategy": "Best approach for this specific topic",
  "topics": [
    {
      "rank": 1,
      "title": "Refined, viral, curiosity-driven version of the user's topic",
      "description": "2-3 sentences explaining stakes and why viewers NEED this",
      "viral_angle": "hidden_truth",
      "villain": "The system working against viewers",
      "unanswered_question": "The burning question this answers",
      "search_intent": "What people type when desperate for this info",
      "recommendation_hook": "Why someone would share this",
      "viral_score": 9,
      "storytelling_score": 8,
      "emotional_score": 9,
      "keyword_potential": "high",
      "monthly_searches": "10K-50K",
      "competition_level": "low",
      "content_depth": "How many minutes of valuable content this supports",
      "engagement_notes": "Comment triggers and discussion angles"
    }
  ]
}

IMPORTANT: Generate exactly 1 topic — the refined version of the user's idea. Keep the core concept intact. Do NOT use special characters, line breaks, or unescaped quotes inside string values.`
      : `You are an elite YouTube strategist specializing in faceless documentary channels.

The user wants video topics DIRECTLY about: "${niche}"
TONE: "${effectiveTone}" — all topic titles and descriptions must match this tone.${audienceContext}

CRITICAL: Every topic MUST be directly and specifically about "${niche}". 
- Do NOT suggest tangential or loosely related topics
- Each topic title must contain the core subject "${niche}" or its direct synonyms
- Topics should explore different ANGLES of "${niche}" — not different subjects
- Think: what are 5 different fascinating aspects, stories, or deep-dives specifically within "${niche}"?

Generate 5 viral video topics that are:
- Direct deep-dives into "${niche}" — different angles of the SAME subject
- A MIX of title styles (NOT all dramatic/controversial). Include:
  • 1-2 educational/SEO titles: "How to...", "Why...", "[Topic] Explained", "What Is..."
  • 1-2 curiosity/story titles: "The Hidden Truth About...", "What Nobody Tells You About..."
  • 1 bold claim title: "Why [common belief] Is Wrong" or "Here's Why [surprising take]"
- Specific and actionable (NOT generic listicles)
- Titles that people would actually TYPE into YouTube search — not just clickbait
- Match the "${effectiveTone}" tone — if tone is "educational", do NOT make titles sound like conspiracy documentaries

Each topic must:
- Be unmistakably about "${niche}" — a viewer should immediately know the video is about this subject
- Create curiosity gap (unanswered question)
- Be executable with research only (no on-camera presenter)
- Score 8+ on viral potential

Return a JSON object with this exact structure:
{
  "niche_analysis": "Brief understanding of viral potential",
  "content_strategy": "Overarching content approach",
  "topics": [
    {
      "rank": 1,
      "title": "Viral, specific, curiosity-driven title DIRECTLY about ${niche}",
      "description": "2-3 sentences explaining stakes and why viewers NEED this",
      "viral_angle": "hidden_truth",
      "villain": "The system working against viewers",
      "unanswered_question": "The burning question this answers",
      "search_intent": "What people type when desperate for this info",
      "recommendation_hook": "Why someone would share this",
      "viral_score": 9,
      "storytelling_score": 8,
      "emotional_score": 9,
      "keyword_potential": "high",
      "monthly_searches": "10K-50K",
      "competition_level": "low",
      "content_depth": "How many minutes of valuable content this supports",
      "engagement_notes": "Comment triggers and discussion angles"
    }
  ]
}

IMPORTANT: Do NOT use special characters, line breaks, or unescaped quotes inside string values. Keep all string values simple and clean. Generate 5 topics ranked by viral potential.`;

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