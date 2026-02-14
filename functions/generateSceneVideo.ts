import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scene_id } = await req.json();

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    if (!scene.image_url) {
      return Response.json({ error: 'Scene image must be generated first' }, { status: 400 });
    }

    const apiKey = Deno.env.get("FREEPIK_API_KEY");
    if (!apiKey) return Response.json({ error: 'FREEPIK_API_KEY not configured' }, { status: 500 });

    // Use Freepik Kling v2 image-to-video API
    const duration = scene.duration_seconds && scene.duration_seconds >= 10 ? "10" : "5";

    const response = await fetch("https://api.freepik.com/v1/ai/image-to-video/kling-v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": apiKey
      },
      body: JSON.stringify({
        image: scene.image_url,
        duration: duration,
        prompt: scene.animation_prompt || "Subtle cinematic motion, slow camera movement",
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Freepik API error:", response.status, errorText);
      throw new Error(`Freepik API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const taskId = data?.data?.task_id;

    if (!taskId) {
      throw new Error('No task_id returned from Freepik');
    }

    // Store the task ID on the scene for polling
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      video_url: `freepik_task:${taskId}`,
      status: "pending"
    });

    return Response.json({ success: true, task_id: taskId, status: data?.data?.status });
  } catch (error) {
    console.error("generateSceneVideo error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});