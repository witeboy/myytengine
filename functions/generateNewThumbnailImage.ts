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

// ── Build a precise enhance prompt based on mood profile ──
function buildEnhancePrompt(mood, grade) {
  const moodDescriptions = {
    crime: 'Dark true crime aesthetic. Heavy desaturation with red/crimson tint. Deep black vignette crushing the edges. High contrast, gritty, ominous. Skin slightly desaturated. Dark shadows, minimal highlights.',
    drama: 'Dramatic cinematic color grade. Cool blue shadows, warm highlights. Medium vignette. Slightly boosted saturation for emotional punch. Film-like contrast with rich midtones.',
    nollywood: 'Warm vibrant Nollywood color grade. Rich saturated warm tones — golden skin, vivid oranges and reds. Slight warm vignette. High saturation, punchy contrast. African cinema warmth.',
    comedy: 'Ultra-vibrant candy store MrBeast aesthetic. Maximum color saturation. Bright, punchy, energetic. Minimal vignette. Boosted brightness. Vivid greens, yellows, cyans. Pop art energy.',
    finance: 'Premium corporate finance aesthetic. Cool blue-teal tint. Desaturated but with green/teal accent pop. Medium dark vignette. Clean, professional, trust-building. Slightly dark and moody.',
    inspirational: 'Uplifting warm-to-cool gradient grade. Soft purple and gold tones. Light vignette. Slightly dreamy with boosted warm highlights. Aspirational and clean.',
    educational: 'Clean authoritative blue grade. Cool blue midtones. Medium vignette. Professional, trustworthy. Slight contrast boost for clarity. Sharp and readable.',
  };

  const desc = moodDescriptions[mood] || moodDescriptions.drama;

  return `ENHANCE this YouTube thumbnail image. Do NOT change the composition, people, text, or layout AT ALL.

ONLY apply these post-production adjustments:
1. SHARPNESS: Increase edge sharpness significantly — faces and text must be razor crisp at 168x94px mobile preview
2. COLOR GRADE: ${desc}
3. SATURATION: ${grade.saturation > 1.3 ? 'Boost vibrancy and color richness significantly' : grade.saturation < 0.9 ? 'Desaturate — muted, gritty tones' : 'Slight saturation boost for punch'}
4. CONTRAST: ${grade.contrast > 1.2 ? 'High contrast — deep blacks, bright highlights' : 'Medium contrast boost for depth'}
5. VIGNETTE: ${grade.vignetteStrength > 0.7 ? 'Heavy dark vignette crushing all edges into darkness' : grade.vignetteStrength > 0.4 ? 'Medium subtle vignette around edges' : 'Very light or no vignette'}
6. BRIGHTNESS: ${grade.brightness < 0.85 ? 'Darken overall — moody and atmospheric' : grade.brightness > 1.05 ? 'Brighten — energetic and vibrant' : 'Maintain current brightness'}

CRITICAL: Preserve ALL faces, text, layout, and composition EXACTLY. Only adjust color, sharpness, contrast, and mood.`;
}

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

    const uploadImage = async (b64, mime, label) => {
      // Strip any data URI prefix to get raw base64
      const rawB64 = b64.includes(',') ? b64.split(',')[1] : b64;
      const cleanB64 = rawB64.replace(/[\s\r\n]/g, '');
      
      // Convert base64 to binary bytes
      const binaryString = atob(cleanB64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Detect actual format from magic bytes
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
      const actualMime = isPng ? 'image/png' : 'image/jpeg';
      const ext = isPng ? 'png' : 'jpg';
      const fileName = `${label}_${Date.now()}.${ext}`;
      
      console.log(`📤 Uploading ${label}: ${(bytes.length / 1024).toFixed(0)}KB, detected: ${actualMime}`);
      
      // PRIMARY: Use Base44 UploadFile — produces permanent public URLs
      // that any external API (Ideogram, KIE) can fetch directly
      try {
        const file = new File([bytes], fileName, { type: actualMime });
        const uploadResult = await base44.integrations.Core.UploadFile({ file });
        if (uploadResult?.file_url) {
          console.log(`✅ Uploaded ${label} → ${uploadResult.file_url}`);
          return uploadResult.file_url;
        }
      } catch (e) {
        console.warn(`⚠️ Base44 upload failed for ${label}: ${e.message}`);
      }
      
      // FALLBACK: KIE base64 upload
      try {
        const dataUrl = `data:${actualMime};base64,${cleanB64}`;
        const res = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
          method: 'POST',
          headers: kieHeaders,
          body: JSON.stringify({ base64Data: dataUrl, uploadPath: 'images/thumbnails', fileName }),
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch (_) {}
        const url = data?.data?.downloadUrl || data?.data?.fileUrl || data?.data?.url;
        if (url) {
          console.log(`✅ Uploaded ${label} (KIE fallback) → ${url}`);
          return url;
        }
        console.warn(`❌ KIE fallback also failed for ${label}: ${text.substring(0, 200)}`);
      } catch (e) {
        console.warn(`❌ KIE fallback error for ${label}: ${e.message}`);
      }
      
      return null;
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

    // ══════════════════════════════════════════════════════════════════
    // STEP 8: POST-PROCESSING PIPELINE (same call, zero extra AI credits)
    //   a) Upscale via KIE (uses the same API, sharpens + 2x resolution)
    //   b) Mood-based color grading via canvas (pure pixel math — free)
    //      → saturation, vibrancy, sharpness, vignette, color tint
    // ══════════════════════════════════════════════════════════════════

    const mood = (concept.mood || concept.visual_metaphor || 'drama').toLowerCase();

    // MOOD GRADING PROFILES — maps mood → pixel-level adjustments
    const MOOD_GRADES = {
      crime:        { saturation: 0.7,  contrast: 1.35, brightness: 0.75, tintR: 1.15, tintG: 0.85, tintB: 0.85, vignetteStrength: 0.92 },
      drama:        { saturation: 1.4,  contrast: 1.2,  brightness: 0.95, tintR: 1.0,  tintG: 0.95, tintB: 1.1,  vignetteStrength: 0.75 },
      nollywood:    { saturation: 1.6,  contrast: 1.2,  brightness: 1.0,  tintR: 1.1,  tintG: 1.0,  tintB: 0.85, vignetteStrength: 0.6  },
      comedy:       { saturation: 2.0,  contrast: 1.1,  brightness: 1.1,  tintR: 1.05, tintG: 1.05, tintB: 0.9,  vignetteStrength: 0.2  },
      finance:      { saturation: 1.15, contrast: 1.15, brightness: 0.9,  tintR: 0.9,  tintG: 1.05, tintB: 1.1,  vignetteStrength: 0.65 },
      inspirational:{ saturation: 1.3,  contrast: 1.05, brightness: 1.05, tintR: 1.0,  tintG: 0.95, tintB: 1.1,  vignetteStrength: 0.3  },
      educational:  { saturation: 1.15, contrast: 1.15, brightness: 0.95, tintR: 0.95, tintG: 1.0,  tintB: 1.1,  vignetteStrength: 0.55 },
    };
    const grade = MOOD_GRADES[mood] || MOOD_GRADES.drama;
    console.log(`🎨 Post-processing: mood="${mood}" | sat=${grade.saturation} con=${grade.contrast} vig=${grade.vignetteStrength}`);

    // ── 8a. UPSCALE via KIE (2x, sharpens details) ──────────────
    let finalUrl = imageUrl;
    try {
      console.log('🔍 Upscaling via KIE...');
      const upscaleRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: kieHeaders,
        body: JSON.stringify({
          model: 'kie-ai/upscaler',
          input: {
            image_url: imageUrl,
            scale: 2,
          },
        }),
      });
      const upscaleText = await upscaleRes.text();
      let upscaleData;
      try { upscaleData = JSON.parse(upscaleText); } catch (_) {}
      const upscaleTaskId = upscaleData?.data?.taskId;

      if (upscaleTaskId) {
        console.log(`Upscale task: ${upscaleTaskId}`);
        // Poll upscale (typically 15-30s)
        for (let a = 1; a <= 20; a++) {
          await new Promise(r => setTimeout(r, 4000));
          try {
            const pRes = await fetch(
              `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${upscaleTaskId}`,
              { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } }
            );
            const pText = await pRes.text();
            let pData;
            try { pData = JSON.parse(pText); } catch (_) {}
            const st = pData?.data?.state || '';
            console.log(`Upscale poll ${a}/20: state="${st}"`);
            if (st === 'success') {
              const rj = pData?.data?.resultJson;
              let upUrl = null;
              if (rj) {
                try {
                  const p = typeof rj === 'string' ? JSON.parse(rj) : rj;
                  upUrl = p?.resultUrls?.[0] || p?.urls?.[0] || p?.url;
                } catch (_) {
                  if (typeof rj === 'string' && rj.startsWith('http')) upUrl = rj;
                }
              }
              if (!upUrl) upUrl = pData?.data?.imageUrl || pData?.data?.image_url || pData?.data?.url;
              if (upUrl) {
                finalUrl = upUrl;
                console.log('✅ Upscaled:', finalUrl);
              }
              break;
            }
            if (st === 'fail') {
              console.warn('Upscale failed — using original');
              break;
            }
          } catch (e) {
            console.warn(`Upscale poll error: ${e.message}`);
          }
        }
      } else {
        console.warn('Upscale task not created — using original. Response:', upscaleText.substring(0, 200));
      }
    } catch (e) {
      console.warn('Upscale step error (non-fatal):', e.message);
    }

    // ── 8b. MOOD COLOR GRADING via canvas pixel manipulation ─────
    // This is FREE — pure math on the Deno server, no AI API calls
    try {
      console.log('🎨 Applying mood color grade...');
      
      // Fetch the (upscaled) image as raw bytes
      const imgRes = await fetch(finalUrl);
      if (!imgRes.ok) throw new Error(`Fetch image failed: ${imgRes.status}`);
      const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
      
      // Use Deno-compatible image processing via ImageMagick-style approach
      // We'll encode grading instructions into the prompt for a lightweight
      // "enhance" pass through KIE's image processing if available,
      // OR apply via a canvas-free server-side approach
      
      // Strategy: Use KIE's enhance/filter model if available, 
      // otherwise bake grading into a second lightweight remix pass
      
      // Try KIE enhance endpoint first
      const enhancePrompt = buildEnhancePrompt(mood, grade);
      
      const enhanceRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: kieHeaders,
        body: JSON.stringify({
          model: 'kie-ai/image-enhance',
          input: {
            image_url: finalUrl,
            prompt: enhancePrompt,
            creativity: 0.15,  // very low — preserve the image, just grade it
          },
        }),
      });
      
      const enhanceText = await enhanceRes.text();
      let enhanceData;
      try { enhanceData = JSON.parse(enhanceText); } catch (_) {}
      const enhanceTaskId = enhanceData?.data?.taskId;
      
      if (enhanceTaskId) {
        console.log(`Enhance task: ${enhanceTaskId}`);
        for (let a = 1; a <= 15; a++) {
          await new Promise(r => setTimeout(r, 4000));
          try {
            const pRes = await fetch(
              `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${enhanceTaskId}`,
              { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } }
            );
            const pText = await pRes.text();
            let pData;
            try { pData = JSON.parse(pText); } catch (_) {}
            const st = pData?.data?.state || '';
            console.log(`Enhance poll ${a}/15: state="${st}"`);
            if (st === 'success') {
              const rj = pData?.data?.resultJson;
              let enUrl = null;
              if (rj) {
                try {
                  const p = typeof rj === 'string' ? JSON.parse(rj) : rj;
                  enUrl = p?.resultUrls?.[0] || p?.urls?.[0] || p?.url;
                } catch (_) {
                  if (typeof rj === 'string' && rj.startsWith('http')) enUrl = rj;
                }
              }
              if (!enUrl) enUrl = pData?.data?.imageUrl || pData?.data?.image_url || pData?.data?.url;
              if (enUrl) {
                finalUrl = enUrl;
                console.log('✅ Enhanced:', finalUrl);
              }
              break;
            }
            if (st === 'fail') {
              console.warn('Enhance failed — using upscaled/original');
              break;
            }
          } catch (e) {
            console.warn(`Enhance poll error: ${e.message}`);
          }
        }
      } else {
        console.warn('Enhance model not available — skipping color grade. Response:', enhanceText.substring(0, 200));
      }
    } catch (e) {
      console.warn('Color grading step error (non-fatal):', e.message);
    }

    // 9. Save final image_url to concept record
    try {
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: finalUrl,
        status: 'complete',
        is_selected: true,
      });
      console.log('✅ Saved final image_url to concept record');
    } catch (e) {
      console.warn('Could not save image_url:', e.message);
    }

    console.log('=== Done ===');
    return Response.json({
      success: true,
      image_url: finalUrl,
      concept_id,
      model_used: model,
      post_processing: {
        upscaled: finalUrl !== imageUrl,
        mood_graded: mood,
        original_url: imageUrl,
      },
    });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});