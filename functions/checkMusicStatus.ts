import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, track_id } = await req.json();

    const apiKey = Deno.env.get('AI33_API_KEY');
    if (!apiKey) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    const response = await fetch(`https://api.ai33.pro/v1/task/${task_id}/status`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const errText = await response.text();
      // If task not found (404), mark as failed instead of crashing
      if (response.status === 404 && track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
        return Response.json({ status: 'FAILED', error: 'Task not found' });
      }
      return Response.json({ error: `AI33 status error: ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    const status = data.status; // e.g. "pending", "processing", "completed", "failed"

    if (status === 'completed' && data.result_url && track_id) {
      // Upload the audio to our storage for permanence
      const audioResp = await fetch(data.result_url);
      const audioBlob = await audioResp.blob();
      const file = new File([audioBlob], `music_${track_id}.mp3`, { type: 'audio/mpeg' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      await base44.asServiceRole.entities.MusicTracks.update(track_id, {
        audio_url: uploaded.file_url,
        status: 'completed',
        duration_seconds: data.duration_seconds || 30,
      });

      return Response.json({ status: 'completed', audio_url: uploaded.file_url });
    }

    if (status === 'failed' && track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
    }

    return Response.json({ status: status === 'completed' ? 'COMPLETED' : status === 'failed' ? 'FAILED' : 'PROCESSING' });
  } catch (error) {
    console.error('checkMusicStatus error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});