import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const API_KEY = Deno.env.get('YOUTUBE_API_KEY');

const RPM_MAP = {
  law: 30, finance: 20, insurance: 22, mortgage: 25, credit: 18,
  investing: 20, lawyer: 30, attorney: 30, tax: 18, accounting: 16,
  business: 12, technology: 10, tech: 10, software: 11, saas: 14,
  ai: 11, automation: 10, luxury: 12, health: 8, medical: 12,
  fitness: 6, psychology: 8, education: 7, real_estate: 16,
  crypto: 15, property: 14, home: 8, diet: 6, learn: 5, tutorial: 5,
};

function parseDuration(iso) {
  const match = (iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || 0) * 3600 + parseInt(match[2] || 0) * 60 + parseInt(match[3] || 0);
}

function estimateRpm(keyword) {
  const kw = keyword.toLowerCase();
  for (const [cat, rpm] of Object.entries(RPM_MAP)) {
    if (kw.includes(cat)) return rpm;
  }
  return 4;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { keyword, duration = "This Month", search_id } = await req.json();
  if (!keyword?.trim()) return Response.json({ error: "Keyword required" }, { status: 400 });

  try {
    const now = new Date();
    const publishedAfter = new Date();
    if (duration === 'Last 48h') publishedAfter.setDate(now.getDate() - 2);
    else if (duration === 'This Week') publishedAfter.setDate(now.getDate() - 7);
    else publishedAfter.setDate(now.getDate() - 30);

    const rpm = estimateRpm(keyword);

    // STEP 1: Search up to 100 videos (2 pages of 50)
    let allVideoItems = [];
    let nextPageToken = null;

    for (let page = 0; page < 2; page++) {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=viewCount&publishedAfter=${publishedAfter.toISOString()}&maxResults=50${nextPageToken ? `&pageToken=${nextPageToken}` : ''}&key=${API_KEY}`;
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();
      if (searchData.error) {
        if (search_id) await base44.asServiceRole.entities.Searches.update(search_id, { status: 'Failed' });
        return Response.json({ error: searchData.error.message }, { status: 500 });
      }
      if (searchData.items?.length) allVideoItems.push(...searchData.items);
      nextPageToken = searchData.nextPageToken;
      if (!nextPageToken) break;
    }

    if (!allVideoItems.length) {
      if (search_id) await base44.asServiceRole.entities.Searches.update(search_id, { status: 'Complete', result_count: 0 });
      return Response.json({ results: [], channels: [], count: 0 });
    }

    // STEP 2: Get video stats (batch in chunks of 50)
    const videoChunks = [];
    for (let i = 0; i < allVideoItems.length; i += 50) {
      videoChunks.push(allVideoItems.slice(i, i + 50));
    }

    let allVideoStats = [];
    for (const chunk of videoChunks) {
      const ids = chunk.map(v => v.id.videoId).join(',');
      const statsRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ids}&key=${API_KEY}`);
      const statsData = await statsRes.json();
      if (statsData.items) allVideoStats.push(...statsData.items);
    }

    // STEP 3: Get channel stats
    const uniqueChannelIds = [...new Set(allVideoStats.map(v => v.snippet.channelId))];
    const channelChunks = [];
    for (let i = 0; i < uniqueChannelIds.length; i += 50) {
      channelChunks.push(uniqueChannelIds.slice(i, i + 50));
    }

    const channelMap = {};
    for (const chunk of channelChunks) {
      const chanRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${chunk.join(',')}&key=${API_KEY}`);
      const chanData = await chanRes.json();
      for (const c of (chanData.items || [])) {
        channelMap[c.id] = {
          name: c.snippet.title,
          thumbnail: c.snippet.thumbnails?.medium?.url || c.snippet.thumbnails?.default?.url || "",
          subs: parseInt(c.statistics.subscriberCount || "0"),
          totalViews: parseInt(c.statistics.viewCount || "0"),
          videoCount: parseInt(c.statistics.videoCount || "0"),
        };
      }
    }

    // STEP 4: Build enriched video list
    const videos = allVideoStats.map(v => {
      const views = parseInt(v.statistics.viewCount || "0");
      const likes = parseInt(v.statistics.likeCount || "0");
      const comments = parseInt(v.statistics.commentCount || "0");
      const channelId = v.snippet.channelId;
      const ch = channelMap[channelId] || { subs: 0, totalViews: 0, videoCount: 0, name: v.snippet.channelTitle, thumbnail: "" };
      const published = new Date(v.snippet.publishedAt);
      const days = Math.max(1, (now - published) / 86400000);
      const vpd = views / days;
      const durationSec = parseDuration(v.contentDetails.duration);
      const isLongForm = durationSec >= 480;
      const oppScore = ch.subs > 0 ? views / ch.subs : (views > 1000 ? 100 : 0);
      const engagement = views > 0 ? ((likes + comments) / views) * 100 : 0;
      const estRevenue = (views / 1000) * rpm;
      const estMonthlyFromVideo = (vpd * 30 / 1000) * rpm;
      const profitScore = Math.log10(vpd + 1) * Math.min(oppScore, 500) * (rpm / 4) * (isLongForm ? 1.5 : 1);

      return {
        video_id: v.id,
        video_title: v.snippet.title,
        video_url: `https://www.youtube.com/watch?v=${v.id}`,
        thumbnail_url: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || "",
        channel_id: channelId,
        channel_name: ch.name,
        channel_thumbnail: ch.thumbnail,
        subscriber_count: ch.subs,
        channel_total_views: ch.totalViews,
        channel_video_count: ch.videoCount,
        view_count: views,
        likes,
        comments,
        views_per_day: parseFloat(vpd.toFixed(1)),
        duration_seconds: durationSec,
        long_form: isLongForm,
        published_date: v.snippet.publishedAt,
        opportunity_score: parseFloat(oppScore.toFixed(2)),
        engagement_pct: parseFloat(engagement.toFixed(2)),
        est_rpm: rpm,
        est_total_revenue: parseFloat(estRevenue.toFixed(2)),
        est_monthly_revenue: parseFloat(estMonthlyFromVideo.toFixed(2)),
        profitability_score: parseFloat(profitScore.toFixed(2)),
      };
    });

    // Sort by views desc
    videos.sort((a, b) => b.view_count - a.view_count);

    // STEP 5: Build channel-level summaries
    const channelGroups = {};
    for (const v of videos) {
      if (!channelGroups[v.channel_id]) {
        channelGroups[v.channel_id] = {
          channel_id: v.channel_id,
          channel_name: v.channel_name,
          channel_thumbnail: v.channel_thumbnail,
          subscriber_count: v.subscriber_count,
          channel_total_views: v.channel_total_views,
          channel_video_count: v.channel_video_count,
          videos: [],
          total_views_in_results: 0,
          avg_views: 0,
          avg_vpd: 0,
          avg_engagement: 0,
          max_views: 0,
          est_rpm: rpm,
          outlier_count: 0,
        };
      }
      const g = channelGroups[v.channel_id];
      g.videos.push(v);
      g.total_views_in_results += v.view_count;
      if (v.view_count > g.max_views) g.max_views = v.view_count;
    }

    const channels = Object.values(channelGroups).map(g => {
      const vids = g.videos;
      g.avg_views = Math.round(vids.reduce((s, v) => s + v.view_count, 0) / vids.length);
      g.avg_vpd = parseFloat((vids.reduce((s, v) => s + v.views_per_day, 0) / vids.length).toFixed(1));
      g.avg_engagement = parseFloat((vids.reduce((s, v) => s + v.engagement_pct, 0) / vids.length).toFixed(2));

      // Outlier count: videos that got >= 50% of the top video's views
      const threshold = g.max_views * 0.5;
      g.outlier_count = vids.filter(v => v.view_count >= threshold).length;

      // Est channel monthly revenue from these videos
      g.est_monthly_revenue = Math.round(vids.reduce((s, v) => s + v.est_monthly_revenue, 0));

      // Monetization likelihood
      const isMonetized = g.subscriber_count >= 1000 && g.channel_total_views > 150000;
      g.monetization_likely = isMonetized;

      return g;
    });

    channels.sort((a, b) => b.total_views_in_results - a.total_views_in_results);

    // Save top 100 videos to CachedVideos for backward compatibility
    const toCache = videos.slice(0, 100).map(v => ({
      search_id: search_id || '',
      video_title: v.video_title,
      video_id: v.video_id,
      channel_name: v.channel_name,
      view_count: v.view_count,
      subscriber_count: v.subscriber_count,
      views_per_day: v.views_per_day,
      long_form: v.long_form,
      duration_seconds: v.duration_seconds,
      published_date: v.published_date,
      opportunity_score: v.opportunity_score,
      profitability_score: v.profitability_score,
      niche_category: keyword,
      video_url: v.video_url,
      thumbnail_url: v.thumbnail_url,
    }));

    if (toCache.length > 0) {
      await base44.asServiceRole.entities.CachedVideos.bulkCreate(toCache);
    }

    if (search_id) {
      await base44.asServiceRole.entities.Searches.update(search_id, { status: 'Complete', result_count: videos.length });
    }

    return Response.json({
      results: videos.slice(0, 100),
      channels,
      count: videos.length,
      rpm_estimate: rpm,
      keyword,
    });
  } catch (error) {
    console.error("deepNicheAnalysis error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});