import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { text, scene_id } = body;

    const minimaxKey = Deno.env.get('MINIMAX_API_KEY');
    if (!minimaxKey) {
      return Response.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 });
    }

    console.log('Generating sound effect with MiniMax T2A:', text);

    // Use MiniMax T2A with sound_effects voice modifier to generate ambient/foley sounds
    // We describe the sound effect as text and use voice effects to make it atmospheric
    const sfxText = `[Sound effect: ${text}]`;

    const response = await fetch('https://api.minimax.io/v1/t2a_v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${minimaxKey}`,
      },
      body: JSON.stringify({
        model: 'speech-2.8-hd',
        text: sfxText,
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
          channel: 1,
        },
        output_format: 'hex',
      }),
    });

    const data = await response.json();
    console.log('MiniMax T2A SFX response:', JSON.stringify(data.base_resp || {}));

    if (data.base_resp?.status_code === 0 && data.data?.audio) {
      const audioHex = data.data.audio;
      const bytes = new Uint8Array(audioHex.length / 2);
      for (let i = 0; i < audioHex.length; i += 2) {
        bytes[i / 2] = parseInt(audioHex.substr(i, 2), 16);
      }
      const file = new File([bytes], `sfx_${Date.now()}.mp3`, { type: 'audio/mpeg' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      // If scene_id provided, update the scene directly
      if (scene_id) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, {
          sound_effect_url: uploaded.file_url,
        });
      }

      return Response.json({
        success: true,
        audio_url: uploaded.file_url,
        provider: 'minimax',
      });
    }

    // If T2A failed, try using the music generation API as a fallback for atmospheric sounds
    console.log('T2A SFX failed, trying music generation for atmospheric SFX...');
    const musicResponse = await fetch('https://api.minimax.io/v1/music_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${minimaxKey}`,
      },
      body: JSON.stringify({
        model: 'music-2.5',
        prompt: `Sound effect: ${text}. Short ambient sound, no vocals, no lyrics, purely atmospheric foley sound.`,
        lyrics: "[Inst]\n[Outro]",
        output_format: 'hex',
        audio_setting: {
          sample_rate: 44100,
          bitrate: 128000,
          format: 'mp3'
        }
      }),
    });

    const musicData = await musicResponse.json();
    console.log('MiniMax music SFX response:', JSON.stringify(musicData.base_resp || {}));

    if (musicData.base_resp?.status_code === 0 && musicData.data?.audio) {
      const audioHex = musicData.data.audio;
      const bytes = new Uint8Array(audioHex.length / 2);
      for (let i = 0; i < audioHex.length; i += 2) {
        bytes[i / 2] = parseInt(audioHex.substr(i, 2), 16);
      }
      const file = new File([bytes], `sfx_${Date.now()}.mp3`, { type: 'audio/mpeg' });
      const uploaded = await base44.asServiceRole.integrations.Core.UploadFile({ file });

      if (scene_id) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, {
          sound_effect_url: uploaded.file_url,
        });
      }

      return Response.json({
        success: true,
        audio_url: uploaded.file_url,
        provider: 'minimax_music',
      });
    }

    const errMsg = data.base_resp?.status_msg || musicData.base_resp?.status_msg || 'Unknown error';
    return Response.json({ error: `MiniMax SFX error: ${errMsg}` }, { status: 500 });
  } catch (error) {
    console.error('generateSoundEffect error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});