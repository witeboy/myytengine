import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// EXPLAINER SCRIPT RESEARCH ENGINE v1.1 (redeploy 2026-05-21)
// Step 0 in the explainer pipeline — runs BEFORE script writing.
//
// Flow:
//   1. Gemini 2.5 Pro + Google Search Grounding → structured facts
//   2. Claude + web_search_20250305 tool → fallback + verification
//   3. Saves research JSON to ProductionSettings.research_notes
//
// Called by: initializeScriptBatches (explainer mode only)
// ══════════════════════════════════════════════════════════════════

function extractJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  try { return JSON.parse(rawText); } catch (_) {}
  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch (_) {} }
  const obj = rawText.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
  return null;
}

// ── Gemini 2.5 Pro with Google Search Grounding ──────────────────
async function researchWithGemini(topic, outlineSections, arcType) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const sections = outlineSections.map((s, i) => `${i + 1}. ${s.title}: ${s.description}`).join('\n');

  const prompt = `You are a subject matter expert researcher preparing verified facts for an educational explainer video.

TOPIC: "${topic}"
ARC TYPE: ${arcType}

OUTLINE SECTIONS TO RESEARCH:
${sections}

Search the web thoroughly and produce a structured fact document covering every section.

For EACH section provide:
- Core facts (specific, verified, with numbers/dates/versions where relevant)
- Common misconceptions to avoid or actively debunk
- The single best analogy or real-world example for that concept
- Any formulas, equations, or code snippets that are relevant (must be 100% correct)
- 2-3 authoritative sources

ACCURACY RULES:
- Every statistic must be verifiable via search
- Every formula must be mathematically correct — double-check all algebra
- Every code snippet must be syntactically valid for the language shown
- If uncertain about ANY fact, flag it with [VERIFY]
- For technology topics prefer sources from last 3 years
- For foundational concepts prefer seminal papers or textbooks
- Never invent citations — only include sources you can confirm exist

Return ONLY valid JSON — no markdown, no backticks:
{
  "topic": "${topic}",
  "arc_type": "${arcType}",
  "overall_accuracy_confidence": 0.95,
  "sections": [
    {
      "section_title": "string",
      "core_facts": ["specific fact with number/date", "..."],
      "misconceptions": ["misconception to debunk", "..."],
      "best_analogy": "one vivid analogy string",
      "formulas_or_code": ["formula or code snippet string", "..."],
      "sources": [{"name": "string", "url": "string"}],
      "accuracy_notes": "any VERIFY flags or caveats"
    }
  ],
  "key_terms_glossary": {"term": "precise definition"},
  "difficulty_level": "beginner or intermediate or advanced",
  "prerequisite_knowledge": ["concept 1", "concept 2"]
}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini research error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Log grounding metadata if present
  const groundingMeta = data.candidates?.[0]?.groundingMetadata;
  if (groundingMeta?.webSearchQueries) {
    console.log(`🔍 Gemini searched: ${groundingMeta.webSearchQueries.join(' | ')}`);
  }
  if (groundingMeta?.groundingChunks?.length) {
    console.log(`📚 Grounding sources: ${groundingMeta.groundingChunks.length} web results used`);
  }

  const parsed = extractJSON(rawText);
  if (parsed) return { result: parsed, provider: 'gemini_grounded' };
  throw new Error(`Gemini research returned unparseable JSON. Length: ${rawText.length}`);
}

// ── Claude with web_search_20250305 tool — fallback ──────────────
async function researchWithClaude(topic, outlineSections, arcType) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const sections = outlineSections.map((s, i) => `${i + 1}. ${s.title}: ${s.description}`).join('\n');

  const prompt = `You are a subject matter expert researcher. Search the web thoroughly and produce a structured fact document for an educational explainer video.

TOPIC: "${topic}"
ARC TYPE: ${arcType}

OUTLINE SECTIONS TO RESEARCH:
${sections}

