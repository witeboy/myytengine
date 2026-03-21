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

    // ── Build the blend prompt ──────────────────────────────────
    const allInputImages = [reference_image_url];
    const imageRoles = ['Image 1 = REFERENCE IMAGE (the original thumbnail to edit — preserve its exact composition, layout, and framing)'];
    let imageIndex = 2;

    // Add face images
    for (const faceUrl of face_images) {
      if (faceUrl) {
        allInputImages.push(faceUrl);
        imageRoles.push(`Image ${imageIndex} = FACE/CHARACTER REFERENCE (use this person's exact face, skin tone, hair, and features to replace the subject in the reference image)`);
        imageIndex++;
      }
    }

    // Add background image
    if (background_image_url) {
      allInputImages.push(background_image_url);
      imageRoles.push(`Image ${imageIndex} = BACKGROUND IMAGE (replace the reference image's background with this)`);
      imageIndex++;
    }

    // Add object images
    for (const objUrl of object_images) {
      if (objUrl) {
        allInputImages.push(objUrl);
        imageRoles.push(`Image ${imageIndex} = OBJECT/PROP IMAGE (replace corresponding objects in the reference image with this)`);
        imageIndex++;
      }
    }

    const prompt = `STRICT EDIT MODE:
Preserve original pixel structure. Only modify masked/replaced areas.

You are a professional photo editor and compositing expert.
This is an IMAGE EDITING task — NOT image generation.

PRIMARY GOAL:
Preserve the original reference image composition while selectively replacing specific elements using provided assets.

INPUT ASSETS (${allInputImages.length} images provided):
${imageRoles.join('\n')}

GLOBAL RULES (STRICT):
- DO NOT redesign the scene
- DO NOT change pose, framing, or layout
- DO NOT reposition core elements unless necessary for realism
- PRESERVE original composition as much as possible
- Think like Photoshop compositing, not AI generation

EDITING TASKS:

${face_images.length > 0 ? `1. FACE / CHARACTER REPLACEMENT
- Replace the subject's face (or full identity if needed) using the CHARACTER REFERENCE image(s)
- Match: lighting direction, skin tone, color temperature, shadow depth
- Blend seamlessly (no visible edges or distortion)
- Adjust proportions slightly to fit naturally
- The person must be IMMEDIATELY recognizable as the person from the reference photos
- Preserve the EXACT pose and expression energy from the original thumbnail
` : '1. FACE: Keep the existing subject as-is.\n'}

${background_image_url ? `2. BACKGROUND REPLACEMENT
- Replace original background with the BACKGROUND IMAGE provided
- Apply strong depth-of-field blur (cinematic background blur)
- Match lighting and color grading with subject
- Ensure subject remains the focal point
` : '2. BACKGROUND: Keep the existing background as-is.\n'}

${object_images.length > 0 ? `3. OBJECT REPLACEMENT (CRITICAL)
For each object in the reference image, replace with corresponding object from the provided OBJECT/PROP images.
Rules:
- Maintain original position, scale, and perspective
- Match lighting, shadows, and reflections
- Blend naturally into scene
- Map intelligently based on similarity and position
` : '3. OBJECTS: Keep existing objects as-is.\n'}

4. REALISM & BLENDING
- Ensure consistent lighting across ALL elements
- Add natural shadows and contact shadows
- Apply unified color grading
- Add subtle grain/noise for realism
- Maintain sharp subject + blurred background (thumbnail style)

5. ORIGINAL ELEMENT PRESERVATION
Keep unchanged unless explicitly replaced:
- Pose and body position
- Text, arrows, overlays (if present)
- Composition and framing
- Overall color grading and mood

${custom_instructions ? `ADDITIONAL INSTRUCTIONS:\n${custom_instructions}\n` : ''}

${video_title ? `VIDEO CONTEXT: "${video_title}"\n` : ''}

STYLE OUTPUT:
- Photorealistic, high contrast (YouTube thumbnail ready)
- Clean, sharp subject, no AI artifacts, visually cohesive
- 1920×1080 16:9 aspect ratio

FINAL CHECK:
- Does the image look like the ORIGINAL layout? Must be YES
- Are all replacements seamlessly blended? Must be YES
- Is lighting consistent across subject, objects, and background? Must be YES`;

    console.log(`Prompt length: ${prompt.length} chars`);
    console.log(`Total input images: ${allInputImages.length}`);

    // ── Submit to AI33 SeedDream ─────────────────────────────────
    const formData = new FormData();
    formData.append('prompt', prompt.substring(0, 4000));
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
          throw new Error(pollData.error_message || pollData.message || 'AI33 blend task failed');
        }
      } catch (e) {
        if (e.message.includes('AI33')) throw e;
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