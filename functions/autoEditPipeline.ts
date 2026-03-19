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

    // ── PHASE 1: Extract keywords from topic title ──────────────
    await update({ status: 'searching_media', progress: 5, phase_message: 'Analyzing topic and extracting search keywords...' });

    const topicTitle = job.title;
    const isShort = job.format === 'short';
    const targetDuration = isShort ? 30 : 120; // 30s for shorts, 2min for long preview
    const scenesNeeded = isShort ? 5 : 10;

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    let keywords = [];
    let sceneDescriptions = [];

    if (geminiKey) {
      try {
        const prompt = `You are a video editor. Given this video topic: "${topicTitle}"

Generate ${scenesNeeded} scenes for a ${isShort ? '30-second short-form' : '2-minute'} stock footage video.
For each scene, provide:
- A 2-4 word stock video search keyword (generic, visually descriptive, no proper nouns)
- A brief scene description
- Suggested duration in seconds (total must equal ${targetDuration})

Return JSON only:
{
  "scenes": [
    { "keywords": "city skyline night", "description": "Establishing shot of city", "duration": 6 }
  ]
}`;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 4096, responseMimeType: 'application/json' }
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
        keywords: kw, description: `Scene ${i + 1}`, duration: Math.round(targetDuration / scenesNeeded)
      }));
    }

    await update({ progress: 15, phase_message: `Found ${keywords.length} scene keywords, searching stock libraries...`, keywords_used: JSON.stringify(keywords) });

    // ── PHASE 2: Search stock media for each scene ──────────────
    const orientation = job.orientation || 'landscape';
    const allScenes = [];

    for (let i = 0; i < sceneDescriptions.length; i++) {
      const scene = sceneDescriptions[i];
      const query = scene.keywords;

      await update({ progress: 15 + Math.round((i / sceneDescriptions.length) * 35), phase_message: `Searching: "${query}" (${i + 1}/${sceneDescriptions.length})...` });

      // Search both sources in parallel
      const [pexels, pixabay] = await Promise.all([
        searchPexels(query, orientation),
        searchPixabay(query),
      ]);

      const combined = [...pexels, ...pixabay];

      if (combined.length > 0) {
        // Pick the best clip (prefer HD, appropriate duration)
        const bestClip = combined.sort((a, b) => {
          const aDurDiff = Math.abs((a.duration || 10) - scene.duration);
          const bDurDiff = Math.abs((b.duration || 10) - scene.duration);
          return aDurDiff - bDurDiff;
        })[0];

        allScenes.push({
          sceneNumber: i + 1,
          keywords: query,
          description: scene.description,
          targetDuration: scene.duration,
          videoUrl: bestClip.url,
          thumbnail: bestClip.thumbnail,
          videoDuration: bestClip.duration,
          source: bestClip.source,
          sourceId: bestClip.id,
          width: bestClip.width,
          height: bestClip.height,
        });
      } else {
        // No results — use a generic fallback search
        const fallback = await searchPexels('abstract background', orientation);
        const clip = fallback[0];
        allScenes.push({
          sceneNumber: i + 1,
          keywords: query,
          description: scene.description,
          targetDuration: scene.duration,
          videoUrl: clip?.url || null,
          thumbnail: clip?.thumbnail || null,
          videoDuration: clip?.duration || scene.duration,
          source: clip?.source || 'none',
          sourceId: clip?.id || null,
        });
      }
    }

    await update({ status: 'assembling_timeline', progress: 55, phase_message: `Found media for ${allScenes.filter(s => s.videoUrl).length}/${allScenes.length} scenes. Assembling timeline...` });

    // ── PHASE 3: Assemble timeline with effects ─────────────────
    let offset = 0;
    const timelineClips = allScenes.map((scene, idx) => {
      const duration = scene.targetDuration || 5;
      const motionId = CINEMATIC_MOTIONS[idx % CINEMATIC_MOTIONS.length];
      const transition = idx < allScenes.length - 1
        ? TRANSITIONS[idx % TRANSITIONS.length]
        : null;

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
        motionSpeed: 0.8 + Math.random() * 0.4, // 0.8-1.2 for variety
        motionIntensity: 0.8 + Math.random() * 0.4,
        transition,
        transitionDuration: transition ? (0.4 + Math.random() * 0.4) : null, // 0.4-0.8s
        playbackRate: scene.videoDuration > duration ? 1.0 : Math.max(0.5, duration > 0 ? scene.videoDuration / duration : 1.0),
        videoDuration: scene.videoDuration,
        effects: [],
        audioMuted: false,
        synced: true,
        // Metadata
        keywords: scene.keywords,
        stockSource: scene.source,
        stockId: scene.sourceId,
      };
      offset += duration;
      return clip;
    });

    await update({
      status: 'applying_effects',
      progress: 75,
      phase_message: 'Applied cinematic motions and transitions to all clips...',
      scenes_data: JSON.stringify(timelineClips),
      total_duration_seconds: offset,
    });

    // ── PHASE 4: Mark as ready for review ───────────────────────
    await update({
      status: 'ready_for_review',
      progress: 100,
      phase_message: `Draft ready! ${timelineClips.length} scenes, ${Math.round(offset)}s total. Ready for your review.`,
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