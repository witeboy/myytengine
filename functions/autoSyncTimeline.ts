import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// BEAT SYNC ENGINE — Media-Aware Duration + Narrative Transitions
// ══════════════════════════════════════════════════════════════════
//
// ONE backend call does everything:
//   1. Word-count proportional duration distribution
//   2. Media-type constraints (video 6s cap, image unlimited)
//   3. Minimum 3s enforcement + redistribution
//   4. Normalization to exact voiceover duration
//   5. Transition analysis (OpenAI narrative cues)
//   6. Transition rules enforcement
//
// Returns data only — frontend applies incrementally.
// ══════════════════════════════════════════════════════════════════

const MAX_VIDEO_DURATION = 6.0; // Grok/Runway max video length
const MIN_SCENE_DURATION = 3.0;
const WORDS_PER_SECOND = 2.5;   // Average narration speed

// ══════════════════════════════════════════════════════════════════
// PHASE 1: Media-Aware Duration Distribution
// ══════════════════════════════════════════════════════════════════

function computeDurations(scenes, totalVoDuration) {
  // Step 1: Calculate word counts
  const sceneData = scenes.map(s => {
    const words = (s.narration_text || '').split(/\s+/).filter(Boolean).length;
    const hasVideo = s.video_url && s.video_url.startsWith('http') &&
      !s.video_url.startsWith('http://placeholder');
    const hasImage = s.image_url && s.image_url.startsWith('http');

    let mediaType = 'none';
    if (hasVideo) mediaType = 'video';
    else if (hasImage) mediaType = 'image';

    return {
      scene_id: s.id,
      scene_number: s.scene_number,
      word_count: words,
      media_type: mediaType,
      narration_text: s.narration_text || '',
    };
  });

  const totalWords = sceneData.reduce((sum, s) => sum + s.word_count, 0);

  // Step 2: Raw proportional distribution based on word count
  if (totalWords > 0) {
    sceneData.forEach(s => {
      s.raw_duration = (s.word_count / totalWords) * totalVoDuration;
    });
  } else {
    // Equal distribution if no narration
    const perScene = totalVoDuration / sceneData.length;
    sceneData.forEach(s => { s.raw_duration = perScene; });
  }

  // Step 3: Enforce minimum 3s per scene
  let deficit = 0;
  sceneData.forEach(s => {
    if (s.raw_duration < MIN_SCENE_DURATION) {
      deficit += MIN_SCENE_DURATION - s.raw_duration;
      s.raw_duration = MIN_SCENE_DURATION;
    }
  });

  // Redistribute deficit from scenes above minimum (proportionally)
  if (deficit > 0) {
    const aboveMin = sceneData.filter(s => s.raw_duration > MIN_SCENE_DURATION);
    const aboveTotal = aboveMin.reduce((sum, s) => sum + s.raw_duration, 0);
    if (aboveTotal > 0) {
      aboveMin.forEach(s => {
        const share = (s.raw_duration / aboveTotal) * deficit;
        s.raw_duration = Math.max(MIN_SCENE_DURATION, s.raw_duration - share);
      });
    }
  }

  // Step 4: Identify video scenes that exceed 6s — tag as "video_with_hold"
  // The video plays for 6s, then the last frame holds as a still for the remainder.
  // Duration stays at full narration allocation — media strategy handles the crossfade.
  sceneData.forEach(s => {
    s.video_hold = (s.media_type === 'video' && s.raw_duration > MAX_VIDEO_DURATION);
    s.video_play_seconds = s.video_hold ? MAX_VIDEO_DURATION : s.raw_duration;
  });

  // Step 5: Normalize to exact voiceover duration
  const rawTotal = sceneData.reduce((sum, s) => sum + s.raw_duration, 0);
  const scale = totalVoDuration / rawTotal;
  sceneData.forEach(s => {
    s.duration_seconds = Math.max(MIN_SCENE_DURATION, Math.round(s.raw_duration * scale * 10) / 10);
  });

  // Final adjustment — add/subtract remaining difference from longest scene
  const adjustedTotal = sceneData.reduce((sum, s) => sum + s.duration_seconds, 0);
  const diff = Math.round((totalVoDuration - adjustedTotal) * 10) / 10;
  if (Math.abs(diff) > 0.05) {
    const longestIdx = sceneData.reduce((mi, s, i, arr) =>
      s.duration_seconds > arr[mi].duration_seconds ? i : mi, 0);
    sceneData[longestIdx].duration_seconds =
      Math.max(MIN_SCENE_DURATION, Math.round((sceneData[longestIdx].duration_seconds + diff) * 10) / 10);
  }

  // Recompute video_hold after normalization
  sceneData.forEach(s => {
    s.video_hold = (s.media_type === 'video' && s.duration_seconds > MAX_VIDEO_DURATION);
    s.video_play_seconds = s.video_hold
      ? MAX_VIDEO_DURATION
      : (s.media_type === 'video' ? Math.min(s.duration_seconds, MAX_VIDEO_DURATION) : s.duration_seconds);
  });

  return sceneData;
}


