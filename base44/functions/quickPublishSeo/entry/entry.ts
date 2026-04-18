import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH SEO — Generate titles, descriptions, tags, hashtags
// Uses dedicated SEO Expert prompts for tags & strategic hashtag logic
// v2 — redeploy trigger
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

// ══════════════════════════════════════════════════════════════════
// DEDICATED TAG GENERATION — Role: YouTube SEO Expert
// ══════════════════════════════════════════════════════════════════
async function generateTagsFromScript(apiKey, scriptText, niche, videoTitle, seoAnalysis) {
  const scriptExcerpt = scriptText.substring(0, 5000);
  const primaryKw = seoAnalysis?.primary_keyword || '';
  const secondaryKws = (seoAnalysis?.secondary_keywords || []).join(', ');

  const prompt = `You are an expert YouTube SEO strategist and metadata specialist. You have 10+ years of experience ranking videos on YouTube search and suggested feeds. Below is a video script. Analyze it deeply and generate a comprehensive list of high-performing YouTube tags.

VIDEO CONTEXT:
- Title: "${videoTitle}"
- Niche: ${niche}
- Primary Keyword: ${primaryKw}
- Secondary Keywords: ${secondaryKws}

FULL SCRIPT:
"""
${scriptExcerpt}
"""

═══════════════════════════════════════════════
REQUIREMENTS — Follow these EXACTLY:
═══════════════════════════════════════════════

1. PRIMARY TAG: Start with the single most important, specific keyword for this exact video. This is the #1 search term a viewer would type.

2. LONG-TAIL KEYWORDS: Include at least 8 long-tail keyword phrases (3-6 words) that real people would actually type into YouTube's search bar when looking for this content. Think like a viewer, not a marketer.

3. BROAD CATEGORY TAGS: Include 3-4 broad niche/category tags that place this video in the right ecosystem (e.g., "true crime documentary", "personal finance", "history explained").

4. MISSPELLINGS & ALTERNATES: Add 3-5 common misspellings, alternate names, or colloquial versions of the topic. Real viewers misspell things — capture that traffic.

5. CONTENT GAP TAGS: Include 5 tags that specifically target "content gaps" — topics people are searching for but don't find enough good videos on. These are low-competition, high-intent keywords related to this script.

6. VIEWER-INTENT TAGS: Include 3-4 tags based on the language and tone used in the script — are viewers beginners, hobbyists, or professionals? Tag accordingly.

7. FORMAT: Output as comma-separated lists organized by category so tags can be copy-pasted directly into YouTube Studio.

8. TAG RULES:
   - Each tag must be under 30 characters (YouTube limit per tag)
   - Total combined character count of ALL tags must be under 500 characters (YouTube limit)
   - No special characters except spaces and hyphens
   - No hashtags in tags (those are separate)
   - Aim for 20-25 total tags

═══════════════════════════════════════════════
OUTPUT — RETURN ONLY VALID JSON, NO MARKDOWN:
═══════════════════════════════════════════════

{
  "primary_tag": "the single most important keyword",
  "tags_breakdown": {
    "short": ["5 broad 1-2 word tags from the niche"],
    "medium": ["8-10 medium 2-3 word specific tags"],
    "long": ["8 long-tail 3-6 word search phrases viewers would type"]
  },
  "misspelling_tags": ["3-5 common misspellings or alternate names"],
  "content_gap_tags": ["5 low-competition high-intent tags"],
  "all_tags_comma_separated": "every tag above combined into one comma-separated string ready for YouTube Studio"
}`;

  const raw = await callGemini(apiKey, prompt, 3000);
  return parseJson(raw);
}

