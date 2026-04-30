// bunnyUpload.js — Deno backend function
// Required env vars:
//   BUNNY_STORAGE_ZONE      — storage zone name (e.g. "my-videos")
//   BUNNY_STORAGE_PASSWORD  — storage zone password from FTP & API Access tab
//   BUNNY_STORAGE_REGION    — region prefix from hostname: de, ny, sg, uk, se, la, br, syd
//   BUNNY_CDN_URL           — pull zone URL (e.g. https://my-videos.b-cdn.net)

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
    const region      = Deno.env.get('BUNNY_STORAGE_REGION') || 'storage'; // 'storage' = default/Falkenstein
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

    // Decode base64 → binary
    const binary = Uint8Array.from(atob(file_data_base64), c => c.charCodeAt(0));

    // Unique remote path
    const safeFileName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const remotePath   = `uploads/${Date.now()}_${safeFileName}`;

    // Region hostname: de→storage.bunnycdn.com, ny→ny.storage.bunnycdn.com, etc.
    const host = region === 'de' || region === 'storage'
      ? 'storage.bunnycdn.com'
      : `${region}.storage.bunnycdn.com`;

    const uploadUrl = `https://${host}/${storageZone}/${remotePath}`;

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey':     password,       // storage zone password, NOT account API key
        'Content-Type':  file_type || 'video/mp4',
      },
      body: binary,
    });

    if (!uploadRes.ok) {
      const txt = await uploadRes.text();
      return Response.json(
        { error: `Bunny Storage upload failed: HTTP ${uploadRes.status} — ${txt}` },
        { status: 500, headers: corsHeaders }
      );
    }

    // File is live on CDN via the pull zone
    const secure_url = `${cdnUrl}/${remotePath}`;

    return Response.json(
      { secure_url, public_id: remotePath, cdn_url: cdnUrl },
      { headers: corsHeaders }
    );

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
