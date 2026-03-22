import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

// ══════════════════════════════════════════════════════════════════
// AVATAR VIDEO POLLER — KIE + Kling Direct support
// ══════════════════════════════════════════════════════════════════
//
// Accepts: { task_id, provider, scene_id }
// provider = "kie" → poll api.kie.ai
// provider = "kling_direct" → poll api-singapore.klingai.com
// ══════════════════════════════════════════════════════════════════

const KLING_API_BASE = 'https://api-singapore.klingai.com';

async function generateKlingJwt() {
  const accessKey = Deno.env.get('KLING_ACCESS_KEY');
  const secretKey = Deno.env.get('KLING_SECRET_KEY');
  if (!accessKey || !secretKey) throw new Error('KLING keys not configured');

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );

  return await create(
    { alg: 'HS256', typ: 'JWT' },
    { iss: accessKey, exp: getNumericDate(1800), nbf: getNumericDate(-5), iat: getNumericDate(0) },
    cryptoKey
  );
}

// ── KIE poll ───────────────────────────────────────────────────
async function pollKie(taskId) {
  const kieKey = Deno.env.get('KIE_API_KEY');
  if (!kieKey) throw new Error('KIE_API_KEY not configured');

  const res = await fetch('https://api.kie.ai/api/v1/jobs/queryTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${kieKey}`,
    },
    body: JSON.stringify({ taskId }),
  });

  const data = await res.json();
  console.log(`KIE poll: HTTP ${res.status} → ${JSON.stringify(data).substring(0, 500)}`);

  const taskData = data.data;
  if (!taskData) throw new Error(`KIE poll: no data, code=${data.code}`);

  const state = taskData.state;

  if (state === 'success') {
    // Parse resultJson for the video URL
    let videoUrl = '';
    try {
      const resultObj = JSON.parse(taskData.resultJson);
      const urls = resultObj.resultUrls || resultObj.result_urls || [];
      videoUrl = urls[0] || '';
    } catch (_) {
      videoUrl = taskData.resultJson || '';
    }

    if (!videoUrl) throw new Error('KIE task success but no video URL in resultJson');

    return {
      status: 'COMPLETED',
      video_url: videoUrl,
      duration: taskData.costTime || 0,
    };
  }

  if (state === 'fail' || state === 'failed') {
    return {
      status: 'FAILED',
      error: taskData.failMsg || 'KIE task failed',
    };
  }

  // Still processing (queued, processing, etc.)
  return {
    status: 'PROCESSING',
    state: state,
  };
}

// ── Kling Direct poll ──────────────────────────────────────────
async function pollKlingDirect(taskId) {
  const jwtToken = await generateKlingJwt();

  const res = await fetch(`${KLING_API_BASE}/v1/videos/avatar/image2video/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  console.log(`Kling Direct poll: HTTP ${res.status} → ${JSON.stringify(data).substring(0, 500)}`);

  if (data.code !== 0) throw new Error(`Kling poll error: code=${data.code} msg=${data.message}`);

  const taskStatus = data.data?.task_status;

  if (taskStatus === 'succeed') {
    const videos = data.data?.task_result?.videos;
    const videoUrl = videos?.[0]?.url;
    if (!videoUrl) throw new Error('Kling succeed but no video URL');

    return {
      status: 'COMPLETED',
      video_url: videoUrl,
      duration: videos?.[0]?.duration || 0,
    };
  }

  if (taskStatus === 'failed') {
    return {
      status: 'FAILED',
      error: data.data?.task_status_msg || 'Kling task failed',
    };
  }

  return {
    status: 'PROCESSING',
    state: taskStatus,
  };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, provider = 'kie', scene_id } = await req.json();
    if (!task_id) return Response.json({ error: 'Missing task_id' }, { status: 400 });

    console.log(`Polling avatar task: ${task_id} (provider: ${provider})`);

    let result;
    if (provider === 'kling_direct') {
      result = await pollKlingDirect(task_id);
    } else {
      // Default to KIE
      result = await pollKie(task_id);
    }

    console.log(`Poll result: ${JSON.stringify(result)}`);

    // Update scene if completed/failed
    if (scene_id) {
      if (result.status === 'COMPLETED' && result.video_url) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, {
          video_url: result.video_url,
          status: 'video_generated',
        });
      } else if (result.status === 'FAILED') {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: 'failed' });
      }
    }

    return Response.json({
      success: result.status !== 'FAILED',
      status: result.status,
      video_url: result.video_url || null,
      duration: result.duration || null,
      state: result.state || null,
      error: result.error || null,
      task_id,
    });

  } catch (error) {
    console.error('pollAvatarVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});