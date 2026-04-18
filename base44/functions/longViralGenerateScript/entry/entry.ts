import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ═══════════════════════════════════════════════════════════════════
// longViralGenerateScript — Uses the BATCH SYSTEM for reliable
// duration/word count targets. Processes one batch per call.
// Claude primary, Gemini fallback. Robust JSON parsing.
// ═══════════════════════════════════════════════════════════════════

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

// ── Robust JSON parsing that handles control characters ──────────
function parseJsonSafe(text) {
  if (!text) return null;

  // Try direct parse
  try { return JSON.parse(text); } catch (_) {}

  // Strip markdown code fences
  let cleaned = text;
  if (cleaned.includes('```json')) {
    cleaned = cleaned.split('```json')[1].split('```')[0].trim();
  } else if (cleaned.includes('```')) {
    cleaned = cleaned.split('```')[1].split('```')[0].trim();
  }
  try { return JSON.parse(cleaned); } catch (_) {}

  // Extract JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    let s = objMatch[0];
    // Sanitize control characters inside string values
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
    // Fix unescaped newlines/tabs inside JSON strings
    // Replace literal newlines within quoted strings with \\n
    s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
      return match
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    });
    // Remove trailing commas
    s = s.replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(s); } catch (_) {}

    // Last resort: even more aggressive cleaning
    s = objMatch[0].replace(/[\x00-\x1F\x7F]/g, ' ').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(s); } catch (_) {}
  }

  return null;
}

// ── Claude API caller ────────────────────────────────────────────
async function callClaude(prompt, temperature = 0.85, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (response.status === 429) {
      const waitMs = Math.pow(2, attempt + 1) * 3000;
      console.warn(`⏳ Claude rate limited, waiting ${waitMs / 1000}s`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Claude ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';
    const parsed = parseJsonSafe(rawText);
    if (parsed) return parsed;

    if (attempt === retries) throw new Error('Failed to parse Claude JSON after all attempts');
    console.log(`[Claude] JSON parse failed (attempt ${attempt + 1}), retrying...`);
  }
}

// ── Gemini API caller (fallback) ─────────────────────────────────
async function callGemini(prompt, temperature = 0.85, retries = 2) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_KEY}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 16384 },
      }),
    });

    if (response.status === 429) {
      const waitMs = Math.pow(2, attempt + 1) * 3000;
      console.warn(`⏳ Gemini rate limited, waiting ${waitMs / 1000}s`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseJsonSafe(rawText);
    if (parsed) return parsed;

    if (attempt === retries) throw new Error('Failed to parse Gemini JSON after all attempts');
    console.log(`[Gemini] JSON parse failed (attempt ${attempt + 1}), retrying...`);
  }
}

// ── Unified LLM caller ──────────────────────────────────────────
async function callLLM(prompt, temperature = 0.85) {
  // Try Claude first
  if (ANTHROPIC_KEY) {
    try {
      const result = await callClaude(prompt, temperature);
      return { result, provider: 'claude' };
    } catch (claudeErr) {
      console.warn(`[LLM] Claude failed: ${(claudeErr.message || '').substring(0, 120)}`);
      if (!GEMINI_KEY) throw claudeErr;
    }
  }
  // Fallback to Gemini
  console.log('[LLM] Using Gemini...');
  const result = await callGemini(prompt, temperature);
  return { result, provider: 'gemini' };
}

