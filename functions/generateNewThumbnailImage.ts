import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL IMAGE GENERATION (MakeThumbnail flow)
// Primary: AI33 SeedDream 4.5 (async → frontend polls via pollThumbnailTask)
// Fallback: Nano-Banana-2 via KIE (supports image_input for face references)
// ══════════════════════════════════════════════════════════════════

const AI33_BASE = "https://api.ai33.pro";
const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ── Build the thumbnail prompt ──────────────────────────────────
function buildThumbnailPrompt({ overlayText, font, textColor, hasTemplate, hasPhotos, photoCount, concept, charDescriptions }) {
  const imagePrompt = concept.image_prompt || '';

  // Character clothing notes
  const clothingBlock = (() => {
    const descs = (charDescriptions || []).filter((d) => d && d.trim());
    if (descs.length === 0) return '';
    let block = `\nCHARACTER CLOTHING NOTES:\n`;
    charDescriptions.forEach((d, i) => {
      if (d && d.trim()) block += `- Character ${i + 1}: ${d.trim()}\n`;
    });
    return block;
  })();

  if (hasTemplate && hasPhotos) {
    return `Professional YouTube thumbnail. Recreate the template layout exactly — same composition, background, colors, lighting, split/gradient, decorative elements, arrows, icons, badges, framing. Replace the people in the template with the person(s) from the reference photos.

FACE PRESERVATION (CRITICAL):
1. Exact bone structure, jawline, chin, forehead from reference
2. Exact skin tone, texture, complexion across face and body
3. Same nose shape, eye shape/color, lip thickness, hair color/texture/style
4. Same age appearance — do not age up or down
5. Body build must match reference proportions

WHAT TO KEEP FROM TEMPLATE:
- Overall composition, layout, background elements, decorative graphics
- Lighting style, color temperature, emotional energy
- General pose/framing positions

OBJECT REPLACEMENT:
- Replace template objects not relevant to this story with story-relevant objects from the concept
- Keep same size, position, framing — just swap what the object is

${clothingBlock}
TEXT HANDLING:
- REMOVE all original text from the template
${overlayText ? `- Add ONLY this text: "${overlayText}" in ${font}, ultra-bold, ${textColor} with thick black outline and strong drop shadow. Place where main title was in template.` : '- Output must contain NO text.'}

CONCEPT DETAILS:
${imagePrompt}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic, razor-sharp faces, professional studio-grade compositing.`;

  } else if (hasTemplate && !hasPhotos) {
    return `Recreate this YouTube thumbnail template with same layout, composition, lighting, energy.

OBJECT REPLACEMENT: Replace template objects with story-relevant objects from concept. Keep same size, position, framing.

STORY CONTEXT:
${imagePrompt}

TEXT:
- REMOVE all original text
${overlayText ? `- Add ONLY: "${overlayText}" in ${font}, ultra-bold, ${textColor} with black outline.` : '- No text in output.'}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic.`;

  } else if (hasPhotos) {
    return `Generate YouTube thumbnail scene. The person(s) MUST be the exact person(s) from reference photos.

FACE PRESERVATION: Exact bone structure, skin tone, nose, eyes, lips, hair, body build, age from reference.

${imagePrompt}

${clothingBlock}
${overlayText ? `TEXT: "${overlayText}" in ${font}, ultra-bold, ${textColor} with black outline.` : ''}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic, cinematic.`;

  } else {
    return `${imagePrompt}

${overlayText ? `Bold text overlay: "${overlayText}" in ${font}, ${textColor} with thick black outline.` : ''}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic, cinematic DSLR quality, razor-sharp faces.`;
  }
}

// ── AI33 SeedDream submit (async, returns task_id) ──────────────
async function submitAI33Thumbnail(apiKey, prompt) {
  console.log(`🌱 AI33 Seedream thumbnail: submitting (${prompt.length} chars)...`);

  const formData = new FormData();
  formData.append('prompt', prompt.substring(0, 4000));
  formData.append('model_id', 'bytedance-seedream-4.5');
  formData.append('generations_count', '1');
  formData.append('model_parameters', JSON.stringify({
    aspect_ratio: "16:9",
    resolution: "2K"
  }));

  const submitRes = await fetch(`${AI33_BASE}/v1i/task/generate-image`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData
  });

  const submitData = await submitRes.json();

  if (!submitData.success || !submitData.task_id) {
    throw new Error(`AI33 submit failed: ${submitData.message || JSON.stringify(submitData)}`);
  }

  console.log(`📡 AI33 thumbnail task submitted: ${submitData.task_id}`);
  return submitData.task_id;
}

