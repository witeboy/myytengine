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
      // Generate image using Gemini Vision or similar
      const aiResult = await base44.asServiceRole.integrations.Core.GenerateImage({
        prompt: `Style: ${asset_style}. ${prompt}`,
      });

      asset_url = aiResult.url;
    } else if (block_type === 'video') {
      // For videos, we would call Sora 2.0 or similar
      // This is a placeholder - you'll need to implement actual video generation
      // For now, we'll create a simple placeholder
      
      const videoPrompt = `Style: ${asset_style}. ${prompt}. Create a short video clip in ${asset_style} style.`;
      
      // Call Sora 2.0 API or similar - this is a placeholder
      // In reality, you'd need proper video generation API integration
      const aiResult = await base44.asServiceRole.integrations.Core.GenerateImage({
        prompt: videoPrompt,
      });

      asset_url = aiResult.url;
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
    
    // Update block status to failed
    try {
      const { block_id } = await req.json();
      await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
        status: 'failed',
      });
    } catch (e) {
      // Ignore error updating status
    }

    return Response.json({ error: error.message }, { status: 500 });
  }
});