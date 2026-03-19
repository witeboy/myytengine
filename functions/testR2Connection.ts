import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const accessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
    const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME');
    const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');

    console.log('Account ID:', accountId);
    console.log('Bucket Name:', JSON.stringify(bucketName));
    console.log('Public URL:', publicUrl);
    console.log('Access Key ID starts with:', accessKeyId?.substring(0, 6));
    console.log('Secret Access Key length:', secretAccessKey?.length);

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    console.log('Constructed endpoint:', endpoint);

    const r2Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Try uploading a tiny test file
    const testContent = new TextEncoder().encode('test file ' + Date.now());
    const testKey = `test/connection-test-${Date.now()}.txt`;

    await r2Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
    }));

    const fileUrl = `${publicUrl.replace(/\/$/, '')}/${testKey}`;
    console.log('Upload successful! File URL:', fileUrl);

    return Response.json({
      success: true,
      message: 'R2 connection works!',
      file_url: fileUrl,
      bucket: bucketName,
      endpoint,
    });

  } catch (error) {
    console.error('R2 test error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});