import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// PROXY FETCH — Downloads CORS-blocked URLs server-side
// Returns base64 data that frontend can use for ZIP/download
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url } = await req.json();
    if (!url || !url.startsWith('http')) {
      return Response.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Security: only allow known asset domains
    const allowed = [
      'tempfile.aiquickdraw.com',
      'storage.googleapis.com',
      'firebasestorage.googleapis.com',
      'cdn.base44.app',
      'api.kie.ai',
      'kie-asset',
      'suno',
    ];

    const hostname = new URL(url).hostname;
    if (!allowed.some(d => hostname.includes(d))) {
      return Response.json({ error: `Domain not allowed: ${hostname}` }, { status: 403 });
    }

    console.log(`📥 Proxy fetching: ${url.substring(0, 80)}...`);

    const response = await fetch(url);
    if (!response.ok) {
      return Response.json({ error: `Fetch failed: ${response.status}` }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Convert to base64 in safe chunks (avoid stack overflow)
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);

    console.log(`✓ Proxy fetched: ${(bytes.length / 1024).toFixed(1)}KB (${contentType})`);

    return Response.json({
      success: true,
      data: base64,
      content_type: contentType,
      size: bytes.length
    });

  } catch (error) {
    console.error('proxyFetchAsset error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});