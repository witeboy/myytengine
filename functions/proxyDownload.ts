import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();
    if (!url) return Response.json({ error: 'url is required' }, { status: 400 });

    const resp = await fetch(url);
    if (!resp.ok) return Response.json({ error: `Fetch failed: ${resp.status}` }, { status: 502 });

    const arrayBuf = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    
    // Convert to base64
    let binaryStr = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binaryStr += String.fromCharCode.apply(null, chunk);
    }
    const b64 = btoa(binaryStr);
    const contentType = resp.headers.get('content-type') || 'image/png';

    return Response.json({ b64, contentType });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});