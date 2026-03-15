import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// generateNewThumbnailImage
//
// Uses Kie.ai Nano Banana (Gemini 2.5 Flash Image) for image generation
// Confirmed endpoints from docs:
//   Submit: POST https://api.kie.ai/api/v1/jobs/createTask
//           { model: "nano-banana-pro", input: { prompt, image_input: [], aspect_ratio, resolution, output_format } }
//   Poll:   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=XXX
//           { data: { state: "successful"|"failed"|"queuing"|"generating", resultJson: '{"resultUrls":["..."]}' } }
//
// Character photos: passed as base64 image_input array — Nano Banana supports reference images
// so your REAL people will appear in the generated thumbnail

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
    const { concept_id } = body;
    if (!concept_id) return Response.json({ error: 'concept_id is required' }, { status: 400 });

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    console.log('=== generateNewThumbnailImage (Nano Banana) ===');
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

    // 2. Parse stored character photos
    let charPhotos = [];
    if (concept.char_photos_json) {
      try {
        charPhotos = JSON.parse(concept.char_photos_json);
        console.log('Loaded', charPhotos.length, 'character photo(s)');
      } catch (e) {
        console.warn('Could not parse char_photos_json:', e.message);
      }
    }

    // 2b. Parse stored template reference
    let templateRef = null;
    if (concept.template_ref_json) {
      try {
        templateRef = JSON.parse(concept.template_ref_json);
        console.log('Loaded template ref:', templateRef.name);
      } catch (e) {
        console.warn('Could not parse template_ref_json:', e.message);
      }
    }

    const hasCharPhotos = charPhotos.length > 0;
    const hasTemplateRef = !!templateRef?.b64;

    // 3. Build prompt — TWO MODES: template clone vs freeform
    let fullPrompt;

    if (hasTemplateRef) {
      // ═══ TEMPLATE CLONE MODE ═══
      // The template image IS the brief. We clone its layout exactly,
      // just swapping faces and text. The concept.image_prompt is secondary.
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
      // ═══ FREEFORM MODE ═══ (no template — use concept.image_prompt as-is)
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

    // 4. Build image_input — template FIRST (layout master), then character faces
    // Kie treats the first image as the strongest reference
    const imageInput = [];

    if (hasTemplateRef) {
      imageInput.push(`data:${templateRef.mime || 'image/jpeg'};base64,${templateRef.b64}`);
      console.log('Added template reference image FIRST (layout master)');
    }

    for (const [i, p] of charPhotos.filter(p => p?.b64).entries()) {
      imageInput.push(`data:${p.mime || 'image/jpeg'};base64,${p.b64}`);
      console.log(`Added character photo ${i + 1} (face reference)`);
    }

    console.log('image_input count:', imageInput.length, `(${hasTemplateRef ? '1 template + ' : ''}${charPhotos.length} chars)`);

    // 5. Submit to Kie Nano Banana
    const kieHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    };

    // Try nano-banana-pro first, fall back to nano-banana-2
    const models = ['nano-banana-pro', 'nano-banana-2', 'nano-banana'];
    let taskId = null;
    let usedModel = null;

    for (const model of models) {
      console.log('Trying model:', model);
      const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: kieHeaders,
        body: JSON.stringify({
          model,
          input: {
            prompt: fullPrompt,
            image_input: imageInput,
            aspect_ratio: '16:9',
            resolution: '1K',
            output_format: 'png',
          },
        }),
      });

      const text = await res.text();
      console.log(`  → HTTP ${res.status}: ${text.substring(0, 200)}`);

      let data;
      try { data = JSON.parse(text); } catch (_) {}

      // Success: task created
      if (data?.code === 200 && data?.data?.taskId) {
        taskId = data.data.taskId;
        usedModel = model;
        console.log(`Task created! taskId: ${taskId} | model: ${usedModel}`);
        break;
      }

      // 404/400 = model not available on this plan, try next
      if (res.status === 404 || res.status === 400) continue;

      // Any other error — log and try next
      console.warn(`  → model ${model} failed with status ${res.status}`);
    }

    if (!taskId) {
      return Response.json({
        error: 'Could not create task on any Nano Banana model. Check KIE_API_KEY has credits and nano-banana access.',
      }, { status: 500 });
    }

    // 6. Poll for result
    // GET /api/v1/jobs/recordInfo?taskId=XXX
    // state: 'queuing' | 'generating' | 'successful' | 'failed'
    // resultJson when successful: '{"resultUrls":["https://..."]}'
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

      if (state === 'successful' || state === 'success') {
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
        console.warn('state=successful but no URL found. data:', JSON.stringify(pollData?.data).substring(0, 300));
        break;
      }

      if (state === 'failed' || state === 'fail') {
        const msg = pollData?.data?.failMsg || pollData?.data?.error || 'Generation failed';
        throw new Error(`Nano Banana generation failed: ${msg}`);
      }
      // queuing / generating — keep polling
    }

    if (!imageUrl) {
      throw new Error('Timed out waiting for image from Nano Banana. The task may still be processing — try again.');
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
      model_used: usedModel,
    });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});