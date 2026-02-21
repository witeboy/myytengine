import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const AI33_BASE = 'https://api.ai33.pro';

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

    const API_KEY = Deno.env.get('AI33_API_KEY');
    if (!API_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    // Poll AI33 task status
    const res = await fetch(`${AI33_BASE}/v1/task/${task_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
      },
    });

    if (!res.ok) {
      const error = await res.text();
      return Response.json({ error: `Status API error: ${error}` }, { status: 500 });
    }

    const taskData = await res.json();

    if (taskData.status === 'done' && taskData.metadata?.audio_url) {
      // Update ProductionSettings
      const settings = await base44.entities.ProductionSettings.filter({ project_id });
      if (settings.length > 0) {
        await base44.entities.ProductionSettings.update(settings[0].id, {
          voiceover_url: taskData.metadata.audio_url,
          voiceover_status: 'completed',
        });
      }

      return Response.json({
        success: true,
        status: 'done',
        audio_url: taskData.metadata.audio_url,
        srt_url: taskData.metadata.srt_url || null,
        error_message: null,
      });
    }

    if (taskData.status === 'failed' || taskData.status === 'error') {
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
        error_message: taskData.error_message || 'Voiceover generation failed',
      });
    }

    // Still in progress
    return Response.json({
      success: true,
      status: taskData.status || 'generating',
      audio_url: null,
      error_message: null,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});