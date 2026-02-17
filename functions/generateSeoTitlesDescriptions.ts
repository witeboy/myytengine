import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 12000 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) throw new Error("No candidates returned");

    const text = data.candidates[0].content.parts[0].text;
    let jsonStr = text;
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

    return { success: true, data: JSON.parse(jsonStr) };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

function validateTitle(title) {
  const issues = [];
  if (!title.title || title.title.trim().length === 0) issues.push('Empty title');
  if (title.title && title.title.length > 100) issues.push(`Too long: ${title.title.length} chars`);
  if (title.title && title.title.length < 20) issues.push(`Too short: ${title.title.length} chars`);
  const weakOpeners = ['how to', 'what is', 'guide to', 'a video about', 'today we'];
  if (weakOpeners.some(w => (title.title || '').toLowerCase().startsWith(w))) {
    issues.push('Weak generic opener');
  }
  return { valid: issues.length === 0, issues };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const project = await base44.entities.Projects.get(project_id);
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const script = await base44.entities.Scripts.get(project.script_id);
    if (!script) return Response.json({ error: 'Script not found' }, { status: 404 });

    const topic = await base44.entities.Topics.get(project.selected_topic_id);
    if (!topic) return Response.json({ error: 'Topic not found' }, { status: 404 });

    const scriptContent = script.full_script ||
      [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro]
        .filter(Boolean).join('\n\n');
    const truncatedScript = scriptContent.substring(0, 5000);

    console.log('================================================');
    console.log('GENERATING SEO METADATA');
    console.log(`Topic: ${topic.title}`);
    console.log(`Niche: ${project.niche}`);
    console.log('================================================');

    const prompt = `You are a YouTube SEO grandmaster who has grown 20+ channels from zero to 1M+ subscribers. You combine algorithmic mastery with psychological copywriting to dominate both search and recommendations.

ANALYZE this video and generate COMPLETE, PREMIUM upload metadata that will maximize CTR, retention, and algorithmic distribution.

VIDEO TOPIC: "${topic.title}"
CURRENT WORKING TITLE: "${script.title}"
NICHE: "${project.niche}"
CHANNEL TYPE: Faceless documentary/educational

SCRIPT EXCERPT:
${truncatedScript}

================================================
PART 1: 10 KILLER TITLES
================================================

YouTube title psychology you MUST apply:

ALGORITHM RULES:
- Ideal length: 50-70 characters (shows fully on all devices)
- Front-load the PRIMARY KEYWORD (first 3 words matter most)
- Never truncate mid-thought (YouTube cuts at ~60 chars on mobile)

CTR PSYCHOLOGY:
- Curiosity gap: promise something without revealing it
- Specificity: numbers, dates, names beat vague claims
- Emotional trigger: pick ONE primary emotion (fear, curiosity, outrage, inspiration)
- Pattern interrupt: look nothing like the 10 videos beside you
- Implied exclusivity: "what they don't tell you", "nobody talks about this"

POWER WORD ARSENAL:
- Mystery: Secret, Hidden, Exposed, Buried, Classified, Suppressed
- Urgency: Before It's Too Late, Warning, Stop, Now, Finally
- Authority: Proven, Real, True, Official, Actual
- Exclusivity: Nobody Knows, Only 1%, They Don't Want You To Know
- Contrast: Actually, Really, Secretly, Quietly, Silently

TITLE FORMULAS (use a DIFFERENT formula for each title):
Formula A: "[SHOCKING CLAIM] That [AUTHORITY] Has Hidden For [TIME]"
Formula B: "The [ADJECTIVE] Truth About [TOPIC] (They Lied To You)"
Formula C: "[NUMBER] [TOPIC] [Power Word] That [Consequence]"
Formula D: "Why [COMMON BELIEF ABOUT TOPIC] Is Completely Wrong"
Formula E: "I [DID THING] For [TIME PERIOD] — What I Found Will Shock You"
Formula F: "[TOPIC] EXPOSED: The [ADJECTIVE] Secret Nobody Talks About"
Formula G: "Stop [COMMON ACTION]: Here's What [AUTHORITY] Won't Tell You"
Formula H: "The [TOPIC] [POWER WORD] That [SPECIFIC CONSEQUENCE]"
Formula I: "What Happens When [SCENARIO] — The Truth Is Disturbing"
Formula J: "[WARNING]: [TOPIC] Is [SHOCKING REVELATION] Right Now"

EXAMPLES OF 10/10 vs 5/10 TITLES:

5/10 (DO NOT WRITE LIKE THIS):
- "Everything About Credit Cards"
- "How Banks Work - A Full Explanation"
- "Financial Tips You Should Know"

10/10 (WRITE LIKE THIS):
- "The Hidden Fee That Costs Americans $29 Billion Every Year"
- "I Read Every Bank's Fine Print. What I Found Is Disturbing."
- "Why Your Financial Advisor Is Legally Allowed To Lie To You"
- "The 11-Minute Decision That Destroyed a $200M Company"

================================================
PART 2: 3 SEO DESCRIPTIONS
================================================

Each description MUST follow this architecture:

SECTION 1 - HOOK (First 150 characters — CRITICAL):
This is what shows in search results before "Show More". It must:
- Contain the primary keyword in the FIRST sentence
- Create immediate curiosity or urgency
- Make the viewer click "Show More" to continue reading

SECTION 2 - EXPANDED HOOK (Next 200 words):
- Deliver on the promise of the hook
- Naturally weave in 3-5 long-tail keywords
- Build emotional stakes around the topic

SECTION 3 - TIMESTAMPS:
Include realistic timestamps for key video moments:
0:00 - Introduction
(generate plausible timestamps based on script content)

SECTION 4 - CALL TO ACTION:
Specific, non-generic CTAs:
- Subscribe reason tied to the video topic
- Comment prompt with controversial or personal question
- Like framing tied to content value

SECTION 5 - RELATED TERMS BLOCK:
A paragraph of natural-language related terms the algorithm picks up.
Do NOT make it a keyword list — write it as readable sentences.

SECTION 6 - CHAPTER LINKS AND RESOURCES:
Placeholder text for links: [LINK TO RESOURCE]

DESCRIPTION VARIANTS:
1. "Maximum SEO" - keyword-dense, algorithm-optimized, long (600-800 words)
2. "Engagement Focused" - emotionally compelling, drives comments and shares (400-500 words)
3. "Community Building" - creates belonging, drives subscriptions, builds parasocial connection (400-500 words)

================================================
PART 3: TAGS (30 total)
================================================

TAG STRATEGY:
- 10 SHORT tags (1-2 words): The broadest category terms. High volume, high competition. Used for category association.
- 10 MEDIUM tags (3-4 words): The core intent terms. Moderate competition. Used for recommendation targeting.
- 10 LONG-TAIL tags (5-8 words): The specific search queries. Low competition, high intent. Used for search discovery.

All tags must be:
- Actually searched by real people (no invented phrases)
- Directly relevant to THIS video (not generic channel tags)
- Varied in intent (informational, navigational, commercial)

================================================
PART 4: HASHTAGS (10)
================================================

Strategy:
- First 3 hashtags appear above the title in search (choose these for maximum impact)
- Mix: 2 trending (#money, #finance), 4 niche-specific, 4 topic-specific
- No spaces in hashtags, proper capitalization for readability

================================================
PART 5: PINNED COMMENT
================================================

The perfect pinned comment:
- Posted immediately after upload to establish discussion
- Asks ONE controversial or deeply personal question related to the video
- Includes a soft CTA that doesn't feel like a CTA
- 2-3 sentences maximum
- Sounds like a real person wrote it, not a marketer
- Creates a safe space for viewers to share (drives comment count)

Example of 10/10 pinned comment:
"This video genuinely changed how I think about this topic. What's the one thing you wish someone had told you about [topic] before you found out the hard way? Drop it below — I read every single comment."

================================================
PART 6: COMPREHENSIVE SEO ANALYSIS
================================================

Provide actionable strategic intelligence:
- Primary keyword and why it was chosen
- Secondary keywords to build around
- Search volume estimates with context
- Competition analysis and difficulty rating
- Best upload timing (day, time, timezone) with reasoning
- Trending angles to exploit in the first 48 hours
- Thumbnail A/B testing recommendation
- Retention risk points (moments viewers might drop off) based on script
- Suggested end screen strategy

================================================
OUTPUT FORMAT (EXACT JSON)
================================================

{
  "seo_strategy": "Overall SEO approach for this specific video",
  "titles": [
    {
      "rank": 1,
      "title": "The actual title text",
      "char_count": 55,
      "formula_used": "Formula A/B/C etc",
      "primary_keyword": "main search term",
      "hook_type": "curiosity_gap/power_word/number/warning/pattern_break/emotional_contrast",
      "primary_emotion": "fear/curiosity/outrage/inspiration/shock",
      "scroll_stop_score": 9,
      "why_it_works": "Specific psychological reason this title converts",
      "ab_test_pair": "Which other title from the list to A/B test against"
    }
  ],
  "descriptions": [
    {
      "label": "Maximum SEO",
      "content": "Full 600-800 word description with all sections",
      "primary_keywords": ["keyword1", "keyword2"],
      "long_tail_keywords": ["phrase1", "phrase2", "phrase3"],
      "short_keywords": ["short1", "short2"]
    },
    {
      "label": "Engagement Focused",
      "content": "Full 400-500 word engagement description",
      "primary_keywords": ["keyword1"],
      "long_tail_keywords": ["phrase1"],
      "short_keywords": ["short1"]
    },
    {
      "label": "Community Building",
      "content": "Full 400-500 word community description",
      "primary_keywords": ["keyword1"],
      "long_tail_keywords": ["phrase1"],
      "short_keywords": ["short1"]
    }
  ],
  "tags_short": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"],
  "tags_medium": ["medium tag 1","medium tag 2","medium tag 3","medium tag 4","medium tag 5","medium tag 6","medium tag 7","medium tag 8","medium tag 9","medium tag 10"],
  "tags_long": ["long tail keyword phrase 1","long tail keyword phrase 2","long tail keyword phrase 3","long tail keyword phrase 4","long tail keyword phrase 5","long tail keyword phrase 6","long tail keyword phrase 7","long tail keyword phrase 8","long tail keyword phrase 9","long tail keyword phrase 10"],
  "hashtags": ["#Hashtag1","#Hashtag2","#Hashtag3","#Hashtag4","#Hashtag5","#Hashtag6","#Hashtag7","#Hashtag8","#Hashtag9","#Hashtag10"],
  "pinned_comment": "The perfect pinned comment text",
  "seo_analysis": {
    "primary_keyword": "main keyword",
    "secondary_keywords": ["keyword1", "keyword2", "keyword3"],
    "estimated_search_volume": "10K-50K/month",
    "competition": "low/medium/high",
    "difficulty_score": "3/10",
    "recommended_upload_day": "Tuesday",
    "recommended_upload_time": "2:00 PM EST",
    "upload_reasoning": "Why this day/time maximizes initial velocity",
    "trending_angle": "What makes this topic hot right now",
    "first_48_hour_strategy": "Actions to take in first 48 hours to maximize algorithmic push",
    "ab_test_recommendation": "Which two titles to test and why",
    "retention_risk_points": ["Timestamp and why viewers might drop here"],
    "end_screen_strategy": "What to show at end screen and why"
  }
}

Generate the complete premium SEO package now.`;

    const result = await safeGeminiCall(prompt, 0.8);

    if (!result.success) {
      console.error('Gemini failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    // Validate titles
    let qualityWarnings = 0;
    (result.data.titles || []).forEach((t, i) => {
      const v = validateTitle(t);
      if (!v.valid) {
        qualityWarnings++;
        console.warn(`Title ${i + 1} issues: ${v.issues.join(', ')}`);
      }
    });

    // Delete existing metadata
    try {
      const existing = await base44.entities.UploadMetadata.filter({ project_id });
      for (const e of existing) {
        await base44.entities.UploadMetadata.delete(e.id);
      }
    } catch (deleteErr) {
      console.warn('Failed to delete existing metadata:', deleteErr.message);
    }

    const allTags = [
      ...(result.data.tags_short || []),
      ...(result.data.tags_medium || []),
      ...(result.data.tags_long || [])
    ];

    const metadata = await base44.entities.UploadMetadata.create({
      project_id,
      title_primary: result.data.titles[0]?.title || '',
      title_variation_1: result.data.titles[1]?.title || '',
      title_variation_2: result.data.titles[2]?.title || '',
      title_variation_3: result.data.titles[3]?.title || '',
      title_variation_4: result.data.titles[4]?.title || '',
      description_template: result.data.descriptions[0]?.content || '',
      description_alt_1: result.data.descriptions[1]?.content || '',
      description_alt_2: result.data.descriptions[2]?.content || '',
      tags: JSON.stringify(allTags),
      tags_short: JSON.stringify(result.data.tags_short || []),
      tags_medium: JSON.stringify(result.data.tags_medium || []),
      tags_long: JSON.stringify(result.data.tags_long || []),
      hashtags: (result.data.hashtags || []).join(' '),
      pinned_comment: result.data.pinned_comment || '',
      seo_analysis: JSON.stringify(result.data.seo_analysis || {}),
      seo_strategy: result.data.seo_strategy || ''
    });

    console.log('================================================');
    console.log(`Titles generated: ${result.data.titles?.length}`);
    console.log(`Tags generated: ${allTags.length}`);
    console.log(`Quality warnings: ${qualityWarnings}`);
    console.log(`Primary keyword: ${result.data.seo_analysis?.primary_keyword}`);
    console.log('================================================');

    return Response.json({
      success: true,
      metadata,
      titles: result.data.titles,
      descriptions: result.data.descriptions,
      seo_analysis: result.data.seo_analysis,
      seo_strategy: result.data.seo_strategy,
      tags_breakdown: {
        short: result.data.tags_short,
        medium: result.data.tags_medium,
        long: result.data.tags_long,
        all: allTags
      },
      meta: {
        quality_warnings: qualityWarnings,
        total_titles: result.data.titles?.length,
        total_tags: allTags.length
      }
    });

  } catch (error) {
    console.error('generateUploadMetadata error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});