import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { create, getNumericDate } from 'npm:djwt@3.0.2';

// ══════════════════════════════════════════════════════════════════
// KLING AI AVATAR VIDEO — Direct API (api-singapore.klingai.com)
// ══════════════════════════════════════════════════════════════════
//
// Generates a lip-synced talking head video using Kling AI Avatar.
// Endpoint: POST /v1/videos/avatar/image2video
// Auth: JWT signed with KLING_ACCESS_KEY + KLING_SECRET_KEY
//
// Input: image_url, audio_url, prompt (motion description)
// Returns: task_id for polling
// ══════════════════════════════════════════════════════════════════

const KLING_API_BASE = 'https://api-singapore.klingai.com';

async function generateKlingJwt() {
  const accessKey = Deno.env.get('KLING_ACCESS_KEY');
  const secretKey = Deno.env.get('KLING_SECRET_KEY');

  if (!accessKey || !secretKey) {
    throw new Error('KLING_ACCESS_KEY or KLING_SECRET_KEY not configured');
  }

  // Encode secret key as CryptoKey for HS256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  const now = Math.floor(Date.now() / 1000);
  const token = await create(
    { alg: 'HS256', typ: 'JWT' },
    {
      iss: accessKey,
      exp: getNumericDate(1800), // 30 min expiry
      nbf: getNumericDate(-5),   // valid from 5 sec ago
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

    const { image_url, audio_url, prompt = '', scene_id, mode = 'pro' } = await req.json();

    if (!image_url) return Response.json({ error: 'Missing image_url' }, { status: 400 });
    if (!audio_url) return Response.json({ error: 'Missing audio_url' }, { status: 400 });

    // Ensure image is a public URL (not data URI)
    if (image_url.startsWith('data:')) {
      return Response.json({ error: 'Image must be a public URL, not a data URI' }, { status: 400 });
    }

    console.log(`🎬 Kling Avatar: image=${image_url.substring(0, 150)}`);
    console.log(`🎬 Audio: ${audio_url.substring(0, 150)}`);
    console.log(`🎬 Prompt: ${prompt.substring(0, 100)}`);
    console.log(`🎬 Mode: ${mode}`);

    // ── Ensure URLs are publicly accessible from Kling's servers ──────
    // Kling returns misleading "402 credits insufficient" when it can't
    // fetch the image or audio. Re-download and re-upload via Base44
    // public storage to guarantee accessibility.
    let finalImageUrl = image_url;
    let finalAudioUrl = audio_url;

    // Re-upload image if it's from supabase or internal storage
    try {
      console.log('🎬 Re-uploading image for public accessibility...');
      const imgResp = await fetch(image_url);
      if (!imgResp.ok) throw new Error(`Image fetch failed: ${imgResp.status}`);
      const imgBlob = await imgResp.blob();
      const imgFile = new File([imgBlob], 'avatar-input.png', { type: imgBlob.type || 'image/png' });
      const imgUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: imgFile });
      finalImageUrl = imgUpload.file_url;
      console.log(`🎬 Image re-uploaded: ${finalImageUrl.substring(0, 100)}`);
    } catch (imgErr) {
      console.log(`🎬 Image re-upload failed, using original: ${imgErr.message}`);
    }

    // Re-upload audio
    try {
      console.log('🎬 Re-uploading audio for public accessibility...');
      const audResp = await fetch(audio_url);
      if (!audResp.ok) throw new Error(`Audio fetch failed: ${audResp.status}`);
      const audBlob = await audResp.blob();
      const audFile = new File([audBlob], 'avatar-audio.mp3', { type: audBlob.type || 'audio/mpeg' });
      const audUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: audFile });
      finalAudioUrl = audUpload.file_url;
      console.log(`🎬 Audio re-uploaded: ${finalAudioUrl.substring(0, 100)}`);
    } catch (audErr) {
      console.log(`🎬 Audio re-upload failed, using original: ${audErr.message}`);
    }

    // Generate JWT for Kling API
    const jwtToken = await generateKlingJwt();

    const requestBody = {
      model_name: 'kling-v1-6',
      image: finalImageUrl,
      sound_file: finalAudioUrl,
      prompt: prompt || undefined,
      mode, // 'std' or 'pro'
    };
    console.log(`🎬 Final image URL: ${finalImageUrl.substring(0, 150)}`);
    console.log(`🎬 Final audio URL: ${finalAudioUrl.substring(0, 150)}`);

    // Submit to Kling AI Avatar endpoint
    const res = await fetch(`${KLING_API_BASE}/v1/videos/avatar/image2video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();
    console.log(`Kling Avatar submit: ${res.status} → code=${data.code} msg=${data.message}`);
    if (data.code !== 0) {
      console.log(`Full error response: ${JSON.stringify(data).substring(0, 500)}`);
    }

    if (data.code !== 0) {
      // Return error with 200 status so frontend can read the body properly
      // (axios throws on non-2xx and may lose response body)
      return Response.json({
        success: false,
        error: data.code === 402
          ? 'Kling AI credits insufficient. Please top up your Kling account at https://klingai.com to continue generating lip-sync videos.'
          : `Kling Avatar API error: ${data.message || 'Unknown error'} (code ${data.code})`,
        error_code: data.code,
      });
    }

    const taskId = data.data?.task_id;
    const taskStatus = data.data?.task_status;

    if (!taskId) {
      return Response.json({ success: false, error: 'No task_id returned from Kling API', raw: data });
    }

    console.log(`Kling Avatar task created: ${taskId} (status: ${taskStatus})`);

    // If scene_id provided, store task reference
    if (scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: `kling_avatar:${taskId}`,
        status: 'pending',
      });
    }

    return Response.json({
      success: true,
      task_id: taskId,
      task_status: taskStatus || 'submitted',
      provider: `kling_avatar_v1_${mode}`,
      status: 'CREATED',
    });

  } catch (error) {
    console.error('generateAvatarVideo error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});