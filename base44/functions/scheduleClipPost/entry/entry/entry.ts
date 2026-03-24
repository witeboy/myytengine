import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// SCHEDULE CLIP POST — Store & auto-publish scheduled clips
//
// Actions:
//   "schedule"  → Create a new scheduled post
//   "bulk"      → Schedule multiple clips at once (drip spread)
//   "process"   → Check for due posts and publish them
//   "cancel"    → Cancel a scheduled post
//   "list"      → List all scheduled posts
//
// Entity: ScheduledPosts
//   { clip_data, seo_title, seo_description, seo_tags, seo_hashtags,
//     platform, channel_setting_id, scheduled_at, status, privacy,
//     video_url, clip_url, published_url, error, virality_score }
//
// Status flow: scheduled → publishing → published | failed
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action = 'schedule' } = body;

    // ════════════════════════════════════════════════════════════
    // SCHEDULE — Create a single scheduled post
    // ════════════════════════════════════════════════════════════
    if (action === 'schedule') {
      const {
        clip_data,
        seo_title,
        seo_description,
        seo_tags,
        seo_hashtags,
        platform = 'youtube_shorts',
        channel_setting_id,
        scheduled_at,       // ISO datetime string
        privacy = 'public',
        video_url,          // source video URL
        clip_url,           // exported clip URL (if already clipped)
        virality_score = 0,
      } = body;

      if (!scheduled_at) {
        return Response.json({ error: 'scheduled_at required (ISO datetime)' }, { status: 400 });
      }

      const post = await base44.entities.ScheduledPosts.create({
        clip_data: JSON.stringify(clip_data || {}),
        seo_title: seo_title || '',
        seo_description: seo_description || '',
        seo_tags: seo_tags || '',
        seo_hashtags: seo_hashtags || '',
        platform,
        channel_setting_id: channel_setting_id || '',
        scheduled_at,
        status: 'scheduled',
        privacy,
        video_url: video_url || '',
        clip_url: clip_url || '',
        published_url: '',
        error_message: '',
        virality_score,
        user_email: user.email || '',
      });

      console.log(`📅 Scheduled post: "${seo_title}" for ${scheduled_at} on ${platform}`);

      return Response.json({
        success: true,
        post_id: post.id,
        scheduled_at,
        platform,
      });
    }

    // ════════════════════════════════════════════════════════════
    // BULK — Schedule multiple clips at once with drip timing
    // ════════════════════════════════════════════════════════════
    if (action === 'bulk') {
      const {
        clips,              // array of { clip_data, seo, scheduled_at, platform }
        channel_setting_id,
        strategy = 'spread', // spread | burst
        start_date,          // ISO date for first post
        time_slot = 'evening', // morning|afternoon|evening|night
        privacy = 'public',
        video_url,
      } = body;

      if (!clips?.length) {
        return Response.json({ error: 'clips array required' }, { status: 400 });
      }

      const TIME_HOURS = {
        morning: 9,
        afternoon: 13,
        evening: 19,
        night: 21,
      };

      const baseDate = start_date ? new Date(start_date) : new Date();
      baseDate.setDate(baseDate.getDate() + 1); // Start tomorrow

      const hour = TIME_HOURS[time_slot] || 19;
      const results = [];

      for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const seo = clip.seo || {};

        // Calculate schedule date based on strategy
        let dayOffset;
        if (strategy === 'spread') {
          dayOffset = i; // One per day
        } else if (strategy === 'burst') {
          dayOffset = Math.floor(i / 3); // 3 per day
        } else {
          dayOffset = i;
        }

        const postDate = new Date(baseDate);
        postDate.setDate(postDate.getDate() + dayOffset);

        // Stagger times within same day (burst mode)
        const inDayOffset = strategy === 'burst' ? (i % 3) * 2 : 0; // 2 hours apart
        postDate.setHours(hour + inDayOffset, 0, 0, 0);

        const scheduledAt = postDate.toISOString();

        const post = await base44.entities.ScheduledPosts.create({
          clip_data: JSON.stringify(clip.clip_data || {}),
          seo_title: seo.title || clip.clip_data?.title || `Clip ${i + 1}`,
          seo_description: seo.description || '',
          seo_tags: (seo.tags || []).join(', '),
          seo_hashtags: (seo.hashtags || []).map((h: string) => '#' + h).join(' '),
          platform: clip.platform || 'youtube_shorts',
          channel_setting_id: channel_setting_id || '',
          scheduled_at: scheduledAt,
          status: 'scheduled',
          privacy,
          video_url: video_url || '',
          clip_url: clip.clip_url || '',
          published_url: '',
          error_message: '',
          virality_score: clip.clip_data?.virality_score || 0,
          user_email: user.email || '',
        });

        results.push({
          post_id: post.id,
          title: seo.title || clip.clip_data?.title || `Clip ${i + 1}`,
          scheduled_at: scheduledAt,
          day_offset: dayOffset,
        });
      }

      console.log(`📅 Bulk scheduled ${results.length} clips (${strategy} strategy)`);

      return Response.json({
        success: true,
        scheduled_count: results.length,
        posts: results,
        strategy,
      });
    }

    // ════════════════════════════════════════════════════════════
    // PROCESS — Check for due posts and publish them
    // This should be called periodically (every 1-5 minutes)
    // by a frontend polling loop or a cron trigger
    // ════════════════════════════════════════════════════════════
    if (action === 'process') {
      const now = new Date().toISOString();

      // Find all posts that are scheduled and due
      const duePosts = await base44.entities.ScheduledPosts.filter({
        status: 'scheduled',
      });

      // Filter to only posts that are due (scheduled_at <= now)
      const readyPosts = (duePosts || []).filter((p: any) => {
        return p.scheduled_at && new Date(p.scheduled_at) <= new Date(now);
      });

      if (readyPosts.length === 0) {
        return Response.json({
          success: true,
          processed: 0,
          message: 'No posts due for publishing',
        });
      }

      console.log(`⏰ Found ${readyPosts.length} posts due for publishing`);

      const results = [];

      for (const post of readyPosts) {
        try {
          // Mark as publishing
          await base44.entities.ScheduledPosts.update(post.id, {
            status: 'publishing',
          });

          // Build hashtag string for description
          const fullDescription = [
            post.seo_description || '',
            post.seo_hashtags || '',
          ].filter(Boolean).join('\n\n').trim();

          // Publish via YouTube API
          if (post.platform === 'youtube_shorts' || post.platform === 'youtube') {
            const publishRes = await base44.functions.invoke('youtubeAuth', {
              action: 'uploadVideo',
              channel_setting_id: post.channel_setting_id,
              video_url: post.clip_url || post.video_url,
              title: (post.seo_title || 'Untitled Clip').substring(0, 100),
              description: fullDescription.substring(0, 5000),
              tags: (post.seo_tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
              privacy_status: post.privacy || 'public',
              category_id: '22',
              is_short: true,
            });

            const publishData = publishRes.data || publishRes;

            if (publishData?.video_id) {
              const publishedUrl = `https://youtube.com/shorts/${publishData.video_id}`;

              await base44.entities.ScheduledPosts.update(post.id, {
                status: 'published',
                published_url: publishedUrl,
              });

              results.push({
                post_id: post.id,
                title: post.seo_title,
                status: 'published',
                published_url: publishedUrl,
              });

              console.log(`✅ Published: "${post.seo_title}" → ${publishedUrl}`);
            } else {
              throw new Error(publishData?.error || 'Upload returned no video_id');
            }
          } else {
            // Other platforms — mark as ready for manual posting
            await base44.entities.ScheduledPosts.update(post.id, {
              status: 'ready_to_post',
              error_message: `Auto-publish not yet supported for ${post.platform}. Clip is ready for manual posting.`,
            });

            results.push({
              post_id: post.id,
              title: post.seo_title,
              status: 'ready_to_post',
              platform: post.platform,
            });
          }

        } catch (err) {
          console.error(`❌ Failed to publish "${post.seo_title}":`, err.message);

          await base44.entities.ScheduledPosts.update(post.id, {
            status: 'failed',
            error_message: err.message,
          });

          results.push({
            post_id: post.id,
            title: post.seo_title,
            status: 'failed',
            error: err.message,
          });
        }
      }

      return Response.json({
        success: true,
        processed: results.length,
        results,
      });
    }

    // ════════════════════════════════════════════════════════════
    // CANCEL — Cancel a scheduled post
    // ════════════════════════════════════════════════════════════
    if (action === 'cancel') {
      const { post_id } = body;
      if (!post_id) return Response.json({ error: 'post_id required' }, { status: 400 });

      await base44.entities.ScheduledPosts.update(post_id, {
        status: 'cancelled',
      });

      return Response.json({ success: true, post_id, status: 'cancelled' });
    }

    // ════════════════════════════════════════════════════════════
    // LIST — Get all scheduled posts
    // ════════════════════════════════════════════════════════════
    if (action === 'list') {
      const { status: filterStatus } = body;
      let posts;

      if (filterStatus) {
        posts = await base44.entities.ScheduledPosts.filter({ status: filterStatus });
      } else {
        posts = await base44.entities.ScheduledPosts.list('-scheduled_at', 100);
      }

      return Response.json({
        success: true,
        posts: posts || [],
        count: (posts || []).length,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (error) {
    console.error('❌ scheduleClipPost error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
