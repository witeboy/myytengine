import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// STREAMLINED JSON PARSING (single pass, no regex spam)
// ══════════════════════════════════════════════════════════════════

function parseOpenAIJson(text) {
  // Direct parse (fastest path)
  try { return JSON.parse(text); } catch (_) {}
  
  // Strip code fences if present
  let cleaned = text;
  if (text.includes("```")) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) cleaned = match[1];
  }
  
  try { return JSON.parse(cleaned.trim()); } catch (_) {}
  
  // Last resort: extract object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  
  throw new Error("Failed to parse JSON");
}

async function safeOpenAICall(prompt, temperature = 0.8, maxTokens = 2048) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a YouTube SEO grandmaster. Respond with valid JSON only. No markdown, no commentary." },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    })
  });

  if (response.status === 429) {
    throw new Error("Rate limited — please wait a moment and try again");
  }

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenAI ${response.status}: ${err.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty OpenAI response");

  return { success: true, data: parseOpenAIJson(text) };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER — PHASE 1: TITLES + TAGS + HASHTAGS + PINNED COMMENT
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    // ══════════════════════════════════════════════════════════════
    // LOAD DATA
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
    const topicTitle = topic?.title || script.title || project.name || 'Untitled';

    const scriptContent = script.full_script ||
      [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro]
        .filter(Boolean).join('\n\n');
    
    // REDUCED to 2000 chars to save CPU
    const truncatedScript = scriptContent.substring(0, 2000);

    console.log('══════════════════════════════════════════════════════');
    console.log('PHASE 1: TITLES + TAGS (OpenAI GPT-4o)');
    console.log(`Topic: ${topicTitle}`);
    console.log('══════════════════════════════════════════════════════');

    // ══════════════════════════════════════════════════════════════
    // SLIM PROMPT — TITLES + TAGS + HASHTAGS + PINNED COMMENT ONLY
    // ══════════════════════════════════════════════════════════════

    const prompt = `You are a YouTube SEO grandmaster. Generate scroll-stopping metadata for this video.

VIDEO TOPIC: "${topicTitle}"
NICHE: "${project.niche}"
CHANNEL TYPE: Faceless documentary/educational

SCRIPT EXCERPT:
${truncatedScript}

═══════════════════════════════════════
GENERATE THE FOLLOWING:
═══════════════════════════════════════

1. **5 KILLER TITLES** (not 10 — quality over quantity)
   - 50-70 characters ideal
   - Front-load primary keyword in first 3 words
   - Mix: 2 searchable/SEO-first + 2 curiosity-driven + 1 bold claim
   - Use power words: Secret, Hidden, Exposed, Warning, Proven, Actually
   - Each title must be clearly about "${topicTitle}"

2. **10 TAGS** (mix of lengths)
   - 3 short (1-2 words): broadest category
   - 4 medium (3-4 words): core intent
   - 3 long-tail (5-8 words): specific search queries

3. **5 HASHTAGS**
   - First 3 appear above title (maximum impact)
   - Mix trending + niche-specific

4. **1 PINNED COMMENT**
   - One engaging question related to video
   - 2-3 sentences max, sounds human

5. **SEO ANALYSIS** (brief)
   - Primary keyword
   - Recommended upload day/time
   - Competition level

═══════════════════════════════════════
OUTPUT — EXACT JSON STRUCTURE
═══════════════════════════════════════

{
  "titles": [
    {
      "rank": 1,
      "title": "The actual title text",
      "char_count": 55,
      "primary_keyword": "main search term",
      "hook_type": "curiosity_gap|power_word|number|warning",
      "why_it_works": "Brief reason"
    }
  ],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "hashtags": ["#Hashtag1", "#Hashtag2", "#Hashtag3", "#Hashtag4", "#Hashtag5"],
  "pinned_comment": "The engaging pinned comment text",
  "seo_analysis": {
    "primary_keyword": "main keyword",
    "secondary_keywords": ["kw1", "kw2"],
    "competition": "low|medium|high",
    "recommended_upload_day": "Tuesday",
    "recommended_upload_time": "2:00 PM EST",
    "upload_reasoning": "Brief reason"
  }
}

Respond ONLY with the JSON object.`;

    const result = await safeOpenAICall(prompt, 0.8, 2048);

    if (!result.success) {
      console.error('OpenAI failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    const { titles = [], tags = [], hashtags = [], pinned_comment = '', seo_analysis = {} } = result.data;

    if (!titles.length) {
      return Response.json({ error: 'No titles generated' }, { status: 500 });
    }

    // ══════════════════════════════════════════════════════════════
    // DELETE EXISTING METADATA
    // ══════════════════════════════════════════════════════════════
    try {
      const existing = await base44.entities.UploadMetadata.filter({ project_id });
      await Promise.all(existing.map(e => base44.entities.UploadMetadata.delete(e.id)));
    } catch (_) {}

    // ══════════════════════════════════════════════════════════════
    // SAVE METADATA (descriptions will be added by Phase 2)
    // ══════════════════════════════════════════════════════════════
    const metadata = await base44.entities.UploadMetadata.create({
      project_id,
      title_primary: titles[0]?.title || '',
      title_variation_1: titles[1]?.title || '',
      title_variation_2: titles[2]?.title || '',
      title_variation_3: titles[3]?.title || '',
      title_variation_4: titles[4]?.title || '',
      tags: JSON.stringify(tags),
      hashtags: hashtags.join(' '),
      pinned_comment,
      seo_analysis: JSON.stringify(seo_analysis),
      // Descriptions will be populated by generateSeoDescriptions
      description_template: '',
      description_alt_1: '',
      description_alt_2: ''
    });

    // Update project step
    try {
      await base44.entities.Projects.update(project_id, { current_step: 13 });
    } catch (_) {}

    console.log(`✓ Phase 1 complete: ${titles.length} titles, ${tags.length} tags`);

    return Response.json({
      success: true,
      metadata,
      titles,
      tags,
      hashtags,
      pinned_comment,
      seo_analysis,
      tags_breakdown: {
        short: tags.slice(0, 3),
        medium: tags.slice(3, 7),
        long: tags.slice(7),
        all: tags
      },
      needs_descriptions: true  // Signal frontend to call Phase 2
    });

  } catch (error) {
    console.error('generateSeoTitlesDescriptions error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});