import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// SHORTS SCRIPT GENERATION ENGINE v3
// Generates a 200-240 word, 90-second YouTube Shorts script.
// Now supports multiple niche-specific storytelling structures.
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
        generationConfig: { temperature, maxOutputTokens: 3000, responseMimeType: "application/json" },
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

// ── NICHE-SPECIFIC PROMPT TEMPLATES ──

const NICHE_PROMPTS = {
  crime_story: (topicTitle) => `You are a YouTube Shorts scriptwriter specializing in TRUE CRIME storytelling.
Write a gripping 90-second crime story script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:
[COLD OPEN] (0:00-0:05, 12-18 words)
- Drop the viewer INTO the crime. Most shocking detail first.
- Use present tense. Include a specific detail (date, city, dollar amount).
- NEVER start with "Today we're going to talk about..."
- This should feel like opening a movie 30 minutes in.

[SETUP] (0:05-0:20, 35-45 words)
- Introduce the victim OR criminal as a NORMAL person first.
- 1-2 sentences of normalcy: job, family, routine.
- Then: the FIRST sign something is wrong.
- This is "calm before the storm."

[ESCALATION] (0:20-0:55, 85-100 words)
- The crime unfolds. Rapid-fire facts — each sentence reveals something new and worse.
- Use timestamps ("By March, he had stolen $50K. By June, $400K.")
- Include at least ONE moment where the criminal almost got caught but didn't.
- Build with "but it gets worse" escalation.
- The viewer's jaw should drop at least twice.

[TWIST] (0:55-1:10, 35-40 words)
- The payoff/resolution. The ending must SURPRISE.
- Best twists: criminal was someone unexpected, victim fought back, still unsolved, or wild punishment.
- One strong final image that burns into memory.

[CTA] (1:10-1:25, 30-35 words)
- Ask a moral question ("Would you have turned him in?")
- Use "save this" language.
- Tease next story with "Part 2" or "next week's story is worse."
- End with unresolved question to drive comments.

RULES:
- 200-240 words MAX total. ~2.7 words/sec.
- Voice tone: low, measured, true crime podcast energy.
- Use SPECIFIC numbers, dates, and locations throughout.
- Every sentence should make the viewer NEED to know what happens next.
- NO educational tone. This is STORYTELLING. Present tense for immediacy.
- Do NOT use "Rule #1, Rule #2" structure — this is a NARRATIVE, not a listicle.

Return JSON: {"title":"string under 60 chars","script":"full formatted script with section headers","word_count":number}`,

  tech_explainer: (topicTitle) => `You are a YouTube Shorts scriptwriter in the style of Fireship — rapid, witty tech explainers.
Write a 90-second tech explainer script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:
[WTF HOOK] (0:00-0:05, 12-18 words)
- Make the technical concept feel URGENT and PERSONAL.
- Lead with the CONSEQUENCE or the ABSURDITY, not the technology name.
- Make it sound broken, dangerous, or insane.
- Use "you" or imply the viewer is affected.

[CONTEXT BOMB] (0:05-0:20, 35-45 words)
- Origin story in 1-2 sentences (who made it, when, why).
- One surprising fact about its scale/impact (a big number).
- Frame as: "this thing you take for granted is actually insane."
- Avoid jargon — if you must use a technical term, define it instantly.

[THE MECHANIC] (0:20-0:55, 85-100 words)
- Break the technology into exactly 3 STEPS or 3 LAYERS.
- Label them "Step 1... Step 2... Step 3..." 
- Each step: 1 sentence what it does + 1 sentence analogy/example.
- Use ANALOGIES religiously — "think of it like a librarian..."
- Step 1: simplest concept (foundation)
- Step 2: the clever part (innovation)
- Step 3: the mind-blowing part (works at scale)

[SO WHAT] (0:55-1:10, 35-40 words)
- Connect to something the viewer USES or CARES about.
- 1-2 real-world examples ("This is why your Netflix loads in 2 seconds").
- Include a forward-looking prediction.

[CTA] (1:10-1:25, 30-35 words)
- "Save this" language.
- Tease next related tech topic.
- Ask "Which step blew your mind?"

RULES:
- 200-240 words MAX. ~2.7 words/sec.
- Voice tone: fast, confident, slightly amused — Fireship energy.
- Use specific numbers and comparisons throughout.
- Make complex things simple using analogies a 5-year-old would get.
- This is NOT a crime story or finance video. It's a tech deep-dive made fun.

Return JSON: {"title":"string under 60 chars","script":"full formatted script with section headers","word_count":number}`,

  side_hustle: (topicTitle) => `You are a YouTube Shorts scriptwriter specializing in side hustle / money-making methods.
Write a 90-second actionable side hustle script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:
[PROOF HOOK] (0:00-0:05, 12-18 words)
- Show the RESULT first. Specific dollar amount + timeframe.
- Include a constraint ("no experience", "2 hours a day", "from my phone").
- NEVER: "I'm going to show you how to..."
- ALWAYS: "I made $X doing Y in Z time"
- The number must be SPECIFIC — $4,327 beats "thousands of dollars."

[MYTH KILL] (0:05-0:15, 25-30 words)
- Destroy the viewer's excuses BEFORE they think them.
- Address #1 objection directly ("You don't need followers").
- Position as something DIFFERENT from dropshipping/crypto/courses.
- Use "You don't need X, Y, or Z" structure.

[THE METHOD — 3 STEPS] (0:15-1:00, 110-130 words)
- Exactly 3 steps — labeled "Step 1, Step 2, Step 3"
- Step 1: THE SETUP (what to sign up for / what to create)
- Step 2: THE WORK (the actual activity that generates money)  
- Step 3: THE SCALE (how to go from first dollar to real income)
- Each step MUST name SPECIFIC tools, platforms, or actions.
- Include a specific number in each step (dollar amount, time, quantity).
- Vague advice = instant swipe. "Sign up for Fiverr" beats "find clients."

[PROOF AGAIN] (1:00-1:10, 25-30 words)
- Loop back to proof. Specific income + timeframe.
- Include one "it's not perfect" moment for credibility (first month was only $200).

[CTA] (1:10-1:25, 30-35 words)
- "Save this" is CRITICAL.
- "Try Step 1 tonight" — immediacy.
- Tease next method with a specific dollar amount.
- Ask "Which step are you starting with?"

RULES:
- 200-240 words MAX. ~2.7 words/sec.
- Voice tone: casual, direct, calm confidence — NOT hype-bro energy.
- Use specific dollar amounts, platform names, and timeframes.
- Every step must be DOABLE TONIGHT — not "build a brand over 6 months."
- Do NOT use "Rule #1" format — use "Step 1, Step 2, Step 3."

Return JSON: {"title":"string under 60 chars","script":"full formatted script with section headers","word_count":number}`,

  finance: (topicTitle) => `You are a YouTube Shorts scriptwriter. Write a 90-second script for: "${topicTitle}"

RULES:
- 200-240 words MAX. ~2.7 words/sec.
- HOOK in first 15 words. NO preamble.
- 3-point structure in value section.
- End with CTA including "save this".
- Use [TIMESTAMP SECTION] headers.

NICHE: FINANCE / WEALTH
Structure: HOOK (5s) → TENSION (15s) → PIVOT (5s) → VALUE: 3 RULES (45s) → CTA (15s) → DEAD ZONE (5s)
- Hook: Pattern interrupt. Number/contradiction/'you' statement. NO intro.
- Tension: 'You' language, specific stat, urgency.
- Pivot: Single sentence reversal. Secret unlocked.
- Value: Exactly 3 rules. "Rule #1... #2... #3..." Setup + proof. Numbers required.
- CTA: Callback to hook. "Save this". Tease next video. Question. Never "like and subscribe".
- Require at least 3 specific numbers.

Return JSON: {"title":"string under 60 chars","script":"full formatted script","word_count":number}`,

  book: (topicTitle) => `You are a YouTube Shorts scriptwriter. Write a 90-second script for: "${topicTitle}"

RULES:
- 200-240 words MAX. ~2.7 words/sec.
- HOOK in first 15 words. NO preamble.
- 3-point structure in value section.
- End with CTA including "save this".
- Use [TIMESTAMP SECTION] headers.

NICHE: BOOK SUMMARY
Structure: HOOK (5s) → BOOK CONTEXT (10s) → 3 KEY LESSONS (50s) → TRANSFORMATION (10s) → CTA (10s) → LOOP/END (5s)
- Hook: Lead with the RESULT, not the book title. Book title comes SECOND.
- Context: Author + credibility + core problem.
- Lessons: Exactly 3. Label "Lesson 1, 2, 3". Each ~16s. Concept → Example.
- Transformation: One sentence synthesizing all 3 lessons.
- CTA: "Save this" + tease next book + question.

Return JSON: {"title":"string under 60 chars","script":"full formatted script","word_count":number}`,
};

