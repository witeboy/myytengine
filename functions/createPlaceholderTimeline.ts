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

    // Get script and production settings
    const allScripts = await base44.entities.Scripts.list();
    const script = allScripts.find(s => s.project_id === project_id && s.version === 'final');

    const allSettings = await base44.entities.ProductionSettings.list();
    const settings = allSettings.find(s => s.project_id === projectId);

    if (!script || !settings) {
      return Response.json({ error: 'Missing script or settings' }, { status: 400 });
    }

    // Get timing entries to know exact positions
    const allTimings = await base44.entities.TimingEntries.list();
    const timings = allTimings.filter(t => t.project_id === project_id).sort((a, b) => a.entry_order - b.entry_order);

    // Delete existing blocks to start fresh
    const existingBlocks = await base44.entities.TimelineBlocks.list();
    const projectBlocks = existingBlocks.filter(b => b.project_id === project_id);
    for (const block of projectBlocks) {
      await base44.entities.TimelineBlocks.delete(block.id);
    }

    // Create placeholder blocks from timing entries
    const totalDuration = settings.total_duration_seconds || 60;
    const createdBlocks = [];

    for (let i = 0; i < timings.length; i++) {
      const timing = timings[i];
      
      // Parse start time (e.g., "0:00" to seconds)
      const startParts = timing.timestamp_start.split(':');
      const startSeconds = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      
      const duration = timing.duration_seconds || 5;

      // Alternate between video and image
      const blockType = i % 2 === 0 ? 'video' : 'image';

      const block = await base44.entities.TimelineBlocks.create({
        project_id: project_id,
        block_type: blockType,
        prompt: timing.scene_concept || timing.spoken_text || `Scene ${i + 1}`,
        start_time_seconds: startSeconds,
        duration_seconds: duration,
        status: 'pending',
        order_index: i,
      });

      createdBlocks.push(block);
    }

    return Response.json({
      success: true,
      blocks_created: createdBlocks.length,
      total_duration: totalDuration,
      message: `Created ${createdBlocks.length} placeholder blocks based on script timing`
    });
  } catch (error) {
    console.error('Error creating placeholder timeline:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});