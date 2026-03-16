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
      .filter(t => !t.scheduled_date && (t.status === 'queued'))
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));

    if (unscheduled.length === 0) {
      return Response.json({ success: true, message: 'No topics to schedule', scheduled: 0 });
    }

    const shortsPerDay = channel.shorts_per_day || 5;
    const longformPerWeek = channel.longform_per_week || 3;

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

    // Separate shorts and longs
    const shorts = unscheduled.filter(t => t.format === 'short');
    const longs = unscheduled.filter(t => t.format === 'long');

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

    // Schedule until all topics are placed
    const maxDays = 365; // Safety limit
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

      // Schedule longform (spread across the week)
      if (longformThisWeek < longformPerWeek && longIdx < longs.length) {
        // Spread longform across Mon/Wed/Fri (days 1, 3, 5) or whatever fits
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

    console.log(`✓ Scheduled ${updates.length} topics across ${dayCount} days for channel "${channel.name}"`);

    return Response.json({
      success: true,
      scheduled: updates.length,
      days_covered: dayCount,
      shorts_scheduled: shortIdx,
      longform_scheduled: longIdx,
    });
  } catch (error) {
    console.error("parseAndScheduleTopics error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});