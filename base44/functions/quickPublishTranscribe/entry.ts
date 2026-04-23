import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH — Transcribe via AssemblyAI
// Verified against docs at assemblyai.com/docs (April 2026):
//
// RULES (from live docs):
//   - speech_models: REQUIRED array. Valid: "universal-3-pro", "universal-2"
//   - Use ["universal-3-pro", "universal-2"] for best accuracy + fallback
//   - language_detection: compatible with the two-model combo above
//   - disfluencies: universal-2 ONLY — incompatible with universal-3-pro
//   - auto_chapters: universal-2 ONLY — drop it when using u3-pro
//   - punctuate / format_text: universal-2 ONLY features
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
      return Response.json({
        error: 'ASSEMBLYAI_API_KEY not set. Add it in Base44 Settings → Environment Variables.',
      }, { status: 500 });
    }

    // ── SUBMIT ──────────────────────────────────────────────────
    if (action === 'submit') {
      if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400 });

      const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { 'Authorization': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio_url: file_url,
          // Correct per AssemblyAI docs (April 2026):
          // Two-model array: u3-pro for supported langs, u2 fallback for the rest
          speech_models: ['universal-3-pro', 'universal-2'],
          language_detection: true,
          // NOTE: disfluencies and auto_chapters are universal-2 ONLY features.
          // They are NOT compatible with universal-3-pro and will cause a 400.
          // Removed both to keep the combo working cleanly.
        }),
      });

      if (!submitRes.ok) {
        let errBody = '';
        try { errBody = JSON.stringify(await submitRes.json()); }
        catch (_) { errBody = await submitRes.text(); }
        console.error(`AssemblyAI submit ${submitRes.status}:`, errBody);
        return Response.json({ error: `AssemblyAI submit failed (${submitRes.status}): ${errBody}` }, { status: 500 });
      }

      const submitData = await submitRes.json();
      const id = submitData.id;
      if (!id) {
        return Response.json({ error: `No transcript ID returned: ${JSON.stringify(submitData)}` }, { status: 500 });
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

        // auto_chapters was removed from submit (u3-pro incompatible)
        // but map it defensively in case the result still includes it
        const chapters = (result.chapters || []).map(ch => ({
          gist: ch.gist,
          headline: ch.headline,
          summary: ch.summary,
          start: ch.start / 1000,
          end: ch.end / 1000,
        }));

        console.log(`✅ Done: ${words.length} words, model used: ${result.speech_model_used || 'unknown'}`);
        return Response.json({
          status: 'completed',
          text: fullText,
          words,
          word_count: words.length,
          duration: result.audio_duration,
          chapters,
          model_used: result.speech_model_used || null,
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