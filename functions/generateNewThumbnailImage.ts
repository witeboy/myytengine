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

    const hasCharPhotos = charPhotos.length > 0;

    // 3. Build prompt — if we have character photos, instruct Nano Banana to use them
    let fullPrompt = concept.image_prompt;

    if (hasCharPhotos) {
      fullPrompt = `Using the provided reference photo(s) as the character(s), generate the following scene. 
CRITICAL: The people in this image must exactly match the reference photos — same face, skin tone, hair, and recognizable features. Do not substitute different people.

SCENE:
${concept.image_prompt}

NO text, letters, words, or numbers anywhere in the image. Leave the ${concept.text_style?.includes('upper-left') ? 'upper-left area' : 'bottom center area'} visually clean for text overlay.`;
    }

    // 4. Build image_input array from base64 character photos
    // Nano Banana accepts base64 strings in image_input array
    const imageInput = hasCharPhotos
      ? charPhotos
          .filter(p => p?.b64)
          .map(p => `data:${p.mime || 'image/jpeg'};base64,${p.b64}`)
      : [];

    console.log('image_input count:', imageInput.length);
    console.log('Prompt length:', fullPrompt.length);

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