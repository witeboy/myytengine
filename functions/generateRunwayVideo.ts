import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { 
      block_id, 
      project_id, 
      prompt, 
      duration = 8,
      ratio = '1280:720'
    } = body;

    if (!prompt || !block_id || !project_id) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const apiKey = Deno.env.get('FREEPIK_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'Freepik API key not configured' }, { status: 500 });
    }

    // Create text-to-video task
    const createTaskResponse = await fetch('https://api.freepik.com/v1/ai/text-to-video/runway-4-5', {
      method: 'POST',
      headers: {
        'x-freepik-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        ratio,
        duration
      })
    });

    if (!createTaskResponse.ok) {
      const error = await createTaskResponse.json();
      console.error('Freepik T2V error:', error);
      return Response.json({ error: 'Failed to create video generation task' }, { status: 500 });
    }

    const taskData = await createTaskResponse.json();
    const taskId = taskData.data.task_id;
    const status = taskData.data.status;

    // Update TimelineBlock with task info
    await base44.entities.TimelineBlocks.update(block_id, {
      status: status === 'CREATED' ? 'generating' : 'generating',
      generation_task_id: taskId,
      asset_style: 'runway'
    });

    return Response.json({
      success: true,
      task_id: taskId,
      status: status,
      message: 'Video generation started. Will check status in a moment.'
    });
  } catch (error) {
    console.error('Error generating Runway video:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});