import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// FLOW/RE-MAKE — Progression Video Generator
// ══════════════════════════════════════════════════════════════════
// Uses Kling 2.1 Standard (720p) via KIE API
// Supports start_frame + end_frame for true transition videos
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
  console.log(`Kie response (${res.status}): ${resText.substring(0, 300)}`);

  let result;
  try { result = JSON.parse(resText); } catch (e) {
    throw new Error("Kie returned non-JSON: " + resText.substring(0, 200));
  }

  if (!res.ok || result.code !== 200) {
    throw new Error(result.msg || result.message || "Kie createTask failed");
  }

  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxPolls = 90) {
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });

    const poll = await res.json();
    if (poll.code !== 200) continue;

    if (poll.data?.state === "success") {
      const resultJson = JSON.parse(poll.data.resultJson || "{}");
      return resultJson.resultUrls?.[0];
    }

    if (poll.data?.state === "fail") {
      throw new Error(poll.data?.failMsg || "Video generation failed");
    }

    // Log progress
    if (i % 6 === 0) {
      console.log(`  ⏳ Poll ${i + 1}/${maxPolls} — state: ${poll.data?.state || 'processing'}`);
    }
  }

  throw new Error("Polling timed out after " + (maxPolls * 5) + "s");
}

Deno.serve(async (req) => {
  let base44, start_scene_id;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    start_scene_id = body.start_scene_id;
    const end_scene_id = body.end_scene_id;
    const poll = body.poll !== false; // default: poll until done

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY missing' }, { status: 500 });

    // Fetch both scenes
    const startScenes = await base44.asServiceRole.entities.Scenes.filter({ id: start_scene_id });
    const startScene = startScenes[0];
    if (!startScene?.image_url?.startsWith('http')) {
      return Response.json({ error: 'Start scene has no valid image URL' }, { status: 400 });
    }

    const endScenes = await base44.asServiceRole.entities.Scenes.filter({ id: end_scene_id });
    const endScene = endScenes[0];
    if (!endScene?.image_url?.startsWith('http')) {
      return Response.json({ error: 'End scene has no valid image URL' }, { status: 400 });
    }

    // Build motion prompt from the start scene's animation_prompt
    const motionPrompt = startScene.animation_prompt ||
      'High-speed cinematic time-lapse, construction progression, workers seen from behind with no visible faces, equipment and machinery in motion, dust particles catching sunlight, subtle steady camera push-in';

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 Progression Video: S${startScene.scene_number} → S${endScene.scene_number}`);
    console.log(`🖼️ Start: ${startScene.image_url.substring(0, 60)}...`);
    console.log(`🖼️ End:   ${endScene.image_url.substring(0, 60)}...`);
    console.log(`🎥 Model: Kling 2.1 Standard (720p)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ═══ Kling 2.1 via KIE — Start Frame + End Frame ═══
    let taskId = null;
    let mode = 'dual_frame';

    try {
      // Primary: Kling 2.1 with start + end frame
      taskId = await kieCreateTask(KIE_API_KEY, "kling/v2.1/standard/image-to-video", {
        start_frame: startScene.image_url,
        end_frame: endScene.image_url,
        prompt: motionPrompt.substring(0, 500),
        duration: "5",
      });
      console.log(`✓ Kling 2.1 dual-frame task: ${taskId}`);
    } catch (dualErr) {
      console.warn(`⚠ Kling dual-frame failed: ${dualErr.message}`);

      // Fallback 1: Try with image_urls array format
      try {
        taskId = await kieCreateTask(KIE_API_KEY, "kling/v2.1/standard/image-to-video", {
          image_urls: [startScene.image_url, endScene.image_url],
          prompt: motionPrompt.substring(0, 500),
          duration: "5",
        });
        console.log(`✓ Kling 2.1 image_urls array task: ${taskId}`);
      } catch (arrErr) {
        console.warn(`⚠ Kling image_urls failed: ${arrErr.message}`);

        // Fallback 2: Single start image + enhanced prompt describing end state
        mode = 'single_frame';
        const enhancedPrompt = `${motionPrompt}. The scene progressively transforms toward: ${endScene.narration_text || 'the next stage of completion'}. Cinematic high-speed time-lapse showing the full transformation with smooth continuous motion.`;

        try {
          taskId = await kieCreateTask(KIE_API_KEY, "kling/v2.1/standard/image-to-video", {
            image_urls: [startScene.image_url],
            prompt: enhancedPrompt.substring(0, 500),
            duration: "5",
          });
          console.log(`✓ Kling 2.1 single-frame fallback: ${taskId}`);
        } catch (singleErr) {
          console.warn(`⚠ Kling single failed: ${singleErr.message}`);

          // Fallback 3: Grok Imagine (original provider)
          mode = 'grok_fallback';
          taskId = await kieCreateTask(KIE_API_KEY, "grok-imagine/image-to-video", {
            image_urls: [startScene.image_url],
            prompt: enhancedPrompt.substring(0, 500),
            mode: "normal",
            duration: "6",
            resolution: "480p"
          });
          console.log(`✓ Grok Imagine fallback task: ${taskId}`);
        }
      }
    }

    if (!taskId) throw new Error("All video generation methods failed");

    // Store task reference
    await base44.asServiceRole.entities.Scenes.update(start_scene_id, {
      video_url: `grok_vid_task:${taskId}`,
      status: "pending"
    });

    // If poll=true (default), wait for completion
    if (poll) {
      console.log(`⏳ Polling for completion...`);
      try {
        const videoUrl = await kiePollResult(KIE_API_KEY, taskId, 90);

        if (videoUrl) {
          await base44.asServiceRole.entities.Scenes.update(start_scene_id, {
            video_url: videoUrl,
            status: "video_generated"
          });
          console.log(`✓ Video ready: ${videoUrl.substring(0, 60)}...`);

          return Response.json({
            success: true,
            video_url: videoUrl,
            task_id: taskId,
            mode,
            start_scene: startScene.scene_number,
            end_scene: endScene.scene_number,
            status: "COMPLETED"
          });
        }
      } catch (pollErr) {
        console.warn(`⚠ Poll failed: ${pollErr.message} — returning task_id for manual polling`);
      }
    }

    return Response.json({
      success: true,
      task_id: taskId,
      mode,
      start_scene: startScene.scene_number,
      end_scene: endScene.scene_number,
      status: "PROCESSING"
    });

  } catch (error) {
    console.error("generateProgressionVideo error:", error.message);
    if (start_scene_id && base44) {
      try { await base44.asServiceRole.entities.Scenes.update(start_scene_id, { status: "failed" }); } catch (_) {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});
