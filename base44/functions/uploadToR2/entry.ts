import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// UPLOAD TO R2 — Chunked multipart upload for large files
//
// Actions:
//   "init"     → Create multipart upload, returns upload_id
//   "chunk"    → Upload a single chunk (part), returns ETag
//   "complete" → Finalize multipart upload, returns public URL
//   "abort"    → Cancel a failed upload
//   (default)  → Legacy single-shot upload for small files
// ══════════════════════════════════════════════════════════════════

function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
      secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
    },
  });
}

function getBucket() {
  return (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim();
}

function getPublicBase() {
  return (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
}

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

    const body = await req.json();
    const { action } = body;
    const r2 = getR2Client();
    const bucket = getBucket();

    // ── BUILD R2 KEY ──
    const buildKey = (filename, projectId) => {
      const safeEmail = (user.email || 'unknown').replace(/[^a-zA-Z0-9@._-]/g, '_');
      const timestamp = Date.now();
      const safeFilename = (filename || 'export.mp4').replace(/[^a-zA-Z0-9._-]/g, '_');
      return `exports/${safeEmail}/${projectId || 'general'}/${timestamp}_${safeFilename}`;
    };

    // ════════════════════════════════════════════════════════
    // INIT — Start multipart upload
    // ════════════════════════════════════════════════════════
    if (action === 'init') {
      const { filename, content_type, project_id, project_name, total_chunks, total_size } = body;
      const r2Key = buildKey(filename, project_id);

      const cmd = new CreateMultipartUploadCommand({
        Bucket: bucket,
        Key: r2Key,
        ContentType: content_type || 'video/mp4',
        Metadata: {
          'project-id': project_id || '',
          'project-name': project_name || '',
          'uploaded-by': user.email || '',
          'uploaded-at': new Date().toISOString(),
          'total-size': String(total_size || 0),
        },
      });

      const result = await r2.send(cmd);
      console.log(`📤 Multipart init: ${r2Key} (${total_chunks} chunks, ~${((total_size || 0) / 1048576).toFixed(1)}MB)`);

      return Response.json({
        success: true,
        upload_id: result.UploadId,
        r2_key: r2Key,
      });
    }

    // ════════════════════════════════════════════════════════
    // CHUNK — Upload one part
    // ════════════════════════════════════════════════════════
    if (action === 'chunk') {
      const { upload_id, r2_key, part_number, chunk_base64 } = body;

      if (!upload_id || !r2_key || !part_number || !chunk_base64) {
        return Response.json({ error: 'Missing required fields for chunk upload' }, { status: 400 });
      }

      // Decode base64 chunk
      const binary = atob(chunk_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const cmd = new UploadPartCommand({
        Bucket: bucket,
        Key: r2_key,
        UploadId: upload_id,
        PartNumber: part_number,
        Body: bytes,
      });

      const result = await r2.send(cmd);
      console.log(`  📦 Part ${part_number}: ${(bytes.length / 1024).toFixed(0)}KB → ETag ${result.ETag}`);

      return Response.json({
        success: true,
        etag: result.ETag,
        part_number,
      });
    }

    // ════════════════════════════════════════════════════════
    // COMPLETE — Finalize multipart upload
    // ════════════════════════════════════════════════════════
    if (action === 'complete') {
      const { upload_id, r2_key, parts } = body;

      if (!upload_id || !r2_key || !parts?.length) {
        return Response.json({ error: 'Missing required fields for complete' }, { status: 400 });
      }

      const cmd = new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: r2_key,
        UploadId: upload_id,
        MultipartUpload: {
          Parts: parts.map(p => ({ PartNumber: p.part_number, ETag: p.etag })),
        },
      });

      await r2.send(cmd);
      const publicUrl = `${getPublicBase()}/${r2_key}`;
      console.log(`✅ Multipart complete: ${publicUrl} (${parts.length} parts)`);

      return Response.json({
        success: true,
        url: publicUrl,
        key: r2_key,
      });
    }

    // ════════════════════════════════════════════════════════
    // ABORT — Cancel failed multipart upload
    // ════════════════════════════════════════════════════════
    if (action === 'abort') {
      const { upload_id, r2_key } = body;
      if (upload_id && r2_key) {
        await r2.send(new AbortMultipartUploadCommand({
          Bucket: bucket, Key: r2_key, UploadId: upload_id,
        }));
        console.log(`🗑️ Multipart aborted: ${r2_key}`);
      }
      return Response.json({ success: true });
    }

    // ════════════════════════════════════════════════════════
    // LEGACY — Single-shot upload for small files (<5MB)
    // ════════════════════════════════════════════════════════
    const { file_base64, filename, content_type, project_id, project_name } = body;
    if (!file_base64 || !filename) {
      return Response.json({ error: 'Provide action or file_base64+filename' }, { status: 400 });
    }

    const binary = atob(file_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const r2Key = buildKey(filename, project_id);
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: bytes,
      ContentType: content_type || 'video/mp4',
    }));

    const publicUrl = `${getPublicBase()}/${r2Key}`;
    console.log(`✅ Single upload: ${publicUrl} (${(bytes.length / 1048576).toFixed(1)}MB)`);

    return Response.json({
      success: true,
      url: publicUrl,
      key: r2Key,
      size_bytes: bytes.length,
      size_mb: (bytes.length / 1048576).toFixed(1),
    });

  } catch (error) {
    console.error('❌ uploadToR2 error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});