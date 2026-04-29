import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// BEAT SYNC ENGINE v6 — Server-side scene update + caption save
// ══════════════════════════════════════════════════════════════════
//
// The heavy ASR transcription + polling is done client-side.
// This function handles DB writes only:
//   - Update scene durations in batches
//   - Save beat timings to ProductionSettings (critical path)
//   - Save caption data to ProductionSettings (isolated, non-fatal)
//
// Input: { project_id, beat_durations, beat_start_times, caption_data }
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, beat_durations, beat_start_times, caption_data } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'project_id required' }, { status: 400 });
    }
    if (!beat_durations || !Array.isArray(beat_durations) || beat_durations.length === 0) {
      return Response.json({ error: 'beat_durations array required' }, { status: 400 });
    }

    const [allScenes, prodSettings] = await Promise.all([
      base44.asServiceRole.entities.Scenes.filter({ project_id }),
      base44.asServiceRole.entities.ProductionSettings.filter({ project_id }),
    ]);

    const scenes = allScenes.sort((a, b) => a.scene_number - b.scene_number);
    const prod = prodSettings[0];

    if (!prod) {
      return Response.json({ error: 'No production settings found' }, { status: 400 });
    }

    // ── Warn if lengths mismatch — stale durations on trailing scenes ──
    const lengthMismatch = beat_durations.length !== scenes.length;
    if (lengthMismatch) {
      console.warn(
        `⚠ beat_durations.length (${beat_durations.length}) ≠ scenes.length (${scenes.length}) — trailing scenes may have stale durations`
      );
    }

    console.log(`📝 Saving sync data: ${scenes.length} scenes, ${beat_durations.length} durations`);

    // ── Update scene durations in parallel batches ─────────────────────
    const BATCH = 10;
    let applied = 0;
    let failed = 0;

    for (let i = 0; i < scenes.length && i < beat_durations.length; i += BATCH) {
      const batch = [];
      for (let j = i; j < Math.min(i + BATCH, scenes.length, beat_durations.length); j++) {
        const duration = beat_durations[j];
        // Guard: never write a nonsensical duration to the DB
        if (typeof duration !== 'number' || duration <= 0 || !isFinite(duration)) {
          console.warn(`⚠ Skipping scene ${scenes[j].scene_number} — invalid duration: ${duration}`);
          failed++;
          continue;
        }
        batch.push(
          base44.asServiceRole.entities.Scenes.update(scenes[j].id, {
            duration_seconds: parseFloat(duration.toFixed(3)),
          })
        );
      }
      const results = await Promise.allSettled(batch);
      applied += results.filter(r => r.status === 'fulfilled').length;
      failed  += results.filter(r => r.status === 'rejected').length;

      // Log any individual batch failures
      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          console.warn(`⚠ Scene update failed at batch index ${i + idx}:`, r.reason?.message);
        }
      });
    }

    // ── Save beat timings — critical path ─────────────────────────────
    // If this fails, throw so the client knows sync didn't land
    const beatPayload = {
      beat_durations: JSON.stringify(beat_durations),
    };
    if (beat_start_times && Array.isArray(beat_start_times)) {
      beatPayload.beat_start_times = JSON.stringify(beat_start_times);
    }
    await base44.asServiceRole.entities.ProductionSettings.update(prod.id, beatPayload);

    // ── Save caption data — isolated so a failure never loses beat data ──
    let captionSaved = false;
    let captionError = null;
    if (caption_data) {
      try {
        await base44.asServiceRole.entities.ProductionSettings.update(prod.id, {
          caption_data: JSON.stringify(caption_data),
        });
        captionSaved = true;
      } catch (capErr) {
        captionError = capErr.message;
        console.warn('⚠ Caption save failed (beats were saved OK):', capErr.message);
      }
    }

    console.log(
      `✓ Sync saved: ${applied} scenes updated, ${failed} failed${captionSaved ? ', captions saved' : ''}${lengthMismatch ? ' [LENGTH MISMATCH]' : ''}`
    );

    return Response.json({
      success: true,
      applied,
      failed,
      total_scenes: scenes.length,
      caption_saved: captionSaved,
      caption_error: captionError,
      length_mismatch: lengthMismatch,
    });

  } catch (error) {
    console.error('autoSyncTimeline error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});