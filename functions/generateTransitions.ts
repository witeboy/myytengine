import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// TRANSITION ENGINE — NARRATIVE-AWARE CINEMATOGRAPHIC TRANSITIONS
// ══════════════════════════════════════════════════════════════════
//
// PIPELINE POSITION:
//   generateVoiceover → generateTimeline → [THIS] → generateTimelinePreview
//
// WHAT IT DOES:
//   Reads ALL TimingEntries, sends ONE Gemini call with full narrative
//   context, receives a transition map, applies cinematographic rules,
//   updates each TimingEntry with smart transitions.
//
// TRANSITION MODEL: OVERLAP
//   Transitions are visual overlaps between scenes. Scene A and B
//   both render simultaneously during a dissolve. The voiceover plays
//   continuously — transitions are purely visual, no time is stolen.
//   The renderer handles the overlap based on transition_duration.
//
// AVAILABLE TRANSITIONS:
//   cut             (0s)     — 70-80% of all transitions. Invisible, fast.
//   dissolve        (0.5-1s) — Mood shift, time passing, gentle pivot.
//   fade_to_black   (0.8-1.5s) — Act break, major topic shift, chapter divider.
//   fade_from_black (0.8-1s) — Opening shot ONLY (scene 1).
//
// HARD RULES (enforced after AI, non-negotiable):
//   1. Scene 1 = fade_from_black (1s)
//   2. Last scene = fade_to_black (1.5s) 
//   3. Minimum 70% of transitions must be 'cut'
//   4. Scene under 4s → forced to 'cut' (dissolve would eat half)
//   5. Max 2 dissolves in a row
//   6. Max 3 fade_to_black in entire video
//   7. No wipe/slide/zoom (these are amateur, not used in pro content)
// ══════════════════════════════════════════════════════════════════

function extractJSON(text) {
  let jsonStr = text;
  if (text.includes('```json')) jsonStr = text.split('```json')[1].split('```')[0].trim();
  else if (text.includes('```')) jsonStr = text.split('```')[1].split('```')[0].trim();

  // Try direct parse
  try { return JSON.parse(jsonStr); } catch (_) {}

  // Try extracting object/array
  const start = jsonStr.indexOf('[');
  const end = jsonStr.lastIndexOf(']');
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(jsonStr.substring(start, end + 1)); } catch (_) {}
  }

  // Try object
  const objStart = jsonStr.indexOf('{');
  const objEnd = jsonStr.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1) {
    try {
      const obj = JSON.parse(jsonStr.substring(objStart, objEnd + 1));
      return obj.transitions || [obj];
    } catch (_) {}
  }

  throw new Error('Failed to parse Gemini transition response');
}

// ══════════════════════════════════════════════════════════════════
// CINEMATOGRAPHIC RULES ENGINE
// ══════════════════════════════════════════════════════════════════