// Default fallback for unknown niches — uses the topic to infer style
const DEFAULT_PROMPT = (topicTitle, niche) => `You are a YouTube Shorts scriptwriter. Write a compelling 90-second script for: "${topicTitle}"

The content niche is: ${niche}

RULES:
- 200-240 words MAX. ~2.7 words/sec.
- HOOK in first 15 words. NO preamble. Stop the scroll immediately.
- Use a storytelling or instructional structure appropriate for "${niche}" content.
- 3-part value core in the middle section.
- End with CTA including "save this" and a question to drive comments.
- Use [SECTION] headers for each part.
- Include specific numbers, dates, or facts throughout.
- Make it punchy, not educational/dry.

Return JSON: {"title":"string under 60 chars","script":"full formatted script","word_count":number}`;


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

    // Build the niche-specific prompt
    const promptBuilder = NICHE_PROMPTS[shortsNiche];
    const prompt = promptBuilder
      ? promptBuilder(topicTitle)
      : DEFAULT_PROMPT(topicTitle, shortsNiche);

    console.log(`📱 Calling Gemini for "${topicTitle}" (niche: ${shortsNiche})...`);
    const result = await callGemini(prompt, 0.75);

    const rawScript = result.script || '';
    // Strip section headers like [HOOK - 5s], [COLD OPEN], etc.
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

    const newScript = await base44.asServiceRole.entities.Scripts.create({
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
      script_id: newScript.id,
    });

    console.log(`✅ Script saved and project updated`);

    return Response.json({ success: true, title, word_count: wordCount });

  } catch (error) {
    console.error('❌ shortsGenerateScript error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});