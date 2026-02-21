import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");
const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

const NICHE_KEYWORDS = [
  "AI automation tools",
  "credit repair tips",
  "passive income ideas",
  "cryptocurrency explained",
  "weight loss journey",
  "real estate investing",
  "personal finance tips",
  "true crime documentary",
  "tech reviews 2025",
  "car detailing",
  "cooking recipes easy",
  "motivation speech",
  "history documentary",
  "gaming highlights",
  "travel vlog",
  "meditation relaxation",
  "stock market trading",
  "DIY home improvement",
  "makeup tutorial",
  "dog training tips",
  "cybersecurity tips",
  "dropshipping tutorial",
  "sleep stories",
  "ASMR",
  "luxury lifestyle"
];

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

function getPublishedAfter(period) {
  const now = new Date();
  if (period === "daily") now.setDate(now.getDate() - 1);
  else if (period === "weekly") now.setDate(now.getDate() - 7);
  else now.setMonth(now.getMonth() - 1);
  return now.toISOString();
}

async function analyzeKeyword(keyword, period) {
  const publishedAfter = getPublishedAfter(period);

  // Search for videos
  const searchUrl = `${YOUTUBE_API}/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=viewCount&maxResults=10&publishedAfter=${publishedAfter}&key=${YOUTUBE_API_KEY}`;
  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();

  const videoIds = (searchData.items || []).map(i => i.id.videoId).filter(Boolean);
  if (videoIds.length === 0) return null;

  // Get video stats
  const statsUrl = `${YOUTUBE_API}/videos?part=statistics,contentDetails,snippet&id=${videoIds.join(",")}&key=${YOUTUBE_API_KEY}`;
  const statsRes = await fetch(statsUrl);
  if (!statsRes.ok) return null;
  const statsData = await statsRes.json();

  const videos = (statsData.items || []).map(v => {
    const views = parseInt(v.statistics.viewCount || 0);
    const subs = parseInt(v.statistics.likeCount || 0); // approximate engagement
    const durationSec = parseDuration(v.contentDetails.duration);
    const publishDate = new Date(v.snippet.publishedAt);
    const daysSince = Math.max(1, (Date.now() - publishDate.getTime()) / 86400000);
    const viewsPerDay = views / daysSince;
    return { views, viewsPerDay, durationSec, channel: v.snippet.channelTitle };
  });

  if (videos.length === 0) return null;

  const avgViews = Math.round(videos.reduce((s, v) => s + v.views, 0) / videos.length);
  const avgViewsPerDay = videos.reduce((s, v) => s + v.viewsPerDay, 0) / videos.length;
  
  // Get channel stats for top video to calc opportunity
  const topChannelIds = [...new Set((searchData.items || []).map(i => i.snippet.channelId))].slice(0, 5);
  let avgOppScore = 0;
  if (topChannelIds.length > 0) {
    const chUrl = `${YOUTUBE_API}/channels?part=statistics&id=${topChannelIds.join(",")}&key=${YOUTUBE_API_KEY}`;
    const chRes = await fetch(chUrl);
    if (chRes.ok) {
      const chData = await chRes.json();
      const subCounts = (chData.items || []).map(c => parseInt(c.statistics.subscriberCount || 1));
      const avgSubs = subCounts.reduce((s, c) => s + c, 0) / subCounts.length;
      avgOppScore = avgSubs > 0 ? Math.round((avgViews / avgSubs) * 10) / 10 : 0;
    }
  }

  // Estimate RPM based on niche category
  const highRpmKeywords = ["finance", "credit", "insurance", "lawyer", "mortgage", "investing", "real estate", "stock", "trading", "crypto"];
  const medRpmKeywords = ["tech", "software", "AI", "automation", "cybersecurity", "dropshipping"];
  const lowerKeyword = keyword.toLowerCase();
  let rpmEstimate = 4;
  if (highRpmKeywords.some(k => lowerKeyword.includes(k))) rpmEstimate = 18 + Math.random() * 12;
  else if (medRpmKeywords.some(k => lowerKeyword.includes(k))) rpmEstimate = 8 + Math.random() * 8;
  else rpmEstimate = 2 + Math.random() * 6;

  // Determine trend
  let growth = "stable";
  if (avgViewsPerDay > 5000) growth = "rising";
  else if (avgViewsPerDay < 500) growth = "declining";

  const topChannel = videos[0]?.channel || "Unknown";

  return {
    keyword,
    avg_views: avgViews,
    avg_opportunity_score: Math.min(avgOppScore, 100),
    video_count: videos.length,
    top_channel: topChannel,
    growth_trend: growth,
    avg_rpm_estimate: Math.round(rpmEstimate * 100) / 100,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { period = "daily" } = await req.json().catch(() => ({}));

    // Delete old data for this period
    const oldRecords = await base44.asServiceRole.entities.TrendingNiches.filter({ period });
    for (const r of oldRecords) {
      await base44.asServiceRole.entities.TrendingNiches.delete(r.id);
    }

    // Analyze each keyword
    const results = [];
    for (const keyword of NICHE_KEYWORDS) {
      try {
        const result = await analyzeKeyword(keyword, period);
        if (result) results.push(result);
      } catch (e) {
        console.error(`Failed to analyze ${keyword}:`, e.message);
      }
    }

    // Sort by a composite score (views * opportunity * rpm)
    results.sort((a, b) => {
      const scoreA = (a.avg_views / 1000) * (a.avg_opportunity_score + 1) * a.avg_rpm_estimate;
      const scoreB = (b.avg_views / 1000) * (b.avg_opportunity_score + 1) * b.avg_rpm_estimate;
      return scoreB - scoreA;
    });

    // Save ranked results
    const now = new Date().toISOString();
    const records = results.map((r, i) => ({
      ...r,
      period,
      rank: i + 1,
      snapshot_date: now,
    }));

    if (records.length > 0) {
      await base44.asServiceRole.entities.TrendingNiches.bulkCreate(records);
    }

    return Response.json({ success: true, count: records.length, period });
  } catch (error) {
    console.error("Error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});