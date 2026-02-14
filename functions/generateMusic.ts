import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { track_id, prompt, duration_seconds } = await req.json();

    const apiKey = Deno.env.get('AI33_API_KEY');
    if (!apiKey) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // Call sound effect generation API
    const response = await fetch('https://api.ai33.pro/v1/task/sound-effect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: duration_seconds || 30,
        prompt_influence: 0.5,
        loop: true,
        model_id: 'eleven_text_to_sound_v2',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      }
      return Response.json({ error: `AI33 error: ${errText}` }, { status: 500 });
    }

    // Check content type to determine if we get audio directly or a task_id
    const contentType = response.headers.get('content-type') || '';
    console.log('AI33 response content-type:', contentType);

    if (contentType.includes('audio') || contentType.includes('octet-stream')) {
      // API returned audio directly - upload it
      const audioBlob = await response.blob();
      const file = new File([audioBlob], `music_${track_id || 'track'}.mp3`, { type: 'audio/mpeg' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, {
          audio_url: uploaded.file_url,
          status: 'completed',
          duration_seconds: duration_seconds || 30,
        });
      }

      return Response.json({
        success: true,
        status: 'completed',
        audio_url: uploaded.file_url,
      });
    }

    // Otherwise it returned JSON (possibly a task_id for async)
    const data = await response.json();
    console.log('AI33 JSON response:', JSON.stringify(data));

    // Check if there's a direct URL in the response
    if (data.audio_url || data.result_url || data.url) {
      const audioSrcUrl = data.audio_url || data.result_url || data.url;
      // Download and upload to our storage
      const audioResp = await fetch(audioSrcUrl);
      const audioBlob = await audioResp.blob();
      const file = new File([audioBlob], `music_${track_id || 'track'}.mp3`, { type: 'audio/mpeg' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, {
          audio_url: uploaded.file_url,
          status: 'completed',
          duration_seconds: data.duration_seconds || duration_seconds || 30,
        });
      }

      return Response.json({
        success: true,
        status: 'completed',
        audio_url: uploaded.file_url,
      });
    }

    // Async task mode - return task_id for polling
    if (data.task_id) {
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'generating' });
      }
      return Response.json({ success: true, status: 'pending', task_id: data.task_id });
    }

    // Unknown response
    console.log('Unexpected AI33 response structure:', JSON.stringify(data));
    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
    }
    return Response.json({ error: 'Unexpected API response', data }, { status: 500 });
  } catch (error) {
    console.error('generateMusic error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});