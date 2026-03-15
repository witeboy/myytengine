import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// generateNewThumbnailImage
//
// Uses Kie.ai Ideogram/Character for face-accurate image generation
// FLOW:
//   1. Upload base64 photos to KIE File Upload API → get public URLs
//   2. Submit to ideogram/character with reference_image_urls
//   3. Poll GET /api/v1/jobs/recordInfo?taskId=XXX for result
//
// Ideogram/Character preserves the REAL faces from your reference photos
// unlike Nano Banana which generates illustrated characters

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
    const { concept_id, char_photos: directCharPhotos, template_ref: directTemplateRef } = body;
    if (!concept_id) return Response.json({ error: 'concept_id is required' }, { status: 400 });

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    console.log('=== generateNewThumbnailImage (Ideogram Character) ===');
    console.log('concept_id:', concept_id);

    // 1. Load concept record
    let concept;
    try {
      concept = await base44.entities.ThumbnailConcepts.get(concept_id);
    } catch (e) {
      return Response.json({ error: `Could not load concept: ${e.message}` }, { status: 404 });
    }

    if (!concept?.image_prompt) {
      return Response.json({ error: 'Concept has no image_prompt' }, { status: 400 });
    }

    // 2. Character photos — prefer DIRECT pass-through (bypasses DB size limits)
    //    Fall back to stored char_photos_json if direct not provided
    let charPhotos = [];
    if (Array.isArray(directCharPhotos) && directCharPhotos.some(p => p?.b64)) {
      charPhotos = directCharPhotos.filter(p => p?.b64);
      console.log('Using DIRECT char photos from frontend:', charPhotos.length);
    } else if (concept.char_photos_json) {
      try {
        const stored = JSON.parse(concept.char_photos_json);
        charPhotos = stored.filter(p => p?.b64 && !p.truncated);
        console.log('Using STORED char photos from DB:', charPhotos.length);
      } catch (e) {
        console.warn('Could not parse char_photos_json:', e.message);
      }
    }

    // 2b. Template reference — prefer DIRECT pass-through
    let templateRef = null;
    if (directTemplateRef?.b64) {
      templateRef = directTemplateRef;
      console.log('Using DIRECT template ref from frontend:', templateRef.name);
    } else if (concept.template_ref_json) {
      try {
        templateRef = JSON.parse(concept.template_ref_json);
        console.log('Using STORED template ref from DB:', templateRef.name);
      } catch (e) {
        console.warn('Could not parse template_ref_json:', e.message);
      }
    }

    const hasCharPhotos = charPhotos.length > 0;
    const hasTemplateRef = !!templateRef?.b64;

    console.log(`📸 Photos: ${hasCharPhotos ? charPhotos.length + ' available' : 'NONE'} | Template: ${hasTemplateRef ? templateRef.name : 'NONE'}`);

    // 3. Build prompt — TWO MODES: template clone vs freeform

    let fullPrompt;

    if (hasTemplateRef) {
      // ═══ TEMPLATE CLONE MODE ═══
      const overlayText = (concept.text_overlay || '').toUpperCase().trim();
      const rawStyle = concept.text_style || '';
      const fontMatch = rawStyle.match(/bebas neue|impact|montserrat|roboto|arial/i);
      const font = fontMatch ? fontMatch[0] : 'Impact';
      const colorMatch = rawStyle.match(/white|yellow|gold|red|black|orange/i);
      const textColor = colorMatch ? colorMatch[0] : 'white';

      fullPrompt = `TASK: RECREATE THE REFERENCE TEMPLATE IMAGE EXACTLY.

You are given a reference thumbnail template image. Your job is to produce a NEW image that is a near-identical clone of that template with TWO changes:

CHANGE 1 — SWAP THE PEOPLE:
${hasCharPhotos
  ? `Replace the people in the template with the character photo(s) provided. Use their EXACT face, skin tone, hair color, hair style, and body type. Do NOT generate different people. The character photos show the REAL humans who must appear. Match the pose, position, scale, and framing of the original people in the template — but with these new faces.`
  : `Keep similar character poses and positions as the template, but generate characters matching this description: ${concept.concept_description || 'dramatic, expressive characters matching the video tone.'}`
}

CHANGE 2 — SWAP THE TEXT:
${overlayText
  ? `Replace ANY text visible in the template with EXACTLY this text: "${overlayText}"
- Render it in the SAME position, SAME size, SAME style as the text in the template
- Font: ${font}, ultra-bold, condensed
- Color: ${textColor} fill with thick black outline/stroke and drop shadow
- The text must be SHARP, CRISP, and PERFECTLY READABLE — this is the #1 priority
- Spell every letter correctly: ${overlayText.split('').join(' ')}
- Do NOT add any other text, watermarks, or captions — ONLY the text above`
  : `Remove any text from the template. Leave those areas clean.`
}

EVERYTHING ELSE — CLONE EXACTLY:
- Same background colors, gradients, and effects
- Same lighting style — rim lights, color temperature, direction, intensity
- Same composition — character position in frame, camera angle, crop
- Same color grading — teal/orange, warm/cool, saturation levels
- Same decorative elements — arrows, dividers, badges, glow effects, vignette
- Same aspect ratio (16:9, 1920x1080)
- Same overall mood and energy

The reference template is the MASTER. Your output should be visually indistinguishable from it except for the swapped faces and text.

QUALITY: Photorealistic, 1920x1080, professional YouTube thumbnail quality. Sharp focus, cinematic lighting, studio production value.`;

    } else {
      // ═══ FREEFORM MODE ═══
      const promptAdditions = [];

      if (hasCharPhotos) {
        promptAdditions.push(`CRITICAL — CHARACTER FACE-LOCK:
The character reference photo(s) show the EXACT people who MUST appear in this thumbnail.
Use their REAL face, skin tone, hair color, hair style, facial bone structure, and body type.
DO NOT generate different people. Copy their face as-is into the scene.`);
      }

      if (concept.text_overlay) {
        const overlayText = concept.text_overlay.toUpperCase().trim();
        const rawStyle = concept.text_style || '';
        const fontMatch = rawStyle.match(/bebas neue|impact|montserrat|roboto|arial/i);
        const font = fontMatch ? fontMatch[0] : 'Impact';
        const colorMatch = rawStyle.match(/white|yellow|gold|red|black|orange/i);
        const textColor = colorMatch ? colorMatch[0] : 'white';
        const position = rawStyle.toLowerCase().includes('upper-left') ? 'upper-left corner'
          : rawStyle.toLowerCase().includes('bottom-center') ? 'bottom-center'
          : 'upper-left corner';

        promptAdditions.push(`
TEXT OVERLAY — RENDER THIS TEXT IN THE IMAGE:
- Text: "${overlayText}"
- Spell each letter exactly: ${overlayText.split('').join(' ')}
- Font: ${font}, ultra-bold, condensed, high x-height
- Color: ${textColor} fill + 6px solid black stroke/outline + heavy drop shadow
- Size: Extremely large — 15-20% of frame height, readable at 168x94px mobile size
- Position: ${position}
- SHARP, CRISP, PERFECTLY READABLE — this is the #1 priority
- Do NOT add any other text or captions`);
      }

      fullPrompt = concept.image_prompt || '';
      if (promptAdditions.length) {
        fullPrompt += `\n\n${promptAdditions.join('\n')}`;
      }
    }

    // ── STEP 4: Upload photos to KIE File Upload API to get public URLs ──
    // ideogram/character requires reference_image_urls (public URLs, not base64)
    // KIE File Upload API: POST https://kieai.redpandaai.co/api/file-base64-upload
    const kieHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    };

    const uploadToKie = async (b64, mime, label) => {
      // KIE accepts full data URL format: data:image/jpeg;base64,....
      const dataUrl = b64.startsWith('data:') ? b64 : `data:${mime || 'image/jpeg'};base64,${b64}`;
      try {
        const res = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
          method: 'POST',
          headers: kieHeaders,
          body: JSON.stringify({
            base64Data: dataUrl,
            uploadPath: 'images/thumbnails',
          }),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (_) {}
        const url = data?.data?.downloadUrl || data?.data?.fileUrl;
        if (url) {
          console.log(`Uploaded ${label} → ${url}`);
          return url;
        }
        console.warn(`Upload failed for ${label}: HTTP ${res.status} — ${text.substring(0, 200)}`);
        return null;
      } catch (e) {
        console.warn(`Upload error for ${label}: ${e.message}`);
        return null;
      }
    };

    // Build reference_image_urls — template FIRST (layout master), then character faces
    const referenceImageUrls = [];

    if (hasTemplateRef) {
      const url = await uploadToKie(templateRef.b64, templateRef.mime || 'image/jpeg', 'template_ref');
      if (url) {
        referenceImageUrls.push(url);
        console.log('Added template reference URL (layout master)');
      }
    }

    for (const [i, p] of charPhotos.filter(p => p?.b64).entries()) {
      const url = await uploadToKie(p.b64, p.mime || 'image/jpeg', `char_photo_${i + 1}`);
      if (url) {
        referenceImageUrls.push(url);
        console.log(`Added character photo ${i + 1} URL (face reference)`);
      }
    }

    console.log('reference_image_urls count:', referenceImageUrls.length);

    // ── STEP 5: Submit to ideogram/character ──
    // Docs: model="ideogram/character", input.reference_image_urls=[...public urls]
    // image_size options: square_hd, landscape_16_9, portrait_9_16, etc.
    console.log('Submitting to ideogram/character...');
    const createRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: kieHeaders,
      body: JSON.stringify({
        model: 'ideogram/character',
        input: {
          prompt: fullPrompt,
          reference_image_urls: referenceImageUrls,
          rendering_speed: 'BALANCED',
          style: 'REALISTIC',
          expand_prompt: false,
          num_images: '1',
          image_size: 'landscape_16_9',
          negative_prompt: 'cartoon, anime, illustration, drawing, painting, 3d render, cgi, fake face, wrong face, different person',
        },
      }),
    });

    const createText = await createRes.text();
    console.log(`ideogram/character → HTTP ${createRes.status}: ${createText.substring(0, 300)}`);

    let createData;
    try { createData = JSON.parse(createText); } catch (_) {}

    const taskId = createData?.data?.taskId;
    if (!taskId) {
      return Response.json({
        error: `ideogram/character task creation failed: ${createText.substring(0, 200)}`,
      }, { status: 500 });
    }

    console.log(`Task created! taskId: ${taskId} | model: ideogram/character`);

    // 6. Poll for result
    // GET /api/v1/jobs/recordInfo?taskId=XXX
    // states per docs: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
    const maxAttempts = 40;
    const pollInterval = 5000;
    let imageUrl = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, pollInterval));

      let pollData;
      try {
        const pollRes = await fetch(
          `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
          { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } }
        );
        const pollText = await pollRes.text();
        try { pollData = JSON.parse(pollText); } catch (_) {}
      } catch (e) {
        console.warn(`Poll ${attempt}: fetch error: ${e.message}`);
        continue;
      }

      const state = pollData?.data?.state || pollData?.state || '';
      console.log(`Poll ${attempt}/${maxAttempts}: state="${state}"`);

      if (state === 'success') {
        // Parse resultJson — it's a JSON string containing resultUrls array
        const resultJson = pollData?.data?.resultJson;
        if (resultJson) {
          try {
            const parsed = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
            imageUrl = parsed?.resultUrls?.[0]
              || parsed?.urls?.[0]
              || parsed?.images?.[0]
              || parsed?.url;
          } catch (_) {
            if (typeof resultJson === 'string' && resultJson.startsWith('http')) {
              imageUrl = resultJson;
            }
          }
        }
        // Also check direct fields
        if (!imageUrl) {
          imageUrl = pollData?.data?.imageUrl
            || pollData?.data?.image_url
            || pollData?.data?.url;
        }

        if (imageUrl) {
          console.log('Got image URL:', imageUrl);
          break;
        }
        console.warn('state=success but no URL found. data:', JSON.stringify(pollData?.data).substring(0, 300));
        break;
      }

      if (state === 'fail') {
        const msg = pollData?.data?.failMsg || pollData?.data?.error || 'Generation failed';
        throw new Error(`ideogram/character generation failed: ${msg}`);
      }
      // waiting / queuing / generating — keep polling
    }

    if (!imageUrl) {
      throw new Error('Timed out waiting for image from ideogram/character. The task may still be processing — try again.');
    }

    // 7. Save image_url to concept record
    try {
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: imageUrl,
        status: 'complete',
        is_selected: true,
      });
      console.log('Saved image_url to concept record');
    } catch (e) {
      console.warn('Could not save image_url:', e.message);
    }

    console.log('=== Done ===');
    return Response.json({
      success: true,
      image_url: imageUrl,
      concept_id,
      model_used: 'ideogram/character',
    });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});