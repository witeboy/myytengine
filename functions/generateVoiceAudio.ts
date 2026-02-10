import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, voice_id, script_text } = await req.json();

    if (!project_id || !voice_id || !script_text) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get API key
    const ai33Key = Deno.env.get('AI33_API_KEY');
    if (!ai33Key) {
      return Response.json({ error: 'AI33 API key not configured' }, { status: 500 });
    }

    // Call AI33 API to generate voiceover
    const ttsResponse = await fetch(`https://api.ai33.pro/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': ai33Key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: script_text,
        model_id: 'eleven_multilingual_v2',
        with_transcript: false,
      }),
    });

    if (!ttsResponse.ok) {
      const error = await ttsResponse.text();
      return Response.json({ error: `AI33 error: ${error}` }, { status: 500 });
    }

    const taskData = await ttsResponse.json();

    if (!taskData.success || !taskData.task_id) {
      return Response.json({ error: 'Failed to create TTS task' }, { status: 500 });
    }

    // Update production settings with task info
    const existingSettings = await base44.asServiceRole.entities.ProductionSettings.list();
    const settings = existingSettings.find(s => s.project_id === project_id);

    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        selected_voice_id: voice_id,
        voiceover_status: 'generating',
        generation_task_id: taskData.task_id,
      });
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({
        project_id,
        selected_voice_id: voice_id,
        voiceover_status: 'generating',
        generation_task_id: taskData.task_id,
      });
    }

    return Response.json({
      success: true,
      task_id: taskData.task_id,
    });
  } catch (error) {
    console.error('Error generating voice audio:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});