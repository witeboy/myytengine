import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// OPENAI HELPER (GPT-4o — best for SEO, keywords, creative copy)
// ══════════════════════════════════════════════════════════════════

function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

async function safeOpenAICall(prompt, temperature = 0.8, maxTokens = 8192, retries = 3) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a YouTube SEO grandmaster who has grown 20+ channels from zero to 1M+ subscribers. You combine algorithmic mastery with psychological copywriting. Always respond in valid JSON only — no markdown, no code fences, no commentary."
            },
            { role: "user", content: prompt }
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: { type: "json_object" }
        })
      });

      if (response.status === 429) {
        const waitMs = Math.pow(2, attempt + 1) * 5000;
        console.log(`Rate limited, waiting ${waitMs / 1000}s (retry ${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`OpenAI ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("No content in OpenAI response");

      // 3-stage JSON parsing
      try { return { success: true, data: JSON.parse(text) }; } catch (_) {}
      try { return { success: true, data: JSON.parse(repairJSON(text)) }; } catch (_) {}

      let jsonStr = text;
      if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
      else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

      try { return { success: true, data: JSON.parse(repairJSON(jsonStr)) }; } catch (_) {}

      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) return { success: true, data: JSON.parse(objMatch[0]) };

      throw new Error("Failed to parse OpenAI JSON");

    } catch (error) {
      if (attempt === retries - 1) {
        console.error("OpenAI failed after retries:", error.message);
        return { success: false, error: error.message };
      }
      console.warn(`Attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return { success: false, error: "All retries exhausted" };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    // ══════════════════════════════════════════════════════════════
    // LOAD DATA (parallel)
    // ══════════════════════════════════════════════════════════════
    const [projects, allTopics, allScripts] = await Promise.all([
      base44.entities.Projects.filter({ id: project_id }),
      base44.entities.Topics.filter({ project_id }),
      base44.entities.Scripts.filter({ project_id })
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const selectedTopic = allTopics.find(t => t.is_selected === true);
    if (!selectedTopic) return Response.json({ error: 'No selected topic found' }, { status: 400 });

    const finalScript = allScripts.find(s => s.version === 'final_aggregated') || allScripts[0];
    if (!finalScript) return Response.json({ error: 'No final script found' }, { status: 400 });

    const videoTitle = project.name || selectedTopic.title;
    const scriptContent = finalScript.full_script ||
      [finalScript.cold_open, finalScript.act_1, finalScript.act_2, finalScript.act_3, finalScript.outro]
        .filter(Boolean).join('\n\n');
    const truncatedScript = scriptContent.substring(0, 4000);

    console.log('══════════════════════════════════════════════════════');
    console.log('GENERATING SEO METADATA (GPT-4o)');
    console.log(`Topic: ${selectedTopic.title}`);
    console.log(`Niche: ${project.niche}`);
    console.log('══════════════════════════════════════════════════════');

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  GPT-4o — YouTube SEO Grandmaster                            ║
    // ╚═══════════════════════════════════════════════════════════════╝

    const prompt = `Generate COMPLETE, PREMIUM YouTube upload metadata that maximizes CTR, retention, and algorithmic distribution.

VIDEO TOPIC: "${selectedTopic.title}"
TOPIC DESCRIPTION: ${selectedTopic.description || ''}
CURRENT TITLE: "${videoTitle}"
NICHE: "${project.niche}"
CHANNEL TYPE: Faceless documentary/educational

SCRIPT (analyze for keywords, moments, hooks):
${truncatedScript}

═══════════════════════════════════════
PART 1: 10 KILLER TITLES
═══════════════════════════════════════

ALGORITHM RULES:
- 50-70 characters ideal (shows fully on all devices)
- Front-load PRIMARY KEYWORD in first 3 words
- Never truncate mid-thought (~60 chars on mobile)

CTR PSYCHOLOGY:
- Curiosity gap: promise without revealing
- Specificity: numbers, dates, names beat vague claims
- Emotional trigger: ONE primary (fear, curiosity, outrage, inspiration)
- Pattern interrupt: look nothing like competing videos
- Implied exclusivity: "what they don't tell you", "nobody talks about this"

POWER WORDS:
- Mystery: Secret, Hidden, Exposed, Buried, Classified, Suppressed
- Urgency: Before It's Too Late, Warning, Stop, Now, Finally
- Authority: Proven, Real, True, Official, Actual
- Exclusivity: Nobody Knows, Only 1%, They Don't Want You To Know

TITLE FORMULAS (use DIFFERENT formula per title):
A: "[SHOCKING CLAIM] That [AUTHORITY] Has Hidden For [TIME]"
B: "The [ADJ] Truth About [TOPIC] (They Lied To You)"
C: "[NUMBER] [TOPIC] [Power Word] That [Consequence]"
D: "Why [COMMON BELIEF] Is Completely Wrong"
E: "I [DID THING] For [TIME] — What I Found Will Shock You"
F: "[TOPIC] EXPOSED: The [ADJ] Secret Nobody Talks About"
G: "Stop [COMMON ACTION]: Here's What [AUTHORITY] Won't Tell You"
H: "The [TOPIC] [POWER WORD] That [SPECIFIC CONSEQUENCE]"
I: "What Happens When [SCENARIO] — The Truth Is Disturbing"
J: "[WARNING]: [TOPIC] Is [SHOCKING REVELATION] Right Now"

BAD (DO NOT):
- "Everything About Credit Cards"
- "How Banks Work - A Full Explanation"

GOOD (DO THIS):
- "The Hidden Fee That Costs Americans $29 Billion Every Year"
- "I Read Every Bank's Fine Print. What I Found Is Disturbing."
- "The 11-Minute Decision That Destroyed a $200M Company"

═══════════════════════════════════════
PART 2: 3 DESCRIPTIONS
═══════════════════════════════════════

Each description architecture:

SECTION 1 — HOOK (first 150 chars — shows in search before "Show More"):
- Primary keyword in FIRST sentence
- Immediate curiosity or urgency

SECTION 2 — EXPANDED HOOK (200 words):
- 3-5 long-tail keywords woven naturally
- Build emotional stakes

SECTION 3 — TIMESTAMPS:
0:00 - Introduction
(generate realistic timestamps from script content — estimate timing)

SECTION 4 — CTA:
- Subscribe reason tied to topic
- Comment prompt (controversial/personal question)
- Like framing tied to content value

SECTION 5 — RELATED TERMS:
Natural-language paragraph (NOT a keyword list) of related terms for algorithm

SECTION 6 — RESOURCES:
[LINK TO RESOURCE] placeholders

VARIANTS:
1. "Maximum SEO" — keyword-dense, 600-800 words
2. "Engagement Focused" — emotionally compelling, drives comments, 400-500 words
3. "Community Building" — creates belonging, drives subs, 400-500 words

═══════════════════════════════════════
PART 3: TAGS
═══════════════════════════════════════

Generate 30 tags in 3 tiers:
- 10 SHORT (1-2 words): Broadest category. High volume.
- 10 MEDIUM (3-4 words): Core intent. Moderate competition.
- 10 LONG-TAIL (5-8 words): Specific queries. Low competition, high intent.

All must be: actually searched by real people, directly relevant to THIS video.

═══════════════════════════════════════
PART 4: HASHTAGS (10)
═══════════════════════════════════════

- First 3 appear above title (maximum impact)
- Mix: 2 trending, 4 niche-specific, 4 topic-specific
- Proper capitalization, no spaces

═══════════════════════════════════════
PART 5: PINNED COMMENT
═══════════════════════════════════════

- ONE controversial/personal question about the video topic
- Soft CTA that doesn't feel like marketing
- 2-3 sentences max
- Sounds like a real person wrote it

═══════════════════════════════════════
PART 6: SEO ANALYSIS
═══════════════════════════════════════

- Primary keyword + reasoning
- Secondary keywords (5+)
- Search volume estimates
- Competition level
- Best upload day/time/timezone with reasoning
- Trending angles for first 48 hours
- Retention risk points from script
- End screen strategy

═══════════════════════════════════════
OUTPUT — EXACT JSON
═══════════════════════════════════════

{
  "seo_strategy": "Overall SEO approach for this video",
  "titles": [
    {
      "rank": 1,
      "title": "The actual title text",
      "char_count": 55,
      "formula_used": "Formula A",
      "primary_keyword": "main search term",
      "hook_type": "curiosity_gap/power_word/number/warning/pattern_break",
      "primary_emotion": "fear/curiosity/outrage/inspiration/shock",
      "scroll_stop_score": 9,
      "why_it_works": "Specific psychological reason"
    }
  ],
  "descriptions": [
    {
      "label": "Maximum SEO",
      "content": "Full 600-800 word description with all 6 sections",
      "primary_keywords": ["kw1", "kw2"],
      "long_tail_keywords": ["phrase1", "phrase2"]
    },
    {
      "label": "Engagement Focused",
      "content": "Full 400-500 word description",
      "primary_keywords": ["kw1"],
      "long_tail_keywords": ["phrase1"]
    },
    {
      "label": "Community Building",
      "content": "Full 400-500 word description",
      "primary_keywords": ["kw1"],
      "long_tail_keywords": ["phrase1"]
    }
  ],
  "tags_short": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"],
  "tags_medium": ["medium tag 1","medium tag 2","medium tag 3","medium tag 4","medium tag 5","medium tag 6","medium tag 7","medium tag 8","medium tag 9","medium tag 10"],
  "tags_long": ["long tail phrase 1","long tail phrase 2","long tail phrase 3","long tail phrase 4","long tail phrase 5","long tail phrase 6","long tail phrase 7","long tail phrase 8","long tail phrase 9","long tail phrase 10"],
  "hashtags": ["#Hashtag1","#Hashtag2","#Hashtag3","#Hashtag4","#Hashtag5","#Hashtag6","#Hashtag7","#Hashtag8","#Hashtag9","#Hashtag10"],
  "pinned_comment": "The pinned comment text",
  "seo_analysis": {
    "primary_keyword": "main keyword",
    "secondary_keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"],
    "estimated_search_volume": "10K-50K/month",
    "competition": "low/medium/high",
    "difficulty_score": "3/10",
    "recommended_upload_day": "Tuesday",
    "recommended_upload_time": "2:00 PM EST",
    "upload_reasoning": "Why this day/time",
    "trending_angle": "What makes this hot now",
    "first_48_hour_strategy": "Actions for max algorithmic push",
    "retention_risk_points": ["Timestamp and risk reason"],
    "end_screen_strategy": "End screen approach"
  }
}

Generate the complete premium SEO package now. Respond ONLY with the JSON object.`;

    const result = await safeOpenAICall(prompt, 0.8, 8192);

    if (!result.success) {
      console.error('OpenAI failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    const d = result.data;

    if (!d.titles || !Array.isArray(d.titles)) {
      return Response.json({ error: 'Invalid response — missing titles' }, { status: 500 });
    }

    // ══════════════════════════════════════════════════════════════
    // DELETE EXISTING METADATA (parallel)
    // ══════════════════════════════════════════════════════════════
    try {
      const existing = await base44.entities.UploadMetadata.filter({ project_id });
      await Promise.all(existing.map(e => base44.entities.UploadMetadata.delete(e.id)));
    } catch (delErr) {
      console.warn('Delete existing failed:', delErr.message);
    }

    // ══════════════════════════════════════════════════════════════
    // BUILD TAG ARRAYS
    // ══════════════════════════════════════════════════════════════
    const tagsShort = d.tags_short || [];
    const tagsMedium = d.tags_medium || [];
    const tagsLong = d.tags_long || [];
    const allTags = [...tagsShort, ...tagsMedium, ...tagsLong];

    const titles = d.titles || [];

    // ══════════════════════════════════════════════════════════════
    // SAVE — compatible with existing DB schema + extended fields
    // ══════════════════════════════════════════════════════════════
    const createData = {
      project_id,
      // Core title fields (always exist in schema)
      title_primary: titles[0]?.title || '',
      title_variation_1: titles[1]?.title || '',
      title_variation_2: titles[2]?.title || '',
      // Core description fields
      description_template: d.descriptions?.[0]?.content || '',
      description_alt_1: d.descriptions?.[1]?.content || '',
      description_alt_2: d.descriptions?.[2]?.content || '',
      // Core tags
      tags: JSON.stringify(allTags),
      // Core fields
      pinned_comment: d.pinned_comment || '',
      hashtags: (d.hashtags || []).join(' ')
    };

    // Extended fields — add only if schema supports them (won't crash if missing)
    const extendedFields = {
      title_variation_3: titles[3]?.title || '',
      title_variation_4: titles[4]?.title || '',
      tags_short: JSON.stringify(tagsShort),
      tags_medium: JSON.stringify(tagsMedium),
      tags_long: JSON.stringify(tagsLong),
      seo_analysis: JSON.stringify(d.seo_analysis || {}),
      seo_strategy: d.seo_strategy || ''
    };

    // Try with extended fields first, fall back to core only
    let metadata;
    try {
      metadata = await base44.entities.UploadMetadata.create({
        ...createData,
        ...extendedFields
      });
    } catch (extErr) {
      console.warn('Extended fields failed, saving core only:', extErr.message);
      metadata = await base44.entities.UploadMetadata.create(createData);
    }

    // Update project status
    try {
      await base44.entities.Projects.update(project_id, {
        current_step: 13,
        status: "publish_ready"
      });
    } catch (stepErr) {
      console.warn('Failed to update project step:', stepErr.message);
    }

    console.log('══════════════════════════════════════════════════════');
    console.log(`Model: GPT-4o | Titles: ${titles.length} | Tags: ${allTags.length}`);
    console.log(`Primary KW: ${d.seo_analysis?.primary_keyword}`);
    console.log(`Volume: ${d.seo_analysis?.estimated_search_volume}`);
    console.log(`Competition: ${d.seo_analysis?.competition}`);
    console.log(`Upload: ${d.seo_analysis?.recommended_upload_day} ${d.seo_analysis?.recommended_upload_time}`);
    console.log('══════════════════════════════════════════════════════');

    return Response.json({
      success: true,
      metadata,
      video_title: videoTitle,
      topic_title: selectedTopic.title,
      titles: d.titles,
      descriptions: d.descriptions,
      seo_analysis: d.seo_analysis,
      seo_strategy: d.seo_strategy,
      tags_breakdown: {
        short: tagsShort,
        medium: tagsMedium,
        long: tagsLong,
        all: allTags
      },
      meta: {
        model: "gpt-4o",
        total_titles: titles.length,
        total_tags: allTags.length
      }
    });

  } catch (error) {
    console.error('generateUploadMetadata error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});