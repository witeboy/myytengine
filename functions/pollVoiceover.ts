import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// POLL VOICEOVER — Correct AI33 endpoint
//
// Poll:     GET https://api.ai33.pro/v1/task/{task_id}
// Response: { id, status: "doing"|"done"|"error",
//             metadata: { audio_url, srt_url },
//             error_message }
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = settingsList[0];
    if (!settings) return Response.json({ error: 'No production settings' }, { status: 404 });

    const taskId = settings.generation_task_id;
    if (!taskId) return Response.json({ error: 'No task_id to poll' }, { status: 400 });

    // ── Poll AI33: GET /v1/task/{task_id} ───────────────────────
    const pollUrl = `https://api.ai33.pro/v1/task/${taskId}`;
    console.log(`🔍 Polling: ${pollUrl}`);

    const res = await fetch(pollUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': AI33_KEY,
      },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`Poll HTTP ${res.status}: ${errText.substring(0, 200)}`);

      if (res.status === 404) {
        return Response.json({ status: 'failed', error: 'Task not found (404)' });
      }
      // Server error — still processing, retry later
      return Response.json({ status: 'generating', message: `Server returned ${res.status}` });
    }

    const data = await res.json();
    const status = (data.status || '').toLowerCase();

    console.log(`📊 Task ${taskId}: status="${data.status}", has metadata=${!!data.metadata}`);

    // ── Status: done ────────────────────────────────────────────
    if (status === 'done') {
      const audioUrl = data.metadata?.audio_url;

      if (!audioUrl) {
        // Try to find URL anywhere in response
        const jsonStr = JSON.stringify(data);
        const urlMatch = jsonStr.match(/https?:\/\/[^"]+\.(mp3|wav|ogg)[^"]*/);
        if (urlMatch) {
          console.log(`✅ Done — found audio URL: ${urlMatch[0].substring(0, 80)}`);
          await saveVoiceover(base44, settings, project_id, urlMatch[0]);
          return Response.json({ status: 'ready', voiceover_url: urlMatch[0] });
        }
        console.warn(`⚠ Task done but no audio_url in: ${jsonStr.substring(0, 300)}`);
        return Response.json({ status: 'generating', message: 'Done but no audio URL yet' });
      }

      console.log(`✅ Done — audio: ${audioUrl.substring(0, 80)}`);
      await saveVoiceover(base44, settings, project_id, audioUrl);

      return Response.json({
        status: 'ready',
        voiceover_url: audioUrl,
        srt_url: data.metadata?.srt_url || null,
        credit_cost: data.credit_cost || null,
      });
    }

    // ── Status: error ───────────────────────────────────────────
    if (status === 'error' || status === 'failed') {
      const errMsg = data.error_message || data.error || 'TTS generation failed';
      console.log(`❌ Failed: ${errMsg}`);

      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'failed',
      });

      return Response.json({ status: 'failed', error: errMsg });
    }

    // ── Status: doing / processing / queued ─────────────────────
    console.log(`⏳ Still processing: "${data.status}"`);
    return Response.json({
      status: 'generating',
      task_status: data.status,
      task_id: taskId,
    });

  } catch (error) {
    console.error(`❌ pollVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ── Helper: save voiceover URL to DB ────────────────────────────
async function saveVoiceover(base44, settings, projectId, audioUrl) {
  await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
    voiceover_url: audioUrl,
    voiceover_status: 'completed',
  });

  try {
    await base44.asServiceRole.entities.Projects.update(projectId, {
      voiceover_url: audioUrl,
    });
  } catch (e) {
    console.warn('Could not update project voiceover_url:', e.message);
  }
}