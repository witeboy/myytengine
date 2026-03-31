import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// POLL THUMBNAIL TASK
// Supports both AI33 SeedDream tasks and KIE tasks (Ideogram/Grok/Nano)
// Called by frontend when generateThumbnailImage or generateNewThumbnailImage
// returns pending=true with a task_id.
// ══════════════════════════════════════════════════════════════════

const AI33_BASE = "https://api.ai33.pro";
const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ── Re-upload to Cloudflare R2 for CORS-safe access ──────────────
async function reuploadToR2(imageUrl, conceptId) {
  try {
    console.log('📦 Re-uploading to R2 storage...');
    const imgResp = await fetch(imageUrl);
    if (!imgResp.ok) return imageUrl;

    const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
    const contentType = imgResp.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';

    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
        secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
      },
    });

    const fileName = `thumbnails/thumb_${conceptId || 'poll'}_${Date.now()}.${ext}`;
    await r2Client.send(new PutObjectCommand({
      Bucket: (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim(),
      Key: fileName,
      Body: imgBytes,
      ContentType: contentType,
    }));

    const r2PublicUrl = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
    const persistentUrl = `${r2PublicUrl}/${fileName}`;
    console.log('✅ Re-uploaded to R2:', persistentUrl);
    return persistentUrl;
  } catch (e) {
    console.warn('R2 re-upload failed (using original URL):', e.message);
    return imageUrl;
  }
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

    const { task_id, concept_id, task_type } = await req.json();
    if (!task_id) return Response.json({ error: 'task_id required' }, { status: 400 });

    // ════════════════════════════════════════════════════════════
    // AI33 SEEDREAM POLLING
    // ════════════════════════════════════════════════════════════
    if (task_type === 'ai33') {
      const AI33_KEY = Deno.env.get('AI33_API_KEY');
      if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

      let pollRes;
      try {
        pollRes = await fetch(`${AI33_BASE}/v1/task/${task_id}`, {
          headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY }
        });
      } catch (fetchErr) {
        console.warn(`AI33 poll network error: ${fetchErr.message}`);
        return Response.json({ success: true, completed: false, state: 'network_error' });
      }

      if (!pollRes.ok) {
        if (pollRes.status === 404 || pollRes.status === 410) {
          // Task expired or not found — tell frontend to retry with fallback
          return Response.json({ success: false, completed: true, error: 'AI33 task not found — try Ideogram fallback', fallback_needed: true });
        }
        console.log(`AI33 poll HTTP ${pollRes.status}, still processing`);
        return Response.json({ success: true, completed: false, state: 'processing' });
      }

      const pollData = await pollRes.json();
      console.log(`AI33 poll task ${task_id}: status="${pollData.status}"`);

      // ── DONE ──
      if (pollData.status === 'done' || pollData.status === 'completed' || pollData.status === 'success') {
        const images = pollData.metadata?.result_images;
        let finalUrl = images?.[0]?.imageUrl;

        if (!finalUrl) {
          return Response.json({ success: false, completed: true, error: 'AI33 returned no image URL', fallback_needed: true });
        }

        // Re-upload to R2
        const persistentUrl = await reuploadToR2(finalUrl, concept_id);

        // Save to concept
        if (concept_id) {
          try {
            await base44.entities.ThumbnailConcepts.update(concept_id, {
              image_url: persistentUrl, status: 'complete', is_selected: true,
            });
            console.log('✅ Saved AI33 thumbnail to concept');
          } catch (e) { console.warn('Save error:', e.message); }
        }

        return Response.json({ success: true, completed: true, image_url: persistentUrl, model: 'ai33-seedream-4.5' });
      }

      // ── FAILED ──
      if (pollData.status === 'error' || pollData.status === 'failed') {
        const errMsg = pollData.error_message || pollData.message || 'AI33 task failed';
        console.warn(`AI33 thumbnail failed: ${errMsg}`);
        return Response.json({ success: false, completed: true, error: errMsg, fallback_needed: true });
      }

      // ── STILL PROCESSING ──
      const progress = pollData.progress || pollData.percentage || null;
      console.log(`AI33 thumbnail ${pollData.status}${progress ? ` (${progress}%)` : ''}...`);
      return Response.json({ success: true, completed: false, state: pollData.status, progress });
    }

    // ════════════════════════════════════════════════════════════
    // KIE POLLING (Ideogram, Grok, Nano Banana)
    // ════════════════════════════════════════════════════════════
    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    const res = await fetch(
      `${KIE_BASE}/recordInfo?taskId=${task_id}`,
      { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } } 
    );
    const text = await res.text();
    let pollData;
    try { pollData = JSON.parse(text); } catch (_) {}

    const state = pollData?.data?.state || '';
    console.log(`KIE poll task ${task_id}: state="${state}"`);

    if (state === 'success') {
      const rj = pollData?.data?.resultJson;
      let url = null;
      if (rj) {
        try {
          const p = typeof rj === 'string' ? JSON.parse(rj) : rj;
          url = p?.resultUrls?.[0] || p?.urls?.[0] || p?.images?.[0] || p?.url;
        } catch (_) {
          if (typeof rj === 'string' && rj.startsWith('http')) url = rj;
        }
      }
      if (!url) url = pollData?.data?.imageUrl || pollData?.data?.image_url || pollData?.data?.url;

      // Re-upload to R2
      const persistentUrl = url ? await reuploadToR2(url, concept_id) : url;

      if (concept_id && persistentUrl) {
        try {
          await base44.entities.ThumbnailConcepts.update(concept_id, {
            image_url: persistentUrl, status: 'complete', is_selected: true,
          });
          console.log('✅ Saved KIE thumbnail to concept');
        } catch (e) { console.warn('Save error:', e.message); }
      }

      return Response.json({ success: true, completed: true, image_url: persistentUrl });
    }

    if (state === 'fail') {
      const msg = pollData?.data?.failMsg || pollData?.data?.error || 'Generation failed';
      return Response.json({ success: false, completed: true, error: msg });
    }

    // Still waiting
    return Response.json({ success: true, completed: false, state });

  } catch (error) {
    console.error('pollThumbnailTask error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});