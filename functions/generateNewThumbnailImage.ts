import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// generateNewThumbnailImage
//
// Uses Gemini image generation (gemini-2.0-flash-preview-image-generation)
// - Receives character photos (base64) stored in the concept record
// - Passes them directly to Gemini Vision + Image generation
// - Gemini SEES the real faces and generates the thumbnail featuring those exact people
// - Returns base64 image → uploaded to base44 storage → image_url saved to concept

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

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    console.log('=== generateNewThumbnailImage (Gemini) ===');
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
    const textOverlay = concept.text_overlay || '';
    const colorScheme = concept.color_scheme || '';
    const textStyle = concept.text_style || 'white text, thick black outline, upper-left';

    // 2. Parse stored char photos
    let charPhotos = [];
    if (concept.char_photos_json) {
      try {
        charPhotos = JSON.parse(concept.char_photos_json);
        console.log('Loaded', charPhotos.length, 'char photo(s) from record');
      } catch (e) {
        console.warn('Could not parse char_photos_json:', e.message);
      }
    }

    const hasCharPhotos = charPhotos.length > 0;

    // 3. Build Gemini content parts
    // Order: reference photos first → then detailed generation prompt
    const parts = [];

    if (hasCharPhotos) {
      for (let i = 0; i < charPhotos.length; i++) {
        const photo = charPhotos[i];
        parts.push({
          inline_data: {
            mime_type: photo.mime || 'image/jpeg',
            data: photo.b64,
          }
        });
        parts.push({
          text: `CHARACTER ${i + 1} REFERENCE PHOTO: This is the EXACT person who must appear in the thumbnail. Recreate their face, skin tone, hair, and features precisely. Do NOT substitute a different person.`,
        });
      }
    }

    // Main image generation prompt
    const generationInstruction = hasCharPhotos
      ? `Generate a professional YouTube thumbnail image (16:9 aspect ratio, 1920x1080) featuring the exact character(s) shown in the reference photo(s) above.

CRITICAL: The people in this thumbnail MUST be the same individuals from the reference photos — same face structure, skin tone, hair, and recognizable features. This is non-negotiable.

SCENE TO GENERATE:
${imagePrompt}

THUMBNAIL TEXT OVERLAY (leave clean space for this — do NOT render text in the image itself):
The text "${textOverlay}" will be overlaid on this image after generation. Leave the ${textStyle.includes('upper-left') ? 'upper-left area' : 'bottom center area'} visually clear and uncluttered for the text overlay.

COLOR PALETTE: ${colorScheme}

TECHNICAL REQUIREMENTS:
- 16:9 widescreen composition
- Photorealistic, cinematic DSLR quality
- Professional YouTube thumbnail lighting (dramatic, high contrast)
- Characters should have exaggerated, emotionally expressive faces (shock, curiosity, excitement)
- Bold visual composition with clear focal point
- NO text, words, letters, or numbers rendered in the image`
      : `Generate a professional YouTube thumbnail image (16:9 aspect ratio, 1920x1080).

SCENE TO GENERATE:
${imagePrompt}

THUMBNAIL TEXT OVERLAY (leave clean space — do NOT render text in the image):
The text "${textOverlay}" will be overlaid. Leave the ${textStyle.includes('upper-left') ? 'upper-left area' : 'bottom center area'} clear for text.

COLOR PALETTE: ${colorScheme}

TECHNICAL REQUIREMENTS:
- 16:9 widescreen composition
- Photorealistic, cinematic DSLR quality
- Professional YouTube thumbnail lighting
- Emotionally expressive characters if present
- NO text, words, letters, or numbers in the image`;

    parts.push({ text: generationInstruction });

    console.log('Parts count:', parts.length, '| Has char photos:', hasCharPhotos);

    // 4. Call Gemini image generation
    // Model: gemini-2.0-flash-preview-image-generation supports image output with vision input
    const geminiModel = 'gemini-2.0-flash-preview-image-generation';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    const geminiText = await geminiRes.text();
    console.log('Gemini HTTP status:', geminiRes.status);

    if (!geminiRes.ok) {
      console.error('Gemini error response:', geminiText.substring(0, 500));

      // If model not found, try fallback model
      if (geminiRes.status === 404 || geminiText.includes('not found') || geminiText.includes('404')) {
        console.log('Trying fallback model: gemini-2.0-flash-exp');
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          return await extractAndSaveImage(fallbackData, concept_id, base44, textOverlay);
        }
      }

      throw new Error(`Gemini API error ${geminiRes.status}: ${geminiText.substring(0, 300)}`);
    }

    let geminiData;
    try {
      geminiData = JSON.parse(geminiText);
    } catch (_) {
      throw new Error('Could not parse Gemini response JSON');
    }

    return await extractAndSaveImage(geminiData, concept_id, base44, textOverlay);

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Extract base64 image from Gemini response, upload to storage, save URL to concept
async function extractAndSaveImage(geminiData, concept_id, base44, textOverlay) {
  const parts = geminiData?.candidates?.[0]?.content?.parts || [];
  console.log('Response parts count:', parts.length);

  let imageB64 = null;
  let imageMime = 'image/png';

  for (const part of parts) {
    if (part.inline_data?.data) {
      imageB64 = part.inline_data.data;
      imageMime = part.inline_data.mime_type || 'image/png';
      console.log('Found image in response. mime:', imageMime, '| b64 length:', imageB64.length);
      break;
    }
    if (part.text) {
      console.log('Text part:', part.text.substring(0, 100));
    }
  }

  if (!imageB64) {
    const finishReason = geminiData?.candidates?.[0]?.finishReason;
    console.error('No image in response. finishReason:', finishReason);
    console.error('Full response keys:', Object.keys(geminiData || {}));
    throw new Error(`Gemini did not return an image. Finish reason: ${finishReason || 'unknown'}. Check if GEMINI_API_KEY has image generation access.`);
  }

  // Upload base64 image to base44 storage to get a public URL
  let imageUrl = null;
  try {
    const ext = imageMime.includes('png') ? 'png' : 'jpg';
    const filename = `thumbnail_${concept_id}_${Date.now()}.${ext}`;

    // Convert base64 to binary for upload
    const binaryStr = atob(imageB64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: imageMime });

    const uploadResult = await base44.storage.upload(blob, filename, imageMime);
    imageUrl = uploadResult?.url || uploadResult?.publicUrl || uploadResult?.path;
    console.log('Uploaded to storage:', imageUrl);
  } catch (uploadErr) {
    console.warn('Storage upload failed, using data URL instead:', uploadErr.message);
    // Fallback: use data URL directly (works but not ideal for large images)
    imageUrl = `data:${imageMime};base64,${imageB64}`;
  }

  // Save to concept record
  try {
    await base44.entities.ThumbnailConcepts.update(concept_id, {
      image_url: imageUrl,
      status: 'complete',
      is_selected: true,
    });
    console.log('Saved image_url to concept record');
  } catch (saveErr) {
    console.warn('Could not save image_url:', saveErr.message);
  }

  console.log('=== Done ===');
  return Response.json({
    success: true,
    image_url: imageUrl,
    concept_id,
    generator: 'gemini-image',
    text_overlay: textOverlay,
  });
}