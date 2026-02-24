import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Generate a short TTS preview for a voice using MiniMax or AI33

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { voice_id, provider } = await req.json();
    if (!voice_id) return Response.json({ error: 'Missing voice_id' }, { status: 400 });

    const previewText = "In a world where stories shape reality, every voice carries the power to transform silence into something unforgettable.";

    const useMinimax = (provider === 'minimax' || !provider) && Deno.env.get('MINIMAX_API_KEY');
    const AI33_KEY = Deno.env.get('AI33_API_KEY');

    let audioBytes = null;

    if (useMinimax) {
      const MINIMAX_KEY = Deno.env.get('MINIMAX_API_KEY');
      const res = await fetch('https://api.minimax.io/v1/t2a_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MINIMAX_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'speech-2.8-hd',
          text: previewText,
          stream: false,
          voice_setting: {
            voice_id: voice_id,
            speed: 1,
            vol: 1,
            pitch: 0,
          },
          audio_setting: {
            sample_rate: 32000,
            bitrate: 128000,
            format: 'mp3',
            channel: 1,
          },
          language_boost: 'auto',
          output_format: 'hex',
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`MiniMax TTS HTTP ${res.status}: ${errText.substring(0, 200)}`);
      }

      const data = await res.json();
      if (data.base_resp?.status_code !== 0) {
        throw new Error(`MiniMax TTS error: ${data.base_resp?.status_msg || 'Unknown'}`);
      }

      if (!data.data?.audio) {
        throw new Error('MiniMax TTS: no audio data returned');
      }

      // Convert hex to bytes
      const hex = data.data.audio;
      audioBytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < hex.length; i += 2) {
        audioBytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
      }
    } else if (AI33_KEY && provider === 'ai33') {
      // AI33 direct TTS
      const res = await fetch(`https://api.ai33.pro/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': AI33_KEY,
        },
        body: JSON.stringify({
          text: previewText,
          model_id: 'eleven_multilingual_v2',
        }),
      });

      const data = await res.json();
      if (!data.success || !data.task_id) {
        throw new Error(`AI33 TTS failed: ${JSON.stringify(data)}`);
      }

      // Poll for result
      for (let i = 0; i < 30; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 3000));
        const pollRes = await fetch(`https://api.ai33.pro/v1/task/${data.task_id}`, {
          headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
        });
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();
        if (pollData.status === 'done' && pollData.metadata?.audio_url) {
          const audioRes = await fetch(pollData.metadata.audio_url);
          audioBytes = new Uint8Array(await audioRes.arrayBuffer());
          break;
        }
        if (pollData.status === 'failed') throw new Error('AI33 TTS failed');
      }
    } else {
      return Response.json({ error: 'No TTS provider available for this voice' }, { status: 400 });
    }

    if (!audioBytes) {
      return Response.json({ error: 'Failed to generate preview audio' }, { status: 500 });
    }

    // Upload to Base44 storage
    const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
    const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new File([audioBlob], `preview_${voice_id}.mp3`, { type: 'audio/mpeg' }),
    });

    return Response.json({
      success: true,
      preview_url: uploadResult.file_url,
      voice_id,
    });
  } catch (error) {
    console.error('previewVoice error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});