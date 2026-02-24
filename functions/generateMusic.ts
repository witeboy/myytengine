import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { track_id, prompt, duration_seconds } = await req.json();
    const minimaxKey = Deno.env.get('MINIMAX_API_KEY');

    if (!minimaxKey) {
      return Response.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 });
    }

    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'generating' });
    }

    // Use MiniMax Music Generation API
    console.log('Generating music with MiniMax...');
    console.log('Prompt:', prompt);

    const response = await fetch('https://api.minimaxi.chat/v1/music_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${minimaxKey}`,
      },
      body: JSON.stringify({
        model: 'music-01',
        refer_voice: prompt,
        refer_instrumental: prompt,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('MiniMax music error:', errText);
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      }
      return Response.json({ error: `MiniMax music error: ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    console.log('MiniMax music response keys:', Object.keys(data));

    // MiniMax returns audio data or a download URL
    const audioHexData = data.data?.audio;
    const audioUrl = data.audio_file || data.data?.audio_url || data.data?.url;

    if (audioHexData) {
      // Convert hex string to binary
      const bytes = new Uint8Array(audioHexData.length / 2);
      for (let i = 0; i < audioHexData.length; i += 2) {
        bytes[i / 2] = parseInt(audioHexData.substr(i, 2), 16);
      }
      const file = new File([bytes], `music_${track_id || 'track'}.mp3`, { type: 'audio/mpeg' });
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

    if (audioUrl) {
      const audioResp = await fetch(audioUrl);
      const audioBlob = await audioResp.blob();
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

    // Check for task_id (async mode)
    const taskId = data.task_id || data.id || data.data?.task_id;
    if (taskId) {
      return Response.json({ success: true, status: 'pending', task_id: taskId });
    }

    console.error('Unexpected MiniMax music response:', JSON.stringify(data));
    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
    }
    return Response.json({ error: 'Unexpected response from MiniMax', data }, { status: 500 });
  } catch (error) {
    console.error('generateMusic error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});