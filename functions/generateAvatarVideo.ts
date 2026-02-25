import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { create, getNumericDate } from 'npm:djwt@3.0.2';

// ══════════════════════════════════════════════════════════════════
// AVATAR VIDEO v3 — KIE API primary, Kling direct fallback
// Deployed: 2026-02-25
// ══════════════════════════════════════════════════════════════════

const KLING_API_BASE = 'https://api-singapore.klingai.com';

async function makeKlingJwt() {
  const ak = Deno.env.get('KLING_ACCESS_KEY');
  const sk = Deno.env.get('KLING_SECRET_KEY');
  if (!ak || !sk) throw new Error('KLING keys not set');
  const enc = new TextEncoder();
  const ck = await crypto.subtle.importKey('raw', enc.encode(sk), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  return await create({ alg: 'HS256', typ: 'JWT' }, { iss: ak, exp: getNumericDate(1800), nbf: getNumericDate(-5), iat: getNumericDate(0) }, ck);
}

async function submitKie(imgUrl, audUrl, prompt, mode) {
  const key = Deno.env.get('KIE_API_KEY');
  if (!key) throw new Error('NO_KIE_KEY');
  const model = mode === 'pro' ? 'kling/ai-avatar-pro' : 'kling/ai-avatar-standard';
  console.log(`[KIE] Submitting: model=${model} img=${imgUrl.substring(0,60)} aud=${audUrl.substring(0,60)}`);
  
  const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model, input: { image_url: imgUrl, audio_url: audUrl, prompt: prompt || '' } }),
  });
  const d = await r.json();
  console.log(`[KIE] Response: HTTP ${r.status} → ${JSON.stringify(d).substring(0,400)}`);
  if (d.code !== 200 || !d.data?.taskId) throw new Error(`KIE err: code=${d.code} msg=${d.message || JSON.stringify(d)}`);
  return { taskId: d.data.taskId, provider: 'kie' };
}

async function submitKlingDirect(imgUrl, audUrl, prompt, mode) {
  const jwt = await makeKlingJwt();
  console.log(`[KLING] Submitting: mode=${mode}`);
  const r = await fetch(`${KLING_API_BASE}/v1/videos/avatar/image2video`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_name: 'kling-v1-6', image: imgUrl, sound_file: audUrl, prompt: prompt || undefined, mode }),
  });
  const d = await r.json();
  console.log(`[KLING] Response: HTTP ${r.status} → code=${d.code} msg=${d.message}`);
  if (d.code !== 0) throw new Error(`Kling err: code=${d.code} msg=${d.message}`);
  if (!d.data?.task_id) throw new Error('Kling: no task_id');
  return { taskId: d.data.task_id, provider: 'kling_direct' };
}

Deno.serve(async (req) => {
  console.log('[AVATAR_V3] Handler invoked');
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { image_url, audio_url, prompt = '', scene_id, mode = 'std' } = body;
    if (!image_url) return Response.json({ error: 'Missing image_url' }, { status: 400 });
    if (!audio_url) return Response.json({ error: 'Missing audio_url' }, { status: 400 });
    if (image_url.startsWith('data:')) return Response.json({ error: 'Image must be a URL' }, { status: 400 });

    console.log(`[AVATAR_V3] image=${image_url.substring(0,100)}`);
    console.log(`[AVATAR_V3] audio=${audio_url.substring(0,100)}`);
    console.log(`[AVATAR_V3] prompt=${prompt.substring(0,60)} mode=${mode}`);

    // Re-upload for public accessibility
    let imgFinal = image_url;
    let audFinal = audio_url;

    try {
      const ir = await fetch(image_url);
      if (!ir.ok) throw new Error(`img fetch ${ir.status}`);
      const ib = await ir.blob();
      const iu = await base44.asServiceRole.integrations.Core.UploadFile({ file: new File([ib], 'avatar-img.png', { type: ib.type || 'image/png' }) });
      imgFinal = iu.file_url;
      console.log(`[AVATAR_V3] img re-uploaded: ${imgFinal.substring(0,80)}`);
    } catch (e) { console.log(`[AVATAR_V3] img re-upload skip: ${e.message}`); }

    try {
      const ar = await fetch(audio_url);
      if (!ar.ok) throw new Error(`aud fetch ${ar.status}`);
      const ab = await ar.blob();
      const au = await base44.asServiceRole.integrations.Core.UploadFile({ file: new File([ab], 'avatar-aud.mp3', { type: ab.type || 'audio/mpeg' }) });
      audFinal = au.file_url;
      console.log(`[AVATAR_V3] aud re-uploaded: ${audFinal.substring(0,80)}`);
    } catch (e) { console.log(`[AVATAR_V3] aud re-upload skip: ${e.message}`); }

    // Try KIE first, Kling direct as fallback
    let result = null;
    let lastErr = '';

    if (Deno.env.get('KIE_API_KEY')) {
      try {
        result = await submitKie(imgFinal, audFinal, prompt, mode);
        console.log(`[AVATAR_V3] ✅ KIE success: ${result.taskId}`);
      } catch (e) {
        lastErr = e.message;
        console.warn(`[AVATAR_V3] ⚠️ KIE failed: ${e.message}`);
      }
    } else {
      console.log('[AVATAR_V3] KIE_API_KEY not set');
    }

    if (!result && Deno.env.get('KLING_ACCESS_KEY')) {
      try {
        result = await submitKlingDirect(imgFinal, audFinal, prompt, mode);
        console.log(`[AVATAR_V3] ✅ Kling Direct success: ${result.taskId}`);
      } catch (e) {
        lastErr = e.message;
        console.warn(`[AVATAR_V3] ⚠️ Kling Direct failed: ${e.message}`);
      }
    }

    if (!result) {
      return Response.json({ success: false, error: `All providers failed. ${lastErr}` });
    }

    if (scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: `${result.provider}:${result.taskId}`,
        status: 'pending',
      });
    }

    return Response.json({ success: true, task_id: result.taskId, provider: result.provider, status: 'CREATED' });
  } catch (error) {
    console.error('[AVATAR_V3] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});