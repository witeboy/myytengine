import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH SEO — Generate titles, descriptions, tags from transcript
// Creates a temporary project + UploadMetadata, then runs SEO pipeline
// ══════════════════════════════════════════════════════════════════

async function callGemini(apiKey, prompt, maxTokens = 8192) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: maxTokens },
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

    const { project_id, transcript, niche } = await req.json();
    if (!project_id || !transcript) return Response.json({ error: 'project_id and transcript required' }, { status: 400 });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const scriptExcerpt = transcript.substring(0, 4000);
    const nicheLabel = niche || 'general';

    console.log(`=== Quick Publish SEO: Titles + Descriptions ===`);
    console.log(`Project: ${project_id} | Transcript: ${scriptExcerpt.length} chars | Niche: ${nicheLabel}`);

    // ── PHASE 1: TITLES + TAGS ─────────────────────────────────
    const titlePrompt = `You are the world's #1 YouTube title strategist. Analyze this video transcript and generate killer SEO-optimized titles.

TRANSCRIPT EXCERPT:
"""
${scriptExcerpt}
"""

NICHE: ${nicheLabel}

Generate 5 high-CTR titles + full SEO analysis + tags.

TITLE RULES:
- Front-load primary keyword in first 5 words
- Under 60 characters each
- Use curiosity gaps, power words, or numbers
- Each title must be unique in approach

OUTPUT — RETURN ONLY VALID JSON:
{
  "titles": [
    {
      "rank": 1,
      "title": "Under 60 chars",
      "hook_type": "curiosity_gap|power_word|number|warning|pattern_break",
      "scroll_stop_score": 9,
      "keyword_density_score": 8,
      "thumbnail_pairing_score": 9,
      "char_count": 55,
      "why_it_works": "One sentence",
      "target_keyword": "primary keyword",
      "clickbait_trigger": "emotion exploited"
    }
  ],
  "seo_analysis": {
    "primary_keyword": "main keyword",
    "secondary_keywords": ["kw1", "kw2", "kw3"],
    "estimated_search_volume": "10K-50K/month",
    "competition": "low|medium|high",
    "search_intent": "what viewers want",
    "trending_angle": "current trend",
    "recommended_upload_day": "Tuesday",
    "recommended_upload_time": "2PM EST",
    "niche_opportunity": "gap in market"
  },
  "tags_breakdown": {
    "short": ["5 broad tags"],
    "medium": ["10 medium tags"],
    "long": ["15 long-tail tags"]
  },
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "pinned_comment": "Engaging question or CTA. 2-3 sentences.",
  "descriptions": [
    {
      "label": "Hook-Heavy",
      "content": "400-500 word description. Emotional opening. Keyword-rich.",
      "word_count": 450,
      "primary_keywords": ["kw1"],
      "long_tail_keywords": ["long kw1"]
    },
    {
      "label": "SEO-Optimized",
      "content": "400-500 word description. Structured.",
      "word_count": 450,
      "primary_keywords": ["kw1"],
      "long_tail_keywords": ["long kw1"]
    },
    {
      "label": "Storytelling",
      "content": "400-500 word description. Narrative.",
      "word_count": 450,
      "primary_keywords": ["kw1"],
      "long_tail_keywords": ["long kw1"]
    }
  ]
}

Generate EXACTLY 5 titles, 3 descriptions, 30 tags (5 short + 10 medium + 15 long), and 5 hashtags.
Return ONLY valid JSON.`;

    const responseText = await callGemini(GEMINI_API_KEY, titlePrompt, 8192);
    const parsed = parseJson(responseText);

    if (!parsed?.titles?.length) {
      console.error('Parse failed. Raw:', responseText.substring(0, 500));
      return Response.json({ error: 'Failed to parse SEO response' }, { status: 500 });
    }

    const titles = (parsed.titles || []).slice(0, 10).map((t, i) => ({
      ...t,
      rank: t.rank || (i + 1),
      char_count: t.char_count || t.title?.length || 0,
    }));

    // Save to UploadMetadata
    const existingMeta = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
    const metaData = {
      project_id,
      title_primary: titles[0]?.title || '',
      title_variation_1: titles[1]?.title || '',
      title_variation_2: titles[2]?.title || '',
      title_variation_3: titles[3]?.title || '',
      title_variation_4: titles[4]?.title || '',
      tags: JSON.stringify([
        ...(parsed.tags_breakdown?.short || []),
        ...(parsed.tags_breakdown?.medium || []),
        ...(parsed.tags_breakdown?.long || []),
      ]),
      tags_short: JSON.stringify(parsed.tags_breakdown?.short || []),
      tags_medium: JSON.stringify(parsed.tags_breakdown?.medium || []),
      tags_long: JSON.stringify(parsed.tags_breakdown?.long || []),
      hashtags: (parsed.hashtags || []).join(' '),
      pinned_comment: parsed.pinned_comment || '',
      seo_analysis: JSON.stringify(parsed.seo_analysis || {}),
      seo_strategy: parsed.seo_analysis?.niche_opportunity || '',
      titles_json: JSON.stringify(titles),
      description_template: parsed.descriptions?.[0]?.content || '',
      description_alt_1: parsed.descriptions?.[1]?.content || '',
      description_alt_2: parsed.descriptions?.[2]?.content || '',
      descriptions_json: JSON.stringify((parsed.descriptions || []).map((d, i) => ({
        label: d.label || ['Hook-Heavy', 'SEO-Optimized', 'Storytelling'][i],
        content: d.content,
        word_count: d.word_count || 0,
        primary_keywords: d.primary_keywords || [],
        long_tail_keywords: d.long_tail_keywords || [],
      }))),
    };

    if (existingMeta.length > 0) {
      await base44.asServiceRole.entities.UploadMetadata.update(existingMeta[0].id, metaData);
    } else {
      await base44.asServiceRole.entities.UploadMetadata.create(metaData);
    }

    console.log(`✅ Generated ${titles.length} titles + descriptions + tags`);

    return Response.json({
      success: true,
      titles,
      seo_analysis: parsed.seo_analysis || {},
      tags_breakdown: parsed.tags_breakdown || {},
      hashtags: parsed.hashtags || [],
      pinned_comment: parsed.pinned_comment || '',
      descriptions: parsed.descriptions || [],
    });

  } catch (error) {
    console.error('quickPublishSeo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});