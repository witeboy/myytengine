import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// generateSeoTitlesDescriptions.js — PHASE 1 (Titles + Tags)
// ══════════════════════════════════════════════════════════════════

async function callOpenAI(apiKey, messages, maxTokens = 2048) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

function parseOpenAIJson(text) {
  if (!text || typeof text !== 'string') return null;
  
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  
  if (start === -1 || end === -1 || end <= start) return null;
  
  let jsonStr = text.slice(start, end + 1);
  jsonStr = jsonStr
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/,\s*([}\]])/g, '$1');
  
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('JSON parse failed:', e.message);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    
    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return Response.json({ error: 'OPENAI_API_KEY missing' }, { status: 500 });
    }

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const scriptContent = scripts[0]?.content || '';
    const videoTitle = project.working_title || project.topic || 'Untitled';
    const niche = project.niche || 'general';

    const scriptExcerpt = scriptContent.slice(0, 2000);

    const systemPrompt = `You are a YouTube SEO expert. Generate optimized metadata.
Return ONLY valid JSON with no markdown or explanation.`;

    const userPrompt = `Analyze this video and generate SEO metadata:

TITLE: ${videoTitle}
NICHE: ${niche}
SCRIPT EXCERPT: ${scriptExcerpt}

Generate JSON with this EXACT structure:
{
  "titles": [
    {"title": "Main optimized title under 60 chars", "score": 9, "strategy": "why this works"},
    {"title": "Alternative title 2", "score": 8, "strategy": "reasoning"},
    {"title": "Alternative title 3", "score": 8, "strategy": "reasoning"},
    {"title": "Alternative title 4", "score": 7, "strategy": "reasoning"},
    {"title": "Alternative title 5", "score": 7, "strategy": "reasoning"}
  ],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "pinned_comment": "Engaging question or CTA for pinned comment",
  "seo_analysis": {
    "primary_keyword": "main keyword",
    "secondary_keywords": ["kw1", "kw2", "kw3"],
    "search_intent": "what viewers are looking for",
    "competition_level": "low/medium/high"
  },
  "tags_breakdown": {
    "broad_tags": ["tag1", "tag2"],
    "specific_tags": ["tag3", "tag4"],
    "long_tail_tags": ["tag5", "tag6"]
  }
}

RULES:
- Titles MUST be under 60 characters
- Generate exactly 5 titles, 10 tags, 3 hashtags
- Return ONLY the JSON object`;

    const responseText = await callOpenAI(OPENAI_API_KEY, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 2048);

    const parsed = parseOpenAIJson(responseText);

    if (!parsed) {
      return Response.json({ 
        error: 'Failed to parse SEO response',
        raw: responseText.slice(0, 500)
      }, { status: 500 });
    }

    const existingMeta = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
    
    const metaData = {
      project_id,
      titles: JSON.stringify(parsed.titles || []),
      tags: JSON.stringify(parsed.tags || []),
      hashtags: JSON.stringify(parsed.hashtags || []),
      pinned_comment: parsed.pinned_comment || '',
      seo_analysis: JSON.stringify(parsed.seo_analysis || {}),
      tags_breakdown: JSON.stringify(parsed.tags_breakdown || {}),
      descriptions: '[]',
      status: 'titles_complete'
    };

    if (existingMeta.length > 0) {
      await base44.asServiceRole.entities.UploadMetadata.update(existingMeta[0].id, metaData);
    } else {
      await base44.asServiceRole.entities.UploadMetadata.create(metaData);
    }

    return Response.json({
      success: true,
      titles: parsed.titles || [],
      tags: parsed.tags || [],
      hashtags: parsed.hashtags || [],
      pinned_comment: parsed.pinned_comment || '',
      seo_analysis: parsed.seo_analysis || {},
      tags_breakdown: parsed.tags_breakdown || {},
      needs_descriptions: true
    });

  } catch (error) {
    console.error('SEO Phase 1 error:', error);
    return Response.json({ 
      error: error.message || 'SEO generation failed'
    }, { status: 500 });
  }
});