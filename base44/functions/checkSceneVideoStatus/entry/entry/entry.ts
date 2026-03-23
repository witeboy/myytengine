import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, scene_id, provider } = await req.json();

    // Determine provider from task_id prefix or explicit param
    const isRunway = provider === "runway" || (!provider && task_id && !task_id.includes("-") === false);

    // Try Runway first if it looks like a Runway task
    if (provider === "runway" || !provider) {
      const runwayKey = Deno.env.get("RUNWAY_API_KEY");
      if (runwayKey && provider === "runway") {
        const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task_id}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${runwayKey}`,
            "X-Runway-Version": "2024-11-06"
          }
        });

        if (response.ok) {
          const data = await response.json();
          const status = data?.status; // PENDING, RUNNING, SUCCEEDED, FAILED, CANCELLED

          // Map Runway statuses to our standard ones
          let mappedStatus = status;
          if (status === "SUCCEEDED") mappedStatus = "COMPLETED";
          if (status === "PENDING" || status === "RUNNING") mappedStatus = "PROCESSING";

          const videoUrls = data?.output || [];

          if (status === "SUCCEEDED" && videoUrls.length > 0 && scene_id) {
            // Runway URLs are ephemeral — upload to Cloudflare R2
            const videoUrl = videoUrls[0];
            const videoRes = await fetch(videoUrl);
            const videoBytes = new Uint8Array(await videoRes.arrayBuffer());

            const r2Client = new S3Client({
              region: 'auto',
              endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
              credentials: {
                accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
                secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
              },
            });

            const fileName = `videos/scene-${scene_id}-${Date.now()}.mp4`;
            await r2Client.send(new PutObjectCommand({
              Bucket: (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim(),
              Key: fileName,
              Body: videoBytes,
              ContentType: 'video/mp4',
            }));

            const r2PublicUrl = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
            const permanentUrl = `${r2PublicUrl}/${fileName}`;

            await base44.asServiceRole.entities.Scenes.update(scene_id, {
              video_url: permanentUrl,
              status: "video_generated"
            });

            return Response.json({ status: "COMPLETED", video_url: permanentUrl, task_id, provider: "runway" });
          } else if (status === "FAILED" || status === "CANCELLED") {
            if (scene_id) {
              await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
            }
            return Response.json({ status: "FAILED", task_id, provider: "runway", error: data?.failure || "Task failed" });
          }

          return Response.json({ status: mappedStatus, task_id, provider: "runway" });
        }

        const errText = await response.text();
        console.error("Runway status check error:", response.status, errText);
        return Response.json({ status: "error", error: errText, provider: "runway" });
      }
    }

    // Freepik status check
    const freepikKey = Deno.env.get("FREEPIK_API_KEY");
    if (!freepikKey) return Response.json({ error: 'FREEPIK_API_KEY not configured' }, { status: 500 });

    const response = await fetch(`https://api.freepik.com/v1/ai/image-to-video/kling-v2/${task_id}`, {
      method: "GET",
      headers: {
        "x-freepik-api-key": freepikKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Freepik status check error:", response.status, errorText);
      return Response.json({ status: "error", error: errorText, provider: "freepik" });
    }

    const data = await response.json();
    const status = data?.data?.status;
    const videoUrls = data?.data?.generated || [];

    if (status === "COMPLETED" && videoUrls.length > 0 && scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        video_url: videoUrls[0],
        status: "video_generated"
      });
    } else if (status === "FAILED" && scene_id) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
    }

    return Response.json({
      status: status,
      video_url: videoUrls[0] || null,
      task_id: task_id,
      provider: "freepik"
    });
  } catch (error) {
    console.error("checkSceneVideoStatus error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});