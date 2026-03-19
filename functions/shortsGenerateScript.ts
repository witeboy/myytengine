import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// SHORTS SCRIPT GENERATION ENGINE v2
// Generates a 200-240 word, 90-second YouTube Shorts script.
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt + "\n\nRespond with ONLY valid JSON." }] }],
        generationConfig: { temperature, maxOutputTokens: 2048, responseMimeType: "application/json" },
      }),
    }
  );
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini ${response.status}: ${errBody.substring(0, 200)}`);
  }
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try { return JSON.parse(rawText); } catch (_) {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    return JSON.parse(cleaned);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    console.log(`📱 shortsGenerateScript: project=${project_id}`);

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get channel shorts niche
    let shortsNiche = 'finance';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      shortsNiche = channels[0]?.shorts_niche || 'finance';
    }

    const topicTitle = project.name;
    const isBook = shortsNiche === 'book';

    const nicheBlock = isBook
      ? `NICHE: BOOK SUMMARY
Structure: HOOK (5s) → BOOK CONTEXT (10s) → 3 KEY LESSONS (50s) → TRANSFORMATION (10s) → CTA (10s) → LOOP/END (5s)
- Hook: Lead with the RESULT, not the book title. Book title comes SECOND.
- Context: Author + credibility + core problem.
- Lessons: Exactly 3. Label "Lesson 1, 2, 3". Each ~16s. Concept → Example.
- Transformation: One sentence synthesizing all 3 lessons.
- CTA: "Save this" + tease next book + question.`
      : `NICHE: FINANCE / WEALTH
Structure: HOOK (5s) → TENSION (15s) → PIVOT (5s) → VALUE: 3 RULES (45s) → CTA (15s) → DEAD ZONE (5s)
- Hook: Pattern interrupt. Number/contradiction/'you' statement. NO intro.
- Tension: 'You' language, specific stat, urgency.
- Pivot: Single sentence reversal. Secret unlocked.
- Value: Exactly 3 rules. "Rule #1... #2... #3..." Setup + proof. Numbers required.
- CTA: Callback to hook. "Save this". Tease next video. Question. Never "like and subscribe".
- Require at least 3 specific numbers.`;

    const prompt = `You are a YouTube Shorts scriptwriter. Write a 90-second script for: "${topicTitle}"

RULES:
- 200-240 words MAX. ~2.7 words/sec.
- HOOK in first 15 words. NO preamble.
- 3-point structure in value section.
- End with CTA including "save this".
- Use [TIMESTAMP SECTION] headers.

${nicheBlock}

Return JSON: {"title":"string under 60 chars","script":"full formatted script","word_count":number}`;

    console.log(`📱 Calling Gemini for "${topicTitle}" (${shortsNiche})...`);
    const result = await callGemini(prompt, 0.75);

    const rawScript = result.script || '';
    // Strip section headers like [HOOK - 5s], [TENSION - 15s], [VALUE - 45s], etc.
    const fullScript = rawScript
      .replace(/\[.*?\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const wordCount = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const title = result.title || topicTitle;

    console.log(`✅ Got script: ${wordCount} words, title: "${title}"`);

    // Delete old scripts then create new one
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    for (const s of oldScripts) {
      try { await base44.asServiceRole.entities.Scripts.delete(s.id); } catch (_) {}
    }

    await base44.asServiceRole.entities.Scripts.create({
      project_id,
      version: 'final_aggregated',
      title,
      full_script: fullScript,
      word_count: wordCount,
      estimated_duration_sec: 90,
    });

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'script_complete',
      current_step: 3,
    });

    console.log(`✅ Script saved and project updated`);

    return Response.json({ success: true, title, word_count: wordCount });

  } catch (error) {
    console.error('❌ shortsGenerateScript error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});