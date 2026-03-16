import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function repairJSON(str) {
  str = str.replace(/,\s*([}\]])/g, '$1');
  str = str.replace(/[\x00-\x1F\x7F]/g, (ch) => {
    if (ch === '\n' || ch === '\r' || ch === '\t') return ch;
    return '';
  });
  return str;
}

function extractJSON(text) {
  let jsonStr = text;
  if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    try {
      return JSON.parse(repairJSON(jsonStr));
    } catch (e2) {
      const start = jsonStr.indexOf('{');
      const end = jsonStr.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        return JSON.parse(repairJSON(jsonStr.substring(start, end + 1)));
      }
      throw e2;
    }
  }
}

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
          generationConfig: { 
            temperature, 
            maxOutputTokens: 4096,
            responseMimeType: "application/json"
          }
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
    const parsed = extractJSON(text);
    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

function validateHook(hook) {
  const issues = [];
  if (!hook.hook_text || hook.hook_text.trim().length === 0) issues.push('Empty hook text');
  if (hook.hook_text && hook.hook_text.length > 120) issues.push(`Hook too long: ${hook.hook_text.length} chars`);
  if (hook.hook_text && hook.hook_text.length < 5) issues.push(`Hook too short: ${hook.hook_text.length} chars`);
  if (!hook.intensity_score || hook.intensity_score < 1 || hook.intensity_score > 10) issues.push('Invalid intensity score');
  const weakOpeners = ['this is', 'today we', 'in this video', 'welcome to', 'hi everyone', 'hey guys'];
  const hookLower = (hook.hook_text || '').toLowerCase();
  if (weakOpeners.some(w => hookLower.startsWith(w))) issues.push('Weak opener');
  return { valid: issues.length === 0, issues };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, topic_id, topic_title, topic_description = '' } = body;

    if (!project_id || !topic_id || !topic_title) {
      return Response.json({ error: 'Missing required fields: project_id, topic_id, topic_title' }, { status: 400 });
    }

    console.log('GENERATING VIRAL HOOKS');
    console.log(`Topic: ${topic_title}`);

    const prompt = `You are an elite YouTube hook writer. Generate 5 viral hooks for this topic.

TOPIC: "${topic_title}"
${topic_description ? `CONTEXT: ${topic_description}` : ''}

RULES:
- Each hook MUST be under 120 characters
- Use 5 DIFFERENT hook types (no repeats)
- At least 2 hooks must directly reference the topic title — the viewer should IMMEDIATELY know what the video is about
- NOT every hook needs to be dramatic or controversial — include at least 1 calm/educational hook and 1 direct question hook
- No generic openers like "In this video..." or "Today we..."
- Must work as both thumbnail text and voiceover opener
- Hook styles should MATCH the topic tone — a finance explainer doesn't need horror-movie energy

HOOK TYPES (use one per hook):
1. CURIOSITY GAP - information void the brain wants filled
2. PATTERN INTERRUPT - violates expectations
3. SPECIFICITY BOMB - ultra-specific details feel like insider knowledge
4. STAKES ESCALATION - relatable situation + catastrophic consequence
5. EMOTIONAL CONTRAST - juxtaposes two extreme emotional states

Return this exact JSON structure:
{
  "detected_niche": "finance/crime/history/technology/drama/science/other",
  "niche_strategy": "Brief psychological approach for this niche",
  "hooks": [
    {
      "rank": 1,
      "hook_text": "The hook under 120 characters",
      "hook_type": "curiosity_gap",
      "primary_emotion": "curiosity",
      "intensity_score": 9,
      "character_count": 87,
      "use_as_thumbnail": true,
      "use_as_voiceover": true,
      "thumbnail_power": "Why this works visually",
      "voiceover_power": "Why this works spoken",
      "unanswered_question": "What question does this plant?"
    }
  ]
}

Generate 5 hooks ranked by viral potential. Keep all string values clean with no special characters.`;

    const result = await safeGeminiCall(prompt, 0.9);

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.hooks || !Array.isArray(result.data.hooks)) {
      return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });
    }

    console.log(`Hooks generated: ${result.data.hooks.length}`);

    let qualityWarnings = 0;

    const validHookTypes = ['curiosity_gap', 'power_word', 'pattern_break'];
    const mapHookType = (type) => {
      if (validHookTypes.includes(type)) return type;
      // Map AI-generated types to valid enum values
      if (['specificity_bomb', 'stakes_escalation'].includes(type)) return 'power_word';
      if (['emotional_contrast', 'pattern_interrupt'].includes(type)) return 'pattern_break';
      return 'curiosity_gap';
    };

    const savePromises = result.data.hooks.map(async (hook, i) => {
      const validation = validateHook(hook);
      if (!validation.valid) {
        qualityWarnings++;
        console.warn(`Hook ${hook.rank} issues: ${validation.issues.join(', ')}`);
      }

      try {
        const record = await base44.entities.Hooks.create({
          project_id: project_id,
          topic_id: topic_id,
          rank: hook.rank || i + 1,
          hook_text: hook.hook_text || '',
          hook_type: mapHookType(hook.hook_type),
          intensity_score: hook.intensity_score || 7,
          use_as_thumbnail: hook.use_as_thumbnail ?? true,
          use_as_voiceover: hook.use_as_voiceover ?? true,
          is_selected: false
        });
        return { success: true, record };
      } catch (saveErr) {
        console.error(`Failed to save hook ${hook.rank}:`, saveErr.message);
        return { success: false, rank: hook.rank, error: saveErr.message };
      }
    });

    const saveResults = await Promise.all(savePromises);
    const created_hooks = saveResults.filter(r => r.success).map(r => r.record);
    const skipped_hooks = saveResults.filter(r => !r.success);

    // Update topic and project in parallel too
    try {
      await Promise.all([
        base44.entities.Topics.update(topic_id, { is_selected: true }),
        base44.entities.Projects.update(project_id, {
          selected_topic_id: topic_id,
          current_step: 3
        })
      ]);
    } catch (updateErr) {
      console.warn('Failed to update status:', updateErr.message);
    }

    console.log(`Hooks saved: ${created_hooks.length}, skipped: ${skipped_hooks.length}`);

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