import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// syncMediaToAudio.js — AutoSync Media to Audio Beats
// ══════════════════════════════════════════════════════════════════
// Calculates proper timing for each scene based on audio duration
// Updates scene start_time, end_time, duration, and beat_synced flag
// ══════════════════════════════════════════════════════════════════

async function getAudioDuration(audioUrl) {
  try {
    // Fetch audio file headers to get duration metadata
    const response = await fetch(audioUrl, { method: 'HEAD' });
    
    // For cloud-hosted audio, we'll estimate based on file size and bitrate
    // Most voiceover is 128kbps MP3
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const bytes = parseInt(contentLength);
      const bitrate = 128000; // 128kbps in bits
      const durationSeconds = (bytes * 8) / bitrate;
      return Math.round(durationSeconds * 10) / 10; // Round to 0.1s
    }
    
    return null;
  } catch (e) {
    console.error('Error getting audio duration:', e);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, manual_durations } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    // Get all scenes for the project
    const scenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    
    if (scenes.length === 0) {
      return Response.json({ error: 'No scenes found' }, { status: 404 });
    }

    // Sort by scene number
    const sortedScenes = scenes.sort((a, b) => 
      (a.scene_number || 0) - (b.scene_number || 0)
    );

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎵 AutoSync: ${sortedScenes.length} scenes`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let currentOffset = 0;
    const syncedScenes = [];
    const timeline = [];

    for (const scene of sortedScenes) {
      let duration = 5; // Default duration

      // Priority 1: Manual duration override
      if (manual_durations && manual_durations[scene.id]) {
        duration = manual_durations[scene.id];
        console.log(`Scene ${scene.scene_number}: Manual duration ${duration}s`);
      }
      // Priority 2: Existing audio_duration field
      else if (scene.audio_duration && scene.audio_duration > 0) {
        duration = scene.audio_duration;
        console.log(`Scene ${scene.scene_number}: Existing duration ${duration}s`);
      }
      // Priority 3: Try to fetch from audio URL
      else if (scene.audio_url) {
        const fetchedDuration = await getAudioDuration(scene.audio_url);
        if (fetchedDuration) {
          duration = fetchedDuration;
          console.log(`Scene ${scene.scene_number}: Fetched duration ${duration}s`);
        }
      }
      // Priority 4: Estimate from voiceover text
      else if (scene.voiceover_text) {
        // Average speaking rate: ~150 words per minute
        const wordCount = scene.voiceover_text.split(/\s+/).length;
        duration = Math.max(2, Math.round((wordCount / 150) * 60 * 10) / 10);
        console.log(`Scene ${scene.scene_number}: Estimated from text ${duration}s (${wordCount} words)`);
      }

      const startTime = currentOffset;
      const endTime = currentOffset + duration;

      // Update scene in database
      await base44.asServiceRole.entities.Scenes.update(scene.id, {
        start_time: startTime,
        end_time: endTime,
        duration: duration,
        audio_duration: duration,
        beat_synced: true
      });

      syncedScenes.push({
        id: scene.id,
        scene_number: scene.scene_number,
        start_time: startTime,
        end_time: endTime,
        duration: duration
      });

      // Build timeline data
      timeline.push({
        scene_id: scene.id,
        scene_number: scene.scene_number,
        start_time: startTime,
        end_time: endTime,
        duration: duration,
        has_audio: !!scene.audio_url,
        has_image: !!scene.image_url,
        voiceover_preview: (scene.voiceover_text || '').slice(0, 50) + '...'
      });

      currentOffset = endTime;
    }

    const totalDuration = currentOffset;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Total duration: ${totalDuration}s`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Update project with total duration
    await base44.asServiceRole.entities.Projects.update(project_id, {
      total_duration: totalDuration,
      last_synced: new Date().toISOString()
    });

    return Response.json({
      success: true,
      total_duration: totalDuration,
      scene_count: syncedScenes.length,
      scenes: syncedScenes,
      timeline: timeline,
      message: `Synced ${syncedScenes.length} scenes to audio beats`
    });

  } catch (error) {
    console.error('AutoSync error:', error);
    return Response.json({ 
      error: error.message || 'Sync failed'
    }, { status: 500 });
  }
});