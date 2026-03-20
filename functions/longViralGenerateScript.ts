import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// LONG VIRAL SCRIPT GENERATION ENGINE
// Same 5 niche-specific viral structures as Shorts, scaled to user-defined duration.
// ══════════════════════════════════════════════════════════════════

async function callClaude(prompt, temperature = 0.75) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16384,
      temperature,
      messages: [
        { role: "user", content: prompt + "\n\nRespond with the script text ONLY. Do NOT wrap in JSON or markdown. Just the raw script with [SECTION] markers." }
      ],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude ${response.status}: ${errBody.substring(0, 300)}`);
  }
  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  return text;
}

// Duration-aware prompt builders
function buildPrompt(nicheId, topicTitle, durationMin, totalWords) {
  const dur = `${durationMin}-minute`;
  const wc = totalWords;

  const PROMPTS = {
    finance: `You are a long-form YouTube scriptwriter specializing in finance and wealth content.
Write a ${dur} finance script (~${wc} words) for: "${topicTitle}"

STRUCTURE — same viral formula as a 90-second Short, expanded for long-form depth:

[HOOK] (first 30-60 seconds, ~80-120 words)
- Pattern interrupt with a shocking stat or counterintuitive claim.
- Make the viewer feel like they're losing money by NOT watching.
- Include a number, contradiction, or "you" statement.

[TENSION / PROBLEM] (next 2-3 minutes, ~${Math.round(wc * 0.15)} words)
- Deep dive into the pain point. Multiple stats and examples.
- Use "you" language. Make it personal and urgent.
- Build the case for WHY the viewer needs what comes next.

[PIVOT / REVEAL] (30-45 seconds, ~60-80 words)
- Single powerful moment that flips the script.
- "But here's what the top 1% figured out..."

[VALUE DELIVERY — 3 RULES] (main body ~${Math.round(wc * 0.45)} words, ~${Math.round(durationMin * 0.5)} minutes)
- Rule #1: The foundation. Deep explanation + 2-3 real examples + specific numbers.
- Rule #2: The multiplier. Extended case study or story + data.
- Rule #3: The secret. Counterintuitive insight + proof.
- Each rule gets substantial depth — stories, examples, math breakdowns.

[TRANSFORMATION] (1-2 minutes, ~${Math.round(wc * 0.1)} words)
- Show the compound effect of following all 3 rules.
- Before/after with specific numbers over 5, 10, 20 year horizons.

[CTA] (final 30-60 seconds, ~80-100 words)
- Callback to hook. "Save this" trigger. Tease next video. Ask engagement question.

CRITICAL: ${wc} words target. Include 10+ specific numbers. Every section must deliver value. NO filler.

Return JSON: {"title":"string under 60 chars","script":"full script text with [SECTION] markers","word_count":number}`,

    book: `You are a long-form YouTube scriptwriter specializing in book summaries.
Write a ${dur} book summary script (~${wc} words) for: "${topicTitle}"

STRUCTURE:
[HOOK] (30-60 seconds) — Lead with the RESULT, not the title.
[BOOK CONTEXT] (1-2 minutes) — Author credibility, why this book matters, core problem it solves.
[LESSON 1] (~${Math.round(durationMin * 0.2)} min) — Fundamental concept + detailed examples + how to apply it.
[LESSON 2] (~${Math.round(durationMin * 0.2)} min) — Practical application + case studies + actionable steps.
[LESSON 3] (~${Math.round(durationMin * 0.2)} min) — Counterintuitive insight + real-world proof + personal reflection.
[TRANSFORMATION] (1-2 minutes) — Synthesize all 3 lessons into one powerful insight.
[CTA] (30-60 seconds) — Save this, tease next book, reflection question.

${wc} words target. Use the author's stories. Make each lesson feel worth the book price alone.

Return JSON: {"title":"string under 60 chars","script":"full script with [SECTION] markers","word_count":number}`,

    crime_story: `You are a long-form YouTube scriptwriter specializing in true crime.
Write a ${dur} true crime script (~${wc} words) for: "${topicTitle}"

STRUCTURE:
[COLD OPEN] (30-60 seconds) — Drop INTO the crime. Most shocking detail first. Present tense.
[THE SETUP] (2-3 minutes) — Victim/criminal as normal person. Build empathy. First sign of trouble.
[THE ESCALATION] (~${Math.round(durationMin * 0.45)} min, main body) — Crime unfolds in 4+ beats. Each beat reveals something worse. Use timestamps. Include near-misses. Jaw drops at least 3 times.
[THE TWIST] (2-3 minutes) — Payoff. Must SURPRISE. Reframe everything heard so far.
[CTA / CLIFFHANGER] (30-60 seconds) — Moral question, save trigger, tease Part 2.

${wc} words target. Use specific dates, amounts, locations. Pure STORYTELLING — present tense.

Return JSON: {"title":"string under 60 chars","script":"full script with [SECTION] markers","word_count":number}`,

    tech_explainer: `You are a long-form YouTube scriptwriter in Fireship style — rapid, witty tech explainers.
Write a ${dur} tech explainer (~${wc} words) for: "${topicTitle}"

