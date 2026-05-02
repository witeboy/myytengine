import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    
    if (body.action === 'proxyAsset') {
      const { url } = body;
      
      if (!url || !url.startsWith('http')) {
        return Response.json({ success: false, error: 'Invalid URL' }, { status: 400 });
      }
      
      const allowedDomains = [
        'file.aiquickdraw.com',
        'tempfile.aiquickdraw.com',
        'storage.googleapis.com',
        'r2.dev',
        'r2.cloudflarestorage.com',
        'cdn.aiquickdraw.com',
        'api.kie.ai',
        'ideogram.ai',
        'oaidalleapiprodscus.blob.core.windows.net',
        'replicate.delivery',
        'pbxt.replicate.delivery'
      ];
      
      let hostname;
      try {
        hostname = new URL(url).hostname;
      } catch {
        return Response.json({ success: false, error: 'Malformed URL' }, { status: 400 });
      }
      
      const isAllowed = allowedDomains.some(d => hostname.includes(d));
      if (!isAllowed) {
        return Response.json({ success: false, error: 'Domain not in allowlist: ' + hostname }, { status: 403 });
      }
      
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (!response.ok) {
          return Response.json({ 
            success: false, 
            error: 'Upstream returned ' + response.status 
          }, { status: 502 });
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunkSize = 32768;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binary);
        
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        
        return Response.json({
          success: true,
          data: base64,
          content_type: contentType
        });
        
      } catch (fetchError) {
        return Response.json({ 
          success: false, 
          error: 'Fetch failed: ' + fetchError.message 
        }, { status: 502 });
      }
    }
    
    const { system, prompt, max_tokens = 2000, model = 'claude-sonnet-4-6' } = body;

    if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY not set in environment' }, { status: 500 });

    const claudeBody = {
      model,
      max_tokens,
      messages: [{ role: 'user', content: prompt }],
    };
    if (system) claudeBody.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeBody),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return Response.json(
        { error: 'Anthropic API error ' + response.status + ': ' + (err.error?.message || 'Unknown') },
        { status: response.status }
      );
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    if (!text) return Response.json({ error: 'No text content in Claude response' }, { status: 500 });

    return Response.json({ text });

  } catch (error) {
    console.error('Function error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});