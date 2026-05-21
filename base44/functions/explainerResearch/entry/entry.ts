// explainerResearch — Phase B (Factual Accuracy)
// Pulls real, sourced facts about the topic using Gemini 2.5 Flash + Google Search grounding.
// Returns structured JSON the explainer pipeline uses to anchor scripts in reality.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

async function researchTopic(topicTitle, topicDescription, niche) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;

  const prompt = `You are a research assistant for an educational YouTube explainer video. Use Google Search to find REAL, VERIFIABLE facts about this topic. Do NOT make up statistics, dates, or studies.

**TOPIC**: ${topicTitle}
**DESCRIPTION**: ${topicDescription || 'N/A'}
**NICHE**: ${niche || 'general'}

**YOUR TASK**: Find 6-10 concrete facts grounded in real sources. Also find 2-4 common misconceptions people have about this topic. Also find 3-6 specific numbers/percentages/dates that are well-documented (with sources).

**OUTPUT RULES**:
- Every fact must have a source URL from your search
- Quote numbers exactly as they appear in the source (don't round wildly)
- If you can't find a real number for something, OMIT it — don't invent
- Favor recent sources (last 5 years) and reputable institutions (government data, academic papers, major news outlets, industry reports)
- For misconceptions, explain the TRUTH that corrects each one

Return ONLY valid JSON (no markdown, no commentary):
{
  "facts": [
    {
      "claim": "The concrete fact in 1-2 sentences",
      "source_name": "Name of source (e.g. 'Federal Reserve', 'Pew Research')",
      "source_url": "https://..."
    }
  ],
  "key_numbers": [
    {
      "number": "e.g. '64%' or '$1.4 trillion' or '2019'",
      "context": "What this number represents",
      "source_name": "Source name",
      "source_url": "https://..."
    }
  ],
  "common_misconceptions": [
    {
      "myth": "The widespread belief that is wrong",
      "truth": "The actual reality, with source",
      "source_url": "https://..."
    }
  ]
}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini research error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Parse JSON (Gemini with tools can't use responseMimeType, so we parse manually)
  let parsed = null;
  try { parsed = JSON.parse(rawText); } catch (_) {}

  if (!parsed) {
    let jsonStr = rawText;
    if (rawText.includes('```json')) {
      jsonStr = rawText.split('```json')[1].split('```')[0].trim();
    } else if (rawText.includes('```')) {
      jsonStr = rawText.split('```')[1].split('```')[0].trim();
    }
    try { parsed = JSON.parse(jsonStr); } catch (_) {}
  }

  if (!parsed) {
    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { parsed = JSON.parse(objMatch[0]); } catch (_) {}
    }
  }

  if (!parsed) throw new Error('Failed to parse research JSON');

  // Normalize shape — ensure arrays exist
  return {
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    key_numbers: Array.isArray(parsed.key_numbers) ? parsed.key_numbers : [],
    common_misconceptions: Array.isArray(parsed.common_misconceptions) ? parsed.common_misconceptions : [],
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, topic_title, topic_description, niche } = await req.json();

    // If project_id given, load context from DB
    let title = topic_title;
    let description = topic_description;
    let nicheStr = niche;
    let project = null;

    if (project_id) {
      const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
      project = projects[0];
      if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

      nicheStr = nicheStr || project.niche;

      if (project.selected_topic_id) {
        const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
        const topic = topics[0];
        title = title || topic?.title || project.name;
        description = description || topic?.description || '';
      } else {
        title = title || project.name;
      }
    }

    if (!title) return Response.json({ error: 'topic_title or project_id required' }, { status: 400 });

    console.log(`[explainerResearch] Researching: "${title}" (niche: ${nicheStr || 'n/a'})`);

    const research = await researchTopic(title, description, nicheStr);

    console.log(`[explainerResearch] Found ${research.facts.length} facts, ${research.key_numbers.length} numbers, ${research.common_misconceptions.length} misconceptions`);

    // Persist to project if we have one
    if (project) {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        research_notes: JSON.stringify(research),
      });
    }

    return Response.json({ success: true, research });
  } catch (error) {
    console.error('explainerResearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});