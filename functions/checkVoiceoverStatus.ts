import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { task_id, project_id } = body;

    if (!task_id || !project_id) {
      return Response.json({ error: 'Missing task_id or project_id' }, { status: 400 });
    }

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) {
      return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });
    }

    // Poll Kie task status
    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${task_id}`, {
      headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
    });

    if (!res.ok) {
      const error = await res.text();
      return Response.json({ error: `Status API error: ${error}` }, { status: 500 });
    }

    const data = await res.json();

    if (data.code !== 200) {
      return Response.json({
        success: true,
        status: 'generating',
        audio_url: null,
        error_message: data.message || null,
      });
    }

    const { state, resultJson, failMsg } = data.data;

    if (state === 'success') {
      const result = JSON.parse(resultJson);
      const audioUrl = result.resultUrls?.[0] || result.url || null;

      // Update ProductionSettings
      const settings = await base44.entities.ProductionSettings.filter({ project_id });
      if (settings.length > 0) {
        await base44.entities.ProductionSettings.update(settings[0].id, {
          voiceover_url: audioUrl,
          voiceover_status: 'completed',
        });
      }

      return Response.json({
        success: true,
        status: 'done',
        audio_url: audioUrl,
        error_message: null,
      });
    }

    if (state === 'fail') {
      const settings = await base44.entities.ProductionSettings.filter({ project_id });
      if (settings.length > 0) {
        await base44.entities.ProductionSettings.update(settings[0].id, {
          voiceover_status: 'failed',
        });
      }

      return Response.json({
        success: true,
        status: 'failed',
        audio_url: null,
        error_message: failMsg || 'Voiceover generation failed',
      });
    }

    // Still in progress (waiting/queuing/generating)
    return Response.json({
      success: true,
      status: 'generating',
      audio_url: null,
      error_message: null,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});