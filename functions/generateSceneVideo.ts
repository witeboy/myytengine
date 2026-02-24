import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const VEO_BASE = "https://api.kie.ai/api/v1/veo";

Deno.serve(async (req) => {
  let base44;
  let scene_id;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    scene_id = body.scene_id;

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    const aspectRatio = project?.orientation === 'portrait' ? '9:16' : '16:9';

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    // 🔒 Ensure we have a public URL
    let imageUrl = scene.image_url;
    const isBase64 = typeof imageUrl === "string" && (imageUrl.startsWith("data:") || imageUrl.length > 5000);
    if (isBase64) {
      console.log("⚠️ Base64 detected. Uploading to Base44 for public URL...");

      const base64Data = imageUrl.includes(",") ? imageUrl.split(",")[1] : imageUrl;
      if (!base64Data) throw new Error("Invalid base64 image format");

      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const blob = new Blob([binaryData], { type: "image/png" });
      const filename = `scene_${scene_id}_${Date.now()}.png`;

      const uploadResult = await base44.asServiceRole.assets.upload(filename, blob);
      if (!uploadResult?.url) throw new Error("Failed to upload base64 image to public URL");
      imageUrl = uploadResult.url;

      // Update scene with public URL
      await base44.asServiceRole.entities.Scenes.update(scene_id, { image_url: imageUrl });
      console.log("✅ Image converted to public URL:", imageUrl);
    }

    if (!imageUrl.startsWith("http")) {
      return Response.json({ error: "Scene image must be a public URL" }, { status: 400 });
    }

    // Build prompt
    let prompt = scene.animation_prompt || "Subtle cinematic motion, slow camera movement";

    console.log("Sending Veo request:", { imageUrl, prompt, aspectRatio });

    const veoResponse = await fetch(`${VEO_BASE}/generate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        imageUrls: [imageUrl],
        model: "veo3_fast",
        aspect_ratio: aspectRatio,
        generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO"
      })
    });

    const veoText = await veoResponse.text();
    let veoData;
    try {
      veoData = JSON.parse(veoText);
    } catch (e) {
      throw new Error("Veo returned non-JSON response: " + veoText.substring(0, 200));
    }

    if (!veoResponse.ok || veoData.code !== 200) {
      throw new Error(`Veo API error: ${veoData.msg || "Unknown"}`);
    }

    const taskId = veoData.data?.taskId;
    if (!taskId) throw new Error("No taskId returned from Veo API");

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      video_url: `veo_task:${taskId}`,
      status: "pending"
    });

    return Response.json({
      success: true,
      task_id: taskId,
      scene_number: scene.scene_number,
      provider: "veo3_fast",
      status: "CREATED"
    });

  } catch (error) {
    console.error("generateSceneVideo error:", error.message, error.stack);
    if (scene_id && base44) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});