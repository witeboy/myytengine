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
//   3. If ready, update scene with final video URL
//
// successFlag values (from Kie docs):
//   0 = generating (still processing)
//   1 = success (video ready)
//   2 = failed
//   3 = generation failed (upstream error)
//
// ENDPOINT:
//   GET https://api.kie.ai/api/v1/veo/record-info?taskId={id}
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

    if (!videoUrl.startsWith('veo_task:') && !videoUrl.startsWith('veo_1080p:')) {
      // Already a real URL
      if (videoUrl.startsWith('http')) {
        return Response.json({ success: true, status: 'COMPLETED', video_url: videoUrl });
      }
      return Response.json({ error: 'No video task found on this scene', video_url: videoUrl }, { status: 400 });
    }

    // If in 1080p upgrade phase, handle separately
    if (videoUrl.startsWith('veo_1080p:')) {
      const realTaskId = videoUrl.replace('veo_1080p:', '');
      console.log(`Polling 1080p upgrade for task: ${realTaskId}, scene ${scene.scene_number}`);

      const upgradeRes = await fetch(`${VEO_BASE}/get-1080p-video?taskId=${realTaskId}`, {
        headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
      });
      const upgradeText = await upgradeRes.text();
      console.log(`1080p response (${upgradeRes.status}): ${upgradeText.substring(0, 500)}`);

      let upgradeData;
      try { upgradeData = JSON.parse(upgradeText); } catch (_) { upgradeData = null; }

      if (upgradeData?.code === 200 && upgradeData?.data?.resultUrl) {
        const hdUrl = upgradeData.data.resultUrl;
        await base44.asServiceRole.entities.Scenes.update(scene_id, {
          video_url: hdUrl,
          status: 'video_generated'
        });
        return Response.json({
          success: true,
          status: 'COMPLETED',
          video_url: hdUrl,
          resolution: '1080p',
          task_id: realTaskId,
          scene_number: scene.scene_number
        });
      }

      return Response.json({
        success: true,
        status: 'PROCESSING',
        task_id: realTaskId,
        scene_number: scene.scene_number,
        message: 'Upgrading to 1080p...'
      });
    }

    const taskId = videoUrl.replace('veo_task:', '');
    console.log(`Polling Veo task: ${taskId} for scene ${scene.scene_number}`);

    // ══════════════════════════════════════════════════════════════
    // POLL TASK STATUS
    // ══════════════════════════════════════════════════════════════

    const statusRes = await fetch(`${VEO_BASE}/record-info?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
    });

    const statusText = await statusRes.text();
    console.log(`Veo status response (${statusRes.status}): ${statusText.substring(0, 500)}`);

    if (!statusRes.ok) {
      return Response.json({
        error: `Veo status check failed: ${statusRes.status} - ${statusText}`
      }, { status: 500 });
    }

    let statusData;
    try {
      statusData = JSON.parse(statusText);
    } catch (e) {
      return Response.json({ error: `Veo returned non-JSON: ${statusText.substring(0, 200)}` }, { status: 500 });
    }

    if (statusData.code !== 200) {
      return Response.json({
        error: `Veo status error: ${statusData.msg}`,
        code: statusData.code
      }, { status: 500 });
    }

    const record = statusData.data;
    const successFlag = record?.successFlag;
    const errorMessage = record?.errorMessage;

    console.log(`Task ${taskId}: successFlag=${successFlag}, errorMessage=${errorMessage || 'none'}`);

    // ── Still processing (successFlag === 0) ────────────────────
    if (successFlag === 0 || successFlag === null || successFlag === undefined) {
      return Response.json({
        success: true,
        status: 'PROCESSING',
        task_id: taskId,
        scene_number: scene.scene_number,
        created_at: record?.createTime
      });
    }

    // ── Failed (successFlag === 2 or 3) ─────────────────────────
    if (successFlag === 2 || successFlag === 3) {
      console.error(`Veo task ${taskId} failed (flag=${successFlag}): ${errorMessage || record?.errorCode}`);

      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        status: 'failed'
      });

      return Response.json({
        success: false,
        status: 'FAILED',
        error: errorMessage || `Video generation failed (flag=${successFlag})`,
        task_id: taskId
      });
    }

    // ── Completed (successFlag === 1) ───────────────────────────
    if (successFlag === 1) {
      const response = record?.response || {};
      const resolution = response.resolution || '';

      // Check if this is already a 1080p task or if we need to request upgrade
      const isAlready1080p = resolution === '1080p' || videoUrl.startsWith('veo_1080p:');

      if (!isAlready1080p && !videoUrl.startsWith('veo_1080p:')) {
        // Fast model completed — now request 1080p upgrade
        console.log(`Veo task ${taskId}: fast gen complete (${resolution}), requesting 1080p upgrade...`);

        const upgradeRes = await fetch(`${VEO_BASE}/get-1080p-video?taskId=${taskId}`, {
          headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
        });
        const upgradeText = await upgradeRes.text();
        console.log(`1080p upgrade response (${upgradeRes.status}): ${upgradeText.substring(0, 500)}`);

        let upgradeData;
        try { upgradeData = JSON.parse(upgradeText); } catch (_) { upgradeData = null; }

        if (upgradeData?.code === 200 && upgradeData?.data?.resultUrl) {
          // 1080p ready immediately
          const hdUrl = upgradeData.data.resultUrl;
          console.log(`1080p ready immediately: ${hdUrl.substring(0, 80)}`);

          await base44.asServiceRole.entities.Scenes.update(scene_id, {
            video_url: hdUrl,
            status: 'video_generated'
          });

          return Response.json({
            success: true,
            status: 'COMPLETED',
            video_url: hdUrl,
            resolution: '1080p',
            task_id: taskId,
            scene_number: scene.scene_number
          });
        }

        // 1080p not ready yet — mark scene so next poll retries the 1080p endpoint
        console.log(`1080p not ready yet (code=${upgradeData?.code}), will retry on next poll`);
        await base44.asServiceRole.entities.Scenes.update(scene_id, {
          video_url: `veo_1080p:${taskId}`
        });

        return Response.json({
          success: true,
          status: 'PROCESSING',
          task_id: taskId,
          scene_number: scene.scene_number,
          message: 'Video generated, upgrading to 1080p...'
        });
      }

      // We're in 1080p polling phase — retry the 1080p endpoint
      if (videoUrl.startsWith('veo_1080p:')) {
        const realTaskId = videoUrl.replace('veo_1080p:', '');
        console.log(`Retrying 1080p upgrade for task ${realTaskId}...`);

        const upgradeRes = await fetch(`${VEO_BASE}/get-1080p-video?taskId=${realTaskId}`, {
          headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
        });
        const upgradeText = await upgradeRes.text();
        console.log(`1080p retry response (${upgradeRes.status}): ${upgradeText.substring(0, 500)}`);

        let upgradeData;
        try { upgradeData = JSON.parse(upgradeText); } catch (_) { upgradeData = null; }

        if (upgradeData?.code === 200 && upgradeData?.data?.resultUrl) {
          const hdUrl = upgradeData.data.resultUrl;
          console.log(`1080p ready: ${hdUrl.substring(0, 80)}`);

          await base44.asServiceRole.entities.Scenes.update(scene_id, {
            video_url: hdUrl,
            status: 'video_generated'
          });

          return Response.json({
            success: true,
            status: 'COMPLETED',
            video_url: hdUrl,
            resolution: '1080p',
            task_id: realTaskId,
            scene_number: scene.scene_number
          });
        }

        // Still not ready
        return Response.json({
          success: true,
          status: 'PROCESSING',
          task_id: realTaskId,
          scene_number: scene.scene_number,
          message: 'Upgrading to 1080p...'
        });
      }

      // Fallback — use whatever URL we have
      let finalVideoUrl = response.resultUrls?.[0] || response.originUrls?.[0];
      console.log(`Veo task ${taskId}: complete | resolution: ${resolution} | url: ${finalVideoUrl?.substring(0, 80)}`);

      if (!finalVideoUrl) {
        return Response.json({
          error: 'Task completed but no video URL found in response',
          task_id: taskId,
          raw_response: response
        }, { status: 500 });
      }

      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: finalVideoUrl,
        status: 'video_generated'
      });

      return Response.json({
        success: true,
        status: 'COMPLETED',
        video_url: finalVideoUrl,
        resolution: resolution || '1080p',
        task_id: taskId,
        scene_number: scene.scene_number
      });
    }

    // ── Unknown state ───────────────────────────────────────────
    return Response.json({
      success: true,
      status: 'UNKNOWN',
      task_id: taskId,
      raw_flag: successFlag
    });

  } catch (error) {
    console.error("pollSceneVideo error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});