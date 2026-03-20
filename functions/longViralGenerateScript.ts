import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// LONG VIRAL SCRIPT GENERATION ENGINE — BATCHED
// Splits script into 2-4 batches (~700-900 words each) for reliable
// word count delivery. Same approach as the standard pipeline.
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
      max_tokens: 8192,
      temperature,
      messages: [
        { role: "user", content: prompt }
      ],
    }),
  });
  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude ${response.status}: ${errBody.substring(0, 300)}`);
  }
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ══════════════════════════════════════════════════════════════════
// BATCH DEFINITIONS PER NICHE
// Each niche has its own section breakdown with word % allocations.
// ══════════════════════════════════════════════════════════════════

function getBatches(nicheId, topicTitle, durationMin, totalWords) {
  const NICHE_BATCHES = {
    finance: [
      { id: 'hook_tension', label: 'Hook + Tension/Problem', pct: 0.20,
        sections: '[HOOK] + [TENSION / PROBLEM]',
        direction: `Open with a pattern interrupt — shocking stat or counterintuitive claim about "${topicTitle}". Make the viewer feel they're losing money by NOT watching. Then deep-dive into the pain point with multiple stats, examples, and "you" language. Build urgency for why they need what comes next.` },
      { id: 'pivot_rule1', label: 'Pivot + Rule #1', pct: 0.25,
        sections: '[PIVOT / REVEAL] + [VALUE DELIVERY — RULE #1]',
        direction: `Single powerful pivot moment that flips the script ("But here's what the top 1% figured out..."). Then Rule #1: The foundation. Deep explanation with 2-3 real examples, specific numbers, math breakdowns. Go DEEP — this is not a summary.` },
      { id: 'rule2_rule3', label: 'Rule #2 + Rule #3', pct: 0.35,
        sections: '[VALUE DELIVERY — RULE #2] + [VALUE DELIVERY — RULE #3]',
        direction: `Rule #2: The multiplier. Extended case study or story with real data. Rule #3: The secret. Counterintuitive insight with proof. Each rule gets stories, examples, specific numbers. This is the MEAT — make each rule feel like its own mini-video.` },
      { id: 'transform_cta', label: 'Transformation + CTA', pct: 0.20,
        sections: '[TRANSFORMATION] + [CTA]',
        direction: `Show the compound effect of following all 3 rules. Before/after with specific numbers over 5, 10, 20 year horizons. Then callback to hook, "save this" trigger, tease next video, engagement question.` },
    ],
    book: [
      { id: 'hook_context', label: 'Hook + Book Context', pct: 0.20,
        sections: '[HOOK] + [BOOK CONTEXT]',
        direction: `Lead with the RESULT, not the book title. Then establish author credibility, why this book matters NOW, and the core problem it solves. Make the viewer feel they need this knowledge.` },
      { id: 'lesson1', label: 'Lesson 1', pct: 0.25,
        sections: '[LESSON 1]',
        direction: `The fundamental concept from "${topicTitle}". Detailed real examples from the book, practical how-to-apply, specific stories the author tells. Go DEEP — use the author's own anecdotes and frameworks.` },
      { id: 'lesson2_3', label: 'Lesson 2 + Lesson 3', pct: 0.35,
        sections: '[LESSON 2] + [LESSON 3]',
        direction: `Lesson 2: Practical application with case studies and actionable steps. Lesson 3: Counterintuitive insight with real-world proof and personal reflection. Each lesson should feel worth the book price alone.` },
      { id: 'transform_cta', label: 'Transformation + CTA', pct: 0.20,
        sections: '[TRANSFORMATION] + [CTA]',
        direction: `Synthesize all 3 lessons into one powerful insight that changes how the viewer sees the world. Save this, tease next book, deep reflection question.` },
    ],
    crime_story: [
      { id: 'cold_setup', label: 'Cold Open + Setup', pct: 0.20,
        sections: '[COLD OPEN] + [THE SETUP]',
        direction: `Drop INTO the crime — most shocking detail first, present tense. Then show victim/criminal as normal person. Build empathy. First sign of trouble. Use specific dates, locations.` },
      { id: 'escalation_1', label: 'Escalation Part 1', pct: 0.30,
        sections: '[THE ESCALATION — PART 1]',
        direction: `First 2 beats of the crime unfolding. Each beat reveals something worse. Use timestamps. Include a near-miss. Pure STORYTELLING in present tense. Specific details — names, places, amounts.` },
      { id: 'escalation_2', label: 'Escalation Part 2', pct: 0.30,
        sections: '[THE ESCALATION — PART 2]',
        direction: `Next 2+ beats. Jaw-drop moments. The investigation deepens, new evidence surfaces, the case takes unexpected turns. Maintain present tense. Build toward the twist.` },
      { id: 'twist_cta', label: 'Twist + CTA', pct: 0.20,
        sections: '[THE TWIST] + [CTA / CLIFFHANGER]',
        direction: `The payoff — must SURPRISE. Reframe everything heard so far. Then moral question, save trigger, tease Part 2 if applicable.` },
    ],
    tech_explainer: [
      { id: 'hook_context', label: 'WTF Hook + Context Bomb', pct: 0.22,
        sections: '[WTF HOOK] + [CONTEXT BOMB]',
        direction: `Make "${topicTitle}" feel urgent and personal — consequence or absurdity. Then origin story, scale/impact numbers, "this thing you take for granted is insane." Use analogies.` },
      { id: 'step1_2', label: 'Step 1 + Step 2', pct: 0.33,
        sections: '[STEP 1] + [STEP 2]',
        direction: `Step 1: Foundation concept with killer analogy and visual explanation. Step 2: The clever innovation with deep analogy and implications. Make complex concepts simple and fascinating.` },
      { id: 'step3_sowhat', label: 'Step 3 + So What', pct: 0.28,
        sections: '[STEP 3] + [SO WHAT]',
        direction: `Step 3: The mind-blowing scale part with real numbers. So What: Real-world examples of how this affects the viewer + future predictions. Land the "why should I care."` },
      { id: 'cta', label: 'CTA', pct: 0.17,
        sections: '[CTA]',
        direction: `Callback to hook, save this, tease next topic, "which step blew your mind?" Make it feel like a complete journey.` },
    ],
    side_hustle: [
      { id: 'proof_myth', label: 'Proof Hook + Myth Kill', pct: 0.18,
        sections: '[PROOF HOOK] + [MYTH KILL]',
        direction: `Result first — specific dollar amount + timeframe + constraint for "${topicTitle}". Then destroy every objection: "You don't need X, Y, or Z." Be specific and credible.` },
      { id: 'step1', label: 'Step 1: The Setup', pct: 0.25,
        sections: '[STEP 1: THE SETUP]',
        direction: `Exactly what to sign up for, create, find. Name specific tools and platforms. Screen walkthrough level detail. Make it so clear anyone could do it tonight.` },
      { id: 'step2_3', label: 'Step 2 + Step 3', pct: 0.35,
        sections: '[STEP 2: THE WORK] + [STEP 3: THE SCALE]',
        direction: `Step 2: The actual activity — outreach numbers, real DM templates, specific metrics. Step 3: First dollar → real income. Show the math. Outsourcing. Monthly packages. Scaling roadmap.` },
      { id: 'proof_cta', label: 'Proof Again + CTA', pct: 0.22,
        sections: '[PROOF AGAIN] + [CTA]',
        direction: `Income growth Month 1 → 3 → 6. One honest "not perfect" moment. Then "Save this. Try Step 1 tonight." Tease next method.` },
    ],
  };

  const batches = NICHE_BATCHES[nicheId] || [
    { id: 'hook_setup', label: 'Hook + Setup', pct: 0.25, sections: '[HOOK] + [SETUP]', direction: `Open strong for "${topicTitle}". Hook the viewer, establish the topic and stakes.` },
    { id: 'body_1', label: 'Main Body Part 1', pct: 0.30, sections: '[BODY PART 1]', direction: `First half of the core content. Deep examples, stories, data.` },
    { id: 'body_2', label: 'Main Body Part 2', pct: 0.25, sections: '[BODY PART 2]', direction: `Second half of core content. Counterintuitive insights, more proof.` },
    { id: 'close', label: 'Transformation + CTA', pct: 0.20, sections: '[TRANSFORMATION] + [CTA]', direction: `Payoff, transformation, and call to action.` },
  ];

  return batches.map(b => ({
    ...b,
    targetWords: Math.round(totalWords * b.pct),
  }));
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
    const batches = getBatches(nicheId, topicTitle, durationMin, totalWords);

    console.log(`📋 ${batches.length} batches planned for ${durationMin}min (${totalWords}w target, niche: ${nicheId})`);
    batches.forEach((b, i) => console.log(`   Batch ${i+1}: ${b.label} — ~${b.targetWords}w`));

    // ── Generate each batch sequentially, passing prior content as context ──
    const batchContents = [];
    let runningWordCount = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const isFirst = i === 0;
      const isLast = i === batches.length - 1;

      // Build context from previous batches
      let priorContext = '';
      if (batchContents.length > 0) {
        // Show last batch in full, earlier batches summarized
        const lastContent = batchContents[batchContents.length - 1];
        if (batchContents.length > 1) {
          const earlierSummary = batchContents.slice(0, -1).map((c, idx) =>
            `[Batch ${idx+1}: ${batches[idx].label} — ${c.split(/\s+/).length} words written]`
          ).join('\n');
          priorContext = `PREVIOUSLY WRITTEN BATCHES (summary):\n${earlierSummary}\n\nMOST RECENT BATCH (continue from here — maintain same voice, tone, and flow):\n---\n${lastContent.substring(lastContent.length - 1500)}\n---`;
        } else {
          priorContext = `PREVIOUSLY WRITTEN (continue from here — maintain same voice, tone, and flow):\n---\n${lastContent.substring(lastContent.length - 2000)}\n---`;
        }
      }

      const wordsRemaining = totalWords - runningWordCount;
      const batchTarget = isLast ? Math.max(batch.targetWords, wordsRemaining) : batch.targetWords;

      const prompt = `You are a top-tier YouTube scriptwriter. You are writing batch ${i+1} of ${batches.length} for a ${durationMin}-minute ${nicheId} video.

TOPIC: "${topicTitle}"
FULL VIDEO: ${durationMin} minutes, ${totalWords} total words across ${batches.length} batches.

THIS BATCH: ${batch.label}
SECTIONS TO WRITE: ${batch.sections}
TARGET WORD COUNT FOR THIS BATCH: ${batchTarget} words (MINIMUM ${Math.round(batchTarget * 0.9)} words)

${batch.direction}

${priorContext ? priorContext : 'This is the OPENING batch. Start strong.'}

${isLast ? `⚠️ This is the FINAL batch. You must write at least ${batchTarget} words to reach our total target. Wrap up the video with a satisfying conclusion and CTA. Do NOT rush or summarize — give the closing the same depth as the body.` : ''}

CRITICAL RULES:
- Write EXACTLY the sections listed above. Do NOT write sections from other batches.
- You MUST write at least ${Math.round(batchTarget * 0.9)} words. If you find yourself finishing early, ADD MORE: more examples, more stories, more specific numbers, more depth.
- Write in a conversational, engaging YouTube narration style.
- Include specific numbers, names, dates, and data points.
- NO filler or fluff — every sentence must deliver value or build tension.
- Do NOT include section markers like [HOOK] or [SECTION] in the output.
- Write ONLY the raw narration script text. No JSON, no markdown, no meta-commentary.
- Continue seamlessly from the previous batch (if any) — same voice, same energy.`;

      console.log(`🎬 Batch ${i+1}/${batches.length}: "${batch.label}" (~${batchTarget}w target)...`);

      let batchText = '';
      let batchWords = 0;
      const minBatchWords = Math.round(batchTarget * 0.75);

      // Retry loop per batch (max 2 attempts)
      for (let attempt = 1; attempt <= 2; attempt++) {
        let finalPrompt = prompt;
        if (attempt > 1) {
          finalPrompt += `\n\n⚠️ YOUR PREVIOUS ATTEMPT WAS ONLY ${batchWords} WORDS. The minimum is ${batchTarget}. You MUST write MORE. Add more examples, more depth, more stories. ${batchTarget} words MINIMUM.`;
        }

        const raw = await callClaude(finalPrompt, attempt > 1 ? 0.85 : 0.75);
        batchText = raw.replace(/\[.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
        batchWords = batchText.split(/\s+/).filter(w => w.length > 0).length;

        console.log(`   Attempt ${attempt}: ${batchWords} words (target: ${batchTarget}, min: ${minBatchWords})`);

        if (batchWords >= minBatchWords) break;
        if (attempt < 2) console.warn(`   ⚠️ Too short, retrying...`);
      }

      batchContents.push(batchText);
      runningWordCount += batchWords;
      console.log(`   ✅ Batch ${i+1} done: ${batchWords}w | Running total: ${runningWordCount}/${totalWords}`);
    }

    // ── Merge all batches ──
    const fullScript = batchContents.join('\n\n');
    const finalWordCount = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedDuration = Math.round(finalWordCount / (wpm / 60));

    console.log(`✅ FINAL: ${finalWordCount} words (target: ${totalWords}), ~${Math.round(estimatedDuration/60)}min`);

    // Replace old scripts
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    await Promise.all(oldScripts.map(s => base44.asServiceRole.entities.Scripts.delete(s.id).catch(() => {})));

    const newScript = await base44.asServiceRole.entities.Scripts.create({
      project_id,
      version: 'final_aggregated',
      title: topicTitle,
      full_script: fullScript,
      word_count: finalWordCount,
      estimated_duration_sec: estimatedDuration,
    });

    base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'script_complete',
      current_step: 3,
      script_id: newScript.id,
    }).catch(e => console.error('Project update failed:', e.message));

    return Response.json({
      success: true,
      title: topicTitle,
      word_count: finalWordCount,
      niche: nicheId,
      estimated_duration_sec: estimatedDuration,
      batches: batches.length,
      batch_words: batchContents.map(b => b.split(/\s+/).filter(w => w.length > 0).length),
    });

  } catch (error) {
    console.error('❌ longViralGenerateScript error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});