import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v3 — migrated from Gemini to Claude

// ══════════════════════════════════════════════════════════════════
// SHORTS SCRIPT GENERATION ENGINE v5
// 5 niche-specific storytelling structures for 90-second YouTube Shorts
// Crime Story | Tech Explainer | Side Hustle | Finance | Book Summary
// ══════════════════════════════════════════════════════════════════

async function callClaude(prompt, temperature = 0.75) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      temperature,
      messages: [{ role: "user", content: prompt + "\n\nRespond with ONLY valid JSON. No markdown, no backticks, no explanation." }]
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Claude error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text;
  if (!rawText) throw new Error("No response from Claude");

  try { return JSON.parse(rawText); } catch (_) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Failed to parse Claude JSON");
  }
}


// ══════════════════════════════════════════════════════════════
// STRUCTURE A: CRIME STORY / TRUE CRIME / MYSTERY
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

[ESCALATION] (0:20-0:55, 85-100 words)
- The crime unfolds. Rapid-fire facts — each sentence reveals something new and WORSE.
- Use timestamps ("By March, he had stolen $50K. By June, $400K.")
- Build with "but it gets worse" or "and then they discovered..."
- Include at least ONE moment where the criminal almost got caught but didn't.
- Structure within escalation:
  - Beat 1 (0:20-0:30): The crime begins
  - Beat 2 (0:30-0:40): It gets worse
  - Beat 3 (0:40-0:50): The near-miss
  - Beat 4 (0:50-0:55): The peak — worst moment, biggest revelation

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
- NO "today we'll cover" / NO intro / NO preamble.

