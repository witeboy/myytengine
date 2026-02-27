import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE VIDEO GENERATOR — Runway + Hailuo fallback via Kie API
// ══════════════════════════════════════════════════════════════════
// PRIMARY: Runway image-to-video — 5s, 720p, 12 credits
// FALLBACK: Hailuo 02-image-to-video-standard — 5s, 512p, ~$0.05
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

async function kieCreateTask(apiKey, model, input) {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, input })
  });

  const resText = await res.text();
  let resData;
  try { resData = JSON.parse(resText); } catch (_) {
    throw new Error(`Kie returned non-JSON: ${resText.substring(0, 200)}`);
  }

  if (!res.ok || resData.code !== 200) {
    throw new Error(`Kie createTask (${model}): ${resData.msg || resData.message || resText.substring(0, 200)}`);
  }

  const taskId = resData.data?.taskId;
  if (!taskId) throw new Error(`No taskId from ${model}`);
  return taskId;
}

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
      return Response.json({ error: 'Scene image is a data URI. Re-generate the scene image.', scene_id }, { status: 400 });
    }

    if (!scene.image_url.startsWith('http')) {
      return Response.json({ error: 'Scene image must be a public HTTP URL' }, { status: 400 });
    }

    // Verify image URL is still accessible
    try {
      const imgCheck = await fetch(scene.image_url, { method: 'HEAD' });
      if (!imgCheck.ok) {
        return Response.json({ error: `Image URL returned ${imgCheck.status} — re-generate the image`, scene_id }, { status: 400 });
      }
    } catch (urlErr) {
      return Response.json({ error: `Image URL unreachable: ${urlErr.message}`, scene_id }, { status: 400 });
    }

    const prompt = scene.animation_prompt || "Subtle cinematic motion, slow camera movement";

    console.log(`🎬 Scene ${scene.scene_number} | Video generation`);
    console.log(`🖼️ Image: ${scene.image_url.substring(0, 80)}...`);
    console.log(`🎥 Prompt: ${prompt.substring(0, 120)}...`);

    // ══════════════════════════════════════════════════════════════
    // PRIMARY: Runway image-to-video — 5s, 720p
    // ══════════════════════════════════════════════════════════════
    let taskId = null;
    let provider = null;

    try {
      console.log(`[Runway] Attempting 5s 720p...`);
      taskId = await kieCreateTask(KIE_API_KEY, "runway/image-to-video", {
        image_url: scene.image_url,
        prompt,
        duration: "5",
        ratio: "16:9"
      });
      provider = 'runway';
      console.log(`✓ Runway task created: ${taskId}`);
    } catch (runwayErr) {
      console.warn(`⚠️ Runway failed: ${runwayErr.message} — falling back to Hailuo`);

      // ══════════════════════════════════════════════════════════════
      // FALLBACK: Hailuo 02-image-to-video-standard — 5s, 512p
      // ══════════════════════════════════════════════════════════════
      try {
        console.log(`[Hailuo] Attempting 5s 512p...`);
        taskId = await kieCreateTask(KIE_API_KEY, "hailuo/02-image-to-video-standard", {
          image_url: scene.image_url,
          prompt,
          duration: "5"
        });
        provider = 'hailuo';
        console.log(`✓ Hailuo task created: ${taskId}`);
      } catch (hailuoErr) {
        console.error(`❌ Both providers failed. Runway: ${runwayErr.message} | Hailuo: ${hailuoErr.message}`);
        throw new Error(`Video generation failed — Runway: ${runwayErr.message} | Hailuo: ${hailuoErr.message}`);
      }
    }

    // Store task with provider prefix for poller
    const taskPrefix = provider === 'runway' ? 'runway_task' : 'hailuo_task';
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      video_url: `${taskPrefix}:${taskId}`,
      status: "pending"
    });

    return Response.json({
      success: true,
      task_id: taskId,
      scene_number: scene.scene_number,
      provider,
      status: "CREATED"
    });

  } catch (error) {
    console.error("generateSceneVideo error:", error.message);
    if (scene_id && base44) {
      try { await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" }); } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});