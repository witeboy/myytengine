import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

async function callGemini(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048, responseMimeType: "application/json" }
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
  
  try {
    return JSON.parse(rawText);
  } catch (_) {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, topic_id, topic_title, topic_description = '' } = await req.json();

    if (!project_id || !topic_id || !topic_title) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get channel strategy if available
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    
    let strategyHint = '';
    if (project?.script_strategy_override || project?.channel_id) {
      let strategyStr = project.script_strategy_override;
      if (!strategyStr && project.channel_id) {
        const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
        strategyStr = channels[0]?.script_strategy || '';
      }
      if (strategyStr) {
        try {
          const strat = JSON.parse(strategyStr);
          strategyHint = `\nNICHE STRATEGY — align hooks with this style:
- Hook Formula: ${strat.hook_formula || 'N/A'}
- Tone: ${strat.tone || 'N/A'}
- Pacing: ${strat.pacing || 'N/A'}`;
        } catch (_) {}
      }
    }

    console.log(`Topic: ${topic_title}`);

    const prompt = `Generate 5 SCROLL-STOPPING YouTube hooks for this topic. Each hook must make the viewer UNABLE to scroll past.

TOPIC: "${topic_title}"
${topic_description ? `CONTEXT: ${topic_description}` : ''}
${strategyHint}

EACH HOOK MUST BE:
- Under 100 characters (punchy, not wordy)
- Visceral — hits an emotion in the FIRST 3 words
- Specific — uses numbers, names, or concrete details (not vague)
- Works as BOTH thumbnail text AND a spoken voiceover opener
- Makes the viewer think "WAIT, WHAT?" or "I NEED to know more"

THE 5 HOOKS (one of each type):
1. CURIOSITY GAP — information void that DEMANDS to be filled ("The $40B mistake no one talks about")
2. PATTERN BREAK — violates what the viewer expects ("Doctors are now prescribing Netflix")
3. POWER WORD — uses a loaded word that triggers emotion ("The silent killer in every portfolio")
4. STAKES BOMB — personal + catastrophic ("You're losing $847/month and don't know it")
5. CONTRAST HOOK — two extremes collide ("He went from homeless to $50M in 18 months")

Return JSON:
{
  "hooks": [
    {
      "rank": 1,
      "hook_text": "The hook text under 100 chars",
      "hook_type": "curiosity_gap",
      "intensity_score": 9,
      "use_as_thumbnail": true,
      "use_as_voiceover": true
    }
  ]
}

5 hooks. Ranked by viral potential. No weak openers. No clichés. Every word must EARN its place.`;

    const result = await callGemini(prompt);

    if (!result.hooks || !Array.isArray(result.hooks)) {
      return Response.json({ error: 'Invalid response from AI' }, { status: 500 });
    }

    const validTypes = ['curiosity_gap', 'power_word', 'pattern_break'];
    const mapType = (t) => {
      if (validTypes.includes(t)) return t;
      if (['stakes_bomb', 'stakes_escalation', 'specificity_bomb'].includes(t)) return 'power_word';
      if (['contrast_hook', 'pattern_interrupt', 'emotional_contrast'].includes(t)) return 'pattern_break';
      return 'curiosity_gap';
    };

    // Save all 5 hooks in parallel
    const saveResults = await Promise.all(
      result.hooks.slice(0, 5).map((hook, i) =>
        base44.entities.Hooks.create({
          project_id,
          topic_id,
          rank: hook.rank || i + 1,
          hook_text: (hook.hook_text || '').slice(0, 120),
          hook_type: mapType(hook.hook_type),
          intensity_score: Math.min(10, Math.max(1, hook.intensity_score || 8)),
          use_as_thumbnail: hook.use_as_thumbnail ?? true,
          use_as_voiceover: hook.use_as_voiceover ?? true,
          is_selected: false,
        })
      )
    );

    // Update project status
    await Promise.all([
      base44.entities.Topics.update(topic_id, { is_selected: true }),
      base44.entities.Projects.update(project_id, {
        selected_topic_id: topic_id,
        current_step: 3,
      }),
    ]);

    console.log(`Hooks saved: ${saveResults.length}`);

    return Response.json({
      success: true,
      hooks: saveResults,
      meta: { total_saved: saveResults.length },
    });
  } catch (error) {
    console.error('generateHooks error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});