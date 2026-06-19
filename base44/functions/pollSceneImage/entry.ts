import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// POLL SCENE IMAGE — z-image only
// ══════════════════════════════════════════════════════════════════
// Official KIE polling endpoint per docs.kie.ai/market/common/get-task-detail:
//
//   GET /api/v1/jobs/recordInfo?taskId={taskId}
//
// Response shape:
//   { code: 200, data: {
//       state: "waiting"|"queuing"|"generating"|"success"|"fail",
//       resultJson: '{"resultUrls":["https://..."]}'
//       failMsg: "..."
//   }}
//
// generateSceneImage saves tasks as:  image_url = "zimage_task:{taskId}"
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ── Character detection for smart reference locking ───────────
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

// ── Poll one task via the correct KIE unified endpoint ────────
// Returns { status: 'pending'|'done'|'failed', imageUrl?, error? }
async function pollOneTask(kieApiKey, taskId) {
  const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${kieApiKey}` }
  });

  if (res.status === 429) {
    console.warn(`⏳ KIE rate limited — task ${taskId}`);
    return { status: 'pending' };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`KIE recordInfo HTTP ${res.status} for task ${taskId}: ${text.substring(0, 150)}`);
    return { status: 'pending' }; // transient HTTP errors → keep polling
  }

  const result = await res.json();

  if (result.code !== 200) {
    console.warn(`KIE recordInfo code=${result.code} msg="${result.msg}" task=${taskId}`);
    if (result.code === 404 || result.code === -1) {
      return { status: 'failed', error: `Task not found (code ${result.code})` };
    }
    return { status: 'pending' };
  }

  const data = result.data || {};
  const state = (data.state || '').toLowerCase();

  console.log(`🔍 task ${taskId}: state="${state}"`);

  // Terminal failure
  if (state === 'fail') {
    return { status: 'failed', error: data.failMsg || 'Task failed' };
  }

  // Still running
  if (state !== 'success') {
    // waiting / queuing / generating → keep polling
    return { status: 'pending' };
  }

  // ── state === 'success' — extract image URL ────────────────
  // Per docs: resultJson = '{"resultUrls":["https://..."]}'
  let imageUrl = null;

  if (data.resultJson) {
    try {
      const parsed = typeof data.resultJson === 'string'
        ? JSON.parse(data.resultJson)
        : data.resultJson;
      imageUrl = parsed?.resultUrls?.[0]
        || parsed?.images?.[0]
        || parsed?.image_url
        || parsed?.url
        || (Array.isArray(parsed) ? parsed[0] : null);
      if (imageUrl) console.log(`✅ task ${taskId}: URL from resultJson.resultUrls`);
    } catch (e) {
      console.warn(`Failed to parse resultJson for task ${taskId}: ${e.message}`);
    }
  }

  // Fallback: top-level fields
  if (!imageUrl) {
    imageUrl = data.imageUrl || data.image_url || data.url || data.output_url;
    if (imageUrl) console.log(`✅ task ${taskId}: URL from top-level field`);
  }

  // Last resort: regex scan the whole data blob
  if (!imageUrl) {
    const str = JSON.stringify(data);
    const match = str.match(/https?:\/\/[^\s"'\\]+\.(?:png|jpg|jpeg|webp)(?:\?[^\s"'\\]*)?/i);
    if (match) {
      imageUrl = match[0];
      console.log(`✅ task ${taskId}: URL via deep scan → ${imageUrl.substring(0, 80)}`);
    }
  }

  if (!imageUrl) {
    console.warn(`⚠️ task ${taskId}: state=success but no image URL. data=${JSON.stringify(data).substring(0, 400)}`);
    return { status: 'failed', error: 'Task succeeded but no image URL in response' };
  }

  return { status: 'done', imageUrl };
}

// ── Re-submit a scene back to z-image (stale/failed recovery) ─
async function resubmitZImage(kieApiKey, scene, aspectRatio) {
  if (!kieApiKey) return null;
  const prompt = (scene.image_prompt || '').trim();
  if (!prompt || prompt.startsWith('DIRECTOR_NOTES:')) return null;

  let truncated = prompt;
  if (truncated.length > 1000) {
    const cut = truncated.lastIndexOf(',', 950);
    truncated = (cut > 0 ? truncated.substring(0, cut) : truncated.substring(0, 950)).trim();
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
    console.log(`🔄 resubmit OK: new taskId=${result.data.taskId}`);
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

    // ── Resolve pending scenes ──────────────────────────────────
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
      return Response.json({ success: true, done: totalPending === 0, results: [], pending: totalPending, completed: 0, failed: 0 });
    }

    const aspectRatio = projectForRef?.orientation === 'portrait' ? '9:16' : '16:9';
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 min — give genuinely-running tasks time before resubmitting
    const now = Date.now();

    console.log(`🔍 Polling ${scenesToPoll.length} pending scenes (aspect: ${aspectRatio})...`);

    const results = [];

    for (const scene of scenesToPoll) {
      const imageUrl = scene.image_url || '';
      const sceneNum = scene.scene_number;

      // ── Already a real URL (edge case cleanup) ─────────────────
      if (imageUrl.startsWith('http')) {
        if (scene.status === 'image_pending') {
          await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_generated' });
        }
        results.push({ scene_number: sceneNum, status: 'done', image_url: imageUrl });
        continue;
      }

      // ── Extract taskId — accept current and legacy prefixes ────
      const isZImageTask = imageUrl.startsWith('zimage_task:')
        || imageUrl.startsWith('z_image_task:')   // old typo guard
        || imageUrl.startsWith('kie_task:');       // legacy

      if (!isZImageTask) {
        console.warn(`Scene ${sceneNum}: unrecognized prefix "${imageUrl.substring(0, 40)}" — skipping`);
        results.push({ scene_number: sceneNum, status: 'skipped', reason: 'unknown_prefix' });
        continue;
      }

      const taskId = imageUrl
        .replace('zimage_task:', '')
        .replace('z_image_task:', '')
        .replace('kie_task:', '');

      // ── Staleness check ────────────────────────────────────────
      const updatedAt = scene.updated_date ? new Date(scene.updated_date).getTime() : 0;
      const isStale = updatedAt > 0 && (now - updatedAt) > STALE_THRESHOLD_MS;

      if (isStale) {
        const ageS = Math.round((now - updatedAt) / 1000);
        console.warn(`⏰ Scene ${sceneNum}: STALE (${ageS}s, task=${taskId}) — resubmitting`);
        const newTaskId = await resubmitZImage(KIE_API_KEY, scene, aspectRatio);
        if (newTaskId) {
          await base44.asServiceRole.entities.Scenes.update(scene.id, {
            image_url: `zimage_task:${newTaskId}`,
            status: 'image_pending'
          });
          results.push({ scene_number: sceneNum, status: 'processing', fallback: 'stale_resubmit' });
        } else {
          await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
          results.push({ scene_number: sceneNum, status: 'failed', error: 'Stale, resubmit failed' });
        }
        continue;
      }

      // ── Poll ───────────────────────────────────────────────────
      try {
        const poll = await pollOneTask(KIE_API_KEY, taskId);

        if (poll.status === 'done') {
          // ✅ Save image URL
          await base44.asServiceRole.entities.Scenes.update(scene.id, {
            image_url: poll.imageUrl,
            status: 'image_generated'
          });

          // Smart reference locking
          if (projectForRef && !projectForRef.reference_image_url && detectCharacterInScene(scene)) {
            try {
              await base44.asServiceRole.entities.Projects.update(projectForRef.id, {
                reference_image_url: poll.imageUrl
              });
              projectForRef.reference_image_url = poll.imageUrl;
              console.log(`📌 Scene ${sceneNum}: reference locked → ${poll.imageUrl.substring(0, 60)}`);
            } catch (refErr) {
              console.warn(`⚠️ Reference lock failed: ${refErr.message}`);
            }
          }

          console.log(`✅ Scene ${sceneNum}: done → ${poll.imageUrl.substring(0, 80)}`);
          results.push({ scene_number: sceneNum, status: 'done', image_url: poll.imageUrl });

        } else if (poll.status === 'failed') {
          // One automatic resubmit before giving up
          console.warn(`❌ Scene ${sceneNum}: failed (${poll.error}) — resubmitting once`);
          const newTaskId = await resubmitZImage(KIE_API_KEY, scene, aspectRatio);
          if (newTaskId) {
            await base44.asServiceRole.entities.Scenes.update(scene.id, {
              image_url: `zimage_task:${newTaskId}`,
              status: 'image_pending'
            });
            console.log(`🔄 Scene ${sceneNum}: resubmitted (${newTaskId})`);
            results.push({ scene_number: sceneNum, status: 'processing', fallback: 'auto_resubmit' });
          } else {
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
            results.push({ scene_number: sceneNum, status: 'failed', error: poll.error });
          }

        } else {
          // ⏳ Still pending (waiting / queuing / generating)
          console.log(`⏳ Scene ${sceneNum}: still processing (task ${taskId})`);
          results.push({ scene_number: sceneNum, status: 'processing' });
        }

      } catch (err) {
        console.error(`⚠️ Poll error scene ${sceneNum} (task ${taskId}): ${err.message}`);
        results.push({ scene_number: sceneNum, status: 'processing', error: err.message });
      }
    }

    // ── Project-wide tally ──────────────────────────────────────
    const completed = results.filter(r => r.status === 'done').length;
    const failed    = results.filter(r => r.status === 'failed').length;
    const pending   = results.filter(r => r.status === 'processing').length;

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

    console.log(`📊 ✅${completed} done | ⏳${pending} pending | ❌${failed} failed | project pending: ${allProjectPending}`);

    return Response.json({
      success: true,
      done: allProjectPending === 0,
      pending: allProjectPending,
      completed,
      failed,
      results
    });

  } catch (error) {
    console.error('❌ pollSceneImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});