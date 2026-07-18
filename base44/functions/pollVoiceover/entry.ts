import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

async function saveVoiceover(base44, settings, projectId, audioUrl) {
  await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
    voiceover_url: audioUrl,
    voiceover_status: 'completed',
  });
  try {
    await base44.asServiceRole.entities.Projects.update(projectId, { voiceover_url: audioUrl });
  } catch (_) {
    // Projects may not expose this legacy field; ProductionSettings is canonical.
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = settingsList[0];
    if (!settings) return Response.json({ error: 'No production settings' }, { status: 404 });
    if (settings.voiceover_status === 'completed' && settings.voiceover_url) {
      return Response.json({ status: 'ready', voiceover_url: settings.voiceover_url });
    }

    const rawTaskId = settings.generation_task_id;
    if (!rawTaskId) return Response.json({ error: 'No task_id to poll' }, { status: 400 });
    const isMinimax = rawTaskId.startsWith('minimax:');
    const taskId = rawTaskId.replace(/^(minimax|ai33):/, '');

    if (isMinimax) {
      const key = Deno.env.get('MINIMAX_API_KEY');
      if (!key) return Response.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 });
      const response = await fetch(`https://api.minimax.io/v1/query/t2a_async_query_v2?task_id=${encodeURIComponent(taskId)}`, {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      });
      if (response.status === 404) return Response.json({ status: 'failed', error: 'MiniMax task not found' });
      if (!response.ok) return Response.json({ status: 'generating', message: `MiniMax returned ${response.status}` });

      const data = await response.json();
      if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
        return Response.json({ status: 'failed', error: data.base_resp?.status_msg || 'MiniMax task error' });
      }
      if (data.status !== 2 && !data.file_id) {
        return Response.json({ status: 'generating', task_status: data.status === 1 ? 'processing' : 'queued' });
      }
      if (!data.file_id) return Response.json({ status: 'generating', message: 'Audio ready; waiting for file' });

      const fileResponse = await fetch(`https://api.minimax.io/v1/files/retrieve?file_id=${encodeURIComponent(data.file_id)}`, {
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      });
      if (fileResponse.ok) {
        const fileData = await fileResponse.json();
        const audioUrl = fileData.file?.download_url || fileData.download_url || data.extra_info?.audio_url || data.audio_url;
        if (audioUrl) {
          await saveVoiceover(base44, settings, project_id, audioUrl);
          return Response.json({ status: 'ready', voiceover_url: audioUrl, duration: data.duration || null });
        }
      }
      return Response.json({ status: 'generating', message: 'Audio ready; preparing download URL' });
    }

    const key = Deno.env.get('AI33_API_KEY');
    if (!key) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    const response = await fetch(`https://api.ai33.pro/v1/task/${encodeURIComponent(taskId)}`, {
      headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
    });
    if (response.status === 404) return Response.json({ status: 'failed', error: 'AI33 task not found' });
    if (!response.ok) return Response.json({ status: 'generating', message: `AI33 returned ${response.status}` });

    const data = await response.json();
    const status = String(data.status || '').toLowerCase();
    if (status === 'done' || status === 'completed' || status === 'success') {
      const audioUrl = data.metadata?.audio_url || data.audio_url || JSON.stringify(data).match(/https?:\/\/[^"\\]+\.(?:mp3|wav|ogg)(?:\?[^"\\]*)?/i)?.[0];
      if (!audioUrl) return Response.json({ status: 'generating', message: 'Audio complete; waiting for URL' });
      await saveVoiceover(base44, settings, project_id, audioUrl);
      return Response.json({ status: 'ready', voiceover_url: audioUrl, srt_url: data.metadata?.srt_url || null });
    }
    if (status === 'error' || status === 'failed') {
      const error = data.error_message || data.error || 'AI33 TTS failed';
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
      return Response.json({ status: 'failed', error });
    }
    return Response.json({ status: 'generating', task_status: data.status });
  } catch (error) {
    console.error('pollVoiceover:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});