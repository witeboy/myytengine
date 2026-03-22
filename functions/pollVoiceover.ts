import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// POLL VOICEOVER — Routes to correct API based on task_id prefix
//
// minimax:{task_id} → poll api.minimax.io/v1/query/t2a_async_query_v2
// ai33:{task_id}    → poll api.ai33.pro/v1/task/{task_id}
// {task_id}         → legacy, assume AI33
// ══════════════════════════════════════════════════════════════════

async function uploadToR2(audioBytes, fileName) {
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
      secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
    },
  });
  await r2.send(new PutObjectCommand({
    Bucket: (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim(),
    Key: fileName,
    Body: audioBytes,
    ContentType: 'audio/mpeg',
  }));
  const publicUrl = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
  return `${publicUrl}/${fileName}`;
}

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

    // Already completed?
    if (settings.voiceover_status === 'completed' && settings.voiceover_url) {
      return Response.json({ status: 'ready', voiceover_url: settings.voiceover_url });
    }

    const rawTaskId = settings.generation_task_id;
    if (!rawTaskId) return Response.json({ error: 'No task_id to poll' }, { status: 400 });

    // ── Detect provider from prefix ─────────────────────────────
    const isMinimax = rawTaskId.startsWith('minimax:');
    const isAI33 = rawTaskId.startsWith('ai33:');
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
        if (res.status === 404) return Response.json({ status: 'failed', error: 'MiniMax task not found (404)' });
        return Response.json({ status: 'generating', message: `MiniMax returned ${res.status}` });
      }

      const data = await res.json();
      const mmStatus = data.status;

      console.log(`📊 MiniMax: status=${mmStatus}, file_id=${data.file_id || 'none'}, base_resp=${data.base_resp?.status_code}`);

      // Check for error
      if (data.base_resp?.status_code !== 0 && data.base_resp?.status_code !== undefined) {
        const errMsg = data.base_resp?.status_msg || 'MiniMax task error';
        console.log(`❌ MiniMax error: ${errMsg}`);
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
        return Response.json({ status: 'failed', error: errMsg });
      }

      // Status: done (status === 2 in MiniMax API)
      if (mmStatus === 2 || mmStatus === 'done' || data.file_id) {
        const fileId = data.file_id;
        if (!fileId) {
          return Response.json({ status: 'generating', message: 'Task done but no file_id yet' });
        }

        console.log(`📥 Downloading file: ${fileId}`);

        // Get the audio file
        const fileRes = await fetch(`https://api.minimax.io/v1/files/retrieve_content?file_id=${fileId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${MINIMAX_KEY}` },
        });

        if (!fileRes.ok) {
          console.warn(`File retrieve HTTP ${fileRes.status}`);
          return Response.json({ status: 'generating', message: 'File not downloadable yet' });
        }

        // Upload audio to R2
        const audioBytes = new Uint8Array(await fileRes.arrayBuffer());
        const fileName = `voiceover/${project_id}_mm_${Date.now()}.mp3`;
        const voiceoverUrl = await uploadToR2(audioBytes, fileName);

        console.log(`✅ MiniMax done: ${(audioBytes.length / 1024 / 1024).toFixed(1)} MB → ${voiceoverUrl}`);

        await saveVoiceover(base44, settings, project_id, voiceoverUrl);

        return Response.json({
          status: 'ready',
          voiceover_url: voiceoverUrl,
          duration: data.duration || null,
        });
      }

      // Status: processing (status === 1)
      if (mmStatus === 1 || mmStatus === 'processing' || mmStatus === 'running') {
        return Response.json({
          status: 'generating',
          task_status: mmStatus,
          progress: data.progress || null,
        });
      }

      // Status: queued (status === 0)
      return Response.json({
        status: 'generating',
        task_status: mmStatus,
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
      const errText = await res.text().catch(() => '');
      console.warn(`AI33 poll HTTP ${res.status}: ${errText.substring(0, 200)}`);
      if (res.status === 404) return Response.json({ status: 'failed', error: 'AI33 task not found (404)' });
      return Response.json({ status: 'generating', message: `AI33 returned ${res.status}` });
    }

    const data = await res.json();
    const status = (data.status || '').toLowerCase();

    console.log(`📊 AI33: status="${data.status}", has_metadata=${!!data.metadata}`);

    // ── done ────────────────────────────────────────────────────
    if (status === 'done') {
      const audioUrl = data.metadata?.audio_url;

      if (!audioUrl) {
        // Try to find URL anywhere in response
        const jsonStr = JSON.stringify(data);
        const urlMatch = jsonStr.match(/https?:\/\/[^"]+\.(mp3|wav|ogg)[^"]*/);
        if (urlMatch) {
          await saveVoiceover(base44, settings, project_id, urlMatch[0]);
          return Response.json({ status: 'ready', voiceover_url: urlMatch[0] });
        }
        console.warn(`⚠ Done but no audio_url: ${jsonStr.substring(0, 300)}`);
        return Response.json({ status: 'generating', message: 'Done but no audio URL yet' });
      }

      console.log(`✅ AI33 done: ${audioUrl.substring(0, 80)}`);
      await saveVoiceover(base44, settings, project_id, audioUrl);

      return Response.json({
        status: 'ready',
        voiceover_url: audioUrl,
        srt_url: data.metadata?.srt_url || null,
        credit_cost: data.credit_cost || null,
      });
    }

    // ── error ───────────────────────────────────────────────────
    if (status === 'error' || status === 'failed') {
      const errMsg = data.error_message || data.error || 'AI33 TTS generation failed';
      console.log(`❌ AI33 failed: ${errMsg}`);
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
      return Response.json({ status: 'failed', error: errMsg });
    }

    // ── doing / processing ──────────────────────────────────────
    console.log(`⏳ AI33 still: "${data.status}"`);
    return Response.json({
      status: 'generating',
      task_status: data.status,
    });

  } catch (error) {
    console.error(`❌ pollVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});