// ══════════════════════════════════════════════════════════════════
// PHASE 2: Narrative-Aware Transition Analysis
// ══════════════════════════════════════════════════════════════════

async function analyzeTransitions(sceneData, openaiKey) {
  // For small projects (≤50 scenes), use LLM for intelligent transitions.
  // For large projects, use pure rule-based heuristics.

  const totalScenes = sceneData.length;

  if (totalScenes <= 50 && openaiKey) {
    try {
      return await analyzeTransitionsLLM(sceneData, openaiKey);
    } catch (err) {
      console.warn(`LLM transition analysis failed: ${err.message} — using rules`);
    }
  }

  // Rule-based fallback (also used for 50+ scenes)
  return analyzeTransitionsRuleBased(sceneData);
}

async function analyzeTransitionsLLM(sceneData, openaiKey) {
  // Build compact scene summaries — first/last 20 words of narration
  const summaries = sceneData.map(s => {
    const words = s.narration_text.split(/\s+/);
    const first = words.slice(0, 15).join(' ');
    const last = words.length > 20 ? '...' + words.slice(-10).join(' ') : '';
    return `S${s.scene_number} [${s.duration_seconds}s ${s.media_type}]: "${first}${last}"`;
  }).join('\n');

  const prompt = `You are a professional film editor. Analyze scene transitions for a video.

SCENES:
${summaries}

For each scene, decide the transition INTO it.
Rules:
- "cut" (0s): default, 70-80% of all transitions. Same topic continuation.
- "dissolve" (0.7s): mood/topic shift, time passing, perspective change.
- "fade_to_black" (1.2s): major act break, chapter divider. MAX 3 total.
- "fade_from_black" (1.0s): scene 1 ONLY.

Look for these cues in narration:
- Time jumps: "years later", "the next day", "meanwhile" → dissolve or fade
- Topic shifts: completely new subject → dissolve
- Emotional pivots: hope→despair, calm→urgent → dissolve
- Continuity: "first...second...third" → cut
- Act breaks: conclusion of major argument → fade_to_black

Return JSON array with exactly ${sceneData.length} entries:
[{"scene_number":1,"transition":"fade_from_black","duration":1.0,"reason":"Opening"}]

CRITICAL: 70%+ must be "cut". Only cut/dissolve/fade_to_black/fade_from_black allowed.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a professional film editor. Always respond in valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}`);

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '{}';
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch (_) {
    // Try extracting array from markdown fences
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) parsed = JSON.parse(fenced[1]);
    else throw new Error('JSON parse failed');
  }

  // Handle both { transitions: [...] } and direct [...]
  const transitions = Array.isArray(parsed) ? parsed : (parsed.transitions || []);

  if (transitions.length < sceneData.length * 0.5) {
    throw new Error(`Only got ${transitions.length} transitions for ${sceneData.length} scenes`);
  }

  console.log(`✓ LLM returned ${transitions.length} transition suggestions`);

  return transitions.map((t, i) => ({
    scene_number: t.scene_number || sceneData[i]?.scene_number || i + 1,
    transition_type: (t.transition || t.type || 'cut').toLowerCase().replace(/\s+/g, '_'),
    transition_duration: parseFloat(t.duration || t.transition_duration || 0) || 0,
    reason: t.reason || '',
  }));
}

