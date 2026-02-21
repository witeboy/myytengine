import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const API_KEY = Deno.env.get('YOUTUBE_API_KEY');
const MAX_RESULTS = 30;

const RPM_MULTIPLIERS = {
  law: 5, finance: 5, insurance: 5, business: 4,
  technology: 3, luxury: 3, health: 4, psychology: 3,
  education: 2, entertainment: 1, crypto: 4, real_estate: 4,
  mortgage: 5, credit: 4, investing: 5, lawyer: 5,
  attorney: 5, tax: 4, accounting: 4, software: 3,
  saas: 4, ai: 3, automation: 3
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!API_KEY) {
      return Response.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 500 });
    }

    const { keyword, duration, search_id } = await req.json();

    if (!keyword) {
      return Response.json({ error: 'Missing keyword' }, { status: 400 });
    }

    const now = new Date();
    let publishedAfter = new Date();

    if (duration === 'Last 48h') publishedAfter.setDate(now.getDate() - 2);
    else if (duration === 'This Week') publishedAfter.setDate(now.getDate() - 7);
    else publishedAfter.setDate(now.getDate() - 30);

    // STEP 1 — Search YouTube
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&q=${encodeURIComponent(keyword)}` +
      `&type=video&order=viewCount` +
      `&publishedAfter=${publishedAfter.toISOString()}` +
      `&maxResults=${MAX_RESULTS}&key=${API_KEY}`;

    console.log(`Searching YouTube: "${keyword}" (${duration})`);
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error) {
      console.error('YouTube Search API error:', JSON.stringify(searchData.error));
      if (search_id) {
        await base44.asServiceRole.entities.Searches.update(search_id, { status: 'Failed' });
      }
      return Response.json({ error: searchData.error.message || 'YouTube API error' }, { status: 500 });
    }

    const videos = searchData.items;
    if (!videos || videos.length === 0) {
      if (search_id) {
        await base44.asServiceRole.entities.Searches.update(search_id, { status: 'Complete', result_count: 0 });
      }
      return Response.json({ success: true, results: [], count: 0 });
    }

    const videoIds = videos.map(v => v.id.videoId).join(',');
    const channelIds = [...new Set(videos.map(v => v.snippet.channelId))].join(',');

    // STEP 2 — Video details
    const statsUrl =
      `https://www.googleapis.com/youtube/v3/videos?` +
      `part=statistics,contentDetails,snippet&id=${videoIds}&key=${API_KEY}`;
    const statsRes = await fetch(statsUrl);
    const statsData = await statsRes.json();

    // STEP 3 — Channel details
    const chanUrl =
      `https://www.googleapis.com/youtube/v3/channels?` +
      `part=statistics&id=${channelIds}&key=${API_KEY}`;
    const chanRes = await fetch(chanUrl);
    const chanData = await chanRes.json();

    const channelStatsMap = {};
    (chanData.items || []).forEach(c => {
      channelStatsMap[c.id] = parseInt(c.statistics.subscriberCount || 1);
    });

    const results = (statsData.items || []).map(video => {
      const views = parseInt(video.statistics.viewCount || 0);
      const subs = channelStatsMap[video.snippet.channelId] || 1;
      const published = new Date(video.snippet.publishedAt);
      const days = Math.max(1, (now - published) / (1000 * 60 * 60 * 24));
      const viewsPerDay = views / days;

      const durationISO = video.contentDetails.duration;
      const isLongForm = durationISO.includes('M') || durationISO.includes('H');

      const opportunityScore = views / (subs === 0 ? 1 : subs);

      const keywordLower = keyword.toLowerCase();
      let multiplier = 2;
      for (const cat in RPM_MULTIPLIERS) {
        if (keywordLower.includes(cat)) {
          multiplier = RPM_MULTIPLIERS[cat];
          break;
        }
      }

      const profitabilityScore = (viewsPerDay * opportunityScore) * multiplier * (isLongForm ? 1.3 : 1);

      return {
        search_id: search_id || '',
        video_title: video.snippet.title,
        video_id: video.id,
        channel_name: video.snippet.channelTitle,
        view_count: views,
        subscriber_count: subs,
        views_per_day: parseFloat(viewsPerDay.toFixed(2)),
        long_form: isLongForm,
        opportunity_score: parseFloat(opportunityScore.toFixed(2)),
        profitability_score: parseFloat(profitabilityScore.toFixed(2)),
        niche_category: keyword,
        video_url: `https://www.youtube.com/watch?v=${video.id}`
      };
    });

    const filtered = results
      .filter(r => r.opportunity_score > 2)
      .sort((a, b) => b.profitability_score - a.profitability_score);

    console.log(`Found ${filtered.length} opportunities from ${results.length} videos`);

    // Save to CachedVideos
    if (filtered.length > 0) {
      await base44.asServiceRole.entities.CachedVideos.bulkCreate(filtered);
    }

    // Update search status
    if (search_id) {
      await base44.asServiceRole.entities.Searches.update(search_id, {
        status: 'Complete',
        result_count: filtered.length
      });
    }

    return Response.json({ success: true, results: filtered, count: filtered.length });

  } catch (error) {
    console.error('analyzeNiche error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});