import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// KLING AVATAR VIDEO POLLER — Checks Kie Market task status
// ══════════════════════════════════════════════════════════════════
//
// Uses unified Kie Market polling endpoint.
// States: waiting, queuing, generating, success, fail
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, scene_id } = await req.json();

    if (!task_id) return Response.json({ error: 'Missing task_id' }, { status: 400 });

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    console.log(`Polling Kling Avatar task: ${task_id}`);

    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${task_id}`, {
      headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
    });

    const data = await res.json();
    if (data.code !== 200) {
      return Response.json({ error: `Poll error: ${data.message}` }, { status: 500 });
    }

    const { state, resultJson, failMsg } = data.data;
    console.log(`Task ${task_id}: state=${state}`);

    if (state === 'success') {
      const result = JSON.parse(resultJson);
      const videoUrl = result.resultUrls?.[0] || result.url;

      if (!videoUrl) {
        return Response.json({ error: 'Task success but no video URL', raw: result }, { status: 500 });
      }

      // Update scene if provided
      if (scene_id) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, {
          video_url: videoUrl,
          status: 'video_generated',
        });
      }

      return Response.json({
        success: true,
        status: 'COMPLETED',
        video_url: videoUrl,
      });
    }

    if (state === 'fail') {
      if (scene_id) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: 'failed' });
      }
      return Response.json({
        success: false,
        status: 'FAILED',
        error: failMsg || 'Avatar video generation failed',
      });
    }

    // Still processing
    return Response.json({
      success: true,
      status: 'PROCESSING',
      state,
      task_id,
    });

  } catch (error) {
    console.error('pollAvatarVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});