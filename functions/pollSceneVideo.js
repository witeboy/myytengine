import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE VIDEO POLLER — Checks Veo 3.1 task status via Kie API
// ══════════════════════════════════════════════════════════════════
//
// Called after generateSceneVideo to check if video is ready.
// Reads the veo_task:{taskId} stored on scene.video_url.
//
// FLOW:
//   1. Extract taskId from scene.video_url
//   2. Poll /veo/record-info → check successFlag
//   3. If ready, request 1080p version via /veo/get-1080p-video
//   4. Update scene with final video URL
//
// ENDPOINTS:
//   GET https://api.kie.ai/api/v1/veo/record-info?taskId={id}
//   GET https://api.kie.ai/api/v1/veo/get-1080p-video?taskId={id}
// ══════════════════════════════════════════════════════════════════

const VEO_BASE = "https://api.kie.ai/api/v1/veo";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scene_id } = await req.json();

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });
    }

    // ── Extract task ID ─────────────────────────────────────────────
    const videoUrl = scene.video_url || '';

    if (!videoUrl.startsWith('veo_task:')) {
      // Already a real URL or different provider
      if (videoUrl.startsWith('http')) {
        return Response.json({ success: true, status: 'COMPLETED', video_url: videoUrl });
      }
      // Legacy Runway/Freepik tasks
      if (videoUrl.startsWith('runway_task:') || videoUrl.startsWith('freepik_task:')) {
        return Response.json({
          error: 'This scene uses a legacy video provider (Runway/Freepik). Re-generate with Veo 3.1.',
          legacy_task: videoUrl
        }, { status: 400 });
      }
      return Response.json({ error: 'No video task found on this scene' }, { status: 400 });
    }

    const taskId = videoUrl.replace('veo_task:', '');
    console.log(`🔍 Polling Veo task: ${taskId} for scene ${scene.scene_number}`);

    // ══════════════════════════════════════════════════════════════
    // POLL TASK STATUS
    // ══════════════════════════════════════════════════════════════

    const statusRes = await fetch(`${VEO_BASE}/record-info?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
    });

    if (!statusRes.ok) {
      const errText = await statusRes.text();
      return Response.json({
        error: `Veo status check failed: ${statusRes.status} - ${errText}`
      }, { status: 500 });
    }

    const statusData = await statusRes.json();

    if (statusData.code !== 200) {
      return Response.json({
        error: `Veo status error: ${statusData.msg}`,
        code: statusData.code
      }, { status: 500 });
    }

    const record = statusData.data;
    const successFlag = record?.successFlag;
    const errorMessage = record?.errorMessage;

    // ── Still processing ────────────────────────────────────────────
    if (successFlag === 0 || successFlag === null || successFlag === undefined) {
      console.log(`⏳ Veo task ${taskId}: still processing`);
      return Response.json({
        success: true,
        status: 'PROCESSING',
        task_id: taskId,
        scene_number: scene.scene_number,
        created_at: record?.createTime
      });
    }

    // ── Failed ──────────────────────────────────────────────────────
    if (successFlag === -1 || (errorMessage && errorMessage.length > 0 && successFlag !== 1)) {
      console.error(`❌ Veo task ${taskId} failed: ${errorMessage || record?.errorCode}`);

      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        status: 'video_failed'
      });

      return Response.json({
        success: false,
        status: 'FAILED',
        error: errorMessage || 'Video generation failed',
        task_id: taskId
      });
    }

    // ── Completed ───────────────────────────────────────────────────
    if (successFlag === 1) {
      const response = record?.response || {};
      let videoUrl = response.resultUrls?.[0] || response.originUrls?.[0];

      console.log(`✓ Veo task ${taskId}: complete | resolution: ${response.resolution}`);

      // ── Request 1080p version if not already 1080p ──────────────
      if (response.resolution !== '1080p' || !videoUrl) {
        console.log(`📺 Requesting 1080p upgrade for task ${taskId}`);
        try {
          const hdRes = await fetch(`${VEO_BASE}/get-1080p-video?taskId=${taskId}`, {
            headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
          });

          if (hdRes.ok) {
            const hdData = await hdRes.json();
            if (hdData.code === 200 && hdData.data) {
              const hdUrl = hdData.data?.response?.resultUrls?.[0]
                || hdData.data?.resultUrls?.[0]
                || hdData.data?.url;

              if (hdUrl) {
                videoUrl = hdUrl;
                console.log(`✓ 1080p URL: ${videoUrl.substring(0, 80)}...`);
              }
            } else if (hdData.code === 400) {
              // "1080P is processing" — not ready yet
              console.log(`⏳ 1080p still processing, using standard URL`);
            }
          }
        } catch (hdErr) {
          console.warn(`1080p request failed (using standard): ${hdErr.message}`);
        }
      }

      if (!videoUrl) {
        return Response.json({
          error: 'Task completed but no video URL found',
          task_id: taskId
        }, { status: 500 });
      }

      // ── Save final video URL ──────────────────────────────────────
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: videoUrl,
        status: 'video_ready'
      });

      console.log(`✓ Scene ${scene.scene_number} video saved: ${videoUrl.substring(0, 80)}...`);

      return Response.json({
        success: true,
        status: 'COMPLETED',
        video_url: videoUrl,
        resolution: response.resolution || '1080p',
        task_id: taskId,
        scene_number: scene.scene_number
      });
    }

    // ── Unknown state ───────────────────────────────────────────────
    return Response.json({
      success: true,
      status: 'UNKNOWN',
      task_id: taskId,
      raw_flag: successFlag
    });

  } catch (error) {
    console.error("pollSceneVideo error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
