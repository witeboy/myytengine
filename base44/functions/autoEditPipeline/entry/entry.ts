import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// AUTO-EDIT PIPELINE
// Takes a topic → extracts keywords → searches stock media →
// assembles timeline with effects/transitions → saves for review
// ══════════════════════════════════════════════════════════════════

const CINEMATIC_MOTIONS = [
  'zoom_in_center', 'zoom_out_center', 'pan_right_zoom', 'pan_left_zoom',
  'push_in_top', 'push_in_bottom', 'diagonal_tl_br', 'diagonal_tr_bl'
];

const TRANSITIONS = ['Black Fade', 'Gradual Fade', 'Expand Fade', 'Overlap Fade'];

async function searchPexels(query, orientation) {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) return [];
  const params = new URLSearchParams({
    query, per_page: '10', page: '1',
    orientation: orientation === 'portrait' ? 'portrait' : 'landscape',
  });
  try {
    const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
      headers: { Authorization: apiKey }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.videos || []).map(v => {
      const files = v.video_files || [];
      const hd = files.find(f => f.quality === 'hd' && f.width >= 1280);
      const sd = files.find(f => f.quality === 'sd');
      const best = hd || sd || files[0];
      return {
        source: 'pexels', id: `pexels-${v.id}`,
        url: best?.link, thumbnail: v.image,
        duration: v.duration, width: best?.width, height: best?.height,
      };
    }).filter(v => v.url);
  } catch { return []; }
}

