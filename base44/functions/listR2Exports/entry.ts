import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// LIST R2 EXPORTS — Lists all exported files for the current user
// Also supports delete action via action: 'delete'
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

    const body = await req.json().catch(() => ({}));
    const { action, key } = body;

    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
        secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
      },
    });

    const bucket = (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim();
    const publicBase = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');

    // ── DELETE ──
    if (action === 'delete' && key) {
      // Security: only allow deleting own files
      const safeEmail = (user.email || 'unknown').replace(/[^a-zA-Z0-9@._-]/g, '_');
      if (!key.includes(`exports/${safeEmail}/`)) {
        return Response.json({ error: 'Cannot delete files that belong to another user' }, { status: 403 });
      }

      await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log(`🗑️ Deleted: ${key}`);
      return Response.json({ success: true, deleted: key });
    }

    // ── LIST ──
    const safeEmail = (user.email || 'unknown').replace(/[^a-zA-Z0-9@._-]/g, '_');
    const prefix = `exports/${safeEmail}/`;

    const listResult = await r2Client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 200,
    }));

    const files = (listResult.Contents || []).map(obj => {
      const key = obj.Key;
      const parts = key.split('/');
      // Format: exports/{email}/{project_id}/{timestamp}_{filename}
      const projectId = parts[2] || '';
      const filenamePart = parts[3] || '';
      const timestampMatch = filenamePart.match(/^(\d+)_(.+)$/);
      const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
      const filename = timestampMatch ? timestampMatch[2] : filenamePart;

      return {
        key,
        url: `${publicBase}/${key}`,
        filename,
        project_id: projectId,
        size_bytes: obj.Size,
        size_mb: (obj.Size / (1024 * 1024)).toFixed(1),
        uploaded_at: timestamp ? new Date(timestamp).toISOString() : obj.LastModified?.toISOString(),
        last_modified: obj.LastModified?.toISOString(),
      };
    });

    // Sort newest first
    files.sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));

    console.log(`📋 Listed ${files.length} exports for ${user.email}`);

    return Response.json({ success: true, files, total: files.length });

  } catch (error) {
    console.error('❌ listR2Exports error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});