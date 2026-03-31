import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed
// ══════════════════════════════════════════════════════════════════
// POLL VOICEOVER — Lightweight, no S3
//
// minimax:{task_id} → poll api.minimax.io, get download URL directly
// ai33:{task_id}    → poll api.ai33.pro, get audio_url from metadata
// {task_id}         → legacy, assume AI33
//
// MiniMax download URLs valid for 9 hours.
// ══════════════════════════════════════════════════════════════════

async function saveVoiceover(base44, settings, projectId, audioUrl) {
  await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
    voiceover_url: audioUrl,
    voiceover_status: 'completed',
  });
  try {
    await base44.asServiceRole.entities.Projects.update(projectId, { voiceover_url: audioUrl });
  } catch (e) {}
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    // ── Load settings ───────────────────────────────────────────
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

    // ════════════════════════════════════════════════════════════
    // MINIMAX DIRECT ASYNC POLL
    // ════════════════════════════════════════════════════════════
    if (isMinimax) {
      const MINIMAX_KEY = Deno.env.get('MINIMAX_API_KEY');
      if (!MINIMAX_KEY) return Response.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 });

      const pollUrl = `https://api.minimax.io/v1/query/t2a_async_query_v2?task_id=${taskId}`;
      console.log(`🔍 MiniMax poll: ${taskId}`);

      const res = await fetch(pollUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${MINIMAX_KEY}`, 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        console.warn(`MiniMax poll HTTP ${res.status}`);
        if (res.status === 404) return Response.json({ status: 'failed', error: 'MiniMax task not found' });
        return Response.json({ status: 'generating', message: `MiniMax returned ${res.status}` });
      }

      const data = await res.json();
      console.log(`📊 MiniMax: status=${data.status}, file_id=${data.file_id || 'none'}, base_resp=${data.base_resp?.status_code}`);

      // Error check
      if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
        const errMsg = data.base_resp?.status_msg || 'MiniMax task error';
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
        return Response.json({ status: 'failed', error: errMsg });
      }

      // Done (status === 2)
      if (data.status === 2 || data.file_id) {
        const fileId = data.file_id;
        if (!fileId) {
          return Response.json({ status: 'generating', message: 'Done but no file_id yet' });
        }

        // Get download URL from MiniMax file API
        console.log(`📥 Getting download URL for file: ${fileId}`);

        const fileRes = await fetch(`https://api.minimax.io/v1/files/retrieve?file_id=${fileId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${MINIMAX_KEY}`, 'Content-Type': 'application/json' },
        });

        if (fileRes.ok) {
          const fileData = await fileRes.json();
          const downloadUrl = fileData.file?.download_url || fileData.download_url;

          if (downloadUrl) {
            console.log(`✅ MiniMax done: ${downloadUrl.substring(0, 80)}`);
            await saveVoiceover(base44, settings, project_id, downloadUrl);
            return Response.json({
              status: 'ready',
              voiceover_url: downloadUrl,
              duration: data.duration || null,
            });
          }
        }

        // Fallback: try retrieve_content which returns the actual audio
        // Build a direct URL the user can access
        const directUrl = `https://api.minimax.io/v1/files/retrieve_content?file_id=${fileId}`;
        console.log(`⚠ No download_url, using direct file URL`);

        // We can't use this directly (needs auth header), so try one more thing:
        // Some MiniMax responses include audio_url or extra_info with URL
        const extraUrl = data.extra_info?.audio_url || data.audio_url;
        if (extraUrl) {
          console.log(`✅ MiniMax done (extra_info): ${extraUrl.substring(0, 80)}`);
          await saveVoiceover(base44, settings, project_id, extraUrl);
          return Response.json({ status: 'ready', voiceover_url: extraUrl });
        }

        // Last resort: mark as needing manual download
        console.warn(`⚠ MiniMax file_id=${fileId} but cannot get public URL`);
        return Response.json({
          status: 'generating',
          message: 'Audio ready but getting download URL...',
          file_id: fileId,
        });
      }

      // Processing (status === 1)
      return Response.json({
        status: 'generating',
        task_status: data.status === 1 ? 'processing' : data.status === 0 ? 'queued' : data.status,
      });
    }

    // ════════════════════════════════════════════════════════════
    // AI33 PRO ASYNC POLL
    // ════════════════════════════════════════════════════════════
    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    const pollUrl = `https://api.ai33.pro/v1/task/${taskId}`;
    console.log(`🔍 AI33 poll: ${taskId}`);

    const res = await fetch(pollUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
    });

    if (!res.ok) {
      console.warn(`AI33 poll HTTP ${res.status}`);
      if (res.status === 404) return Response.json({ status: 'failed', error: 'AI33 task not found (404)' });
      return Response.json({ status: 'generating', message: `AI33 returned ${res.status}` });
    }

    const data = await res.json();
    const status = (data.status || '').toLowerCase();
    console.log(`📊 AI33: status="${data.status}", has_metadata=${!!data.metadata}`);

    if (status === 'done') {
      const audioUrl = data.metadata?.audio_url;
      if (!audioUrl) {
        const jsonStr = JSON.stringify(data);
        const urlMatch = jsonStr.match(/https?:\/\/[^"]+\.(mp3|wav|ogg)[^"]*/);
        if (urlMatch) {
          await saveVoiceover(base44, settings, project_id, urlMatch[0]);
          return Response.json({ status: 'ready', voiceover_url: urlMatch[0] });
        }
        return Response.json({ status: 'generating', message: 'Done but no audio URL yet' });
      }

      console.log(`✅ AI33 done: ${audioUrl.substring(0, 80)}`);
      await saveVoiceover(base44, settings, project_id, audioUrl);
      return Response.json({
        status: 'ready',
        voiceover_url: audioUrl,
        srt_url: data.metadata?.srt_url || null,
      });
    }

    if (status === 'error' || status === 'failed') {
      const errMsg = data.error_message || data.error || 'AI33 TTS failed';
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
      return Response.json({ status: 'failed', error: errMsg });
    }

    return Response.json({ status: 'generating', task_status: data.status });

  } catch (error) {
    console.error(`❌ pollVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});