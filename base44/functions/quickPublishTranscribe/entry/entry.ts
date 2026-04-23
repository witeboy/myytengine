import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// QUICK PUBLISH — Transcribe an uploaded video/audio via AssemblyAI
// Returns transcript_id for polling, and full text when complete
// ══════════════════════════════════════════════════════════════════

// Helper for CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req) => {
  // 1. Handle CORS Preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    // 2. Ensure request is POST
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    // 3. Safely parse JSON to prevent SyntaxError crashes
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Invalid JSON provided:", parseError);
      return Response.json({ error: 'Invalid JSON payload in request body' }, { status: 400, headers: corsHeaders });
    }

    const { action, file_url, transcript_id } = body;

    const API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY');
    if (!API_KEY) {
      console.error("Missing Environment Variable: ASSEMBLYAI_API_KEY");
      return Response.json({ error: 'ASSEMBLYAI_API_KEY not configured on server' }, { status: 500, headers: corsHeaders });
    }

    // ── SUBMIT ──────────────────────────────────────────────────
    if (action === 'submit') {
      if (!file_url) return Response.json({ error: 'file_url required' }, { status: 400, headers: corsHeaders });

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
        console.error("AssemblyAI Submit Error:", err);
        return Response.json({ error: `AssemblyAI submit failed: ${err}` }, { status: 502, headers: corsHeaders }); // 502 Bad Gateway is better for upstream API failures
      }

      const { id } = await submitRes.json();
      console.log(`📡 Quick publish transcription submitted: ${id}`);
      return Response.json({ success: true, transcript_id: id }, { headers: corsHeaders });
    }

    // ── POLL ────────────────────────────────────────────────────
    if (action === 'poll') {
      if (!transcript_id) return Response.json({ error: 'transcript_id required' }, { status: 400, headers: corsHeaders });

      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${transcript_id}`, {
        headers: { 'Authorization': API_KEY },
      });

      if (!res.ok) {
         console.error(`AssemblyAI Poll Error: Status ${res.status}`);
         return Response.json({ error: `Poll failed (${res.status})` }, { status: 502, headers: corsHeaders });
      }

      const result = await res.json();

      if (result.status === 'completed') {
        const fullText = result.text || '';
        const words = (result.words || []).map((w) => ({
          word: w.text,
          start: w.start / 1000,
          end: w.end / 1000,
        }));
        const chapters = (result.chapters || []).map((ch) => ({
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
        }, { headers: corsHeaders });
      }

      if (result.status === 'error') {
        return Response.json({ status: 'error', error: result.error || 'Transcription failed' }, { headers: corsHeaders });
      }

      return Response.json({ status: result.status }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Invalid action. Use submit or poll' }, { status: 400, headers: corsHeaders });

  } catch (error) {
    console.error('quickPublishTranscribe uncaught error:', error.message, error.stack);
    return Response.json({ error: 'An unexpected server error occurred', details: error.message }, { status: 500, headers: corsHeaders });
  }
});