import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// TIMELINE PREVIEW — RENDERING MANIFEST GENERATOR
// ══════════════════════════════════════════════════════════════════
//
// PIPELINE POSITION:
//   generateVoiceover → generateTimeline → generateTransitions → [THIS]
//
// Builds a complete rendering manifest for video preview/export.
// Duration is STRICTLY derived from voiceover_duration_seconds.
// All assets are clamped to fit within the voiceover timeline.
//
// TRANSITION MODEL: OVERLAP
//   Each scene includes transition instructions from generateTransitions.
//   Dissolves = visual overlap between adjacent scenes (both render).
//   Fades = fade to/from black at scene boundaries.
//   Cuts = instant switch (0s overlap).
//   Voiceover plays continuously — transitions are purely visual.
//
// OUTPUT: 1920x1080 (16:9 YouTube standard) — ALWAYS
//
// MANIFEST STRUCTURE:
//   {
//     resolution: { width: 1920, height: 1080 },
//     total_duration: voiceover_duration_seconds,
//     voiceover: { url, volume },
//     scenes: [{ start, duration, image_url, transition: { type, duration, overlap } }]
//   }
//
// This manifest is consumed by:
//   - Client-side preview renderer (canvas/webgl)
//   - Server-side video stitcher (FFmpeg/Remotion)
//   - Export pipeline
// ══════════════════════════════════════════════════════════════════

