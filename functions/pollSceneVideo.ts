import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE VIDEO POLLER — Veo 3.1 Fast + 1080p Upgrade via Kie API
// ══════════════════════════════════════════════════════════════════
//
// Flow:
//   1. Poll record-info for base task (veo3_fast)
//   2. Once base succeeds → request 1080p upgrade
//   3. Poll 1080p until ready → save final URL
//
// Scene video_url states:
//   veo_task:{taskId}         — base generation in progress
//   veo_1080p:{taskId}        — 1080p upgrade in progress
//   https://...               — final video ready
//
// successFlag: 0=generating, 1=success, 2=failed, 3=gen failed
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

    const videoUrl = scene.video_url || '';

    // Already a real URL — done
    if (videoUrl.startsWith('http')) {
      return Response.json({ success: true, status: 'COMPLETED', video_url: videoUrl });
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: 1080p upgrade polling
    // ═══════════════════════════════════════════════════════════
    if (videoUrl.startsWith('veo_1080p:')) {
      const taskId = videoUrl.replace('veo_1080p:', '');
      console.log(`Polling 1080p upgrade for task: ${taskId}`);

      const res = await fetch(`${VEO_BASE}/get-1080p-video?taskId=${taskId}`, {
        headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
      });

      const data = await res.json();
      console.log(`1080p response (${res.status}): code=${data.code} msg=${data.msg}`);

      if (data.code === 200 && data.data?.resultUrl) {
        const finalUrl = data.data.resultUrl;
        console.log(`1080p ready: ${finalUrl.substring(0, 80)}`);

        await base44.asServiceRole.entities.Scenes.update(scene_id, {
          video_url: finalUrl,
          status: 'video_generated'
        });

        return Response.json({
          success: true,
          status: 'COMPLETED',
          video_url: finalUrl,
          resolution: '1080p',
          task_id: taskId,
          scene_number: scene.scene_number
        });
      }

      // Not ready yet — keep polling
      return Response.json({
        success: true,
        status: 'PROCESSING',
        phase: '1080p_upgrade',
        task_id: taskId,
        scene_number: scene.scene_number
      });
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: Base veo3_fast generation polling
    // ═══════════════════════════════════════════════════════════
    if (!videoUrl.startsWith('veo_task:')) {
      return Response.json({ error: 'No video task found on this scene', video_url: videoUrl }, { status: 400 });
    }

    const taskId = videoUrl.replace('veo_task:', '');
    console.log(`Polling base Veo task: ${taskId} for scene ${scene.scene_number}`);

    const statusRes = await fetch(`${VEO_BASE}/record-info?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
    });

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

    console.log(`Task ${taskId}: successFlag=${successFlag}, error=${errorMessage || 'none'}`);

    // Still generating
    if (successFlag === 0 || successFlag === null || successFlag === undefined) {
      return Response.json({
        success: true,
        status: 'PROCESSING',
        phase: 'base_generation',
        task_id: taskId,
        scene_number: scene.scene_number
      });
    }

    // Failed
    if (successFlag === 2 || successFlag === 3) {
      console.error(`Veo task ${taskId} failed (flag=${successFlag}): ${errorMessage}`);
      await base44.asServiceRole.entities.Scenes.update(scene_id, { status: 'failed' });
      return Response.json({
        success: false,
        status: 'FAILED',
        error: errorMessage || `Video generation failed (flag=${successFlag})`,
        task_id: taskId
      });
    }

    // Success — now request 1080p upgrade
    if (successFlag === 1) {
      console.log(`Base task ${taskId} complete, requesting 1080p upgrade...`);

      // Immediately try 1080p
      const upRes = await fetch(`${VEO_BASE}/get-1080p-video?taskId=${taskId}`, {
        headers: { "Authorization": `Bearer ${KIE_API_KEY}` }
      });
      const upData = await upRes.json();
      console.log(`1080p request: code=${upData.code} msg=${upData.msg}`);

      if (upData.code === 200 && upData.data?.resultUrl) {
        // Already ready
        const finalUrl = upData.data.resultUrl;
        console.log(`1080p immediately ready: ${finalUrl.substring(0, 80)}`);

        await base44.asServiceRole.entities.Scenes.update(scene_id, {
          video_url: finalUrl,
          status: 'video_generated'
        });

        return Response.json({
          success: true,
          status: 'COMPLETED',
          video_url: finalUrl,
          resolution: '1080p',
          task_id: taskId,
          scene_number: scene.scene_number
        });
      }

      // Not ready yet — mark scene for 1080p polling phase
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: `veo_1080p:${taskId}`
      });

      return Response.json({
        success: true,
        status: 'PROCESSING',
        phase: '1080p_upgrade',
        task_id: taskId,
        scene_number: scene.scene_number
      });
    }

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