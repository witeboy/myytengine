import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// generateSeoDescriptions.js — PHASE 2 (Descriptions Only)
// ══════════════════════════════════════════════════════════════════

async function callOpenAI(apiKey, messages, maxTokens = 3000) {
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

    const existingMeta = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
    if (existingMeta.length === 0) {
      return Response.json({ error: 'Run Phase 1 first' }, { status: 400 });
    }

    const meta = existingMeta[0];
    const titles = JSON.parse(meta.titles || '[]');
    const tags = JSON.parse(meta.tags || '[]');

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const scriptContent = scripts[0]?.content || '';
    const videoTitle = titles[0]?.title || project.working_title || project.topic;
    const niche = project.niche || 'general';

    const scriptExcerpt = scriptContent.slice(0, 1500);

    const systemPrompt = `You are a YouTube description copywriter. Write compelling, SEO-optimized descriptions.
Return ONLY valid JSON with no markdown.`;

    const userPrompt = `Write 3 YouTube video descriptions for this video:

TITLE: ${videoTitle}
NICHE: ${niche}
TAGS: ${tags.slice(0, 5).join(', ')}
SCRIPT EXCERPT: ${scriptExcerpt}

Generate JSON with this EXACT structure:
{
  "descriptions": [
    {
      "style": "hook_heavy",
      "description": "Full description 400-600 words. Start with compelling hook. Include timestamps placeholder [TIMESTAMPS]. Include CTA. Natural keyword integration.",
      "word_count": 500
    },
    {
      "style": "seo_optimized",
      "description": "Full description 400-600 words. Front-load keywords. Dense but readable. Include timestamps placeholder. Multiple CTAs.",
      "word_count": 500
    },
    {
      "style": "storytelling",
      "description": "Full description 400-600 words. Narrative approach. Emotional hooks. Include timestamps placeholder. Soft CTA.",
      "word_count": 500
    }
  ]
}

RULES:
- Each description MUST be 400-600 words
- Include [TIMESTAMPS] placeholder in each
- First 150 characters are crucial (shown in search)
- Include relevant keywords naturally
- End each with a call-to-action
- Return ONLY the JSON object`;

    const responseText = await callOpenAI(OPENAI_API_KEY, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 3000);

    const parsed = parseOpenAIJson(responseText);

    if (!parsed || !parsed.descriptions) {
      return Response.json({ 
        error: 'Failed to parse descriptions',
        raw: responseText.slice(0, 500)
      }, { status: 500 });
    }

    await base44.asServiceRole.entities.UploadMetadata.update(meta.id, {
      descriptions: JSON.stringify(parsed.descriptions),
      status: 'complete'
    });

    return Response.json({
      success: true,
      descriptions: parsed.descriptions
    });

  } catch (error) {
    console.error('SEO Phase 2 error:', error);
    return Response.json({ 
      error: error.message || 'Description generation failed'
    }, { status: 500 });
  }
});