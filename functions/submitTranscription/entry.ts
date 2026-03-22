import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// SUBMIT TRANSCRIPTION — Start AssemblyAI job, return ID
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { voiceover_url } = await req.json();
  if (!voiceover_url) return Response.json({ error: 'voiceover_url required' }, { status: 400 });

  const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
  if (!API_KEY) return Response.json({ error: 'ASSEMBLYAI_API_KEY not configured' }, { status: 500 });

  const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_url: voiceover_url,
      speech_models: ['universal-3-pro'],
      language_detection: true,
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    return Response.json({ error: `AssemblyAI submit failed: ${err}` }, { status: 500 });
  }

  const { id } = await submitRes.json();
  console.log(`📡 Transcription submitted: ${id}`);

  return Response.json({ success: true, transcript_id: id });
});