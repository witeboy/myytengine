import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, track_id } = await req.json();

    const apiKey = Deno.env.get('KIE_API_KEY');
    if (!apiKey) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    // Check task status via KIE Suno get-music-details endpoint
    const response = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${task_id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`KIE status check failed (${response.status}):`, errText);
      return Response.json({ status: 'PROCESSING', error: errText });
    }

    const data = await response.json();
    console.log('KIE task status:', JSON.stringify(data));

    if (data.code !== 200) {
      return Response.json({ status: 'PROCESSING', msg: data.msg });
    }

    const taskData = data.data;
    const status = taskData?.status;

    // KIE statuses: PENDING, TEXT_SUCCESS, FIRST_SUCCESS, SUCCESS, CREATE_TASK_FAILED, GENERATE_AUDIO_FAILED, etc.
    const isSuccess = status === 'SUCCESS' || status === 'FIRST_SUCCESS';
    const isFailed = status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED' || 
                     status === 'CALLBACK_EXCEPTION' || status === 'SENSITIVE_WORD_ERROR';

    if (isSuccess) {
      // Extract audio from sunoData array
      const sunoData = taskData?.response?.sunoData;
      if (!sunoData || sunoData.length === 0) {
        console.error('SUCCESS but no sunoData found');
        if (track_id) {
          await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
        }
        return Response.json({ status: 'FAILED', error: 'No audio data in response' });
      }

      // Take the first track - prefer audioUrl, fall back to streamAudioUrl
      const track = sunoData[0];
      const audioUrl = (track.audioUrl && track.audioUrl.startsWith('http') ? track.audioUrl : null) 
                    || (track.streamAudioUrl && track.streamAudioUrl.startsWith('http') ? track.streamAudioUrl : null)
                    || (track.sourceAudioUrl && track.sourceAudioUrl.startsWith('http') ? track.sourceAudioUrl : null);
      const duration = track.duration || 0;

      if (!audioUrl) {
        console.error('No audioUrl in sunoData:', JSON.stringify(track));
        if (track_id) {
          await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
        }
        return Response.json({ status: 'FAILED', error: 'No audio URL' });
      }

      if (track_id) {
        // Download and re-upload to our storage
        const audioResp = await fetch(audioUrl);
        const audioBlob = await audioResp.blob();
        const file = new File([audioBlob], `music_${track_id}.mp3`, { type: 'audio/mpeg' });
        const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

        await base44.asServiceRole.entities.MusicTracks.update(track_id, {
          audio_url: uploaded.file_url,
          status: 'completed',
          duration_seconds: Math.round(duration) || 120,
        });

        return Response.json({ status: 'COMPLETED', audio_url: uploaded.file_url, duration });
      }

      return Response.json({ status: 'COMPLETED', audio_url: audioUrl, duration });
    }

    if (isFailed) {
      const errMsg = taskData?.errorMessage || status;
      console.error('KIE task failed:', errMsg);
      if (track_id) {
        await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
      }
      return Response.json({ status: 'FAILED', error: errMsg });
    }

    // Still processing (PENDING, TEXT_SUCCESS, etc.)
    return Response.json({ status: 'PROCESSING', kieStatus: status });

  } catch (error) {
    console.error('checkMusicStatus error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});