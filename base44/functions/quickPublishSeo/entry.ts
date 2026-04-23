import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH SEO — Generate titles, descriptions, tags, hashtags
// Claude primary + Gemini fallback (same pattern as generateScriptBatches)
// ══════════════════════════════════════════════════════════════════

async function callClaude(prompt, maxTokens) {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Claude ${res.status}: ${err.error?.message || 'Unknown'}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callGemini(prompt, maxTokens) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: maxTokens || 8192 },
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

// Claude primary, Gemini fallback — same pattern as generateScriptBatches
async function callLLM(prompt, maxTokens) {
  try {
    const text = await callClaude(prompt, maxTokens);
    console.log('LLM: Claude');
    return text;
  } catch (claudeErr) {
    const msg = claudeErr.message || '';
    const isFatal = /credit balance|billing|api key|unauthorized/i.test(msg);
    console.warn('Claude failed' + (isFatal ? ' (fatal)' : '') + ':', msg.substring(0, 120));
    console.log('LLM: falling back to Gemini...');
    return await callGemini(prompt, maxTokens);
  }
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

async function generateTagsFromScript(scriptText, niche, videoTitle, seoAnalysis) {
  const scriptExcerpt = scriptText.substring(0, 5000);
  const primaryKw = seoAnalysis?.primary_keyword || '';
  const secondaryKws = (seoAnalysis?.secondary_keywords || []).join(', ');

  const prompt = `You are an expert YouTube SEO strategist. Analyze this video script and generate high-performing YouTube tags.

VIDEO CONTEXT:
- Title: "${videoTitle}"
- Niche: ${niche}
- Primary Keyword: ${primaryKw}
- Secondary Keywords: ${secondaryKws}

FULL SCRIPT:
"""
${scriptExcerpt}
"""

TAG RULES:
- Each tag under 30 characters (YouTube limit)
- Total all tags under 500 characters
- No special characters except spaces and hyphens
- No hashtags in tags
- Aim for 20-25 total tags

Return ONLY valid JSON:
{
  "primary_tag": "the single most important keyword",
  "tags_breakdown": {
    "short": ["5 broad 1-2 word tags"],
    "medium": ["8-10 medium 2-3 word tags"],
    "long": ["8 long-tail 3-6 word phrases"]
  },
  "misspelling_tags": ["3-5 common misspellings or alternate names"],
  "content_gap_tags": ["5 low-competition high-intent tags"],
  "all_tags_comma_separated": "every tag combined into one comma-separated string"
}`;

  const raw = await callLLM(prompt, 3000);
  return parseJson(raw);
}

async function generateHashtagsFromScript(scriptText, niche, videoTitle, channelName) {
  const scriptExcerpt = scriptText.substring(0, 3000);

  const prompt = `You are a YouTube hashtag strategist. Generate exactly 5 strategic hashtags for this video.

VIDEO CONTEXT:
- Title: "${videoTitle}"
- Niche: ${niche}
- Channel Name: "${channelName || 'N/A'}"

SCRIPT EXCERPT:
"""
${scriptExcerpt}
"""

HASHTAG STRATEGY (use exactly 5):
1. Branded tag: #${channelName ? channelName.replace(/[^a-zA-Z0-9]/g, '') : 'Channel'}
2-3. Two broad category tags (e.g., #TrueCrime, #HistoryExplained)
4-5. Two niche-specific tags hyper-relevant to this video

BANNED: #viral #trending #fyp #foryou #explore #popular #blowup

Return ONLY valid JSON:
{
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"],
  "hashtag_string": "#Tag1 #Tag2 #Tag3 #Tag4 #Tag5"
}`;

  const raw = await callLLM(prompt, 1500);
  return parseJson(raw);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, transcript, niche, channel_name } = await req.json();
    if (!project_id || !transcript) return Response.json({ error: 'project_id and transcript required' }, { status: 400 });

    const nicheLabel = niche || 'general';
    const channelName = channel_name || '';
    const scriptExcerpt = transcript.substring(0, 4000);

    console.log('Quick Publish SEO | project:', project_id, '| niche:', nicheLabel);

    // ── STEP 1: TITLES + DESCRIPTIONS ─────────────────────────
    const titlePrompt = `You are a YouTube title and description strategist. Analyze this transcript and generate SEO-optimized titles and descriptions.

TRANSCRIPT EXCERPT:
"""
${scriptExcerpt}
"""

NICHE: ${nicheLabel}

Generate 5 high-CTR titles and 3 descriptions.

TITLE RULES:
- Front-load primary keyword in first 5 words
- Under 60 characters each
- Use curiosity gaps, power words, or numbers
- Each title unique in approach

Return ONLY valid JSON:
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

Generate EXACTLY 5 titles and 3 descriptions. Return ONLY valid JSON.`;

    const titleResponseText = await callLLM(titlePrompt, 8192);
    const parsed = parseJson(titleResponseText);

    if (!parsed?.titles?.length) {
      console.error('Parse failed. Raw:', titleResponseText.substring(0, 500));
      return Response.json({ error: 'Failed to parse SEO response' }, { status: 500 });
    }

    const titles = (parsed.titles || []).slice(0, 10).map((t, i) => ({
      ...t,
      rank: t.rank || (i + 1),
      char_count: t.char_count || t.title?.length || 0,
    }));

    const seoAnalysis = parsed.seo_analysis || {};
    console.log('Titles done:', titles.length, '| keyword:', seoAnalysis.primary_keyword);

    // ── STEP 2: TAGS ───────────────────────────────────────────
    const tagResult = await generateTagsFromScript(transcript, nicheLabel, titles[0]?.title || 'Untitled', seoAnalysis);

    let tagsBreakdown = { short: [], medium: [], long: [] };
    if (tagResult) {
      tagsBreakdown = tagResult.tags_breakdown || tagsBreakdown;
      const contentGapTags = tagResult.content_gap_tags || [];
      const misspellingTags = tagResult.misspelling_tags || [];
      tagsBreakdown.long = [...(tagsBreakdown.long || []), ...contentGapTags, ...misspellingTags];
      if (tagResult.primary_tag && !tagsBreakdown.short.includes(tagResult.primary_tag)) {
        tagsBreakdown.short = [tagResult.primary_tag, ...tagsBreakdown.short];
      }
      console.log('Tags done:', tagsBreakdown.short.length, '+', tagsBreakdown.medium.length, '+', tagsBreakdown.long.length);
    }

    // ── STEP 3: HASHTAGS ───────────────────────────────────────
    const hashResult = await generateHashtagsFromScript(transcript, nicheLabel, titles[0]?.title || 'Untitled', channelName);

    let hashtags = [];
    let hashtagString = '';
    if (hashResult) {
      hashtags = hashResult.hashtags || [];
      hashtagString = hashResult.hashtag_string || hashtags.join(' ');
      console.log('Hashtags done:', hashtagString);
    }

    // ── SAVE TO UPLOAD METADATA ────────────────────────────────
    const allTags = [
      ...(tagsBreakdown.short || []),
      ...(tagsBreakdown.medium || []),
      ...(tagsBreakdown.long || []),
    ];

    const existingMeta = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
    const metaData = {
      project_id,
      title_primary: titles[0]?.title || '',
      title_variation_1: titles[1]?.title || '',
      title_variation_2: titles[2]?.title || '',
      title_variation_3: titles[3]?.title || '',
      title_variation_4: titles[4]?.title || '',
      tags: JSON.stringify(allTags),
      tags_short: JSON.stringify(tagsBreakdown.short || []),
      tags_medium: JSON.stringify(tagsBreakdown.medium || []),
      tags_long: JSON.stringify(tagsBreakdown.long || []),
      hashtags: hashtagString,
      pinned_comment: parsed.pinned_comment || '',
      seo_analysis: JSON.stringify(seoAnalysis),
      seo_strategy: seoAnalysis.niche_opportunity || '',
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

    console.log('SEO data saved to UploadMetadata');

    return Response.json({
      success: true,
      titles,
      seo_analysis: seoAnalysis,
      tags_breakdown: tagsBreakdown,
      hashtags,
      hashtag_string: hashtagString,
      pinned_comment: parsed.pinned_comment || '',
      descriptions: parsed.descriptions || [],
    });

  } catch (error) {
    console.error('quickPublishSeo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});