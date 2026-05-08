import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// generateSeoDescriptions — PHASE 2
// Migrated from Gemini → Claude Sonnet 4.5
// Fixes: responseMimeType removal, robust JSON parsing, clear error messages

const OPENAI_MODEL = 'gpt-4o';
const CLAUDE_MODEL = 'claude-sonnet-4-5';

async function callOpenAI(apiKey, systemPrompt, userPrompt, maxTokens = 6000) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callClaude(apiKey, systemPrompt, userPrompt, maxTokens = 6000) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.substring(0, 300)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callAI(openaiKey, claudeKey, systemPrompt, userPrompt, maxTokens = 6000) {
  if (openaiKey) {
    try {
      return await callOpenAI(openaiKey, systemPrompt, userPrompt, maxTokens);
    } catch (err) {
      console.warn('OpenAI failed, falling back to Claude:', err.message);
    }
  }
  if (claudeKey) {
    return await callClaude(claudeKey, systemPrompt, userPrompt, maxTokens);
  }
  throw new Error('No AI API keys configured');
}

function parseJson(text) {
  if (!text) return null;
  let cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/gi, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0].replace(/[\x00-\x1F\x7F]/g, ' ').replace(/,\s*([}\]])/g, '$1'));
    } catch (_) {}
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
    const CLAUDE_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
    if (!OPENAI_API_KEY && !CLAUDE_API_KEY) {
      return Response.json({ error: 'No AI API key configured (need OPENAI_API_KEY or ANTHROPIC_API_KEY)' }, { status: 500 });
    }

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Phase 1 must have run first
    const existingMeta = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
    if (!existingMeta.length) {
      return Response.json({ error: 'Run Phase 1 (titles/tags) first.' }, { status: 400 });
    }
    const meta = existingMeta[0];

    let allTags = [];
    try { allTags = JSON.parse(meta.tags || '[]'); } catch (_) {}
    let seoAnalysis = {};
    try { seoAnalysis = JSON.parse(meta.seo_analysis || '{}'); } catch (_) {}

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script =
      scripts.find(s => s.version === 'final_aggregated') ||
      scripts.find(s => s.version === 'final') ||
      scripts[0];
    const fullScript = script?.full_script || script?.content || '';

    const videoTitle = meta.title_primary || project.name || 'Untitled';
    const niche = project.niche || 'general';
    const scriptExcerpt = fullScript.substring(0, 2000);

    console.log(`=== SEO Phase 2 (Claude) | Title: ${videoTitle} ===`);

    const system = `You are a YouTube description copywriter specializing in faceless channels. You write compelling, SEO-optimized descriptions that boost watch time and subscribers. You respond ONLY with valid JSON — no markdown, no code fences, no extra text.`;

    const userPrompt = `Write 3 different YouTube video descriptions (400-600 words each).

VIDEO CONTEXT:
- Title: "${videoTitle}"
- Niche: ${niche}
- Primary Keyword: ${seoAnalysis.primary_keyword || 'N/A'}
- Top Tags: ${allTags.slice(0, 8).join(', ')}
- Script Excerpt: ${scriptExcerpt}

DESCRIPTION RULES:

1. FIRST 150 CHARACTERS ARE CRITICAL:
   - Shown in search results and above the fold
   - Must contain primary keyword AND emotional hook
   - Never start with "In this video..." or "Welcome back..."

2. KEYWORD INTEGRATION:
   - Primary keyword in first sentence, naturally
   - Secondary keywords in first paragraph
   - Max 3 different long-tail keywords in the body
   - No keyword stuffing — must read naturally

3. STRUCTURE: Hook (150 chars) → Value summary → 5 SEO KEYWORDS → 4 hIGH VALUE hashtags → CTAs
   - Use line breaks generously — descriptions are scanned
   - 2-3 CTAs: subscribe, comment question, related video

4. ENGAGEMENT:
   - Ask a specific question to drive comments
   - Include one "controversial" statement viewers want to debate
   - Reference the next video to boost session time

Each description must be 400-600 words. No placeholder text.

Return ONLY this JSON:
{
  "descriptions": [
    {
      "label": "Hook-Heavy",
      "style": "hook_heavy",
      "content": "Full 200-400 word description here...",
      "word_count": 480,
      "primary_keywords_used": ["kw1", "kw2"],
      "long_tail_keywords_used": ["long kw1", "long kw2", "long kw3"]
    },
    {
      "label": "SEO-Optimized",
      "style": "seo_optimized",
      "content": "Full 200-400 word description here...",
      "word_count": 520,
      "primary_keywords_used": ["kw1", "kw2"],
      "long_tail_keywords_used": ["long kw1", "long kw2", "long kw3"]
    },
    {
      "label": "Storytelling",
      "style": "storytelling",
      "content": "Full 200-400 word description here...",
      "word_count": 500,
      "primary_keywords_used": ["kw1", "kw2"],
      "long_tail_keywords_used": ["long kw1", "long kw2", "long kw3"]
    }
  ]
}`;

    const responseText = await callAI(OPENAI_API_KEY, CLAUDE_API_KEY, system, userPrompt, 6000);
    const parsed = parseJson(responseText);

    if (!parsed?.descriptions?.length) {
      console.error('Parse failed. Raw:', responseText.substring(0, 500));
      return Response.json({ error: 'Failed to parse descriptions', raw: responseText.substring(0, 300) }, { status: 500 });
    }

    const formattedDescriptions = parsed.descriptions.map((d, i) => ({
      label: d.label || ['Hook-Heavy', 'SEO-Optimized', 'Storytelling'][i] || `Version ${i + 1}`,
      content: d.content,
      word_count: d.word_count || 0,
      primary_keywords: d.primary_keywords_used || allTags.slice(0, 3),
      long_tail_keywords: d.long_tail_keywords_used || allTags.slice(3, 6),
    }));

    await base44.asServiceRole.entities.UploadMetadata.update(meta.id, {
      description_template: parsed.descriptions[0]?.content || '',
      description_alt_1: parsed.descriptions[1]?.content || '',
      description_alt_2: parsed.descriptions[2]?.content || '',
      descriptions_json: JSON.stringify(formattedDescriptions),
    });

    console.log(`✅ Generated ${formattedDescriptions.length} descriptions`);

    return Response.json({
      success: true,
      descriptions: formattedDescriptions,
    });

  } catch (error) {
    console.error('SEO Phase 2 error:', error.message);
    return Response.json({ error: error.message || 'Description generation failed' }, { status: 500 });
  }
});