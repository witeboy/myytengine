import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// generateSeoTitlesDescriptions — PHASE 1 (AI-Powered Title + Tags + Hashtags Generator)
// Uses Gemini for high-CTR titles, then a dedicated SEO Expert pass for tags/hashtags

async function callGemini(apiKey, prompt, maxTokens = 4096) {
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

2. LONG-TAIL KEYWORDS: Include at most 3 long-tail keyword phrases (3-6 words) that real people would actually type into YouTube's search bar when looking for this content. Think like a viewer, not a marketer.

3. BROAD CATEGORY TAGS: Include 2 broad niche/category tags that place this video in the right ecosystem (e.g., "true crime documentary", "personal finance", "history explained").

4. MISSPELLINGS & ALTERNATES: Add 1 common misspellings, alternate names, or colloquial versions of the topic. Real viewers misspell things — capture that traffic.

5. CONTENT GAP TAGS: Include 2 tags that specifically target "content gaps" — topics people are searching for but don't find enough good videos on. These are low-competition, high-intent keywords related to this script.

6. VIEWER-INTENT TAGS: Include 2 tags based on the language and tone used in the script — are viewers beginners, hobbyists, or professionals? Tag accordingly.

7. FORMAT: Output as comma-separated lists organized by category so tags can be copy-pasted directly into YouTube Studio.

8. TAG RULES:
   - Each tag must be under 30 characters (YouTube limit per tag)
   - Total combined character count of ALL tags must be under 500 characters (YouTube limit)
   - No special characters except spaces and hyphens
   - No hashtags in tags (those are separate)
   - Aim for 10 total tags

═══════════════════════════════════════════════
OUTPUT — RETURN ONLY VALID JSON, NO MARKDOWN:
═══════════════════════════════════════════════

{
  "primary_tag": "the single most important keyword",
  "tags_breakdown": {
    "short": ["3 broad 1-2 word tags from the niche"],
    "medium": ["3 medium 2-3 word specific tags"],
    "long": ["3 long-tail 3-6 word search phrases viewers would type"]
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
#viral, #trending, #explore, #foryou, #foryoupage, #viralvideo, #trend, #popular, #blowup, #algorithm
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

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });

    // Load project + script + topic + thumbnail concepts
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = scripts.find(s => s.version === 'final_aggregated') || scripts.find(s => s.version === 'final') || scripts[0];
    const fullScript = script?.full_script || script?.content || '';

    // Get selected topic for context
    let topicTitle = '';
    let topicDescription = '';
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      if (topics[0]) {
        topicTitle = topics[0].title || '';
        topicDescription = topics[0].description || '';
      }
    }

    // Get channel name for branded hashtag
    let channelName = '';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      if (channels[0]) channelName = channels[0].name || channels[0].channel_name || '';
    }

    // Get existing thumbnail concepts for pairing
    let thumbnailContext = '';
    try {
      const thumbConcepts = await base44.asServiceRole.entities.ThumbnailConcepts.filter({ project_id });
      if (thumbConcepts.length > 0) {
        const top3 = thumbConcepts.sort((a, b) => (b.ctr_score || 0) - (a.ctr_score || 0)).slice(0, 3);
        thumbnailContext = `\n\nEXISTING THUMBNAIL CONCEPTS (titles must COMPLEMENT these, not repeat them):
${top3.map(t => `- Overlay: "${t.text_overlay}" | Emotion: ${t.psychological_trigger || t.concept_type} | CTR: ${t.ctr_score}/10`).join('\n')}`;
      }
    } catch (_) {}

    const videoTitle = topicTitle || project.name || 'Untitled';
    const niche = project.niche || 'general';
    const scriptExcerpt = fullScript.substring(0, 3000);

    console.log(`=== SEO Phase 1: Title + Tags + Hashtags Generation ===`);
    console.log(`Project: ${project.name} | Niche: ${niche} | Script: ${fullScript.length} chars | Channel: ${channelName}`);

    // ── STEP 1: GENERATE TITLES (existing logic) ──────────────
    const titlePrompt = `You are the world's #1 YouTube title strategist, specializing in faceless channel growth. You understand the algorithm, CTR psychology, and keyword density better than anyone alive.

VIDEO CONTEXT:
- Working Title: "${videoTitle}"
- Niche: ${niche}
- Topic Description: ${topicDescription}
- Script Excerpt (first 3000 chars): ${scriptExcerpt}
${thumbnailContext}

═══════════════════════════════════════════════
YOUR MISSION: Generate 10 killer titles + SEO analysis
═══════════════════════════════════════════════

TITLE ENGINEERING RULES:

1. CLICKBAIT PSYCHOLOGY — Every title must use at least ONE proven trigger:
   - Curiosity Gap: "The Truth About X That Nobody Talks About"
   - Power Words: "SHOCKING", "DEADLY", "FORBIDDEN", "SECRET"
   - Numbers: "7 Signs...", "$50K...", "In Just 3 Days..."
   - Warning/Fear: "Stop Doing X Before It's Too Late"
   - Pattern Break: Unexpected word combinations that disrupt scrolling

2. KEYWORD OPTIMIZATION:
   - Front-load the primary keyword in the first 5 words
   - Include at least one secondary keyword naturally
   - Keep under 60 characters (YouTube truncates at ~60)
   - Use | or : to separate keyword clusters when possible

3. THUMBNAIL PAIRING:
   ${thumbnailContext ? 'Titles must CREATE TENSION with the thumbnail text — they should ADD context, not repeat the same words.' : 'Titles should leave visual room for thumbnail overlay text.'}

4. RANKING — Score each title honestly:
   - scroll_stop_score (1-10): How likely to stop a scroller mid-feed
   - keyword_density_score (1-10): How well it targets search keywords
   - thumbnail_pairing_score (1-10): How well it pairs with a thumbnail

═══════════════════════════════════════════════
OUTPUT — RETURN ONLY VALID JSON, NO MARKDOWN
═══════════════════════════════════════════════

{
  "titles": [
    {
      "rank": 1,
      "title": "Under 60 chars, front-loaded keyword",
      "hook_type": "curiosity_gap|power_word|number|warning|pattern_break",
      "scroll_stop_score": 9,
      "keyword_density_score": 8,
      "thumbnail_pairing_score": 9,
      "char_count": 55,
      "why_it_works": "One sentence on the psychology",
      "target_keyword": "primary keyword this title targets",
      "clickbait_trigger": "the specific emotion this exploits"
    }
  ],
  "seo_analysis": {
    "primary_keyword": "main keyword phrase",
    "secondary_keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"],
    "estimated_search_volume": "10K-50K/month",
    "competition": "low|medium|high",
    "search_intent": "what viewers are actually looking for",
    "trending_angle": "current trend this can ride",
    "recommended_upload_day": "e.g. Tuesday",
    "recommended_upload_time": "e.g. 2PM EST",
    "niche_opportunity": "specific gap in the market"
  },
  "pinned_comment": "An engaging question or CTA designed to boost comments and engagement. 2-3 sentences max."
}

CRITICAL RULES:
- Generate EXACTLY 10 titles, ranked best to worst
- Every title MUST be under 60 characters
- char_count must be accurate
- Return ONLY the JSON object — no backticks, no explanation`;

    // Fire title generation
    const titleResponseText = await callGemini(GEMINI_API_KEY, titlePrompt, 4096);
    const titleParsed = parseJson(titleResponseText);

    if (!titleParsed?.titles?.length) {
      console.error('Title parse failed. Raw:', titleResponseText.substring(0, 500));
      return Response.json({ error: 'Failed to parse title response', raw: titleResponseText.substring(0, 300) }, { status: 500 });
    }

    const titles = (titleParsed.titles || []).slice(0, 10).map((t, i) => ({
      ...t,
      rank: t.rank || (i + 1),
      char_count: t.char_count || t.title?.length || 0,
      scroll_stop_score: t.scroll_stop_score || 7,
      keyword_density_score: t.keyword_density_score || 7,
      thumbnail_pairing_score: t.thumbnail_pairing_score || 7,
    }));

    const seoAnalysis = titleParsed.seo_analysis || {};
    console.log(`✅ Generated ${titles.length} titles | Primary keyword: ${seoAnalysis.primary_keyword}`);

    // ── STEP 2: DEDICATED TAG GENERATION (SEO Expert) ──────────
    console.log(`🏷️ Generating tags from script via SEO Expert...`);
    const tagResult = await generateTagsFromScript(GEMINI_API_KEY, fullScript, niche, titles[0]?.title || videoTitle, seoAnalysis);

    let tagsBreakdown = { short: [], medium: [], long: [] };
    let allTagsCsv = '';
    if (tagResult) {
      tagsBreakdown = tagResult.tags_breakdown || tagsBreakdown;
      // Merge content gap and misspelling tags into the long-tail bucket
      const contentGapTags = tagResult.content_gap_tags || [];
      const misspellingTags = tagResult.misspelling_tags || [];
      tagsBreakdown.long = [...(tagsBreakdown.long || []), ...contentGapTags, ...misspellingTags];
      // Prepend primary tag to short tags if not already there
      if (tagResult.primary_tag && !tagsBreakdown.short.includes(tagResult.primary_tag)) {
        tagsBreakdown.short = [tagResult.primary_tag, ...tagsBreakdown.short];
      }
      allTagsCsv = tagResult.all_tags_comma_separated || '';
      console.log(`✅ Tags generated: ${tagsBreakdown.short.length} short + ${tagsBreakdown.medium.length} medium + ${tagsBreakdown.long.length} long`);
    } else {
      console.warn('⚠️ Tag generation parse failed, using fallback');
    }

    // ── STEP 3: DEDICATED HASHTAG GENERATION (Strategic 3-5 Rule) ──
    console.log(`#️⃣ Generating strategic hashtags...`);
    const hashResult = await generateHashtagsFromScript(GEMINI_API_KEY, fullScript, niche, titles[0]?.title || videoTitle, channelName);

    let hashtags = [];
    let hashtagString = '';
    if (hashResult) {
      hashtags = hashResult.hashtags || [];
      hashtagString = hashResult.hashtag_string || hashtags.join(' ');
      console.log(`✅ Hashtags: ${hashtags.join(' ')} | Reasoning: ${hashResult.placement_order_reasoning || ''}`);
    } else {
      console.warn('⚠️ Hashtag generation parse failed, using fallback');
    }

    // ── SAVE TO UPLOAD METADATA ──────────────────────────────
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
