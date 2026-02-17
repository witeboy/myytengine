import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: 8192 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Gemini returned no candidates. Possibly content filtered.");
    }

    const text = data.candidates[0].content.parts[0].text;
    let jsonStr = text;
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

    const parsed = JSON.parse(jsonStr);
    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

function validateTopic(topic) {
  const issues = [];
  if (!topic.title || topic.title.trim().length === 0) issues.push('Missing title');
  if (!topic.description || topic.description.trim().length < 50) issues.push('Description too short');
  if (!topic.viral_score || topic.viral_score < 1 || topic.viral_score > 10) issues.push('Invalid viral score');
  const weakTitles = ['how to', 'what is', 'guide to', 'introduction to', 'basics of'];
  if (weakTitles.some(w => (topic.title || '').toLowerCase().startsWith(w))) {
    issues.push('Title starts with weak generic opener');
  }
  return { valid: issues.length === 0, issues };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, niche } = body;

    if (!project_id || !niche) {
      return Response.json({ error: 'Missing required fields: project_id, niche' }, { status: 400 });
    }

    console.log('================================================');
    console.log('GENERATING VIRAL TOPICS');
    console.log(`Niche: ${niche}`);
    console.log('================================================');

    const prompt = `You are an elite YouTube channel strategist who has launched 50+ faceless channels to 100K+ subscribers. You specialize in finding untapped viral angles that dominate search AND recommendations simultaneously.

CHANNEL NICHE: "${niche}"

Your mission: Generate 5 PREMIUM viral video topics that are surgical, specific deep-dives into "${niche}" — NOT generic finance/self-help content that happens to mention the niche.

================================================
NICHE SPECIFICITY MANDATE
================================================

EVERY topic MUST be:
- A direct, surgical examination of "${niche}" mechanics, psychology, or hidden truths
- Something that makes an expert in "${niche}" say "I never thought of framing it that way"
- Impossible to produce without deep knowledge of "${niche}"

FORBIDDEN (these are lazy, generic topics):
- "Why Most People Fail At [niche]" (too vague)
- "The Beginner's Guide To [niche]" (no intrigue)
- "Top 5 Tips For [niche]" (listicle, low retention)
- Topics that could apply to ANY niche with word substitution

================================================
VIRAL TOPIC ENGINEERING FRAMEWORK
================================================

Apply ALL FOUR filters to every topic:

FILTER 1 - THE HIDDEN TRUTH ANGLE:
Find the counterintuitive truth buried inside "${niche}" that contradicts what most people believe.
Ask: "What does everyone THINK they know about ${niche} that is actually backwards?"
Example for "compound interest": "The Math They Hide In Your Savings Account" (exposes how banks calculate compound interest against you)

FILTER 2 - THE EMOTIONAL STAKES:
Every topic must answer: "Why does someone's life get SIGNIFICANTLY WORSE if they don't watch this?"
The stakes must be concrete: specific money lost, specific years wasted, specific opportunities destroyed.
Example: Not "understand credit scores better" but "The 3-digit number that cost this person $47,000 — and they never knew why"

FILTER 3 - THE VILLAIN NARRATIVE:
Identify the system, institution, or hidden force working AGAINST the viewer in "${niche}".
The villain makes the viewer feel like they're finally getting insider information.
Villains: financial institutions, government policy, corporate incentives, industry "experts", psychological traps, hidden fees

FILTER 4 - THE SPECIFICITY BOMB:
Replace vague claims with hyper-specific details that make the topic feel researched and credible.
Not "banks charge fees" but "the 11-character code buried in your statement that triggers a $34 fee automatically"

================================================
CONTENT ARCHITECTURE
================================================

For each topic, design the full narrative arc:

VIRAL ANGLES TO EXPLOIT:
- The Secret: Something hidden in plain sight within "${niche}"
- The Betrayal: How a trusted system in "${niche}" is working against viewers
- The Discovery: A counterintuitive mechanism in "${niche}" most people miss
- The Warning: A catastrophic mistake people make in "${niche}" without realizing
- The Shortcut: The fastest legitimate path to success in "${niche}" that nobody talks about
- The Myth: The most damaging lie people believe about "${niche}"
- The Timeline: A specific event or sequence in "${niche}" that changed everything
- The Comparison: How "${niche}" works differently than people assume
- The Insider: What professionals in "${niche}" know that public doesn't
- The Future: Where "${niche}" is heading and why most people will be caught off guard

================================================
SEARCH + RECOMMENDATION OPTIMIZATION
================================================

Each topic must win on BOTH:

SEARCH: Target actual search intent
- What does someone type when they're desperate for answers about "${niche}"?
- Include terms people search BEFORE they know what they're looking for
- Focus on "why", "how much", "what happens when", "is it true that"

RECOMMENDATIONS: Design for algorithmic spread
- Topics that make viewers feel smarter, more aware, or slightly scared
- Shareable: "I had to send this to my friend"
- Rewatchable: Information dense enough to require second viewing
- Comment-bait: Creates strong opinion ("this happened to me" or "this is wrong")

================================================
EXAMPLES OF 10/10 vs 5/10 TOPICS
================================================

NICHE: "Credit Cards"

5/10 TOPICS (DO NOT WRITE LIKE THESE):
- "How To Use Credit Cards Wisely"
- "Credit Card Tips For Beginners"
- "Best Credit Cards of 2024"

10/10 TOPICS (WRITE LIKE THESE):
- "The 73-Day Window Banks Don't Advertise (And How It's Silently Destroying Credit Scores)"
- "Why Paying Your Credit Card 'On Time' Is Not What Banks Actually Mean"
- "The Internal Scoring System Credit Card Companies Use That No Credit Bureau Sees"
- "I Analyzed 847 Declined Applications: Here's The Real Reason Credit Cards Reject You"
- "The Zero-Balance Trap: Why Having No Credit Card Debt Is Costing Some People Thousands"

================================================
OUTPUT FORMAT (EXACT JSON)
================================================

{
  "niche_analysis": "Your understanding of the core dynamics and viral potential of this niche",
  "content_strategy": "The overarching content approach that will make this channel dominate",
  "topics": [
    {
      "rank": 1,
      "title": "Viral, specific, curiosity-driven title",
      "description": "2-3 sentence high-stakes synopsis explaining EXACTLY why not knowing this about ${niche} causes measurable harm — include specific emotional and financial stakes",
      "viral_angle": "hidden_truth/betrayal/discovery/warning/shortcut/myth/timeline/comparison/insider/future",
      "villain": "The system/institution/force working against the viewer in this topic",
      "unanswered_question": "The burning question this video answers that viewers can't find elsewhere",
      "search_intent": "What someone types into Google/YouTube when they desperately need this",
      "recommendation_hook": "Why someone would share this video or watch it twice",
      "viral_score": 9,
      "storytelling_score": 8,
      "emotional_score": 9,
      "keyword_potential": "high/medium/low",
      "monthly_searches": "10K-50K",
      "competition_level": "low/medium/high",
      "content_depth": "How many minutes of genuinely valuable content this topic can support",
      "engagement_notes": "Specific comment triggers and discussion angles this topic will generate"
    }
  ]
}

CRITICAL REQUIREMENTS:
- Every topic title must make a stranger stop scrolling
- Every description must make a viewer feel they CANNOT afford to skip this
- Topics must span different viral angles (no two topics with same angle)
- All topics must be executable with research only (no on-camera presenter needed)
- Rank by overall channel growth potential (viral score x keyword potential x competition)

Generate 5 premium viral topics for "${niche}" now.`;

    const result = await safeGeminiCall(prompt, 0.85);

    if (!result.success) {
      console.error('Gemini failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.topics || !Array.isArray(result.data.topics)) {
      return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });
    }

    console.log(`Niche analysis: ${result.data.niche_analysis}`);
    console.log(`Topics generated: ${result.data.topics.length}`);

    const created_topics = [];
    const skipped_topics = [];
    let qualityWarnings = 0;

    for (const topic of result.data.topics) {
      const validation = validateTopic(topic);
      if (!validation.valid) {
        qualityWarnings++;
        console.warn(`Topic ${topic.rank} issues: ${validation.issues.join(', ')}`);
      }

      try {
        const record = await base44.entities.Topics.create({
          project_id: project_id,
          rank: topic.rank || created_topics.length + 1,
          title: topic.title || '',
          description: topic.description || '',
          viral_angle: topic.viral_angle || '',
          villain: topic.villain || '',
          unanswered_question: topic.unanswered_question || '',
          search_intent: topic.search_intent || '',
          recommendation_hook: topic.recommendation_hook || '',
          viral_score: topic.viral_score || 7,
          storytelling_score: topic.storytelling_score || 7,
          emotional_score: topic.emotional_score || 7,
          keyword_potential: topic.keyword_potential || 'medium',
          monthly_searches: topic.monthly_searches || 'unknown',
          competition_level: topic.competition_level || 'medium',
          content_depth: topic.content_depth || '',
          engagement_notes: topic.engagement_notes || '',
          quality_valid: validation.valid,
          is_selected: false
        });

        created_topics.push(record);
        console.log(`Saved topic ${topic.rank}: "${topic.title?.substring(0, 60)}..." Score: ${topic.viral_score}/10`);
      } catch (saveErr) {
        console.error(`Failed to save topic ${topic.rank}:`, saveErr.message);
        skipped_topics.push({ rank: topic.rank, error: saveErr.message });
      }
    }

    try {
      await base44.entities.Projects.update(project_id, {
        status: "topics_ready",
        current_step: 1,
        completed_steps: JSON.stringify([1])
      });
    } catch (updateErr) {
      console.warn('Failed to update project status:', updateErr.message);
    }

    console.log('================================================');
    console.log(`Topics saved: ${created_topics.length}`);
    console.log(`Topics skipped: ${skipped_topics.length}`);
    console.log(`Quality warnings: ${qualityWarnings}`);
    console.log('================================================');

    return Response.json({
      success: true,
      topics: created_topics,
      meta: {
        niche_analysis: result.data.niche_analysis,
        content_strategy: result.data.content_strategy,
        total_generated: result.data.topics.length,
        total_saved: created_topics.length,
        total_skipped: skipped_topics.length,
        quality_warnings: qualityWarnings
      }
    });

  } catch (error) {
    console.error('generateTopics error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

