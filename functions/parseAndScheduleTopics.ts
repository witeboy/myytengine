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

    // ══════════════════════════════════════════════════════════════
    // STEP 1: AI classifies topics into short vs long format
    // ══════════════════════════════════════════════════════════════
    const topicTitles = unscheduled.map(t => t.title);
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    let formatAssignments = {};

    if (geminiApiKey && topicTitles.length > 0) {
      const prompt = `You are an expert YouTube content strategist for a "${niche}" channel.

Given these ${topicTitles.length} video topics, classify each as either "short" (YouTube Shorts, under 60 seconds) or "long" (full-length video, ${channel.long_form_duration_minutes || 15}+ minutes).

STRATEGY RULES:
- Long-form videos should be deep-dive, educational, authority-building topics that establish expertise
- Long-form should be topics that generate high watch time, drive subscriptions, and create loyal viewers
- Short-form should be quick hooks, surprising facts, trending angles, reaction-worthy moments, or teaser content
- Short-form drives discovery and new viewers; long-form drives retention and cult following
- Mix ratio target: roughly ${shortsPerDay * 7} shorts per week and ${longformPerWeek} long-form per week
- Topics that invite discussion, controversy, or deep analysis → long-form
- Topics that are listicles, quick tips, single facts, or trending → short-form
- Evergreen educational content → long-form
- Viral/attention-grabbing hooks → short-form

TOPICS:
${topicTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Respond with ONLY valid JSON:
{"assignments": [{"index": 0, "format": "short"}, {"index": 1, "format": "long"}, ...]}

Every topic must be assigned. Use 0-based index matching the topic list above.`;

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 4096, responseMimeType: "application/json" }
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed.assignments && Array.isArray(parsed.assignments)) {
              for (const a of parsed.assignments) {
                if (typeof a.index === 'number' && (a.format === 'short' || a.format === 'long')) {
                  formatAssignments[a.index] = a.format;
                }
              }
              console.log(`✓ AI classified ${Object.keys(formatAssignments).length}/${topicTitles.length} topics`);
            }
          }
        }
      } catch (err) {
        console.warn('AI classification failed, using fallback:', err.message);
      }
    }

    // Apply AI format assignments to topics
    for (let i = 0; i < unscheduled.length; i++) {
      const assignedFormat = formatAssignments[i];
      if (assignedFormat && assignedFormat !== unscheduled[i].format) {
        await base44.asServiceRole.entities.ChannelTopics.update(unscheduled[i].id, { format: assignedFormat });
        unscheduled[i].format = assignedFormat;
      }
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 2: Schedule topics on the calendar
    // ══════════════════════════════════════════════════════════════
    const shorts = unscheduled.filter(t => t.format === 'short');
    const longs = unscheduled.filter(t => t.format === 'long');

    console.log(`Format split: ${shorts.length} shorts, ${longs.length} long-form`);

    // Find the latest scheduled date, or start from tomorrow
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

    function getWeekStart(date) {
      const d = new Date(date);
      const day = d.getDay();
      d.setDate(d.getDate() - day);
      return d.toISOString().split('T')[0];
    }

    function formatDate(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    const maxDays = 365;
    let dayCount = 0;

    while ((shortIdx < shorts.length || longIdx < longs.length) && dayCount < maxDays) {
      const dateStr = formatDate(currentDate);
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

      // Schedule longform (spread across Mon/Wed/Fri)
      if (longformThisWeek < longformPerWeek && longIdx < longs.length) {
        const dayOfWeek = currentDate.getDay();
        const longformDays = longformPerWeek <= 3 ? [1, 3, 5] : [0, 1, 2, 3, 4, 5, 6];
        
        if (longformDays.includes(dayOfWeek) || longformPerWeek > 3) {
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

    // Apply updates
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

    console.log(`✓ Scheduled ${updates.length} topics (${shortIdx} shorts + ${longIdx} long-form) across ${dayCount} days for "${channel.name}"`);

    return Response.json({
      success: true,
      scheduled: updates.length,
      days_covered: dayCount,
      shorts_scheduled: shortIdx,
      longform_scheduled: longIdx,
      ai_classified: Object.keys(formatAssignments).length,
    });
  } catch (error) {
    console.error("parseAndScheduleTopics error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});