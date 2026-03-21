import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// generateNewThumbnailImage — Nano Banana 2 via KIE API

// ── Build the structured element prompt ──────────────────────────────────
// Core innovation: Instead of dumping all images and hoping the AI figures
// it out, we EXPLICITLY label each image by its role and tell the AI
// exactly what to do with it.
function buildFaceSwapPrompt({ overlayText, font, textColor, textPosition, hasTemplate, hasPhotos, photoCount, concept, charDescriptions, roleMapping, imageOrder }) {
  const imagePrompt = concept.image_prompt || '';

  // Parse role mapping from concept_description
  let roles = roleMapping || {};
  if (!roles.photo_roles && concept.concept_description) {
    try { roles = JSON.parse(concept.concept_description); } catch (_) {}
  }
  const photoRoles = roles.photo_roles || [];
  const storyElements = roles.story_elements || {};

  // imageOrder tells us the exact sequence: [{type, role, index, description}, ...]
  // type = 'template' | 'character' | 'environment' | 'object'
  const order = imageOrder || [];

  if (order.length > 0) {
    // ═══════════════════════════════════════════════════════════════════
    // STRUCTURED ELEMENT MAPPING — the new approach
    // Each image is explicitly labeled by role
    // ═══════════════════════════════════════════════════════════════════

    let imageRolesBlock = 'IMAGE ROLES (each image has a SPECIFIC purpose):\n';
    for (let i = 0; i < order.length; i++) {
      const entry = order[i];
      const imgNum = i + 1;
      if (entry.type === 'template') {
        imageRolesBlock += `- Image ${imgNum} = LAYOUT TEMPLATE — Copy this exact composition, layout, text zones, character positions, background style, color scheme, and decorative elements (arrows, icons, badges). This defines WHERE everything goes.\n`;
      } else if (entry.type === 'character') {
        imageRolesBlock += `- Image ${imgNum} = CHARACTER REFERENCE — This is the REAL PERSON who MUST appear in the thumbnail. Use their EXACT face, skin tone, hair, body type, ethnicity, gender, age. ${entry.description ? `Details: ${entry.description}` : ''}\n`;
      } else if (entry.type === 'environment') {
        imageRolesBlock += `- Image ${imgNum} = ENVIRONMENT REFERENCE — Use this as the BLURRED BACKGROUND. Apply gaussian blur (radius 8-12px) to create depth. Match the colors, lighting, and atmosphere. ${entry.description ? `Details: ${entry.description}` : ''}\n`;
      } else if (entry.type === 'object') {
        imageRolesBlock += `- Image ${imgNum} = OBJECT REFERENCE — Place this product/item PROMINENTLY in the thumbnail. It must be clearly visible, sharp, and recognizable. ${entry.description ? `Details: ${entry.description}` : ''}\n`;
      }
    }

    const hasCharacterImages = order.some(o => o.type === 'character');
    const hasEnvironmentImages = order.some(o => o.type === 'environment');
    const hasObjectImages = order.some(o => o.type === 'object');
    const hasTemplateImage = order.some(o => o.type === 'template');

    // Build the story elements block
    let storyBlock = '';
    if (storyElements.characters || storyElements.environment || storyElements.objects) {
      storyBlock = `\nSTORY ELEMENTS (condensed from video summary):\n`;
      if (storyElements.characters) storyBlock += `CHARACTER(S): ${storyElements.characters}\n`;
      if (storyElements.environment) storyBlock += `ENVIRONMENT: ${storyElements.environment}\n`;
      if (storyElements.objects) storyBlock += `OBJECT(S): ${storyElements.objects}\n`;
    }

    return `You are a professional YouTube thumbnail compositor. You have been given ${order.length} images, each with a SPECIFIC role.

⚠️ CRITICAL: Each image serves a different purpose. Do NOT mix them up. Read the roles carefully.

${imageRolesBlock}
${storyBlock}
═══════════════════════════════════════════════
COMPOSITION RULES
═══════════════════════════════════════════════

${hasTemplateImage ? `LAYOUT: Recreate the EXACT layout from the TEMPLATE image — same composition, same zones, same framing, same decorative elements. The template defines WHERE everything goes.` : `LAYOUT: Create a professional YouTube thumbnail composition.`}

${hasCharacterImages ? `CHARACTER: The person in the CHARACTER REFERENCE image(s) MUST appear in the thumbnail. This is non-negotiable.
FACE RULES (VIOLATING ANY = FAILURE):
1. Same skull shape, jawline, chin, forehead — do not reshape
2. Same skin tone everywhere (face AND body) — do not lighten or darken
3. Same nose, eyes, lips, hair — do not alter any feature
4. Same age, gender, ethnicity — do not change
5. The output person must be IMMEDIATELY RECOGNIZABLE as the reference person
6. If the template shows a different person, REPLACE them with the CHARACTER REFERENCE person` : `CHARACTER: Create a person matching the story description.`}

${hasEnvironmentImages ? `BACKGROUND: Use the ENVIRONMENT REFERENCE image as the background. Apply a GAUSSIAN BLUR (radius 8-12px) to create cinematic depth of field. The environment should feel real and grounded because it IS real.` : `BACKGROUND: Create a background matching the story context.`}

${hasObjectImages ? `FOREGROUND OBJECT: The item from the OBJECT REFERENCE image must be PROMINENTLY placed in the thumbnail. It should be:
- Clearly visible and sharp (NOT blurred)
- Either held by the character, on a surface near them, or as a large visual element
- Recognizable as the EXACT same item from the reference photo` : `OBJECTS: Include the key objects described in the story.`}

═══════════════════════════════════════════════
ADDITIONAL SCENE CONTEXT
═══════════════════════════════════════════════
${imagePrompt}

${(() => {
      const descs = (charDescriptions || []).filter(d => d && d.trim());
      if (descs.length === 0) return '';
      let block = `\nCHARACTER CLOTHING NOTES:\n`;
      charDescriptions.forEach((d, i) => {
        if (d && d.trim()) block += `- Character ${i + 1}: ${d.trim()}\n`;
      });
      return block;
    })()}

═══════════════════════════════════════════════
TEXT HANDLING
═══════════════════════════════════════════════
${hasTemplateImage ? '- REMOVE every piece of text from the template image. Zero original text in output.' : ''}
${overlayText ? `- Add ONLY this text: "${overlayText}"
  • Font: ${font}, ultra-bold, condensed
  • Color: ${textColor} with thick black outline/stroke (6px+) and strong drop shadow
  • Size: 15-20% of frame height — readable at mobile thumbnail size
  • Position: ${textPosition}
  • This must be the ONLY text in the entire image` : '- Output must contain NO text whatsoever.'}

OUTPUT: YouTube thumbnail 16:9, 1920×1080, photorealistic, cinematic DSLR quality. Razor-sharp faces. Professional compositing.`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // FALLBACK: No role mapping available — use legacy logic
  // ═══════════════════════════════════════════════════════════════════
  if (hasTemplate && hasPhotos) {
    return `You have been given ${1 + photoCount} images. Image 1 = LAYOUT TEMPLATE. Images 2-${1 + photoCount} = CHARACTER REFERENCE PHOTOS.

Recreate Image 1's exact layout but replace all people with the EXACT person(s) from the reference photos. Same face, skin, hair, features.

${imagePrompt}

${overlayText ? `TEXT: Remove all template text. Add ONLY: "${overlayText}" in ${font}, ${textColor}, bold with black outline.` : 'NO text in output.'}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic.`;

  } else if (hasTemplate) {
    return `You have been given 1 image — a YouTube thumbnail template. Recreate it with story-relevant objects.

${imagePrompt}

${overlayText ? `TEXT: Remove all template text. Add ONLY: "${overlayText}" in ${font}, ${textColor}, bold with black outline.` : 'NO text in output.'}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic.`;

  } else if (hasPhotos) {
    return `You have been given ${photoCount} reference photo(s). The person(s) MUST appear in the output — same face, skin, hair, everything.

${imagePrompt}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic, cinematic quality.`;

  } else {
    return `${imagePrompt}\n\nOutput: YouTube thumbnail 16:9, 1920×1080, photorealistic, cinematic DSLR quality.`;
  }
}

// ── Enhance prompt builder (for post-processing) ────────────────────────
function buildEnhancePrompt(mood, grade) {
  const moodDesc = {
    crime: 'Dark true crime. Heavy desaturation, red/crimson tint, deep black vignette, high contrast, gritty.',
    drama: 'Dramatic cinematic. Cool blue shadows, warm highlights, medium vignette, boosted saturation.',
    nollywood: 'Warm vibrant Nollywood. Rich golden skin tones, vivid oranges/reds, punchy contrast.',
    comedy: 'Ultra-vibrant MrBeast candy store. Maximum saturation, bright, punchy, energetic.',
    finance: 'Premium corporate. Cool blue-teal tint, desaturated, medium dark vignette, professional.',
    inspirational: 'Uplifting warm-to-cool gradient. Soft purple and gold tones, slightly dreamy.',
    educational: 'Clean authoritative blue. Cool blue midtones, professional, trustworthy.',
  };
  return `ENHANCE this image. Do NOT change composition, people, text, or layout.
Apply: ${moodDesc[mood] || moodDesc.drama}
Sharpness: increase significantly. Saturation: ${grade.saturation > 1.3 ? 'boost vibrancy' : grade.saturation < 0.9 ? 'desaturate' : 'slight boost'}.
Contrast: ${grade.contrast > 1.2 ? 'high' : 'medium boost'}. Vignette: ${grade.vignetteStrength > 0.7 ? 'heavy dark' : grade.vignetteStrength > 0.4 ? 'medium' : 'light/none'}.
Preserve ALL faces, text, layout exactly. Only adjust color, sharpness, contrast, mood.`;
}

// ── Poll helper ─────────────────────────────────────────────────────────
async function pollForResult(taskId, apiKey, maxAttempts = 24, interval = 5000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, interval));
    let pollData;
    try {
      const res = await fetch(
        `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );
      const text = await res.text();
      try { pollData = JSON.parse(text); } catch (_) {}
    } catch (e) {
      console.warn(`Poll ${attempt}: fetch error: ${e.message}`);
      continue;
    }
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
      const msg = pollData?.data?.failMsg || pollData?.data?.error || 'Generation failed';
      return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Timed out waiting for result' };
}

// ── Upload image to KIE ─────────────────────────────────────────────────
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

  // KIE stream upload
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

  // Fallback: base64 upload
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

// ════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════
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

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    console.log('=== generateNewThumbnailImage (nano-banana-2) ===');
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 90000; // 90s safety limit (leave headroom for Deno timeout)
    const timeLeft = () => MAX_RUNTIME_MS - (Date.now() - startTime);

    // 1. Load concept
    let concept;
    try { concept = await base44.entities.ThumbnailConcepts.get(concept_id); }
    catch (e) { return Response.json({ error: `Could not load concept: ${e.message}` }, { status: 404 }); }
    if (!concept?.image_prompt) return Response.json({ error: 'Concept has no image_prompt' }, { status: 400 });

    // 2. Resolve character photos (support both b64 and url)
    let charPhotos = [];
    if (Array.isArray(directCharPhotos) && directCharPhotos.some(p => p?.b64 || p?.url)) {
      charPhotos = directCharPhotos.filter(p => p?.b64 || p?.url);
      console.log('Direct char photos:', charPhotos.length, '(b64:', charPhotos.filter(p=>p.b64).length, 'url:', charPhotos.filter(p=>p.url).length, ')');
    } else if (concept.char_photos_json) {
      try {
        const stored = JSON.parse(concept.char_photos_json);
        charPhotos = stored.filter(p => p?.b64 && !p.truncated);
        console.log('Stored char photos:', charPhotos.length);
      } catch (_) {}
    }

    // 3. Resolve template reference
    let templateRef = null;
    if (directTemplateRef?.b64) {
      templateRef = directTemplateRef;
      console.log('Direct template:', templateRef.name);
    } else if (concept.template_ref_json) {
      try { templateRef = JSON.parse(concept.template_ref_json); } catch (_) {}
    }

    const hasCharPhotos = charPhotos.length > 0;
    const hasTemplateRef = !!templateRef?.b64;
    console.log(`📸 Photos: ${charPhotos.length} | Template: ${hasTemplateRef ? templateRef.name : 'NONE'}`);

    // ── STEP 4: Parse role mapping from concept ─────────────────
    // concept_description now contains JSON with photo_roles and story_elements
    let roleMapping = {};
    try { roleMapping = JSON.parse(concept.concept_description || '{}'); } catch (_) {}
    const photoRoles = roleMapping.photo_roles || [];
    const storyElements = roleMapping.story_elements || {};

    console.log(`Role mapping: ${photoRoles.length} photo roles, story_elements: ${Object.keys(storyElements).join(', ') || 'none'}`);
    for (const pr of photoRoles) {
      console.log(`  Photo ${pr.index}: ${pr.role} — ${(pr.description || '').substring(0, 60)}`);
    }

    // ── STEP 5: Upload images in STRUCTURED ORDER ───────────────
    // Order: TEMPLATE → CHARACTER(s) → ENVIRONMENT(s) → OBJECT(s)
    // This way the prompt can reference "Image 1 = template, Image 2 = character" etc.
    const imageUrls = [];
    const imageOrder = []; // tracks what each uploaded image IS

    // Helper to upload a photo (b64 or url)
    async function uploadPhoto(photo, label) {
      if (photo.b64) {
        return await uploadToKIE(photo.b64, photo.mime || 'image/jpeg', label, KIE_API_KEY);
      } else if (photo.url) {
        console.log(`📥 Fetching remote: ${photo.url.substring(0, 80)}...`);
        try {
          const resp = await fetch(photo.url);
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
            console.log(`✅ Fetched ${label}: ${(bytes.length / 1024).toFixed(0)}KB`);
            return await uploadToKIE(b64, 'image/jpeg', label, KIE_API_KEY);
          }
        } catch (e) {
          console.warn(`⚠️ Fetch error for ${label}: ${e.message}`);
        }
      }
      return null;
    }

    // 5a. Upload template FIRST
    if (hasTemplateRef) {
      const url = await uploadToKIE(templateRef.b64, templateRef.mime || 'image/jpeg', 'template', KIE_API_KEY);
      if (url) {
        imageUrls.push(url);
        imageOrder.push({ type: 'template', role: 'TEMPLATE', description: `Layout template: ${templateRef.name}` });
      }
    }

    // 5b. Upload photos grouped by role: CHARACTER first, then ENVIRONMENT, then OBJECT
    if (hasCharPhotos && photoRoles.length > 0) {
      // Sort by role priority: CHARACTER → ENVIRONMENT → OBJECT
      const rolePriority = { CHARACTER: 1, ENVIRONMENT: 2, OBJECT: 3 };
      const sortedRoles = [...photoRoles].sort((a, b) => (rolePriority[a.role] || 4) - (rolePriority[b.role] || 4));

      for (const pr of sortedRoles) {
        const photoIdx = pr.index - 1; // photo_roles uses 1-based index
        const photo = charPhotos[photoIdx];
        if (!photo) continue;

        const label = `${pr.role.toLowerCase()}_${pr.index}`;
        const url = await uploadPhoto(photo, label);
        if (url) {
          imageUrls.push(url);
          imageOrder.push({
            type: pr.role.toLowerCase(),
            role: pr.role,
            index: pr.index,
            description: pr.description || '',
          });
        }
      }
    } else if (hasCharPhotos) {
      // No role mapping — upload all as CHARACTER (legacy fallback)
      for (const [i, p] of charPhotos.entries()) {
        const url = await uploadPhoto(p, `char_${i + 1}`);
        if (url) {
          imageUrls.push(url);
          imageOrder.push({ type: 'character', role: 'CHARACTER', index: i + 1, description: '' });
        }
      }
    }

    console.log(`Uploaded ${imageUrls.length} images to KIE`);
    console.log('Image order:', imageOrder.map((o, i) => `Image ${i+1}=${o.type}`).join(', '));

    const templateUploaded = imageOrder.some(o => o.type === 'template');
    const photosUploaded = imageOrder.some(o => o.type !== 'template');
    const effectivePhotoCount = imageOrder.filter(o => o.type !== 'template').length;

    // ── STEP 6: Build the structured prompt ─────────────────────
    const overlayText = (custom_overlay_text || concept.text_overlay || '').toUpperCase().trim();
    const rawStyle = concept.text_style || '';
    const fontMatch = rawStyle.match(/bebas neue|impact|montserrat|roboto|arial/i);
    const font = fontMatch ? fontMatch[0] : 'Impact';
    const colorMatch = rawStyle.match(/white|yellow|gold|red|black|orange/i);
    const textColor = colorMatch ? colorMatch[0] : 'white';
    const textPosition = rawStyle.toLowerCase().includes('bottom') ? 'bottom-center' : 'upper-left';

    const charDescriptions = Array.isArray(directCharDescriptions) ? directCharDescriptions : [];

    const prompt = buildFaceSwapPrompt({
      overlayText,
      font,
      textColor,
      textPosition,
      hasTemplate: templateUploaded,
      hasPhotos: photosUploaded,
      photoCount: effectivePhotoCount,
      concept,
      charDescriptions,
      roleMapping,
      imageOrder,
    });

    console.log(`Prompt length: ${prompt.length} chars`);

    // ── STEP 6: Submit to nano-banana-2 ─────────────────────────
    const model = 'nano-banana-2';
    const kieHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    };

    const inputPayload = {
      prompt,
      image_input: imageUrls.length > 0 ? imageUrls : [],
      aspect_ratio: '16:9',
      resolution: '2K',
      output_format: 'png',
    };

    console.log(`Submitting to ${model} | images: ${imageUrls.length} | resolution: 2K`);

    const createRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: kieHeaders,
      body: JSON.stringify({ model, input: inputPayload }),
    });
    const createText = await createRes.text();
    console.log(`${model} → HTTP ${createRes.status}: ${createText.substring(0, 300)}`);

    let createData;
    try { createData = JSON.parse(createText); } catch (_) {}
    const taskId = createData?.data?.taskId;
    if (!taskId) {
      return Response.json({ error: `Task creation failed: ${createText.substring(0, 200)}` }, { status: 500 });
    }
    console.log(`✅ Task: ${taskId}`);

    // ── STEP 7: Poll for result (time-aware) ────────────────────
    // Use remaining time budget for polling. Leave 15s buffer for post-processing + save.
    const pollBudgetMs = Math.max(30000, timeLeft() - 15000);
    const pollInterval = 5000;
    const maxPollAttempts = Math.min(20, Math.floor(pollBudgetMs / pollInterval));
    console.log(`Polling: up to ${maxPollAttempts} attempts, ${Math.round(pollBudgetMs/1000)}s budget`);
    const result = await pollForResult(taskId, KIE_API_KEY, maxPollAttempts, pollInterval);
    
    // If still waiting, return task_id so frontend can continue polling
    if (!result.success && result.error === 'Timed out waiting for result') {
      console.log('⏱ Generation still in progress — returning task_id for frontend polling');
      return Response.json({
        success: false,
        pending: true,
        task_id: taskId,
        concept_id,
        model_used: model,
        message: 'Generation in progress. Poll with task_id.',
      });
    }
    
    if (!result.success) throw new Error(result.error);
    let imageUrl = result.url;
    if (!imageUrl) throw new Error('Generation succeeded but no image URL returned');
    console.log(`✅ Generated: ${imageUrl} (${Math.round((Date.now()-startTime)/1000)}s elapsed)`);

    // ── STEP 8: Post-processing — Upscale ───────────────────────
    // Mood can be pipe-separated (e.g. "crime|drama") — take the first segment
    const rawMood = (concept.mood || concept.visual_metaphor || 'drama').toLowerCase();
    const mood = rawMood.split('|')[0].trim() || 'drama';
    console.log(`🎨 Mood resolved: "${rawMood}" → "${mood}"`);

    let finalUrl = imageUrl;

    // Skip post-processing if time is tight — return the raw image
    if (timeLeft() < 20000) {
      console.log(`⏱ Skipping post-processing — only ${Math.round(timeLeft()/1000)}s left`);
    } else {
      const MOOD_GRADES = {
        crime:        { saturation: 0.7,  contrast: 1.35, brightness: 0.75, vignetteStrength: 0.92 },
        drama:        { saturation: 1.4,  contrast: 1.2,  brightness: 0.95, vignetteStrength: 0.75 },
        nollywood:    { saturation: 1.6,  contrast: 1.2,  brightness: 1.0,  vignetteStrength: 0.6  },
        comedy:       { saturation: 2.0,  contrast: 1.1,  brightness: 1.1,  vignetteStrength: 0.2  },
        finance:      { saturation: 1.15, contrast: 1.15, brightness: 0.9,  vignetteStrength: 0.65 },
        inspirational:{ saturation: 1.3,  contrast: 1.05, brightness: 1.05, vignetteStrength: 0.3  },
        educational:  { saturation: 1.15, contrast: 1.15, brightness: 0.95, vignetteStrength: 0.55 },
      };
      const grade = MOOD_GRADES[mood] || MOOD_GRADES.drama;

      // 8a. Upscale
      if (timeLeft() > 40000) {
        try {
          console.log(`🔍 Upscaling... (${Math.round(timeLeft()/1000)}s remaining)`);
          const upRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
            method: 'POST', headers: kieHeaders,
            body: JSON.stringify({ model: 'kie-ai/upscaler', input: { image_url: imageUrl, scale: 2 } }),
          });
          const upText = await upRes.text();
          let upData; try { upData = JSON.parse(upText); } catch (_) {}
          const upTaskId = upData?.data?.taskId;
          if (upTaskId) {
            const maxUp = Math.min(8, Math.floor(timeLeft() / 5000));
            const upResult = await pollForResult(upTaskId, KIE_API_KEY, maxUp, 4000);
            if (upResult.success && upResult.url) { finalUrl = upResult.url; console.log('✅ Upscaled'); }
          }
        } catch (e) { console.warn('Upscale error (non-fatal):', e.message); }
      }

      // 8b. Color grade
      if (timeLeft() > 35000) {
        try {
          console.log(`🎨 Color grading... (${Math.round(timeLeft()/1000)}s remaining)`);
          const enhancePrompt = buildEnhancePrompt(mood, grade);
          const enRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
            method: 'POST', headers: kieHeaders,
            body: JSON.stringify({ model: 'kie-ai/image-enhance', input: { image_url: finalUrl, prompt: enhancePrompt, creativity: 0.15 } }),
          });
          const enText = await enRes.text();
          let enData; try { enData = JSON.parse(enText); } catch (_) {}
          const enTaskId = enData?.data?.taskId;
          if (enTaskId) {
            const maxEn = Math.min(6, Math.floor(timeLeft() / 5000));
            const enResult = await pollForResult(enTaskId, KIE_API_KEY, maxEn, 4000);
            if (enResult.success && enResult.url) { finalUrl = enResult.url; console.log('✅ Enhanced'); }
          }
        } catch (e) { console.warn('Enhance error (non-fatal):', e.message); }
      }
    }

    // ── STEP 9: Re-upload to Cloudflare R2 (CORS-safe) ────────
    let persistentUrl = finalUrl;
    if (timeLeft() > 8000) {
      try {
        console.log('📦 Re-uploading to Cloudflare R2 for CORS-safe access...');
        const imgResp = await fetch(finalUrl);
        if (imgResp.ok) {
          const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
          const contentType = imgResp.headers.get('content-type') || 'image/png';
          const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
          const fileName = `thumbnails/${concept_id}-${Date.now()}.${ext}`;
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
          persistentUrl = `${publicBase}/${fileName}`;
          console.log('✅ Re-uploaded to R2:', persistentUrl);
        }
      } catch (e) {
        console.warn('Re-upload to R2 failed (non-fatal, using KIE URL):', e.message);
      }
    } else {
      console.log('⏱ Skipping re-upload — not enough time left');
    }

    // ── STEP 10: Save ─────────────────────────────────────────────
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
      model_used: model,
      post_processing: { upscaled: finalUrl !== imageUrl, mood_graded: mood, original_url: imageUrl },
    });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});