// ── Build the writing prompt for a batch — now seed-aware ────────
function buildWritingPrompt({ batch, project, topic, selectedHook, sortedBatches, previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock, seedBlock }) {
  const minTarget = Math.round(batch.target_words * 0.80);
  const maxTarget = Math.round(batch.target_words * 1.20);

  return `You are an elite YouTube scriptwriter creating a viral long-form narration script.
${seedBlock || ''}

**PROJECT CONTEXT**:
- Topic: ${topic?.title || project.name}
- Description: ${topic?.description || ''}
- Niche: ${project.niche || 'General'}
- Tone: ${project.tone || 'dramatic'}
- Video Duration: ${project.video_duration_minutes || 10} minutes
- Orientation: ${project.orientation || 'landscape'}
${selectedHook && isFirstBatch ? `- Opening Hook (use as spiritual anchor — transform, don't copy verbatim): "${selectedHook.hook_text}"` : ''}
${strategyBlock}

**FULL STORY ARC** (all sections):
${outlineContext}

**YOU ARE NOW WRITING SECTION ${batch.batch_number} of ${sortedBatches.length}**: "${batch.story_segment}"

**SECTION SYNOPSIS** (follow this closely):
${batch.synopsis}

**WORD COUNT TARGET**: Aim for ${batch.target_words} words (range ${minTarget}–${maxTarget} acceptable). Quality over quantity — do NOT pad with filler to hit an exact number. Natural variance is fine.

${previousContent ? `**PREVIOUSLY WRITTEN** (maintain continuity, do NOT repeat any of this):\n${previousContent.slice(-4000)}\n` : ''}

**WRITING RULES**:
1. Write ONLY narration text — words the narrator will speak aloud
2. NO scene directions, NO [SCENE:], NO [VISUAL:], NO stage directions, NO parenthetical actions
3. NO "In this video", NO "Welcome back", NO meta-commentary
4. Every sentence must EARN its place — zero filler, zero repetition
5. Mix punchy short sentences (3-7 words) with flowing longer ones (20-30 words)
6. Include micro-hooks every 60-90 seconds ("But that wasn't the real story...", "What happened next changed everything...", "And this is where it gets uncomfortable...")
7. ${isFirstBatch ? 'Open STRONG — the first 5 seconds determine if they stay. Start with the most gripping, specific moment.' : 'Continue seamlessly from where the previous section ended'}
8. ${isLastBatch ? 'End with a powerful closing line — memorable, quotable, perspective-shifting. Include a subtle CTA.' : 'End on a cliffhanger or curiosity hook that pulls into the next section'}
9. Use specific details: names, numbers, dates, places — not vague generalities
10. Write for the EAR, not the eye — natural spoken rhythm, not essay prose
11. Go beyond "what happened" to "why it matters" — layer complexity
12. Every paragraph must either reveal new info, escalate tension, or deepen understanding

Return ONLY valid JSON (no markdown, no backticks):
{
  "content": "The full narration text for this section...",
  "word_count": ${batch.target_words}
}`;
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

    // ── Load context: topic, hook, channel, strategy ──────────
    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    let selectedHook = null;
    if (project.selected_hook_id) {
      const hooks = await base44.asServiceRole.entities.Hooks.filter({ id: project.selected_hook_id });
      selectedHook = hooks[0];
    }

    let strategyBlock = '';
    let seedBlock = '';
    const scriptStrategy = project.script_strategy_override;
    if (scriptStrategy) {
      try {
        const strat = typeof scriptStrategy === 'string' ? JSON.parse(scriptStrategy) : scriptStrategy;
        if (strat._script_seed) {
          const seed = strat._script_seed;
          seedBlock = `
**🎲 PROJECT DIVERSITY SEED (keep consistent across all batches):**
- Optional character name: **${seed.firstName}** (${seed.namingCulture?.replace(/_/g, ' ') || 'mixed'})
- Archetype context: ${seed.archetype}
- Narrator voice register: **${seed.voiceRegister?.name}** — ${seed.voiceRegister?.desc}
- Rhetorical scheme quota (use at least twice per batch): **${seed.rhetoricalScheme?.name}** — ${seed.rhetoricalScheme?.desc}
- Narrative shape: ${seed.shape?.name} — ${seed.shape?.rhythm}
`;
        }
        strategyBlock = `
**NICHE-SPECIFIC SCRIPT STRATEGY**:
- Hook Formula: ${strat.hook_formula || 'N/A'}
- Structure: ${Array.isArray(strat.structure) ? strat.structure.join(' → ') : (strat.structure || 'N/A')}
- Tone: ${strat.tone || 'N/A'}
- Pacing: ${strat.pacing || 'N/A'}
- Retention Tricks: ${strat.retention_tricks || strat.retention || 'N/A'}
- CTA Style: ${strat.cta_style || strat.cta || 'N/A'}`;
      } catch (_) {
        strategyBlock = `\n**NICHE STRATEGY**: ${scriptStrategy}\n`;
      }
    }

    // ── Get or create script batches ─────────────────────────
    let allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });

    if (allBatches.length === 0) {
      // No batches exist — initialize them from outline or auto-create
      const dur = project.video_duration_minutes || 10;
      const totalWords = dur * 160;
      const topicTitle = topic?.title || project.name || 'Untitled';
      const topicDesc = topic?.description || '';

      console.log(`[longViralGenerateScript] No batches found. Creating for ${dur}-min video (${totalWords} words)`);

      let outline = [];
      if (project.outline) {
        try { outline = JSON.parse(project.outline); } catch (_) {}
      }

      if (outline.length > 0) {
        // Use existing outline for batches
        const wordsPerBatch = Math.ceil(totalWords / outline.length);
        const batchesToCreate = outline.map((item, i) => ({
          project_id,
          batch_number: i + 1,
          story_segment: item.segment || item.title || item.focus || `Section ${i + 1}`,
          focus_area: item.focus || item.description || item.synopsis || '',
          synopsis: item.synopsis || item.description || item.focus || '',
          target_words: wordsPerBatch,
          status: 'pending',
        }));
        await base44.asServiceRole.entities.ScriptBatches.bulkCreate(batchesToCreate);
        allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
        console.log(`[longViralGenerateScript] Created ${batchesToCreate.length} batches from outline`);
      } else {
        // Auto-create batches based on duration
        // ~800 words per batch for optimal LLM output quality
        const numBatches = Math.max(2, Math.ceil(totalWords / 800));
        const wordsPerBatch = Math.ceil(totalWords / numBatches);

        // Generate structure via LLM
        const structurePrompt = `You are a YouTube content strategist. Create a ${numBatches}-part story structure for a ${dur}-minute video.

TOPIC: "${topicTitle}"
${topicDesc ? `DESCRIPTION: ${topicDesc}` : ''}
TONE: ${project.tone || 'dramatic'}
NICHE: ${project.niche || 'general'}

Create ${numBatches} sections that form a compelling narrative arc:
- Section 1: Cold open + setup (hook, context, stakes)
- Middle sections: Deep dive, escalation, complications, hidden angles
- Last section: Climax, resolution, profound takeaway, CTA

Return ONLY valid JSON (no markdown):
{
  "batches": [
    {
      "segment": "Section name",
      "focus": "What this section covers",
      "synopsis": "Detailed 2-3 sentence synopsis of what to write"
    }
  ]
}`;

        const { result: structureResult } = await callLLM(structurePrompt, 0.7);
        const generatedBatches = structureResult.batches || [];

        if (generatedBatches.length === 0) {
          return Response.json({ error: 'Failed to generate script structure' }, { status: 500 });
        }

        const batchesToCreate = generatedBatches.map((item, i) => ({
          project_id,
          batch_number: i + 1,
          story_segment: item.segment || `Section ${i + 1}`,
          focus_area: item.focus || '',
          synopsis: item.synopsis || item.focus || '',
          target_words: wordsPerBatch,
          status: 'pending',
        }));
        await base44.asServiceRole.entities.ScriptBatches.bulkCreate(batchesToCreate);
        allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
        console.log(`[longViralGenerateScript] Auto-created ${batchesToCreate.length} batches (~${wordsPerBatch} words each)`);
      }
    }

    // ── Process one pending batch ────────────────────────────
    const sortedBatches = allBatches.sort((a, b) => a.batch_number - b.batch_number);
    const pendingBatches = sortedBatches.filter(b => b.status === 'pending' || b.status === 'generating');

    if (pendingBatches.length === 0) {
      // All batches done — aggregate into final script
      console.log(`[longViralGenerateScript] All batches complete, aggregating...`);

      const completedContent = sortedBatches
        .filter(b => b.status === 'completed' && b.content)
        .sort((a, b) => a.batch_number - b.batch_number)
        .map(b => b.content)
        .join('\n\n');

      // Clean script
      let fullScript = completedContent
        .replace(/\[[^\]]*\]/gi, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/^\*\*[^*]+\*\*:?\s*$/gim, '')
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/  +/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const wordCount = fullScript.split(/\s+/).filter(w => w.length > 0).length;
      const estimatedDuration = Math.round((wordCount / 150) * 60);

      // Save or update script entity
      const existingScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
      const existingFinal = existingScripts.find(s => s.version === 'final_aggregated');

      const scriptData = {
        project_id,
        topic_id: project.selected_topic_id || null,
        version: 'final_aggregated',
        title: topic?.title || project.name || 'Untitled',
        full_script: fullScript,
        cold_open: sortedBatches[0]?.content?.substring(0, 500) || '',
        act_1: sortedBatches.filter(b => b.batch_number <= Math.ceil(sortedBatches.length * 0.25)).map(b => b.content).join('\n\n') || '',
        act_2: sortedBatches.filter(b => b.batch_number > Math.ceil(sortedBatches.length * 0.25) && b.batch_number <= Math.ceil(sortedBatches.length * 0.65)).map(b => b.content).join('\n\n') || '',
        act_3: sortedBatches.filter(b => b.batch_number > Math.ceil(sortedBatches.length * 0.65)).map(b => b.content).join('\n\n') || '',
        outro: sortedBatches[sortedBatches.length - 1]?.content?.slice(-500) || '',
        word_count: wordCount,
        estimated_duration_sec: estimatedDuration,
      };

      let script;
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

      console.log(`[longViralGenerateScript] ✅ Final script: ${wordCount} words (~${Math.round(estimatedDuration / 60)}min)`);

      return Response.json({
        success: true,
        done: true,
        script_id: script.id,
        word_count: wordCount,
        estimated_duration_sec: estimatedDuration,
        total_batches: sortedBatches.length,
        remaining: 0,
      });
    }

    // ── Process one batch ────────────────────────────────────
    const batch = pendingBatches[0];
    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, { status: 'generating' });

    const completedBatches = sortedBatches.filter(b => b.status === 'completed' && b.content);
    const previousContent = completedBatches
      .sort((a, b) => a.batch_number - b.batch_number)
      .map(b => `--- SECTION ${b.batch_number}: ${b.story_segment} ---\n${b.content}`)
      .join('\n\n');

    const isFirstBatch = batch.batch_number === 1;
    const isLastBatch = batch.batch_number === sortedBatches.length;

    const outlineContext = sortedBatches
      .map(b => `Section ${b.batch_number} "${b.story_segment}": ${b.focus_area || b.synopsis}`)
      .join('\n');

    const prompt = buildWritingPrompt({
      batch, project, topic, selectedHook, sortedBatches,
      previousContent, outlineContext, isFirstBatch, isLastBatch, strategyBlock, seedBlock
    });

    console.log(`[Batch ${batch.batch_number}/${sortedBatches.length}] Generating ~${batch.target_words} words for "${batch.story_segment}"...`);

    // ── Generate with soft duration-aware target ─────────────
    const minWords = Math.round(batch.target_words * 0.80);
    let content = '';
    let wordCount = 0;
    const MAX_ATTEMPTS = 2;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let currentPrompt;
      if (attempt === 1 || !content) {
        currentPrompt = prompt;
      } else {
        // Continuation prompt
        const wordsNeeded = batch.target_words - wordCount;
        currentPrompt = `You previously wrote the following script section but it was too short (${wordCount} words, need ${batch.target_words}).

EXISTING CONTENT (DO NOT REPEAT — continue SEAMLESSLY from the last line):
---
${content.slice(-3000)}
---

Write EXACTLY ${wordsNeeded} MORE words continuing this section. Maintain the same tone, style, and pacing. Add more detail, more anecdotes, more specific examples, more emotional beats. Go deeper into the "why" behind events.

Return ONLY valid JSON (no markdown):
{"content": "The additional continuation text only...", "word_count": ${wordsNeeded}}`;
      }

      const { result, provider } = await callLLM(currentPrompt, 0.85);
      if (attempt === 1) console.log(`[Batch ${batch.batch_number}] Using ${provider}`);
      const newContent = result.content || '';

      if (attempt > 1 && content) {
        content = content.trim() + '\n\n' + newContent.trim();
      } else {
        content = newContent;
      }
      wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

      if (wordCount >= minWords || attempt === MAX_ATTEMPTS) {
        if (wordCount < minWords) {
          console.warn(`[Batch ${batch.batch_number}] ⚠️ Only ${wordCount}/${batch.target_words} words after ${MAX_ATTEMPTS} attempts — accepting`);
        }
        break;
      }
      console.log(`[Batch ${batch.batch_number}] ⚠️ Only ${wordCount}/${batch.target_words} words (attempt ${attempt}) — extending...`);
    }

    await base44.asServiceRole.entities.ScriptBatches.update(batch.id, {
      content,
      word_count: wordCount,
      status: 'completed',
    });

    console.log(`[Batch ${batch.batch_number}] ✅ ${wordCount} words written`);

    // Update project status
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'scripting',
      current_step: 3,
    });

    const remaining = pendingBatches.length - 1;
    const allDone = remaining === 0;

    // If this was the last batch, aggregate automatically
    if (allDone) {
      // Re-fetch all batches to get the newly completed one
      const freshBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
      const sorted = freshBatches.sort((a, b) => a.batch_number - b.batch_number);

      const completedContent = sorted
        .filter(b => b.status === 'completed' && b.content)
        .map(b => b.content)
        .join('\n\n');

      let fullScript = completedContent
        .replace(/\[[^\]]*\]/gi, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/^\*\*[^*]+\*\*:?\s*$/gim, '')
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
        .replace(/  +/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      const totalWords = fullScript.split(/\s+/).filter(w => w.length > 0).length;
      const estimatedDuration = Math.round((totalWords / 150) * 60);

      const existingScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
      const existingFinal = existingScripts.find(s => s.version === 'final_aggregated');

      const scriptData = {
        project_id,
        topic_id: project.selected_topic_id || null,
        version: 'final_aggregated',
        title: topic?.title || project.name || 'Untitled',
        full_script: fullScript,
        cold_open: sorted[0]?.content?.substring(0, 500) || '',
        act_1: sorted.filter(b => b.batch_number <= Math.ceil(sorted.length * 0.25)).map(b => b.content).join('\n\n') || '',
        act_2: sorted.filter(b => b.batch_number > Math.ceil(sorted.length * 0.25) && b.batch_number <= Math.ceil(sorted.length * 0.65)).map(b => b.content).join('\n\n') || '',
        act_3: sorted.filter(b => b.batch_number > Math.ceil(sorted.length * 0.65)).map(b => b.content).join('\n\n') || '',
        outro: sorted[sorted.length - 1]?.content?.slice(-500) || '',
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration,
      };

      let script;
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

      console.log(`[longViralGenerateScript] ✅ Final script aggregated: ${totalWords} words (~${Math.round(estimatedDuration / 60)}min)`);

      return Response.json({
        success: true,
        done: true,
        script_id: script.id,
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration,
        total_batches: sorted.length,
        remaining: 0,
      });
    }

    return Response.json({
      success: true,
      done: false,
      completed_batch: batch.batch_number,
      batch_word_count: wordCount,
      total_batches: sortedBatches.length,
      remaining,
    });

  } catch (error) {
    console.error('[longViralGenerateScript] Error:', error.message);
    const msg = error.message || 'Unknown error';
    let code = 500;
    if (/credit balance|billing|purchase credits/i.test(msg)) code = 402;
    else if (/rate limit|too many requests/i.test(msg)) code = 429;
    else if (/api key|unauthorized|authentication/i.test(msg)) code = 401;
    return Response.json({ error: msg }, { status: code });
  }
});