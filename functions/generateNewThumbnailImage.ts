import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// generateNewThumbnailImage — Standalone image renderer for MakeThumbnail flow
//
// Flow:
//   1. Receive concept_id
//   2. Load the ThumbnailConcepts record to get image_prompt
//   3. Call Ideogram V3 via Kie API to render the image
//   4. Poll until complete
//   5. Save image_url back to the ThumbnailConcepts record
//   6. Return { image_url }

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

    if (!concept) {
      return Response.json({ error: 'Concept not found' }, { status: 404 });
    }

    const imagePrompt = concept.image_prompt || '';
    if (!imagePrompt) {
      return Response.json({ error: 'Concept has no image_prompt' }, { status: 400 });
    }

    console.log('Image prompt length:', imagePrompt.length);
    console.log('Text overlay:', concept.text_overlay);

    // 2. Build negative prompt
    const negativePrompt = [
      concept.negative_prompt || '',
      'text, letters, words, numbers, captions, subtitles, watermark, logo',
      'blurry, out of focus, low resolution, pixelated, grainy, noisy',
      'distorted face, deformed hands, extra fingers, bad anatomy',
      'ugly, poorly drawn, amateur, sketch, cartoon, anime, illustration',
      'oversaturated, overexposed, underexposed',
    ].filter(Boolean).join(', ');

    // 3. Submit to Ideogram V3 via Kie
    console.log('Submitting to Ideogram V3 via Kie...');

    const submitRes = await fetch('https://api.kie.ai/api/ideogram/v1/ideogram-v3', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${KIE_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: imagePrompt,
        negative_prompt: negativePrompt,
        aspect_ratio: 'ASPECT_16_9',
        model: 'V_3',
        magic_prompt_option: 'ON',
        style_type: 'REALISTIC',
        rendering_speed: 'QUALITY',
      }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      console.error('Kie submit error:', submitRes.status, errText.substring(0, 300));
      throw new Error(`Kie API error ${submitRes.status}: ${errText.substring(0, 200)}`);
    }

    const submitData = await submitRes.json();
    console.log('Kie submit response:', JSON.stringify(submitData).substring(0, 300));

    // Extract task/request ID — Kie returns different fields depending on version
    const taskId = submitData?.task_id
      || submitData?.id
      || submitData?.request_id
      || submitData?.data?.task_id
      || submitData?.data?.id;

    if (!taskId) {
      // Some Kie versions return the image directly
      const directUrl = submitData?.image_url
        || submitData?.data?.image_url
        || submitData?.images?.[0]?.url
        || submitData?.data?.images?.[0]?.url;

      if (directUrl) {
        console.log('Got direct image URL (no polling needed):', directUrl);
        await base44.entities.ThumbnailConcepts.update(concept_id, {
          image_url: directUrl,
          status: 'complete',
        });
        return Response.json({ success: true, image_url: directUrl });
      }

      console.error('Full Kie response:', JSON.stringify(submitData));
      throw new Error('No task_id or image_url in Kie response. Check KIE_API_KEY and API format.');
    }

    console.log('Task ID:', taskId, '— polling for result...');

    // 4. Poll for completion
    const pollUrl = `https://api.kie.ai/api/ideogram/v1/ideogram-v3/${taskId}`;
    const maxAttempts = 30;
    const pollInterval = 4000; // 4 seconds

    let imageUrl = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, pollInterval));

      let pollRes;
      try {
        pollRes = await fetch(pollUrl, {
          headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
        });
      } catch (fetchErr) {
        console.warn(`Poll attempt ${attempt} fetch error:`, fetchErr.message);
        continue;
      }

      if (!pollRes.ok) {
        console.warn(`Poll attempt ${attempt}: HTTP ${pollRes.status}`);
        continue;
      }

      const pollData = await pollRes.json();
      const status = pollData?.status || pollData?.data?.status || '';
      console.log(`Poll ${attempt}/${maxAttempts}: status="${status}"`);

      // Check for completion
      const url = pollData?.image_url
        || pollData?.data?.image_url
        || pollData?.images?.[0]?.url
        || pollData?.data?.images?.[0]?.url
        || pollData?.output?.image_url
        || pollData?.result?.image_url;

      if (url) {
        imageUrl = url;
        console.log('Got image URL:', imageUrl);
        break;
      }

      // Check for failure
      if (status === 'failed' || status === 'error' || status === 'FAILED') {
        const errMsg = pollData?.error || pollData?.message || pollData?.data?.error || 'Unknown error';
        throw new Error(`Ideogram generation failed: ${errMsg}`);
      }

      // Still processing — continue polling
      if (status === 'pending' || status === 'processing' || status === 'PENDING' || status === 'IN_PROGRESS' || !status) {
        continue;
      }
    }

    if (!imageUrl) {
      throw new Error('Ideogram timed out after 2 minutes. The image may still be generating — try again.');
    }

    // 5. Save image_url back to record
    try {
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: imageUrl,
        status: 'complete',
        is_selected: true,
      });
      console.log('Saved image_url to ThumbnailConcepts record');
    } catch (saveErr) {
      console.warn('Could not save image_url to record:', saveErr.message);
      // Still return the URL even if save fails
    }

    console.log('=== generateNewThumbnailImage complete ===');

    return Response.json({
      success: true,
      image_url: imageUrl,
      concept_id,
    });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
