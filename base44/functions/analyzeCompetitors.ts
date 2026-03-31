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
  if (/financ|invest|money|credit|mortgage|insur|tax|bank/.test(kw)) return { label: '$12-30 (Finance)', val: 20 };
  if (/law|legal|attorney|lawyer/.test(kw)) return { label: '$15-40 (Legal)', val: 25 };
  if (/tech|software|saas|ai |automation/.test(kw)) return { label: '$8-15 (Tech)', val: 11 };
  if (/health|medical|fitness|diet/.test(kw)) return { label: '$6-12 (Health)', val: 8 };
  if (/educa|learn|tutorial|course/.test(kw)) return { label: '$5-10 (Education)', val: 7 };
  if (/real estate|property|home/.test(kw)) return { label: '$10-25 (Real Estate)', val: 16 };
  return { label: '$3-5 (General)', val: 4 };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!API_KEY) return Response.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 500 });

    const { channel_ids, niche } = await req.json();
    if (!channel_ids?.length) return Response.json({ error: 'channel_ids required' }, { status: 400 });

    const ids = channel_ids.slice(0, 3);
    const cpm = estimateCpm(niche);

    // STEP 1: Get channel details
    const chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails,brandingSettings&id=${ids.join(',')}&key=${API_KEY}`;
    const chanRes = await fetch(chanUrl);
    const chanData = await chanRes.json();

    if (chanData.error) {
      console.error('YouTube Channels API error:', JSON.stringify(chanData.error));
      return Response.json({ error: chanData.error.message || 'YouTube API error' }, { status: 500 });
    }

    if (!chanData.items?.length) {
      return Response.json({ error: 'No channels found for those IDs' }, { status: 404 });
    }

    const results = [];

    for (const channel of chanData.items) {
      const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
      const subCount = parseInt(channel.statistics.subscriberCount || '0');
      const totalViews = parseInt(channel.statistics.viewCount || '0');
      const videoCount = parseInt(channel.statistics.videoCount || '0');

      // STEP 2: Get last 15 videos
      let recentVideos = [];
      if (uploadsId) {
        const vidsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsId}&maxResults=15&key=${API_KEY}`;
        const vidsRes = await fetch(vidsUrl);
        const vidsData = await vidsRes.json();

        if (vidsData.items?.length) {
          const videoIds = vidsData.items.map(v => v.contentDetails.videoId).join(',');
          const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${API_KEY}`;
          const statsRes = await fetch(statsUrl);
          const statsData = await statsRes.json();

          let totalEngagement = 0;
          let totalVpd = 0;
          let totalOpp = 0;
          let longFormCount = 0;
          let viralHits = 0;
          const monSignals = new Set();

          for (const v of (statsData.items || [])) {
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
            if (desc.includes('discount') || /\d+%\s*off/.test(desc)) monSignals.add('discount');

            recentVideos.push({
              title: v.snippet.title?.slice(0, 80),
              views,
              likes,
              comments,
              vpd: Math.round(vpd),
              duration_sec: durationSec,
              is_long_form: isLongForm,
              engagement_pct: parseFloat((engagement * 100).toFixed(2)),
              opp_score: parseFloat(oppScore.toFixed(2)),
              published: v.snippet.publishedAt,
              thumbnail: v.snippet.thumbnails?.medium?.url || '',
            });
          }

          const count = statsData.items?.length || 1;
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

          let grade = 'C-Tier';
          if (monConf >= 0.7 && avgEngagement > 0.04 && viralHits >= 3) grade = 'S-Tier';
          else if (monConf >= 0.5 && viralHits >= 2) grade = 'A-Tier';
          else if (viralHits >= 3 || (avgEngagement > 0.03 && longFormRatio > 0.5)) grade = 'B-Tier';

          results.push({
            channel_id: channel.id,
            name: channel.snippet.title,
            description: channel.snippet.description?.slice(0, 200),
            thumbnail: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url || '',
            subscribers: subCount,
            total_views: totalViews,
            video_count: videoCount,
            avg_views_per_day: Math.round(avgVpd),
            avg_engagement_pct: parseFloat((avgEngagement * 100).toFixed(2)),
            avg_opportunity_score: parseFloat(avgOpp.toFixed(2)),
            long_form_ratio: parseFloat((longFormRatio * 100).toFixed(0)),
            viral_hits: viralHits,
            monetization_confidence: parseFloat(monConf.toFixed(2)),
            monetization_signals: [...monSignals],
            grade,
            growth_velocity: parseFloat(growthVelocity.toFixed(1)),
            est_monthly_revenue: Math.round(estMonthlyRevenue),
            cpm_category: cpm.label,
            recent_videos: recentVideos.slice(0, 10),
          });
        }
      }
    }

    // STEP 3: AI comparison summary
    let aiSummary = null;
    if (GEMINI_KEY && results.length > 1) {
      const summaryData = results.map(r => ({
        name: r.name, subs: r.subscribers, grade: r.grade,
        avgVpd: r.avg_views_per_day, engagement: r.avg_engagement_pct,
        growth: r.growth_velocity, revenue: r.est_monthly_revenue,
        viralHits: r.viral_hits, longForm: r.long_form_ratio,
      }));

      try {
        const gemRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `You are a YouTube competitive analyst. Compare these ${results.length} channels in the "${niche || 'general'}" niche and provide actionable insights.

CHANNEL DATA:
${JSON.stringify(summaryData, null, 2)}

Respond with ONLY valid JSON:
{
  "winner": "channel name with best overall performance",
  "fastest_growing": "channel name growing fastest",
  "key_differences": ["3 key strategic differences between these channels"],
  "opportunities": ["3 content gaps or strategies a new competitor could exploit"],
  "threat_level": "low|medium|high — how hard it would be to compete with these channels"
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

    return Response.json({ success: true, competitors: results, ai_summary: aiSummary });
  } catch (error) {
    console.error('analyzeCompetitors error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});