import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v2 — redeployed
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const AI33_KEY = Deno.env.get('AI33_API_KEY');
  let body = {};
  try { body = await req.json(); } catch (_) {}
  const { voice_id, provider } = body;

  // Test 1: ElevenLabs endpoint
  if (provider === 'elevenlabs') {
    const url = `https://api.ai33.pro/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
      body: JSON.stringify({
        text: 'Hello, this is a test of the voiceover system.',
        model_id: 'eleven_multilingual_v2',
      }),
    });
    const data = await res.json();
    return Response.json({ provider: 'elevenlabs', status: res.status, response: data });
  }

  // Test 2: MiniMax endpoint
  if (provider === 'minimax') {
    const url = 'https://api.ai33.pro/v1m/task/text-to-speech';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
      body: JSON.stringify({
        text: 'Hello, this is a test of the voiceover system.',
        model: 'speech-2.6-hd',
        voice_setting: { voice_id: voice_id, vol: 1, pitch: 0, speed: 1 },
        language_boost: 'Auto',
      }),
    });
    const data = await res.json();
    return Response.json({ provider: 'minimax', status: res.status, response: data });
  }

  // Test 3: List available voices on AI33
  const voicesRes = await fetch('https://api.ai33.pro/v1/voices', {
    headers: { 'xi-api-key': AI33_KEY },
  });
  const voicesData = await voicesRes.json();
  const voiceNames = (voicesData.voices || []).slice(0, 10).map(v => ({ id: v.voice_id, name: v.name }));
  
  return Response.json({ available_voices_sample: voiceNames, total: voicesData.voices?.length });
});