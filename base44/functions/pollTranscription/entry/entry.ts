import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// POLL TRANSCRIPTION — Check AssemblyAI transcription job status, return words (v3 — redeployed)
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { transcript_id } = await req.json();
  if (!transcript_id) return Response.json({ error: 'transcript_id required' }, { status: 400 });

  const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
  if (!API_KEY) return Response.json({ error: 'ASSEMBLYAI_API_KEY not configured' }, { status: 500 });

  const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcript_id}`, {
    headers: { 'Authorization': API_KEY },
  });

  if (!res.ok) {
    return Response.json({ error: `Poll failed (${res.status})` }, { status: 500 });
  }

  const result = await res.json();

  if (result.status === 'completed') {
    const words = (result.words || []).map(w => ({
      word: w.text,
      start: w.start / 1000,
      end: w.end / 1000,
    }));
    return Response.json({
      status: 'completed',
      words,
      word_count: words.length,
      confidence: result.confidence,
      duration: result.audio_duration,
    });
  }

  if (result.status === 'error') {
    return Response.json({ status: 'error', error: result.error || 'Transcription failed' });
  }

  // Still processing
  return Response.json({ status: result.status });
});