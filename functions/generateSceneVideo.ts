import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE VIDEO GENERATOR — Google Veo 3.1 via Kie API
// ══════════════════════════════════════════════════════════════════
//
// Generates animated video from scene still image using Veo 3.1.
// Image-to-video: scene image becomes the opening frame,
// animation prompt drives the motion.
//
// MODEL: veo3_fast (Veo 3.1 Fast) + 1080p upgrade ($0.025/video)
// ENDPOINT: https://api.kie.ai/api/v1/veo/generate
// POLL: https://api.kie.ai/api/v1/veo/record-info?taskId={id}
// 1080P: https://api.kie.ai/api/v1/veo/get-1080p-video?taskId={id}
//
// generationType:
//   FIRST_AND_LAST_FRAMES_2_VIDEO — 1 image = animate from this frame
//
// successFlag in poll response:
//   0 = generating, 1 = success, 2 = failed, 3 = generation failed
// ══════════════════════════════════════════════════════════════════

const VEO_BASE = "https://api.kie.ai/api/v1/veo";

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

    // Reject data URIs — Veo needs a publicly accessible URL
    if (scene.image_url.startsWith('data:')) {
      return Response.json({
        error: 'Scene image is a data URI (base64). Veo requires a publicly accessible image URL. Re-generate the scene image.',
        scene_id
      }, { status: 400 });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });
    }

    // Get project for orientation
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    const orientation = project?.orientation || 'landscape';
    const aspectRatio = orientation === 'portrait' ? '9:16' : '16:9';

    // ── Build animation prompt ──────────────────────────────────────
    let prompt = scene.animation_prompt || "Subtle cinematic motion, slow camera movement";

    const cameraMap = {
      static: "Static camera, no movement",
      slow_pan: "Slow horizontal pan",
      slow_zoom_in: "Slow push-in zoom",
      slow_zoom_out: "Slow pull-out zoom",
      dolly_zoom: "Dolly zoom vertigo effect",
      crane_shot: "Rising crane shot",
      tracking_shot: "Tracking shot following subject",
      orbital: "Orbital rotation around subject",
      tilt_up: "Slow upward tilt",
      tilt_down: "Slow downward tilt"
    };

    const speedMap = {
      very_slow: "very slow pace",
      slow: "slow pace",
      normal: "moderate pace",
      fast: "fast dynamic pace"
    };

    if (scene.camera_movement && cameraMap[scene.camera_movement]) {
      prompt = cameraMap[scene.camera_movement] + ". " + prompt;
    }
    if (scene.animation_speed && speedMap[scene.animation_speed]) {
      prompt += ". " + speedMap[scene.animation_speed];
    }
    if (scene.visual_effects) {
      try {
        const fx = JSON.parse(scene.visual_effects);
        if (fx.length > 0) prompt += ". Visual effects: " + fx.join(", ");
      } catch (_) {}
    }

    console.log(`Scene ${scene.scene_number} | Veo 3.1 Quality | ${aspectRatio}`);
    console.log(`Image: ${scene.image_url.substring(0, 80)}...`);
    console.log(`Prompt: ${prompt.substring(0, 120)}...`);

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
        generationType: "FIRST_AND_LAST_FRAMES_2_VIDEO",
        enableTranslation: false
      })
    });

    const veoText = await veoResponse.text();
    console.log(`Veo API response (${veoResponse.status}): ${veoText.substring(0, 500)}`);

    if (!veoResponse.ok) {
      return Response.json({
        error: `Veo API error: ${veoResponse.status} - ${veoText}`
      }, { status: 500 });
    }

    let veoData;
    try {
      veoData = JSON.parse(veoText);
    } catch (e) {
      return Response.json({ error: `Veo API returned non-JSON: ${veoText.substring(0, 200)}` }, { status: 500 });
    }

    if (veoData.code !== 200) {
      return Response.json({
        error: `Veo API rejected: ${veoData.msg || JSON.stringify(veoData)}`
      }, { status: 500 });
    }

    const taskId = veoData.data?.taskId;
    if (!taskId) {
      return Response.json({ error: 'No taskId returned from Veo API', raw: veoData }, { status: 500 });
    }

    console.log(`Veo task created: ${taskId}`);

    // ── Store task reference ────────────────────────────────────────
    // Use valid enum status "pending" and store task reference in video_url
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      video_url: `veo_task:${taskId}`,
      status: "pending"
    });

    return Response.json({
      success: true,
      task_id: taskId,
      provider: "veo3_fast",
      status: "CREATED",
      aspect_ratio: aspectRatio,
      resolution: "1080p",
      scene_number: scene.scene_number
    });

  } catch (error) {
    console.error("generateSceneVideo error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});