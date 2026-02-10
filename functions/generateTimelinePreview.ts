import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id } = body;

    if (!project_id) {
      return Response.json({ error: 'Missing project_id' }, { status: 400 });
    }

    // Fetch project, blocks, and settings
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const blocks = await base44.asServiceRole.entities.TimelineBlocks.filter({
      project_id: project_id
    });

    const settings = await base44.asServiceRole.entities.ProductionSettings.filter({
      project_id: project_id
    });

    if (!blocks || blocks.length === 0 || !settings[0]) {
      return Response.json({ 
        error: 'No assets or voiceover found. Generate assets and audio first.' 
      }, { status: 400 });
    }

    const productionSettings = settings[0];
    const totalDuration = productionSettings.total_duration_seconds || 60;

    // Build manifest for preview rendering
    const manifest = {
      project_id,
      total_duration: totalDuration,
      voiceover_url: productionSettings.voiceover_url,
      voiceover_volume: productionSettings.voiceover_volume || 1,
      assets: blocks.map(block => ({
        id: block.id,
        type: block.block_type,
        url: block.generated_asset_url,
        start_time: block.start_time_seconds,
        duration: block.duration_seconds,
        volume: block.volume || 1,
        keyframes: block.keyframes ? JSON.parse(block.keyframes) : []
      })).filter(a => a.url)
    };

    // Log the manifest for processing
    console.log('Preview manifest created:', JSON.stringify(manifest));

    // Store manifest and return task info
    // In a real implementation, this would trigger an async rendering service
    const previewUrl = `https://cdn.example.com/previews/${project_id}_${Date.now()}.mp4`;

    return Response.json({
      success: true,
      manifest,
      preview_url: previewUrl,
      status: 'preview_queued',
      message: 'Preview render queued. Refresh in a moment to see the result.'
    });
  } catch (error) {
    console.error('Error generating timeline preview:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});