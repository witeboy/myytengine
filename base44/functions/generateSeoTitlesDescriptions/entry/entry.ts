import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// generateSeoTitlesDescriptions — PHASE 1
// Migrated from Gemini → Claude Sonnet 4.5
// Fixes: 429 rate limits, parallel execution, robust JSON parsing

const CLAUDE_MODEL = 'claude-sonnet-4-5';

async function callClaude(apiKey, systemPrompt, userPrompt, maxTokens = 4096) {
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

async function generateTagsFromScript(apiKey, scriptText, niche, videoTitle, seoAnalysis) {
  const scriptExcerpt = scriptText.substring(0, 5000);
  const primaryKw = seoAnalysis?.primary_keyword || '';
  const secondaryKws = (seoAnalysis?.secondary_keywords || []).join(', ');

  const system = `You are an expert YouTube SEO strategist with 10+ years experience ranking videos. You respond ONLY with valid JSON — no markdown, no code fences, no extra text.`;

  const user = `Generate high-performing YouTube tags for this video.

VIDEO CONTEXT:
- Title: "${videoTitle}"
- Niche: ${niche}
- Primary Keyword: ${primaryKw}
- Secondary Keywords: ${secondaryKws}

SCRIPT:
"""
${scriptExcerpt}
"""

TAG RULES:
- Each tag under 30 characters
- Total all tags under 500 characters combined
- No hashtags, no special chars except spaces/hyphens
- Aim for 10 total tags

Return ONLY this JSON:
{
  "primary_tag": "single most important keyword",
  "tags_breakdown": {
    "short": ["3 broad 1-2 word tags"],
    "medium": ["3 specific 2-3 word tags"],
    "long": ["3 long-tail 3-6 word search phrases"]
  },
  "misspelling_tags": ["2-3 misspellings or alternate names"],
  "content_gap_tags": ["3-5 low-competition high-intent tags"],
  "all_tags_comma_separated": "all tags as one comma-separated string ready for YouTube Studio"
}`;

  const raw = await callClaude(apiKey, system, user, 2000);
  return parseJson(raw);
}

async function generateHashtagsFromScript(apiKey, scriptText, niche, videoTitle, channelName) {
  const scriptExcerpt = scriptText.substring(0, 3000);
  const brandTag = channelName ? channelName.replace(/[^a-zA-Z0-9]/g, '') : 'YourChannel';

  const system = `You are a YouTube hashtag strategist for 2026. You respond ONLY with valid JSON — no markdown, no code fences, no extra text.`;

  const user = `Generate exactly 5 strategic YouTube hashtags.

VIDEO CONTEXT:
- Title: "${videoTitle}"
- Niche: ${niche}
- Channel: "${channelName || 'N/A'}"

SCRIPT:
"""
${scriptExcerpt}
"""

RULES:
- Exactly 5 hashtags, ordered by importance (first 3 show above title on desktop)
- #1: Branded (#${brandTag})
- #2-3: Broad category tags
- #4-5: Hyper-specific to this video's content
- NEVER USE: #viral #trending #explore #foryou #foryoupage #viralvideo #trend #popular

Return ONLY this JSON:
{
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4", "#Tag5"],
  "placement_order_reasoning": "Why these 3 appear first",
  "hashtag_string": "#Tag1 #Tag2 #Tag3 #Tag4 #Tag5"
}`;

  const raw = await callClaude(apiKey, system, user, 800);
  return parseJson(raw);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const CLAUDE_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!CLAUDE_API_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });

    // Load project
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Load script — require final script
    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script =
      scripts.find(s => s.version === 'final_aggregated') ||
      scripts.find(s => s.version === 'final') ||
      scripts[0];
    const fullScript = script?.full_script || script?.content || '';
    if (!fullScript) {
      return Response.json({ error: 'No final script found. Please generate a final script first.' }, { status: 400 });
    }

    // Load topic — require selected topic
    let topicTitle = '';
    let topicDescription = '';
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      if (topics[0]) {
        topicTitle = topics[0].title || '';
        topicDescription = topics[0].description || '';
      }
    }
    if (!topicTitle) {
      return Response.json({ error: 'No selected topic found. Please select a topic first.' }, { status: 400 });
    }

    // Load channel name
    let channelName = '';
    if (project.channel_id) {
      try {
        const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
        if (channels[0]) channelName = channels[0].name || channels[0].channel_name || '';
      } catch (_) {}
    }

    // Load thumbnail concepts for title pairing context
    let thumbnailContext = '';
    try {
      const thumbConcepts = await base44.asServiceRole.entities.ThumbnailConcepts.filter({ project_id });
      if (thumbConcepts.length > 0) {
        const top3 = thumbConcepts
          .sort((a, b) => (b.ctr_score || 0) - (a.ctr_score || 0))
          .slice(0, 3);
        thumbnailContext = `\nEXISTING THUMBNAIL CONCEPTS (titles must COMPLEMENT these, not repeat them):\n${top3
          .map(t => `- Overlay: "${t.text_overlay}" | Emotion: ${t.psychological_trigger || t.concept_type} | CTR: ${t.ctr_score}/10`)
          .join('\n')}`;
      }
    } catch (_) {}

    const videoTitle = topicTitle || project.name || 'Untitled';
    const niche = project.niche || 'general';
    const scriptExcerpt = fullScript.substring(0, 3000);

    console.log(`=== SEO Phase 1 (Claude) | Project: ${project.name} | Niche: ${niche} | Script: ${fullScript.length} chars ===`);

    // ── STEP 1: TITLES (sequential — needed for tags/hashtags context) ──
    const titleSystem = `You are the world's #1 YouTube title strategist specializing in faceless channel growth. You respond ONLY with valid JSON — no markdown, no code fences, no extra text before or after.`;

    const titleUser = `Generate 10 high-CTR YouTube titles + SEO analysis.

VIDEO CONTEXT:
- Working Title: "${videoTitle}"
- Niche: ${niche}
- Topic Description: ${topicDescription}
- Script Excerpt: ${scriptExcerpt}
${thumbnailContext}

TITLE RULES:
- Every title under 60 characters (YouTube truncates)
- Front-load primary keyword in first 5 words
- Use at least ONE CTR trigger per title:
  * Curiosity Gap: "The Truth About X Nobody Talks About"
  * Power Words: SHOCKING, DEADLY, FORBIDDEN, SECRET
  * Numbers: "7 Signs...", "$50K...", "In 3 Days..."
  * Warning: "Stop Doing X Before It's Too Late"
  * Pattern Break: Unexpected word combos that stop scrolling
- Score each: scroll_stop (1-10), keyword_density (1-10), thumbnail_pairing (1-10)

Return ONLY this JSON:
{
  "titles": [
    {
      "rank": 1,
      "title": "Under 60 char title here",
      "hook_type": "curiosity_gap|power_word|number|warning|pattern_break",
      "scroll_stop_score": 9,
      "keyword_density_score": 8,
      "thumbnail_pairing_score": 9,
      "char_count": 55,
      "why_it_works": "One sentence on the psychology",
      "target_keyword": "primary keyword this targets",
      "clickbait_trigger": "specific emotion this exploits"
    }
  ],
  "seo_analysis": {
    "primary_keyword": "main keyword phrase",
    "secondary_keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"],
    "estimated_search_volume": "10K-50K/month",
    "competition": "low|medium|high",
    "search_intent": "what viewers are actually looking for",
    "trending_angle": "current trend this can ride",
    "recommended_upload_day": "Tuesday",
    "recommended_upload_time": "2PM EST",
    "niche_opportunity": "specific gap in the market"
  },
  "pinned_comment": "Engaging question or CTA to boost comments. 2-3 sentences."
}`;

    const titleResponseText = await callClaude(CLAUDE_API_KEY, titleSystem, titleUser, 4096);
    const titleParsed = parseJson(titleResponseText);

    if (!titleParsed?.titles?.length) {
      console.error('Title parse failed. Raw:', titleResponseText.substring(0, 500));
      return Response.json({ error: 'Failed to parse title response', raw: titleResponseText.substring(0, 300) }, { status: 500 });
    }

    const titles = titleParsed.titles.slice(0, 10).map((t, i) => ({
      ...t,
      rank: t.rank || i + 1,
      char_count: t.char_count || t.title?.length || 0,
      scroll_stop_score: t.scroll_stop_score || 7,
      keyword_density_score: t.keyword_density_score || 7,
      thumbnail_pairing_score: t.thumbnail_pairing_score || 7,
    }));

    const seoAnalysis = titleParsed.seo_analysis || {};
    console.log(`✅ ${titles.length} titles | Primary keyword: ${seoAnalysis.primary_keyword}`);

    // ── STEP 2+3: TAGS + HASHTAGS IN PARALLEL ───────────────────
    console.log(`🚀 Generating tags + hashtags in parallel...`);
    const [tagResult, hashResult] = await Promise.allSettled([
      generateTagsFromScript(CLAUDE_API_KEY, fullScript, niche, titles[0]?.title || videoTitle, seoAnalysis),
      generateHashtagsFromScript(CLAUDE_API_KEY, fullScript, niche, titles[0]?.title || videoTitle, channelName),
    ]);

    // Process tags
    let tagsBreakdown = { short: [], medium: [], long: [] };
    if (tagResult.status === 'fulfilled' && tagResult.value) {
      const tr = tagResult.value;
      tagsBreakdown = tr.tags_breakdown || tagsBreakdown;
      tagsBreakdown.long = [
        ...(tagsBreakdown.long || []),
        ...(tr.content_gap_tags || []),
        ...(tr.misspelling_tags || []),
      ];
      if (tr.primary_tag && !tagsBreakdown.short.includes(tr.primary_tag)) {
        tagsBreakdown.short = [tr.primary_tag, ...tagsBreakdown.short];
      }
      console.log(`✅ Tags: ${tagsBreakdown.short.length} short | ${tagsBreakdown.medium.length} medium | ${tagsBreakdown.long.length} long`);
    } else {
      console.warn('⚠️ Tag generation failed:', tagResult.reason?.message || 'parse error');
    }

    // Process hashtags
    let hashtags = [];
    let hashtagString = '';
    if (hashResult.status === 'fulfilled' && hashResult.value) {
      hashtags = hashResult.value.hashtags || [];
      hashtagString = hashResult.value.hashtag_string || hashtags.join(' ');
      console.log(`✅ Hashtags: ${hashtagString}`);
    } else {
      console.warn('⚠️ Hashtag generation failed:', hashResult.reason?.message || 'parse error');
    }

    // ── SAVE TO UPLOAD METADATA ──────────────────────────────────
    const existingMeta = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id });
    const allTags = [
      ...(tagsBreakdown.short || []),
      ...(tagsBreakdown.medium || []),
      ...(tagsBreakdown.long || []),
    ];

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
      pinned_comment: titleParsed.pinned_comment || '',
      seo_analysis: JSON.stringify(seoAnalysis),
      seo_strategy: seoAnalysis.niche_opportunity || '',
      titles_json: JSON.stringify(titles),
    };

    if (existingMeta.length > 0) {
      await base44.asServiceRole.entities.UploadMetadata.update(existingMeta[0].id, metaData);
    } else {
      await base44.asServiceRole.entities.UploadMetadata.create(metaData);
    }

    return Response.json({
      success: true,
      titles,
      seo_analysis: seoAnalysis,
      tags_breakdown: tagsBreakdown,
      hashtags,
      hashtag_string: hashtagString,
      pinned_comment: titleParsed.pinned_comment || '',
      needs_descriptions: true,
    });

  } catch (error) {
    console.error('SEO Phase 1 error:', error.message);
    return Response.json({ error: error.message || 'Title generation failed' }, { status: 500 });
  }
});