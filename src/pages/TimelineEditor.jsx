import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// TIMELINE GENERATOR — VOICEOVER-SYNCED
// ══════════════════════════════════════════════════════════════════
//
// PIPELINE POSITION:
//   generateVoiceover → [THIS] → generateTransitions → generateTimelinePreview
//
// TIMING AUTHORITY: voiceover_duration_seconds from ProductionSettings
// This function NEVER invents its own duration. It reads the master
// clock set by generateVoiceover and distributes scene timing
// proportionally by narration word count.
//
// TRANSITIONS: All set to 'cut' as defaults. The next pipeline step
// (generateTransitions) analyzes the full narrative arc and upgrades
// specific transitions to dissolve/fade where cinematographically appropriate.
//
// GATES (must all pass before timeline builds):
//   1. Voiceover must be generated (voiceover_duration_seconds exists)
//   2. ALL scenes must have image_url (every scene image generated)
//
// TIMING STRATEGY:
//   - Each scene gets screen time proportional to its narration length
//   - Minimum 3 seconds per scene (prevents jarring micro-cuts)
//   - Total always sums to exactly voiceover_duration_seconds
//
// OUTPUT FORMAT: 1920x1080 (16:9 YouTube standard)
// ══════════════════════════════════════════════════════════════════

// ── Helpers ─────────────────────────────────────────────────────────

function formatTimestamp(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds % 1) * 100);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

