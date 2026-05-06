import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed

// ══════════════════════════════════════════════════════════════════
// SCENE VIDEO GENERATOR — Grok Imagine image-to-video via Kie API
// ══════════════════════════════════════════════════════════════════
// Generates animated video from scene still image using Grok Imagine.
// 480p, 6s clips. ~$0.10 per 6s video.
//
// REQUIRES: Scene must have a public HTTP image_url.
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

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

    if (scene.image_url.startsWith('data:')) {
      return Response.json({
        error: 'Scene image is a data URI. Requires a public URL. Re-generate the scene image.',
        scene_id
      }, { status: 400 });
    }

    if (!scene.image_url.startsWith('http')) {
      return Response.json({ error: 'Scene image must be a public HTTP URL' }, { status: 400 });
    }

    // Build animation prompt
    const prompt = scene.animation_prompt || "Subtle cinematic motion, slow camera movement";

    console.log(`🎬 Scene ${scene.scene_number} | Grok Imagine image-to-video | 480p`);
    console.log(`🖼️ Image: ${scene.image_url.substring(0, 80)}...`);
    console.log(`🎥 Prompt: ${prompt.substring(0, 120)}...`);

    // ══════════════════════════════════════════════════════════════
    // SUBMIT TO GROK IMAGINE IMAGE-TO-VIDEO VIA KIE
    // ══════════════════════════════════════════════════════════════

    const response = await fetch(`${KIE_BASE}/createTask`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${KIE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "grok-imagine/image-to-video",
        input: {
          image_urls: [scene.image_url],
          prompt,
          mode: "normal",
          duration: "5",
          resolution: "480p"
        }
      })
    });

    const resText = await response.text();
    console.log(`Kie response (${response.status}): ${resText.substring(0, 300)}`);

    let resData;
    try {
      resData = JSON.parse(resText);
    } catch (e) {
      throw new Error("Kie returned non-JSON: " + resText.substring(0, 200));
    }

    if (!response.ok || resData.code !== 200) {
      throw new Error(`Kie API error: ${resData.message || resData.msg || resText.substring(0, 200)}`);
    }

    const taskId = resData.data?.taskId;
    if (!taskId) throw new Error("No taskId returned from Kie API");

    console.log(`✓ Grok video task created: ${taskId}`);

    // Store task reference on scene (grok_vid_task prefix to distinguish)
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      video_url: `grok_vid_task:${taskId}`,
      status: "pending"
    });

    return Response.json({
      success: true,
      task_id: taskId,
      scene_number: scene.scene_number,
      provider: "grok-imagine/image-to-video",
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