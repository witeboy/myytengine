import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// POLL SCENE IMAGE — z-image only
// ══════════════════════════════════════════════════════════════════
// Called by frontend every 5s after generateSceneImage submits tasks.
// Resolves zimage_task:{taskId} tokens → real image URLs.
//
// ROOT CAUSE OF THE BUG:
//   generateSceneImage saves:   image_url = "zimage_task:{taskId}"
//   Old poll was checking for:  imageUrl.startsWith('z_image_task:')
//   That prefix never matched → scenes stayed image_pending forever
//   even though KIE showed them as "success" in the dashboard.
//
// This version fixes the prefix, uses the correct KIE endpoint
// (queryTask, not recordInfo), and handles all resultJson shapes.
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ── Character presence detection for smart reference locking ──
function detectCharacterInScene(scene) {
  if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
    try {
      const notes = JSON.parse(scene.image_prompt.substring('DIRECTOR_NOTES:'.length));
      if (notes.characters_present?.length > 0) return true;
    } catch (_) {}
  }
  const prompt = (scene.image_prompt || '').toLowerCase();
  return /\b(woman|man|person|figure|character|boy|girl|child|worker|doctor|soldier|officer|teacher|scientist|skeleton|people|crowd|couple|family|mother|father|husband|wife|protagonist|narrator)\b/.test(prompt);
}

