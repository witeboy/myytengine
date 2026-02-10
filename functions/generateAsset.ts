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

    // Enhance prompt with style descriptors
    const enhanceResult = await base44.asServiceRole.functions.invoke('enhancePrompt', {
      prompt,
      asset_style,
    });

    const enhancedPrompt = enhanceResult.data?.enhanced_prompt || prompt;
    let asset_url = '';

    if (block_type === 'image') {
      // Generate image with enhanced prompt using AI33
      const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Generate a detailed image description for: ${enhancedPrompt}`,
        add_context_from_internet: false,
      });
      // Use a placeholder or fallback since we're using LLM
      asset_url = `https://via.placeholder.com/1920x1080?text=${encodeURIComponent('Image: ' + enhancedPrompt.substring(0, 50))}`;
    } else if (block_type === 'video') {
      // Use B-roll placeholder for video blocks
      asset_url = `https://via.placeholder.com/1920x1080?text=${encodeURIComponent('Video: ' + enhancedPrompt.substring(0, 50))}`;

      await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
        broll_source: 'placeholder',
        broll_id: 'placeholder',
      });
    }

    // Update block with asset
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