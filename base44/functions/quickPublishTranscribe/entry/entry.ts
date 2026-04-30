import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH — Transcribe via AssemblyAI
// speech_models: ["universal-3-pro", "universal-2"] per docs (April 2026)
// Response payload: minimal — only what QuickPublish.jsx actually reads
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    // ── BUNNY CONFIG ROUTE ─────────────────────────────────────────
    // Runs before auth — detected by action: 'bunny_config' in body.
    let body = {};
    try { body = await req.json(); } catch (_) {}

    if (body.action === 'bunny_config') {
      return Response.json({
        storage_zone:     Deno.env.get('BUNNY_STORAGE_ZONE')     || '',
        storage_password: Deno.env.get('BUNNY_STORAGE_PASSWORD') || '',
        storage_region:   Deno.env.get('BUNNY_STORAGE_REGION')   || 'ny',
        cdn_url:          Deno.env.get('BUNNY_CDN_URL')          || '',
      });
    }
    // ── END BUNNY CONFIG ROUTE ─────────────────────────────────────

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

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
          speech_models: ['universal-3-pro', 'universal-2'],
          language_detection: true,
        }),
      });

      if (!submitRes.ok) {
        let errBody = '';
        try { errBody = JSON.stringify(await submitRes.json()); }
        catch (_) { errBody = await submitRes.text(); }
        console.error('AssemblyAI submit failed:', submitRes.status, errBody);
        return Response.json({ error: `AssemblyAI submit failed (${submitRes.status}): ${errBody}` }, { status: 500 });
      }

      const submitData = await submitRes.json();
      const id = submitData.id;
      if (!id) {
        return Response.json({ error: `No transcript ID returned: ${JSON.stringify(submitData)}` }, { status: 500 });
      }

      console.log('Transcription submitted:', id);
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
        // Only return the 3 fields QuickPublish.jsx actually reads:
        // words, chapters, text, duration — nothing else to keep payload small
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

        console.log('Transcription complete:', words.length, 'words,', chapters.length, 'chapters');
        return Response.json({
          status: 'completed',
          text: result.text || '',
          words,
          duration: result.audio_duration || 0,
          chapters,
        });
      }

      if (result.status === 'error') {
        console.error('AssemblyAI transcription error:', result.error);
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