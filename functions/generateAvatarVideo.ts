import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { create, getNumericDate } from 'npm:djwt@3.0.2';

/* ═══════════════════════════════════════════════════════════════
   AVATAR VIDEO — KIE API primary, Kling Direct fallback
   Build: 2026-02-25T12:00
   ═══════════════════════════════════════════════════════════════ */

const KLING_BASE = 'https://api-singapore.klingai.com';

async function klingJwt() {
  const ak = Deno.env.get('KLING_ACCESS_KEY');
  const sk = Deno.env.get('KLING_SECRET_KEY');
  if (!ak || !sk) throw new Error('KLING keys missing');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(sk),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
  return create({ alg: 'HS256', typ: 'JWT' },
    { iss: ak, exp: getNumericDate(1800), nbf: getNumericDate(-5), iat: getNumericDate(0) }, key);
}

/* ── KIE submit ──────────────────────────────────────────────── */
async function tryKie(img, aud, prompt, mode) {
  const apiKey = Deno.env.get('KIE_API_KEY');
  if (!apiKey) throw new Error('KIE_API_KEY not set');

  const model = mode === 'pro'
    ? 'kling/ai-avatar-pro'
    : 'kling/ai-avatar-standard';

  const payload = {
    model,
    input: { image_url: img, audio_url: aud, prompt: prompt || '' },
  };

  console.log('[KIE] POST createTask model=' + model);
  console.log('[KIE] image=' + img.substring(0, 80));
  console.log('[KIE] audio=' + aud.substring(0, 80));

  const resp = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify(payload),
  });

  const json = await resp.json();
  console.log('[KIE] status=' + resp.status + ' body=' + JSON.stringify(json).substring(0, 500));

  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error('KIE code=' + json.code + ' msg=' + (json.message || JSON.stringify(json)));
  }

  return { taskId: json.data.taskId, provider: 'kie' };
}

/* ── Kling Direct submit ─────────────────────────────────────── */
async function tryKlingDirect(img, aud, prompt, mode) {
  const jwt = await klingJwt();
  console.log('[KLING_DIRECT] POST image2video mode=' + mode);

  const resp = await fetch(KLING_BASE + '/v1/videos/avatar/image2video', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + jwt, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_name: 'kling-v1-6',
      image: img,
      sound_file: aud,
      prompt: prompt || undefined,
      mode,
    }),
  });

  const json = await resp.json();
  console.log('[KLING_DIRECT] status=' + resp.status + ' code=' + json.code + ' msg=' + json.message);

  if (json.code !== 0) {
    throw new Error('Kling code=' + json.code + ' msg=' + json.message);
  }
  if (!json.data?.task_id) throw new Error('Kling: no task_id');

  return { taskId: json.data.task_id, provider: 'kling_direct' };
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */

Deno.serve(async (req) => {
  console.log('=== generateAvatarVideo v4 invoked ===');

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, audio_url, prompt, scene_id, mode } = await req.json();
    const finalPrompt = prompt || '';
    const finalMode = mode || 'std';

    if (!image_url) return Response.json({ error: 'Missing image_url' }, { status: 400 });
    if (!audio_url) return Response.json({ error: 'Missing audio_url' }, { status: 400 });
    if (image_url.startsWith('data:')) return Response.json({ error: 'Use a URL not data URI' }, { status: 400 });

    console.log('[v4] input image=' + image_url.substring(0, 90));
    console.log('[v4] input audio=' + audio_url.substring(0, 90));
    console.log('[v4] prompt=' + finalPrompt.substring(0, 60) + ' mode=' + finalMode);

    /* Re-upload files for guaranteed accessibility */
    let img = image_url;
    let aud = audio_url;

    try {
      console.log('[v4] re-uploading image...');
      const r = await fetch(image_url);
      if (!r.ok) throw new Error('fetch ' + r.status);
      const b = await r.blob();
      const u = await base44.asServiceRole.integrations.Core.UploadFile({
        file: new File([b], 'av-img.png', { type: b.type || 'image/png' }),
      });
      img = u.file_url;
      console.log('[v4] image ok: ' + img.substring(0, 80));
    } catch (e) {
      console.log('[v4] image re-upload skip: ' + e.message);
    }

    try {
      console.log('[v4] re-uploading audio...');
      const r = await fetch(audio_url);
      if (!r.ok) throw new Error('fetch ' + r.status);
      const b = await r.blob();
      const u = await base44.asServiceRole.integrations.Core.UploadFile({
        file: new File([b], 'av-aud.mp3', { type: b.type || 'audio/mpeg' }),
      });
      aud = u.file_url;
      console.log('[v4] audio ok: ' + aud.substring(0, 80));
    } catch (e) {
      console.log('[v4] audio re-upload skip: ' + e.message);
    }

    /* ── Try KIE first ──────────────────────────────────────── */
    let result = null;
    let lastErr = '';

    const hasKie = !!Deno.env.get('KIE_API_KEY');
    console.log('[v4] KIE_API_KEY present: ' + hasKie);

    if (hasKie) {
      try {
        result = await tryKie(img, aud, finalPrompt, finalMode);
        console.log('[v4] KIE OK taskId=' + result.taskId);
      } catch (e) {
        lastErr = e.message;
        console.warn('[v4] KIE FAIL: ' + e.message);
      }
    }

    /* ── Fallback to Kling Direct ───────────────────────────── */
    if (!result) {
      const hasKling = !!Deno.env.get('KLING_ACCESS_KEY');
      console.log('[v4] KLING_ACCESS_KEY present: ' + hasKling);
      if (hasKling) {
        try {
          result = await tryKlingDirect(img, aud, finalPrompt, finalMode);
          console.log('[v4] Kling Direct OK taskId=' + result.taskId);
        } catch (e) {
          lastErr = e.message;
          console.warn('[v4] Kling Direct FAIL: ' + e.message);
        }
      }
    }

    if (!result) {
      return Response.json({ success: false, error: 'All providers failed. ' + lastErr });
    }

    if (scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: result.provider + ':' + result.taskId,
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
    console.error('[v4] FATAL:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});