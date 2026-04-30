import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ─────────────────────────────────────────────────────────────────────────────
// callClaudeProxy — thin server-side Claude wrapper
//
// Accepts: { system, prompt, max_tokens, model }
// Returns: { text: "..." }
//
// Reads ANTHROPIC_API_KEY from Deno env (same as generateScenePrompts.js).
// Called from directApi.js via base44.functions.invoke('callClaudeProxy')
// to avoid browser CORS restrictions on api.anthropic.com.
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { system, prompt, max_tokens = 2000, model = 'claude-sonnet-4-5' } = await req.json();

    if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set in environment' }, { status: 500 });

    const messages = [{ role: 'user', content: prompt }];

    const body = { model, max_tokens, messages };
    if (system) body.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return Response.json(
        { error: `Anthropic API error ${response.status}: ${err.error?.message || 'Unknown'}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    if (!text) return Response.json({ error: 'No text content in Claude response' }, { status: 500 });

    return Response.json({ text });

  } catch (error) {
    console.error('callClaudeProxy error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
