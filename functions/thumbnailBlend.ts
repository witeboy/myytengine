import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// thumbnailBlend — AI33 SeedDream image editing/compositing
// Takes a generated thumbnail as reference + character/object images → blends them

const AI33_BASE = "https://api.ai33.pro";

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

    const AI33_API_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_API_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    const body = await req.json();
    const {
      reference_image_url,   // The generated thumbnail (required)
      face_images = [],       // Array of face/character image URLs
      object_images = [],     // Array of object/product image URLs  
      background_image_url,   // Optional background replacement URL
      video_title = '',       // For context
      custom_instructions = '',// Optional extra editing instructions
      concept_id,             // To update the concept record
    } = body;

    if (!reference_image_url) {
      return Response.json({ error: 'reference_image_url is required' }, { status: 400 });
    }

    console.log('=== thumbnailBlend (AI33 SeedDream) ===');
    console.log(`Reference: ${reference_image_url.substring(0, 80)}`);
    console.log(`Face images: ${face_images.length}`);
    console.log(`Object images: ${object_images.length}`);
    console.log(`Background: ${background_image_url ? 'yes' : 'no'}`);

    // ── Build the blend prompt (SeedDream works best with 30-100 words) ──
    const allInputImages = [reference_image_url];

    for (const faceUrl of face_images) {
      if (faceUrl) allInputImages.push(faceUrl);
    }
    if (background_image_url) allInputImages.push(background_image_url);
    for (const objUrl of object_images) {
      if (objUrl) allInputImages.push(objUrl);
    }

    // Build a concise editing prompt — SeedDream gets confused with long prompts
    const tasks = [];
    if (face_images.length > 0) tasks.push('Replace the subject face with the exact face from the character reference photo, matching lighting and skin tone seamlessly');
    if (background_image_url) tasks.push('Replace the background with the provided background image, apply cinematic depth-of-field blur');
    if (object_images.length > 0) tasks.push('Replace props/objects with the provided replacement images, maintain position and scale');
    if (custom_instructions) tasks.push(custom_instructions.substring(0, 150));

    const prompt = `Photo editing task. Preserve the original thumbnail composition, pose, framing, and text overlays exactly. ${tasks.length > 0 ? tasks.join('. ') + '.' : 'Enhance realism and blending.'} Photorealistic YouTube thumbnail, high contrast, sharp subject, consistent lighting, seamless compositing, no AI artifacts. 1920x1080 16:9.`;

    console.log(`Prompt length: ${prompt.length} chars`);
    console.log(`Total input images: ${allInputImages.length}`);

    // ── Submit to AI33 SeedDream ─────────────────────────────────
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model_id', 'bytedance-seedream-4.5');
    formData.append('generations_count', '1');
    formData.append('model_parameters', JSON.stringify({
      aspect_ratio: '16:9',
      resolution: '2K'
    }));

    // Attach all input images as URLs
    for (const [i, url] of allInputImages.entries()) {
      formData.append('image_urls', url);
    }

    console.log('📡 Submitting to AI33 SeedDream...');
    const submitRes = await fetch(`${AI33_BASE}/v1i/task/generate-image`, {
      method: 'POST',
      headers: { 'xi-api-key': AI33_API_KEY },
      body: formData
    });

    const submitData = await submitRes.json();
    console.log(`AI33 response: ${JSON.stringify(submitData).substring(0, 300)}`);

    if (!submitData.success || !submitData.task_id) {
      throw new Error(`AI33 submit failed: ${submitData.message || JSON.stringify(submitData)}`);
    }

    const taskId = submitData.task_id;
    console.log(`✅ AI33 task submitted: ${taskId}`);

    // ── Poll for result (up to 90s) ──────────────────────────────
    const startTime = Date.now();
    const MAX_POLL_MS = 85000;
    const POLL_INTERVAL = 5000;
    let finalUrl = null;
    let pollAttempt = 0;

    while (Date.now() - startTime < MAX_POLL_MS) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      pollAttempt++;

      try {
        const pollRes = await fetch(`${AI33_BASE}/v1/task/${taskId}`, {
          headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_API_KEY }
        });

        if (!pollRes.ok) {
          console.log(`Poll ${pollAttempt}: HTTP ${pollRes.status}`);
          continue;
        }

        const pollData = await pollRes.json();
        const status = pollData.status || '';
        console.log(`Poll ${pollAttempt}: status="${status}"`);

        if (status === 'done' || status === 'completed' || status === 'success') {
          const images = pollData.metadata?.result_images;
          finalUrl = images?.[0]?.imageUrl;
          if (finalUrl) {
            console.log(`✅ Blend complete: ${finalUrl.substring(0, 80)}`);
            break;
          } else {
            throw new Error('AI33 returned done but no imageUrl');
          }
        }

        if (status === 'error' || status === 'failed') {
          const errMsg = pollData.error_message || pollData.message || 'AI33 blend task failed';
          console.warn(`Poll ${pollAttempt}: AI33 error — ${errMsg}`);
          throw new Error(errMsg);
        }
      } catch (e) {
        if (e.message.includes('AI33') || e.message.includes('invalid_generation') || e.message.includes('failed')) throw e;
        console.warn(`Poll ${pollAttempt} error: ${e.message}`);
      }
    }

    // If still pending after polling budget, return task_id for frontend polling
    if (!finalUrl) {
      console.log('⏱ Blend still in progress — returning task_id');
      return Response.json({
        success: false,
        pending: true,
        task_id: taskId,
        concept_id,
        message: 'Blend in progress. Poll with pollThumbnailBlend.',
      });
    }

    // ── Save blended image to concept if concept_id provided ────
    if (concept_id) {
      try {
        await base44.entities.ThumbnailConcepts.update(concept_id, {
          image_url: finalUrl,
        });
        console.log('✅ Updated concept with blended image');
      } catch (e) {
        console.warn('Failed to update concept:', e.message);
      }
    }

    return Response.json({
      success: true,
      image_url: finalUrl,
      task_id: taskId,
      concept_id,
    });

  } catch (error) {
    console.error('thumbnailBlend error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});