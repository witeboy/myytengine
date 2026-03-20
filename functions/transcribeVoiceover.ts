import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ═══════════════════════════════════════════════════════════════
// VOICEOVER TRANSCRIPTION — AssemblyAI word-level timestamps
//
// This is the CapCut approach: send the actual audio file to a
// speech recognition engine and get back exact word-level
// timestamps measured from the waveform. No heuristics, no
// guessing — the timing comes from the real audio.
//
// Returns: { words: [{ word, start, end }, ...] }
//   start/end are in seconds (float)
// ═══════════════════════════════════════════════════════════════

const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';
const POLL_INTERVAL = 3000;   // 3s between polls
const POLL_TIMEOUT  = 300000; // 5min max

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { voiceover_url } = await req.json();
  if (!voiceover_url) {
    return Response.json({ error: 'voiceover_url is required' }, { status: 400 });
  }

  const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
  if (!API_KEY) {
    return Response.json({ error: 'ASSEMBLYAI_API_KEY not configured' }, { status: 500 });
  }

  const headers = {
    'Authorization': API_KEY,
    'Content-Type': 'application/json',
  };

  try {
    // ── Step 1: Submit transcription job ─────────────────────────
    console.log(`🎙 Submitting transcription for: ${voiceover_url.substring(0, 80)}...`);

    const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audio_url: voiceover_url,
        speech_models: ['universal-3-pro', 'universal-2'],
        language_detection: true,
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      throw new Error(`AssemblyAI submit failed (${submitRes.status}): ${err}`);
    }

    const { id: transcriptId } = await submitRes.json();
    console.log(`📡 Transcription job submitted: ${transcriptId}`);

    // ── Step 2: Poll until complete ─────────────────────────────
    const startTime = Date.now();

    while (true) {
      if (Date.now() - startTime > POLL_TIMEOUT) {
        throw new Error('Transcription timed out after 5 minutes');
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL));

      const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
        headers: { 'Authorization': API_KEY },
      });

      if (!pollRes.ok) continue;
      const result = await pollRes.json();

      if (result.status === 'completed') {
        const words = (result.words || []).map(w => ({
          word:  w.text,
          start: w.start / 1000, // ms → seconds
          end:   w.end / 1000,
        }));

        console.log(`✓ Transcription complete: ${words.length} words, confidence: ${(result.confidence * 100).toFixed(1)}%`);

        return Response.json({
          success: true,
          words,
          word_count: words.length,
          confidence: result.confidence,
          duration: result.audio_duration,
          language: result.language_code,
        });
      }

      if (result.status === 'error') {
        throw new Error(`Transcription failed: ${result.error || 'Unknown error'}`);
      }

      // Still processing
      console.log(`⏳ Transcription status: ${result.status}...`);
    }

  } catch (error) {
    console.error(`❌ Transcription error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});