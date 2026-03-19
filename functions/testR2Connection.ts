import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '';
  const accessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '';
  const secretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '';
  const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '';
  const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '';

  const diagnostics = {
    accountId_length: accountId.length,
    accountId_first8: accountId.substring(0, 8),
    bucketName_raw: bucketName,
    bucketName_length: bucketName.length,
    bucketName_trimmed: bucketName.trim(),
    bucketName_charCodes: Array.from(bucketName).map(c => c.charCodeAt(0)),
    publicUrl,
    accessKeyId_length: accessKeyId.length,
    secretKey_length: secretAccessKey.length,
    endpoint: `https://${accountId.trim()}.r2.cloudflarestorage.com`,
  };

  try {
    const r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
      },
    });

    const testKey = `test/ping-${Date.now()}.txt`;
    await r2Client.send(new PutObjectCommand({
      Bucket: bucketName.trim(),
      Key: testKey,
      Body: new TextEncoder().encode('hello r2'),
      ContentType: 'text/plain',
    }));

    return Response.json({ success: true, diagnostics, file_url: `${publicUrl.replace(/\/$/, '')}/${testKey}` });
  } catch (error) {
    return Response.json({ success: false, error: error.message, diagnostics }, { status: 500 });
  }
});