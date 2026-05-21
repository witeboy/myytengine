import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// PROXY FETCH — Downloads CORS-blocked URLs server-side
// Re-uploads to Cloudflare R2 and returns a CORS-safe URL
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
      'aiquickdraw.com',
      'storage.googleapis.com',
      'firebasestorage.googleapis.com',
      'cdn.base44.app',
      'api.kie.ai',
      'kie-asset',
      'suno',
      'ideogram.ai',
      'image.pollinations.ai',
      'oaidalleapiprodscus.blob.core.windows.net', 
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

    // Re-upload to Cloudflare R2 for a CORS-safe URL
    const fileName = `proxy/${Date.now()}.${ext}`;
    const fileBytes = new Uint8Array(await blob.arrayBuffer());

    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
        secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
      },
    });

    await r2Client.send(new PutObjectCommand({
      Bucket: (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim(),
      Key: fileName,
      Body: fileBytes,
      ContentType: contentType,
    }));

    const publicBase = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
    const fileUrl = `${publicBase}/${fileName}`;
    console.log(`✅ Re-uploaded to R2: ${fileUrl}`);

    return Response.json({
      success: true,
      file_url: fileUrl,
      content_type: contentType,
      size: blob.size,
    });

  } catch (error) {
    console.error('proxyFetchAsset error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});