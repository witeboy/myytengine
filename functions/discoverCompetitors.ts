import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const API_KEY = Deno.env.get('YOUTUBE_API_KEY');
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');

function parseDuration(iso) {
  const match = (iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || 0) * 3600 + parseInt(match[2] || 0) * 60 + parseInt(match[3] || 0);
}

function estimateCpm(niche) {
  const kw = (niche || '').toLowerCase();
  if (/financ|invest|money|credit|mortgage|insur|tax|bank|wealth/.test(kw)) return { label: '$12-30 (Finance)', val: 20 };
  if (/law|legal|attorney|lawyer/.test(kw)) return { label: '$15-40 (Legal)', val: 25 };
  if (/tech|software|saas|ai |automation/.test(kw)) return { label: '$8-15 (Tech)', val: 11 };
  if (/health|medical|fitness|diet/.test(kw)) return { label: '$6-12 (Health)', val: 8 };
  if (/educa|learn|tutorial|course/.test(kw)) return { label: '$5-10 (Education)', val: 7 };
  if (/real.?estate|property|home/.test(kw)) return { label: '$10-25 (Real Estate)', val: 16 };
  if (/crim|mystery|detective|murder/.test(kw)) return { label: '$4-8 (True Crime)', val: 6 };
  if (/gam|esport|stream/.test(kw)) return { label: '$3-6 (Gaming)', val: 4 };
  return { label: '$3-5 (General)', val: 4 };
}

function formatViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!API_KEY) return Response.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 500 });

    const { channel_id } = await req.json();
    if (!channel_id) return Response.json({ error: 'channel_id required' }, { status: 400 });

    const channels = await base44.asServiceRole.entities.Channels.filter({ id: channel_id });
    const channel = channels[0];
    if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });

    const niche = channel.niche_label || channel.niche || 'general';
    const cpm = estimateCpm(niche);

    // Build search queries from channel niche and topic keywords
    const existingTopics = await base44.asServiceRole.entities.ChannelTopics.filter({ channel_id });
    const topicTitles = existingTopics.map(t => t.title).slice(0, 20);
    
    // Extract key themes from topics for better competitor discovery
    const searchQueries = [
      `${niche} youtube channel`,
      `${niche} faceless channel`,
    ];
    if (topicTitles.length > 0) {
      // Pick 2 representative topic keywords
      const sampleTopics = topicTitles.slice(0, 3).map(t => t.split(' ').slice(0, 4).join(' '));
      searchQueries.push(...sampleTopics);
    }

    console.log(`Discovering competitors for "${niche}" with ${searchQueries.length} queries`);

    // STEP 1: Search for competitor channels
    const discoveredChannels = new Map();
    
    for (const query of searchQueries.slice(0, 4)) {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=5&key=${API_KEY}`;
      const res = await fetch(searchUrl);
      if (res.ok) {
        const data = await res.json();
        for (const item of (data.items || [])) {
          const cid = item.id.channelId;
          if (!discoveredChannels.has(cid)) {
            discoveredChannels.set(cid, item.snippet.title);
          }
        }
      }
    }

    // Also search by video to find channels making similar content
    const videoSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(niche)}&type=video&order=viewCount&maxResults=20&publishedAfter=${getDateWeeksAgo(8)}&key=${API_KEY}`;
    const videoRes = await fetch(videoSearchUrl);
    if (videoRes.ok) {
      const videoData = await videoRes.json();
      for (const item of (videoData.items || [])) {
        const cid = item.snippet.channelId;
        if (!discoveredChannels.has(cid)) {
          discoveredChannels.set(cid, item.snippet.channelTitle);
        }
      }
    }

    const allChannelIds = [...discoveredChannels.keys()].slice(0, 15);
    if (allChannelIds.length === 0) {
      return Response.json({ success: true, competitors: [], ai_summary: null });
    }

    // STEP 2: Get channel details to rank them
    const chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${allChannelIds.join(',')}&key=${API_KEY}`;
    const chanRes = await fetch(chanUrl);
    const chanData = await chanRes.json();

    if (!chanData.items?.length) {
      return Response.json({ success: true, competitors: [], ai_summary: null });
    }

    // Sort by subscriber count and pick top 5 most relevant
    const ranked = chanData.items
      .map(c => ({
        ...c,
        subs: parseInt(c.statistics.subscriberCount || '0'),
        views: parseInt(c.statistics.viewCount || '0'),
      }))
      .sort((a, b) => b.subs - a.subs)
      .slice(0, 5);

    console.log(`Analyzing top ${ranked.length} competitors`);

    // STEP 3: Deep-dive each competitor
    const competitors = [];

    for (const ch of ranked) {
      const uploadsId = ch.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsId) continue;

      const subCount = ch.subs;
      const totalViews = ch.views;
      const videoCount = parseInt(ch.statistics.videoCount || '0');

      // Get last 15 videos
      const vidsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsId}&maxResults=15&key=${API_KEY}`;
      const vidsRes = await fetch(vidsUrl);
      const vidsData = await vidsRes.json();
      if (!vidsData.items?.length) continue;

      const videoIds = vidsData.items.map(v => v.contentDetails.videoId).join(',');
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${API_KEY}`;
      const statsRes = await fetch(statsUrl);
      const statsData = await statsRes.json();
      if (!statsData.items?.length) continue;

      let totalEngagement = 0, totalVpd = 0, totalOpp = 0, longFormCount = 0, viralHits = 0;
      const monSignals = new Set();
      const recentVideos = [];

      for (const v of statsData.items) {
        const views = parseInt(v.statistics.viewCount || '0');
        const likes = parseInt(v.statistics.likeCount || '0');
        const comments = parseInt(v.statistics.commentCount || '0');
        const durationSec = parseDuration(v.contentDetails.duration);
        const isLongForm = durationSec >= 480;
        if (isLongForm) longFormCount++;

        const published = new Date(v.snippet.publishedAt);
        const days = Math.max(1, (Date.now() - published.getTime()) / 86400000);
        const vpd = views / days;
        totalVpd += vpd;

        const engagement = views > 0 ? (likes + comments) / views : 0;
        totalEngagement += engagement;
        const oppScore = subCount > 0 ? views / subCount : 0;
        totalOpp += oppScore;
        if (views > subCount) viralHits++;

        const desc = (v.snippet.description || '').toLowerCase();
        if (desc.includes('use my link') || desc.includes('use code')) monSignals.add('affiliate');
        if (desc.includes('sponsored by') || desc.includes('sponsor')) monSignals.add('sponsor');
        if (/https?:\/\/(?!youtu|twitter|instagram|tiktok|facebook)/.test(desc)) monSignals.add('external_site');

        recentVideos.push({
          title: v.snippet.title?.slice(0, 100),
          views, likes, comments,
          vpd: Math.round(vpd),
          duration_sec: durationSec,
          is_long_form: isLongForm,
          engagement_pct: parseFloat((engagement * 100).toFixed(2)),
          opp_score: parseFloat(oppScore.toFixed(2)),
          published: v.snippet.publishedAt,
          thumbnail: v.snippet.thumbnails?.medium?.url || '',
        });
      }

      const count = statsData.items.length;
      const avgVpd = totalVpd / count;
      const avgEngagement = totalEngagement / count;
      const avgOpp = totalOpp / count;
      const longFormRatio = longFormCount / count;

      let monConf = 0;
      if (subCount >= 1000) monConf += 0.25;
      if (totalViews > 150000) monConf += 0.25;
      if (longFormRatio >= 0.5) monConf += 0.2;
      if (monSignals.size >= 2) monConf += 0.3;
      else if (monSignals.size >= 1) monConf += 0.15;
      monConf = Math.min(1, monConf);

      // Growth velocity
      const sorted = [...recentVideos].sort((a, b) => new Date(a.published) - new Date(b.published));
      const half = Math.floor(sorted.length / 2);
      const olderAvg = sorted.slice(0, half).reduce((s, v) => s + v.vpd, 0) / (half || 1);
      const newerAvg = sorted.slice(half).reduce((s, v) => s + v.vpd, 0) / ((sorted.length - half) || 1);
      const growthVelocity = olderAvg > 0 ? ((newerAvg - olderAvg) / olderAvg) * 100 : 0;

      const estMonthlyViews = avgVpd * 30 * Math.min(videoCount, 30) / 10;
      const estMonthlyRevenue = (estMonthlyViews / 1000) * cpm.val * monConf;

      // Top performing (sorted by views)
      const topPerforming = [...recentVideos].sort((a, b) => b.views - a.views).slice(0, 5);
      // Viral/overperforming (opp_score > 1 means views > subs)
      const viralVideos = recentVideos.filter(v => v.opp_score > 1).sort((a, b) => b.opp_score - a.opp_score);

      let grade = 'C-Tier';
      if (monConf >= 0.7 && avgEngagement > 0.04 && viralHits >= 3) grade = 'S-Tier';
      else if (monConf >= 0.5 && viralHits >= 2) grade = 'A-Tier';
      else if (viralHits >= 3 || (avgEngagement > 0.03 && longFormRatio > 0.5)) grade = 'B-Tier';

      competitors.push({
        channel_id: ch.id,
        name: ch.snippet.title,
        description: ch.snippet.description?.slice(0, 200),
        thumbnail: ch.snippet.thumbnails?.medium?.url || '',
        subscribers: subCount,
        total_views: totalViews,
        video_count: videoCount,
        avg_views_per_day: Math.round(avgVpd),
        avg_engagement_pct: parseFloat((avgEngagement * 100).toFixed(2)),
        long_form_ratio: parseFloat((longFormRatio * 100).toFixed(0)),
        viral_hits: viralHits,
        monetization_confidence: parseFloat(monConf.toFixed(2)),
        monetization_signals: [...monSignals],
        grade,
        growth_velocity: parseFloat(growthVelocity.toFixed(1)),
        est_monthly_revenue: Math.round(estMonthlyRevenue),
        cpm_category: cpm.label,
        recent_videos: recentVideos.slice(0, 10),
        top_performing: topPerforming,
        viral_videos: viralVideos.slice(0, 5),
      });
    }

    // Sort: S > A > B > C, then by subscribers
    const gradeOrder = { 'S-Tier': 0, 'A-Tier': 1, 'B-Tier': 2, 'C-Tier': 3 };
    competitors.sort((a, b) => (gradeOrder[a.grade] || 3) - (gradeOrder[b.grade] || 3) || b.subscribers - a.subscribers);

    // STEP 4: AI competitive summary
    let aiSummary = null;
    if (GEMINI_KEY && competitors.length > 0) {
      const summaryData = competitors.slice(0, 5).map(r => ({
        name: r.name, subs: formatViews(r.subscribers), grade: r.grade,
        avgVpd: r.avg_views_per_day, engagement: r.avg_engagement_pct,
        growth: r.growth_velocity, revenue: r.est_monthly_revenue,
        topVideo: r.top_performing[0]?.title,
        topVideoViews: formatViews(r.top_performing[0]?.views || 0),
      }));

      try {
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `You are an expert YouTube competitive analyst for the "${niche}" niche.

COMPETITORS FOUND:
${JSON.stringify(summaryData, null, 2)}

OUR CHANNEL TOPICS:
${topicTitles.slice(0, 15).join('\n')}

Analyze these competitors and provide strategic intelligence. Be specific and actionable.

Respond with ONLY valid JSON:
{
  "biggest_threat": "name of the most dangerous competitor and why in 1 sentence",
  "fastest_growing": "name of fastest growing competitor",
  "content_strategies": ["3 specific content strategies these competitors are using successfully"],
  "topics_they_cover": ["5 specific topic themes that are working well for competitors"],
  "gaps_we_can_exploit": ["3 specific content gaps or angles competitors are missing that we should target"],
  "thumbnail_patterns": "what thumbnail style/pattern seems to work best in this niche",
  "posting_frequency": "observed posting patterns of top competitors",
  "threat_level": "low|medium|high"
}` }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json' }
            })
          }
        );
        if (gemRes.ok) {
          const gemData = await gemRes.json();
          const text = gemData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) aiSummary = JSON.parse(text);
        }
      } catch (err) {
        console.warn('AI summary failed:', err.message);
      }
    }

    // Save to channel for caching
    await base44.asServiceRole.entities.Channels.update(channel_id, {
      ai_insights: JSON.stringify({
        ...(channel.ai_insights ? (() => { try { return JSON.parse(channel.ai_insights); } catch (_) { return {}; } })() : {}),
        competitor_data: {
          competitors: competitors.slice(0, 5),
          ai_summary: aiSummary,
          refreshed_at: new Date().toISOString(),
        }
      })
    });

    return Response.json({ success: true, competitors: competitors.slice(0, 5), ai_summary: aiSummary });
  } catch (error) {
    console.error('discoverCompetitors error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getDateWeeksAgo(weeks) {
  const d = new Date();
  d.setDate(d.getDate() - (weeks * 7));
  return d.toISOString();
}