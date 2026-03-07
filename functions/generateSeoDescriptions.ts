import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// STREAMLINED JSON PARSING
// ══════════════════════════════════════════════════════════════════

function parseOpenAIJson(text) {
  try { return JSON.parse(text); } catch (_) {}
  
  let cleaned = text;
  if (text.includes("```")) {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) cleaned = match[1];
  }
  
  try { return JSON.parse(cleaned.trim()); } catch (_) {}
  
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  
  throw new Error("Failed to parse JSON");
}

async function safeOpenAICall(prompt, temperature = 0.7, maxTokens = 3000) {
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
        { role: "system", content: "You are a YouTube SEO expert. Respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`OpenAI ${response.status}: ${err.error?.message || 'Unknown'}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty OpenAI response");

  return { success: true, data: parseOpenAIJson(text) };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER — PHASE 2: DESCRIPTIONS ONLY
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
    const [projects, allScripts, allTopics, metadataList] = await Promise.all([
      base44.entities.Projects.filter({ id: project_id }),
      base44.entities.Scripts.filter({ project_id }),
      base44.entities.Topics.filter({ project_id }),
      base44.entities.UploadMetadata.filter({ project_id })
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const script = allScripts.find(s => s.version === 'final_aggregated') || allScripts[0];
    if (!script) return Response.json({ error: 'No script found' }, { status: 404 });

    const metadata = metadataList[0];
    if (!metadata) return Response.json({ error: 'No metadata found — run Phase 1 first' }, { status: 404 });

    const topic = allTopics.find(t => t.is_selected === true) || allTopics[0];
    const topicTitle = topic?.title || script.title || project.name || 'Untitled';

    // Get the primary title from Phase 1
    const primaryTitle = metadata.title_primary || topicTitle;

    const scriptContent = script.full_script ||
      [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro]
        .filter(Boolean).join('\n\n');
    
    const truncatedScript = scriptContent.substring(0, 2500);

    console.log('══════════════════════════════════════════════════════');
    console.log('PHASE 2: DESCRIPTIONS (OpenAI GPT-4o)');
    console.log(`Topic: ${topicTitle}`);
    console.log('══════════════════════════════════════════════════════');

    // ══════════════════════════════════════════════════════════════
    // DESCRIPTION-ONLY PROMPT
    // ══════════════════════════════════════════════════════════════

    const prompt = `You are a YouTube SEO expert. Generate 3 video descriptions for this video.

VIDEO TOPIC: "${topicTitle}"
VIDEO TITLE: "${primaryTitle}"
NICHE: "${project.niche}"

SCRIPT EXCERPT:
${truncatedScript}

═══════════════════════════════════════
GENERATE 3 DESCRIPTIONS
═══════════════════════════════════════

Each description should have:

1. **HOOK** (first 150 chars — shown before "Show More")
   - Primary keyword in first sentence
   - Immediate curiosity or urgency

2. **EXPANDED CONTENT** (200-300 words)
   - 3-5 long-tail keywords woven naturally
   - Emotional stakes and value proposition

3. **TIMESTAMPS** (realistic from script)
   0:00 - Introduction
   (add 4-6 more based on script content)

4. **CTA SECTION**
   - Subscribe reason tied to topic
   - Comment prompt (engaging question)

═══════════════════════════════════════
3 VARIANTS
═══════════════════════════════════════

1. "Maximum SEO" — keyword-dense, 400-500 words total
2. "Engagement Focused" — emotionally compelling, drives comments, 300-400 words
3. "Community Building" — creates belonging, drives subs, 300-400 words

═══════════════════════════════════════
OUTPUT — EXACT JSON STRUCTURE
═══════════════════════════════════════

{
  "descriptions": [
    {
      "label": "Maximum SEO",
      "content": "Full description with all sections...",
      "primary_keywords": ["keyword1", "keyword2"],
      "long_tail_keywords": ["phrase1", "phrase2"]
    },
    {
      "label": "Engagement Focused",
      "content": "Full description...",
      "primary_keywords": ["keyword1"],
      "long_tail_keywords": ["phrase1"]
    },
    {
      "label": "Community Building",
      "content": "Full description...",
      "primary_keywords": ["keyword1"],
      "long_tail_keywords": ["phrase1"]
    }
  ]
}

Respond ONLY with the JSON object.`;

    const result = await safeOpenAICall(prompt, 0.7, 3000);

    if (!result.success) {
      console.error('OpenAI failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    const { descriptions = [] } = result.data;

    if (!descriptions.length) {
      return Response.json({ error: 'No descriptions generated' }, { status: 500 });
    }

    // ══════════════════════════════════════════════════════════════
    // UPDATE EXISTING METADATA WITH DESCRIPTIONS
    // ══════════════════════════════════════════════════════════════
    await base44.entities.UploadMetadata.update(metadata.id, {
      description_template: descriptions[0]?.content || '',
      description_alt_1: descriptions[1]?.content || '',
      description_alt_2: descriptions[2]?.content || ''
    });

    console.log(`✓ Phase 2 complete: ${descriptions.length} descriptions`);

    return Response.json({
      success: true,
      descriptions
    });

  } catch (error) {
    console.error('generateSeoDescriptions error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
