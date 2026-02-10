import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const API_KEY = Deno.env.get('AI33_API_KEY');
    if (!API_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    // Get available voices
    const voicesResponse = await fetch('https://api.ai33.pro/v2/voices', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
      },
    });

    if (!voicesResponse.ok) {
      const error = await voicesResponse.text();
      return Response.json({ error: `Voices API error: ${error}` }, { status: 500 });
    }

    const voicesData = await voicesResponse.json();

    return Response.json({
      success: true,
      voices: voicesData.voices || voicesData,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});