// ── Upload image to KIE ─────────────────────────────────────────
async function uploadToKIE(b64, mime, label, apiKey) {
  const rawB64 = b64.includes(',') ? b64.split(',')[1] : b64;
  const cleanB64 = rawB64.replace(/[\s\r\n]/g, '');
  const binaryString = atob(cleanB64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  const actualMime = isPng ? 'image/png' : 'image/jpeg';
  const ext = isPng ? 'png' : 'jpg';
  const fileName = `${label}_${Date.now()}.${ext}`;
  console.log(`📤 Uploading ${label}: ${(bytes.length / 1024).toFixed(0)}KB`);

  try {
    const blob = new Blob([bytes], { type: actualMime });
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('uploadPath', 'thumbnails');
    const res = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (_) {}
    const url = data?.data?.fileUrl || data?.data?.downloadUrl || data?.data?.url;
    if (url) { console.log(`✅ ${label} → ${url}`); return url; }
    console.warn(`⚠️ ${label} stream: ${text.substring(0, 200)}`);
  } catch (e) { console.warn(`⚠️ ${label} stream error: ${e.message}`); }

  try {
    const dataUrl = `data:${actualMime};base64,${cleanB64}`;
    const res = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ base64Data: dataUrl, uploadPath: 'thumbnails', fileName }),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (_) {}
    const url = data?.data?.fileUrl || data?.data?.downloadUrl || data?.data?.url;
    if (url) { console.log(`✅ ${label} (b64) → ${url}`); return url; }
    console.warn(`❌ ${label} b64: ${text.substring(0, 200)}`);
  } catch (e) { console.warn(`❌ ${label} b64 error: ${e.message}`); }

  return null;
}

// ── KIE poll helper ─────────────────────────────────────────────
async function pollKIE(taskId, apiKey, maxAttempts = 20, interval = 5000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, interval));
    try {
      const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const text = await res.text();
      let pollData; try { pollData = JSON.parse(text); } catch (_) {}
      const state = pollData?.data?.state || '';
      console.log(`Poll ${attempt}/${maxAttempts}: state="${state}"`);

      if (state === 'success') {
        const rj = pollData?.data?.resultJson;
        let url = null;
        if (rj) {
          try {
            const p = typeof rj === 'string' ? JSON.parse(rj) : rj;
            url = p?.resultUrls?.[0] || p?.urls?.[0] || p?.images?.[0] || p?.url;
          } catch (_) {
            if (typeof rj === 'string' && rj.startsWith('http')) url = rj;
          }
        }
        if (!url) url = pollData?.data?.imageUrl || pollData?.data?.image_url || pollData?.data?.url;
        return { success: true, url };
      }
      if (state === 'fail') {
        return { success: false, error: pollData?.data?.failMsg || 'Generation failed' };
      }
    } catch (e) {
      console.warn(`Poll ${attempt}: ${e.message}`);
    }
  }
  return { success: false, error: 'Timed out waiting for result' };
}

// ── R2 re-upload helper ─────────────────────────────────────────
async function reuploadToR2(imageUrl, conceptId) {
  try {
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return imageUrl;
    const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
    const contentType = imgResp.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
    const fileName = `thumbnails/${conceptId}-${Date.now()}.${ext}`;
    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
        secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
      },
    });
    await r2Client.send(new PutObjectCommand({
      Bucket: (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim(),
      Key: fileName,
      Body: imgBytes,
      ContentType: contentType,
    }));
    const publicBase = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
    const persistentUrl = `${publicBase}/${fileName}`;
    console.log('✅ Re-uploaded to R2:', persistentUrl);
    return persistentUrl;
  } catch (e) {
    console.warn('R2 re-upload failed (non-fatal):', e.message);
    return imageUrl;
  }
}