async function searchPixabay(query) {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey) return [];
  const params = new URLSearchParams({
    key: apiKey, q: query, video_type: 'film',
    per_page: '10', safesearch: 'true', order: 'popular',
  });
  try {
    const res = await fetch(`https://pixabay.com/api/videos/?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || []).map(v => {
      const best = v.videos?.large || v.videos?.medium || v.videos?.small || {};
      return {
        source: 'pixabay', id: `pixabay-${v.id}`,
        url: best.url, thumbnail: `https://i.vimeocdn.com/video/${v.picture_id}_295x166.jpg`,
        duration: v.duration, width: best.width, height: best.height,
      };
    }).filter(v => v.url);
  } catch { return []; }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let job_id = null;

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    job_id = body.job_id;
    if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });

    const jobs = await base44.entities.AutoEditJobs.filter({ id: job_id });
    const job = jobs[0];
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    const update = (data) => base44.entities.AutoEditJobs.update(job_id, data);

    // ── PHASE 1: Extract keywords — SCRIPT-AWARE ──────────────
    await update({ status: 'searching_media', progress: 3, phase_message: 'Loading script and story context...' });

    const topicTitle = job.title;
    const isShort = job.format === 'short';
    const targetDuration = isShort ? 30 : 120;
    const scenesNeeded = isShort ? 5 : 10;

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    let keywords = [];
    let sceneDescriptions = [];

    // ── Gather script + story context if a project exists ──────
    let scriptText = '';
    let storyAnalysis = '';
    let characterDescriptions = '';
    let projectNiche = '';
    let projectTone = '';

    const projectId = job.project_id || null;
    if (projectId) {
      try {
        const [projects, scripts, prodSettings] = await Promise.all([
          base44.entities.Projects.filter({ id: projectId }),
          base44.entities.Scripts.filter({ project_id: projectId }),
          base44.entities.ProductionSettings.filter({ project_id: projectId }),
        ]);
        const project = projects[0];
        if (project) {
          projectNiche = project.niche || '';
          projectTone = project.tone || '';
          characterDescriptions = project.character_descriptions || '';
        }
        // Get best script (prefer final_aggregated → final → edited → draft)
        const scriptPriority = ['final_aggregated', 'final', 'edited', 'draft'];
        let bestScript = null;
        for (const version of scriptPriority) {
          bestScript = scripts.find(s => s.version === version);
          if (bestScript) break;
        }
        if (bestScript?.full_script) {
          scriptText = bestScript.full_script.substring(0, 8000); // Cap for prompt size
          console.log(`📖 Script loaded: ${bestScript.version}, ${scriptText.length} chars`);
        }
        // Story analysis from production settings
        if (prodSettings[0]?.story_analysis) {
          storyAnalysis = prodSettings[0].story_analysis.substring(0, 2000);
          console.log(`📊 Story analysis loaded: ${storyAnalysis.length} chars`);
        }
      } catch (err) {
        console.warn('Script/project fetch failed (non-fatal):', err.message);
      }
    }

    // Also check if there's a channel with niche info
    if (!projectNiche && job.channel_id) {
      try {
        const channels = await base44.entities.Channels.filter({ id: job.channel_id });
        if (channels[0]) {
          projectNiche = channels[0].niche || '';
          projectTone = channels[0].tone || '';
        }
      } catch (_) {}
    }

    const hasScriptContext = scriptText.length > 100;
    await update({ status: 'searching_media', progress: 5, phase_message: hasScriptContext ? 'Analyzing script narrative arc for B-roll matching...' : 'Analyzing topic and extracting search keywords...' });

    if (geminiKey) {
      try {
        // ── Script-aware prompt vs title-only prompt ──────────
        let prompt;
        if (hasScriptContext) {
          prompt = `You are a cinematic B-roll researcher with deep understanding of visual storytelling.

VIDEO TOPIC: "${topicTitle}"
NICHE: ${projectNiche || 'general'}
TONE: ${projectTone || 'dramatic'}
${storyAnalysis ? `\nSTORY ANALYSIS:\n${storyAnalysis}\n` : ''}
${characterDescriptions ? `\nCHARACTERS:\n${characterDescriptions}\n` : ''}

FULL SCRIPT:
${scriptText}

Your job: Break this script into ${scenesNeeded} visual segments and find the PERFECT stock B-roll for each.

CRITICAL RULES:
- Each search keyword must be 2-5 words, optimized for Pexels/Pixabay stock video search
- Keywords must MATCH THE PLOT CONTEXT — not just the surface topic
  Example: If the script says "She lost everything in the market crash" → use "stock market crash screens" or "empty office abandoned", NOT generic "woman sad"
- Follow the NARRATIVE ARC: setup → rising tension → climax → resolution
  - Early scenes: establishing shots, calm environments, world-building
  - Middle scenes: tension visuals, motion, conflict imagery
  - Climax scenes: dramatic visuals, extreme close-ups, high-energy footage
  - Resolution scenes: calm aftermath, hopeful imagery, wide shots
- Match the EMOTIONAL TONE of each script segment
- Use METAPHORICAL visuals when literal footage won't exist (e.g. "time running out" → "hourglass sand falling")
- Provide an "alternative" query as backup in case the primary returns no results
- NO character names, NO branded content, NO text-heavy footage

Return JSON:
{
  "scenes": [
    {
      "keywords": "abandoned factory dark",
      "alternative": "industrial ruins empty",
      "description": "Establishing the world of decay — matches script intro about economic collapse",
      "arc_position": "setup",
      "emotional_tone": "ominous",
      "duration": ${Math.round(targetDuration / scenesNeeded)}
    }
  ]
}

Generate exactly ${scenesNeeded} scenes. Total duration must equal ${targetDuration}s.`;
        } else {
          prompt = `You are a video editor. Given this video topic: "${topicTitle}"
Niche: ${projectNiche || 'general'}, Tone: ${projectTone || 'dramatic'}

Generate ${scenesNeeded} scenes for a ${isShort ? '30-second short-form' : '2-minute'} stock footage video.
For each scene, provide:
- A 2-4 word stock video search keyword (generic, visually descriptive, no proper nouns)
- An alternative search query as backup
- A brief scene description
- Suggested duration in seconds (total must equal ${targetDuration})

Return JSON only:
{
  "scenes": [
    { "keywords": "city skyline night", "alternative": "urban lights aerial", "description": "Establishing shot of city", "duration": 6 }
  ]
}`;
        }

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 8192, responseMimeType: 'application/json' }
            })
          }
        );

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            sceneDescriptions = parsed.scenes || [];
            keywords = sceneDescriptions.map(s => s.keywords);
            if (hasScriptContext) {
              console.log(`🎯 Script-aware B-roll: ${sceneDescriptions.length} scenes mapped to narrative arc`);
              sceneDescriptions.forEach((s, i) => console.log(`  S${i+1} [${s.arc_position || '?'}] "${s.keywords}" — ${s.description?.substring(0, 60)}`));
            }
          }
        }
      } catch (e) {
        console.warn('AI keyword extraction failed:', e.message);
      }
    }

    // Fallback keywords from title
    if (keywords.length === 0) {
      const words = topicTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
      for (let i = 0; i < scenesNeeded; i++) {
        keywords.push(words.slice(i % words.length, i % words.length + 3).join(' ') || topicTitle);
      }
      sceneDescriptions = keywords.map((kw, i) => ({
        keywords: kw, alternative: topicTitle, description: `Scene ${i + 1}`, duration: Math.round(targetDuration / scenesNeeded)
      }));
    }

    await update({ progress: 15, phase_message: `${hasScriptContext ? '📖 Script-aware: ' : ''}${keywords.length} scene keywords mapped, searching stock libraries...`, keywords_used: JSON.stringify(keywords) });

    // ── PHASE 2: Search stock media — PARALLEL across all scenes + DE-DUPE ──
    const orientation = job.orientation || 'landscape';
    await update({ progress: 20, phase_message: `Searching stock libraries for ${sceneDescriptions.length} scenes in parallel...` });

    const sceneSearches = await Promise.all(sceneDescriptions.map(async (scene) => {
      const primaryQuery = scene.keywords;
      const altQuery = scene.alternative || '';
      const [pexels, pixabay] = await Promise.all([
        searchPexels(primaryQuery, orientation),
        searchPixabay(primaryQuery),
      ]);
      let combined = [...pexels, ...pixabay];
      if (combined.length === 0 && altQuery) {
        const [altPexels, altPixabay] = await Promise.all([
          searchPexels(altQuery, orientation),
          searchPixabay(altQuery),
        ]);
        combined = [...altPexels, ...altPixabay];
      }
      return { scene, candidates: combined };
    }));

    // Stock-diversity guard — never use same clip twice across the edit
    const usedClipIds = new Set();
    const allScenes = [];
    for (let i = 0; i < sceneSearches.length; i++) {
      const { scene, candidates } = sceneSearches[i];
      // Prefer candidates not yet used, then by best duration match
      const sorted = candidates
        .filter(c => !usedClipIds.has(c.id))
        .sort((a, b) => {
          const aDurDiff = Math.abs((a.duration || 10) - scene.duration);
          const bDurDiff = Math.abs((b.duration || 10) - scene.duration);
          return aDurDiff - bDurDiff;
        });
      let bestClip = sorted[0] || candidates[0]; // fall back if all used

      if (!bestClip) {
        // No results at all — generic fallback
        const fallback = await searchPexels('abstract background', orientation);
        bestClip = fallback.find(c => !usedClipIds.has(c.id)) || fallback[0];
      }

      if (bestClip?.id) usedClipIds.add(bestClip.id);

      allScenes.push({
        sceneNumber: i + 1,
        keywords: scene.keywords,
        description: scene.description,
        arcPosition: scene.arc_position || null,
        emotionalTone: scene.emotional_tone || null,
        targetDuration: scene.duration,
        videoUrl: bestClip?.url || null,
        thumbnail: bestClip?.thumbnail || null,
        videoDuration: bestClip?.duration || scene.duration,
        source: bestClip?.source || 'none',
        sourceId: bestClip?.id || null,
        width: bestClip?.width,
        height: bestClip?.height,
      });
    }

    await update({ status: 'assembling_timeline', progress: 55, phase_message: `Found media for ${allScenes.filter(s => s.videoUrl).length}/${allScenes.length} scenes. Assembling timeline...` });

    // ── PHASE 3: Assemble timeline with effects + audio ducking ──
    let offset = 0;
    const timelineClips = allScenes.map((scene, idx) => {
      const duration = scene.targetDuration || 5;
      const motionId = CINEMATIC_MOTIONS[idx % CINEMATIC_MOTIONS.length];
      const transition = idx < allScenes.length - 1
        ? TRANSITIONS[idx % TRANSITIONS.length]
        : null;

      // ── Audio ducking: simulate narration peaks for broadcast-style mix ──
      // Every scene is assumed to have narration over B-roll.
      // Duck B-roll audio to -18dB during narration, fade in/out at boundaries.
      const duckFadeIn = 0.3;  // seconds — fade B-roll audio down at scene start
      const duckFadeOut = 0.5; // seconds — fade B-roll audio back up at scene end
      const narrationGap = duration > 6 ? 0.8 : 0.3; // breathing room at end of each scene

      const clip = {
        id: `auto-${idx}`,
        sceneNumber: scene.sceneNumber,
        type: 'video',
        startTime: offset,
        duration,
        label: scene.description || `Scene ${scene.sceneNumber}`,
        imageUrl: scene.thumbnail,
        videoUrl: scene.videoUrl,
        brollUrl: scene.videoUrl,
        brollSource: scene.source,
        mediaType: 'broll',
        cinematicMotion: motionId,
        motionSpeed: 0.8 + Math.random() * 0.4,
        motionIntensity: 0.8 + Math.random() * 0.4,
        transition,
        transitionDuration: transition ? (0.4 + Math.random() * 0.4) : null,
        // If clip is longer than scene: play at 1.0x (clip will be trimmed).
        // If clip is shorter: loop it (playbackRate 1.0 + loop flag) rather than slowing to <0.5x which looks broken.
        playbackRate: 1.0,
        loopToFill: scene.videoDuration && duration > scene.videoDuration,
        videoDuration: scene.videoDuration,
        effects: [],
        synced: true,
        // Metadata
        keywords: scene.keywords,
        alternativeKeywords: scene.alternativeKeywords || scene.alternative || '',
        arcPosition: scene.arcPosition || null,
        emotionalTone: scene.emotionalTone || null,
        stockSource: scene.source,
        stockId: scene.sourceId,
        // ── Audio ducking envelope ──
        // Describes how B-roll audio should behave relative to narration
        audioDucking: {
          enabled: true,
          brollVolume: 0.12,        // Base B-roll volume during narration (0-1) ~= -18dB
          brollVolumeNoDuck: 0.6,   // B-roll volume when no narration playing
          narrationVolume: 1.0,     // Narration at full
          duckFadeInSec: duckFadeIn,
          duckFadeOutSec: duckFadeOut,
          narrationGapSec: narrationGap,
          // Keyframe envelope: [{time, volume}] relative to clip start
          envelope: [
            { time: 0, volume: 0.6 },                              // B-roll starts audible
            { time: duckFadeIn, volume: 0.12 },                    // Duck down for narration
            { time: duration - narrationGap - duckFadeOut, volume: 0.12 }, // Stay ducked
            { time: duration - narrationGap, volume: 0.6 },        // Fade up in gap
            { time: duration, volume: 0.6 },                       // Full at boundary
          ],
        },
        audioMuted: false,
      };
      offset += duration;
      return clip;
    });

    await update({
      status: 'applying_effects',
      progress: 75,
      phase_message: 'Applied cinematic motions, transitions, and audio ducking to all clips...',
      scenes_data: JSON.stringify(timelineClips),
      total_duration_seconds: offset,
    });

    // ── PHASE 4: Mark as ready for review ───────────────────────
    await update({
      status: 'ready_for_review',
      progress: 100,
      phase_message: `Draft ready! ${timelineClips.length} scenes, ${Math.round(offset)}s total, with broadcast-style audio ducking. Ready for review.`,
      thumbnail_url: allScenes[0]?.thumbnail || null,
    });

    console.log(`✓ Auto-edit pipeline complete: ${timelineClips.length} scenes, ${Math.round(offset)}s, for "${topicTitle}"`);

    return Response.json({
      success: true,
      scenes_count: timelineClips.length,
      total_duration: offset,
      status: 'ready_for_review',
    });
  } catch (error) {
    console.error('autoEditPipeline error:', error.message);
    if (job_id) {
      try {
        await base44.entities.AutoEditJobs.update(job_id, {
          status: 'failed', error_message: error.message, phase_message: 'Pipeline failed: ' + error.message,
        });
      } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});