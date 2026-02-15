import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
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
  if (!data.candidates || data.candidates.length === 0) throw new Error("No candidates");
  const text = data.candidates[0].content.parts[0].text;
  let jsonStr = text;
  if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();
  return JSON.parse(jsonStr);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const project = await base44.entities.Projects.get(project_id);
    const script = await base44.entities.Scripts.get(project.script_id);
    const topic = await base44.entities.Topics.get(project.selected_topic_id);

    const scriptContent = script.full_script || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
    const truncatedScript = scriptContent.substring(0, 4000);

    const prompt = `You are a YouTube SEO GRANDMASTER. You've helped channels go from 0 to 1M+ subscribers. You understand the YouTube algorithm better than YouTube engineers.

ANALYZE this video script and generate EVERYTHING needed to DOMINATE YouTube search and recommendations.

VIDEO TOPIC: "${topic.title}"
CURRENT TITLE: "${script.title}"
NICHE: "${project.niche}"

FULL SCRIPT:
${truncatedScript}

=== PART 1: GENERATE 10 KILLER TITLES ===

Each title MUST follow these rules:
🔥 UNDER 60 CHARACTERS (YouTube truncates longer titles)
🔥 FRONT-LOAD the keyword (most important word first)
🔥 USE POWER WORDS: "Shocking", "Secret", "Nobody Knows", "Truth About", "Hidden", "Exposed", "Banned", "Impossible", "Warning"
🔥 CREATE CURIOSITY GAP - promise something but don't reveal it
🔥 USE NUMBERS when possible: "7 Secrets", "The #1 Reason"
🔥 EMOTIONAL TRIGGERS: fear, curiosity, anger, excitement, urgency
🔥 PATTERN INTERRUPT: titles that look NOTHING like competitors
🔥 SEARCHABLE: include terms people actually search for

Title formulas to use:
- "[SHOCKING CLAIM] That [AUTHORITY] Doesn't Want You To Know"
- "I [DID THING] for [TIME] — Here's What Happened"
- "The [ADJECTIVE] Truth About [TOPIC]"
- "[NUMBER] [TOPIC] Secrets [EXPERTS] Keep Hidden"
- "Why [COMMON BELIEF] Is a Complete LIE"
- "This [THING] Changed Everything — Nobody Talks About It"
- "[WARNING/URGENT]: [TOPIC] Is [SHOCKING REVELATION]"
- "I Found [HIDDEN THING] Inside [COMMON THING]"
- "Stop [COMMON ACTION] — Here's Why"
- "[TOPIC] EXPOSED: What They Don't Tell You"

=== PART 2: GENERATE 3 SEO DESCRIPTIONS ===

Each description MUST include:
📝 FIRST 150 CHARS ARE CRUCIAL (this shows in search results before "show more")
📝 FRONT-LOAD primary keyword in first sentence
📝 Include 3-5 LONG-TAIL KEYWORDS naturally woven in
📝 Include 3-5 SHORT KEYWORDS sprinkled throughout
📝 Add TIMESTAMPS for key moments
📝 Include CALL-TO-ACTION (subscribe, like, comment)
📝 Add RELATED SEARCH TERMS the algorithm picks up
📝 500-1000 words per description
📝 Include SECONDARY KEYWORDS that YouTube auto-suggests
📝 Natural, readable — NOT keyword-stuffed
📝 Use paragraph breaks for readability
📝 Include relevant links placeholder [LINK]

=== PART 3: TAGS (30 tags) ===
Mix of:
- 10 short keywords (1-2 words)
- 10 medium keywords (3-4 words)
- 10 long-tail keywords (5+ words)
All must be ACTUALLY SEARCHED terms in this niche.

=== PART 4: HASHTAGS (10) ===
Mix trending + niche-specific. First 3 appear above title.

=== PART 5: PINNED COMMENT ===
Engaging, drives discussion, asks controversial question, includes soft CTA.

=== PART 6: SEO ANALYSIS ===
Identify the primary keyword, search volume estimate, competition level, and recommended upload time.

RESPOND IN THIS EXACT JSON FORMAT:
{
  "titles": [
    {
      "rank": 1,
      "title": "The actual title text",
      "char_count": 45,
      "primary_keyword": "main search term targeted",
      "hook_type": "curiosity_gap / power_word / number / warning / pattern_break",
      "scroll_stop_score": 9,
      "why_it_works": "1 sentence explanation"
    }
  ],
  "descriptions": [
    {
      "label": "Primary (Maximum SEO)",
      "content": "Full 500+ word description with keywords, timestamps, CTAs",
      "primary_keywords": ["keyword1", "keyword2"],
      "long_tail_keywords": ["long keyword phrase 1", "long keyword phrase 2"],
      "short_keywords": ["short1", "short2"]
    },
    {
      "label": "Alternative (Engagement Focused)",
      "content": "Full description focused on engagement and watch time",
      "primary_keywords": ["keyword1"],
      "long_tail_keywords": ["phrase1"],
      "short_keywords": ["short1"]
    },
    {
      "label": "Alternative (Community Building)",
      "content": "Full description focused on community and discussion",
      "primary_keywords": ["keyword1"],
      "long_tail_keywords": ["phrase1"],
      "short_keywords": ["short1"]
    }
  ],
  "tags_short": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "tags_medium": ["medium tag 1", "medium tag 2", "medium tag 3", "medium tag 4", "medium tag 5", "medium tag 6", "medium tag 7", "medium tag 8", "medium tag 9", "medium tag 10"],
  "tags_long": ["long tail keyword 1", "long tail keyword 2", "long tail keyword 3", "long tail keyword 4", "long tail keyword 5", "long tail keyword 6", "long tail keyword 7", "long tail keyword 8", "long tail keyword 9", "long tail keyword 10"],
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5", "#hashtag6", "#hashtag7", "#hashtag8", "#hashtag9", "#hashtag10"],
  "pinned_comment": "Engaging pinned comment with question and soft CTA",
  "seo_analysis": {
    "primary_keyword": "the main keyword",
    "estimated_search_volume": "10K-50K/month",
    "competition": "medium",
    "recommended_upload_day": "Tuesday",
    "recommended_upload_time": "2:00 PM EST",
    "trending_angle": "Why this topic is hot right now"
  }
}`;

    const result = await safeGeminiCall(prompt, 0.8);

    // Delete existing metadata for this project
    const existing = await base44.entities.UploadMetadata.filter({ project_id });
    for (const e of existing) {
      await base44.entities.UploadMetadata.delete(e.id);
    }

    const allTags = [...(result.tags_short || []), ...(result.tags_medium || []), ...(result.tags_long || [])];

    const metadata = await base44.entities.UploadMetadata.create({
      project_id,
      title_primary: result.titles[0]?.title || '',
      title_variation_1: result.titles[1]?.title || '',
      title_variation_2: result.titles[2]?.title || '',
      description_template: result.descriptions[0]?.content || '',
      description_alt_1: result.descriptions[1]?.content || '',
      description_alt_2: result.descriptions[2]?.content || '',
      tags: JSON.stringify(allTags),
      pinned_comment: result.pinned_comment || '',
      hashtags: (result.hashtags || []).join(' ')
    });

    return Response.json({
      success: true,
      metadata,
      titles: result.titles,
      descriptions: result.descriptions,
      seo_analysis: result.seo_analysis,
      tags_breakdown: {
        short: result.tags_short,
        medium: result.tags_medium,
        long: result.tags_long
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});