Return JSON: {"title":"string under 60 chars","script":"full script text with section markers","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// STRUCTURE B: TECH EXPLAINER / "HOW X WORKS" / "WHY X EXISTS"
// ══════════════════════════════════════════════════════════════

const TECH_EXPLAINER_PROMPT = (topicTitle) => `You are a YouTube Shorts scriptwriter in the style of Fireship — rapid, witty, slightly amused tech explainers.
Write a 90-second tech explainer script for: "${topicTitle}"

STRUCTURE — follow this EXACTLY:

[WTF HOOK] (0:00-0:05, 12-18 words)
- Make a technical concept feel URGENT and PERSONAL.
- Lead with the CONSEQUENCE or the ABSURDITY, not the technology name.
- Make it sound broken, dangerous, or insane.
- Use "you" or imply the viewer is directly affected.
Examples:
- "Your phone listens to 40,000 commands per second and you've never noticed."
- "The entire internet runs on a protocol invented by a college student in 1991. It was supposed to be temporary."
- "AI can now clone your voice in 3 seconds. And there's no law against it."

[CONTEXT BOMB] (0:05-0:20, 35-45 words)
- Origin story in 1-2 sentences (who made it, when, why).
- One surprising fact about its scale or impact (use a BIG number).
- Frame as: "this thing you take for granted is actually insane."
- Avoid jargon — if you must use a technical term, define it instantly.

[THE MECHANIC — "HOW IT ACTUALLY WORKS"] (0:20-0:55, 85-100 words)
- Break the technology into exactly 3 STEPS or 3 LAYERS.
- Label: "Step one..." "Step two: here's where it gets clever..." "Step three: and here's the insane part..."
- Each step: 1 sentence what it does + 1 sentence analogy/example.
- Use ANALOGIES religiously — "think of it like a librarian..." / "like sending a puzzle in 50 envelopes..."
- Step 1: simplest concept (foundation)
- Step 2: the clever part (the innovation)
- Step 3: the mind-blowing part (works at scale)

[REAL-WORLD PROOF / "SO WHAT"] (0:55-1:10, 35-40 words)
- Connect the mechanic to something the viewer USES or CARES about.
- 1-2 real-world examples.
- Include a forward-looking prediction or implication.

[CTA] (1:10-1:25, 30-35 words)
- "Save this" language.
- Tease next related tech topic.
- Ask "Which step blew your mind?" or similar engagement question.

CRITICAL RULES:
- 200-240 words MAX. ~2.7 words/sec.
- Voice tone: fast, confident, slightly amused — Fireship energy.
- Use specific numbers and scale comparisons throughout.
- Make complex things simple using analogies.
- NO "today we'll cover" / NO intro / NO preamble.

Return JSON: {"title":"string under 60 chars","script":"full script text with section markers","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// STRUCTURE C: SIDE HUSTLE / HOW-TO / MONEY METHOD
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
- Use "You don't need X, Y, or Z" structure.

[THE METHOD — 3 STEPS] (0:15-1:00, 110-130 words)
- Exactly 3 steps — labeled "Step 1, Step 2, Step 3"
- Step 1: THE SETUP — what to sign up for / what to create / what to find. Name SPECIFIC tools or platforms.
- Step 2: THE WORK — the actual activity that generates money. Include specific outreach numbers or metrics.
- Step 3: THE SCALE — how to go from first dollar to real income. Show the math of scaling.
- Each step MUST name SPECIFIC tools, platforms, or actions.
- Include a specific number in each step (dollar amount, time, quantity).
- Every step must be DOABLE TONIGHT.

[PROOF AGAIN / REAL NUMBERS] (1:00-1:10, 25-30 words)
- Loop back to proof. Specific income + timeframe.
- Include one "it's not perfect" moment for credibility ("first month was only $200").
- Show the growth trajectory: Month 1 → Month 3 → Month 6.

[CTA] (1:10-1:25, 30-35 words)
- "Save this" is CRITICAL.
- "Try Step 1 tonight" — immediacy.
- Tease next method with a specific dollar amount.
- Ask "Which step are you starting with?"
- NEVER "like and subscribe."

CRITICAL RULES:
- 200-240 words MAX. ~2.7 words/sec.
- Voice tone: casual, direct, calm confidence — NOT hype-bro energy.
- Use specific dollar amounts, platform names, and timeframes throughout.
- Every step must be DOABLE TONIGHT.
- Use "Step 1, Step 2, Step 3" — NOT "Rule #1, Rule #2".
- NO "today we'll cover" / NO intro / NO preamble.

Return JSON: {"title":"string under 60 chars","script":"full script text with section markers","word_count":number}`;


// ══════════════════════════════════════════════════════════════
// STRUCTURE D: FINANCE / WEALTH
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

[PIVOT] (0:20-0:25, 10-15 words)
- Single sentence reversal. The secret unlocked.
- "But here's what nobody tells you..." / "There are 3 rules that change everything."

[VALUE — 3 RULES] (0:25-0:55, 75-90 words)
- Exactly 3 rules. Label: "Rule number one... Rule number two... Rule number three..."
- Each rule: setup + proof. Include specific numbers.
- Rule 1: The foundation (most important habit or principle)
- Rule 2: The multiplier (strategy that accelerates wealth)
- Rule 3: The secret (counterintuitive move most people miss)

[TRANSFORMATION] (0:55-1:10, 30-35 words)
- Show the before/after with specific numbers: "In 5 years, that's $X" / "By 40, you'll have..."
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

[BOOK CONTEXT] (0:05-0:15, 20-30 words)
- Book title + author in 1 sentence.
- Author's credibility: why should anyone listen?
- The core problem the book solves in 1 sentence.

[3 KEY LESSONS] (0:15-0:55, 90-110 words)
- Exactly 3 lessons. Label: "Lesson one... Lesson two... Lesson three..."
- Each lesson: ~15 seconds.
- Structure per lesson: The concept → A concrete example or analogy.
- Lesson 1: The most fundamental idea (the paradigm shift)
- Lesson 2: The practical application (the actionable takeaway)
- Lesson 3: The counterintuitive insight (the mind-blowing reframe)
- Use the author's own stories or examples when possible.

[TRANSFORMATION / SYNTHESIS] (0:55-1:10, 25-35 words)
- One powerful sentence synthesizing all 3 lessons.
- Show how the book changes behavior: "After reading this, you'll never look at X the same way."
- Include a quote from the book if there's a powerful one.

[CTA] (1:10-1:25, 30-35 words)
- "Save this" + recommend sharing.
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
    console.log(`📱 shortsGenerateScript v5 (Claude): project=${project_id}`);

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

    const promptBuilder = NICHE_PROMPTS[shortsNiche];
    const prompt = promptBuilder
      ? promptBuilder(topicTitle)
      : DEFAULT_PROMPT(topicTitle, shortsNiche);

    console.log(`📱 Calling Claude for "${topicTitle}" (niche: ${shortsNiche})...`);
    const result = await callClaude(prompt, 0.75);

    const rawScript = result.script || '';
    // Strip section headers like [HOOK - 5s], [COLD OPEN], etc.
    const fullScript = rawScript
      .replace(/\[.*?\]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const wordCount = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const title = result.title || topicTitle;

    console.log(`✅ Got script: ${wordCount} words, title: "${title}" (niche: ${shortsNiche})`);

    // Delete old scripts then save new one
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