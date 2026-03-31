import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

// ══════════════════════════════════════════════════════════════════
// MULTI-SOURCE B-ROLL VIDEO SEARCH
// Searches Pexels and Pixabay in parallel
// ══════════════════════════════════════════════════════════════════

async function searchPexels(searchTerms, duration, quality, orientation) {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) return { videos: [], source: 'pexels', error: 'No API key' };

  const params = new URLSearchParams({
    query: searchTerms,
    per_page: '15',
    page: '1',
  });
  if (orientation) params.set('orientation', orientation);
  if (quality === '4k') params.set('size', 'large');
  if (duration) {
    params.set('min_duration', String(Math.max(1, duration - 5)));
    params.set('max_duration', String(duration + 10));
  }

  const url = `https://api.pexels.com/videos/search?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': apiKey }
    });
    if (!response.ok) {
      console.error('Pexels API error:', response.status);
      return { videos: [], source: 'pexels', error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    const videos = (data.videos || []).map(video => {
      const files = video.video_files || [];
      const hd = files.find(f => f.quality === 'hd' && f.width >= 1280);
      const sd = files.find(f => f.quality === 'sd');
      const best = hd || sd || files[0];

      return {
        id: `pexels-${video.id}`,
        source: 'pexels',
        name: video.url?.split('/').pop()?.replace(/-/g, ' ')?.replace(/\/$/, '') || 'Pexels Video',
        url: video.url,
        duration: video.duration,
        quality: best?.quality || 'hd',
        width: best?.width,
        height: best?.height,
        thumbnail: video.image,
        preview: video.video_files?.find(f => f.quality === 'sd')?.link || best?.link,
        downloadUrl: best?.link,
        author: video.user?.name,
        authorUrl: video.user?.url,
        premium: false,
        aspectRatio: best ? `${best.width}:${best.height}` : null
      };
    });
    return { videos, source: 'pexels' };
  } catch (err) {
    console.error('Pexels search error:', err.message);
    return { videos: [], source: 'pexels', error: err.message };
  }
}

async function searchPixabay(searchTerms, duration, quality) {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey) return { videos: [], source: 'pixabay', error: 'No API key' };

  const params = new URLSearchParams({
    key: apiKey,
    q: searchTerms,
    video_type: 'film',
    per_page: '15',
    page: '1',
    safesearch: 'true',
    order: 'popular',
  });
  if (quality === '4k') params.set('min_width', '3840');
  else if (quality === '1080p') params.set('min_width', '1920');

  const url = `https://pixabay.com/api/videos/?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Pixabay API error:', response.status);
      return { videos: [], source: 'pixabay', error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    const videos = (data.hits || []).map(video => {
      const vids = video.videos || {};
      const best = vids.large || vids.medium || vids.small || vids.tiny || {};

      return {
        id: `pixabay-${video.id}`,
        source: 'pixabay',
        name: video.tags || 'Pixabay Video',
        url: video.pageURL,
        duration: video.duration,
        quality: best === vids.large ? '1080p+' : best === vids.medium ? '720p' : 'SD',
        width: best.width,
        height: best.height,
        thumbnail: video.picture_id ? `https://i.vimeocdn.com/video/${video.picture_id}_295x166.jpg` : '',
        preview: (vids.small || vids.tiny || {}).url,
        downloadUrl: best.url,
        author: video.user,
        authorUrl: `https://pixabay.com/users/${video.user}-${video.user_id}/`,
        premium: false,
        views: video.views,
        downloads: video.downloads,
        likes: video.likes,
      };
    });
    return { videos, source: 'pixabay' };
  } catch (err) {
    console.error('Pixabay search error:', err.message);
    return { videos: [], source: 'pixabay', error: err.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { prompt, duration, quality = '1080p', sources, orientation } = body;

    if (!prompt) return Response.json({ error: 'Missing prompt' }, { status: 400 });

    const searchTerms = prompt.split(' ').slice(0, 8).join(' ');
    const enabledSources = sources || ['pexels', 'pixabay'];
    const pexelsOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';

    const searchPromises = [];
    if (enabledSources.includes('pexels'))  searchPromises.push(searchPexels(searchTerms, duration, quality, pexelsOrientation));
    if (enabledSources.includes('pixabay')) searchPromises.push(searchPixabay(searchTerms, duration, quality));

    const results = await Promise.all(searchPromises);

    // Interleave results from sources
    const allVideos = [];
    const maxLen = Math.max(...results.map(r => r.videos.length));
    for (let i = 0; i < maxLen; i++) {
      for (const result of results) {
        if (i < result.videos.length) {
          allVideos.push(result.videos[i]);
        }
      }
    }

    const sourceSummary = {};
    for (const result of results) {
      sourceSummary[result.source] = {
        count: result.videos.length,
        error: result.error || null,
      };
    }

    console.log(`B-Roll search "${searchTerms}": ${allVideos.length} total (${results.map(r => `${r.source}:${r.videos.length}`).join(', ')})`);

    return Response.json({
      success: true,
      videos: allVideos,
      total: allVideos.length,
      prompt: searchTerms,
      sources: sourceSummary,
    });
  } catch (error) {
    console.error('Error searching B-roll videos:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});