// ══════════════════════════════════════════════════════════════════
// DEDICATED HASHTAG GENERATION — Strategic 3-5 Rule for 2026
// ══════════════════════════════════════════════════════════════════
async function generateHashtagsFromScript(apiKey, scriptText, niche, videoTitle, channelName) {
  const scriptExcerpt = scriptText.substring(0, 3000);

  const prompt = `You are a YouTube hashtag strategist. Hashtags are visible labels that appear ABOVE the video title. In 2026, the algorithm uses them as "context anchors" to confirm what the video is about.

VIDEO CONTEXT:
- Title: "${videoTitle}"
- Niche: ${niche}
- Channel Name: "${channelName || 'N/A'}"

SCRIPT EXCERPT:
"""
${scriptExcerpt}
"""

═══════════════════════════════════════════════
THE 3-5 RULE FOR 2026:
═══════════════════════════════════════════════

- Use EXACTLY 5 hashtags. No more, no less.
- The FIRST THREE are critical — they appear prominently above your video title on desktop and mobile.
- Quality over quantity. The algorithm confirms your video's topic from these.

HASHTAG STRATEGY:
1. BRANDED TAG: #${channelName ? channelName.replace(/[^a-zA-Z0-9]/g, '') : 'YourChannel'} — keeps viewers in your content ecosystem
2. TWO BROAD CATEGORY TAGS: Place your video in the right niche ecosystem (e.g., #TrueCrime, #HistoryExplained)
3. TWO NICHE-SPECIFIC TAGS: Hyper-relevant to THIS specific video's content based on the script

BANNED HASHTAGS — DO NOT USE ANY OF THESE:
#viral, #trending, #explore, #fyp, #foryou, #foryoupage, #viralvideo, #trend, #popular, #blowup, #algorithm
These are too broad and actively HURT your discoverability.

PLACEMENT RULES:
- These will go at the BOTTOM of the description
- YouTube auto-pulls the first 3 to display above the title
- Order matters: put the 3 most important first

═══════════════════════════════════════════════
OUTPUT — RETURN ONLY VALID JSON:
═══════════════════════════════════════════════

{
  "hashtags": ["#BrandedTag", "#BroadCategory1", "#BroadCategory2", "#NicheSpecific1", "#NicheSpecific2"],
  "placement_order_reasoning": "Why these 3 appear first above the title",
  "hashtag_string": "#Tag1 #Tag2 #Tag3 #Tag4 #Tag5"
}`;

  const raw = await callGemini(apiKey, prompt, 1500);
  return parseJson(raw);
}


Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, transcript, niche, channel_name } = await req.json();
    if (!project_id || !transcript) return Response.json({ error: 'project_id and transcript required' }, { status: 400 });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    const nicheLabel = niche || 'general';
    const channelName = channel_name || '';

    console.log(`=== Quick Publish SEO: Titles + Descriptions + Tags + Hashtags ===`);
    console.log(`Project: ${project_id} | Transcript: ${transcript.length} chars | Niche: ${nicheLabel} | Channel: ${channelName}`);

    // ── STEP 1: TITLES + DESCRIPTIONS ─────────────────────────
    const scriptExcerpt = transcript.substring(0, 4000);

    const titlePrompt = `You are the world's #1 YouTube title strategist. Analyze this video transcript and generate killer SEO-optimized titles and descriptions.

TRANSCRIPT EXCERPT:
"""
${scriptExcerpt}
"""

NICHE: ${nicheLabel}

Generate 5 high-CTR titles + full SEO analysis + 3 descriptions.

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

Generate EXACTLY 5 titles and 3 descriptions.
Return ONLY valid JSON.`;

    const titleResponseText = await callGemini(GEMINI_API_KEY, titlePrompt, 8192);
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
    console.log(`✅ Generated ${titles.length} titles | Primary keyword: ${seoAnalysis.primary_keyword}`);

    // ── STEP 2: DEDICATED TAG GENERATION (SEO Expert) ──────────
    console.log(`🏷️ Generating tags from transcript via SEO Expert...`);
    const tagResult = await generateTagsFromScript(GEMINI_API_KEY, transcript, nicheLabel, titles[0]?.title || 'Untitled', seoAnalysis);

    let tagsBreakdown = { short: [], medium: [], long: [] };
    if (tagResult) {
      tagsBreakdown = tagResult.tags_breakdown || tagsBreakdown;
      const contentGapTags = tagResult.content_gap_tags || [];
      const misspellingTags = tagResult.misspelling_tags || [];
      tagsBreakdown.long = [...(tagsBreakdown.long || []), ...contentGapTags, ...misspellingTags];
      if (tagResult.primary_tag && !tagsBreakdown.short.includes(tagResult.primary_tag)) {
        tagsBreakdown.short = [tagResult.primary_tag, ...tagsBreakdown.short];
      }
      console.log(`✅ Tags: ${tagsBreakdown.short.length} short + ${tagsBreakdown.medium.length} medium + ${tagsBreakdown.long.length} long`);
    } else {
      console.warn('⚠️ Tag generation failed, using empty tags');
    }

    // ── STEP 3: DEDICATED HASHTAG GENERATION (Strategic 3-5 Rule) ──
    console.log(`#️⃣ Generating strategic hashtags...`);
    const hashResult = await generateHashtagsFromScript(GEMINI_API_KEY, transcript, nicheLabel, titles[0]?.title || 'Untitled', channelName);

    let hashtags = [];
    let hashtagString = '';
    if (hashResult) {
      hashtags = hashResult.hashtags || [];
      hashtagString = hashResult.hashtag_string || hashtags.join(' ');
      console.log(`✅ Hashtags: ${hashtagString}`);
    } else {
      console.warn('⚠️ Hashtag generation failed, using empty hashtags');
    }

    // ── SAVE TO UPLOAD METADATA ──────────────────────────────
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

    console.log(`✅ All SEO data saved to UploadMetadata`);

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