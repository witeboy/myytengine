import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL IMAGE GENERATION v3
// Model order (text-to-image):  Z-image → Grok → Seedream
// Model order (image-to-image): Grok i2i → Ideogram Remix → Seedream Edit
// All via KIE API at api.kie.ai
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';

async function kieCreate(apiKey, model, input) {
  const r = await fetch(KIE_BASE + '/createTask', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input }),
  });
  const d = await r.json();
  if (!r.ok || d.code !== 200) throw new Error('KIE ' + model + ': ' + (d.msg || JSON.stringify(d)));
  return d.data.taskId;
}

async function kiePollSync(apiKey, taskId, maxMs) {
  const start = Date.now();
  const wait = maxMs || 120000;
  while (Date.now() - start < wait) {
    await new Promise(r => setTimeout(r, 4000));
    const r = await fetch(KIE_BASE + '/recordInfo?taskId=' + taskId, {
      headers: { Authorization: 'Bearer ' + apiKey },
    });
    const d = await r.json();
    if (d.code !== 200) continue;
    if (d.data?.state === 'success') {
      const j = JSON.parse(d.data.resultJson || '{}');
      return j.resultUrls?.[0] || j.url || j.imageUrl || null;
    }
    if (d.data?.state === 'fail') throw new Error(d.data?.failMsg || 'Task failed');
  }
  throw new Error('KIE task timed out');
}

function cleanPrompt(raw) {
  return raw
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
    .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed')
    .replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, 'shallow depth of field')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*/g, '').replace(/#{1,3}\s*/g, '')
    .replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const KIE_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    const body = await req.json();
    const { concept_id, char_photos } = body;
    if (!concept_id) return Response.json({ error: 'concept_id required' }, { status: 400 });

    const concepts = await base44.asServiceRole.entities.ThumbnailConcepts.filter({ id: concept_id });
    const concept = concepts[0];
    if (!concept) return Response.json({ error: 'Concept not found' }, { status: 404 });

    const prompt = concept.image_prompt;
    if (!prompt) return Response.json({ error: 'No image_prompt on concept' }, { status: 400 });

    const isShorts = prompt.includes('9:16') || prompt.includes('1080x1920');
    const aspectRatio = isShorts ? '9:16' : '16:9';
    const imageSize = isShorts ? 'portrait_9_16' : 'landscape_16_9';
    const p = cleanPrompt(prompt);
    const hasPhotos = char_photos && char_photos.length > 0;

    console.log('Thumbnail gen | concept:', concept_id, '| photos:', hasPhotos, '| aspect:', aspectRatio);

    // ══════════════════════════════════════════════════════════
    // IMAGE-TO-IMAGE PATH (user uploaded character photos)
    // Primary: Grok i2i → Fallback: Ideogram V3 Remix → Seedream Edit
    // ══════════════════════════════════════════════════════════
    if (hasPhotos) {
      const primaryPhoto = char_photos[0];
      const imageDataUrl = `data:${primaryPhoto.mime || 'image/jpeg'};base64,${primaryPhoto.b64}`;

      // Try Grok image-to-image
      try {
        console.log('Trying Grok image-to-image...');
        const taskId = await kieCreate(KIE_KEY, 'grok-imagine/image-to-image', {
          prompt: p.substring(0, 1500) + '. Professional YouTube thumbnail, 16:9, cinematic lighting, ultra detailed.',
          image_url: imageDataUrl,
          aspect_ratio: aspectRatio,
        });
        // Return task_id for frontend to poll
        return Response.json({
          success: false, pending: true,
          task_id: taskId, task_type: 'kie',
          concept_id, model: 'grok-i2i',
        });
      } catch (e) { console.warn('Grok i2i failed:', e.message); }

      // Fallback: Ideogram V3 Remix
      try {
        console.log('Trying Ideogram V3 Remix...');
        const taskId = await kieCreate(KIE_KEY, 'ideogram/v3-remix', {
          prompt: p.substring(0, 1500) + '. Professional YouTube thumbnail, cinematic composition.',
          image_url: imageDataUrl,
          image_size: imageSize,
          style: 'DESIGN',
          rendering_speed: 'QUALITY',
        });
        return Response.json({
          success: false, pending: true,
          task_id: taskId, task_type: 'kie',
          concept_id, model: 'ideogram-remix',
        });
      } catch (e) { console.warn('Ideogram remix failed:', e.message); }

      // Fallback: Seedream 4.5 Edit
      try {
        console.log('Trying Seedream 4.5 Edit...');
        const taskId = await kieCreate(KIE_KEY, 'bytedance/seedream-4.5-edit', {
          prompt: p.substring(0, 1500),
          image_url: imageDataUrl,
          aspect_ratio: aspectRatio,
        });
        return Response.json({
          success: false, pending: true,
          task_id: taskId, task_type: 'kie',
          concept_id, model: 'seedream-edit',
        });
      } catch (e) { console.warn('Seedream edit failed:', e.message); }
    }

    // ══════════════════════════════════════════════════════════
    // TEXT-TO-IMAGE PATH (no user photos)
    // Primary: Z-image → Fallback: Grok → Seedream 4.5
    // ══════════════════════════════════════════════════════════

    // Primary: Z-image (best general quality per KIE docs)
    try {
      console.log('Trying Z-image...');
      const taskId = await kieCreate(KIE_KEY, 'z-image', {
        prompt: p.substring(0, 1000) + '. Professional YouTube thumbnail, 16:9 widescreen, cinematic lighting, ultra sharp, high contrast.',
        aspect_ratio: aspectRatio,
        nsfw_checker: false,
      });
      return Response.json({
        success: false, pending: true,
        task_id: taskId, task_type: 'kie',
        concept_id, model: 'z-image',
      });
    } catch (e) { console.warn('Z-image failed:', e.message); }

    // Fallback: Grok text-to-image
    try {
      console.log('Trying Grok text-to-image...');
      const taskId = await kieCreate(KIE_KEY, 'grok-imagine/text-to-image', {
        prompt: p.substring(0, 1500) + '. Professional YouTube thumbnail, cinematic.',
        aspect_ratio: aspectRatio,
      });
      return Response.json({
        success: false, pending: true,
        task_id: taskId, task_type: 'kie',
        concept_id, model: 'grok-t2i',
      });
    } catch (e) { console.warn('Grok t2i failed:', e.message); }

    // Final fallback: Seedream 4.5
    try {
      console.log('Trying Seedream 4.5...');
      const taskId = await kieCreate(KIE_KEY, 'bytedance/seedream-4.5', {
        prompt: p.substring(0, 1500),
        aspect_ratio: aspectRatio,
        resolution: '2K',
      });
      return Response.json({
        success: false, pending: true,
        task_id: taskId, task_type: 'kie',
        concept_id, model: 'seedream-4.5',
      });
    } catch (e) { console.warn('Seedream failed:', e.message); }

    return Response.json({ error: 'All image generation models failed' }, { status: 500 });

  } catch (error) {
    console.error('generateThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