For EACH section find and verify:
- Core facts with specific numbers, dates, versions
- Common misconceptions to debunk
- Best real-world analogy
- Relevant formulas or code snippets (must be 100% syntactically correct)
- 2-3 authoritative sources you can confirm exist

Flag anything uncertain with [VERIFY].

Return ONLY valid JSON:
{
  "topic": "${topic}",
  "arc_type": "${arcType}",
  "overall_accuracy_confidence": 0.95,
  "sections": [
    {
      "section_title": "string",
      "core_facts": ["fact", "..."],
      "misconceptions": ["misconception", "..."],
      "best_analogy": "string",
      "formulas_or_code": ["string", "..."],
      "sources": [{"name": "string", "url": "string"}],
      "accuracy_notes": "string"
    }
  ],
  "key_terms_glossary": {"term": "definition"},
  "difficulty_level": "beginner or intermediate or advanced",
  "prerequisite_knowledge": ["concept 1"]
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      temperature: 0.1,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        }
      ],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Claude research error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const data = await response.json();

  // Collect all text blocks — Claude may interleave tool_use and text
  const textBlocks = (data.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  const toolUseBlocks = (data.content || []).filter(b => b.type === 'tool_use');
  if (toolUseBlocks.length > 0) {
    console.log(`🔍 Claude used web search ${toolUseBlocks.length} time(s)`);
  }

  const parsed = extractJSON(textBlocks);
  if (parsed) return { result: parsed, provider: 'claude_websearch' };
  throw new Error(`Claude research returned unparseable JSON. stop_reason: ${data.stop_reason}`);
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, topic, outline_sections, arc_type } = await req.json();

    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
    if (!topic) return Response.json({ error: 'topic required' }, { status: 400 });
    if (!outline_sections || !Array.isArray(outline_sections)) {
      return Response.json({ error: 'outline_sections array required' }, { status: 400 });
    }

    const arcType = arc_type || 'professor';

    console.log(`🔬 Researching: "${topic}" | arc: ${arcType} | sections: ${outline_sections.length}`);

    let researchResult = null;
    let provider = null;

    // Primary: Gemini 2.5 Pro with Google Search Grounding
    try {
      const { result, provider: p } = await researchWithGemini(topic, outline_sections, arcType);
      researchResult = result;
      provider = p;
      console.log(`✅ Gemini grounded research complete | confidence: ${result.overall_accuracy_confidence}`);
    } catch (geminiErr) {
      console.warn(`⚠️ Gemini research failed: ${geminiErr.message} — falling back to Claude web search`);

      // Fallback: Claude with web_search tool
      try {
        const { result, provider: p } = await researchWithClaude(topic, outline_sections, arcType);
        researchResult = result;
        provider = p;
        console.log(`✅ Claude web search research complete | confidence: ${result.overall_accuracy_confidence}`);
      } catch (claudeErr) {
        console.error(`❌ Both research providers failed. Claude: ${claudeErr.message}`);
        return Response.json({
          error: `Research failed. Gemini: ${geminiErr.message} | Claude: ${claudeErr.message}`
        }, { status: 500 });
      }
    }

    // Save research to ProductionSettings
    const psPayload = {
      project_id,
      research_notes: JSON.stringify(researchResult),
      research_provider: provider,
      research_topic: topic,
      research_arc_type: arcType,
    };

    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create(psPayload);
    }

    console.log(`💾 Research saved to ProductionSettings | provider: ${provider}`);

    return Response.json({
      success: true,
      provider,
      topic,
      arc_type: arcType,
      difficulty_level: researchResult.difficulty_level,
      sections_researched: researchResult.sections?.length || 0,
      overall_accuracy_confidence: researchResult.overall_accuracy_confidence,
      key_terms_count: Object.keys(researchResult.key_terms_glossary || {}).length,
      research: researchResult,
    });

  } catch (error) {
    console.error('❌ explainerScriptResearch error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});