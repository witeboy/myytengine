import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — uses UploadMetadata entity with record_type='scheduled_post'

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const action = body.action || 'schedule';

  // ── SCHEDULE — Create a single scheduled post ──────────────
  if (action === 'schedule') {
    const post = await base44.entities.UploadMetadata.create({
      record_type: 'scheduled_post',
      project_id: body.project_id || 'clip-extractor',
      title_primary: body.seo_title || '',
      description_template: body.seo_description || '',
      tags: body.seo_tags || '',
      hashtags: body.seo_hashtags || '',
      platform: body.platform || 'youtube_shorts',
      selected_channel_id: body.channel_setting_id || '',
      scheduled_at: body.scheduled_at || '',
      status: 'scheduled',
      privacy: body.privacy || 'public',
      video_url: body.video_url || '',
      clip_url: body.clip_url || '',
      clip_data: JSON.stringify(body.clip_data || {}),
      published_url: '',
      error_message: '',
      virality_score: body.virality_score || 0,
      user_email: user.email || '',
    });

    console.log('Scheduled post: ' + (body.seo_title || 'untitled') + ' for ' + body.scheduled_at);

    return Response.json({
      success: true,
      post_id: post.id,
      scheduled_at: body.scheduled_at,
    });
  }

  // ── BULK — Schedule multiple clips at once ─────────────────
  if (action === 'bulk') {
    const clips = body.clips || [];
    if (!clips.length) return Response.json({ error: 'clips array required' }, { status: 400 });

    const TIME_HOURS = { morning: 9, afternoon: 13, evening: 19, night: 21 };
    const strategy = body.strategy || 'spread';

    // Parse custom start_time "HH:MM" or fall back to time_slot preset
    let startHour = 19, startMinute = 0;
    if (body.start_time && /^\d{1,2}:\d{2}$/.test(body.start_time)) {
      const parts = body.start_time.split(':');
      startHour = parseInt(parts[0], 10);
      startMinute = parseInt(parts[1], 10);
    } else {
      startHour = TIME_HOURS[body.time_slot] || 19;
    }

    // Interval in minutes between consecutive posts on the same day (min 45)
    const intervalMin = Math.max(45, parseInt(body.interval_minutes || 120, 10));

    // Burst = postsPerDay posts per day (default 3), spread = 1 per day
    const postsPerDay = strategy === 'burst' ? Math.max(2, parseInt(body.posts_per_day || 3, 10)) : 1;

    const baseDate = body.start_date ? new Date(body.start_date) : new Date();
    // If start_date already provided, don't add +1 day (user picked it explicitly)
    if (!body.start_date) baseDate.setDate(baseDate.getDate() + 1);

    const results = [];

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const seo = clip.seo || {};

      var dayOffset = Math.floor(i / postsPerDay);
      var slotInDay = i % postsPerDay;

      const postDate = new Date(baseDate);
      postDate.setDate(postDate.getDate() + dayOffset);
      postDate.setHours(startHour, startMinute, 0, 0);
      // Add interval * slotInDay minutes
      postDate.setMinutes(postDate.getMinutes() + (slotInDay * intervalMin));
      const scheduledAt = postDate.toISOString();

      const post = await base44.entities.UploadMetadata.create({
        record_type: 'scheduled_post',
        project_id: 'clip-extractor',
        title_primary: seo.title || clip.clip_data?.title || 'Clip ' + (i + 1),
        description_template: seo.description || '',
        tags: (seo.tags || []).join(', '),
        hashtags: (seo.hashtags || []).map(function(h) { return '#' + h; }).join(' '),
        platform: clip.platform || 'youtube_shorts',
        selected_channel_id: body.channel_setting_id || '',
        scheduled_at: scheduledAt,
        status: 'scheduled',
        privacy: body.privacy || 'public',
        video_url: body.video_url || '',
        clip_url: clip.clip_url || '',
        clip_data: JSON.stringify(clip.clip_data || {}),
        published_url: '',
        error_message: '',
        virality_score: clip.clip_data?.virality_score || 0,
        user_email: user.email || '',
      });

      results.push({
        post_id: post.id,
        title: seo.title || 'Clip ' + (i + 1),
        scheduled_at: scheduledAt,
      });
    }

    console.log('Bulk scheduled ' + results.length + ' clips (' + strategy + ')');
    return Response.json({ success: true, scheduled_count: results.length, posts: results });
  }

  // ── PROCESS — Check for due posts and publish them ─────────
  if (action === 'process') {
    const now = new Date().toISOString();

    const allPosts = await base44.entities.UploadMetadata.filter({
      record_type: 'scheduled_post',
      status: 'scheduled',
    });

    var readyPosts = (allPosts || []).filter(function(p) {
      return p.scheduled_at && new Date(p.scheduled_at) <= new Date(now);
    });

    if (readyPosts.length === 0) {
      return Response.json({ success: true, processed: 0, message: 'No posts due' });
    }

    console.log('Found ' + readyPosts.length + ' posts due for publishing');
    const results = [];

    for (var pi = 0; pi < readyPosts.length; pi++) {
      const post = readyPosts[pi];
      try {
        await base44.entities.UploadMetadata.update(post.id, { status: 'publishing' });

        var fullDesc = [post.description_template || '', post.hashtags || ''].filter(Boolean).join('\n\n').trim();

        // Publish via YouTube
        if (post.platform === 'youtube_shorts' || post.platform === 'youtube') {
          const publishRes = await base44.functions.invoke('youtubeAuth', {
            action: 'uploadVideo',
            channel_setting_id: post.selected_channel_id,
            video_url: post.clip_url || post.video_url,
            title: (post.title_primary || 'Untitled').substring(0, 100),
            description: fullDesc.substring(0, 5000),
            tags: (post.tags || '').split(',').map(function(t) { return t.trim(); }).filter(Boolean),
            privacy_status: post.privacy || 'public',
            category_id: '22',
            is_short: true,
          });

          var publishData = publishRes.data || publishRes;

          if (publishData && publishData.video_id) {
            var publishedUrl = 'https://youtube.com/shorts/' + publishData.video_id;
            await base44.entities.UploadMetadata.update(post.id, { status: 'published', published_url: publishedUrl });
            results.push({ post_id: post.id, title: post.title_primary, status: 'published', published_url: publishedUrl });
            console.log('Published: ' + post.title_primary + ' -> ' + publishedUrl);
          } else {
            throw new Error(publishData?.error || 'No video_id returned');
          }
        } else {
          await base44.entities.UploadMetadata.update(post.id, {
            status: 'ready_to_post',
            error_message: 'Auto-publish not supported for ' + post.platform,
          });
          results.push({ post_id: post.id, title: post.title_primary, status: 'ready_to_post' });
        }
      } catch (err) {
        console.log('Failed to publish: ' + post.title_primary + ' - ' + err.message);
        await base44.entities.UploadMetadata.update(post.id, { status: 'failed', error_message: err.message });
        results.push({ post_id: post.id, title: post.title_primary, status: 'failed', error: err.message });
      }
    }

    return Response.json({ success: true, processed: results.length, results: results });
  }

  // ── RESCHEDULE — Change the scheduled_at of a post ─────────
  if (action === 'reschedule') {
    if (!body.post_id || !body.scheduled_at) {
      return Response.json({ error: 'post_id and scheduled_at required' }, { status: 400 });
    }
    await base44.entities.UploadMetadata.update(body.post_id, {
      scheduled_at: body.scheduled_at,
      status: 'scheduled',
    });
    return Response.json({ success: true, post_id: body.post_id, scheduled_at: body.scheduled_at });
  }

  // ── CANCEL ─────────────────────────────────────────────────
  if (action === 'cancel') {
    if (!body.post_id) return Response.json({ error: 'post_id required' }, { status: 400 });
    await base44.entities.UploadMetadata.update(body.post_id, { status: 'cancelled' });
    return Response.json({ success: true, status: 'cancelled' });
  }

  // ── LIST — Get all scheduled posts ─────────────────────────
  if (action === 'list') {
    var posts;
    if (body.status) {
      posts = await base44.entities.UploadMetadata.filter({ record_type: 'scheduled_post', status: body.status });
    } else {
      posts = await base44.entities.UploadMetadata.filter({ record_type: 'scheduled_post' });
    }
    return Response.json({ success: true, posts: posts || [], count: (posts || []).length });
  }

  return Response.json({ error: 'Unknown action: ' + action }, { status: 400 });
});