import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed
// Generate a short TTS preview for a voice — all via AI33 proxy

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { voice_id, provider } = await req.json();
    if (!voice_id) return Response.json({ error: 'Missing voice_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    const previewText = "In a world where stories shape reality, every voice carries the power to transform silence into something unforgettable.";
    const headers = { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY };

    let submitUrl, submitBody;


    // ── MiniMax Direct — sync TTS, instant preview ──────────────
    if (provider === 'minimax_direct') {
      const MINIMAX_KEY = Deno.env.get('MINIMAX_API_KEY');
      if (!MINIMAX_KEY) return Response.json({ error: 'MINIMAX_API_KEY not configured' }, { status: 500 });

      try {
        const res = await fetch('https://api.minimax.io/v1/t2a_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MINIMAX_KEY}`,
          },
          body: JSON.stringify({
            model: 'speech-2.8-hd',
            text: previewText,
            stream: false,
            voice_setting: { voice_id, speed: 1.0, vol: 1.0, pitch: 0 },
            audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
            output_format: 'url',
          }),
        });

        const data = await res.json();

        if (data.base_resp?.status_code === 0) {
          const audioUrl = data.data?.audio_url || data.data?.audio;
          if (audioUrl) {
            return Response.json({ success: true, preview_url: audioUrl, voice_id });
          }
        }

        // If url format didn't work, try hex format and upload
        const res2 = await fetch('https://api.minimax.io/v1/t2a_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MINIMAX_KEY}`,
          },
          body: JSON.stringify({
            model: 'speech-2.8-hd',
            text: previewText,
            stream: false,
            voice_setting: { voice_id, speed: 1.0, vol: 1.0, pitch: 0 },
            audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
            output_format: 'hex',
          }),
        });

        const data2 = await res2.json();
        if (data2.base_resp?.status_code === 0 && data2.data?.audio) {
          const audioHex = data2.data.audio;
          const bytes = new Uint8Array(audioHex.length / 2);
          for (let i = 0; i < audioHex.length; i += 2) {
            bytes[i / 2] = parseInt(audioHex.substr(i, 2), 16);
          }
          const blob = new Blob([bytes], { type: 'audio/mpeg' });
          const base64 = btoa(String.fromCharCode(...bytes.slice(0, 500000)));
          // Return as data URL for short preview
          return Response.json({
            success: true,
            preview_url: `data:audio/mpeg;base64,${btoa(String.fromCharCode.apply(null, bytes))}`,
            voice_id,
          });
        }

        throw new Error(`MiniMax preview failed: ${data.base_resp?.status_msg || 'unknown'}`);
      } catch (err) {
        console.warn('MiniMax Direct preview failed, falling back to AI33:', err.message);
        // Fall through to AI33 path below
      }
    }

    if (provider === 'minimax') {
      submitUrl = 'https://api.ai33.pro/v1m/task/text-to-speech';
      submitBody = JSON.stringify({
        text: previewText,
        model: 'speech-2.6-hd',
        voice_setting: { voice_id, vol: 1, pitch: 0, speed: 1 },
        language_boost: 'Auto',
      });
    } else {
      submitUrl = `https://api.ai33.pro/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`;
      submitBody = JSON.stringify({
        text: previewText,
        model_id: 'eleven_multilingual_v2',
      });
    }

    const submitRes = await fetch(submitUrl, { method: 'POST', headers, body: submitBody });
    const submitData = await submitRes.json();
    if (!submitData.success || !submitData.task_id) {
      throw new Error(`TTS submit failed: ${JSON.stringify(submitData).substring(0, 200)}`);
    }

    // Poll for result
    for (let i = 0; i < MAX_POLLS; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      const pollRes = await fetch(`https://api.ai33.pro/v1/task/${submitData.task_id}`, { headers });
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();

      if (pollData.status === 'done' && pollData.metadata?.audio_url) {
        return Response.json({
          success: true,
          preview_url: pollData.metadata.audio_url,
          voice_id,
        });
      }
      if (pollData.status === 'error' || pollData.status === 'failed') {
        throw new Error(pollData.error_message || 'Preview generation failed');
      }
    }

    throw new Error('Preview timed out');
  } catch (error) {
    console.error('previewVoice error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});