import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// pollThumbnailBlend — polls AI33 task status for thumbnailBlend results

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

    const { task_id, concept_id } = await req.json();
    if (!task_id) return Response.json({ error: 'task_id is required' }, { status: 400 });

    const pollRes = await fetch(`${AI33_BASE}/v1/task/${task_id}`, {
      headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_API_KEY }
    });

    if (!pollRes.ok) {
      return Response.json({ completed: false, state: `http_${pollRes.status}` });
    }

    const pollData = await pollRes.json();
    const status = pollData.status || '';

    if (status === 'done' || status === 'completed' || status === 'success') {
      const images = pollData.metadata?.result_images;
      const imageUrl = images?.[0]?.imageUrl;

      if (imageUrl && concept_id) {
        try {
          await base44.entities.ThumbnailConcepts.update(concept_id, { image_url: imageUrl });
        } catch (_) {}
      }

      return Response.json({
        completed: true,
        image_url: imageUrl || null,
        error: imageUrl ? null : 'No image URL in result',
      });
    }

    if (status === 'error' || status === 'failed') {
      return Response.json({
        completed: true,
        error: pollData.error_message || pollData.message || 'Blend failed',
      });
    }

    return Response.json({
      completed: false,
      state: status,
      progress: pollData.progress || null,
    });

  } catch (error) {
    console.error('pollThumbnailBlend error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});