import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    const body = JSON.stringify({
      text: 'Hello test',
      model: 'speech-2.6-hd',
      voice_setting: { voice_id: '209533299589184', vol: 1, pitch: 0, speed: 1 },
      language_boost: 'Auto',
    });
    const h = { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY };
    const tests = [
      ['POST', 'https://api.ai33.pro/v3/task/text-to-speech', body],
      ['POST', 'https://api.ai33.pro/v3/minimax/task/text-to-speech', body],
      ['POST', 'https://api.ai33.pro/v3m/text-to-speech', body],
      ['POST', 'https://api.ai33.pro/v3/text-to-speech/209533299589184', body],
      ['GET', 'https://api.ai33.pro/v3/common/config', null],
      ['GET', 'https://api.ai33.pro/v3m/common/config', null],
      ['POST', 'https://api.ai33.pro/v1m/task/text-to-speech-v3', body],
      ['POST', 'https://api.ai33.pro/v3/tts', body],
    ];
    const out = [];
    for (const [method, url, b] of tests) {
      try {
        const res = await fetch(url, { method, headers: h, ...(b ? { body: b } : {}) });
        out.push({ url, method, status: res.status, body: (await res.text()).substring(0, 140) });
      } catch (e) { out.push({ url, method, error: e.message }); }
    }
    return Response.json(out);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});