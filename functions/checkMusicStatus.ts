import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, track_id } = await req.json();

    const apiKey = Deno.env.get('AI33_API_KEY');
    if (!apiKey) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // Try multiple possible status endpoint patterns
    const urlsToTry = [
      `https://api.ai33.pro/v1/task/${task_id}`,
      `https://api.ai33.pro/v1/task/${task_id}/status`,
      `https://api.ai33.pro/v1/task/sound-effect/${task_id}`,
    ];

    let data = null;
    let lastError = '';

    for (const url of urlsToTry) {
      console.log('Trying status URL:', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'xi-api-key': apiKey },
      });

      console.log(`Response from ${url}: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        console.log('Content-Type:', contentType);

        if (contentType.includes('audio') || contentType.includes('octet-stream')) {
          // The endpoint returned audio directly
          const audioBlob = await response.blob();
          const file = new File([audioBlob], `music_${track_id || 'track'}.mp3`, { type: 'audio/mpeg' });
          const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

          if (track_id) {
            await base44.asServiceRole.entities.MusicTracks.update(track_id, {
              audio_url: uploaded.file_url,
              status: 'completed',
              duration_seconds: 30,
            });
          }
          return Response.json({ status: 'COMPLETED', audio_url: uploaded.file_url });
        }

        data = await response.json();
        console.log('Status JSON:', JSON.stringify(data));
        break;
      } else {
        lastError = await response.text();
        console.log(`Failed: ${lastError}`);
      }
    }

    if (!data) {
      console.error('All status endpoints failed. Last error:', lastError);
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      }
      return Response.json({ status: 'FAILED', error: 'Could not check task status' });
    }

    const status = data.status;

    // Check for direct audio URL in response
    const audioUrl = data.result_url || data.audio_url || data.url || data.output_url;

    if ((status === 'completed' || status === 'COMPLETED' || status === 'succeeded') && audioUrl && track_id) {
      const audioResp = await fetch(audioUrl);
      const audioBlob = await audioResp.blob();
      const file = new File([audioBlob], `music_${track_id}.mp3`, { type: 'audio/mpeg' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      await base44.asServiceRole.entities.MusicTracks.update(track_id, {
        audio_url: uploaded.file_url,
        status: 'completed',
        duration_seconds: data.duration_seconds || 30,
      });

      return Response.json({ status: 'COMPLETED', audio_url: uploaded.file_url });
    }

    if ((status === 'failed' || status === 'FAILED') && track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      return Response.json({ status: 'FAILED' });
    }

    return Response.json({
      status: status === 'completed' || status === 'succeeded' ? 'COMPLETED' :
             status === 'failed' ? 'FAILED' : 'PROCESSING'
    });
  } catch (error) {
    console.error('checkMusicStatus error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});