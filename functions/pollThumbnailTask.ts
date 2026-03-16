import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// pollThumbnailTask — Check if a KIE task has completed
// Called by the frontend when generateNewThumbnailImage returns pending=true

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

    const { task_id, concept_id } = await req.json();
    if (!task_id) return Response.json({ error: 'task_id required' }, { status: 400 });

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    // Poll the task once
    const res = await fetch(
      `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${task_id}`,
      { headers: { 'Authorization': `Bearer ${KIE_API_KEY}` } }
    );
    const text = await res.text();
    let pollData;
    try { pollData = JSON.parse(text); } catch (_) {}

    const state = pollData?.data?.state || '';
    console.log(`Poll task ${task_id}: state="${state}"`);

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

      // Re-upload to Base44 storage for CORS-safe access
      let persistentUrl = url;
      if (url) {
        try {
          console.log('📦 Re-uploading to Base44 storage...');
          const imgResp = await fetch(url);
          if (imgResp.ok) {
            const imgBlob = await imgResp.blob();
            const imgFile = new File([imgBlob], `thumbnail_${concept_id || 'poll'}_${Date.now()}.png`, { type: imgBlob.type || 'image/png' });
            const uploadResult = await base44.integrations.Core.UploadFile({ file: imgFile });
            if (uploadResult?.file_url) {
              persistentUrl = uploadResult.file_url;
              console.log('✅ Re-uploaded:', persistentUrl);
            }
          }
        } catch (e) {
          console.warn('Re-upload failed (using KIE URL):', e.message);
        }
      }

      if (concept_id) {
        try {
          await base44.entities.ThumbnailConcepts.update(concept_id, {
            image_url: persistentUrl, status: 'complete', is_selected: true,
          });
          console.log('✅ Saved to concept');
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