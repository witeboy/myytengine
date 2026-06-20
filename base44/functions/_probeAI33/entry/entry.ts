import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const AI33_KEY = (Deno.env.get('AI33_API_KEY') || '').trim();
    const h = { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY };

    const out = {};

    // 1. Read endpoint — confirms key is valid / account funded
    try {
      const res = await fetch('https://api.ai33.pro/v1m/common/config', { headers: h });
      out.config = { status: res.status, body: (await res.text()).substring(0, 200) };
    } catch (e) { out.config = { error: e.message }; }

    // 2. Actual TTS submit — the real generation path
    try {
      const res = await fetch('https://api.ai33.pro/v1m/task/text-to-speech', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          text: 'Hello, this is a test message for text-to-speech conversion.',
          model: 'speech-2.6-hd',
          voice_setting: { voice_id: '209533299589184', vol: 1, pitch: 0, speed: 1 },
          language_boost: 'Auto',
        }),
      });
      out.tts = { status: res.status, body: (await res.text()).substring(0, 250) };
    } catch (e) { out.tts = { error: e.message }; }

    return Response.json({ keyPrefix: AI33_KEY.substring(0, 5), keyLen: AI33_KEY.length, ...out });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});