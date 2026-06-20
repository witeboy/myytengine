import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const AI33_KEY = (Deno.env.get('AI33_API_KEY') || '').trim();
    const h = { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY };

    // Endpoints that report account/credit info
    const out = {};
    for (const [name, url] of [
      ['config', 'https://api.ai33.pro/v1m/common/config'],
      ['credits', 'https://api.ai33.pro/v1/user/credits'],
      ['me', 'https://api.ai33.pro/v1/user'],
      ['account', 'https://api.ai33.pro/v1/account'],
    ]) {
      try {
        const res = await fetch(url, { headers: h });
        out[name] = { status: res.status, body: (await res.text()).substring(0, 250) };
      } catch (e) { out[name] = { error: e.message }; }
    }
    return Response.json(out);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});