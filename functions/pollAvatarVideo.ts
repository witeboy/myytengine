import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { create, getNumericDate } from 'npm:djwt@3.0.2';

// ══════════════════════════════════════════════════════════════════
// KLING AVATAR VIDEO POLLER — Direct Kling API
// ══════════════════════════════════════════════════════════════════
//
// Polls: GET /v1/videos/avatar/image2video/{task_id}
// States: submitted, processing, succeed, failed
// ══════════════════════════════════════════════════════════════════

const KLING_API_BASE = 'https://api-singapore.klingai.com';

async function generateKlingJwt() {
  const accessKey = Deno.env.get('KLING_ACCESS_KEY');
  const secretKey = Deno.env.get('KLING_SECRET_KEY');

  if (!accessKey || !secretKey) {
    throw new Error('KLING_ACCESS_KEY or KLING_SECRET_KEY not configured');
  }

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  const token = await create(
    { alg: 'HS256', typ: 'JWT' },
    {
      iss: accessKey,
      exp: getNumericDate(1800),
      nbf: getNumericDate(-5),
      iat: getNumericDate(0),
    },
    cryptoKey
  );

  return token;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, scene_id } = await req.json();

    if (!task_id) return Response.json({ error: 'Missing task_id' }, { status: 400 });

    console.log(`Polling Kling Avatar task: ${task_id}`);

    const jwtToken = await generateKlingJwt();

    const res = await fetch(`${KLING_API_BASE}/v1/videos/avatar/image2video/${task_id}`, {
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log(`Poll response: HTTP ${res.status} → ${JSON.stringify(data).substring(0, 500)}`);

    if (data.code !== 0) {
      return Response.json({
        error: `Kling poll error: code=${data.code} message=${data.message}`,
      }, { status: 500 });
    }

    const taskStatus = data.data?.task_status;
    const taskStatusMsg = data.data?.task_status_msg;
    console.log(`Task ${task_id}: task_status=${taskStatus} msg=${taskStatusMsg || ''}`);

    if (taskStatus === 'succeed') {
      const videos = data.data?.task_result?.videos;
      const videoUrl = videos?.[0]?.url;
      const videoDuration = videos?.[0]?.duration;

      if (!videoUrl) {
        return Response.json({ error: 'Task succeed but no video URL', raw: data }, { status: 500 });
      }

      console.log(`Avatar video ready: ${videoUrl} (${videoDuration}s)`);

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
        duration: videoDuration,
      });
    }

    if (taskStatus === 'failed') {
      console.warn(`Avatar task failed: ${taskStatusMsg}`);
      if (scene_id) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: 'failed' });
      }
      return Response.json({
        success: false,
        status: 'FAILED',
        error: taskStatusMsg || 'Avatar video generation failed',
      });
    }

    // Still processing (submitted / processing)
    return Response.json({
      success: true,
      status: 'PROCESSING',
      task_status: taskStatus,
      state: taskStatus,
      task_id,
    });

  } catch (error) {
    console.error('pollAvatarVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});