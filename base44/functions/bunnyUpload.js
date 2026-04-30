Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const storageZone = Deno.env.get('BUNNY_STORAGE_ZONE');
    const password    = Deno.env.get('BUNNY_STORAGE_PASSWORD');
    const region      = Deno.env.get('BUNNY_STORAGE_REGION') || 'storage';
    const cdnUrl      = (Deno.env.get('BUNNY_CDN_URL') || '').replace(/\/$/, '');

    if (!storageZone || !password || !cdnUrl) {
      return Response.json(
        { error: 'Missing env vars: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_PASSWORD, BUNNY_CDN_URL' },
        { status: 500, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { file_data_base64, file_name, file_type } = body;

    if (!file_data_base64 || !file_name) {
      return Response.json({ error: 'Missing file_data_base64 or file_name' }, { status: 400, headers: corsHeaders });
    }

    const binary = Uint8Array.from(atob(file_data_base64), c => c.charCodeAt(0));

    const safeFileName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const remotePath   = `uploads/${Date.now()}_${safeFileName}`;

    const host = (region === 'de' || region === 'storage')
      ? 'storage.bunnycdn.com'
      : `${region}.storage.bunnycdn.com`;

    const uploadRes = await fetch(`https://${host}/${storageZone}/${remotePath}`, {
      method: 'PUT',
      headers: {
        'AccessKey':    password,
        'Content-Type': file_type || 'video/mp4',
      },
      body: binary,
    });

    if (!uploadRes.ok) {
      const txt = await uploadRes.text();
      return Response.json(
        { error: `Bunny upload failed: HTTP ${uploadRes.status} — ${txt}` },
        { status: 500, headers: corsHeaders }
      );
    }

    const secure_url = `${cdnUrl}/${remotePath}`;
    return Response.json(
      { secure_url, public_id: remotePath, cdn_url: cdnUrl },
      { headers: corsHeaders }
    );

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
