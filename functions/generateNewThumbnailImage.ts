import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// generateNewThumbnailImage
//
// Correct Kie API structure (confirmed from docs):
//   Submit:  POST https://api.kie.ai/api/v1/jobs/createTask
//            Body: { model, input: { prompt, aspect_ratio, ... } }
//            Returns: { code: 200, data: { taskId } }
//
//   Poll:    GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=XXX
//            Returns: { code: 200, data: { state, resultJson, failMsg } }
//            state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail'
//            resultJson: '{"resultUrls":["https://..."]}'

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

    if (!concept_id) {
      return Response.json({ error: 'concept_id is required' }, { status: 400 });
    }

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) {
      return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });
    }

    console.log('=== generateNewThumbnailImage ===');
    console.log('concept_id:', concept_id);

    // 1. Load concept
    let concept;
    try {
      concept = await base44.entities.ThumbnailConcepts.get(concept_id);
    } catch (e) {
      return Response.json({ error: `Could not load concept: ${e.message}` }, { status: 404 });
    }

    if (!concept?.image_prompt) {
      return Response.json({ error: 'Concept has no image_prompt' }, { status: 400 });
    }

    const imagePrompt = concept.image_prompt;
    const negativePrompt = [
      concept.negative_prompt || '',
      'text, letters, words, numbers, captions, watermark',
      'blurry, low quality, distorted face, bad anatomy',
    ].filter(Boolean).join(', ');

    console.log('Prompt length:', imagePrompt.length);

    const kieHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    };

    // 2. Submit task — try Ideogram V3 first, fall back to other models
    const modelOptions = [
      {
        model: 'ideogram/v3',
        input: {
          prompt: imagePrompt,
          negative_prompt: negativePrompt,
          aspect_ratio: '16:9',
          magic_prompt_option: 'ON',
          style_type: 'REALISTIC',
          rendering_speed: 'QUALITY',
        },
      },
      {
        model: 'ideogram/v3-turbo',
        input: {
          prompt: imagePrompt,
          negative_prompt: negativePrompt,
          aspect_ratio: '16:9',
        },
      },
      {
        model: 'nano-banana-pro',
        input: {
          prompt: imagePrompt,
          aspect_ratio: '16:9',
          resolution: '2K',
        },
      },
    ];

    let taskId = null;
    let usedModel = null;

    for (const option of modelOptions) {
      console.log('Trying model:', option.model);
      try {
        const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: kieHeaders,
          body: JSON.stringify(option),
        });
        const text = await res.text();
        console.log(`  → HTTP ${res.status}: ${text.substring(0, 200)}`);

        let data;
        try { data = JSON.parse(text); } catch (_) {}

        if (data?.code === 200 && data?.data?.taskId) {
          taskId = data.data.taskId;
          usedModel = option.model;
          console.log('Task created! taskId:', taskId, '| model:', usedModel);
          break;
        }

        // If 4xx, try next model
        if (res.status >= 400 && res.status < 500) continue;

        // If server error on a valid endpoint, still log and try next
        console.warn('  → non-success response, trying next model');
      } catch (fetchErr) {
        console.warn('  → fetch error:', fetchErr.message);
      }
    }

    if (!taskId) {
      return Response.json({
        error: 'Could not create generation task on any Kie model. Check KIE_API_KEY and account credits.',
      }, { status: 500 });
    }

    // 3. Poll for result
    // GET /api/v1/jobs/recordInfo?taskId=XXX
    const pollUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;
    const maxAttempts = 30;
    const pollInterval = 5000; // 5 seconds
    let imageUrl = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, pollInterval));

      let pollData;
      try {
        const pollRes = await fetch(pollUrl, {
          headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
        });
        const text = await pollRes.text();
        try { pollData = JSON.parse(text); } catch (_) {}
      } catch (fetchErr) {
        console.warn(`Poll ${attempt}: fetch error:`, fetchErr.message);
        continue;
      }

      const state = pollData?.data?.state || '';
      console.log(`Poll ${attempt}/${maxAttempts}: state="${state}"`);

      if (state === 'success') {
        // resultJson is a JSON string: '{"resultUrls":["https://..."]}'
        const resultJson = pollData?.data?.resultJson;
        if (resultJson) {
          try {
            const parsed = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
            imageUrl = parsed?.resultUrls?.[0] || parsed?.urls?.[0] || parsed?.url;
          } catch (_) {
            // resultJson might already be the URL string
            if (typeof resultJson === 'string' && resultJson.startsWith('http')) {
              imageUrl = resultJson;
            }
          }
        }
        // Also check direct fields just in case
        if (!imageUrl) {
          imageUrl = pollData?.data?.imageUrl
            || pollData?.data?.image_url
            || pollData?.data?.url;
        }
        if (imageUrl) {
          console.log('Got image URL:', imageUrl);
          break;
        }
        console.warn('state=success but no URL found. Full data:', JSON.stringify(pollData?.data));
        break;
      }

      if (state === 'fail') {
        const failMsg = pollData?.data?.failMsg || 'Unknown error';
        throw new Error(`Generation failed: ${failMsg}`);
      }

      // waiting / queuing / generating — continue polling
    }

    if (!imageUrl) {
      throw new Error('Timed out or no image URL received after generation. The image may still be processing.');
    }

    // 4. Save to ThumbnailConcepts record
    try {
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: imageUrl,
        status: 'complete',
        is_selected: true,
      });
      console.log('Saved image_url to record');
    } catch (saveErr) {
      console.warn('Could not save image_url:', saveErr.message);
    }

    console.log('=== Done ===');
    return Response.json({ success: true, image_url: imageUrl, concept_id, model_used: usedModel });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});