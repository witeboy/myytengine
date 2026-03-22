import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { channel_id } = await req.json();
    if (!channel_id) return Response.json({ error: 'channel_id required' }, { status: 400 });

    const channels = await base44.asServiceRole.entities.Channels.filter({ id: channel_id });
    const channel = channels[0];
    if (!channel) return Response.json({ error: 'Channel not found' }, { status: 404 });

    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const niche = channel.niche_label || channel.niche || 'general';

    // ══════════════════════════════════════════════════════════════
    // STEP 1: Fetch YouTube trending data for the niche
    // ══════════════════════════════════════════════════════════════
    let trendingVideos = [];
    let searchTrends = [];

    if (youtubeApiKey) {
      // Search for recent popular videos in this niche
      const searchQueries = [
        niche,
        `${niche} 2024 2025`,
        `best ${niche} videos`,
      ];

      for (const query of searchQueries) {
        try {
          const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=viewCount&maxResults=10&publishedAfter=${getDateWeeksAgo(4)}&key=${youtubeApiKey}`;
          const res = await fetch(searchUrl);
          if (res.ok) {
            const data = await res.json();
            const videoIds = (data.items || []).map(v => v.id.videoId).filter(Boolean);
            
            if (videoIds.length > 0) {
              // Get view counts
              const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds.join(',')}&key=${youtubeApiKey}`;
              const statsRes = await fetch(statsUrl);
              if (statsRes.ok) {
                const statsData = await statsRes.json();
                for (const v of (statsData.items || [])) {
                  trendingVideos.push({
                    title: v.snippet.title,
                    views: parseInt(v.statistics.viewCount || '0'),
                    likes: parseInt(v.statistics.likeCount || '0'),
                    comments: parseInt(v.statistics.commentCount || '0'),
                    published: v.snippet.publishedAt,
                    channelTitle: v.snippet.channelTitle,
                  });
                }
              }
            }
          }
        } catch (err) {
          console.warn(`Search failed for "${query}":`, err.message);
        }
      }

      // Deduplicate and sort by views
      const seen = new Set();
      trendingVideos = trendingVideos.filter(v => {
        if (seen.has(v.title)) return false;
        seen.add(v.title);
        return true;
      }).sort((a, b) => b.views - a.views).slice(0, 20);

      console.log(`Found ${trendingVideos.length} trending videos for "${niche}"`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 2: AI analyzes trends and generates insights
    // ══════════════════════════════════════════════════════════════
    let insights = null;

    if (geminiApiKey) {
      const existingTopics = await base44.asServiceRole.entities.ChannelTopics.filter({ channel_id });
      const existingTitles = existingTopics.map(t => t.title).slice(0, 50);

      const prompt = `You are a YouTube content strategist analyzing the "${niche}" niche.

TRENDING VIDEOS (last 4 weeks, sorted by views):
${trendingVideos.slice(0, 15).map((v, i) => `${i + 1}. "${v.title}" — ${formatViews(v.views)} views, ${v.likes} likes, ${v.comments} comments (by ${v.channelTitle})`).join('\n') || 'No YouTube data available — use your knowledge of this niche.'}

EXISTING CHANNEL TOPICS (already planned):
${existingTitles.length > 0 ? existingTitles.map((t, i) => `${i + 1}. ${t}`).join('\n') : 'None yet'}

Channel posts: ${channel.shorts_per_day || 5} shorts/day + ${channel.longform_per_week || 3} long-form/week

Analyze and provide:
1. "trending_themes" — Top 5 themes/patterns in what's working NOW in this niche
2. "content_gaps" — 5 topic ideas that are trending but NOT covered by existing topics
3. "suggested_topics" — 10 NEW topic ideas (mix of short and long) based on current trends, viewer demand, and authority building
4. "posting_strategy" — Best days and times to post for this niche (with reasoning)
5. "audience_questions" — 5 questions viewers are actively asking that we should address
6. "growth_tips" — 3 specific actionable tips for growing in this niche right now
7. "competition_insight" — What top creators are doing well and where there's opportunity

Respond with ONLY valid JSON matching this structure:
{
  "trending_themes": [{"theme": "...", "why_hot": "...", "opportunity": "..."}],
  "content_gaps": [{"title": "...", "format": "short|long", "reason": "..."}],
  "suggested_topics": [{"title": "...", "format": "short|long", "rationale": "...", "trend_score": 1-100}],
  "posting_strategy": {"best_short_times": ["9:00 AM", "12:00 PM", "6:00 PM"], "best_long_times": ["2:00 PM", "5:00 PM"], "best_days": {"shorts": "daily", "longform": "Tue, Thu, Sat"}, "reasoning": "..."},
  "audience_questions": ["...", "..."],
  "growth_tips": [{"tip": "...", "impact": "high|medium"}],
  "competition_insight": "..."
}`;

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.5, maxOutputTokens: 8192, responseMimeType: "application/json" }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            insights = JSON.parse(text);
            console.log('✓ AI insights generated successfully');
          }
        }
      } catch (err) {
        console.warn('AI insights generation failed:', err.message);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 3: Store insights on the channel
    // ══════════════════════════════════════════════════════════════
    const insightsData = {
      trending_videos: trendingVideos.slice(0, 10),
      ...(insights || {}),
      refreshed_at: new Date().toISOString(),
    };

    await base44.asServiceRole.entities.Channels.update(channel_id, {
      ai_insights: JSON.stringify(insightsData),
      last_trend_refresh: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      insights: insightsData,
    });
  } catch (error) {
    console.error("fetchNicheTrends error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getDateWeeksAgo(weeks) {
  const d = new Date();
  d.setDate(d.getDate() - (weeks * 7));
  return d.toISOString();
}

function formatViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}