import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH — Transcribe an uploaded video/audio via AssemblyAI
// Returns transcript_id for polling, and full text when complete
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { action, file_url, transcript_id } = await req.json();

    const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (!API_KEY) return Response.json({ error: 'ASSEMBLYAI_API_KEY not configured' }, { status: 500 });

    // ── SUBMIT ──────────────────────────────────────────────────
    if (action === 'submit') {
      if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

      const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: file_url,
          speech_model: 'best',
          language_detection: true,
          auto_chapters: true,
        }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.text();
        return Response.json({ error: `AssemblyAI submit failed: ${err}` }, { status: 500 });
      }

      const { id } = await submitRes.json();
      console.log(`📡 Quick publish transcription submitted: ${id}`);
      return Response.json({ success: true, transcript_id: id });
    }

    // ── POLL ────────────────────────────────────────────────────
    if (action === 'poll') {
      if (!transcript_id) return Response.json({ error: 'transcript_id required' }, { status: 400 });

      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcript_id}`, {
        headers: { 'Authorization': API_KEY },
      });

      if (!res.ok) return Response.json({ error: `Poll failed (${res.status})` }, { status: 500 });

      const result = await res.json();

      if (result.status === 'completed') {
        const fullText = result.text || '';
        const words = (result.words || []).map(w => ({
          word: w.text,
          start: w.start / 1000,
          end: w.end / 1000,
        }));
        const chapters = (result.chapters || []).map(ch => ({
          gist: ch.gist,
          headline: ch.headline,
          summary: ch.summary,
          start: ch.start / 1000,
          end: ch.end / 1000,
        }));
        return Response.json({
          status: 'completed',
          text: fullText,
          words,
          word_count: words.length,
          duration: result.audio_duration,
          chapters,
        });
      }

      if (result.status === 'error') {
        return Response.json({ status: 'error', error: result.error || 'Transcription failed' });
      }

      return Response.json({ status: result.status });
    }

    return Response.json({ error: 'Invalid action. Use submit or poll' }, { status: 400 });

  } catch (error) {
    console.error('quickPublishTranscribe error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});