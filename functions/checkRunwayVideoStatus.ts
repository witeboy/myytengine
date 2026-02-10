import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { block_id, task_id } = body;

    if (!block_id || !task_id) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const apiKey = Deno.env.get('FREEPIK_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Freepik API key not configured' }, { status: 500 });
    }

    // Check task status
    const statusResponse = await fetch(
      `https://api.freepik.com/v1/text-to-video/${task_id}`,
      {
        method: 'GET',
        headers: {
          'x-freepik-api-key': apiKey
        }
      }
    );

    if (!statusResponse.ok) {
      console.error('Status check failed:', statusResponse.status);
      return Response.json({ error: 'Failed to check video status' }, { status: 500 });
    }

    const statusData = await statusResponse.json();
    const taskStatus = statusData.data?.status;
    const videoUrl = statusData.data?.results?.[0]?.url || statusData.data?.generated?.[0];

    // Update TimelineBlock based on status
    if (taskStatus === 'COMPLETED' && videoUrl) {
      await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
        status: 'completed',
        generated_asset_url: videoUrl,
        generation_task_id: task_id
      });
    } else if (taskStatus === 'FAILED' || taskStatus === 'ERROR') {
      await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
        status: 'failed',
        generation_task_id: task_id
      });
    } else if (taskStatus === 'PENDING' || taskStatus === 'PROCESSING') {
      // Keep in generating state
      await base44.asServiceRole.entities.TimelineBlocks.update(block_id, {
        status: 'generating',
        generation_task_id: task_id
      });
    }

    return Response.json({
      success: true,
      status: taskStatus,
      video_url: videoUrl || null,
      message: taskStatus === 'COMPLETED' ? 'Video generation complete!' : 
               taskStatus === 'FAILED' ? 'Video generation failed' :
               'Still generating...'
    });
  } catch (error) {
    console.error('Error checking Runway video status:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});