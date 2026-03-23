import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

async function callGemini(prompt, temperature = 0.8, maxTokens = 32768) {
  const key = Deno.env.get("GEMINI_API_KEY");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Gemini ${res.status}: ${err.error?.message || "Unknown"}`);
  }
  const data = await res.json();
  if (!data.candidates?.length) throw new Error("Gemini returned no candidates");
  let text = data.candidates[0].content.parts[0].text;
  if (text.includes("```json")) text = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) text = text.split("```")[1].split("```")[0].trim();
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get topic & hook if available
    let topicTitle = project.name || 'Untitled';
    let topicDesc = '';
    let hookText = '';

    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      if (topics[0]) {
        topicTitle = topics[0].title || topicTitle;
        topicDesc = topics[0].description || '';
      }
    }
    if (project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      if (hooks[0]) hookText = hooks[0].hook_text || '';
    }

    // Check for script strategy override (from channel niche config)
    let strategyContext = '';
    if (project.script_strategy_override) {
      try {
        const strat = JSON.parse(project.script_strategy_override);
        strategyContext = `\n\nNICHE STRATEGY OVERRIDE:\n${JSON.stringify(strat, null, 2)}`;
      } catch (_) {}
    }

    // Check for outline
    let outlineContext = '';
    if (project.outline) {
      try {
        const outline = JSON.parse(project.outline);
        if (Array.isArray(outline) && outline.length > 0) {
          outlineContext = `\n\nPROJECT OUTLINE:\n${outline.map((b, i) => `${i + 1}. ${b.segment || b.focus || b.title || ''}: ${b.synopsis || b.description || ''}`).join('\n')}`;
        }
      } catch (_) {}
    }

    const dur = project.video_duration_minutes || 10;
    const targetWords = dur * 160;
    const tone = project.tone || 'dramatic';

    console.log(`[longViralGenerateScript] Generating ${dur}-min script (${targetWords} words) for "${topicTitle}"`);

    const prompt = `You are an elite YouTube scriptwriter. Write a COMPLETE long-form narration script.

TOPIC: "${topicTitle}"
${topicDesc ? `CONTEXT: ${topicDesc}` : ''}
${hookText ? `HOOK CONCEPT: "${hookText}" — Transform this into a gripping opening.` : ''}
TONE: ${tone}
${strategyContext}
${outlineContext}

TARGET: ${targetWords} words (~${dur} minutes at 150 wpm)
FORMAT: ${project.orientation === 'portrait' ? '9:16 vertical' : '16:9 widescreen'} documentary

═══════════════════════════════════════════════
LONG-FORM STRUCTURE
═══════════════════════════════════════════════

Write a COMPLETE narration-only script (this is what will be read aloud as voiceover).

**COLD OPEN (7-15 seconds):**
- Start with the most gripping, specific moment
- Stop scrolling immediately with a hook that creates curiosity
- Use vivid sensory language, specific numbers, names

**ACT 1 — Setup & World Building (25%):**
- Establish context without repeating the cold open
- Introduce the central conflict/question
- Show why viewers should care (stakes)
- End on rising tension

**ACT 2 — Deep Dive & Escalation (40%):**
- Go beyond "what happened" to "why it matters"
- Layer complexity: simple → nuanced → profound
- Every 60-90 seconds, insert a micro-hook to retain viewers:
  "But that wasn't the real story."
  "What happened next changed everything."
  "And this is where it gets uncomfortable."
- Introduce complications, contradictions, hidden angles
- This is the LONGEST section — fill it with substance

**ACT 3 — Climax & Resolution (25%):**
- The critical turning point
- Slow down for emotional/intellectual weight
- Show consequences and ripple effects
- Build to a profound insight

**OUTRO (5-10 seconds):**
- Subtle call to action that feels earned
- Reinforce core takeaway
- Leave viewers reflecting

═══════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════

1. Write EXACTLY the narration text — no stage directions, no [SCENE:], no (actions), no visual cues
2. Pure spoken word that will be recorded as voiceover
3. Target EXACTLY ${targetWords} words (±10%). This is non-negotiable.
4. Use varied sentence lengths for rhythm
5. Be specific: names, numbers, dates, places — not vague generalities
6. Zero filler, zero repetition, zero padding
7. Every paragraph must either reveal new info, escalate tension, or deepen understanding
8. Write it as one continuous flowing narrative — no section headers or labels in the text

═══════════════════════════════════════════════
OUTPUT FORMAT (JSON)
═══════════════════════════════════════════════

{
  "title": "Compelling working title",
  "full_script": "The COMPLETE narration script, all acts combined into one flowing text. Target ${targetWords} words.",
  "cold_open": "Just the opening hook (first 2-4 sentences)",
  "act_1": "Act 1 content",
  "act_2": "Act 2 content", 
  "act_3": "Act 3 content",
  "outro": "Closing lines",
  "word_count": ${targetWords},
  "estimated_duration_sec": ${dur * 60}
}

IMPORTANT: The full_script field must contain ALL the narration combined. It should be approximately ${targetWords} words. Do NOT pad with filler — write substantive, engaging content that fills the duration naturally.`;

    const result = await callGemini(prompt, 0.85, 32768);

    // Clean the script — remove any accidental stage directions
    let fullScript = result.full_script || '';
    fullScript = fullScript.replace(/\[[^\]]*\]/gi, '');
    fullScript = fullScript.replace(/\([^)]*\)/g, '');
    fullScript = fullScript.replace(/^\*\*[^*]+\*\*:?\s*$/gim, '');
    fullScript = fullScript.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
    fullScript = fullScript.replace(/  +/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

    const wordCount = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedDuration = Math.round((wordCount / 150) * 60);

    console.log(`[longViralGenerateScript] Generated ${wordCount} words (~${Math.round(estimatedDuration / 60)}min)`);

    // Save or update script
    const existingScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const existingFinal = existingScripts.find(s => s.version === 'final_aggregated');

    let script;
    const scriptData = {
      project_id,
      topic_id: project.selected_topic_id || null,
      version: 'final_aggregated',
      title: result.title || topicTitle,
      full_script: fullScript,
      cold_open: result.cold_open || '',
      act_1: result.act_1 || '',
      act_2: result.act_2 || '',
      act_3: result.act_3 || '',
      outro: result.outro || '',
      word_count: wordCount,
      estimated_duration_sec: estimatedDuration,
    };

    if (existingFinal) {
      await base44.asServiceRole.entities.Scripts.update(existingFinal.id, scriptData);
      script = { ...existingFinal, ...scriptData };
    } else {
      script = await base44.asServiceRole.entities.Scripts.create(scriptData);
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      script_id: script.id,
      status: 'script_complete',
      current_step: 4,
    });

    console.log(`[longViralGenerateScript] Script saved: ${script.id}`);

    return Response.json({
      success: true,
      script_id: script.id,
      word_count: wordCount,
      estimated_duration_sec: estimatedDuration,
    });
  } catch (error) {
    console.error('[longViralGenerateScript] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});