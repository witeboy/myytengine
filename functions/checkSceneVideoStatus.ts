import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, scene_id } = await req.json();

    const apiKey = Deno.env.get("FREEPIK_API_KEY");
    if (!apiKey) return Response.json({ error: 'FREEPIK_API_KEY not configured' }, { status: 500 });

    const response = await fetch(`https://api.freepik.com/v1/ai/image-to-video/kling-v2/${task_id}`, {
      method: "GET",
      headers: {
        "x-freepik-api-key": apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Freepik status check error:", response.status, errorText);
      return Response.json({ status: "error", error: errorText });
    }

    const data = await response.json();
    const status = data?.data?.status; // CREATED, PROCESSING, COMPLETED, FAILED
    const videoUrls = data?.data?.generated || [];

    // If completed, update the scene
    if (status === "COMPLETED" && videoUrls.length > 0 && scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: videoUrls[0],
        status: "video_generated"
      });
    } else if (status === "FAILED" && scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        status: "failed"
      });
    }

    return Response.json({
      status: status,
      video_url: videoUrls[0] || null,
      task_id: task_id
    });
  } catch (error) {
    console.error("checkSceneVideoStatus error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});