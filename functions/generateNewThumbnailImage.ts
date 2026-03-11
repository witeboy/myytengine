import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// generateNewThumbnailImage — Standalone image renderer for MakeThumbnail flow
//
// Uses Kie.ai API to call Ideogram V3 text-to-image
// Correct endpoint pattern from Kie docs: /api/v1/ideogram-v3/createTask
// Poll endpoint: GET /api/v1/task/{task_id}

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
      return Response.json({ error: 'KIE_API_KEY not configured in environment variables' }, { status: 500 });
    }

    console.log('=== generateNewThumbnailImage ===');
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

    const imagePrompt = concept.image_prompt;
    const negativePrompt = [
      concept.negative_prompt || '',
      'text, letters, words, numbers, captions, watermark, logo',
      'blurry, low resolution, pixelated, grainy',
      'distorted face, deformed hands, extra fingers, bad anatomy',
    ].filter(Boolean).join(', ');

    console.log('Prompt length:', imagePrompt.length);

    // 2. Submit to Kie — try multiple endpoint patterns
    // Kie uses /api/v1/{model}/createTask pattern
    const kieHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    };

    const kieBody = {
      prompt: imagePrompt,
      negative_prompt: negativePrompt,
      aspect_ratio: 'ASPECT_16_9',
      model: 'V_3',
      magic_prompt_option: 'ON',
      style_type: 'REALISTIC',
      rendering_speed: 'QUALITY',
    };

    // Try endpoints in order until one works
    const endpoints = [
      'https://api.kie.ai/api/v1/ideogram-v3/createTask',
      'https://api.kie.ai/api/v1/ideogram/v3/createTask',
      'https://api.kie.ai/api/v1/ideogram/createTask',
      'https://api.kie.ai/api/ideogram/v3/generate',
      'https://api.kie.ai/api/v1/ideogram-character/createTask',
    ];

    let submitData = null;
    let usedEndpoint = null;

    for (const endpoint of endpoints) {
      console.log('Trying endpoint:', endpoint);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: kieHeaders,
          body: JSON.stringify(kieBody),
        });
        const text = await res.text();
        console.log(`  → ${res.status}: ${text.substring(0, 150)}`);

        if (res.status !== 404 && res.status !== 405) {
          try {
            submitData = JSON.parse(text);
          } catch (_) {
            submitData = { raw: text };
          }
          usedEndpoint = endpoint;
          break;
        }
      } catch (fetchErr) {
        console.warn('  → fetch error:', fetchErr.message);
      }
    }

    if (!submitData) {
      return Response.json({ error: 'All Kie endpoints returned 404/405. Check Kie API documentation for current Ideogram V3 endpoint.' }, { status: 500 });
    }

    console.log('Used endpoint:', usedEndpoint);
    console.log('Submit response:', JSON.stringify(submitData).substring(0, 300));

    // Check for immediate image URL (synchronous response)
    const directUrl =
      submitData?.data?.[0]?.url ||
      submitData?.images?.[0]?.url ||
      submitData?.image_url ||
      submitData?.data?.image_url ||
      submitData?.url;

    if (directUrl) {
      console.log('Got direct image URL:', directUrl);
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: directUrl,
        status: 'complete',
      });
      return Response.json({ success: true, image_url: directUrl });
    }

    // Get task_id for polling
    const taskId =
      submitData?.task_id ||
      submitData?.taskId ||
      submitData?.id ||
      submitData?.request_id ||
      submitData?.data?.task_id ||
      submitData?.data?.taskId ||
      submitData?.data?.id;

    if (!taskId) {
      console.error('Full response:', JSON.stringify(submitData));
      return Response.json({
        error: `No task_id or image_url in Kie response. Response: ${JSON.stringify(submitData).substring(0, 200)}`,
      }, { status: 500 });
    }

    console.log('Task ID:', taskId, '— polling...');

    // 3. Poll for completion
    // Kie common task detail endpoint from docs
    const pollUrls = [
      `https://api.kie.ai/api/v1/task/${taskId}`,
      `https://api.kie.ai/api/v1/ideogram-v3/task/${taskId}`,
      `https://api.kie.ai/api/v1/tasks/${taskId}`,
    ];

    const maxAttempts = 30;
    let imageUrl = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, 4000));

      let pollData = null;

      for (const pollUrl of pollUrls) {
        try {
          const pollRes = await fetch(pollUrl, { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } });
          if (pollRes.ok) {
            pollData = await pollRes.json();
            break;
          }
        } catch (_) {}
      }

      if (!pollData) {
        console.warn(`Poll ${attempt}: no valid response`);
        continue;
      }

      const status = pollData?.status || pollData?.data?.status || pollData?.state || '';
      console.log(`Poll ${attempt}/${maxAttempts}: status="${status}"`);

      // Check for image URL in response
      const url =
        pollData?.data?.[0]?.url ||
        pollData?.images?.[0]?.url ||
        pollData?.image_url ||
        pollData?.data?.image_url ||
        pollData?.data?.images?.[0]?.url ||
        pollData?.output?.image_url ||
        pollData?.result?.image_url ||
        pollData?.url;

      if (url) {
        imageUrl = url;
        console.log('Got image URL:', imageUrl);
        break;
      }

      const failStatuses = ['failed', 'error', 'FAILED', 'ERROR', 'cancelled'];
      if (failStatuses.includes(status)) {
        const errMsg = pollData?.error || pollData?.message || pollData?.data?.error || 'Generation failed';
        throw new Error(`Ideogram generation failed: ${errMsg}`);
      }
    }

    if (!imageUrl) {
      throw new Error('Timed out waiting for image. Try again — generation may have completed in background.');
    }

    // 4. Save to record
    try {
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: imageUrl,
        status: 'complete',
        is_selected: true,
      });
    } catch (saveErr) {
      console.warn('Could not save image_url:', saveErr.message);
    }

    console.log('=== Done ===');
    return Response.json({ success: true, image_url: imageUrl, concept_id });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});