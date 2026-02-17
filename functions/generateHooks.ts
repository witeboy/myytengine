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
    if (text.includes("```json")) {
      jsonStr = text.split("```json")[1].split("```")[0].trim();
    } else if (text.includes("```")) {
      jsonStr = text.split("```")[1].split("```")[0].trim();
    }

    const parsed = JSON.parse(jsonStr);
    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// VALIDATE A SINGLE HOOK FOR QUALITY
// ══════════════════════════════════════════════════════════════════
function validateHook(hook) {
  const issues = [];

  if (!hook.hook_text || hook.hook_text.trim().length === 0) {
    issues.push('Empty hook text');
  }
  if (hook.hook_text && hook.hook_text.length > 120) {
    issues.push(`Hook too long: ${hook.hook_text.length} chars (max 120)`);
  }
  if (hook.hook_text && hook.hook_text.length < 10) {
    issues.push(`Hook too short: ${hook.hook_text.length} chars (min 10)`);
  }
  if (!hook.intensity_score || hook.intensity_score < 1 || hook.intensity_score > 10) {
    issues.push('Invalid intensity score (must be 1-10)');
  }

  // Check for weak/generic openers
  const weakOpeners = ['this is', 'today we', 'in this video', 'welcome to', 'hi everyone', 'hey guys'];
  const hookLower = (hook.hook_text || '').toLowerCase();
  if (weakOpeners.some(w => hookLower.startsWith(w))) {
    issues.push('Hook starts with weak/generic opener');
  }

  // Check for at least one power element
  const powerElements = /(\?|\.\.\.|\!|before|after|secret|exposed|truth|never|always|nobody|everyone|shocking|hidden|real|actually|finally|revealed|until|unless|what if|imagine|they|lied|wrong|illegal|banned|deleted|censored|forgot|unknown)/i;
  if (!powerElements.test(hook.hook_text || '')) {
    issues.push('Hook lacks power words or emotional triggers');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, topic_id, topic_title, topic_description = '' } = body;

    if (!project_id || !topic_id || !topic_title) {
      return Response.json({ 
        error: 'Missing required fields: project_id, topic_id, topic_title' 
      }, { status: 400 });
    }

    console.log('================================================');
    console.log('GENERATING VIRAL HOOKS');
    console.log(`Topic: ${topic_title}`);
    console.log(`Has description: ${topic_description.length > 0}`);
    console.log('================================================');

    const prompt = `You are an elite YouTube growth strategist and viral content psychologist with deep expertise in retention engineering, thumbnail psychology, and hook writing.

Your mission: Generate 10 PREMIUM, DIVERSE, VIRAL hooks for the following topic.

TOPIC: "${topic_title}"
${topic_description ? `CONTEXT: ${topic_description}` : ''}

================================================
NICHE ANALYSIS (analyze the topic and apply the right psychology)
================================================

If this is FINANCE/BUSINESS:
- Hook the money angle: lost fortunes, hidden wealth, financial betrayal
- Use specific dollar amounts when possible: "lost $2.3 billion in 72 hours"
- Trigger: greed, fear of missing out, financial anxiety
- Examples: "The Investment Strategy That Made Warren Buffett Nervous" / "Why Your Bank Is Quietly Profiting From Your Ignorance"

If this is CRIME/INVESTIGATION:
- Lead with the most shocking detail or unanswered question
- Use timeline tension: "For 23 years, no one knew..."
- Trigger: morbid curiosity, justice, shock
- Examples: "The Perfect Crime That Almost Worked" / "She Called 911. The Operator Was The Killer."

If this is HISTORY/BIOGRAPHY:
- Focus on the decision, betrayal, or hidden truth
- Use contrast: "The man who saved millions died penniless"
- Trigger: injustice, fascination, forgotten heroes
- Examples: "The Invention That Was Stolen From Its Creator" / "What They Never Taught You About This Historical Moment"

If this is TECHNOLOGY/AI:
- Lead with the disruption or threat
- Use before/after framing
- Trigger: fear of being left behind, fascination, anxiety
- Examples: "The AI Tool That's Replacing An Entire Profession" / "What Google Knows About You That You Don't"

If this is HUMAN DRAMA/STORYTELLING:
- Lead with the emotional peak
- Use specific sensory or emotional detail
- Trigger: empathy, outrage, inspiration
- Examples: "She Survived The Impossible. Then Lost Everything To A Signature." / "The Last Text He Sent Before Disappearing"

================================================
HOOK PSYCHOLOGY FRAMEWORK
================================================

Apply these 10 hook types (one per hook, NO repeats):

1. CURIOSITY GAP: Creates an information void the brain desperately wants to fill
   Formula: [Intriguing premise]... [incomplete resolution]
   Example: "The email that ended a $40 billion company. Nobody was supposed to find it."

2. PATTERN INTERRUPT: Violates expectations to create cognitive dissonance
   Formula: [Common belief] + [Shocking contradiction]
   Example: "The safest investment in history destroyed more families than the 2008 crash."

3. SPECIFICITY BOMB: Ultra-specific details that feel like insider knowledge
   Formula: [Hyper-specific number/date/name] + [Provocative claim]
   Example: "On March 14th, 1987, one man made a decision that cost 847 people everything."

4. SOCIAL PROOF INVERSION: Challenges conventional wisdom everyone accepts
   Formula: "Everyone believes [X]. Here's why they're completely wrong."
   Example: "Every financial advisor tells you to do this. It's making you poorer."

5. STAKES ESCALATION: Makes the stakes feel immediate and personal
   Formula: [Relatable situation] + [Catastrophic consequence you didn't see coming]
   Example: "You've done this exact thing 1,000 times. It almost destroyed someone's life."

6. FORBIDDEN KNOWLEDGE: Implies suppressed or hidden information
   Formula: "[Authority] doesn't want you to know [truth]"
   Example: "The study that pharmaceutical companies paid $3M to bury."

7. TIMELINE TENSION: Uses time as a pressure mechanism
   Formula: [Time period] + [Escalating consequence]
   Example: "For 11 years, he was the most wanted man alive. Then he walked into a police station."

8. IDENTITY CHALLENGE: Challenges who the viewer thinks they are
   Formula: "If you [identity], you need to see this."
   Example: "If you've ever trusted a financial institution, watch this before you do it again."

9. EMOTIONAL CONTRAST: Juxtaposes two extreme emotional states
   Formula: [Peak success/hope] + [Devastating fall/twist]
   Example: "He built a $200M company from nothing. His family never saw a cent of it."

10. THE CONFESSION/REVEAL: First-person or insider admission that breaks trust
    Formula: "I [shocking admission about the topic]"
    Example: "I spent 10 years in this industry. What I saw should be illegal."

================================================
CRITICAL RULES
================================================

EVERY hook MUST:
- Be under 120 characters (ideal: 60-100 for thumbnail use)
- Work as both spoken voiceover AND visual thumbnail text
- Create an unanswered question that can only be resolved by watching
- Trigger ONE primary emotion: curiosity, shock, fear, outrage, or inspiration
- Feel specific and credible, NOT vague or clickbaity
- Be grammatically sharp with no wasted words

FORBIDDEN:
- Generic openers: "In this video...", "Today we...", "Welcome to..."
- Vague claims: "This will change everything" (too generic)
- Dishonest sensationalism: claims that contradict the actual topic
- Repetitive structures across the 10 hooks

QUALITY BAR:
- Ask yourself: "Would I stop scrolling for this?" If yes, include it.
- Ask yourself: "Does this feel like clickbait or a genuine promise?" Only genuine promises pass.
- Ask yourself: "Could someone screenshot this as a thumbnail?" If yes, it works.

================================================
EXAMPLES OF 10/10 vs 5/10 HOOKS
================================================

TOPIC: "The 2008 Financial Crisis"

5/10 HOOKS (DO NOT WRITE LIKE THIS):
- "The financial crisis was really bad"
- "Banks made bad decisions in 2008"
- "Learn about what happened in 2008"

10/10 HOOKS (WRITE LIKE THIS):
- "The banker who saw 2008 coming. His warnings were classified for 7 years."
- "They called it a recession. The people who caused it called it Tuesday."
- "Your grandparents lost their retirement so 23 executives could buy second yachts."
- "The meeting that started the 2008 crash lasted 11 minutes. Nobody took notes."

================================================
OUTPUT FORMAT (EXACT JSON)
================================================

{
  "detected_niche": "finance/crime/history/technology/drama/science/other",
  "niche_strategy": "Brief explanation of psychological approach used for this niche",
  "hooks": [
    {
      "rank": 1,
      "hook_text": "The hook under 120 characters",
      "hook_type": "curiosity_gap/pattern_interrupt/specificity_bomb/social_proof_inversion/stakes_escalation/forbidden_knowledge/timeline_tension/identity_challenge/emotional_contrast/confession_reveal",
      "primary_emotion": "curiosity/shock/fear/outrage/inspiration/fascination",
      "intensity_score": 9,
      "character_count": 87,
      "use_as_thumbnail": true,
      "use_as_voiceover": true,
      "thumbnail_power": "Why this works visually as a thumbnail",
      "voiceover_power": "Why this works as a spoken opener",
      "unanswered_question": "What question does this plant in the viewer's mind?"
    }
  ]
}

IMPORTANT:
- Rank hooks 1-10 by overall viral potential (1 = highest)
- Use ALL 10 different hook_types (no repeats)
- Ensure diversity in primary_emotion across the 10 hooks
- Every hook must be genuinely compelling for THIS specific topic
- Do not fabricate specific facts - keep claims credible and topic-accurate

Generate 10 premium viral hooks now.`;

    const result = await safeGeminiCall(prompt, 0.9);

    if (!result.success) {
      console.error('Gemini call failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.hooks || !Array.isArray(result.data.hooks)) {
      return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });
    }

    console.log(`Detected niche: ${result.data.detected_niche}`);
    console.log(`Niche strategy: ${result.data.niche_strategy}`);
    console.log(`Hooks generated: ${result.data.hooks.length}`);

    // ══════════════════════════════════════════════════════════════════
    // VALIDATE, SAVE & REPORT
    // ══════════════════════════════════════════════════════════════════
    const created_hooks = [];
    const skipped_hooks = [];
    let qualityWarnings = 0;

    for (const hook of result.data.hooks) {
      const validation = validateHook(hook);

      if (!validation.valid) {
        qualityWarnings++;
        console.warn(`Hook ${hook.rank} quality issues: ${validation.issues.join(', ')}`);
      }

      // Save even if quality warnings - just log them
      try {
        const record = await base44.entities.Hooks.create({
          project_id: project_id,
          topic_id: topic_id,
          rank: hook.rank || created_hooks.length + 1,
          hook_text: hook.hook_text || '',
          hook_type: hook.hook_type || 'curiosity_gap',
          primary_emotion: hook.primary_emotion || 'curiosity',
          intensity_score: hook.intensity_score || 7,
          character_count: hook.hook_text?.length || 0,
          use_as_thumbnail: hook.use_as_thumbnail ?? true,
          use_as_voiceover: hook.use_as_voiceover ?? true,
          thumbnail_power: hook.thumbnail_power || '',
          voiceover_power: hook.voiceover_power || '',
          unanswered_question: hook.unanswered_question || '',
          quality_valid: validation.valid,
          quality_issues: validation.issues.join('; '),
          is_selected: false
        });

        created_hooks.push(record);
        console.log(`Saved hook ${hook.rank}: "${hook.hook_text?.substring(0, 50)}..." [${hook.hook_type}] Score: ${hook.intensity_score}/10`);
      } catch (saveErr) {
        // Don't crash - just skip this hook and continue
        console.error(`Failed to save hook ${hook.rank}:`, saveErr.message);
        skipped_hooks.push({ rank: hook.rank, error: saveErr.message });
      }
    }

    // Update topic and project
    try {
      await base44.entities.Topics.update(topic_id, { is_selected: true });
      await base44.entities.Projects.update(project_id, {
        selected_topic_id: topic_id,
        current_step: 3
      });
    } catch (updateErr) {
      console.warn('Failed to update topic/project status:', updateErr.message);
    }

    console.log('================================================');
    console.log(`Hooks saved: ${created_hooks.length}`);
    console.log(`Hooks skipped: ${skipped_hooks.length}`);
    console.log(`Quality warnings: ${qualityWarnings}`);
    console.log('================================================');

    return Response.json({
      success: true,
      hooks: created_hooks,
      meta: {
        detected_niche: result.data.detected_niche,
        niche_strategy: result.data.niche_strategy,
        total_generated: result.data.hooks.length,
        total_saved: created_hooks.length,
        total_skipped: skipped_hooks.length,
        quality_warnings: qualityWarnings,
        skipped_details: skipped_hooks
      }
    });

  } catch (error) {
    console.error('generateHooks error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});