function countWords(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(w => w.length > 0).length;
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

    // ══════════════════════════════════════════════════════════════
    // GATE 1: Voiceover must exist with duration
    // ══════════════════════════════════════════════════════════════
    const settingsResult = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const production = settingsResult[0];

    if (!production?.voiceover_duration_seconds) {
      return Response.json({
        error: 'Voiceover not generated yet. Run generateVoiceover first.',
        gate_failed: 'voiceover_duration'
      }, { status: 400 });
    }

    if (!production.voiceover_url) {
      return Response.json({
        error: 'Voiceover audio not ready. Wait for generation to complete.',
        gate_failed: 'voiceover_url'
      }, { status: 400 });
    }

    const voiceoverDuration = production.voiceover_duration_seconds;
    console.log(`🎙 Master clock: ${voiceoverDuration}s from voiceover`);

    // ══════════════════════════════════════════════════════════════
    // GATE 2: ALL scenes must have images
    // ══════════════════════════════════════════════════════════════
    const allScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    const scenes = allScenes.sort((a, b) => a.scene_number - b.scene_number);

    if (scenes.length === 0) {
      return Response.json({
        error: 'No scenes found. Generate scene breakdown first.',
        gate_failed: 'no_scenes'
      }, { status: 400 });
    }

    const scenesWithoutImages = scenes.filter(s => !s.image_url);

    if (scenesWithoutImages.length > 0) {
      const missing = scenesWithoutImages.map(s => s.scene_number);
      return Response.json({
        error: `${scenesWithoutImages.length} scene(s) missing images. Generate all scene images first.`,
        gate_failed: 'scene_images',
        missing_scenes: missing,
        total_scenes: scenes.length,
        scenes_with_images: scenes.length - scenesWithoutImages.length
      }, { status: 400 });
    }

    console.log(`✓ All ${scenes.length} scenes have images`);

    // ══════════════════════════════════════════════════════════════
    // DELETE OLD TIMING ENTRIES
    // ══════════════════════════════════════════════════════════════
    const oldEntries = await base44.asServiceRole.entities.TimingEntries.filter({ project_id });
    if (oldEntries.length > 0) {
      console.log(`🗑 Deleting ${oldEntries.length} old timing entries`);
      for (const entry of oldEntries) {
        await base44.asServiceRole.entities.TimingEntries.delete(entry.id);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // WORD-WEIGHTED PROPORTIONAL TIMING
    // ══════════════════════════════════════════════════════════════
    //
    // Each scene gets duration proportional to its narration length.
    // Minimum 3 seconds per scene to prevent jarring cuts.
    // After applying minimums, remaining time is redistributed
    // proportionally among scenes above the minimum.

    const MIN_SCENE_DURATION = 3; // seconds — no scene shorter than this

    // Count words per scene
    const sceneWordCounts = scenes.map(s => ({
      scene: s,
      words: countWords(s.narration_text)
    }));

    const totalWords = sceneWordCounts.reduce((sum, s) => sum + s.words, 0);

    // If no narration text at all, distribute evenly
    if (totalWords === 0) {
      console.warn(`⚠ No narration text found — distributing evenly`);
      const evenDuration = voiceoverDuration / scenes.length;
      sceneWordCounts.forEach(s => s.words = 1);
    }

    // Phase 1: Calculate raw proportional durations
    const rawTotal = totalWords || scenes.length; // avoid division by zero
    let sceneDurations = sceneWordCounts.map(s => ({
      ...s,
      rawDuration: (s.words / rawTotal) * voiceoverDuration
    }));

    // Phase 2: Apply minimum floor
    let borrowedTime = 0;
    sceneDurations = sceneDurations.map(s => {
      if (s.rawDuration < MIN_SCENE_DURATION) {
        borrowedTime += (MIN_SCENE_DURATION - s.rawDuration);
        return { ...s, duration: MIN_SCENE_DURATION, floored: true };
      }
      return { ...s, duration: s.rawDuration, floored: false };
    });

    // Phase 3: Redistribute borrowed time from non-floored scenes
    if (borrowedTime > 0) {
      const nonFloored = sceneDurations.filter(s => !s.floored);
      const nonFlooredTotal = nonFloored.reduce((sum, s) => sum + s.duration, 0);

      if (nonFlooredTotal > borrowedTime) {
        // Shrink non-floored scenes proportionally
        sceneDurations = sceneDurations.map(s => {
          if (!s.floored) {
            const shrinkRatio = (nonFlooredTotal - borrowedTime) / nonFlooredTotal;
            return { ...s, duration: s.duration * shrinkRatio };
          }
          return s;
        });
      }
      // If borrowedTime exceeds available — scenes just won't sum perfectly
      // (edge case: many scenes, very short voiceover)
    }

    // Phase 4: Final adjustment — ensure total matches voiceover exactly
    const currentTotal = sceneDurations.reduce((sum, s) => sum + s.duration, 0);
    if (Math.abs(currentTotal - voiceoverDuration) > 0.01) {
      // Distribute the difference across all scenes proportionally
      const adjustment = voiceoverDuration / currentTotal;
      sceneDurations = sceneDurations.map(s => ({
        ...s,
        duration: s.duration * adjustment
      }));
    }

    // ══════════════════════════════════════════════════════════════
    // BUILD TIMING ENTRIES
    // ══════════════════════════════════════════════════════════════

    let cumulativeSeconds = 0;
    const entries = [];

    for (let i = 0; i < sceneDurations.length; i++) {
      const sd = sceneDurations[i];
      const scene = sd.scene;
      const duration = sd.duration;

      const startSeconds = cumulativeSeconds;
      const endSeconds = startSeconds + duration;

      // Transition: default all to 'cut' — generateTransitions upgrades these
      // with narrative-aware cinematographic transitions in the next pipeline step
      const record = await base44.asServiceRole.entities.TimingEntries.create({
        project_id,
        entry_order: scene.scene_number,
        timestamp_start: formatTimestamp(startSeconds),
        timestamp_end: formatTimestamp(endSeconds),
        spoken_text: scene.narration_text || '',
        scene_concept: scene.image_prompt?.substring(0, 200) || '',
        transition_type: 'cut',
        transition_duration: 0,
        duration_seconds: Math.round(duration * 100) / 100,
        scene_id: scene.id,
        image_url: scene.image_url,
        video_url: scene.video_url || null,
        output_resolution: '1920x1080'
      });

      entries.push({
        scene_number: scene.scene_number,
        start: formatTimestamp(startSeconds),
        end: formatTimestamp(endSeconds),
        duration: Math.round(duration * 100) / 100,
        words: sd.words,
        transition: 'cut', // placeholder — generateTransitions upgrades these
        has_image: !!scene.image_url,
        has_video: !!scene.video_url
      });

      cumulativeSeconds = endSeconds;

      console.log(
        `Scene ${scene.scene_number}: ${formatTimestamp(startSeconds)} → ${formatTimestamp(endSeconds)} ` +
        `(${duration.toFixed(1)}s, ${sd.words}w)`
      );
    }

    // ══════════════════════════════════════════════════════════════
    // UPDATE PROJECT STATUS
    // ══════════════════════════════════════════════════════════════
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'timeline_ready',
      current_step: 11,
      video_duration_actual: Math.round(voiceoverDuration * 10) / 10
    });

    // Also ensure ProductionSettings has total_duration synced
    await base44.asServiceRole.entities.ProductionSettings.update(production.id, {
      total_duration_seconds: voiceoverDuration,
      output_resolution: '1920x1080'
    });

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Timeline built: ${scenes.length} scenes | ${voiceoverDuration}s | 1920x1080`);
    console.log(`  Master clock: voiceover_duration_seconds = ${voiceoverDuration}`);
    console.log(`  Next step: run generateTransitions for smart transitions`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      total_duration_seconds: voiceoverDuration,
      total_duration_formatted: formatTimestamp(voiceoverDuration),
      total_scenes: scenes.length,
      output_resolution: '1920x1080',
      timing_source: 'voiceover_duration',
      entries
    });

  } catch (error) {
    console.error(`❌ generateTimeline error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});