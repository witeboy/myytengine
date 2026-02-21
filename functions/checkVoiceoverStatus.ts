import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { task_id, project_id } = body;

    const API_KEY = Deno.env.get('AI33_API_KEY');
    if (!API_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    // Poll task status
    const statusResponse = await fetch(`https://api.ai33.pro/v1/task/${task_id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
      },
    });

    if (!statusResponse.ok) {
      const error = await statusResponse.text();
      return Response.json({ error: `Status API error: ${error}` }, { status: 500 });
    }

    const taskData = await statusResponse.json();

    // Update ProductionSettings with status (not Projects — those fields don't exist there)
    if (taskData.status === 'done' && taskData.metadata?.audio_url) {
      const settings = await base44.entities.ProductionSettings.filter({ project_id });
      if (settings.length > 0) {
        await base44.entities.ProductionSettings.update(settings[0].id, {
          voiceover_url: taskData.metadata.audio_url,
          voiceover_status: 'completed',
        });
      }
    } else if (taskData.status === 'failed') {
      const settings = await base44.entities.ProductionSettings.filter({ project_id });
      if (settings.length > 0) {
        await base44.entities.ProductionSettings.update(settings[0].id, {
          voiceover_status: 'failed',
        });
      }
    }

    return Response.json({
      success: true,
      status: taskData.status,
      audio_url: taskData.metadata?.audio_url || null,
      transcript_url: taskData.metadata?.srt_url || null,
      error_message: taskData.error_message || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});