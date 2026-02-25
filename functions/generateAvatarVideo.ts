import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { create, getNumericDate } from 'npm:djwt@3.0.2';

// ══════════════════════════════════════════════════════════════════
// AVATAR VIDEO v2 — KIE API primary, Kling direct API fallback
// ══════════════════════════════════════════════════════════════════
//
// Primary: KIE API (api.kie.ai) — kling/ai-avatar-standard
//   POST /api/v1/jobs/createTask
//   Auth: Bearer KIE_API_KEY
//   Poll: POST /api/v1/jobs/queryTask
//
// Fallback: Kling Direct API (api-singapore.klingai.com)
//   POST /v1/videos/avatar/image2video
//   Auth: JWT from KLING_ACCESS_KEY + KLING_SECRET_KEY
// ══════════════════════════════════════════════════════════════════

const KLING_API_BASE = 'https://api-singapore.klingai.com';

async function generateKlingJwt() {
  const accessKey = Deno.env.get('KLING_ACCESS_KEY');
  const secretKey = Deno.env.get('KLING_SECRET_KEY');
  if (!accessKey || !secretKey) throw new Error('KLING_ACCESS_KEY or KLING_SECRET_KEY not configured');

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

// ── KIE API submit ─────────────────────────────────────────────
async function submitViaKie(imageUrl, audioUrl, prompt, mode) {
  const kieKey = Deno.env.get('KIE_API_KEY');
  if (!kieKey) throw new Error('KIE_API_KEY not configured');

  const model = mode === 'pro' ? 'kling/ai-avatar-pro' : 'kling/ai-avatar-standard';

  const body = {
    model,
    input: {
      image_url: imageUrl,
      audio_url: audioUrl,
      prompt: prompt || '',
    },
  };

  console.log(`🎬 KIE submit: model=${model}`);
  const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${kieKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log(`🎬 KIE response: HTTP ${res.status} → ${JSON.stringify(data).substring(0, 400)}`);

  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(`KIE error: code=${data.code} msg=${data.message || JSON.stringify(data)}`);
  }

  return { taskId: data.data.taskId, provider: 'kie' };
}

// ── Kling Direct API submit ────────────────────────────────────
async function submitViaKlingDirect(imageUrl, audioUrl, prompt, mode) {
  const jwtToken = await generateKlingJwt();

  const body = {
    model_name: 'kling-v1-6',
    image: imageUrl,
    sound_file: audioUrl,
    prompt: prompt || undefined,
    mode,
  };

  console.log(`🎬 Kling Direct submit: mode=${mode}`);
  const res = await fetch(`${KLING_API_BASE}/v1/videos/avatar/image2video`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log(`🎬 Kling Direct response: HTTP ${res.status} → code=${data.code} msg=${data.message}`);

  if (data.code !== 0) {
    throw new Error(`Kling Direct error: code=${data.code} msg=${data.message}`);
  }

  if (!data.data?.task_id) {
    throw new Error('Kling Direct: no task_id returned');
  }

  return { taskId: data.data.task_id, provider: 'kling_direct' };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, audio_url, prompt = '', scene_id, mode = 'std' } = await req.json();

    if (!image_url) return Response.json({ error: 'Missing image_url' }, { status: 400 });
    if (!audio_url) return Response.json({ error: 'Missing audio_url' }, { status: 400 });
    if (image_url.startsWith('data:')) {
      return Response.json({ error: 'Image must be a public URL, not a data URI' }, { status: 400 });
    }

    console.log(`🎬 Avatar: image=${image_url.substring(0, 120)}`);
    console.log(`🎬 Audio: ${audio_url.substring(0, 120)}`);
    console.log(`🎬 Prompt: ${prompt.substring(0, 80)}, Mode: ${mode}`);

    // ── Re-upload files for guaranteed public accessibility ─────
    let finalImageUrl = image_url;
    let finalAudioUrl = audio_url;

    try {
      console.log('🎬 Re-uploading image...');
      const imgResp = await fetch(image_url);
      if (!imgResp.ok) throw new Error(`Image fetch: ${imgResp.status}`);
      const imgBlob = await imgResp.blob();
      const imgUpload = await base44.asServiceRole.integrations.Core.UploadFile({
        file: new File([imgBlob], 'avatar-input.png', { type: imgBlob.type || 'image/png' }),
      });
      finalImageUrl = imgUpload.file_url;
      console.log(`🎬 Image re-uploaded: ${finalImageUrl.substring(0, 80)}`);
    } catch (e) {
      console.log(`🎬 Image re-upload skipped: ${e.message}`);
    }

    try {
      console.log('🎬 Re-uploading audio...');
      const audResp = await fetch(audio_url);
      if (!audResp.ok) throw new Error(`Audio fetch: ${audResp.status}`);
      const audBlob = await audResp.blob();
      const audUpload = await base44.asServiceRole.integrations.Core.UploadFile({
        file: new File([audBlob], 'avatar-audio.mp3', { type: audBlob.type || 'audio/mpeg' }),
      });
      finalAudioUrl = audUpload.file_url;
      console.log(`🎬 Audio re-uploaded: ${finalAudioUrl.substring(0, 80)}`);
    } catch (e) {
      console.log(`🎬 Audio re-upload skipped: ${e.message}`);
    }

    // ── Try KIE first, then Kling Direct ───────────────────────
    let result = null;
    let lastError = '';

    const kieKey = Deno.env.get('KIE_API_KEY');
    if (kieKey) {
      try {
        result = await submitViaKie(finalImageUrl, finalAudioUrl, prompt, mode);
        console.log(`✅ KIE task created: ${result.taskId}`);
      } catch (err) {
        lastError = err.message;
        console.warn(`⚠️ KIE failed: ${err.message}`);
      }
    } else {
      console.log('🎬 KIE_API_KEY not set, skipping KIE');
    }

    if (!result) {
      const klingAccess = Deno.env.get('KLING_ACCESS_KEY');
      if (klingAccess) {
        try {
          result = await submitViaKlingDirect(finalImageUrl, finalAudioUrl, prompt, mode);
          console.log(`✅ Kling Direct task created: ${result.taskId}`);
        } catch (err) {
          lastError = err.message;
          console.warn(`⚠️ Kling Direct failed: ${err.message}`);
        }
      } else {
        console.log('🎬 KLING_ACCESS_KEY not set, skipping Kling Direct');
      }
    }

    if (!result) {
      return Response.json({
        success: false,
        error: `All avatar providers failed. Last error: ${lastError}`,
      });
    }

    // Store task reference on scene
    if (scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: `${result.provider}:${result.taskId}`,
        status: 'pending',
      });
    }

    return Response.json({
      success: true,
      task_id: result.taskId,
      provider: result.provider,
      status: 'CREATED',
    });

  } catch (error) {
    console.error('generateAvatarVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});