function analyzeTransitionsRuleBased(sceneData) {
  return sceneData.map((scene, i) => {
    // Scene 1: always fade from black
    if (i === 0) return {
      scene_number: scene.scene_number,
      transition_type: 'fade_from_black',
      transition_duration: 1.0,
      reason: 'Opening shot',
    };

    // Last scene: always fade to black
    if (i === sceneData.length - 1) return {
      scene_number: scene.scene_number,
      transition_type: 'fade_to_black',
      transition_duration: 1.5,
      reason: 'Closing shot',
    };

    // Analyze narration for transition cues
    const prevNarration = (sceneData[i - 1].narration_text || '').toLowerCase();
    const currNarration = (scene.narration_text || '').toLowerCase();

    // Time jump cues
    const timeJumpCues = ['years later', 'months later', 'the next day', 'the next morning',
      'fast forward', 'looking back', 'in the beginning', 'once upon', 'meanwhile',
      'on the other side', 'across the world', 'back in'];
    const hasTimeJump = timeJumpCues.some(cue => currNarration.includes(cue));
    if (hasTimeJump) return {
      scene_number: scene.scene_number,
      transition_type: 'fade_to_black',
      transition_duration: 1.2,
      reason: 'Time/location jump detected in narration',
    };

    // Topic shift: check word overlap between adjacent scenes
    const prevWords = new Set(prevNarration.split(/\s+/).filter(w => w.length > 4));
    const currWords = new Set(currNarration.split(/\s+/).filter(w => w.length > 4));
    const overlap = [...currWords].filter(w => prevWords.has(w)).length;
    const similarity = overlap / Math.max(currWords.size, 1);

    // Structural cues — "but", "however", "on the other hand" at the start
    const pivotCues = ['but ', 'however', 'on the other hand', 'in contrast',
      'nevertheless', 'yet ', 'instead', 'surprisingly'];
    const hasPivot = pivotCues.some(cue => currNarration.startsWith(cue));

    // Dissolve for topic shifts or pivots (but only ~15-20% of scenes)
    if ((similarity < 0.03 || hasPivot) && i % 3 === 0) return {
      scene_number: scene.scene_number,
      transition_type: 'dissolve',
      transition_duration: 0.7,
      reason: hasPivot ? 'Narrative pivot' : 'Topic shift (low word overlap)',
    };

    // Default: cut
    return {
      scene_number: scene.scene_number,
      transition_type: 'cut',
      transition_duration: 0,
      reason: 'Continuous flow',
    };
  });
}


// ══════════════════════════════════════════════════════════════════
// PHASE 3: Cinematographic Rules Engine
// ══════════════════════════════════════════════════════════════════

