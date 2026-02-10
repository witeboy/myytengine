import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, duration, quality = '1080p' } = body;

    if (!prompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 });
    }

    const apiKey = Deno.env.get('FREEPIK_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Freepik API key not configured' }, { status: 500 });
    }

    // Extract key search terms from prompt (first 5 words or main concepts)
    const searchTerms = prompt.split(' ').slice(0, 5).join(' ');

    // Build Freepik API query
    const filters = {
      resolution: { '1080': true },
      category: 'footage',
      orientation: ['horizontal']
    };

    // Add quality filter
    if (quality === '4k') {
      filters.resolution['4k'] = true;
    } else if (quality === '720p') {
      filters.resolution['720'] = true;
    }

    // Add duration filter if specified
    if (duration) {
      filters.duration = {
        from: Math.max(1, duration - 5),
        to: duration + 5
      };
    }

    // Build query string with filters
    const filterParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (typeof value === 'object' && !Array.isArray(value)) {
        Object.entries(value).forEach(([k, v]) => {
          if (v) filterParams.append(`filters[${key}][${k}]`, v);
        });
      } else if (Array.isArray(value)) {
        value.forEach(v => filterParams.append(`filters[${key}][]`, v));
      }
    });

    const url = `https://api.freepik.com/v1/videos?term=${encodeURIComponent(searchTerms)}&order=relevance&page=1&${filterParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        'x-freepik-api-key': apiKey,
        'Accept-Language': 'en-US'
      }
    });

    if (!response.ok) {
      console.error('Freepik API error:', response.status);
      return Response.json({ error: 'Failed to search Freepik' }, { status: 500 });
    }

    const data = await response.json();

    // Transform Freepik response to our format
    const videos = (data.data || []).map(video => ({
      id: video.id,
      name: video.name,
      url: video.url,
      duration: video.duration,
      quality: video.quality,
      thumbnail: video.thumbnails?.[0]?.url,
      preview: video.previews?.[0]?.url,
      author: video.author?.name,
      premium: video.premium === 1,
      aspectRatio: video.aspect_ratio
    }));

    return Response.json({
      success: true,
      videos,
      total: data.meta?.pagination?.total || 0,
      prompt: searchTerms
    });
  } catch (error) {
    console.error('Error searching B-roll videos:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});