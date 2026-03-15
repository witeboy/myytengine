import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// generateThumbnailFromUrls
// Accepts photo URLs + title + summary, downloads images, runs concept generation + image render
// This enables testing the full pipeline without the UI base64 conversion

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
    const {
      video_title,
      summary = '',
      photo_urls = [],       // array of image URLs
      template_id = 'nollywood_split_reaction',
    } = body;

    if (!video_title?.trim()) return Response.json({ error: 'video_title is required' }, { status: 400 });
    if (!photo_urls.length) return Response.json({ error: 'photo_urls array is required' }, { status: 400 });

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!GEMINI_API_KEY) return Response.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    console.log('=== generateThumbnailFromUrls ===');
    console.log('Title:', video_title);
    console.log('Photos:', photo_urls.length);
    console.log('Template:', template_id);

    // ── Step 1: Download photos → base64 ──────────────────────────
    const charPhotos = [];
    for (const [i, url] of photo_urls.entries()) {
      try {
        console.log(`Downloading photo ${i + 1}: ${url.substring(0, 80)}...`);
        const res = await fetch(url);
        if (!res.ok) { console.warn(`Photo ${i+1} failed: ${res.status}`); continue; }
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        
        // Convert to base64
        let b64 = '';
        const CHUNK = 32768;
        for (let j = 0; j < bytes.length; j += CHUNK) {
          b64 += String.fromCharCode(...bytes.subarray(j, Math.min(j + CHUNK, bytes.length)));
        }
        b64 = btoa(b64);
        
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        charPhotos.push({ b64, mime: contentType, name: `photo_${i + 1}` });
        console.log(`✅ Photo ${i + 1}: ${(bytes.length / 1024).toFixed(0)}KB`);
      } catch (e) {
        console.warn(`Photo ${i + 1} error: ${e.message}`);
      }
    }

    if (charPhotos.length < 2) {
      return Response.json({ error: `Only ${charPhotos.length} photos downloaded, need at least 2` }, { status: 400 });
    }

    // ── Step 2: Call newThumbnailConcept ───────────────────────────
    console.log('Calling newThumbnailConcept...');
    const conceptRes = await base44.functions.invoke('newThumbnailConcept', {
      video_title,
      summary,
      char_photos: charPhotos,
      char_count: charPhotos.length,
      // No template b64 — we'll handle template in image gen
    });

    const conceptData = conceptRes?.data ?? conceptRes;
    if (conceptData?.error) throw new Error(`Concept gen failed: ${conceptData.error}`);

    const conceptIds = conceptData?.concept_ids || [];
    if (!conceptIds.length) throw new Error('No concept_ids returned from newThumbnailConcept');
    console.log(`✅ ${conceptIds.length} concepts generated`);

    // ── Step 3: Pick the top concept (rank 1) ─────────────────────
    let topConcept = null;
    for (const id of conceptIds) {
      try {
        const record = await base44.entities.ThumbnailConcepts.get(id);
        if (!topConcept || (record.rank && record.rank < (topConcept.rank || 99))) {
          topConcept = record;
        }
      } catch (_) {}
    }

    if (!topConcept) throw new Error('Could not load any concepts');
    console.log(`Top concept: #${topConcept.rank} "${topConcept.text_overlay}" CTR:${topConcept.ctr_score}`);

    // ── Step 4: Generate the thumbnail image ──────────────────────
    console.log('Calling generateNewThumbnailImage...');
    const imageRes = await base44.functions.invoke('generateNewThumbnailImage', {
      concept_id: topConcept.id,
      char_photos: charPhotos,
      // No template_ref — pure prompt-driven with face preservation
    });

    const imageData = imageRes?.data ?? imageRes;
    if (imageData?.error) throw new Error(`Image gen failed: ${imageData.error}`);

    const imageUrl = imageData?.image_url;
    if (!imageUrl) throw new Error('No image_url returned');

    console.log('✅ Final thumbnail:', imageUrl);

    return Response.json({
      success: true,
      image_url: imageUrl,
      concept: {
        id: topConcept.id,
        text_overlay: topConcept.text_overlay,
        ctr_score: topConcept.ctr_score,
        rank: topConcept.rank,
      },
      all_concept_ids: conceptIds,
      detected_mood: conceptData.detected_mood,
    });

  } catch (error) {
    console.error('generateThumbnailFromUrls error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});