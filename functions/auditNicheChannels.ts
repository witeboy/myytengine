import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const API_KEY = Deno.env.get("YOUTUBE_API_KEY");

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { keyword, maxChannels = 5 } = await req.json();
  if (!keyword?.trim()) return Response.json({ error: "Keyword required" }, { status: 400 });

  try {
    // STEP 1: Search for channels by keyword
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=channel&maxResults=${maxChannels}&key=${API_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchData.items?.length) {
      return Response.json({ error: "No channels found for this keyword", results: [] });
    }

    const channelIds = searchData.items.map(c => c.id.channelId).join(",");

    // STEP 2: Get channel details (subs, views, uploads playlist)
    const chanUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelIds}&key=${API_KEY}`;
    const chanRes = await fetch(chanUrl);
    const chanData = await chanRes.json();

    const auditResults = [];

    // STEP 3: Deep-dive each channel
    for (const channel of chanData.items) {
      const uploadsId = channel.contentDetails.relatedPlaylists.uploads;
      const subCount = parseInt(channel.statistics.subscriberCount || "0");
      const totalViews = parseInt(channel.statistics.viewCount || "0");
      const videoCount = parseInt(channel.statistics.videoCount || "0");

      // Get last 10 videos
      const vidsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${uploadsId}&maxResults=10&key=${API_KEY}`;
      const vidsRes = await fetch(vidsUrl);
      const vidsData = await vidsRes.json();

      if (!vidsData.items?.length) continue;

      const recentVideoIds = vidsData.items.map(v => v.contentDetails.videoId).join(",");

      // Get detailed stats + content details for these videos
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${recentVideoIds}&key=${API_KEY}`;
      const statsRes = await fetch(statsUrl);
      const statsData = await statsRes.json();

      if (!statsData.items?.length) continue;

      let totalEngagementRatio = 0;
      let viralHits = 0;
      let longFormCount = 0;
      let totalViewsPerDay = 0;
      let totalOppScore = 0;
      const recentVideos = [];
      const monetizationSignals = [];

      for (const v of statsData.items) {
        const views = parseInt(v.statistics.viewCount || "1");
        const likes = parseInt(v.statistics.likeCount || "0");
        const comments = parseInt(v.statistics.commentCount || "0");
        const title = v.snippet.title || "";
        const description = (v.snippet.description || "").toLowerCase();

        // Parse duration (ISO 8601 PT format)
        const durMatch = (v.contentDetails.duration || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const hours = parseInt(durMatch?.[1] || "0");
        const minutes = parseInt(durMatch?.[2] || "0");
        const seconds = parseInt(durMatch?.[3] || "0");
        const durationSec = hours * 3600 + minutes * 60 + seconds;
        const isLongForm = durationSec >= 480; // 8+ min
        if (isLongForm) longFormCount++;

        // Views per day
        const publishDate = new Date(v.snippet.publishedAt);
        const daysSincePublish = Math.max(1, (Date.now() - publishDate.getTime()) / 86400000);
        const vpd = views / daysSincePublish;
        totalViewsPerDay += vpd;

        // Engagement density
        const engagement = (likes + comments) / views;
        totalEngagementRatio += engagement;

        // Viral multiplier (CTR proxy)
        const oppScore = subCount > 0 ? views / subCount : 0;
        totalOppScore += oppScore;
        if (views > subCount) viralHits++;

        // Monetization signal detection in descriptions
        const monSignals = [];
        if (description.includes("use my link") || description.includes("use code")) monSignals.push("affiliate_link");
        if (description.includes("sponsored by") || description.includes("sponsor")) monSignals.push("sponsor");
        if (description.includes("affiliate")) monSignals.push("affiliate_tag");
        if (/https?:\/\/(?!youtu|twitter|instagram|tiktok|facebook)/.test(description)) monSignals.push("external_website");
        if (description.includes("discount") || /\d+%\s*off/.test(description)) monSignals.push("discount_code");
        if (monSignals.length) monetizationSignals.push(...monSignals);

        recentVideos.push({
          title: title.slice(0, 80),
          views,
          likes,
          comments,
          vpd: Math.round(vpd),
          duration_sec: durationSec,
          opp_score: parseFloat(oppScore.toFixed(2)),
          engagement_pct: parseFloat((engagement * 100).toFixed(2)),
          published: v.snippet.publishedAt,
        });
      }

      const videoAnalyzed = statsData.items.length;
      const avgViewsPerDay = totalViewsPerDay / videoAnalyzed;
      const avgOppScore = totalOppScore / videoAnalyzed;
      const avgEngagement = totalEngagementRatio / videoAnalyzed;
      const longFormRatio = longFormCount / videoAnalyzed;

      // Monetization confidence (0-1)
      const uniqueSignals = [...new Set(monetizationSignals)];
      let monConf = 0;
      if (subCount >= 1000) monConf += 0.25;
      if (totalViews > 150000) monConf += 0.25;
      if (longFormRatio >= 0.5) monConf += 0.2;
      if (uniqueSignals.length >= 2) monConf += 0.3;
      else if (uniqueSignals.length >= 1) monConf += 0.15;
      monConf = Math.min(1, monConf);

      const monLikelihood = monConf >= 0.7 ? "High" : monConf >= 0.4 ? "Medium" : "Low";

      // CTR proxy score (normalized viral multiplier)
      const estimatedCTR = Math.min(10, avgOppScore * 2);

      // Retention proxy score (engagement density normalized)
      const estimatedRetention = Math.min(10, avgEngagement * 100 * 1.5);

      // Channel Profitability Score
      const profitScore =
        avgViewsPerDay *
        Math.max(0.1, avgOppScore) *
        Math.max(0.1, monConf) *
        Math.max(0.1, longFormRatio) *
        Math.max(0.01, avgEngagement);

      // Grade
      let grade = "C-Tier";
      if (monConf >= 0.7 && avgEngagement > 0.04 && viralHits >= 3) grade = "S-Tier";
      else if (monConf >= 0.5 && viralHits >= 2) grade = "A-Tier";
      else if (viralHits >= 3 || (avgEngagement > 0.03 && longFormRatio > 0.5)) grade = "B-Tier";

      // CPM estimation by engagement+niche signals
      let avgCpm = "$3-5 (General)";
      let cpmVal = 4;
      const kw = keyword.toLowerCase();
      if (/financ|invest|money|credit|mortgage|loan|insur|tax|bank/.test(kw)) { avgCpm = "$12-30 (Finance)"; cpmVal = 20; }
      else if (/law|legal|attorney|lawyer/.test(kw)) { avgCpm = "$15-40 (Legal)"; cpmVal = 25; }
      else if (/tech|software|saas|ai |automation/.test(kw)) { avgCpm = "$8-15 (Tech)"; cpmVal = 11; }
      else if (/health|medical|fitness|diet/.test(kw)) { avgCpm = "$6-12 (Health)"; cpmVal = 8; }
      else if (/educa|learn|tutorial|course/.test(kw)) { avgCpm = "$5-10 (Education)"; cpmVal = 7; }
      else if (/real estate|property|home/.test(kw)) { avgCpm = "$10-25 (Real Estate)"; cpmVal = 16; }

      const estMonthlyViews = avgViewsPerDay * 30 * videoCount / 10; // rough monthly estimate
      const estMonthlyRevenue = (estMonthlyViews / 1000) * cpmVal * monConf;

      // Growth velocity: compare first 5 vs last 5 videos
      const sorted = [...recentVideos].sort((a, b) => new Date(a.published) - new Date(b.published));
      const olderHalf = sorted.slice(0, Math.floor(sorted.length / 2));
      const newerHalf = sorted.slice(Math.floor(sorted.length / 2));
      const olderAvgVpd = olderHalf.reduce((s, v) => s + v.vpd, 0) / (olderHalf.length || 1);
      const newerAvgVpd = newerHalf.reduce((s, v) => s + v.vpd, 0) / (newerHalf.length || 1);
      const growthVelocity = olderAvgVpd > 0 ? ((newerAvgVpd - olderAvgVpd) / olderAvgVpd) * 100 : 0;

      // Save to database
      const auditRecord = await base44.entities.NicheAudits.create({
        search_keyword: keyword.trim(),
        channel_id: channel.id,
        channel_name: channel.snippet.title,
        channel_url: `https://www.youtube.com/channel/${channel.id}`,
        channel_thumbnail: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url || "",
        subscriber_count: subCount,
        total_views: totalViews,
        video_count: videoCount,
        monetization_likelihood: monLikelihood,
        monetization_confidence: parseFloat(monConf.toFixed(2)),
        monetization_signals: JSON.stringify(uniqueSignals),
        estimated_ctr_score: parseFloat(estimatedCTR.toFixed(2)),
        estimated_retention_score: parseFloat(estimatedRetention.toFixed(2)),
        avg_views_per_day: Math.round(avgViewsPerDay),
        avg_opportunity_score: parseFloat(avgOppScore.toFixed(2)),
        long_form_ratio: parseFloat(longFormRatio.toFixed(2)),
        engagement_density: parseFloat((avgEngagement * 100).toFixed(2)),
        viral_consistency: viralHits,
        channel_profitability_score: parseFloat(profitScore.toFixed(2)),
        profitability_grade: grade,
        avg_cpm_category: avgCpm,
        estimated_monthly_revenue: Math.round(estMonthlyRevenue),
        growth_velocity: parseFloat(growthVelocity.toFixed(1)),
        niche_cluster: keyword.trim(),
        recommended_entry_angle: "",
        recent_video_data: JSON.stringify(recentVideos),
        audit_date: new Date().toISOString(),
      });

      auditResults.push(auditRecord);
    }

    // Generate entry angle recommendations via LLM
    if (auditResults.length > 0) {
      const summaryForLLM = auditResults.map(a => ({
        channel: a.channel_name,
        grade: a.profitability_grade,
        subs: a.subscriber_count,
        engagement: a.engagement_density,
        viralHits: a.viral_consistency,
        longForm: a.long_form_ratio,
      }));

      const llmRes = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a YouTube strategy consultant. Given these channel audit results for the niche "${keyword}", provide a brief 1-2 sentence recommended entry angle for a NEW faceless channel to compete in this space. Focus on content gaps, underserved sub-topics, or format advantages.

Channel data: ${JSON.stringify(summaryForLLM)}

Return JSON:`,
        response_json_schema: {
          type: "object",
          properties: {
            recommendations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  channel_name: { type: "string" },
                  entry_angle: { type: "string" },
                },
              },
            },
          },
        },
      });

      if (llmRes?.recommendations) {
        for (const rec of llmRes.recommendations) {
          const match = auditResults.find(a => a.channel_name === rec.channel_name);
          if (match) {
            await base44.entities.NicheAudits.update(match.id, {
              recommended_entry_angle: rec.entry_angle,
            });
            match.recommended_entry_angle = rec.entry_angle;
          }
        }
      }
    }

    // Sort S-Tier first
    const gradeOrder = { "S-Tier": 0, "A-Tier": 1, "B-Tier": 2, "C-Tier": 3 };
    auditResults.sort((a, b) => (gradeOrder[a.profitability_grade] || 3) - (gradeOrder[b.profitability_grade] || 3));

    return Response.json({ results: auditResults });
  } catch (error) {
    console.error("Audit error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});