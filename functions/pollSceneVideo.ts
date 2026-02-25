import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE VIDEO POLLER — Checks Grok Imagine video task via Kie API
// ══════════════════════════════════════════════════════════════════
//
// Called after generateSceneVideo to check if video is ready.
// Reads the grok_vid_task:{taskId} stored on scene.video_url.
//
// FLOW:
//   1. Extract taskId from scene.video_url
//   2. Poll /jobs/recordInfo → check state
//   3. On success → grab resultUrls[0]
//   4. Update scene with final video URL
//
// ENDPOINT:
//   GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={id}
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scene_id } = await req.json();

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    console.log(`[DEBUG] Scene ${scene_id} video_url:`, JSON.stringify(scene.video_url), `status:`, scene.status);

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });
    }

    // ── Extract task ID ─────────────────────────────────────────────
    const videoUrl = scene.video_url || '';

    // Already a final URL
    if (videoUrl.startsWith('http')) {
      return Response.json({ success: true, status: 'COMPLETED', video_url: videoUrl });
    }

    // Support both old veo_task: and new grok_vid_task: prefixes
    let taskId = null;
    if (videoUrl.startsWith('grok_vid_task:')) {
      taskId = videoUrl.replace('grok_vid_task:', '');
    } else if (videoUrl.startsWith('veo_task:')) {
      taskId = videoUrl.replace('veo_task:', '');
    } else if (videoUrl.startsWith('runway_task:') || videoUrl.startsWith('freepik_task:')) {
      return Response.json({
        error: 'This scene uses a legacy video provider. Re-generate the video.',
        legacy_task: videoUrl
      }, { status: 400 });
    }

    if (!taskId) {
      return Response.json({ error: 'No video task found on this scene' }, { status: 400 });
    }

    console.log(`🔍 Polling Grok video task: ${taskId} for scene ${scene.scene_number}`);

    // ══════════════════════════════════════════════════════════════
    // POLL TASK STATUS via /jobs/recordInfo
    // ══════════════════════════════════════════════════════════════

    const statusRes = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
    });

    if (!statusRes.ok) {
      const errText = await statusRes.text();
      return Response.json({
        error: `Kie status check failed: ${statusRes.status} - ${errText}`
      }, { status: 500 });
    }

    const statusData = await statusRes.json();

    if (statusData.code !== 200) {
      return Response.json({
        error: `Kie status error: ${statusData.msg || statusData.message}`,
        code: statusData.code
      }, { status: 500 });
    }

    const record = statusData.data;
    const state = record?.state;
    const failMsg = record?.failMsg;

    // ── Still processing ────────────────────────────────────────────
    if (!state || state === 'processing' || state === 'pending' || state === 'queued') {
      console.log(`⏳ Grok video task ${taskId}: ${state || 'processing'}`);
      return Response.json({
        success: true,
        status: 'PROCESSING',
        task_id: taskId,
        scene_number: scene.scene_number,
        created_at: record?.createTime
      });
    }

    // ── Failed ──────────────────────────────────────────────────────
    if (state === 'fail') {
      console.error(`❌ Grok video task ${taskId} failed: ${failMsg || record?.failCode}`);

      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        status: 'video_failed'
      });

      return Response.json({
        success: false,
        status: 'FAILED',
        error: failMsg || 'Video generation failed',
        task_id: taskId
      });
    }

    // ── Completed ───────────────────────────────────────────────────
    if (state === 'success') {
      let resultJson = {};
      try {
        resultJson = JSON.parse(record.resultJson || '{}');
      } catch (_) {}

      const finalUrl = resultJson.resultUrls?.[0] || resultJson.url || resultJson.video_url;

      if (!finalUrl) {
        console.warn(`⚠️ Task ${taskId} success but no URL in resultJson — retry next poll`);
        return Response.json({
          success: true,
          status: 'PROCESSING',
          message: 'Completed but URL not ready yet',
          task_id: taskId,
          scene_number: scene.scene_number
        });
      }

      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: finalUrl,
        status: 'video_ready'
      });

      console.log(`✓ Scene ${scene.scene_number} video saved: ${finalUrl.substring(0, 80)}...`);

      return Response.json({
        success: true,
        status: 'COMPLETED',
        video_url: finalUrl,
        resolution: '480p',
        task_id: taskId,
        scene_number: scene.scene_number
      });
    }

    // ── Unknown state ───────────────────────────────────────────────
    return Response.json({
      success: true,
      status: 'UNKNOWN',
      task_id: taskId,
      raw_state: state
    });

  } catch (error) {
    console.error("pollSceneVideo error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});