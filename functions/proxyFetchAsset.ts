import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// PROXY FETCH — Downloads CORS-blocked URLs server-side
// Re-uploads to Base44 storage and returns a CORS-safe URL
// For small files (<500KB), returns base64 inline as fallback
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { url, mode } = await req.json();
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

    console.log(`📥 Proxy fetching: ${url.substring(0, 100)}...`);

    const response = await fetch(url);
    if (!response.ok) {
      return Response.json({ error: `Fetch failed: ${response.status}` }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const blob = await response.blob();
    const sizeKB = (blob.size / 1024).toFixed(1);
    console.log(`✓ Downloaded: ${sizeKB}KB (${contentType})`);

    // Determine file extension
    const ext = contentType.includes('video') ? 'mp4'
      : contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : 'jpg';

    // Always re-upload to Base44 storage for a CORS-safe URL
    const fileName = `proxy_${Date.now()}.${ext}`;
    const file = new File([blob], fileName, { type: contentType });
    const uploadResult = await base44.integrations.Core.UploadFile({ file });

    if (uploadResult?.file_url) {
      console.log(`✅ Re-uploaded to Base44: ${uploadResult.file_url}`);
      return Response.json({
        success: true,
        file_url: uploadResult.file_url,
        content_type: contentType,
        size: blob.size,
      });
    }

    // Fallback: return base64 for small files only
    if (blob.size < 512000) {
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, chunk);
      }
      return Response.json({
        success: true,
        data: btoa(binary),
        content_type: contentType,
        size: bytes.length,
      });
    }

    return Response.json({ error: 'Upload failed and file too large for base64' }, { status: 500 });

  } catch (error) {
    console.error('proxyFetchAsset error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});