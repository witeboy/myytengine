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

    const duration = scene.duration_seconds && scene.duration_seconds >= 10 ? 10 : 5;
    const prompt = scene.animation_prompt || "Subtle cinematic motion, slow camera movement";

    // Try Runway first
    const runwayKey = Deno.env.get("RUNWAY_API_KEY");
    if (runwayKey) {
      try {
        const runwayRes = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${runwayKey}`,
            "X-Runway-Version": "2024-11-06"
          },
          body: JSON.stringify({
            model: "gen4_turbo",
            promptImage: scene.image_url,
            promptText: prompt,
            duration: duration,
            ratio: "1280:720"
          })
        });

        if (runwayRes.ok) {
          const data = await runwayRes.json();
          const taskId = data?.id;

          if (taskId) {
            await base44.asServiceRole.entities.Scenes.update(scene_id, {
              video_url: `runway_task:${taskId}`,
              status: "pending"
            });

            return Response.json({ success: true, task_id: taskId, provider: "runway", status: "CREATED" });
          }
        }

        // Log Runway error but fall through to Freepik
        const errText = await runwayRes.text();
        console.error("Runway API error:", runwayRes.status, errText);
      } catch (runwayErr) {
        console.error("Runway request failed:", runwayErr.message);
      }
    }

    // Fallback to Freepik
    const freepikKey = Deno.env.get("FREEPIK_API_KEY");
    if (!freepikKey) {
      return Response.json({ error: 'No video generation API keys configured (RUNWAY_API_KEY or FREEPIK_API_KEY)' }, { status: 500 });
    }

    const freepikDuration = duration >= 10 ? "10" : "5";
    const freepikRes = await fetch("https://api.freepik.com/v1/ai/image-to-video/kling-v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-freepik-api-key": freepikKey
      },
      body: JSON.stringify({
        image: scene.image_url,
        duration: freepikDuration,
        prompt: prompt,
      })
    });

    if (!freepikRes.ok) {
      const errorText = await freepikRes.text();
      console.error("Freepik API error:", freepikRes.status, errorText);
      return Response.json({ error: `Freepik API error: ${freepikRes.status} - ${errorText}` }, { status: 500 });
    }

    const freepikData = await freepikRes.json();
    const freepikTaskId = freepikData?.data?.task_id;

    if (!freepikTaskId) {
      return Response.json({ error: 'No task_id returned from Freepik' }, { status: 500 });
    }

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      video_url: `freepik_task:${freepikTaskId}`,
      status: "pending"
    });

    return Response.json({ success: true, task_id: freepikTaskId, provider: "freepik", status: "CREATED" });
  } catch (error) {
    console.error("generateSceneVideo error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});