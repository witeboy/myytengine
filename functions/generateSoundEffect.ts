import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { text, duration_seconds = null, prompt_influence = 0.3, loop = false } = body;

    const API_KEY = Deno.env.get('AI33_API_KEY');
    if (!API_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    // Call sound effect generation API
    const sfxResponse = await fetch('https://api.ai33.pro/v1/task/sound-effect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
      },
      body: JSON.stringify({
        text,
        duration_seconds,
        prompt_influence,
        loop,
        model_id: 'eleven_text_to_sound_v2',
      }),
    });

    if (!sfxResponse.ok) {
      const error = await sfxResponse.text();
      return Response.json({ error: `SFX API error: ${error}` }, { status: 500 });
    }

    const sfxData = await sfxResponse.json();

    return Response.json({
      success: true,
      task_id: sfxData.task_id,
      credits_remaining: sfxData.ec_remain_credits,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});