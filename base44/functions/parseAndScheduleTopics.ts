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

    const allTopics = await base44.asServiceRole.entities.ChannelTopics.filter({ channel_id });
    const unscheduled = allTopics
      .filter(t => !t.scheduled_date && t.status === 'queued')
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));

    if (unscheduled.length === 0) {
      return Response.json({ success: true, message: 'No topics to schedule', scheduled: 0 });
    }

    const shortsPerDay = channel.shorts_per_day || 5;
    const longformPerWeek = channel.longform_per_week || 3;
    const niche = channel.niche_label || channel.niche || 'general';
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");

    // ══════════════════════════════════════════════════════════════
    // STEP 1: Gather YouTube trend context
    // ══════════════════════════════════════════════════════════════
    let trendContext = '';
    if (youtubeApiKey) {
      try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(niche)}&type=video&order=viewCount&maxResults=10&publishedAfter=${getDateWeeksAgo(2)}&key=${youtubeApiKey}`;
        const res = await fetch(searchUrl);
        if (res.ok) {
          const data = await res.json();
          const titles = (data.items || []).map(v => v.snippet.title).filter(Boolean);
          if (titles.length > 0) {
            trendContext = `\n\nCURRENTLY TRENDING ON YOUTUBE IN THIS NICHE (last 2 weeks):\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
          }
        }
      } catch (err) {
        console.warn('YouTube trend fetch failed:', err.message);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 2: AI classifies, orders, and assigns posting times
    // ══════════════════════════════════════════════════════════════
    const topicTitles = unscheduled.map(t => t.title);
    let aiPlan = null;

    if (geminiApiKey && topicTitles.length > 0) {
      const existingScheduled = allTopics
        .filter(t => t.scheduled_date && t.status !== 'queued')
        .map(t => `${t.title} (${t.format}, ${t.scheduled_date})`)
        .slice(-20);

      const prompt = `You are an elite YouTube content strategist for a "${niche}" channel.
You must plan a content calendar that MAXIMIZES: authority building, viewer retention, cult following, discoverability, and revenue.

CHANNEL CONFIG:
- ${shortsPerDay} shorts/day, ${longformPerWeek} long-form/week
- Short-form: YouTube Shorts (under 60 seconds, ≤${channel.short_form_word_limit || 200} words)
- Long-form: Full videos (${channel.long_form_duration_minutes || 15}+ minutes)
${trendContext}

ALREADY SCHEDULED (for context):
${existingScheduled.length > 0 ? existingScheduled.join('\n') : 'None yet — this is a fresh start.'}

NEW TOPICS TO SCHEDULE (${topicTitles.length} topics):
${topicTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

YOUR TASKS:

1. CLASSIFY each topic as "short" or "long":
   - Long-form: deep-dives, tutorials, storytelling, authority-building, evergreen education, controversial takes that need explanation
   - Short-form: hooks, quick facts, trending reactions, listicle fragments, teaser clips, viral-potential moments
   - Consider: long-form builds subscriber loyalty; short-form drives discovery

2. ORDER topics strategically:
   - Use THEMATIC CLUSTERS: group related topics so viewers binge
   - Place SHORT teasers BEFORE related long-form content to build anticipation
   - Alternate between educational and entertaining to prevent fatigue
   - Front-load high-trend-score topics for momentum
   - End each week with a strong long-form to drive weekend watch time

3. ASSIGN posting times for each topic:
   - Shorts: best times are typically morning (8-9 AM), lunch (12-1 PM), evening (6-7 PM) — stagger across the day
   - Long-form: afternoon (2-4 PM) on weekdays, morning (10 AM) on weekends — when people have time to watch
   - Adjust for "${niche}" audience behavior patterns

4. ADD strategic notes explaining WHY each topic is placed where it is.

5. GROUP topics into theme clusters (e.g., "wealth mindset", "investment basics", "success stories").

Respond with ONLY valid JSON:
{
  "plan": [
    {
      "index": 0,
      "format": "short",
      "suggested_post_time": "9:00 AM",
      "ai_notes": "Quick hook to introduce the wealth series — posts early for morning commuters",
      "theme_cluster": "wealth mindset",
      "trend_score": 85,
      "day_order": 1
    }
  ],
  "posting_strategy": {
    "short_times": ["8:00 AM", "12:30 PM", "6:00 PM", "8:30 PM"],
    "long_times": ["2:00 PM", "4:00 PM"],
    "long_days": ["Tuesday", "Thursday", "Saturday"],
    "reasoning": "..."
  },
  "weekly_narrative": "Brief description of how the week's content tells a cohesive story"
}

"day_order" is the STRATEGIC order (1 = schedule first, 2 = second, etc.). Topics with lower day_order get scheduled on earlier dates.
Every topic (0-indexed) must appear exactly once in the plan.`;

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 16384, responseMimeType: "application/json" }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            aiPlan = JSON.parse(text);
            console.log(`✓ AI strategic plan received for ${aiPlan.plan?.length || 0} topics`);
          }
        }
      } catch (err) {
        console.warn('AI strategic planning failed, using basic scheduling:', err.message);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 3: Apply AI plan or fallback to basic scheduling
    // ══════════════════════════════════════════════════════════════
    
    // Apply AI classifications
    if (aiPlan?.plan) {
      for (const item of aiPlan.plan) {
        if (typeof item.index === 'number' && item.index < unscheduled.length) {
          const topic = unscheduled[item.index];
          const updateData = {};
          if (item.format === 'short' || item.format === 'long') {
            updateData.format = item.format;
            topic.format = item.format;
          }
          if (item.suggested_post_time) updateData.suggested_post_time = item.suggested_post_time;
          if (item.ai_notes) updateData.ai_notes = item.ai_notes;
          if (item.theme_cluster) updateData.theme_cluster = item.theme_cluster;
          if (typeof item.trend_score === 'number') updateData.trend_score = item.trend_score;
          if (typeof item.day_order === 'number') topic._dayOrder = item.day_order;

          if (Object.keys(updateData).length > 0) {
            await base44.asServiceRole.entities.ChannelTopics.update(topic.id, updateData);
          }
        }
      }
    }

    // Sort by AI-assigned day_order if available
    const sortedTopics = [...unscheduled].sort((a, b) => {
      const aOrder = a._dayOrder ?? 999;
      const bOrder = b._dayOrder ?? 999;
      return aOrder - bOrder;
    });

    const shorts = sortedTopics.filter(t => t.format === 'short');
    const longs = sortedTopics.filter(t => t.format === 'long');
    console.log(`Format split: ${shorts.length} shorts, ${longs.length} long-form`);

    // Determine preferred long-form days from AI or defaults
    const longDayNames = aiPlan?.posting_strategy?.long_days || ['Tuesday', 'Thursday', 'Saturday'];
    const dayNameToNum = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const longDayNums = longDayNames.map(d => dayNameToNum[d]).filter(n => n !== undefined);

    // Find start date
    const scheduledDates = allTopics
      .filter(t => t.scheduled_date)
      .map(t => t.scheduled_date)
      .sort();
    
    let startDate;
    if (scheduledDates.length > 0) {
      const lastDate = new Date(scheduledDates[scheduledDates.length - 1] + 'T12:00:00');
      lastDate.setDate(lastDate.getDate() + 1);
      startDate = lastDate;
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
    }

    const updates = [];
    let currentDate = new Date(startDate);
    let shortIdx = 0;
    let longIdx = 0;
    let longformThisWeek = 0;
    let weekStart = getWeekStart(currentDate);

    const maxDays = 365;
    let dayCount = 0;

    while ((shortIdx < shorts.length || longIdx < longs.length) && dayCount < maxDays) {
      const dateStr = formatDateStr(currentDate);
      const ws = getWeekStart(currentDate);
      
      if (ws !== weekStart) {
        weekStart = ws;
        longformThisWeek = 0;
      }

      // Schedule shorts for this day
      let shortsToday = 0;
      while (shortsToday < shortsPerDay && shortIdx < shorts.length) {
        updates.push({
          id: shorts[shortIdx].id,
          scheduled_date: dateStr,
          slot_index: shortsToday + 1,
          status: 'scheduled',
        });
        shortIdx++;
        shortsToday++;
      }

      // Schedule longform on AI-preferred days
      if (longformThisWeek < longformPerWeek && longIdx < longs.length) {
        const dayOfWeek = currentDate.getDay();
        if (longDayNums.includes(dayOfWeek) || longformPerWeek > 3) {
          updates.push({
            id: longs[longIdx].id,
            scheduled_date: dateStr,
            slot_index: 1,
            status: 'scheduled',
          });
          longIdx++;
          longformThisWeek++;
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
      dayCount++;
    }

    // Apply schedule updates
    for (const update of updates) {
      const { id, ...data } = update;
      await base44.asServiceRole.entities.ChannelTopics.update(id, data);
    }

    // Update channel stats
    const totalScheduled = allTopics.filter(t => t.scheduled_date).length + updates.length;
    await base44.asServiceRole.entities.Channels.update(channel_id, {
      topics_scheduled: totalScheduled,
      total_topics: allTopics.length,
    });

    console.log(`✓ Scheduled ${updates.length} topics (${shortIdx}S + ${longIdx}L) across ${dayCount} days for "${channel.name}"`);

    return Response.json({
      success: true,
      scheduled: updates.length,
      days_covered: dayCount,
      shorts_scheduled: shortIdx,
      longform_scheduled: longIdx,
      ai_classified: aiPlan?.plan?.length || 0,
      posting_strategy: aiPlan?.posting_strategy || null,
      weekly_narrative: aiPlan?.weekly_narrative || null,
    });
  } catch (error) {
    console.error("parseAndScheduleTopics error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}

function formatDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getDateWeeksAgo(weeks) {
  const d = new Date();
  d.setDate(d.getDate() - (weeks * 7));
  return d.toISOString();
}