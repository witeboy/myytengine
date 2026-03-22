import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// generateSeoTitlesDescriptions — PHASE 1 (AI-Powered Title Generator)
// Uses Gemini for high-CTR clickbait-style titles with keyword optimization
// Pairs with thumbnail concepts for maximum scroll-stopping power

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
  // Try direct parse first 
  try { return JSON.parse(text); } catch (_) {}
  // Extract JSON from markdown/text
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

    console.log(`=== SEO Phase 1: Title Generation ===`);
    console.log(`Project: ${project.name} | Niche: ${niche} | Script: ${scriptExcerpt.length} chars`);

    const prompt = `You are the world's #1 YouTube title strategist, specializing in faceless channel growth. You understand the algorithm, CTR psychology, and keyword density better than anyone alive.

VIDEO CONTEXT:
- Working Title: "${videoTitle}"
- Niche: ${niche}
- Topic Description: ${topicDescription}
- Script Excerpt (first 3000 chars): ${scriptExcerpt}
${thumbnailContext}

═══════════════════════════════════════════════
YOUR MISSION: Generate 10 killer titles + full SEO analysis
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
   ${thumbnailContext ? 'Titles must CREATE TENSION with the thumbnail text — they should ADD context, not repeat the same words. Title + thumbnail = a complete curiosity package that DEMANDS a click.' : 'Titles should leave visual room for thumbnail overlay text — avoid revealing everything in the title alone.'}

4. ALGORITHM SIGNALS:
   - Include words YouTube associates with high engagement
   - Match the search intent of your target audience
   - Use trending patterns from the niche (listicles, stories, warnings)

5. RANKING — Score each title honestly:
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
  "tags_breakdown": {
    "short": ["5 broad 1-2 word tags"],
    "medium": ["10 medium 2-3 word tags"],
    "long": ["15 long-tail 4-6 word tags"]
  },
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "pinned_comment": "An engaging question or CTA designed to boost comments and engagement. 2-3 sentences max."
}

CRITICAL RULES:
- Generate EXACTLY 10 titles, ranked best to worst
- Every title MUST be under 60 characters
- char_count must be accurate
- Tags: 5 short + 10 medium + 15 long-tail = 30 total
- Hashtags: exactly 5
- Return ONLY the JSON object — no backticks, no explanation`;

    const responseText = await callGemini(GEMINI_API_KEY, prompt, 4096);
    const parsed = parseJson(responseText);

    if (!parsed?.titles?.length) {
      console.error('Parse failed. Raw:', responseText.substring(0, 500));
      return Response.json({ error: 'Failed to parse Gemini response', raw: responseText.substring(0, 300) }, { status: 500 });
    }

    // Normalize titles — ensure all have rank and char_count
    const titles = (parsed.titles || []).slice(0, 10).map((t, i) => ({
      ...t,
      rank: t.rank || (i + 1),
      char_count: t.char_count || t.title?.length || 0,
      scroll_stop_score: t.scroll_stop_score || 7,
      keyword_density_score: t.keyword_density_score || 7,
      thumbnail_pairing_score: t.thumbnail_pairing_score || 7,
    }));

    console.log(`Generated ${titles.length} titles | Primary keyword: ${parsed.seo_analysis?.primary_keyword}`);

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
    };

    // Also persist the full titles array for rehydration
    metaData.titles_json = JSON.stringify(titles);

    if (existingMeta.length > 0) {
      await base44.asServiceRole.entities.UploadMetadata.update(existingMeta[0].id, metaData);
    } else {
      await base44.asServiceRole.entities.UploadMetadata.create(metaData);
    }

    return Response.json({
      success: true,
      titles,
      seo_analysis: parsed.seo_analysis || {},
      tags_breakdown: parsed.tags_breakdown || {},
      hashtags: parsed.hashtags || [],
      pinned_comment: parsed.pinned_comment || '',
      needs_descriptions: true,
    });

  } catch (error) {
    console.error('SEO Phase 1 error:', error.message);
    return Response.json({ error: error.message || 'Title generation failed' }, { status: 500 });
  }
});
