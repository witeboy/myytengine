import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id } = await req.json();

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    // Get AI33 API key
    const ai33Key = Deno.env.get('AI33_API_KEY');
    if (!ai33Key) {
      return Response.json({ error: 'AI33 API key not configured' }, { status: 500 });
    }

    // Get production settings
    const allSettings = await base44.asServiceRole.entities.ProductionSettings.list();
    const settings = allSettings.find(s => s.project_id === project_id);

    if (!settings || !settings.generation_task_id) {
      return Response.json({ error: 'No voiceover task found' }, { status: 404 });
    }

    // Check task status
    const statusResponse = await fetch(`https://api.ai33.pro/v1/common/get-task?task_id=${settings.generation_task_id}`, {
      method: 'GET',
      headers: {
        'xi-api-key': ai33Key,
      },
    });

    if (!statusResponse.ok) {
      const error = await statusResponse.text();
      return Response.json({ error: `AI33 error: ${error}` }, { status: 500 });
    }

    const taskStatus = await statusResponse.json();

    // Update production settings if task is done
    if (taskStatus.status === 'done' && taskStatus.metadata?.audio_url) {
      // Estimate duration from SRT if available
      let duration = 0;
      if (taskStatus.metadata?.srt_url) {
        try {
          const srtResponse = await fetch(taskStatus.metadata.srt_url);
          const srtText = await srtResponse.text();
          const lines = srtText.split('\n');
          for (const line of lines) {
            if (line.includes('-->')) {
              const timeMatch = line.match(/(\d+):(\d+):(\d+),(\d+)\s*-->/);
              if (timeMatch) {
                const h = parseInt(timeMatch[1]);
                const m = parseInt(timeMatch[2]);
                const s = parseInt(timeMatch[3]);
                duration = h * 3600 + m * 60 + s;
              }
            }
          }
        } catch (e) {
          // Fallback: estimate 2.5 chars per second
          duration = settings.voiceover_text?.length / 2.5 || 60;
        }
      }

      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'completed',
        voiceover_url: taskStatus.metadata.audio_url,
        total_duration_seconds: Math.round(duration * 10) / 10,
      });

      return Response.json({
        success: true,
        status: 'completed',
        audio_url: taskStatus.metadata.audio_url,
        duration: Math.round(duration * 10) / 10,
      });
    }

    if (taskStatus.status === 'failed' || taskStatus.error_message) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'failed',
      });

      return Response.json({
        success: false,
        status: 'failed',
        error: taskStatus.error_message,
      });
    }

    return Response.json({
      success: true,
      status: 'generating',
      task_id: settings.generation_task_id,
    });
  } catch (error) {
    console.error('Error checking voice status:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});