// ══════════════════════════════════════════════════════════════════
// generateSeoDescriptions.js — PHASE 2 (Descriptions Only)
// ══════════════════════════════════════════════════════════════════
// Place in: Base44 Backend Functions
// Called after Phase 1 completes
// ══════════════════════════════════════════════════════════════════

import { base44 } from './base44Client.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ══════════════════════════════════════════════════════════════════
// FAST JSON PARSER
// ══════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

export default async function handler(req) {
  try {
    const { project_id } = await req.json();
    
    if (!project_id) {
      return new Response(JSON.stringify({ error: 'Missing project_id' }), { status: 400 });
    }

    // Load project and existing metadata
    const project = await base44.entities.Projects.get(project_id);
    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), { status: 404 });
    }

    const existingMeta = await base44.entities.UploadMetadata.filter({ project_id });
    if (existingMeta.length === 0) {
      return new Response(JSON.stringify({ error: 'Run Phase 1 first' }), { status: 400 });
    }

    const meta = existingMeta[0];
    const titles = JSON.parse(meta.titles || '[]');
    const tags = JSON.parse(meta.tags || '[]');

    // Load script
    const script = await base44.entities.Scripts.filter({ project_id });
    const scriptContent = script[0]?.content || '';
    const videoTitle = titles[0]?.title || project.working_title || project.topic;
    const niche = project.niche || 'general';

    // Script excerpt for context
    const scriptExcerpt = scriptContent.slice(0, 1500);

    // ════════════════════════════════════════════════════════════════
    // PHASE 2 PROMPT: Descriptions Only
    // ════════════════════════════════════════════════════════════════

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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 3000,
      temperature: 0.7
    });

    const responseText = completion.choices[0]?.message?.content || '';
    const parsed = parseOpenAIJson(responseText);

    if (!parsed || !parsed.descriptions) {
      return new Response(JSON.stringify({ 
        error: 'Failed to parse descriptions',
        raw: responseText.slice(0, 500)
      }), { status: 500 });
    }

    // ════════════════════════════════════════════════════════════════
    // UPDATE DATABASE
    // ════════════════════════════════════════════════════════════════

    await base44.entities.UploadMetadata.update(meta.id, {
      descriptions: JSON.stringify(parsed.descriptions),
      status: 'complete'
    });

    // ════════════════════════════════════════════════════════════════
    // RETURN RESPONSE
    // ════════════════════════════════════════════════════════════════

    return new Response(JSON.stringify({
      success: true,
      descriptions: parsed.descriptions
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('SEO Phase 2 error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Description generation failed'
    }), { status: 500 });
  }
}