function enforceRules(transitions, totalScenes) {
  const VALID_TYPES = ['cut', 'dissolve', 'fade_to_black', 'fade_from_black'];
  const DURATION_MAP = {
    cut: 0,
    dissolve: 0.7,
    fade_to_black: 1.2,
    fade_from_black: 1.0
  };

  // ── Pass 1: Sanitize — force valid types and durations ──────────
  transitions = transitions.map((t, i) => {
    let type = (t.transition || t.type || 'cut').toLowerCase().replace(/\s+/g, '_');

    // Block amateur transitions
    if (['wipe', 'slide', 'zoom', 'spin', 'flip', 'swipe', 'push'].includes(type)) {
      type = 'cut';
    }

    if (!VALID_TYPES.includes(type)) type = 'cut';

    let duration = parseFloat(t.duration || t.transition_duration || DURATION_MAP[type]) || 0;

    // Clamp durations
    if (type === 'cut') duration = 0;
    if (type === 'dissolve') duration = Math.max(0.4, Math.min(1.0, duration));
    if (type === 'fade_to_black') duration = Math.max(0.6, Math.min(1.5, duration));
    if (type === 'fade_from_black') duration = Math.max(0.6, Math.min(1.2, duration));

    return {
      scene_number: t.scene_number || i + 1,
      transition_type: type,
      transition_duration: Math.round(duration * 10) / 10,
      reason: t.reason || ''
    };
  });

  // ── Rule 1: Scene 1 ALWAYS fade_from_black ──────────────────────
  if (transitions.length > 0) {
    transitions[0].transition_type = 'fade_from_black';
    transitions[0].transition_duration = 1.0;
    transitions[0].reason = 'Opening shot — always fade from black';
  }

  // ── Rule 2: Last scene ALWAYS fade_to_black ─────────────────────
  if (transitions.length > 1) {
    const last = transitions[transitions.length - 1];
    last.transition_type = 'fade_to_black';
    last.transition_duration = 1.5;
    last.reason = 'Closing shot — always fade to black';
  }

  // ── Rule 3: Short scenes (< 4s) forced to cut ──────────────────
  // (We'll check this in the main function where we have duration data)

  // ── Rule 4: Max 3 fade_to_black total ───────────────────────────
  let fadeToBlackCount = 0;
  for (let i = 1; i < transitions.length; i++) {
    if (transitions[i].transition_type === 'fade_to_black') {
      fadeToBlackCount++;
      if (fadeToBlackCount > 3) {
        transitions[i].transition_type = 'dissolve';
        transitions[i].transition_duration = 0.8;
        transitions[i].reason += ' (downgraded: max 3 fade_to_black)';
      }
    }
  }

  // ── Rule 5: Max 2 dissolves in a row ────────────────────────────
  let consecutiveDissolves = 0;
  for (let i = 1; i < transitions.length - 1; i++) { // skip first and last (enforced above)
    if (transitions[i].transition_type === 'dissolve') {
      consecutiveDissolves++;
      if (consecutiveDissolves > 2) {
        transitions[i].transition_type = 'cut';
        transitions[i].transition_duration = 0;
        transitions[i].reason += ' (downgraded: max 2 consecutive dissolves)';
        consecutiveDissolves = 0;
      }
    } else {
      consecutiveDissolves = 0;
    }
  }

  // ── Rule 6: Enforce minimum 70% cuts ────────────────────────────
  // Count non-cut transitions (excluding first and last which are enforced)
  const middleTransitions = transitions.slice(1, -1);
  const nonCutCount = middleTransitions.filter(t => t.transition_type !== 'cut').length;
  const maxNonCut = Math.floor(middleTransitions.length * 0.30);

  if (nonCutCount > maxNonCut) {
    // Too many non-cuts. Demote weakest dissolves back to cuts.
    // Prefer keeping dissolves that have explicit reasons (topic shifts)
    let excess = nonCutCount - maxNonCut;

    for (let i = transitions.length - 2; i >= 1 && excess > 0; i--) {
      if (transitions[i].transition_type === 'dissolve') {
        transitions[i].transition_type = 'cut';
        transitions[i].transition_duration = 0;
        transitions[i].reason += ' (downgraded: 70% cut minimum)';
        excess--;
      }
    }
  }

  return transitions;
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

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    // ── Fetch project ─────────────────────────────────────────────
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ── Fetch timing entries (must exist from generateTimeline) ───
    const allEntries = await base44.asServiceRole.entities.TimingEntries.filter({ project_id });
    const entries = allEntries.sort((a, b) => (a.entry_order || 0) - (b.entry_order || 0));

    if (entries.length < 2) {
      return Response.json({
        error: 'Need at least 2 timing entries. Run generateTimeline first.',
        gate_failed: 'timeline'
      }, { status: 400 });
    }

    console.log(`🎬 Analyzing ${entries.length} scenes for transitions`);

    // ══════════════════════════════════════════════════════════════
    // BUILD SCENE SUMMARY FOR GEMINI (ONE CALL)
    // ══════════════════════════════════════════════════════════════
    // Send complete narrative context so Gemini understands the
    // full emotional arc, topic flow, and pacing.

    const sceneSummaries = entries.map((entry, i) => {
      const narration = (entry.spoken_text || '').substring(0, 150);
      const concept = (entry.scene_concept || '').substring(0, 100);
      return `Scene ${entry.entry_order}: [${entry.duration_seconds}s] "${narration}" | Visual: ${concept}`;
    }).join('\n');

    const prompt = `You are a professional film editor analyzing scene transitions for a YouTube video.

Here are ALL scenes in order with their narration and visual concepts:

${sceneSummaries}

TOTAL SCENES: ${entries.length}
VIDEO DURATION: ${entries.reduce((sum, e) => sum + (e.duration_seconds || 0), 0).toFixed(1)}s

Analyze the narrative arc and decide the transition INTO each scene.
Consider:
- Topic continuity: same topic = cut, topic change = dissolve
- Emotional shifts: calm→intense or intense→calm = dissolve
- Time jumps: flashback, "years later", new era = fade_to_black
- Act breaks: major structural shifts in the story = fade_to_black
- Pacing: rapid sequences should use cuts, slower moments can dissolve
- Scene 1 should be fade_from_black (video opening)
- Last scene should be fade_to_black (video ending)

AVAILABLE TRANSITIONS ONLY:
- "cut" (instant, 0s) — use for 70-80% of transitions
- "dissolve" (0.5-1s) — use for mood shifts, gentle topic changes
- "fade_to_black" (0.8-1.5s) — use SPARINGLY for major act breaks only (max 2-3 total)
- "fade_from_black" (1s) — scene 1 only

Return a JSON array with exactly ${entries.length} objects:
[
  { "scene_number": 1, "transition": "fade_from_black", "duration": 1.0, "reason": "Opening" },
  { "scene_number": 2, "transition": "cut", "duration": 0, "reason": "Continues same topic" },
  ...
]

CRITICAL: At least 70% must be "cut". Use dissolve and fade sparingly. No wipe/slide/zoom.
Return ONLY the JSON array, nothing else.`;

    // ══════════════════════════════════════════════════════════════
    // SINGLE GEMINI CALL
    // ══════════════════════════════════════════════════════════════

    let aiTransitions = null;

    try {
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        throw new Error(`Gemini ${geminiResponse.status}: ${errText}`);
      }

      const geminiData = await geminiResponse.json();
      const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      aiTransitions = extractJSON(responseText);

      if (!Array.isArray(aiTransitions)) {
        aiTransitions = aiTransitions.transitions || [];
      }

      console.log(`✓ Gemini returned ${aiTransitions.length} transition suggestions`);

    } catch (geminiErr) {
      console.warn(`⚠ Gemini failed (${geminiErr.message}), using rule-based fallback`);
      aiTransitions = null;
    }

    // ══════════════════════════════════════════════════════════════
    // BUILD TRANSITION MAP
    // ══════════════════════════════════════════════════════════════
    // If Gemini succeeded, use its suggestions + enforce rules.
    // If Gemini failed, apply pure rule-based transitions.

    let transitionMap;

    if (aiTransitions && aiTransitions.length >= entries.length * 0.5) {
      // Merge AI suggestions with entry data
      transitionMap = entries.map((entry, i) => {
        const aiSuggestion = aiTransitions.find(t => t.scene_number === entry.entry_order)
          || aiTransitions[i]
          || { transition: 'cut', duration: 0, reason: 'default' };

        return {
          scene_number: entry.entry_order,
          transition: aiSuggestion.transition || aiSuggestion.type || 'cut',
          duration: aiSuggestion.duration || 0,
          reason: aiSuggestion.reason || '',
          entry_duration: entry.duration_seconds || 0
        };
      });
    } else {
      // Rule-based fallback: analyze narration for topic shifts
      transitionMap = entries.map((entry, i) => {
        if (i === 0) return { scene_number: entry.entry_order, transition: 'fade_from_black', duration: 1.0, reason: 'Opening', entry_duration: entry.duration_seconds || 0 };
        if (i === entries.length - 1) return { scene_number: entry.entry_order, transition: 'fade_to_black', duration: 1.5, reason: 'Closing', entry_duration: entry.duration_seconds || 0 };

        // Simple heuristic: check if narration topic changes significantly
        const prevWords = new Set((entries[i - 1].spoken_text || '').toLowerCase().split(/\s+/));
        const currWords = new Set((entry.spoken_text || '').toLowerCase().split(/\s+/));
        const overlap = [...currWords].filter(w => prevWords.has(w) && w.length > 4).length;
        const similarity = overlap / Math.max(currWords.size, 1);

        // Low word overlap = topic shift → dissolve (but only sometimes)
        if (similarity < 0.05 && i % 4 === 0) {
          return { scene_number: entry.entry_order, transition: 'dissolve', duration: 0.7, reason: 'Topic shift detected', entry_duration: entry.duration_seconds || 0 };
        }

        return { scene_number: entry.entry_order, transition: 'cut', duration: 0, reason: 'Continuous flow', entry_duration: entry.duration_seconds || 0 };
      });
    }

    // ══════════════════════════════════════════════════════════════
    // ENFORCE CINEMATOGRAPHIC RULES
    // ══════════════════════════════════════════════════════════════

    transitionMap = enforceRules(transitionMap, entries.length);

    // Rule: short scenes (< 4s) forced to cut
    for (const t of transitionMap) {
      if (t.transition_type !== 'fade_from_black' && t.transition_type !== 'fade_to_black') {
        const entryDuration = entries.find(e => e.entry_order === t.scene_number)?.duration_seconds || 0;
        if (entryDuration < 4 && t.transition_type !== 'cut') {
          t.transition_type = 'cut';
          t.transition_duration = 0;
          t.reason += ' (forced cut: scene < 4s)';
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // UPDATE TIMING ENTRIES IN DATABASE
    // ══════════════════════════════════════════════════════════════

    const results = [];

    for (const t of transitionMap) {
      const entry = entries.find(e => e.entry_order === t.scene_number);
      if (!entry) continue;

      try {
        await base44.asServiceRole.entities.TimingEntries.update(entry.id, {
          transition_type: t.transition_type,
          transition_duration: t.transition_duration,
          transition_reason: t.reason
        });

        results.push({
          scene_number: t.scene_number,
          transition_type: t.transition_type,
          transition_duration: t.transition_duration,
          reason: t.reason
        });

        console.log(
          `Scene ${t.scene_number}: ${t.transition_type} (${t.transition_duration}s) — ${t.reason}`
        );
      } catch (updateErr) {
        console.error(`Failed to update scene ${t.scene_number}: ${updateErr.message}`);
      }
    }

    // ── Stats ──────────────────────────────────────────────────────
    const stats = {
      total: results.length,
      cuts: results.filter(r => r.transition_type === 'cut').length,
      dissolves: results.filter(r => r.transition_type === 'dissolve').length,
      fade_to_black: results.filter(r => r.transition_type === 'fade_to_black').length,
      fade_from_black: results.filter(r => r.transition_type === 'fade_from_black').length,
    };

    stats.cut_percentage = Math.round((stats.cuts / Math.max(stats.total, 1)) * 100);

    // ── Update project status ─────────────────────────────────────
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'transitions_applied'
    });

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Transitions applied: ${stats.total} scenes`);
    console.log(`  cuts: ${stats.cuts} (${stats.cut_percentage}%) | dissolves: ${stats.dissolves} | fades: ${stats.fade_to_black + stats.fade_from_black}`);
    console.log(`  Source: ${aiTransitions ? 'Gemini + rules' : 'rule-based fallback'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      transitions: results,
      stats,
      source: aiTransitions ? 'gemini_plus_rules' : 'rule_based_fallback'
    });

  } catch (error) {
    console.error(`❌ generateTransitions error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});