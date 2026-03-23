import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { block_id, asset_url } = body;

    if (!block_id || !asset_url) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Note: Background removal typically requires a specialized service
    // For now, we'll mark it as enabled and store the URL for processing during export
    // Actual implementation would use remove.bg API or similar service
    
    // Get the block to update
    const block = await base44.entities.TimelineBlocks.get(block_id);
    
    if (!block) {
      return Response.json({ error: 'Block not found' }, { status: 404 });
    }

    // Mark background removal as enabled
    // In production, this would call an actual background removal API
    // For now we'll use the same URL but flag it as processed
    await base44.entities.TimelineBlocks.update(block_id, {
      background_removal_enabled: true,
      background_removal_url: asset_url
    });

    return Response.json({
      success: true,
      message: 'Background removal enabled. Processing will occur during video export.',
      block_id: block_id,
      background_removal_enabled: true
    });
  } catch (error) {
    console.error('Error enabling background removal:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});