// ── Poll a single Z-Image task via KIE queryTask endpoint ────
// Returns { status: 'pending'|'done'|'failed', imageUrl?, error? }
async function pollZImageTask(kieApiKey, taskId) {
  const res = await fetch(`${KIE_BASE}/queryTask?taskId=${taskId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${kieApiKey}`,
      "Content-Type": "application/json"
    }
  });

  if (res.status === 429) {
    console.warn(`⏳ KIE rate limited polling z-image task ${taskId}`);
    return { status: 'pending' };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`KIE queryTask HTTP ${res.status} for task ${taskId}: ${text.substring(0, 200)}`);
    return { status: 'pending' }; // treat transient HTTP errors as still-pending
  }

  const result = await res.json();

  if (result.code !== 200) {
    console.warn(`KIE queryTask error code=${result.code} msg="${result.msg}" for task ${taskId}`);
    if (result.code === 404 || result.code === -1) {
      return { status: 'failed', error: `Task not found (code ${result.code})` };
    }
    return { status: 'pending' };
  }

  const data = result.data || {};

  // ── State extraction ───────────────────────────────────────
  // Z-Image: state lives at data.record.state
  // Fallback to data.state / data.status for safety
  const recordState  = (data.record?.state || '').toLowerCase();
  const topState     = (data.state         || '').toLowerCase();
  const topStatus    = (data.status        || '').toLowerCase();
  const effectiveState = recordState || topState || topStatus;

  console.log(`🔍 z-image task ${taskId}: state="${effectiveState}" (record.state="${recordState}" data.state="${topState}" data.status="${topStatus}")`);

  // Terminal failure
  if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'fail'].includes(effectiveState)) {
    const errMsg = data.record?.failMsg || data.failMsg || data.error || `state=${effectiveState}`;
    return { status: 'failed', error: errMsg };
  }

  // Still running
  if (!['success', 'succeeded', 'completed', 'done', 'finish', 'finished'].includes(effectiveState)) {
    return { status: 'pending' };
  }

  // ── Extract image URL ──────────────────────────────────────
  // Z-Image primary: data.record.resultJson → parse → images[0]
  let imageUrl = null;

  const resultJsonRaw = data.record?.resultJson || data.resultJson;
  if (resultJsonRaw) {
    try {
      const parsed = typeof resultJsonRaw === 'string' ? JSON.parse(resultJsonRaw) : resultJsonRaw;
      imageUrl = parsed?.images?.[0]        // Z-Image v1 format
        || parsed?.resultUrls?.[0]          // older Z-Image format
        || parsed?.image_url
        || parsed?.url
        || parsed?.output_url
        || (Array.isArray(parsed) ? parsed[0] : null);
      if (imageUrl) console.log(`✅ task ${taskId}: URL from resultJson`);
    } catch (e) {
      console.warn(`Failed to parse resultJson for task ${taskId}: ${e.message}`);
    }
  }

  // Fallback: top-level data fields
  if (!imageUrl) {
    imageUrl = data.images?.[0]
      || data.image_url
      || data.output_url
      || data.url
      || data.record?.imageUrl
      || data.record?.image_url
      || data.record?.url;
    if (imageUrl) console.log(`✅ task ${taskId}: URL from top-level data`);
  }

  // Last resort: regex scan entire response blob for any image URL
  if (!imageUrl) {
    const str = JSON.stringify(data);
    const match = str.match(/https?:\/\/[^\s"'\\]+\.(?:png|jpg|jpeg|webp)(?:\?[^\s"'\\]*)?/i);
    if (match) {
      imageUrl = match[0];
      console.log(`✅ task ${taskId}: URL via deep scan → ${imageUrl.substring(0, 80)}`);
    }
  }

  if (!imageUrl) {
    console.warn(`⚠️ task ${taskId}: status=done but no image URL. data=${JSON.stringify(data).substring(0, 500)}`);
    return { status: 'failed', error: 'Task completed but no image URL in response' };
  }

  return { status: 'done', imageUrl };
}

// ── Re-submit a scene to z-image (for stale/failed tasks) ────
async function resubmitZImage(kieApiKey, scene, aspectRatio) {
  if (!kieApiKey) return null;
  const prompt = (scene.image_prompt || '').trim();
  if (!prompt || prompt.startsWith('DIRECTOR_NOTES:')) return null;

  // Respect 1000 char hard limit
  let truncated = prompt;
  if (truncated.length > 1000) {
    const cutAt = truncated.lastIndexOf(',', 950);
    truncated = (cutAt > 0 ? truncated.substring(0, cutAt) : truncated.substring(0, 950)).trim();
  }

  try {
    const res = await fetch(`${KIE_BASE}/createTask`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${kieApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "z-image",
        input: { prompt: truncated, aspect_ratio: aspectRatio }
      })
    });
    const result = await res.json();
    if (!res.ok || result.code !== 200) {
      console.warn(`⚠️ z-image resubmit failed: code=${result.code} msg="${result.msg}"`);
      return null;
    }
    return result.data.taskId;
  } catch (err) {
    console.warn(`⚠️ z-image resubmit error: ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { scene_id, project_id } = await req.json();
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");

    if (!KIE_API_KEY) {
      return Response.json({ error: "KIE_API_KEY not configured" }, { status: 500 });
    }

    // ── Resolve scenes to poll ──────────────────────────────────
    let scenesToPoll = [];
    let projectForRef = null;

    if (scene_id) {
      const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
      if (scenes[0]) {
        scenesToPoll = [scenes[0]];
        const projects = await base44.asServiceRole.entities.Projects.filter({ id: scenes[0].project_id });
        projectForRef = projects[0];
      }
    } else if (project_id) {
      const all = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      scenesToPoll = all.filter(s => s.status === 'image_pending');
      const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
      projectForRef = projects[0];
    } else {
      return Response.json({ error: "Provide scene_id or project_id" }, { status: 400 });
    }

    if (scenesToPoll.length === 0) {
      let totalPending = 0;
      if (project_id) {
        const all = await base44.asServiceRole.entities.Scenes.filter({ project_id });
        totalPending = all.filter(s => s.status === 'image_pending').length;
      }
      return Response.json({
        success: true,
        done: totalPending === 0,
        results: [],
        pending: totalPending,
        completed: 0,
        failed: 0
      });
    }

    const aspectRatio = projectForRef?.orientation === 'portrait' ? '9:16' : '16:9';

    // Z-Image completes in ~30-60s. 4 minutes = genuinely stuck.
    const STALE_THRESHOLD_MS = 4 * 60 * 1000;
    const now = Date.now();

    console.log(`🔍 Polling ${scenesToPoll.length} pending z-image tasks (aspect: ${aspectRatio})...`);

    const results = [];

    for (const scene of scenesToPoll) {
      const imageUrl = scene.image_url || '';
      const sceneNum = scene.scene_number;

      // ── Already a real URL (edge case) ────────────────────────
      if (imageUrl.startsWith('http')) {
        if (scene.status === 'image_pending') {
          await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_generated' });
        }
        results.push({ scene_number: sceneNum, status: 'done', image_url: imageUrl });
        continue;
      }

      // ── Accept both the current prefix and the legacy typo ────
      const isZImageTask = imageUrl.startsWith('zimage_task:')  // ← correct (current)
        || imageUrl.startsWith('z_image_task:')                  // ← old typo guard
        || imageUrl.startsWith('kie_task:');                     // ← legacy

      if (!isZImageTask) {
        console.warn(`Scene ${sceneNum}: unrecognized prefix "${imageUrl.substring(0, 40)}" — skipping`);
        results.push({ scene_number: sceneNum, status: 'skipped', reason: 'unknown_prefix' });
        continue;
      }

      // Extract task ID regardless of prefix variant
      const taskId = imageUrl
        .replace('zimage_task:', '')
        .replace('z_image_task:', '')
        .replace('kie_task:', '');

      // ── Staleness check ────────────────────────────────────────
      const updatedAt = scene.updated_date ? new Date(scene.updated_date).getTime() : 0;
      const age = now - updatedAt;
      const isStale = updatedAt > 0 && age > STALE_THRESHOLD_MS;

      if (isStale) {
        console.warn(`⏰ Scene ${sceneNum}: STALE (${Math.round(age / 1000)}s old, task=${taskId}) — resubmitting`);
        const newTaskId = await resubmitZImage(KIE_API_KEY, scene, aspectRatio);
        if (newTaskId) {
          await base44.asServiceRole.entities.Scenes.update(scene.id, {
            image_url: `zimage_task:${newTaskId}`,
            status: 'image_pending'
          });
          console.log(`🔄 Scene ${sceneNum}: stale → resubmitted (${newTaskId})`);
          results.push({ scene_number: sceneNum, status: 'processing', fallback: 'zimage_stale_recovery' });
        } else {
          await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
          results.push({ scene_number: sceneNum, status: 'failed', error: 'Stale, resubmit failed' });
        }
        continue;
      }

      // ── Poll ───────────────────────────────────────────────────
      try {
        const pollResult = await pollZImageTask(KIE_API_KEY, taskId);

        if (pollResult.status === 'done' && pollResult.imageUrl) {
          // ✅ Save image
          await base44.asServiceRole.entities.Scenes.update(scene.id, {
            image_url: pollResult.imageUrl,
            status: 'image_generated'
          });

          // Smart reference locking: first character-containing scene becomes style anchor
          if (projectForRef && !projectForRef.reference_image_url && detectCharacterInScene(scene)) {
            try {
              await base44.asServiceRole.entities.Projects.update(projectForRef.id, {
                reference_image_url: pollResult.imageUrl
              });
              projectForRef.reference_image_url = pollResult.imageUrl;
              console.log(`📌 Scene ${sceneNum}: reference locked → ${pollResult.imageUrl.substring(0, 60)}`);
            } catch (refErr) {
              console.warn(`⚠️ Failed to lock reference: ${refErr.message}`);
            }
          }

          console.log(`✅ Scene ${sceneNum}: done → ${pollResult.imageUrl.substring(0, 80)}`);
          results.push({ scene_number: sceneNum, status: 'done', image_url: pollResult.imageUrl });

        } else if (pollResult.status === 'failed') {
          // ❌ One automatic resubmit before giving up
          console.warn(`❌ Scene ${sceneNum}: z-image failed (${pollResult.error}) — resubmitting once`);
          const newTaskId = await resubmitZImage(KIE_API_KEY, scene, aspectRatio);
          if (newTaskId) {
            await base44.asServiceRole.entities.Scenes.update(scene.id, {
              image_url: `zimage_task:${newTaskId}`,
              status: 'image_pending'
            });
            console.log(`🔄 Scene ${sceneNum}: failed → resubmitted (${newTaskId})`);
            results.push({ scene_number: sceneNum, status: 'processing', fallback: 'zimage_retry' });
          } else {
            await base44.asServiceRole.entities.Scenes.update(scene.id, {
              status: 'image_failed',
              image_url: ''
            });
            results.push({ scene_number: sceneNum, status: 'failed', error: pollResult.error });
          }

        } else {
          // ⏳ Still pending — normal, keep polling
          console.log(`⏳ Scene ${sceneNum}: z-image processing (task ${taskId})`);
          results.push({ scene_number: sceneNum, status: 'processing' });
        }

      } catch (err) {
        console.error(`⚠️ Poll error scene ${sceneNum} (task ${taskId}): ${err.message}`);
        // Don't fail the scene on a network hiccup — keep it pending
        results.push({ scene_number: sceneNum, status: 'processing', error: err.message });
      }
    }

    // ── Tally ───────────────────────────────────────────────────
    const pending   = results.filter(r => r.status === 'processing').length;
    const completed = results.filter(r => r.status === 'done').length;
    const failed    = results.filter(r => r.status === 'failed').length;
    const errors    = results.filter(r => r.status === 'error').length;

    // Check project-wide state
    let allProjectPending = 0;
    const pid = project_id || scenesToPoll[0]?.project_id;
    if (pid) {
      const allScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: pid });
      allProjectPending = allScenes.filter(s => s.status === 'image_pending').length;

      if (allProjectPending === 0) {
        const stillNeedImages = allScenes.filter(s =>
          s.status === 'prompts_ready' || s.status === 'image_failed'
        ).length;
        if (stillNeedImages === 0) {
          try {
            await base44.asServiceRole.entities.Projects.update(pid, { status: 'images_complete' });
            console.log(`🎉 All images complete for project ${pid}`);
          } catch (_) {}
        }
      }
    }

    const allDone = allProjectPending === 0;
    console.log(`📊 Poll round: ✅${completed} done | ⏳${pending} pending | ❌${failed} failed | ⚠️${errors} errors | project pending: ${allProjectPending}`);

    return Response.json({
      success: true,
      done: allDone,
      pending: allProjectPending,
      completed,
      failed,
      errors,
      results
    });

  } catch (error) {
    console.error('❌ pollSceneImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});