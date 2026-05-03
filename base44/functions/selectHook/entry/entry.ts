import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ════════════════════════════════════════════════════════════
    // ACTION: proxyAsset — fetch and return base64 encoded asset
    // ════════════════════════════════════════════════════════════
    if (body.action === 'proxyAsset') {
      const url = body.url;

      if (!url || !url.startsWith('http')) {
        return Response.json(
          { success: false, error: 'Invalid URL' },
          { status: 400, headers: corsHeaders }
        );
      }

      const allowedDomains = [
        // AIQuickDraw domains
        'file.aiquickdraw.com',
        'tempfile.aiquickdraw.com',
        'cdn.aiquickdraw.com',
        
        // MyVoicify custom domains (R2)
        'myvoicify.app',
        'media.myvoicify.app',
        'files.myvoicify.app',
        'cdn.myvoicify.app',
        
        // R2/Cloudflare storage (fallback)
        'r2.dev',
        'r2.cloudflarestorage.com',
        'pub-aafc308ff5954f7187e75e4d90948e91.r2.dev',
        
        // Google storage
        'storage.googleapis.com',
        
        // AI service providers
        'api.kie.ai',
        'ideogram.ai',
        'oaidalleapiprodscus.blob.core.windows.net',
        'replicate.delivery',
        'pbxt.replicate.delivery'
      ];

      let hostname;
      try {
        hostname = new URL(url).hostname;
      } catch (e) {
        return Response.json(
          { success: false, error: 'Malformed URL: ' + url },
          { status: 400, headers: corsHeaders }
        );
      }

      const isAllowed = allowedDomains.some(domain => {
        return hostname === domain || hostname.endsWith('.' + domain) || hostname.includes(domain);
      });

      if (!isAllowed) {
        console.log('Domain rejected:', hostname);
        return Response.json(
          { success: false, error: 'Domain not in allowlist: ' + hostname },
          { status: 403, headers: corsHeaders }
        );
      }

      try {
        console.log('Proxying:', url);

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
          }
        });

        if (!response.ok) {
          return Response.json(
            { success: false, error: 'Upstream returned ' + response.status },
            { status: 502, headers: corsHeaders }
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Convert to base64
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
          for (let j = 0; j < chunk.length; j++) {
            binary += String.fromCharCode(chunk[j]);
          }
        }
        const base64Data = btoa(binary);

        const contentType = response.headers.get('content-type') || 'application/octet-stream';

        console.log('Proxy success:', url, 'Size:', uint8Array.length, 'Type:', contentType);

        return Response.json(
          {
            success: true,
            data: base64Data,
            content_type: contentType,
            size: uint8Array.length
          },
          { headers: corsHeaders }
        );

      } catch (fetchError) {
        console.log('Fetch error:', fetchError.message);
        return Response.json(
          { success: false, error: 'Fetch failed: ' + fetchError.message },
          { status: 502, headers: corsHeaders }
        );
      }
    }

    // ════════════════════════════════════════════════════════════
    // ACTION: proxyAudio — stream audio directly with CORS headers
    // ════════════════════════════════════════════════════════════
    if (body.action === 'proxyAudio') {
      const url = body.url;

      if (!url || !url.startsWith('http')) {
        return Response.json(
          { success: false, error: 'Invalid URL' },
          { status: 400, headers: corsHeaders }
        );
      }

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'audio/*,*/*',
          }
        });

        if (!response.ok) {
          return Response.json(
            { success: false, error: 'Upstream returned ' + response.status },
            { status: 502, headers: corsHeaders }
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'audio/wav';

        return new Response(arrayBuffer, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Content-Type': contentType,
            'Content-Length': arrayBuffer.byteLength.toString(),
            'Cache-Control': 'public, max-age=31536000',
          }
        });

      } catch (fetchError) {
        return Response.json(
          { success: false, error: 'Fetch failed: ' + fetchError.message },
          { status: 502, headers: corsHeaders }
        );
      }
    }

    // ════════════════════════════════════════════════════════════
    // DEFAULT: selectHook action
    // ════════════════════════════════════════════════════════════
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { project_id, hook_id } = body;

    if (project_id && hook_id) {
      const all_hooks_list = await base44.entities.Hooks.list();
      const all_hooks = all_hooks_list.filter(h => h.project_id === project_id);

      for (const h of all_hooks) {
        if (h.is_selected) {
          await base44.entities.Hooks.update(h.id, { is_selected: false });
        }
      }

      await base44.entities.Hooks.update(hook_id, { is_selected: true });
    }

    return Response.json(
      { success: true },
      { headers: corsHeaders }
    );

  } catch (error) {
    console.log('Error:', error.message);
    return Response.json(
      { error: error.message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
});