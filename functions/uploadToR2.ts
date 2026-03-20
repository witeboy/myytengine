import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// UPLOAD TO R2 — Receives base64-encoded file and stores in R2
// Used for permanent cloud backup of exported MP4 videos
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

    const { file_base64, filename, content_type, project_id, project_name } = await req.json();

    if (!file_base64 || !filename) {
      return Response.json({ error: 'file_base64 and filename are required' }, { status: 400 });
    }

    // Decode base64 to bytes
    const binary = atob(file_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const sizeMB = (bytes.length / (1024 * 1024)).toFixed(1);
    console.log(`📤 Uploading ${filename} (${sizeMB}MB) to R2...`);

    // Build R2 key: exports/{user_email}/{project_id}/{timestamp}_{filename}
    const safeEmail = (user.email || 'unknown').replace(/[^a-zA-Z0-9@._-]/g, '_');
    const timestamp = Date.now();
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2Key = `exports/${safeEmail}/${project_id || 'general'}/${timestamp}_${safeFilename}`;

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
      Key: r2Key,
      Body: bytes,
      ContentType: content_type || 'video/mp4',
      Metadata: {
        'project-id': project_id || '',
        'project-name': project_name || '',
        'uploaded-by': user.email || '',
        'uploaded-at': new Date().toISOString(),
        'size-bytes': String(bytes.length),
      },
    }));

    const publicBase = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
    const fileUrl = `${publicBase}/${r2Key}`;
    console.log(`✅ Uploaded to R2: ${fileUrl}`);

    return Response.json({
      success: true,
      url: fileUrl,
      key: r2Key,
      size_bytes: bytes.length,
      size_mb: sizeMB,
    });

  } catch (error) {
    console.error('❌ uploadToR2 error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});