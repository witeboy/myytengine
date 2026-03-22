import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    // ══════════════════════════════════════════════════════════════════
    // GET PROJECT & SCENES (the source of truth for timing)
    // ══════════════════════════════════════════════════════════════════
    const projects = await base44.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScenes = await base44.entities.Scenes.filter({ project_id });
    const scenes = allScenes.sort((a, b) => a.scene_number - b.scene_number);

    if (scenes.length === 0) {
      return Response.json({ error: 'No scenes found. Generate scenes first.' }, { status: 400 });
    }

    console.log(`Building timeline for ${scenes.length} scenes`);

    // ══════════════════════════════════════════════════════════════════
    // DELETE OLD TIMING ENTRIES
    // ══════════════════════════════════════════════════════════════════
    const oldEntries = await base44.entities.TimingEntries.filter({ project_id });
    for (const entry of oldEntries) {
      await base44.entities.TimingEntries.delete(entry.id);
    }

    // ══════════════════════════════════════════════════════════════════
    // BUILD TIMELINE FROM ACTUAL SCENE DATA
    // ══════════════════════════════════════════════════════════════════
    let cumulativeSeconds = 0;
    const entries = [];

    for (const scene of scenes) {
      const startSeconds = cumulativeSeconds;
      const duration = scene.duration_seconds || 8;
      const endSeconds = startSeconds + duration;

      // Format timestamps MM:SS
      const startTime = formatTimestamp(startSeconds);
      const endTime = formatTimestamp(endSeconds);

      // Determine transition (first scene has no transition, others get cut/dissolve)
      const transition = scene.scene_number === 1 
        ? 'fade_in' 
        : (scene.scene_number % 3 === 0 ? 'dissolve' : 'cut');

      // Create timing entry
      const record = await base44.entities.TimingEntries.create({
        project_id: project_id,
        entry_order: scene.scene_number,
        timestamp_start: startTime,
        timestamp_end: endTime,
        spoken_text: scene.narration_text || '',
        scene_concept: scene.image_prompt?.substring(0, 200) || 'Visual scene',
        transition_type: transition,
        duration_seconds: duration,
        scene_id: scene.id,  // Link back to scene
        image_url: scene.image_url || null,
        video_url: scene.video_url || null
      });

      entries.push(record);

      cumulativeSeconds = endSeconds;

      console.log(`Scene ${scene.scene_number}: ${startTime} - ${endTime} (${duration}s)`);
    }

    const totalDuration = formatTimestamp(cumulativeSeconds);

    // ══════════════════════════════════════════════════════════════════
    // UPDATE PROJECT STATUS
    // ══════════════════════════════════════════════════════════════════
    await base44.entities.Projects.update(project_id, { 
      current_step: 11, 
      status: "timeline_ready",
      video_duration_actual: Math.round(cumulativeSeconds / 60 * 10) / 10  // minutes
    });

    console.log(`Timeline complete: ${scenes.length} scenes, ${totalDuration} total`);

    return Response.json({ 
      success: true, 
      entries: entries,
      total_scenes: scenes.length,
      total_duration_seconds: cumulativeSeconds,
      total_duration_formatted: totalDuration
    });

  } catch (error) {
    console.error('generateTimeline error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ══════════════════════════════════════════════════════════════════
// HELPER: Format seconds to MM:SS
// ══════════════════════════════════════════════════════════════════
function formatTimestamp(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}