import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH — Transcribe an uploaded video/audio via AssemblyAI
// v3 — fixed: speech_model + language_detection are mutually exclusive
//             in AssemblyAI v2; removed conflict, added full error body
//             surfacing so 500s show the real reason in the UI.
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, file_url, transcript_id } = body;

    const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (!API_KEY) {
      console.error('ASSEMBLYAI_API_KEY env var is not set');
      return Response.json({
        error: 'ASSEMBLYAI_API_KEY is not configured. Add it under Base44 Settings → Environment Variables.',
      }, { status: 500 });
    }

    // ── SUBMIT ──────────────────────────────────────────────────
    if (action === 'submit') {
      if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

      // IMPORTANT: language_detection: true is INCOMPATIBLE with speech_model in
      // AssemblyAI v2 API — they are mutually exclusive. speech_model: 'best'
      // handles language internally. Passing both causes a 400 error.
      const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: file_url,
          speech_models: ['universal-3-pro'],  // AssemblyAI v2 valid values: 'universal-3-pro' | 'universal-2'
          punctuate: true,
          format_text: true,
          auto_chapters: true,    // populates result.chapters → ChaptersPanel
          disfluencies: true,     // keeps um/uh for filler word detection
        }),
      });

      // Surface the full AssemblyAI error body, not just status code
      if (!submitRes.ok) {
        let errBody = '';
        try { errBody = JSON.stringify(await submitRes.json()); }
        catch (_) { errBody = await submitRes.text(); }
        console.error(`AssemblyAI submit ${submitRes.status}:`, errBody);
        return Response.json({
          error: `AssemblyAI submit failed (${submitRes.status}): ${errBody}`,
        }, { status: 500 });
      }

      const submitData = await submitRes.json();
      const id = submitData.id;
      if (!id) {
        return Response.json({
          error: `AssemblyAI returned no transcript ID: ${JSON.stringify(submitData)}`,
        }, { status: 500 });
      }

      console.log(`📡 Transcription submitted: ${id}`);
      return Response.json({ success: true, transcript_id: id });
    }

    // ── POLL ────────────────────────────────────────────────────
    if (action === 'poll') {
      if (!transcript_id) return Response.json({ error: 'transcript_id required' }, { status: 400 });

      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcript_id}`, {
        headers: { 'Authorization': API_KEY },
      });

      if (!res.ok) {
        let errBody = '';
        try { errBody = JSON.stringify(await res.json()); }
        catch (_) { errBody = await res.text(); }
        return Response.json({ error: `Poll failed (${res.status}): ${errBody}` }, { status: 500 });
      }

      const result = await res.json();

      if (result.status === 'completed') {
        const fullText = result.text || '';

        const words = (result.words || []).map(w => ({
          word: w.text,
          start: w.start / 1000,
          end: w.end / 1000,
          confidence: w.confidence ?? null,
          speaker: w.speaker || null,
        }));

        const chapters = (result.chapters || []).map(ch => ({
          gist: ch.gist,
          headline: ch.headline,
          summary: ch.summary,
          start: ch.start / 1000,
          end: ch.end / 1000,
        }));

        console.log(`✅ Transcription done: ${words.length} words, ${chapters.length} chapters`);
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
        console.error('AssemblyAI error:', result.error);
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