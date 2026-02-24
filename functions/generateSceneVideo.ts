import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE VIDEO GENERATOR — Google Veo 3.1 via Kie API
// ══════════════════════════════════════════════════════════════════
// Generates animated video from scene still image using Veo 3.1.
// Image-to-video: scene image becomes the opening frame.
//
// REQUIRES: Scene must have a public HTTP image_url (not base64/data URI).
// generateSceneImage already returns public URLs from Grok Imagine via Kie.
// ══════════════════════════════════════════════════════════════════

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

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    if (!scene.image_url) {
      return Response.json({ error: 'Scene image must be generated first' }, { status: 400 });
    }

    // Reject data URIs — Veo needs a publicly accessible URL
    if (scene.image_url.startsWith('data:')) {
      return Response.json({
        error: 'Scene image is a data URI. Veo requires a public URL. Re-generate the scene image with Grok Imagine.',
        scene_id
      }, { status: 400 });
    }

    if (!scene.image_url.startsWith('http')) {
      return Response.json({ error: 'Scene image must be a public HTTP URL' }, { status: 400 });
    }

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    const aspectRatio = project?.orientation === 'portrait' ? '9:16' : '16:9';

    // Build animation prompt
    let prompt = scene.animation_prompt || "Subtle cinematic motion, slow camera movement";

    console.log(`🎬 Scene ${scene.scene_number} | Veo 3.1 | ${aspectRatio}`);
    console.log(`🖼️ Image: ${scene.image_url.substring(0, 80)}...`);
    console.log(`🎥 Prompt: ${prompt.substring(0, 120)}...`);

    // ══════════════════════════════════════════════════════════════
    // SUBMIT TO VEO 3.1 VIA KIE
    // ══════════════════════════════════════════════════════════════

    const veoResponse = await fetch(`${VEO_BASE}/generate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        imageUrls: [scene.image_url],
        model: "veo3_fast",
        aspect_ratio: aspectRatio,
        generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO"
      })
    });

    const veoText = await veoResponse.text();
    console.log(`Veo response (${veoResponse.status}): ${veoText.substring(0, 300)}`);

    let veoData;
    try {
      veoData = JSON.parse(veoText);
    } catch (e) {
      throw new Error("Veo returned non-JSON: " + veoText.substring(0, 200));
    }

    if (!veoResponse.ok || veoData.code !== 200) {
      throw new Error(`Veo API error: ${veoData.msg || veoText.substring(0, 200)}`);
    }

    const taskId = veoData.data?.taskId;
    if (!taskId) throw new Error("No taskId returned from Veo API");

    console.log(`✓ Veo task created: ${taskId}`);

    // Store task reference on scene
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
      try {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
      } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});