function enforceRules(transitions, sceneData) {
  const VALID_TYPES = ['cut', 'dissolve', 'fade_to_black', 'fade_from_black'];
  const DURATION_MAP = {
    cut: 0,
    dissolve: 0.7,
    fade_to_black: 1.2,
    fade_from_black: 1.0,
  };

  // ── Pass 1: Sanitize types and durations ────────────────────────
  transitions = transitions.map((t, i) => {
    let type = (t.transition_type || 'cut').toLowerCase().replace(/\s+/g, '_');

    // Block amateur transitions
    if (['wipe', 'slide', 'zoom', 'spin', 'flip', 'swipe', 'push', 'fade'].includes(type)) {
      type = type === 'fade' ? 'dissolve' : 'cut';
    }
    if (!VALID_TYPES.includes(type)) type = 'cut';

    let duration = parseFloat(t.transition_duration || DURATION_MAP[type]) || 0;

    // Clamp durations
    if (type === 'cut') duration = 0;
    if (type === 'dissolve') duration = Math.max(0.4, Math.min(1.0, duration));
    if (type === 'fade_to_black') duration = Math.max(0.6, Math.min(1.5, duration));
    if (type === 'fade_from_black') duration = Math.max(0.6, Math.min(1.2, duration));

    return { ...t, transition_type: type, transition_duration: Math.round(duration * 10) / 10 };
  });

  // ── Rule 1: Scene 1 = fade_from_black ───────────────────────────
  if (transitions.length > 0) {
    transitions[0].transition_type = 'fade_from_black';
    transitions[0].transition_duration = 1.0;
    transitions[0].reason = 'Opening — fade from black';
  }

  // ── Rule 2: Last scene = fade_to_black ──────────────────────────
  if (transitions.length > 1) {
    transitions[transitions.length - 1].transition_type = 'fade_to_black';
    transitions[transitions.length - 1].transition_duration = 1.5;
    transitions[transitions.length - 1].reason = 'Closing — fade to black';
  }

  // ── Rule 3: Short scenes (< 4s) forced to cut ──────────────────
  transitions.forEach((t, i) => {
    if (i === 0 || i === transitions.length - 1) return; // skip enforced first/last
    const scene = sceneData.find(s => s.scene_number === t.scene_number);
    if (scene && scene.duration_seconds < 4 && t.transition_type !== 'cut') {
      t.transition_type = 'cut';
      t.transition_duration = 0;
      t.reason += ' (forced cut: scene < 4s)';
    }
  });

  // ── Rule 4: Max 3 fade_to_black total ───────────────────────────
  let fadeCount = 0;
  for (let i = 1; i < transitions.length - 1; i++) {
    if (transitions[i].transition_type === 'fade_to_black') {
      fadeCount++;
      if (fadeCount > 3) {
        transitions[i].transition_type = 'dissolve';
        transitions[i].transition_duration = 0.8;
        transitions[i].reason += ' (downgraded: max 3 fades)';
      }
    }
  }

  // ── Rule 5: Max 2 consecutive dissolves ─────────────────────────
  let consecutiveDissolves = 0;
  for (let i = 1; i < transitions.length - 1; i++) {
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
  const middleTransitions = transitions.slice(1, -1);
  const nonCutCount = middleTransitions.filter(t => t.transition_type !== 'cut').length;
  const maxNonCut = Math.floor(middleTransitions.length * 0.30);

  if (nonCutCount > maxNonCut) {
    let excess = nonCutCount - maxNonCut;
    // Demote dissolves first (weakest), back to front
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
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const openaiKey = Deno.env.get('OPENAI_API_KEY');

    // ── Fetch project, scenes, production settings ────────────────
    const [projects, allScenes, prodSettings] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scenes.filter({ project_id }),
      base44.asServiceRole.entities.ProductionSettings.filter({ project_id }),
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const scenes = allScenes.sort((a, b) => a.scene_number - b.scene_number);
    if (scenes.length === 0) return Response.json({ error: 'No scenes found' }, { status: 400 });

    const voiceoverUrl = prodSettings[0]?.voiceover_url;
    const totalVoDuration = prodSettings[0]?.total_duration_seconds ||
      prodSettings[0]?.voiceover_duration_seconds || 0;

    if (!voiceoverUrl || totalVoDuration <= 0) {
      return Response.json({
        error: 'No voiceover audio found. Generate voiceover first.',
      }, { status: 400 });
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎵 Beat Sync: ${scenes.length} scenes · ${totalVoDuration}s voiceover`);

    // ══════════════════════════════════════════════════════════════
    // PHASE 1: Compute media-aware durations
    // ══════════════════════════════════════════════════════════════
    const sceneData = computeDurations(scenes, totalVoDuration);

    console.log(`✓ Durations computed:`);
    console.log(`  Videos: ${sceneData.filter(s => s.media_type === 'video').length}`);
    console.log(`  Images: ${sceneData.filter(s => s.media_type === 'image').length}`);
    console.log(`  Video+hold: ${sceneData.filter(s => s.video_hold).length}`);
    console.log(`  Total: ${sceneData.reduce((sum, s) => sum + s.duration_seconds, 0).toFixed(1)}s`);

    // ══════════════════════════════════════════════════════════════
    // PHASE 2: Analyze transitions
    // ══════════════════════════════════════════════════════════════
    let transitions = await analyzeTransitions(sceneData, openaiKey);

    // ══════════════════════════════════════════════════════════════
    // PHASE 3: Enforce cinematographic rules
    // ══════════════════════════════════════════════════════════════
    transitions = enforceRules(transitions, sceneData);

    // ── Build stats ───────────────────────────────────────────────
    const stats = {
      total_scenes: sceneData.length,
      total_duration: totalVoDuration,
      video_scenes: sceneData.filter(s => s.media_type === 'video').length,
      image_scenes: sceneData.filter(s => s.media_type === 'image').length,
      no_media_scenes: sceneData.filter(s => s.media_type === 'none').length,
      video_holds: sceneData.filter(s => s.video_hold).length,
      cuts: transitions.filter(t => t.transition_type === 'cut').length,
      dissolves: transitions.filter(t => t.transition_type === 'dissolve').length,
      fades: transitions.filter(t =>
        t.transition_type === 'fade_to_black' || t.transition_type === 'fade_from_black'
      ).length,
      cut_percentage: 0,
    };
    stats.cut_percentage = Math.round((stats.cuts / Math.max(stats.total_scenes, 1)) * 100);

    console.log(`✓ Transitions: ${stats.cuts} cuts (${stats.cut_percentage}%) · ${stats.dissolves} dissolves · ${stats.fades} fades`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ── Return to frontend — NO DB writes ─────────────────────────
    return Response.json({
      success: true,
      apply_mode: 'frontend',
      total_duration: totalVoDuration,
      scene_durations: sceneData.map(s => ({
        scene_id: s.scene_id,
        scene_number: s.scene_number,
        duration_seconds: s.duration_seconds,
        media_type: s.media_type,
        video_hold: s.video_hold,
        video_play_seconds: s.video_play_seconds,
      })),
      transitions: transitions.map(t => {
        const scene = sceneData.find(s => s.scene_number === t.scene_number);
        return {
          scene_id: scene?.scene_id,
          scene_number: t.scene_number,
          transition_type: t.transition_type,
          transition_duration: t.transition_duration,
          reason: t.reason,
        };
      }),
      stats,
    });

  } catch (error) {
    console.error('autoSyncTimeline error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});