// ════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { concept_id, char_photos: directCharPhotos, template_ref: directTemplateRef, custom_overlay_text, char_descriptions: directCharDescriptions } = body;
    if (!concept_id) return Response.json({ error: 'concept_id is required' }, { status: 400 });

    const AI33_API_KEY = Deno.env.get('AI33_API_KEY');
    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!AI33_API_KEY && !KIE_API_KEY) return Response.json({ error: 'No image API keys configured' }, { status: 500 });

    console.log('=== generateNewThumbnailImage ===');
    console.log(`Available: ${AI33_API_KEY ? 'AI33' : '—'} | ${KIE_API_KEY ? 'KIE' : '—'}`);
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 90000;
    const timeLeft = () => MAX_RUNTIME_MS - (Date.now() - startTime);

    // 1. Load concept
    let concept;
    try { concept = await base44.entities.ThumbnailConcepts.get(concept_id); }
    catch (e) { return Response.json({ error: `Could not load concept: ${e.message}` }, { status: 404 }); }
    if (!concept?.image_prompt) return Response.json({ error: 'Concept has no image_prompt' }, { status: 400 });

    // 2. Resolve character photos
    let charPhotos = [];
    if (Array.isArray(directCharPhotos) && directCharPhotos.some(p => p?.b64 || p?.url)) {
      charPhotos = directCharPhotos.filter(p => p?.b64 || p?.url);
      console.log('Direct char photos:', charPhotos.length);
    } else if (concept.char_photos_json) {
      try {
        const stored = JSON.parse(concept.char_photos_json);
        charPhotos = stored.filter(p => p?.b64 && !p.truncated);
      } catch (_) {}
    }

    // 3. Resolve template reference
    let templateRef = null;
    if (directTemplateRef?.b64) {
      templateRef = directTemplateRef;
    } else if (concept.template_ref_json) {
      try { templateRef = JSON.parse(concept.template_ref_json); } catch (_) {}
    }

    const hasCharPhotos = charPhotos.length > 0;
    const hasTemplateRef = !!templateRef?.b64;
    console.log(`📸 Photos: ${charPhotos.length} | Template: ${hasTemplateRef ? templateRef.name || 'yes' : 'NONE'}`);

    // 4. Build prompt
    const overlayText = (custom_overlay_text || concept.text_overlay || '').toUpperCase().trim();
    const rawStyle = concept.text_style || '';
    const fontMatch = rawStyle.match(/bebas neue|impact|montserrat|roboto|arial/i);
    const font = fontMatch ? fontMatch[0] : 'Impact';
    const colorMatch = rawStyle.match(/white|yellow|gold|red|black|orange/i);
    const textColor = colorMatch ? colorMatch[0] : 'white';
    const charDescriptions = Array.isArray(directCharDescriptions) ? directCharDescriptions : [];

    const prompt = buildThumbnailPrompt({
      overlayText, font, textColor,
      hasTemplate: hasTemplateRef,
      hasPhotos: hasCharPhotos,
      photoCount: charPhotos.length,
      concept, charDescriptions,
    });

    console.log(`Prompt length: ${prompt.length} chars`);

    // ═══════════════════════════════════════════════════════════
    // PRIMARY: AI33 SeedDream (async submit → frontend polls)
    // ═══════════════════════════════════════════════════════════
    if (AI33_API_KEY) {
      try {
        const ai33Prompt = prompt + "\n\nUltra high resolution, crisp sharp details, professional YouTube thumbnail quality, cinematic lighting.";
        const taskId = await submitAI33Thumbnail(AI33_API_KEY, ai33Prompt);

        // Return immediately — frontend will poll via pollThumbnailTask
        return Response.json({
          success: false,
          pending: true,
          task_id: taskId,
          task_type: 'ai33',
          concept_id,
          model_used: 'ai33-seedream-4.5',
          message: 'Generation in progress. Poll with task_id and task_type=ai33.',
        });
      } catch (e) {
        console.warn('AI33 SeedDream submit failed:', e.message, '→ falling back to KIE');
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FALLBACK: Nano-Banana-2 via KIE (supports image inputs)
    // ═══════════════════════════════════════════════════════════
    if (!KIE_API_KEY) {
      return Response.json({ error: 'AI33 failed and no KIE_API_KEY for fallback' }, { status: 500 });
    }

    console.log('📎 Falling back to KIE nano-banana-2 with image inputs...');

    // Upload images to KIE (template first, then char photos)
    const imageUrls = [];

    if (hasTemplateRef) {
      const url = await uploadToKIE(templateRef.b64, templateRef.mime || 'image/jpeg', 'template', KIE_API_KEY);
      if (url) imageUrls.push(url);
    }

    for (const [i, p] of charPhotos.entries()) {
      if (p.b64) {
        const url = await uploadToKIE(p.b64, p.mime || 'image/jpeg', `char_${i + 1}`, KIE_API_KEY);
        if (url) imageUrls.push(url);
      } else if (p.url) {
        console.log(`📥 Fetching remote photo ${i + 1}: ${p.url.substring(0, 80)}...`);
        try {
          const resp = await fetch(p.url);
          if (resp.ok) {
            const arrayBuf = await resp.arrayBuffer();
            const bytes = new Uint8Array(arrayBuf);
            let binaryStr = '';
            const chunkSize = 8192;
            for (let j = 0; j < bytes.length; j += chunkSize) {
              const chunk = bytes.subarray(j, Math.min(j + chunkSize, bytes.length));
              binaryStr += String.fromCharCode.apply(null, chunk);
            }
            const b64 = btoa(binaryStr);
            const url = await uploadToKIE(b64, 'image/jpeg', `char_${i + 1}`, KIE_API_KEY);
            if (url) imageUrls.push(url);
          }
        } catch (e) {
          console.warn(`⚠️ Remote fetch error for char_${i + 1}: ${e.message}`);
        }
      }
    }

    console.log(`Uploaded ${imageUrls.length} images to KIE`);

    // Submit to nano-banana-2
    const kieHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    };

    const createRes = await fetch(`${KIE_BASE}/createTask`, {
      method: 'POST',
      headers: kieHeaders,
      body: JSON.stringify({
        model: 'nano-banana-2',
        input: {
          prompt,
          image_input: imageUrls.length > 0 ? imageUrls : [],
          aspect_ratio: '16:9',
          resolution: '2K',
          output_format: 'png',
        }
      }),
    });
    const createText = await createRes.text();
    console.log(`nano-banana-2 → HTTP ${createRes.status}: ${createText.substring(0, 300)}`);

    let createData;
    try { createData = JSON.parse(createText); } catch (_) {}
    const taskId = createData?.data?.taskId;
    if (!taskId) {
      if (createData?.code === 402 || createText.includes('Credits insufficient')) {
        return Response.json({ error: 'KIE API credits exhausted. Please top up your KIE account.' }, { status: 402 });
      }
      return Response.json({ error: `KIE task creation failed: ${createText.substring(0, 200)}` }, { status: 500 });
    }
    console.log(`✅ KIE Task: ${taskId}`);

    // Poll for result (time-aware)
    const pollBudgetMs = Math.max(30000, timeLeft() - 15000);
    const maxPollAttempts = Math.min(18, Math.floor(pollBudgetMs / 5000));
    console.log(`Polling: up to ${maxPollAttempts} attempts, ${Math.round(pollBudgetMs / 1000)}s budget`);
    const result = await pollKIE(taskId, KIE_API_KEY, maxPollAttempts, 5000);

    // If still waiting, return task_id for frontend polling
    if (!result.success && result.error === 'Timed out waiting for result') {
      console.log('⏱ KIE generation still in progress — returning task_id for frontend polling');
      return Response.json({
        success: false,
        pending: true,
        task_id: taskId,
        task_type: 'kie',
        concept_id,
        model_used: 'nano-banana-2',
        message: 'Generation in progress. Poll with task_id.',
      });
    }

    if (!result.success) throw new Error(result.error);
    if (!result.url) throw new Error('Generation succeeded but no image URL returned');

    console.log(`✅ Generated: ${result.url}`);

    // Re-upload to R2
    const persistentUrl = timeLeft() > 8000 ? await reuploadToR2(result.url, concept_id) : result.url;

    // Save
    try {
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: persistentUrl, status: 'complete', is_selected: true,
      });
      console.log('✅ Saved');
    } catch (e) { console.warn('Save error:', e.message); }

    return Response.json({
      success: true,
      image_url: persistentUrl,
      concept_id,
      model_used: 'nano-banana-2',
    });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});