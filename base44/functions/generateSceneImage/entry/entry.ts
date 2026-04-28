import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// IMAGE GENERATION — POLLING ONLY (v2)
// Pipeline: Script → Breakdown → Prompts → Submit → [THIS] → Animation
// ══════════════════════════════════════════════════════════════════
// This function checks the status of pending KIE image tasks 
// (z-image and grok) and updates the scene when complete.
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ─────────────────────────────────────────────
// KIE API — QUERY STATUS
// ─────────────────────────────────────────────

async function queryKieTask(apiKey, taskId) {
  const res = await fetch(`${KIE_BASE}/queryTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ taskId })
  });

  const result = await res.json();

  if (!res.ok || result.code !== 200) {
    throw new Error(result.msg || `Kie queryTask failed (HTTP ${res.status})`);
  }

  return result.data; 
  // Expected standard KIE data payload: 
  // { status: 1|2|3 (or string equivalent), imageUrl: "...", images: ["..."] }
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Robust payload parsing to prevent 400 errors
    let body = {};
    try {
      const rawBody = await req.json();
      // Unwrap Base44 SDK payload which nests arguments inside a "data" object
      body = (rawBody.data && typeof rawBody.data === 'object' && !Array.isArray(rawBody.data)) 
        ? rawBody.data 
        : rawBody;
    } catch (e) {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    // Accept both snake_case and camelCase
    const project_id = body.project_id || body.projectId;

    if (!project_id) {
      return Response.json({ error: "Provide project_id or projectId" }, { status: 400 });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return Response.json({ error: "No KIE API key configured" }, { status: 500 });
    }

    // ── Fetch only pending scenes for this project ────────────
    const projectScenes = await base44.asServiceRole.entities.Scenes.filter({ 
      project_id, 
      status: 'image_pending' 
    });

    if (projectScenes.length === 0) {
      return Response.json({ 
        success: true, 
        message: "No pending images to poll", 
        processed: 0,
        still_pending: 0
      });
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔄 IMAGE POLL — Checking ${projectScenes.length} pending scenes`);
    
    let completedCount = 0;
    let failedCount = 0;
    let stillPendingCount = 0;

    const results = [];

    // ── Process each pending scene ────────────────────────────
    for (const scene of projectScenes) {
      const sceneNum = scene.scene_number;
      const currentUrl = scene.image_url;

      // Handle missing/corrupt tasks
      if (!currentUrl) {
        await base44.asServiceRole.entities.Scenes.update(scene.id, { status: "image_failed" });
        failedCount++;
        continue;
      }

      // Automatically fail deprecated provider tasks so the submitter can re-run them
      if (currentUrl.startsWith('ai33_task:') || currentUrl.startsWith('nano_task:')) {
        console.log(`🧹 Scene ${sceneNum}: cleaning up deprecated task (${currentUrl.split(':')[0]})`);
        await base44.asServiceRole.entities.Scenes.update(scene.id, { status: "image_failed" });
        failedCount++;
        continue;
      }

      // Check Z-Image or Grok tasks
      if (currentUrl.startsWith('z_image_task:') || currentUrl.startsWith('grok_img_task:')) {
        const taskId = currentUrl.split(':')[1];
        const provider = currentUrl.startsWith('z_image') ? 'Z-Image' : 'Grok';
        
        try {
          const taskData = await queryKieTask(KIE_API_KEY, taskId);
          
          // Note: Adjust the status integers/strings depending on KIE's exact spec
          // Usually: 1 = Pending/Processing, 2 = Success, 3|other = Failed
          const isSuccess = taskData.status === 2 || taskData.status === 'SUCCESS' || taskData.status === 'COMPLETED';
          const isPending = taskData.status === 1 || taskData.status === 'PROCESSING' || taskData.status === 'PENDING';
          const isFailed = taskData.status === 3 || taskData.status === 'FAILED' || taskData.status === 'CANCELED';

          if (isSuccess) {
            // Some models return `images` array, others return `imageUrl`
            const finalImageUrl = taskData.imageUrl || (taskData.images && taskData.images[0]);
            
            if (finalImageUrl) {
              await base44.asServiceRole.entities.Scenes.update(scene.id, { 
                image_url: finalImageUrl, 
                status: "image_generated" 
              });
              console.log(`✅ Scene ${sceneNum} (${provider}): SUCCESS`);
              completedCount++;
              results.push({ scene: sceneNum, status: 'completed' });
            } else {
              throw new Error("Success status but no image URL returned");
            }
          } else if (isFailed) {
            console.log(`❌ Scene ${sceneNum} (${provider}): FAILED upstream`);
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: "image_failed" });
            failedCount++;
            results.push({ scene: sceneNum, status: 'failed' });
          } else if (isPending) {
            console.log(`⏳ Scene ${sceneNum} (${provider}): Still processing...`);
            stillPendingCount++;
            results.push({ scene: sceneNum, status: 'pending' });
          } else {
            console.warn(`❓ Scene ${sceneNum} (${provider}): Unknown status ->`, taskData.status);
            stillPendingCount++;
          }
          
        } catch (err) {
          console.warn(`⚠️ Scene ${sceneNum} query error:`, err.message);
          // Don't fail the scene immediately on a network error; let it retry on the next poll
          stillPendingCount++; 
        }
      }
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 POLL RESULTS:`);
    console.log(`✅ ${completedCount} Completed | ❌ ${failedCount} Failed | ⏳ ${stillPendingCount} Still Pending`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      processed: projectScenes.length,
      completed: completedCount,
      failed: failedCount,
      still_pending: stillPendingCount,
      done: stillPendingCount === 0, // Frontend can use this flag to stop polling
      results
    });

  } catch (error) {
    console.error("❌ pollSceneImage error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});