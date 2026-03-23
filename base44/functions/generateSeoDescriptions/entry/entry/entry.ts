import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

// ══════════════════════════════════════════════════════════════════
// generateSeoDescriptions — PHASE 2 (Descriptions)
// Uses Gemini for algorithm-optimized, keyword-rich descriptions
// ══════════════════════════════════════════════════════════════════

async function callGemini(apiKey, prompt, maxTokens = 6000) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.substring(0, 300)}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    let s = m[0].replace(/[\x00-\x1F\x7F]/g, ' ').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(s); } catch (_) {}
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

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get existing metadata (Phase 1 must have run)
    const existingMeta = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
    if (!existingMeta.length) return Response.json({ error: 'Run Phase 1 (titles) first' }, { status: 400 });
    const meta = existingMeta[0];

    // Parse tags from metadata
    let allTags = [];
    try { allTags = JSON.parse(meta.tags || '[]'); } catch (_) {}
    let seoAnalysis = {};
    try { seoAnalysis = JSON.parse(meta.seo_analysis || '{}'); } catch (_) {}

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = scripts.find(s => s.version === 'final_aggregated') || scripts.find(s => s.version === 'final') || scripts[0];
    const fullScript = script?.full_script || script?.content || '';

    const videoTitle = meta.title_primary || project.name || 'Untitled';
    const niche = project.niche || 'general';
    const scriptExcerpt = fullScript.substring(0, 2000);

    console.log(`=== SEO Phase 2: Description Generation ===`);

    const prompt = `You are a YouTube description copywriter who specializes in faceless channels. Write compelling, SEO-optimized descriptions that boost watch time and subscriber growth.

VIDEO CONTEXT:
- Title: "${videoTitle}"
- Niche: ${niche}
- Primary Keyword: ${seoAnalysis.primary_keyword || 'N/A'}
- Top Tags: ${allTags.slice(0, 8).join(', ')}
- Script Excerpt: ${scriptExcerpt}

Write 3 different YouTube video descriptions. Each must be 400-600 words.

═══════════════════════════════════════════════
DESCRIPTION ENGINEERING RULES
═══════════════════════════════════════════════

1. FIRST 150 CHARACTERS ARE EVERYTHING:
   - This is what shows in search results and above the fold
   - Must contain the primary keyword AND an emotional hook
   - Do NOT waste on "In this video..." or "Welcome back..."

2. KEYWORD INTEGRATION:
   - Primary keyword in first sentence, naturally
   - Secondary keywords spread through first paragraph
   - Long-tail keywords in the body (at least 5 different ones)
   - Do NOT keyword-stuff — it must read naturally

3. STRUCTURE:
   - Opening hook (150 chars) → Story/value summary → Timestamps placeholder → CTAs → Links section
   - Use line breaks generously — descriptions are scanned, not read
   - Include 2-3 CTAs (subscribe, comment question, related video)

4. ENGAGEMENT BOOSTERS:
   - Ask a specific question to drive comments
   - Include a "controversial" statement viewers will want to debate
   - Reference the next video to boost session time

OUTPUT — RETURN ONLY VALID JSON:

{
  "descriptions": [
    {
      "label": "Hook-Heavy",
      "style": "hook_heavy",
      "content": "Full 400-600 word description. Emotional opening. Story-driven.",
      "word_count": 500,
      "primary_keywords_used": ["kw1", "kw2"],
      "long_tail_keywords_used": ["long kw1", "long kw2", "long kw3"]
    },
    {
      "label": "SEO-Optimized",
      "style": "seo_optimized",
      "content": "Full 400-600 word description. Keyword-dense first paragraph. Structured sections.",
      "word_count": 500,
      "primary_keywords_used": ["kw1", "kw2"],
      "long_tail_keywords_used": ["long kw1", "long kw2", "long kw3"]
    },
    {
      "label": "Storytelling",
      "style": "storytelling",
      "content": "Full 400-600 word description. Narrative approach. Soft sell.",
      "word_count": 500,
      "primary_keywords_used": ["kw1", "kw2"],
      "long_tail_keywords_used": ["long kw1", "long kw2", "long kw3"]
    }
  ]
}

RULES:
- Each description MUST be 400-600 words — no placeholder text
- First 150 characters must be a compelling hook with primary keyword
- Include natural keyword integration throughout
- End each with a specific call-to-action
- Return ONLY the JSON object`;

    const responseText = await callGemini(GEMINI_API_KEY, prompt, 6000);
    const parsed = parseJson(responseText);

    if (!parsed?.descriptions?.length) {
      console.error('Parse failed. Raw:', responseText.substring(0, 500));
      return Response.json({ error: 'Failed to parse descriptions', raw: responseText.substring(0, 300) }, { status: 500 });
    }

    // Format for frontend
    const formattedDescriptions = parsed.descriptions.map((d, i) => ({
      label: d.label || ['Hook-Heavy', 'SEO-Optimized', 'Storytelling'][i] || `Version ${i + 1}`, 
      content: d.content,
      word_count: d.word_count || 0,
      primary_keywords: d.primary_keywords_used || allTags.slice(0, 3),
      long_tail_keywords: d.long_tail_keywords_used || allTags.slice(3, 6),
    }));

    // Save descriptions to metadata
    await base44.asServiceRole.entities.UploadMetadata.update(meta.id, {
      description_template: parsed.descriptions[0]?.content || '',
      description_alt_1: parsed.descriptions[1]?.content || '',
      description_alt_2: parsed.descriptions[2]?.content || '',
      descriptions_json: JSON.stringify(formattedDescriptions),
    });

    console.log(`Generated ${formattedDescriptions.length} descriptions`);

    return Response.json({
      success: true,
      descriptions: formattedDescriptions,
    });

  } catch (error) {
    console.error('SEO Phase 2 error:', error.message);
    return Response.json({ error: error.message || 'Description generation failed' }, { status: 500 });
  }
});