import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// OPENAI HELPER (GPT-4o — best for SEO, keyword strategy, creative)
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
              content: "You are a YouTube SEO grandmaster. Always respond in valid JSON only. No markdown, no commentary, no code fences — pure JSON."
            },
            {
              role: "user",
              content: prompt
            }
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

      throw new Error("Failed to parse OpenAI JSON response");

    } catch (error) {
      if (attempt === retries - 1) {
        console.error("OpenAI call failed after retries:", error.message);
        return { success: false, error: error.message };
      }
      console.warn(`OpenAI attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return { success: false, error: "All retries exhausted" };
}

// ══════════════════════════════════════════════════════════════════
// VALIDATION
// ══════════════════════════════════════════════════════════════════

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
    // LOAD DATA (parallel — using .filter() not .get())
    // ══════════════════════════════════════════════════════════════
    const [projects, allScripts, allTopics] = await Promise.all([
      base44.entities.Projects.filter({ id: project_id }),
      base44.entities.Scripts.filter({ project_id }),
      base44.entities.Topics.filter({ project_id })
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const script = allScripts.find(s => s.version === 'final_aggregated') || allScripts[0];
    if (!script) return Response.json({ error: 'No script found' }, { status: 404 });

    const topic = allTopics.find(t => t.is_selected === true) || allTopics[0];
    // In repurpose mode there may be no topic — fall back to script title or project name
    const topicTitle = topic?.title || script.title || project.name || 'Untitled';

    const scriptContent = script.full_script ||
      [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro]
        .filter(Boolean).join('\n\n');
    const truncatedScript = scriptContent.substring(0, 4000);

    console.log('══════════════════════════════════════════════════════');
    console.log('GENERATING SEO METADATA (OpenAI GPT-4o)');
    console.log(`Topic: ${topicTitle}`);
    console.log(`Niche: ${project.niche}`);
    console.log('══════════════════════════════════════════════════════');

    const prompt = `You are a YouTube SEO grandmaster who has grown 20+ channels from zero to 1M+ subscribers. You combine algorithmic mastery with psychological copywriting to dominate both search and recommendations.

Generate COMPLETE, PREMIUM upload metadata that maximizes CTR, retention, and algorithmic distribution.

VIDEO TOPIC: "${topic.title}"
CURRENT WORKING TITLE: "${script.title}"
NICHE: "${project.niche}"
CHANNEL TYPE: Faceless documentary/educational

SCRIPT EXCERPT:
${truncatedScript}

═══════════════════════════════════════
PART 1: 10 KILLER TITLES
═══════════════════════════════════════

ALGORITHM RULES:
- Ideal: 50-70 characters (shows fully on all devices)
- Front-load PRIMARY KEYWORD in first 3 words
- Never truncate mid-thought (~60 chars on mobile)

CTR PSYCHOLOGY:
- Curiosity gap: promise without revealing
- Specificity: numbers, dates, names beat vague claims
- Emotional trigger: pick ONE (fear, curiosity, outrage, inspiration)
- Pattern interrupt: look nothing like competing videos
- Implied exclusivity: "what they don't tell you", "nobody talks about this"

POWER WORDS:
- Mystery: Secret, Hidden, Exposed, Buried, Classified, Suppressed
- Urgency: Before It's Too Late, Warning, Stop, Now, Finally
- Authority: Proven, Real, True, Official, Actual
- Exclusivity: Nobody Knows, Only 1%, They Don't Want You To Know
- Contrast: Actually, Really, Secretly, Quietly, Silently

TITLE FORMULAS (use a DIFFERENT formula per title):
A: "[SHOCKING CLAIM] That [AUTHORITY] Has Hidden For [TIME]"
B: "The [ADJECTIVE] Truth About [TOPIC] (They Lied To You)"
C: "[NUMBER] [TOPIC] [Power Word] That [Consequence]"
D: "Why [COMMON BELIEF ABOUT TOPIC] Is Completely Wrong"
E: "I [DID THING] For [TIME PERIOD] — What I Found Will Shock You"
F: "[TOPIC] EXPOSED: The [ADJECTIVE] Secret Nobody Talks About"
G: "Stop [COMMON ACTION]: Here's What [AUTHORITY] Won't Tell You"
H: "The [TOPIC] [POWER WORD] That [SPECIFIC CONSEQUENCE]"
I: "What Happens When [SCENARIO] — The Truth Is Disturbing"
J: "[WARNING]: [TOPIC] Is [SHOCKING REVELATION] Right Now"

BAD titles (5/10 — DO NOT write like this):
- "Everything About Credit Cards"
- "How Banks Work - A Full Explanation"

GOOD titles (10/10 — WRITE like this):
- "The Hidden Fee That Costs Americans $29 Billion Every Year"
- "I Read Every Bank's Fine Print. What I Found Is Disturbing."
- "The 11-Minute Decision That Destroyed a $200M Company"

═══════════════════════════════════════
PART 2: 3 SEO DESCRIPTIONS
═══════════════════════════════════════

Each description architecture:

SECTION 1 — HOOK (first 150 chars, shown in search before "Show More"):
- Primary keyword in FIRST sentence
- Immediate curiosity or urgency

SECTION 2 — EXPANDED HOOK (200 words):
- 3-5 long-tail keywords woven naturally
- Emotional stakes

SECTION 3 — TIMESTAMPS:
0:00 - Introduction
(realistic timestamps from script content)

SECTION 4 — CTA:
- Subscribe reason tied to topic
- Comment prompt (controversial/personal question)
- Like framing tied to content value

SECTION 5 — RELATED TERMS BLOCK:
Natural-language paragraph of related terms (NOT a keyword list)

SECTION 6 — CHAPTER LINKS:
Placeholder: [LINK TO RESOURCE]

VARIANTS:
1. "Maximum SEO" — keyword-dense, 600-800 words
2. "Engagement Focused" — emotionally compelling, drives comments, 400-500 words
3. "Community Building" — creates belonging, drives subs, 400-500 words

═══════════════════════════════════════
PART 3: TAGS (30 total)
═══════════════════════════════════════

- 10 SHORT (1-2 words): Broadest category. High volume, high competition.
- 10 MEDIUM (3-4 words): Core intent. Moderate competition.
- 10 LONG-TAIL (5-8 words): Specific search queries. Low competition, high intent.

All must be: actually searched by real people, directly relevant to THIS video, varied in intent.

═══════════════════════════════════════
PART 4: HASHTAGS (10)
═══════════════════════════════════════

- First 3 appear above title in search (maximum impact)
- Mix: 2 trending, 4 niche-specific, 4 topic-specific
- No spaces, proper capitalization

═══════════════════════════════════════
PART 5: PINNED COMMENT
═══════════════════════════════════════

- ONE controversial/personal question related to video
- Soft CTA that doesn't feel like a CTA
- 2-3 sentences max
- Sounds like a real person, not a marketer

═══════════════════════════════════════
PART 6: SEO ANALYSIS
═══════════════════════════════════════

- Primary keyword + why chosen
- Secondary keywords
- Search volume estimates
- Competition analysis
- Best upload timing (day, time, timezone) with reasoning
- Trending angles for first 48 hours
- Thumbnail A/B test recommendation
- Retention risk points from script
- End screen strategy

═══════════════════════════════════════
OUTPUT — EXACT JSON STRUCTURE
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
      "hook_type": "curiosity_gap/power_word/number/warning/pattern_break/emotional_contrast",
      "primary_emotion": "fear/curiosity/outrage/inspiration/shock",
      "scroll_stop_score": 9,
      "why_it_works": "Specific psychological reason",
      "ab_test_pair": "Which other title to A/B test against"
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
      "content": "Full 400-500 word description",
      "primary_keywords": ["keyword1"],
      "long_tail_keywords": ["phrase1"],
      "short_keywords": ["short1"]
    },
    {
      "label": "Community Building",
      "content": "Full 400-500 word description",
      "primary_keywords": ["keyword1"],
      "long_tail_keywords": ["phrase1"],
      "short_keywords": ["short1"]
    }
  ],
  "tags_short": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"],
  "tags_medium": ["medium tag 1","medium tag 2","medium tag 3","medium tag 4","medium tag 5","medium tag 6","medium tag 7","medium tag 8","medium tag 9","medium tag 10"],
  "tags_long": ["long tail phrase 1","long tail phrase 2","long tail phrase 3","long tail phrase 4","long tail phrase 5","long tail phrase 6","long tail phrase 7","long tail phrase 8","long tail phrase 9","long tail phrase 10"],
  "hashtags": ["#Hashtag1","#Hashtag2","#Hashtag3","#Hashtag4","#Hashtag5","#Hashtag6","#Hashtag7","#Hashtag8","#Hashtag9","#Hashtag10"],
  "pinned_comment": "The pinned comment text",
  "seo_analysis": {
    "primary_keyword": "main keyword",
    "secondary_keywords": ["kw1", "kw2", "kw3"],
    "estimated_search_volume": "10K-50K/month",
    "competition": "low/medium/high",
    "difficulty_score": "3/10",
    "recommended_upload_day": "Tuesday",
    "recommended_upload_time": "2:00 PM EST",
    "upload_reasoning": "Why this day/time",
    "trending_angle": "What makes this hot now",
    "first_48_hour_strategy": "Actions for first 48 hours",
    "ab_test_recommendation": "Which two titles to test and why",
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

    if (!result.data.titles || !Array.isArray(result.data.titles)) {
      return Response.json({ error: 'Invalid response format — missing titles array' }, { status: 500 });
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

    // ══════════════════════════════════════════════════════════════
    // DELETE EXISTING METADATA (parallel)
    // ══════════════════════════════════════════════════════════════
    try {
      const existing = await base44.entities.UploadMetadata.filter({ project_id });
      await Promise.all(existing.map(e => base44.entities.UploadMetadata.delete(e.id)));
    } catch (delErr) {
      console.warn('Delete existing metadata failed:', delErr.message);
    }

    // ══════════════════════════════════════════════════════════════
    // SAVE METADATA
    // ══════════════════════════════════════════════════════════════
    const allTags = [
      ...(result.data.tags_short || []),
      ...(result.data.tags_medium || []),
      ...(result.data.tags_long || [])
    ];

    const titles = result.data.titles || [];

    const metadata = await base44.entities.UploadMetadata.create({
      project_id,
      title_primary: titles[0]?.title || '',
      title_variation_1: titles[1]?.title || '',
      title_variation_2: titles[2]?.title || '',
      title_variation_3: titles[3]?.title || '',
      title_variation_4: titles[4]?.title || '',
      description_template: result.data.descriptions?.[0]?.content || '',
      description_alt_1: result.data.descriptions?.[1]?.content || '',
      description_alt_2: result.data.descriptions?.[2]?.content || '',
      tags: JSON.stringify(allTags),
      tags_short: JSON.stringify(result.data.tags_short || []),
      tags_medium: JSON.stringify(result.data.tags_medium || []),
      tags_long: JSON.stringify(result.data.tags_long || []),
      hashtags: (result.data.hashtags || []).join(' '),
      pinned_comment: result.data.pinned_comment || '',
      seo_analysis: JSON.stringify(result.data.seo_analysis || {}),
      seo_strategy: result.data.seo_strategy || ''
    });

    // Update project step
    try {
      await base44.entities.Projects.update(project_id, { current_step: 13 });
    } catch (stepErr) {
      console.warn('Failed to update project step:', stepErr.message);
    }

    console.log('══════════════════════════════════════════════════════');
    console.log(`Model: GPT-4o | Titles: ${titles.length} | Tags: ${allTags.length}`);
    console.log(`Quality warnings: ${qualityWarnings}`);
    console.log(`Primary keyword: ${result.data.seo_analysis?.primary_keyword}`);
    console.log(`Strategy: ${result.data.seo_strategy?.substring(0, 100)}...`);
    console.log('══════════════════════════════════════════════════════');

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
      metadata_extra: {
        hashtags: (result.data.hashtags || []).join(' '),
        pinned_comment: result.data.pinned_comment || ''
      },
      meta: {
        model: "gpt-4o",
        quality_warnings: qualityWarnings,
        total_titles: titles.length,
        total_tags: allTags.length
      }
    });

  } catch (error) {
    console.error('generateSeoTitlesDescriptions error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});