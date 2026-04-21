// ══════════════════════════════════════════════════════════════════════
// POLL CREATOMATE RENDER — check render job status
//
// Input: { id }  — render ID returned by renderShortCreatomate
// Output: { id, status, url, progress }
//   status: 'planned' | 'waiting' | 'transcribing' | 'rendering' | 'succeeded' | 'failed'
// ══════════════════════════════════════════════════════════════════════

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = Deno.env.get('CREATOMATE_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'CREATOMATE_API_KEY not configured' }, { status: 500 });
    }

    const { id } = await req.json();
    if (!id) {
      return Response.json({ error: 'id is required' }, { status: 400 });
    }

    const response = await fetch(`https://api.creatomate.com/v1/renders/${id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      return Response.json(
        { error: `Creatomate API returned ${response.status}: ${errText}` },
        { status: 500 }
      );
    }

    const render = await response.json();

    return Response.json({
      id: render.id,
      status: render.status,
      url: render.url || null,
      progress: render.progress || 0,
      error: render.error_message || null,
    });
  } catch (error) {
    console.error('[Creatomate] Poll error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});