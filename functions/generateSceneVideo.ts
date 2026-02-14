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

    // Use Runway API to animate the image
    const apiKey = Deno.env.get("AI33_API_KEY");
    
    const response = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "X-Runway-Version": "2024-11-06"
      },
      body: JSON.stringify({
        model: "gen4_turbo",
        promptImage: scene.image_url,
        promptText: scene.animation_prompt,
        duration: Math.min(scene.duration_seconds || 10, 10),
        ratio: "1280:720"
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Runway API error: ${errorData.error || response.status}`);
    }

    const data = await response.json();

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      video_url: data.id ? `runway_task:${data.id}` : '',
      status: data.id ? "video_generated" : "image_generated"
    });

    return Response.json({ success: true, task_id: data.id });
  } catch (error) {
    console.error("generateSceneVideo error:", error.message);
    // Don't fail the scene, just keep it at image_generated
    return Response.json({ error: error.message }, { status: 500 });
  }
});