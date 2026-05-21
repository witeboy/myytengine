import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v3 — inline base64 (skip R2 to avoid CORS on public bucket)
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// PROXY FETCH — Downloads CORS-blocked URLs server-side
// Small files: returns inline base64 (CORS-safe, no R2 needed)
// Large files: re-uploads to R2
// ══════════════════════════════════════════════════════════════════

const INLINE_MAX_BYTES = 12 * 1024 * 1024; // 12MB → inline base64

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

    const { url } = await req.json();
    if (!url || !url.startsWith('http')) {
      return Response.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Security: only allow known asset domains (substring match)
    const allowed = [
      'aiquickdraw.com',              // file.aiquickdraw.com, tempfile.aiquickdraw.com, cdn.aiquickdraw.com
      'storage.googleapis.com',
      'firebasestorage.googleapis.com',
      'cdn.base44.app',
      'base44.app',
      'api.kie.ai',
      'kie-asset',
      'kie.ai',
      'suno',
      'ideogram.ai',
      'image.pollinations.ai',
      'oaidalleapiprodscus.blob.core.windows.net',
      'replicate.delivery',
      'cdn.openai.com',
      'fal.media',
      'fal.ai',
      'r2.cloudflarestorage.com',
      'myvoicify.app',
      'pexels.com',
      'pixabay.com',
      'freepik.com',
      'cloudinary.com',
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

    const fileBytes = new Uint8Array(await blob.arrayBuffer());

    // Small files → inline base64. Avoids R2 public bucket CORS issues entirely.
    if (blob.size <= INLINE_MAX_BYTES) {
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < fileBytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, fileBytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      console.log(`✅ Returning inline base64 (${sizeKB}KB)`);
      return Response.json({
        success: true,
        data: base64,
        content_type: contentType,
        size: blob.size,
      });
    }

    // Large files → R2
    const ext = contentType.includes('video') ? 'mp4'
      : contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : 'jpg';
    const fileName = `proxy/${Date.now()}.${ext}`;

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