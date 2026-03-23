import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

// ══════════════════════════════════════════════════════════════════
// SHORTS SCRIPT GENERATION ENGINE v4
// 5 niche-specific storytelling structures for 90-second YouTube Shorts
// Crime Story | Tech Explainer | Side Hustle | Finance | Book Summary
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.75) {
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

// ══════════════════════════════════════════════════════════════
// STRUCTURE A: CRIME STORY / TRUE CRIME / MYSTERY
// Highest retention format. Fight-or-flight.
// COLD OPEN → SETUP → ESCALATION → TWIST → AFTERMATH → CTA
// ══════════════════════════════════════════════════════════════

const CRIME_STORY_PROMPT = (topicTitle) => `You are a YouTube Shorts scriptwriter specializing in TRUE CRIME / MYSTERY storytelling.
Write a gripping 90-second crime story script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:

[COLD OPEN] (0:00-0:05, 12-18 words)
- Drop the viewer INTO the crime mid-action. Most shocking detail first.
- Use present tense: "A woman walks into a bank..." / "He stole $400 million..."
- Include a SPECIFIC detail that makes it REAL (date, city, dollar amount).
- NEVER start with "Today we're going to talk about..." or ANY preamble. 
- This must feel like opening a movie 30 minutes in.
Examples:
- "On March 15th, 2019, a package arrived at a house in Detroit. Inside was $2.3 million. And a severed finger."
- "She called 911 at 3:47 AM. But the person she was running from was already inside the house."
- "He stole $400 million and nobody noticed for 12 years. Here's how."

[SETUP] (0:05-0:20, 35-45 words)
- Introduce the victim OR criminal as a NORMAL person first.
- 1-2 sentences of normalcy: job, family, routine, where they lived.
- Include one detail that makes them relatable/sympathetic.
- Then: the FIRST sign something is wrong.
- This is the "calm before the storm" — the more normal, the more shocking the crime feels.

[ESCALATION] (0:20-0:55, 85-100 words)
- The crime unfolds. Rapid-fire facts — each sentence reveals something new and WORSE.
- Use timestamps ("By March, he had stolen $50K. By June, $400K.")
- Build with "but it gets worse" or "and then they discovered..."
- Include at least ONE moment where the criminal almost got caught but didn't.
- Structure within escalation:
  - Beat 1 (0:20-0:30): The crime begins — first incident, first theft, first lie
  - Beat 2 (0:30-0:40): It gets worse — pattern emerges, stakes rise, more victims
  - Beat 3 (0:40-0:50): The near-miss — almost caught, but escapes or doubles down
  - Beat 4 (0:50-0:55): The peak — the worst moment, the biggest revelation
- The viewer's jaw should drop at least twice.

[TWIST / RESOLUTION] (0:55-1:10, 35-40 words)
- The payoff. How did it end? Was there justice?
- The ending must SURPRISE — if it's predictable, the whole video fails.
- Best twists: criminal was someone unexpected, victim fought back, crime is still unsolved, or punishment was wild.
- One strong final image that burns into memory.

[CTA / CLIFFHANGER] (1:10-1:25, 30-35 words)
- Ask a moral question ("Would you have turned him in?")
- Use "save this" language.
- Tease next story: "Part 2 drops Friday" or "next week's story is worse. Much worse."
- End with an unresolved question to drive comments.

CRITICAL RULES:
- 200-240 words MAX total. ~2.7 words/sec.
- Voice tone: low, measured, almost whispering — true crime podcast energy.
- Use SPECIFIC numbers, dates, and locations throughout.
- Every sentence must make the viewer NEED to know what happens next.
- This is pure STORYTELLING. Present tense for immediacy.
- Do NOT use "Rule #1, Rule #2" or ANY listicle/educational format.
- Do NOT use "Step 1, Step 2" — this is a NARRATIVE arc, not instructions.
- NO "today we'll cover" / NO intro / NO preamble.

Return JSON: {"title":"string under 60 chars","script":"full script text with section markers","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// STRUCTURE B: TECH EXPLAINER / "HOW X WORKS" / "WHY X EXISTS"
// Fireship-style rapid explainers. High RPM.
// WTF HOOK → CONTEXT BOMB → THE MECHANIC (3 steps) → SO WHAT → CTA
// ══════════════════════════════════════════════════════════════

const TECH_EXPLAINER_PROMPT = (topicTitle) => `You are a YouTube Shorts scriptwriter in the style of Fireship — rapid, witty, slightly amused tech explainers.
Write a 90-second tech explainer script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:

[WTF HOOK] (0:00-0:05, 12-18 words)
- Make a technical concept feel URGENT and PERSONAL.
- Lead with the CONSEQUENCE or the ABSURDITY, not the technology name.
- Make it sound broken, dangerous, or insane.
- Use "you" or imply the viewer is directly affected.
- Exaggeration is fine if directionally true.
Examples:
- "Your phone listens to 40,000 commands per second and you've never noticed."
- "The entire internet runs on a protocol invented by a college student in 1991. It was supposed to be temporary."
- "AI can now clone your voice in 3 seconds. And there's no law against it."

[CONTEXT BOMB] (0:05-0:20, 35-45 words)
- Origin story in 1-2 sentences (who made it, when, why).
- One surprising fact about its scale or impact (use a BIG number).
- Frame as: "this thing you take for granted is actually insane."
- Avoid jargon — if you must use a technical term, define it instantly.
- This section earns CREDIBILITY — be accurate.

[THE MECHANIC — "HOW IT ACTUALLY WORKS"] (0:20-0:55, 85-100 words)
- Break the technology into exactly 3 STEPS or 3 LAYERS.
- Label: "Step one..." "Step two: here's where it gets clever..." "Step three: and here's the insane part..."
- Each step: 1 sentence what it does + 1 sentence analogy/example.
- Use ANALOGIES religiously — "think of it like a librarian..." / "like sending a puzzle in 50 envelopes..."
- Step 1: simplest concept (foundation)
- Step 2: the clever part (the innovation)
- Step 3: the mind-blowing part (works at scale)
- Make a 5-year-old understand using these analogies.

[REAL-WORLD PROOF / "SO WHAT"] (0:55-1:10, 35-40 words)
- Connect the mechanic to something the viewer USES or CARES about.
- "This is why your Netflix loads in 2 seconds" / "That's why your WiFi slows down when..."
- 1-2 real-world examples.
- Include a forward-looking prediction or implication.

[CTA] (1:10-1:25, 30-35 words)
- "Save this" language.
- Tease next related tech topic.
- Ask "Which step blew your mind?" or similar engagement question.

CRITICAL RULES:
- 200-240 words MAX. ~2.7 words/sec.
- Voice tone: fast, confident, slightly amused — Fireship energy. "Let me tell you something wild."
- Use specific numbers and scale comparisons throughout.
- Make complex things simple using analogies.
- This is NOT a listicle with "Rule #1". It's a 3-step technical deep-dive made fun.
- NO "today we'll cover" / NO intro / NO preamble.

Return JSON: {"title":"string under 60 chars","script":"full script text with section markers","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// STRUCTURE C: SIDE HUSTLE / HOW-TO / MONEY METHOD
// Highest RPM format ($15-$40). Actionable steps.
// PROOF HOOK → MYTH KILL → THE METHOD (3 steps) → PROOF AGAIN → CTA
// ══════════════════════════════════════════════════════════════

const SIDE_HUSTLE_PROMPT = (topicTitle) => `You are a YouTube Shorts scriptwriter specializing in side hustle / money-making methods.
Write a 90-second actionable side hustle script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:

[PROOF HOOK] (0:00-0:05, 12-18 words)
- Show the RESULT first. Specific dollar amount + timeframe.
- Include a constraint that makes it relatable ("with no experience", "in 2 hours a day", "from my phone").
- NEVER: "I'm going to show you how to..."
- ALWAYS: "I made $X doing Y in Z time"
- The number must be SPECIFIC — $4,327 beats "thousands of dollars."
Examples:
- "I made $4,327 last month with a side hustle that takes 2 hours a day. No experience. No startup cost. Here's exactly how."
- "$11,000 in 30 days. No followers. No product. No skills. Just this one method."

[MYTH KILL] (0:05-0:15, 25-30 words)
- Destroy the viewer's excuses BEFORE they think them.
- Address the #1 objection directly ("You don't need followers").
- Contrast with what they've been told ("Forget dropshipping...").
- Position as DIFFERENT from what they've tried.
- Use "You don't need X, Y, or Z" structure.

[THE METHOD — 3 STEPS] (0:15-1:00, 110-130 words)
- Exactly 3 steps — labeled "Step 1, Step 2, Step 3"
- Step 1: THE SETUP — what to sign up for / what to create / what to find.
  ~15 seconds. Name SPECIFIC tools or platforms.
- Step 2: THE WORK — the actual activity that generates money.
  ~15 seconds. Include specific outreach numbers or metrics.
- Step 3: THE SCALE — how to go from first dollar to real income.
  ~15 seconds. Show the math of scaling.
- Each step MUST name SPECIFIC tools, platforms, or actions.
- Include a specific number in each step (dollar amount, time, quantity).
- Vague advice = instant swipe. "Sign up for Fiverr" beats "find clients."
- Every step must be DOABLE TONIGHT.

[PROOF AGAIN / REAL NUMBERS] (1:00-1:10, 25-30 words)
- Loop back to proof. Specific income + timeframe.
- Include one "it's not perfect" moment for credibility ("first month was only $200").
- Show the growth trajectory: Month 1 → Month 3 → Month 6.

[CTA] (1:10-1:25, 30-35 words)
- "Save this" is CRITICAL — side hustle content gets saved more than any other niche.
- "Try Step 1 tonight" — immediacy.
- Tease next method with a specific dollar amount.
- Ask "Which step are you starting with?"
- NEVER "like and subscribe" — ALWAYS "save this and try Step 1 tonight."

CRITICAL RULES:
- 200-240 words MAX. ~2.7 words/sec.
- Voice tone: casual, direct, calm confidence — NOT hype-bro energy.
- Use specific dollar amounts, platform names, and timeframes throughout.
- Every step must be DOABLE TONIGHT — not "build a brand over 6 months."
- Use "Step 1, Step 2, Step 3" — NOT "Rule #1, Rule #2".
- NO "today we'll cover" / NO intro / NO preamble.

Return JSON: {"title":"string under 60 chars","script":"full script text with section markers","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// STRUCTURE D: FINANCE / WEALTH — PAIN → RULES → TRANSFORMATION
// HOOK → TENSION → PIVOT → VALUE (3 RULES) → TRANSFORMATION → CTA
// ══════════════════════════════════════════════════════════════

const FINANCE_PROMPT = (topicTitle) => `You are a YouTube Shorts scriptwriter specializing in finance and wealth content.
Write a 90-second finance script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:

[HOOK] (0:00-0:05, 12-18 words)
- Pattern interrupt. Number or contradiction or "you" statement.
- Lead with a SHOCKING financial fact or counterintuitive claim.
- Make the viewer feel like they're losing money by NOT watching.
Examples:
- "You're losing $300 a month and you don't even know it. Here's the math."
- "A 25-year-old who invests $200/month will retire with $1.2 million. A 35-year-old needs $800/month. That 10-year gap costs you $600,000."

[TENSION] (0:05-0:20, 35-45 words)
- Use "you" language throughout. Make it personal.
- Include a specific stat that creates urgency.
- Describe the PROBLEM or the financial trap most people fall into.
- Build the pain: "most people do X, and it's costing them Y."
- This makes the viewer NEED the solution.

[PIVOT] (0:20-0:25, 10-15 words)
- Single sentence reversal. The secret unlocked.
- "But here's what nobody tells you..." / "There are 3 rules that change everything."
- This is the hinge — everything before was the problem, everything after is the solution.

[VALUE — 3 RULES] (0:25-0:55, 75-90 words)
- Exactly 3 rules. Label: "Rule number one... Rule number two... Rule number three..."
- Each rule: setup + proof. Include specific numbers.
- Rule 1: The foundation (the most important habit or principle)
- Rule 2: The multiplier (the strategy that accelerates wealth)
- Rule 3: The secret (the counterintuitive move most people miss)
- Each rule must feel actionable and specific.

[TRANSFORMATION] (0:55-1:10, 30-35 words)
- Show the before/after. What life looks like following these rules.
- Use specific numbers: "In 5 years, that's $X" / "By 40, you'll have..."
- Make the viewer SEE their future self.

[CTA] (1:10-1:25, 30-35 words)
- Callback to the hook stat.
- "Save this" language.
- Tease next finance topic.
- Ask "Which rule are you starting with?" to drive comments.
- NEVER "like and subscribe."

CRITICAL RULES:
- 200-240 words MAX. ~2.7 words/sec.
- Require at least 4 specific numbers throughout the script.
- Voice tone: authoritative but accessible, like a smart friend explaining money.
- NO fluff. Every sentence must deliver value or create urgency.
- NO "today we'll cover" / NO intro / NO preamble.

Return JSON: {"title":"string under 60 chars","script":"full script text with section markers","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// STRUCTURE E: BOOK SUMMARY
// HOOK → CONTEXT → 3 KEY LESSONS → TRANSFORMATION → CTA
// ══════════════════════════════════════════════════════════════

const BOOK_SUMMARY_PROMPT = (topicTitle) => `You are a YouTube Shorts scriptwriter specializing in book summaries and key takeaways.
Write a 90-second book summary script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:

[HOOK] (0:00-0:05, 12-18 words)
- Lead with the RESULT or the most provocative idea from the book, NOT the book title.
- The book title comes SECOND, after the hook.
- Make the viewer NEED to hear the lessons.
Examples:
- "The richest people in the world all follow the same 3 rules. They're all in one book."
- "This book predicted the 2008 financial crisis, COVID's economic impact, and the AI revolution. Here's what it says happens next."
- "One book. Three lessons. They completely rewired how I think about money."

[BOOK CONTEXT] (0:05-0:15, 20-30 words)
- Book title + author in 1 sentence.
- Author's credibility: why should anyone listen? (credentials, track record, who recommends it)
- The core problem the book solves in 1 sentence.

[3 KEY LESSONS] (0:15-0:55, 90-110 words)
- Exactly 3 lessons. Label: "Lesson one... Lesson two... Lesson three..."
- Each lesson: ~15 seconds.
- Structure per lesson: The concept → A concrete example or analogy.
- Lesson 1: The most fundamental idea (the paradigm shift)
- Lesson 2: The practical application (the actionable takeaway)
- Lesson 3: The counterintuitive insight (the mind-blowing reframe)
- Use the author's own stories or examples when possible.
- Make each lesson feel like it's worth the price of the book alone.

[TRANSFORMATION / SYNTHESIS] (0:55-1:10, 25-35 words)
- One powerful sentence that synthesizes all 3 lessons into a single insight.
- Show how the book changes behavior: "After reading this, you'll never look at X the same way."
- Include a quote from the book if there's a powerful one.

[CTA] (1:10-1:25, 30-35 words)
- "Save this" + recommend sharing ("share with someone who needs to hear this").
- Tease next book summary.
- Ask a reflection question: "Which lesson hit hardest?" / "Have you read this one?"

CRITICAL RULES:
- 200-240 words MAX. ~2.7 words/sec.
- Voice tone: thoughtful, slightly awed — like recommending a life-changing book to a friend.
- Use the author's own stories/examples for maximum impact.
- Do NOT just list chapter summaries — extract the ESSENCE.
- NO "today we'll cover" / NO intro / NO preamble.

Return JSON: {"title":"string under 60 chars","script":"full script text with section markers","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// NICHE → PROMPT MAPPING
// ══════════════════════════════════════════════════════════════

const NICHE_PROMPTS = {
  crime_story: CRIME_STORY_PROMPT,
  tech_explainer: TECH_EXPLAINER_PROMPT,
  side_hustle: SIDE_HUSTLE_PROMPT,
  finance: FINANCE_PROMPT,
  book: BOOK_SUMMARY_PROMPT,
};

// Default fallback for unknown niches
const DEFAULT_PROMPT = (topicTitle, niche) => `You are a YouTube Shorts scriptwriter. Write a compelling 90-second script for: "${topicTitle}"

The content niche is: ${niche}

RULES:
- 200-240 words MAX. ~2.7 words/sec.
- HOOK in first 15 words. NO preamble. Stop the scroll immediately.
- Use a storytelling or instructional structure appropriate for "${niche}" content.
- 3-part value core in the middle section.
- End with CTA including "save this" and a question to drive comments.
- Include specific numbers, dates, or facts throughout.
- Make it punchy, not educational/dry.
- Do NOT use generic "Rule #1, Rule #2" unless the niche specifically calls for it.

Return JSON: {"title":"string under 60 chars","script":"full formatted script","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// REQUEST HANDLER
// ══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    console.log(`📱 shortsGenerateScript v4: project=${project_id}`);

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

    console.log(`✅ Got script: ${wordCount} words, title: "${title}" (niche: ${shortsNiche})`);

    // Delete old scripts then create new one
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    await Promise.all(oldScripts.map(s => base44.asServiceRole.entities.Scripts.delete(s.id).catch(() => {})));

    const newScript = await base44.asServiceRole.entities.Scripts.create({
      project_id,
      version: 'final_aggregated',
      title,
      full_script: fullScript,
      word_count: wordCount,
      estimated_duration_sec: 90,
    });

    // Fire project update without awaiting — saves CPU time
    base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'script_complete',
      current_step: 3,
      script_id: newScript.id,
    }).catch(e => console.error('Project update failed:', e.message));

    console.log(`✅ Script saved (niche: ${shortsNiche})`);
    return Response.json({ success: true, title, word_count: wordCount, niche: shortsNiche });

  } catch (error) {
    console.error('❌ shortsGenerateScript error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});