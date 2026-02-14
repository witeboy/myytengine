import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, track_id } = await req.json();

    const apiKey = Deno.env.get('AI33_API_KEY');
    if (!apiKey) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // Check task status via the working endpoint
    const response = await fetch(`https://api.ai33.pro/v1/task/${task_id}`, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Status check failed (${response.status}):`, errText);
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      }
      return Response.json({ status: 'FAILED', error: errText });
    }

    const data = await response.json();
    console.log('Task status response:', JSON.stringify(data));

    const taskStatus = data.status; // "pending", "processing", "done", "failed"

    // Audio URL can be at top-level or inside metadata
    const audioUrl = data.audio_url || data.result_url || data.url || 
                     data.output_url || data.metadata?.audio_url;

    if (taskStatus === 'done' && audioUrl && track_id) {
      // Download and upload to our storage
      const audioResp = await fetch(audioUrl);
      const audioBlob = await audioResp.blob();
      const file = new File([audioBlob], `music_${track_id}.mp3`, { type: 'audio/mpeg' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      const duration = data.metadata?.duration_seconds || data.duration_seconds || 30;

      await base44.asServiceRole.entities.MusicTracks.update(track_id, {
        audio_url: uploaded.file_url,
        status: 'completed',
        duration_seconds: duration,
      });

      return Response.json({ status: 'COMPLETED', audio_url: uploaded.file_url });
    }

    if (taskStatus === 'done' && !audioUrl) {
      console.error('Task done but no audio URL found in:', JSON.stringify(data));
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      }
      return Response.json({ status: 'FAILED', error: 'No audio URL in response' });
    }

    if (taskStatus === 'failed') {
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      }
      return Response.json({ status: 'FAILED' });
    }

    // Still processing
    return Response.json({ 
      status: 'PROCESSING',
      progress: data.progress || 0,
    });
  } catch (error) {
    console.error('checkMusicStatus error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});