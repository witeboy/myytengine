import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { track_id, prompt, duration_seconds } = await req.json();

    const apiKey = Deno.env.get('AI33_API_KEY');
    if (!apiKey) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // Use AI33 sound generation endpoint for music
    const response = await fetch('https://api.ai33.pro/v1/task/sound-effect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: duration_seconds || 30,
        prompt_influence: 0.5,
        loop: true,
        model_id: 'eleven_text_to_sound_v2',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json({ error: `AI33 error: ${errText}` }, { status: 500 });
    }

    const data = await response.json();

    if (track_id && data.task_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, {
        status: 'generating',
      });
    }

    return Response.json({
      success: true,
      task_id: data.task_id,
    });
  } catch (error) {
    console.error('generateMusic error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});