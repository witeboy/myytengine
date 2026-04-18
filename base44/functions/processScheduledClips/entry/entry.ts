import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// PROCESS SCHEDULED CLIPS — Hourly worker
// Scans UploadMetadata for scheduled_post records whose time has come,
// and publishes them to their target platforms (YouTube Shorts currently).
// Runs as service role (no user auth required — invoked by automation).
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();

    console.log(`⏰ Worker started at ${now.toISOString()}`);

    const allPosts = await base44.asServiceRole.entities.UploadMetadata.filter({
      record_type: 'scheduled_post',
      status: 'scheduled',
    });

    const readyPosts = (allPosts || []).filter(
      (p) => p.scheduled_at && new Date(p.scheduled_at) <= now
    );

    if (readyPosts.length === 0) {
      console.log('No posts due for publishing.');
      return Response.json({ success: true, processed: 0, message: 'No posts due' });
    }

    console.log(`Found ${readyPosts.length} posts due for publishing`);
    const results = [];

    for (const post of readyPosts) {
      try {
        await base44.asServiceRole.entities.UploadMetadata.update(post.id, { status: 'publishing' });

        const fullDesc = [post.description_template || '', post.hashtags || '']
          .filter(Boolean)
          .join('\n\n')
          .trim();

        if (post.platform === 'youtube_shorts' || post.platform === 'youtube') {
          const publishRes = await base44.asServiceRole.functions.invoke('youtubeAuth', {
            action: 'uploadVideo',
            channel_setting_id: post.selected_channel_id,
            video_url: post.clip_url || post.video_url,
            title: (post.title_primary || 'Untitled').substring(0, 100),
            description: fullDesc.substring(0, 5000),
            tags: (post.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
            privacy_status: post.privacy || 'public',
            category_id: '22',
            is_short: true,
          });

          const publishData = publishRes.data || publishRes;

          if (publishData && publishData.video_id) {
            const publishedUrl = `https://youtube.com/shorts/${publishData.video_id}`;
            await base44.asServiceRole.entities.UploadMetadata.update(post.id, {
              status: 'published',
              published_url: publishedUrl,
            });
            results.push({ post_id: post.id, title: post.title_primary, status: 'published', published_url: publishedUrl });
            console.log(`✅ Published: ${post.title_primary} → ${publishedUrl}`);
          } else {
            throw new Error(publishData?.error || 'No video_id returned');
          }
        } else {
          await base44.asServiceRole.entities.UploadMetadata.update(post.id, {
            status: 'ready_to_post',
            error_message: `Auto-publish not supported for ${post.platform}`,
          });
          results.push({ post_id: post.id, title: post.title_primary, status: 'ready_to_post' });
        }
      } catch (err) {
        console.log(`❌ Failed: ${post.title_primary} — ${err.message}`);
        await base44.asServiceRole.entities.UploadMetadata.update(post.id, {
          status: 'failed',
          error_message: err.message,
        });
        results.push({ post_id: post.id, title: post.title_primary, status: 'failed', error: err.message });
      }
    }

    return Response.json({
      success: true,
      worker_run_at: now.toISOString(),
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('❌ processScheduledClips error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});