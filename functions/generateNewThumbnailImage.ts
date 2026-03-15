import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// generateNewThumbnailImage
//
// Uses ideogram/character-remix — the correct model for template cloning
//
// EXACT FLOW:
//   1. Upload template image → get public URL (this becomes image_url — the BASE)
//   2. Upload character photos → get public URLs (these become reference_image_urls — the FACES)
//   3. Submit to ideogram/character-remix:
//      - image_url = template (layout master — kept intact)
//      - reference_image_urls = character photos (faces swapped in)
//      - prompt = describes the text overlay swap only
//      - strength = 0.75 (preserve layout, swap faces + text)
//   4. Poll for result
//   5. Save image_url to concept record

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

    console.log('=== generateNewThumbnailImage (character-remix) ===');
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

    // 2. Resolve character photos — prefer direct pass from frontend
    let charPhotos = [];
    if (Array.isArray(directCharPhotos) && directCharPhotos.some(p => p?.b64)) {
      charPhotos = directCharPhotos.filter(p => p?.b64);
      console.log('Using DIRECT char photos:', charPhotos.length);
    } else if (concept.char_photos_json) {
      try {
        const stored = JSON.parse(concept.char_photos_json);
        charPhotos = stored.filter(p => p?.b64 && !p.truncated);
        console.log('Using STORED char photos:', charPhotos.length);
      } catch (e) {
        console.warn('Could not parse char_photos_json:', e.message);
      }
    }

    // 3. Resolve template reference — prefer direct pass from frontend
    let templateRef = null;
    if (directTemplateRef?.b64) {
      templateRef = directTemplateRef;
      console.log('Using DIRECT template ref:', templateRef.name);
    } else if (concept.template_ref_json) {
      try {
        templateRef = JSON.parse(concept.template_ref_json);
        console.log('Using STORED template ref:', templateRef.name);
      } catch (e) {
        console.warn('Could not parse template_ref_json:', e.message);
      }
    }

    const hasCharPhotos = charPhotos.length > 0;
    const hasTemplateRef = !!templateRef?.b64;

    console.log(`📸 Char photos: ${hasCharPhotos ? charPhotos.length : 'NONE'} | Template: ${hasTemplateRef ? templateRef.name : 'NONE'}`);

    // ── STEP 4: Upload all images to KIE File API to get public URLs ──
    // ideogram/character-remix requires public URLs, not base64
    const kieHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    };

    const uploadToKie = async (b64, mime, label) => {
      const dataUrl = b64.startsWith('data:')
        ? b64
        : `data:${mime || 'image/jpeg'};base64,${b64}`;
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
          console.log(`✅ Uploaded ${label} → ${url}`);
          return url;
        }
        console.warn(`❌ Upload failed for ${label}: HTTP ${res.status} — ${text.substring(0, 200)}`);
        return null;
      } catch (e) {
        console.warn(`❌ Upload error for ${label}: ${e.message}`);
        return null;
      }
    };

    // Upload template → this becomes image_url (the BASE the model remixes FROM)
    let templateUrl = null;
    if (hasTemplateRef) {
      templateUrl = await uploadToKie(
        templateRef.b64,
        templateRef.mime || 'image/jpeg',
        'template'
      );
    }

    // Upload character photos → these become reference_image_urls (the FACES to inject)
    const referenceImageUrls = [];
    for (const [i, p] of charPhotos.filter(p => p?.b64).entries()) {
      const url = await uploadToKie(p.b64, p.mime || 'image/jpeg', `char_${i + 1}`);
      if (url) referenceImageUrls.push(url);
    }

    console.log(`Template URL: ${templateUrl ? '✅' : '❌ NONE'}`);
    console.log(`Reference URLs: ${referenceImageUrls.length}`);

    // ── STEP 5: Build the prompt ──
    // For character-remix the prompt describes WHAT TO CHANGE.
    // We only describe the text overlay swap — everything else stays from the template.
    const overlayText = (concept.text_overlay || '').toUpperCase().trim();
    const rawStyle = concept.text_style || '';
    const fontMatch = rawStyle.match(/bebas neue|impact|montserrat|roboto|arial/i);
    const font = fontMatch ? fontMatch[0] : 'Impact';
    const colorMatch = rawStyle.match(/white|yellow|gold|red|black|orange/i);
    const textColor = colorMatch ? colorMatch[0] : 'white';
    const positionMatch = rawStyle.toLowerCase().includes('bottom') ? 'bottom-center' : 'upper-left';

    let prompt;

    if (hasTemplateRef && hasCharPhotos) {
      // TEMPLATE + FACES: swap both people and text
      prompt = `Keep the EXACT same layout, background, colors, lighting, composition and all graphic elements from the base image. 
CHANGE 1 — Replace the people in the image with the person(s) from the reference photo(s). Use their exact face, skin tone, hair color and style. Keep the same pose, position and framing as the original people in the template.
CHANGE 2 — Replace the existing text in the image with: "${overlayText}". Font: ${font}, ultra-bold, condensed. Color: ${textColor} with thick black outline and drop shadow. Position: ${positionMatch}. Text must be sharp, crisp and perfectly readable.
Do NOT change anything else — same background, same colors, same lighting, same composition, same decorative elements.`;

    } else if (hasTemplateRef && !hasCharPhotos) {
      // TEMPLATE ONLY: just swap the text
      prompt = `Keep the EXACT same layout, background, colors, lighting, composition and all graphic elements from the base image.
CHANGE — Replace the existing text in the image with: "${overlayText}". Font: ${font}, ultra-bold, condensed. Color: ${textColor} with thick black outline and drop shadow. Position: ${positionMatch}. Text must be sharp, crisp and perfectly readable.
Do NOT change anything else — same people, same background, same colors, same lighting.`;

    } else if (!hasTemplateRef && hasCharPhotos) {
      // NO TEMPLATE: generate from image_prompt with face reference
      prompt = `${concept.image_prompt}
The person(s) in the reference photo(s) MUST appear in this image — same face, skin tone, hair color and style exactly. Do not generate different people.`;

    } else {
      // NO TEMPLATE, NO FACES: use image_prompt as-is
      prompt = concept.image_prompt;
    }

    // ── STEP 6: Submit to ideogram/character-remix or ideogram/character ──
    // If we have a template: use character-remix (image_url = template, references = faces)
    // If no template: use character (references = faces only, generate from prompt)
    const model = hasTemplateRef ? 'ideogram/character-remix' : 'ideogram/character';
    console.log(`Submitting to ${model}...`);

    const inputPayload = hasTemplateRef
      ? {
          // character-remix: template is the base, faces are references
          prompt,
          image_url: templateUrl,               // BASE — the template to remix
          reference_image_urls: referenceImageUrls, // FACES — injected into the remix
          rendering_speed: 'BALANCED',
          style: 'REALISTIC',
          expand_prompt: false,
          num_images: '1',
          image_size: 'landscape_16_9',
          strength: 0.8,                       // 0.75 = strong template adherence, face swap
          negative_prompt: 'cartoon, anime, illustration, blurry, low quality, distorted face, wrong person, different person, watermark, logo',
          image_urls: [],
          reference_mask_urls: '',
        }
      : {
          // character: no template, generate from prompt with face reference
          prompt,
          reference_image_urls: referenceImageUrls,
          rendering_speed: 'BALANCED',
          style: 'REALISTIC',
          expand_prompt: false,
          num_images: '1',
          image_size: 'landscape_16_9',
          negative_prompt: 'cartoon, anime, illustration, blurry, low quality, distorted face, wrong person, different person, watermark, logo',
        };

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
      return Response.json({
        error: `Task creation failed (${model}): ${createText.substring(0, 200)}`,
      }, { status: 500 });
    }

    console.log(`✅ Task created: ${taskId} | model: ${model}`);

    // 7. Poll for result
    // states: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
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
        if (!imageUrl) {
          imageUrl = pollData?.data?.imageUrl
            || pollData?.data?.image_url
            || pollData?.data?.url;
        }
        if (imageUrl) {
          console.log('✅ Got image URL:', imageUrl);
          break;
        }
        console.warn('state=success but no URL found:', JSON.stringify(pollData?.data).substring(0, 300));
        break;
      }

      if (state === 'fail') {
        const msg = pollData?.data?.failMsg || pollData?.data?.error || 'Generation failed';
        throw new Error(`${model} failed: ${msg}`);
      }
      // waiting / queuing / generating — keep polling
    }

    if (!imageUrl) {
      throw new Error('Timed out waiting for image. The task may still be processing — try again.');
    }

    // 8. Save image_url to concept record
    try {
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: imageUrl,
        status: 'complete',
        is_selected: true,
      });
      console.log('✅ Saved image_url to concept record');
    } catch (e) {
      console.warn('Could not save image_url:', e.message);
    }

    console.log('=== Done ===');
    return Response.json({
      success: true,
      image_url: imageUrl,
      concept_id,
      model_used: model,
    });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});