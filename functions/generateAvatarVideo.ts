import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { create, getNumericDate } from 'npm:djwt@3.0.2';

/*
 * generateAvatarVideo — REWRITE Feb 25 2026
 * Primary: KIE API (api.kie.ai)
 * Fallback: Kling Direct (api-singapore.klingai.com)
 */

const BUILD_TAG = 'avatar_v5_feb25';

Deno.serve(async (req) => {
  console.log('>>> ' + BUILD_TAG + ' entry');

  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (authErr) {
    return Response.json({ error: 'Auth failed: ' + authErr.message }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch (parseErr) {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const imageUrl = body.image_url || '';
  const audioUrl = body.audio_url || '';
  const prompt = body.prompt || '';
  const mode = body.mode || 'std';
  const sceneId = body.scene_id || '';

  if (!imageUrl) return Response.json({ error: 'Missing image_url' }, { status: 400 });
  if (!audioUrl) return Response.json({ error: 'Missing audio_url' }, { status: 400 });

  console.log('>>> img: ' + imageUrl.substring(0, 100));
  console.log('>>> aud: ' + audioUrl.substring(0, 100));
  console.log('>>> prompt: ' + prompt.substring(0, 60) + ' mode=' + mode);

  // ─── Re-upload media to Base44 CDN for public access ───
  let imgFinal = imageUrl;
  let audFinal = audioUrl;

  try {
    console.log('>>> re-uploading image...');
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) throw new Error('HTTP ' + imgResp.status);
    const imgBlob = await imgResp.blob();
    const imgFile = new File([imgBlob], 'avatar-image.png', { type: imgBlob.type || 'image/png' });
    const imgUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: imgFile });
    imgFinal = imgUpload.file_url;
    console.log('>>> img cdn: ' + imgFinal.substring(0, 80));
  } catch (e) {
    console.log('>>> img re-upload skipped: ' + e.message);
  }

  try {
    console.log('>>> re-uploading audio...');
    const audResp = await fetch(audioUrl);
    if (!audResp.ok) throw new Error('HTTP ' + audResp.status);
    const audBlob = await audResp.blob();
    const audFile = new File([audBlob], 'avatar-audio.mp3', { type: audBlob.type || 'audio/mpeg' });
    const audUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: audFile });
    audFinal = audUpload.file_url;
    console.log('>>> aud cdn: ' + audFinal.substring(0, 80));
  } catch (e) {
    console.log('>>> aud re-upload skipped: ' + e.message);
  }

  // ─── Attempt 1: KIE API ────────────────────────────────
  const kieKey = Deno.env.get('KIE_API_KEY');
  console.log('>>> KIE_API_KEY present: ' + (kieKey ? 'yes' : 'no'));

  if (kieKey) {
    try {
      const kieModel = mode === 'pro'
        ? 'kling/ai-avatar-pro'
        : 'kling/ai-avatar-standard';

      const kiePayload = {
        model: kieModel,
        input: {
          image_url: imgFinal,
          audio_url: audFinal,
          prompt: prompt,
        },
      };

      console.log('>>> KIE request: model=' + kieModel);
      console.log('>>> KIE payload: ' + JSON.stringify(kiePayload).substring(0, 300));

      const kieResp = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + kieKey,
        },
        body: JSON.stringify(kiePayload),
      });

      const kieJson = await kieResp.json();
      console.log('>>> KIE response: HTTP ' + kieResp.status + ' → ' + JSON.stringify(kieJson).substring(0, 500));

      if (kieJson.code === 200 && kieJson.data && kieJson.data.taskId) {
        const taskId = kieJson.data.taskId;
        console.log('>>> KIE SUCCESS taskId=' + taskId);

        if (sceneId) {
          await base44.asServiceRole.entities.Scenes.update(sceneId, {
            video_url: 'kie:' + taskId,
            status: 'pending',
          });
        }

        return Response.json({
          success: true,
          task_id: taskId,
          provider: 'kie',
          status: 'CREATED',
        });
      }

      // KIE returned non-200 code
      console.warn('>>> KIE non-200: code=' + kieJson.code + ' msg=' + kieJson.message);
    } catch (kieErr) {
      console.warn('>>> KIE error: ' + kieErr.message);
    }
  }

  // ─── Attempt 2: Kling Direct API ───────────────────────
  const klingAK = Deno.env.get('KLING_ACCESS_KEY');
  const klingSK = Deno.env.get('KLING_SECRET_KEY');
  console.log('>>> KLING keys present: ' + (klingAK && klingSK ? 'yes' : 'no'));

  if (klingAK && klingSK) {
    try {
      const encoder = new TextEncoder();
      const cryptoKey = await crypto.subtle.importKey(
        'raw', encoder.encode(klingSK),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
      );
      const jwt = await create(
        { alg: 'HS256', typ: 'JWT' },
        { iss: klingAK, exp: getNumericDate(1800), nbf: getNumericDate(-5), iat: getNumericDate(0) },
        cryptoKey
      );

      console.log('>>> Kling Direct request: mode=' + mode);

      const klingResp = await fetch('https://api-singapore.klingai.com/v1/videos/avatar/image2video', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + jwt,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_name: 'kling-v1-6',
          image: imgFinal,
          sound_file: audFinal,
          prompt: prompt || undefined,
          mode: mode,
        }),
      });

      const klingJson = await klingResp.json();
      console.log('>>> Kling Direct response: HTTP ' + klingResp.status + ' code=' + klingJson.code + ' msg=' + klingJson.message);

      if (klingJson.code === 0 && klingJson.data && klingJson.data.task_id) {
        const taskId = klingJson.data.task_id;
        console.log('>>> Kling Direct SUCCESS taskId=' + taskId);

        if (sceneId) {
          await base44.asServiceRole.entities.Scenes.update(sceneId, {
            video_url: 'kling_direct:' + taskId,
            status: 'pending',
          });
        }

        return Response.json({
          success: true,
          task_id: taskId,
          provider: 'kling_direct',
          status: 'CREATED',
        });
      }

      console.warn('>>> Kling Direct non-0: code=' + klingJson.code + ' msg=' + klingJson.message);
      return Response.json({
        success: false,
        error: 'Kling: ' + (klingJson.message || 'Unknown error'),
      });
    } catch (klingErr) {
      console.warn('>>> Kling Direct error: ' + klingErr.message);
      return Response.json({ success: false, error: klingErr.message });
    }
  }

  return Response.json({ success: false, error: 'No avatar API providers configured' });
});