import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// BEAT SYNC ENGINE v5 — Server-side scene update + caption save
// ══════════════════════════════════════════════════════════════════
//
// The heavy ASR transcription + polling is now done client-side
// via submitTranscription/pollTranscription. This function only
// handles the DB writes: updating scene durations, transitions,
// and saving caption/beat data to ProductionSettings.
//
// Input: { project_id, beat_durations, beat_start_times, caption_data }
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, beat_durations, beat_start_times, caption_data } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const [allScenes, prodSettings] = await Promise.all([
      base44.asServiceRole.entities.Scenes.filter({ project_id }),
      base44.asServiceRole.entities.ProductionSettings.filter({ project_id }),
    ]);

    const scenes = allScenes.sort((a, b) => a.scene_number - b.scene_number);
    const prod = prodSettings[0];

    if (!prod) return Response.json({ error: 'No production settings found' }, { status: 400 });
    if (!beat_durations || !Array.isArray(beat_durations)) {
      return Response.json({ error: 'beat_durations array required' }, { status: 400 });
    }

    console.log(`📝 Saving sync data: ${scenes.length} scenes, ${beat_durations.length} durations`);

    // Update scene durations in parallel batches
    const BATCH = 10;
    let applied = 0;
    let failed = 0;

    for (let i = 0; i < scenes.length && i < beat_durations.length; i += BATCH) {
      const batch = [];
      for (let j = i; j < Math.min(i + BATCH, scenes.length, beat_durations.length); j++) {
        batch.push(
          base44.asServiceRole.entities.Scenes.update(scenes[j].id, {
            duration_seconds: beat_durations[j],
          })
        );
      }
      const results = await Promise.allSettled(batch);
      applied += results.filter(r => r.status === 'fulfilled').length;
      failed += results.filter(r => r.status === 'rejected').length;
    }

    // Save beat data + caption data to ProductionSettings
    const updatePayload = {
      beat_durations: JSON.stringify(beat_durations),
    };
    if (beat_start_times) updatePayload.beat_start_times = JSON.stringify(beat_start_times);
    if (caption_data) updatePayload.caption_data = JSON.stringify(caption_data);

    await base44.asServiceRole.entities.ProductionSettings.update(prod.id, updatePayload);

    console.log(`✓ Sync saved: ${applied} scenes updated, ${failed} failed`);

    return Response.json({
      success: true,
      applied,
      failed,
      total_scenes: scenes.length,
    });

  } catch (error) {
    console.error('autoSyncTimeline error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});