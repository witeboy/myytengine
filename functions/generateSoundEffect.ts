import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { text, duration_seconds = null, prompt_influence = 0.3, loop = false } = body;

    const minimaxKey = Deno.env.get('MINIMAX_API_KEY');
    if (!minimaxKey) {
      return Response.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 });
    }

    // Use MiniMax T2A for sound effect generation
    console.log('Generating sound effect with MiniMax:', text);

    const response = await fetch('https://api.minimaxi.chat/v1/t2a_v2?GroupId=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${minimaxKey}`,
      },
      body: JSON.stringify({
        model: 'speech-02-hd',
        text: `[Sound effect: ${text}]`,
        stream: false,
        voice_setting: {
          voice_id: 'English_expressive_narrator',
          speed: 1.0,
          vol: 1.0,
          pitch: 0,
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('MiniMax SFX error:', errText);
      // Fallback to AI33
      const ai33Key = Deno.env.get('AI33_API_KEY');
      if (ai33Key) {
        console.log('Falling back to AI33 for SFX...');
        const sfxResponse = await fetch('https://api.ai33.pro/v1/task/sound-effect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': ai33Key,
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
          provider: 'ai33',
        });
      }
      return Response.json({ error: `MiniMax SFX error: ${errText}` }, { status: 500 });
    }

    const data = await response.json();
    const audioHex = data.data?.audio;

    if (audioHex) {
      const bytes = new Uint8Array(audioHex.length / 2);
      for (let i = 0; i < audioHex.length; i += 2) {
        bytes[i / 2] = parseInt(audioHex.substr(i, 2), 16);
      }
      const file = new File([bytes], `sfx_${Date.now()}.mp3`, { type: 'audio/mpeg' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      return Response.json({
        success: true,
        audio_url: uploaded.file_url,
        provider: 'minimax',
      });
    }

    // Fallback to AI33
    const ai33Key = Deno.env.get('AI33_API_KEY');
    if (ai33Key) {
      console.log('MiniMax returned no audio, falling back to AI33...');
      const sfxResponse = await fetch('https://api.ai33.pro/v1/task/sound-effect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ai33Key,
        },
        body: JSON.stringify({
          text,
          duration_seconds,
          prompt_influence,
          loop,
          model_id: 'eleven_text_to_sound_v2',
        }),
      });

      if (sfxResponse.ok) {
        const sfxData = await sfxResponse.json();
        return Response.json({
          success: true,
          task_id: sfxData.task_id,
          provider: 'ai33',
        });
      }
    }

    return Response.json({ error: 'Could not generate sound effect' }, { status: 500 });
  } catch (error) {
    console.error('generateSoundEffect error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});