// ── Parse timestamp back to seconds ────────────────────────────────
function parseTimestamp(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;

  // Handle "M:SS.ms" or "M:SS" formats
  const parts = ts.split(':');
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return parseFloat(ts) || 0;
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

    // ── Fetch project ─────────────────────────────────────────────
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ── Fetch production settings (timing authority) ──────────────
    const settingsResult = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const production = settingsResult[0];

    if (!production?.voiceover_duration_seconds) {
      return Response.json({
        error: 'Voiceover not ready. Generate voiceover first.',
        gate_failed: 'voiceover'
      }, { status: 400 });
    }

    if (!production.voiceover_url) {
      return Response.json({
        error: 'Voiceover audio URL missing.',
        gate_failed: 'voiceover_url'
      }, { status: 400 });
    }

    const totalDuration = production.voiceover_duration_seconds;

    // ── Fetch timing entries (from generateTimeline) ──────────────
    const timingEntries = await base44.asServiceRole.entities.TimingEntries.filter({ project_id });

    if (!timingEntries || timingEntries.length === 0) {
      return Response.json({
        error: 'Timeline not generated. Run generateTimeline first.',
        gate_failed: 'timeline'
      }, { status: 400 });
    }

    const sortedEntries = timingEntries.sort((a, b) =>
      (a.entry_order || 0) - (b.entry_order || 0)
    );

    // ══════════════════════════════════════════════════════════════
    // BUILD SCENE MANIFEST
    // ══════════════════════════════════════════════════════════════
    // Each timing entry maps to a scene with its visual asset.
    // Assets are clamped so nothing exceeds voiceover duration.

    const scenes = sortedEntries.map((entry, index) => {
      const startTime = parseTimestamp(entry.timestamp_start);
      let duration = entry.duration_seconds || 0;

      // Clamp: scene cannot extend beyond voiceover
      if (startTime + duration > totalDuration) {
        duration = Math.max(0, totalDuration - startTime);
      }

      // Skip scenes that start after voiceover ends
      if (startTime >= totalDuration) return null;
      if (duration <= 0) return null;

      // Transition data (set by generateTransitions, defaults to cut)
      const transitionType = entry.transition_type || 'cut';
      const transitionDuration = entry.transition_duration || 0;

      return {
        scene_number: entry.entry_order || index + 1,
        scene_id: entry.scene_id || null,
        start_time: Math.round(startTime * 100) / 100,
        duration: Math.round(duration * 100) / 100,
        end_time: Math.round((startTime + duration) * 100) / 100,
        image_url: entry.image_url || null,
        video_url: entry.video_url || null,
        narration_text: entry.spoken_text || '',

        // ── Transition instructions for renderer ──
        transition: {
          type: transitionType,
          duration: transitionDuration,
          // OVERLAP MODEL: During a dissolve, this scene's start overlaps
          // with the previous scene's end. Both images render simultaneously.
          // The renderer crossfades between them over transition_duration.
          // Voiceover plays continuously — transitions are purely visual.
          overlap_with_previous: transitionType !== 'cut' && transitionType !== 'fade_from_black'
            ? transitionDuration
            : 0,
          // For fade_from_black: scene fades in from black
          // For fade_to_black: scene fades out to black at its END
          fade_direction: transitionType === 'fade_from_black' ? 'in'
            : transitionType === 'fade_to_black' ? 'out'
            : null
        },

        // Asset scaling for 1920x1080
        fit_mode: 'cover',
      };
    }).filter(Boolean);

    // ══════════════════════════════════════════════════════════════
    // CHECK FOR GAPS
    // ══════════════════════════════════════════════════════════════
    // Verify scenes tile perfectly across the voiceover duration.
    // If there are gaps, log warnings.

    let warnings = [];
    for (let i = 0; i < scenes.length - 1; i++) {
      const gap = scenes[i + 1].start_time - (scenes[i].start_time + scenes[i].duration);
      if (Math.abs(gap) > 0.1) {
        warnings.push(`Gap of ${gap.toFixed(2)}s between scene ${scenes[i].scene_number} and ${scenes[i + 1].scene_number}`);
      }
    }

    // Check final scene reaches end
    if (scenes.length > 0) {
      const lastScene = scenes[scenes.length - 1];
      const lastEnd = lastScene.start_time + lastScene.duration;
      if (Math.abs(lastEnd - totalDuration) > 0.5) {
        warnings.push(`Timeline ends at ${lastEnd.toFixed(1)}s but voiceover is ${totalDuration}s`);
      }
    }

    if (warnings.length > 0) {
      console.warn(`⚠ Timeline warnings:\n  ${warnings.join('\n  ')}`);
    }

    // ══════════════════════════════════════════════════════════════
    // ASSEMBLE MANIFEST
    // ══════════════════════════════════════════════════════════════

    const manifest = {
      // ── Output specification ──
      resolution: {
        width: 1920,
        height: 1080,
        aspect_ratio: '16:9',
        format: 'mp4',
        fps: 30,
        codec: 'h264',
        quality: 'high'
      },

      // ── Timing ──
      total_duration: totalDuration,
      total_duration_formatted: formatDuration(totalDuration),
      timing_source: 'voiceover',

      // ── Audio layer ──
      voiceover: {
        url: production.voiceover_url,
        duration: totalDuration,
        volume: production.voiceover_volume || 1,
        fade_in: 0.5,   // gentle fade in
        fade_out: 1.0    // gentle fade out
      },

      // ── Background music (if configured) ──
      background_music: production.background_music_url ? {
        url: production.background_music_url,
        volume: production.background_music_volume || 0.15,
        loop: true,
        duck_under_voiceover: true,
        duck_volume: 0.08
      } : null,

      // ── Visual layers (scenes in order) ──
      scenes,

      // ── Transition summary ──
      transition_stats: {
        total: scenes.length,
        cuts: scenes.filter(s => s.transition.type === 'cut').length,
        dissolves: scenes.filter(s => s.transition.type === 'dissolve').length,
        fades: scenes.filter(s => s.transition.type.startsWith('fade')).length,
        total_overlap_seconds: scenes.reduce((sum, s) => sum + (s.transition.overlap_with_previous || 0), 0)
      },

      // ── Metadata ──
      project_id,
      total_scenes: scenes.length,
      created_at: new Date().toISOString(),
      warnings: warnings.length > 0 ? warnings : undefined
    };

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 Preview manifest: ${scenes.length} scenes | ${totalDuration}s | 1920x1080`);
    console.log(`🎙 Voiceover: ${production.voiceover_url?.substring(0, 60)}...`);
    console.log(`🔄 Transitions: ${manifest.transition_stats.cuts} cuts, ${manifest.transition_stats.dissolves} dissolves, ${manifest.transition_stats.fades} fades`);
    console.log(`📐 Master clock: voiceover_duration_seconds = ${totalDuration}`);
    if (warnings.length > 0) console.log(`⚠ ${warnings.length} timing warning(s)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      manifest,
      status: 'preview_ready'
    });

  } catch (error) {
    console.error(`❌ generateTimelinePreview error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Format seconds to MM:SS ─────────────────────────────────────────
function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}