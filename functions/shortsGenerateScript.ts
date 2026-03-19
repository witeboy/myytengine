import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// SHORTS SCRIPT GENERATION ENGINE
// Generates a 200-240 word, 90-second YouTube Shorts script
// following the exact section structure provided by the user.
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 4096, responseMimeType: "application/json" }
      })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini error: ${err.error?.message || response.status}`);
  }
  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");
  const rawText = data.candidates[0].content.parts[0].text;
  try { return JSON.parse(rawText); } catch (_) {
    // Try to recover JSON
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Gemini JSON");
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get channel for niche context
    let channel = null;
    let shortsNiche = 'finance'; // default
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
      shortsNiche = channel?.shorts_niche || 'finance';
    }

    const niche = channel?.niche || project.niche || 'finance';
    const topicTitle = project.name;

    const isFinance = shortsNiche === 'finance';
    const isBook = shortsNiche === 'book';

    const nicheRules = isBook ? `
NICHE: BOOK SUMMARY
Structure: HOOK (5s, 12-18w) → BOOK CONTEXT (10s, 25-30w) → 3 KEY LESSONS (50s, 120-145w) → TRANSFORMATION STATEMENT (10s, 25-30w) → CTA/SERIES HOOK (10s, 20-28w) → LOOP/END (5s, 0w)
- Hook: Lead with the RESULT the book delivers, not the book title. Book title comes SECOND.
- Context: Author name + credibility marker + core problem the book solves.
- Lessons: Exactly 3. Label them "Lesson 1, 2, 3". Each ~16s, ~40-48 words. Concept → Example/Proof. ACTIONABLE.
- Transformation: One sentence synthesizing all 3 lessons. Revelation, not summary. Design for screenshots.
- CTA: "Save this" language. Tease next book. End with question for comments.
- Book niche: require book title, author, sales/credibility stat in first 30 words.
` : `
NICHE: FINANCE / WEALTH
Structure: HOOK (5s, 12-18w) → TENSION/PROBLEM (15s, 35-45w) → PIVOT/REVEAL (5s, 12-16w) → VALUE DELIVERY (45s, 100-130w) → CTA/LOOP TRIGGER (15s, 30-40w) → DEAD ZONE (5s, 0w)
- Hook: Pattern interrupt. Number, contradiction, or 'you' statement. NO intro, NO logo, NO 'hey guys'.
- Tension: 'You' language, specific number/statistic, urgency — costing them RIGHT NOW.
- Pivot: Single sentence that reverses everything. Secret being unlocked.
- Value: Exactly 3 rules/points. "Rule #1... Rule #2... Rule #3..." Each point: setup + proof/example. At least ONE specific number per point.
- CTA: Callback to hook. "Save this" trigger. Tease next video. End with question. Do NOT say 'like and subscribe'.
- Finance niche: require at least 3 specific numbers per script.
`;

    const prompt = `You are a YouTube Shorts scriptwriter for faceless channels. Generate a 90-second script for the topic: "${topicTitle}" in the ${niche} niche.

HARD RULES:
- Total word count: 200-240 words. Hard cap 240.
- Pacing: ~2.7 words/second
- HOOK must be in the first 15 words. NO preamble.
- Force 3-point structure in the value/lessons section (not 2, not 4, not 5)
- Every script MUST end with a CTA that includes "save this"
- Include [VISUAL CUE] markers between each section for the Timeline Editor

${nicheRules}

FORMATTING:
- Use [TIMESTAMP] SECTION_NAME format before each section
- Put all spoken text in quotes
- Include [VISUAL CUE: description] markers between sections
- The dead zone / loop end has NO voiceover

Return JSON:
{
  "title": "Video title optimized for CTR (under 60 chars)",
  "script": "The complete formatted script with timestamps and visual cues",
  "word_count": number,
  "sections": [
    {"id": "hook|tension|pivot|value|cta|deadzone|context|lessons|transformation|loop", "text": "spoken text only", "duration_seconds": number}
  ]
}`;

    console.log(`📱 Generating Shorts script: "${topicTitle}" (${shortsNiche} niche)`);
    const result = await callGemini(prompt, 0.75);

    // Delete old scripts
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    for (const s of oldScripts) {
      try { await base44.asServiceRole.entities.Scripts.delete(s.id); } catch (_) {}
    }

    // Save the script
    const fullScript = result.script || result.sections?.map(s => s.text).join('\n\n') || '';
    const wordCount = fullScript.split(/\s+/).filter(w => w.length > 0).length;

    await base44.asServiceRole.entities.Scripts.create({
      project_id,
      version: 'final_aggregated',
      title: result.title || topicTitle,
      full_script: fullScript,
      word_count: wordCount,
      estimated_duration_sec: 90,
    });

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'script_complete',
      current_step: 3,
    });

    console.log(`✅ Shorts script generated: ${wordCount} words, title: "${result.title}"`);

    return Response.json({
      success: true,
      title: result.title,
      word_count: wordCount,
      sections: result.sections?.length || 0,
    });

  } catch (error) {
    console.error('❌ shortsGenerateScript error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});