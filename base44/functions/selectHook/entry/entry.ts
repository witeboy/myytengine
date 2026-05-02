import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();

    if (body.action === 'proxyAsset') {
      var url = body.url;

      if (!url || url.indexOf('http') !== 0) {
        return Response.json({ success: false, error: 'Invalid URL' }, { status: 400 });
      }

      var allowedDomains = [ 
  'pub-aafc308ff5954f7187e75e4d90948e91.r2.dev', 
  '*.r2.dev',
  '://aiquickdraw.com', 
  'temp://aiquickdraw.com', 
  '://googleapis.com', 
  'r2.dev', 
  '://cloudflarestorage.com', 
  '://aiquickdraw.com', 
  'api.kie.ai', 
  'ideogram.ai', 
  'oaidalleapiprodscus.blob.core.windows.net', 
  'replicate.delivery', 
  'pbxt.replicate.delivery' 
];

      var hostname;
      try {
        hostname = new URL(url).hostname;
      } catch (e) {
        return Response.json({ success: false, error: 'Malformed URL' }, { status: 400 });
      }

      var isAllowed = false;
      for (var i = 0; i < allowedDomains.length; i++) {
        if (hostname.indexOf(allowedDomains[i]) !== -1) {
          isAllowed = true;
          break;
        }
      }

      if (!isAllowed) {
        return Response.json({ success: false, error: 'Domain not in allowlist: ' + hostname }, { status: 403 });
      }

      try {
        var response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!response.ok) {
          return Response.json({ success: false, error: 'Upstream returned ' + response.status }, { status: 502 });
        }

        var arrayBuffer = await response.arrayBuffer();
        var uint8Array = new Uint8Array(arrayBuffer);
        var binary = '';
        var chunkSize = 32768;
        for (var j = 0; j < uint8Array.length; j += chunkSize) {
          var chunk = uint8Array.subarray(j, j + chunkSize);
          binary += String.fromCharCode.apply(null, chunk);
        }
        var base64Data = btoa(binary);

        var contentType = response.headers.get('content-type') || 'application/octet-stream';

        return Response.json({
          success: true,
          data: base64Data,
          content_type: contentType
        });

      } catch (fetchError) {
        return Response.json({ success: false, error: 'Fetch failed: ' + fetchError.message }, { status: 502 });
      }
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, hook_id } = body;

    const all_hooks_list = await base44.entities.Hooks.list();
    const all_hooks = all_hooks_list.filter(h => h.project_id === project_id);

    for (const h of all_hooks) {
      if (h.is_selected) {
        await base44.entities.Hooks.update(h.id, { is_selected: false });
      }
    }

    await base44.entities.Hooks.update(hook_id, { is_selected: true });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});