import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { block_id, project_id, prompt, asset_style, block_type } = await req.json();

    if (!block_id || !prompt || !asset_style) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Update block status to generating
    await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
      status: 'generating',
    });

    let asset_url = '';

    if (block_type === 'image') {
      // Generate static image
      const aiResult = await base44.asServiceRole.integrations.Core.GenerateImage({
        prompt: `${asset_style} style: ${prompt}`,
      });
      asset_url = aiResult.url;
    } else if (block_type === 'video') {
      // Try searching B-roll first (more efficient)
      const brollResult = await base44.asServiceRole.functions.invoke('searchBrollVideos', {
        prompt,
        duration: 10,
        quality: '1080p',
      });

      if (brollResult.data?.videos?.length > 0) {
        // Use first matching B-roll video
        const video = brollResult.data.videos[0];
        asset_url = video.preview || video.url;
        
        // Update block with B-roll info
        await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
          broll_source: 'freepik',
          broll_id: video.id,
          broll_url: asset_url,
        });
      } else {
        // Fallback to generate image (user can use Runway generator for full video)
        const aiResult = await base44.asServiceRole.integrations.Core.GenerateImage({
          prompt: `${asset_style} style: ${prompt}`,
        });
        asset_url = aiResult.url;
      }
    }

    // Update block with generated asset
    await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
      status: 'completed',
      generated_asset_url: asset_url,
    });

    return Response.json({
      success: true,
      asset_url,
      block_id,
    });
  } catch (error) {
    console.error('Error generating asset:', error);
    
    // Update block status to failed if it exists
    try {
      if (block_id) {
        const allBlocks = await base44.asServiceRole.entities.TimelineBlocks.list();
        const block = allBlocks.find(b => b.id === block_id);
        if (block) {
          await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
            status: 'failed',
          });
        }
      }
    } catch (e) {
      // Ignore error updating status
    }

    return Response.json({ error: error.message }, { status: 500 });
  }
});