STRUCTURE:
[WTF HOOK] (30-60 seconds) — Make tech feel urgent and personal. Consequence or absurdity.
[CONTEXT BOMB] (2-3 minutes) — Origin story, scale/impact numbers, "this thing you take for granted is insane."
[STEP 1] (~${Math.round(durationMin * 0.15)} min) — Foundation concept + analogy + visual explanation.
[STEP 2] (~${Math.round(durationMin * 0.15)} min) — The clever innovation + deep analogy + implications.
[STEP 3] (~${Math.round(durationMin * 0.15)} min) — The mind-blowing scale part + real numbers.
[SO WHAT] (2-3 minutes) — Real-world examples + future prediction.
[CTA] (30-60 seconds) — Save this, tease next topic, "which step blew your mind?"

${wc} words target. Use analogies religiously. Make complex simple.

Return JSON: {"title":"string under 60 chars","script":"full script with [SECTION] markers","word_count":number}`,

    side_hustle: `You are a long-form YouTube scriptwriter for side hustle / money-making content.
Write a ${dur} side hustle tutorial (~${wc} words) for: "${topicTitle}"

STRUCTURE:
[PROOF HOOK] (30-60 seconds) — Result first. Specific dollar + timeframe + constraint.
[MYTH KILL] (1-2 minutes) — Destroy every objection. "You don't need X, Y, or Z."
[STEP 1: THE SETUP] (~${Math.round(durationMin * 0.15)} min) — Exactly what to sign up for, create, find. Name specific tools. Screen walkthrough level detail.
[STEP 2: THE WORK] (~${Math.round(durationMin * 0.15)} min) — The actual activity. Outreach numbers. Real DM templates. Specific metrics.
[STEP 3: THE SCALE] (~${Math.round(durationMin * 0.15)} min) — First dollar → real income. Show the math. Outsourcing. Monthly packages.
[PROOF AGAIN] (1-2 minutes) — Income growth Month 1 → 3 → 6. One "not perfect" moment.
[CTA] (30-60 seconds) — "Save this. Try Step 1 tonight." Tease next method.

${wc} words target. Use specific dollar amounts, platform names, timeframes. Every step doable tonight.

Return JSON: {"title":"string under 60 chars","script":"full script with [SECTION] markers","word_count":number}`,
  };

  return PROMPTS[nicheId] || `You are a long-form YouTube scriptwriter. Write a ${dur} script (~${wc} words) for: "${topicTitle}"\n\nUse a viral storytelling structure with hook, 3-part value core, and CTA. Include specific numbers. NO filler.\n\nReturn JSON: {"title":"string under 60 chars","script":"full script","word_count":number}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    console.log(`🎬 longViralGenerateScript: project=${project_id}`);

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get niche from channel
    let nicheId = 'finance';
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      nicheId = channels[0]?.shorts_niche || 'finance';
    }

    const durationMin = project.video_duration_minutes || 10;
    const wpm = 160;
    const totalWords = Math.round(durationMin * wpm);
    const topicTitle = project.name;

    const basePrompt = buildPrompt(nicheId, topicTitle, durationMin, totalWords);
    const minAcceptableWords = Math.round(totalWords * 0.75); // Must hit at least 75% of target

    let fullScript = '';
    let wordCount = 0;
    let title = topicTitle;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let prompt = basePrompt;
      if (attempt > 1) {
        prompt += `\n\n⚠️ CRITICAL: Your previous attempt was only ${wordCount} words. The MINIMUM is ${totalWords} words. You MUST write at least ${totalWords} words. Expand every section with more examples, more detail, more stories, more data. Do NOT summarize — go DEEP. ${totalWords} words minimum or the script will be rejected.`;
      }

      console.log(`🎬 Attempt ${attempt}/${MAX_ATTEMPTS}: Calling Gemini for "${topicTitle}" (niche: ${nicheId}, ${durationMin}min, ~${totalWords}w)...`);
      const result = await callGemini(prompt, attempt > 1 ? 0.8 : 0.75);

      const rawScript = result.script || '';
      fullScript = rawScript.replace(/\[.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
      wordCount = fullScript.split(/\s+/).filter(w => w.length > 0).length;
      title = result.title || topicTitle;

      console.log(`📝 Attempt ${attempt}: got ${wordCount} words (target: ${totalWords}, min: ${minAcceptableWords})`);

      if (wordCount >= minAcceptableWords) break;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`⚠️ Script too short (${wordCount}/${totalWords}), retrying...`);
      }
    }

    if (wordCount < minAcceptableWords) {
      console.warn(`⚠️ Final script still short: ${wordCount}/${totalWords} words after ${MAX_ATTEMPTS} attempts`);
    }

    const estimatedDuration = Math.round(wordCount / (wpm / 60));

    console.log(`✅ Got script: ${wordCount} words, ~${estimatedDuration}s, title: "${title}"`);

    // Replace old scripts
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    await Promise.all(oldScripts.map(s => base44.asServiceRole.entities.Scripts.delete(s.id).catch(() => {})));

    const newScript = await base44.asServiceRole.entities.Scripts.create({
      project_id,
      version: 'final_aggregated',
      title,
      full_script: fullScript,
      word_count: wordCount,
      estimated_duration_sec: estimatedDuration,
    });

    base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'script_complete',
      current_step: 3,
      script_id: newScript.id,
    }).catch(e => console.error('Project update failed:', e.message));

    return Response.json({ success: true, title, word_count: wordCount, niche: nicheId, estimated_duration_sec: estimatedDuration });

  } catch (error) {
    console.error('❌ longViralGenerateScript error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});