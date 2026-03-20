import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// POLL SCENE IMAGE — checks pending image tasks and resolves them
// ══════════════════════════════════════════════════════════════════
// Called by frontend every 5s after generateSceneImage submits tasks.
// Checks AI33 Seedream, Grok Imagine, and Nano Banana task statuses.
// Resolves task IDs (ai33_task:xxx, grok_img_task:xxx, nano_task:xxx)
// into final image URLs and updates scene records.
//
// AUTO-FALLBACK: When AI33 fails (e.g. invalid_generation from content
// moderation), this function automatically resubmits to Grok Imagine
// as a fallback, keeping the scene in image_pending state so the poll
// loop continues seamlessly without marking it as failed.
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";
const AI33_BASE = "https://api.ai33.pro";
const RETRY_BASE_MS = 2000;

// ── Fallback submit to Grok via KIE when AI33 fails ──────────
async function submitGrokFallback(kieApiKey, scene, aspectRatio, referenceImageUrl) {
  if (!kieApiKey) return null;

  // Clean prompt for Grok (strip to 1500 chars, remove text artifacts)
  let prompt = (scene.image_prompt || '').substring(0, 1500);
  // Strip DIRECTOR_NOTES prefix if still present
  if (prompt.startsWith('DIRECTOR_NOTES:')) return null;
  // Strip resolution/aspect text
  prompt = prompt
    .replace(/\b(8K|4K|1080p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed')
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/gi, '')
    .replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, 'shallow depth of field');

  // Detect if scene has a character for image-to-image
  const hasChar = /\b(woman|man|person|figure|character|boy|girl|child|worker|doctor|soldier|officer|people|couple|family|protagonist)\b/i.test(prompt);
  const useRef = hasChar && referenceImageUrl && referenceImageUrl.startsWith('http');

  const model = useRef ? "grok-imagine/image-to-image" : "grok-imagine/text-to-image";
  const input = useRef
    ? { prompt, image_urls: [referenceImageUrl] }
    : { prompt, aspect_ratio: aspectRatio };

  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${kieApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input })
  });

  const result = await res.json();
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, RETRY_BASE_MS));
    return null; // Will retry next poll cycle
  }
  if (!res.ok || result.code !== 200) {
    console.warn(`⚠️ Grok fallback failed: ${result.msg || res.status}`);
    return null;
  }

  return result.data.taskId;
}

// ── Character presence detection for smart reference locking ──
// Only lock a scene as reference if it actually contains a character
function detectCharacterInScene(scene) {
  // Check director notes first (most reliable)
  if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
    try {
      const notes = JSON.parse(scene.image_prompt.substring('DIRECTOR_NOTES:'.length));
      if (notes.characters_present?.length > 0) return true;
    } catch (_) {}
  }
  // Prompt content analysis
  const prompt = (scene.image_prompt || '').toLowerCase();
  return /\b(woman|man|person|figure|character|boy|girl|child|worker|doctor|soldier|officer|teacher|scientist|skeleton|people|crowd|couple|family|mother|father|husband|wife|protagonist|narrator)\b/.test(prompt);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { scene_id, project_id } = await req.json();
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    const AI33_API_KEY = Deno.env.get("AI33_API_KEY");

    // ── Resolve scenes to poll ──────────────────────────────
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
      // Check if everything is already done
      let totalPending = 0;
      if (project_id) {
        const all = await base44.asServiceRole.entities.Scenes.filter({ project_id });
        totalPending = all.filter(s => s.status === 'image_pending').length;
      }
      return Response.json({
        success: true,
        done: true,
        results: [],
        pending: totalPending,
        completed: 0,
        failed: 0
      });
    }

    // ── Staleness detection: scenes stuck in image_pending too long ──
    const STALE_THRESHOLD_MS = 4 * 60 * 1000; // 4 minutes
    const now = Date.now();

    console.log(`🔍 Polling ${scenesToPoll.length} pending image tasks...`);

    const results = [];

    for (const scene of scenesToPoll) {
      const imageUrl = scene.image_url || '';
      const sceneNum = scene.scene_number;

      // ── Check for stale tasks (stuck too long) ──
      const updatedAt = scene.updated_date ? new Date(scene.updated_date).getTime() : 0;
      const age = now - updatedAt;
      const isStale = updatedAt > 0 && age > STALE_THRESHOLD_MS;

      if (isStale && !imageUrl.startsWith('http')) {
        console.warn(`⏰ Scene ${sceneNum}: STALE (${Math.round(age / 1000)}s old) — auto-resubmitting via Grok`);
        const aspectRatio = projectForRef?.orientation === 'portrait' ? '9:16' : '16:9';
        const refUrl = projectForRef?.reference_image_url || null;
        const grokTaskId = await submitGrokFallback(KIE_API_KEY, scene, aspectRatio, refUrl);
        if (grokTaskId) {
          await base44.asServiceRole.entities.Scenes.update(scene.id, {
            image_url: `grok_img_task:${grokTaskId}`,
            status: 'image_pending'
          });
          console.log(`🔄 Scene ${sceneNum}: stale → resubmitted to Grok (${grokTaskId})`);
          results.push({ scene_number: sceneNum, status: 'processing', fallback: 'grok_stale_recovery' });
        } else {
          await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
          results.push({ scene_number: sceneNum, status: 'failed', error: 'Stale task, Grok fallback failed' });
        }
        continue;
      }

      try {
        // ════════════════════════════════════════════════════════
        // AI33 SEEDREAM POLL
        // ════════════════════════════════════════════════════════
        if (imageUrl.startsWith('ai33_task:')) {
          const taskId = imageUrl.replace('ai33_task:', '');

          if (!AI33_API_KEY) {
            results.push({ scene_number: sceneNum, status: 'failed', error: 'AI33 key missing' });
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
            continue;
          }

          let pollRes;
          try {
            pollRes = await fetch(`${AI33_BASE}/v1/task/${taskId}`, {
              headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_API_KEY }
            });
          } catch (fetchErr) {
            console.warn(`⚠️ Scene ${sceneNum}: AI33 poll network error — ${fetchErr.message}`);
            results.push({ scene_number: sceneNum, status: 'processing' });
            continue;
          }

          if (!pollRes.ok) {
            // HTTP 404/410 = task expired or not found → fallback immediately
            if (pollRes.status === 404 || pollRes.status === 410) {
              console.warn(`❌ Scene ${sceneNum}: AI33 task not found (${pollRes.status}) → Grok fallback`);
              const aspectRatio = projectForRef?.orientation === 'portrait' ? '9:16' : '16:9';
              const grokTaskId = await submitGrokFallback(KIE_API_KEY, scene, aspectRatio, projectForRef?.reference_image_url);
              if (grokTaskId) {
                await base44.asServiceRole.entities.Scenes.update(scene.id, { image_url: `grok_img_task:${grokTaskId}`, status: 'image_pending' });
                results.push({ scene_number: sceneNum, status: 'processing', fallback: 'grok' });
              } else {
                await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
                results.push({ scene_number: sceneNum, status: 'failed', error: `AI33 ${pollRes.status}, Grok fallback failed` });
              }
              continue;
            }
            console.log(`⏳ Scene ${sceneNum}: AI33 poll returned HTTP ${pollRes.status}, still processing`);
            results.push({ scene_number: sceneNum, status: 'processing' });
            continue;
          }

          const pollData = await pollRes.json();

          // ── DONE — check multiple possible success statuses ──
          if (pollData.status === 'done' || pollData.status === 'completed' || pollData.status === 'success') {
            const images = pollData.metadata?.result_images;
            const finalUrl = images?.[0]?.imageUrl;

            if (finalUrl) {
              await base44.asServiceRole.entities.Scenes.update(scene.id, {
                image_url: finalUrl,
                status: 'image_generated'
              });

              // Smart reference locking: lock first scene WITH a character, not blindly Scene 1
              if (projectForRef && !projectForRef.reference_image_url) {
                const hasCharacter = detectCharacterInScene(scene);
                if (hasCharacter) {
                  try {
                    await base44.asServiceRole.entities.Projects.update(projectForRef.id, {
                      reference_image_url: finalUrl
                    });
                    projectForRef.reference_image_url = finalUrl;
                    console.log(`📌 Scene ${sceneNum} reference locked (has character): ${finalUrl.substring(0, 60)}`);
                  } catch (refErr) {
                    console.warn(`⚠️ Failed to lock reference: ${refErr.message}`);
                  }
                } else {
                  console.log(`⏭️ Scene ${sceneNum}: no character detected, skipping reference lock`);
                }
              }

              console.log(`✅ Scene ${sceneNum}: AI33 done → ${finalUrl.substring(0, 60)}`);
              results.push({ scene_number: sceneNum, status: 'done', image_url: finalUrl });
              continue;
            } else {
              console.warn(`⚠️ Scene ${sceneNum}: AI33 done but no imageUrl`);
              await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
              results.push({ scene_number: sceneNum, status: 'failed', error: 'AI33 returned no image URL' });
              continue;
            }
          }

          // ── FAILED — auto-fallback to Grok ──
          if (pollData.status === 'error' || pollData.status === 'failed') {
            const errMsg = pollData.error_message || pollData.message || 'AI33 task failed';
            console.warn(`❌ Scene ${sceneNum}: AI33 failed — ${errMsg} → trying Grok fallback`);

            // Try Grok as automatic fallback
            const aspectRatio = projectForRef?.orientation === 'portrait' ? '9:16' : '16:9';
            const refUrl = projectForRef?.reference_image_url || null;
            const grokTaskId = await submitGrokFallback(KIE_API_KEY, scene, aspectRatio, refUrl);

            if (grokTaskId) {
              // Switch to Grok task — scene stays image_pending, next poll picks it up
              await base44.asServiceRole.entities.Scenes.update(scene.id, {
                image_url: `grok_img_task:${grokTaskId}`,
                status: 'image_pending'
              });
              console.log(`🔄 Scene ${sceneNum}: auto-fallback to Grok (${grokTaskId})`);
              results.push({ scene_number: sceneNum, status: 'processing', fallback: 'grok' });
            } else {
              // Grok also couldn't submit — try Nano Banana
              let nanoTaskId = null;
              if (KIE_API_KEY) {
                try {
                  const nanoPrompt = (scene.image_prompt || '').substring(0, 1500);
                  const nanoRes = await fetch(`${KIE_BASE}/createTask`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                      model: "google/nano-banana",
                      input: { prompt: nanoPrompt, output_format: "png", image_size: projectForRef?.orientation === 'portrait' ? '9:16' : '16:9' }
                    })
                  });
                  const nanoResult = await nanoRes.json();
                  if (nanoRes.ok && nanoResult.code === 200) {
                    nanoTaskId = nanoResult.data.taskId;
                  }
                } catch (_) {}
              }

              if (nanoTaskId) {
                await base44.asServiceRole.entities.Scenes.update(scene.id, {
                  image_url: `nano_task:${nanoTaskId}`,
                  status: 'image_pending'
                });
                console.log(`🔄 Scene ${sceneNum}: auto-fallback to Nano (${nanoTaskId})`);
                results.push({ scene_number: sceneNum, status: 'processing', fallback: 'nano' });
              } else {
                // All fallbacks failed
                await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
                results.push({ scene_number: sceneNum, status: 'failed', error: errMsg });
              }
            }
            continue;
          }

          // ── STILL PROCESSING ──
          // AI33 API known in-progress statuses: doing, processing, pending, in_progress, 
          // queued, running, started, waiting, uploading, generating, rendering
          // Treat ANY non-done/non-failed status as still processing — no need for an exhaustive list
          {
            const progress = pollData.progress || pollData.percentage || null;
            console.log(`⏳ Scene ${sceneNum}: AI33 ${pollData.status}${progress ? ` (${progress}%)` : ''}...`);
            results.push({ scene_number: sceneNum, status: 'processing', progress });
            continue;
          }
        }

        // ════════════════════════════════════════════════════════
        // GROK IMAGINE POLL (via KIE)
        // ════════════════════════════════════════════════════════
        if (imageUrl.startsWith('grok_img_task:')) {
          const taskId = imageUrl.replace('grok_img_task:', '');

          if (!KIE_API_KEY) {
            results.push({ scene_number: sceneNum, status: 'failed', error: 'KIE key missing' });
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
            continue;
          }

          const pollRes = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${KIE_API_KEY}` }
          });

          if (!pollRes.ok) {
            console.log(`⏳ Scene ${sceneNum}: Grok poll returned HTTP ${pollRes.status}`);
            results.push({ scene_number: sceneNum, status: 'processing' });
            continue;
          }

          const poll = await pollRes.json();

          if (poll.code !== 200) {
            // Code 500+ or -1 likely means the task doesn't exist — fallback
            if (poll.code >= 500 || poll.code === -1 || poll.code === 404) {
              console.warn(`❌ Scene ${sceneNum}: Grok poll error code ${poll.code} — trying Nano fallback`);
              let nanoTaskId = null;
              if (KIE_API_KEY) {
                try {
                  const nanoPrompt = (scene.image_prompt || '').substring(0, 1500);
                  const nanoRes = await fetch(`${KIE_BASE}/createTask`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ model: "google/nano-banana", input: { prompt: nanoPrompt, output_format: "png", image_size: projectForRef?.orientation === 'portrait' ? '9:16' : '16:9' } })
                  });
                  const nanoResult = await nanoRes.json();
                  if (nanoRes.ok && nanoResult.code === 200) nanoTaskId = nanoResult.data.taskId;
                } catch (_) {}
              }
              if (nanoTaskId) {
                await base44.asServiceRole.entities.Scenes.update(scene.id, { image_url: `nano_task:${nanoTaskId}`, status: 'image_pending' });
                results.push({ scene_number: sceneNum, status: 'processing', fallback: 'nano' });
              } else {
                await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
                results.push({ scene_number: sceneNum, status: 'failed', error: `Grok code ${poll.code}` });
              }
              continue;
            }
            console.log(`⏳ Scene ${sceneNum}: Grok poll code ${poll.code}, still processing`);
            results.push({ scene_number: sceneNum, status: 'processing' });
            continue;
          }

          // ── SUCCESS ──
          if (poll.data?.state === 'success') {
            let finalUrl = null;
            try {
              const resultJson = JSON.parse(poll.data.resultJson || '{}');
              finalUrl = resultJson.resultUrls?.[0];
            } catch (_) {}

            if (finalUrl) {
              await base44.asServiceRole.entities.Scenes.update(scene.id, {
                image_url: finalUrl,
                status: 'image_generated'
              });

              // Smart reference locking
              if (projectForRef && !projectForRef.reference_image_url && detectCharacterInScene(scene)) {
                try {
                  await base44.asServiceRole.entities.Projects.update(projectForRef.id, {
                    reference_image_url: finalUrl
                  });
                  projectForRef.reference_image_url = finalUrl;
                  console.log(`📌 Scene ${sceneNum} reference locked (has character): ${finalUrl.substring(0, 60)}`);
                } catch (_) {}
              }

              console.log(`✅ Scene ${sceneNum}: Grok done → ${finalUrl.substring(0, 60)}`);
              results.push({ scene_number: sceneNum, status: 'done', image_url: finalUrl });
              continue;
            } else {
              await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
              results.push({ scene_number: sceneNum, status: 'failed', error: 'Grok returned no URL' });
              continue;
            }
          }

          // ── FAIL — auto-fallback to Nano Banana ──
          if (poll.data?.state === 'fail') {
            const errMsg = poll.data?.failMsg || 'Grok task failed';
            console.warn(`❌ Scene ${sceneNum}: Grok failed — ${errMsg} → trying Nano fallback`);

            // Try Nano Banana as fallback
            let nanoTaskId = null;
            if (KIE_API_KEY) {
              try {
                const nanoPrompt = (scene.image_prompt || '').substring(0, 1500);
                const nanoRes = await fetch(`${KIE_BASE}/createTask`, {
                  method: "POST",
                  headers: { "Authorization": `Bearer ${KIE_API_KEY}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: "google/nano-banana",
                    input: { prompt: nanoPrompt, output_format: "png", image_size: projectForRef?.orientation === 'portrait' ? '9:16' : '16:9' }
                  })
                });
                const nanoResult = await nanoRes.json();
                if (nanoRes.ok && nanoResult.code === 200) {
                  nanoTaskId = nanoResult.data.taskId;
                }
              } catch (_) {}
            }

            if (nanoTaskId) {
              await base44.asServiceRole.entities.Scenes.update(scene.id, {
                image_url: `nano_task:${nanoTaskId}`,
                status: 'image_pending'
              });
              console.log(`🔄 Scene ${sceneNum}: auto-fallback to Nano (${nanoTaskId})`);
              results.push({ scene_number: sceneNum, status: 'processing', fallback: 'nano' });
            } else {
              await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
              results.push({ scene_number: sceneNum, status: 'failed', error: errMsg });
            }
            continue;
          }

          // ── STILL PROCESSING ──
          // KIE API known in-progress states: doing, processing, pending, queued, running, waiting, uploading
          // Treat ANY non-success/non-fail state as still processing
          {
            const state = poll.data?.state || 'unknown';
            const progress = poll.data?.progress || null;
            console.log(`⏳ Scene ${sceneNum}: Grok ${state}${progress ? ` (${progress}%)` : ''}...`);
            results.push({ scene_number: sceneNum, status: 'processing', progress });
            continue;
          }
        }

        // ════════════════════════════════════════════════════════
        // NANO BANANA POLL (via KIE)
        // ════════════════════════════════════════════════════════
        if (imageUrl.startsWith('nano_task:')) {
          const taskId = imageUrl.replace('nano_task:', '');

          if (!KIE_API_KEY) {
            results.push({ scene_number: sceneNum, status: 'failed', error: 'KIE key missing' });
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
            continue;
          }

          const pollRes = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${KIE_API_KEY}` }
          });

          if (!pollRes.ok) {
            results.push({ scene_number: sceneNum, status: 'processing' });
            continue;
          }

          const poll = await pollRes.json();

          if (poll.code !== 200) {
            results.push({ scene_number: sceneNum, status: 'processing' });
            continue;
          }

          // ── SUCCESS ──
          if (poll.data?.state === 'success') {
            let finalUrl = null;
            try {
              const resultJson = JSON.parse(poll.data.resultJson || '{}');
              finalUrl = resultJson.resultUrls?.[0];
            } catch (_) {}

            if (finalUrl) {
              await base44.asServiceRole.entities.Scenes.update(scene.id, {
                image_url: finalUrl,
                status: 'image_generated'
              });

              // Smart reference locking
              if (projectForRef && !projectForRef.reference_image_url && detectCharacterInScene(scene)) {
                try {
                  await base44.asServiceRole.entities.Projects.update(projectForRef.id, {
                    reference_image_url: finalUrl
                  });
                  projectForRef.reference_image_url = finalUrl;
                  console.log(`📌 Scene ${sceneNum} reference locked (has character): ${finalUrl.substring(0, 60)}`);
                } catch (_) {}
              }

              console.log(`✅ Scene ${sceneNum}: Nano Banana done → ${finalUrl.substring(0, 60)}`);
              results.push({ scene_number: sceneNum, status: 'done', image_url: finalUrl });
              continue;
            } else {
              await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
              results.push({ scene_number: sceneNum, status: 'failed', error: 'Nano returned no URL' });
              continue;
            }
          }

          // ── FAIL ──
          if (poll.data?.state === 'fail') {
            const errMsg = poll.data?.failMsg || 'Nano Banana task failed';
            console.warn(`❌ Scene ${sceneNum}: Nano Banana failed — ${errMsg}`);
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
            results.push({ scene_number: sceneNum, status: 'failed', error: errMsg });
            continue;
          }

          // ── STILL PROCESSING ──
          // Same KIE API states as Grok — treat any non-terminal state as processing
          {
            const state = poll.data?.state || 'unknown';
            const progress = poll.data?.progress || null;
            console.log(`⏳ Scene ${sceneNum}: Nano ${state}${progress ? ` (${progress}%)` : ''}...`);
            results.push({ scene_number: sceneNum, status: 'processing', progress });
            continue;
          }
        }

        // ════════════════════════════════════════════════════════
        // UNKNOWN PREFIX — not a task URL
        // ════════════════════════════════════════════════════════
        if (imageUrl.startsWith('http')) {
          // Already a real URL — mark as generated
          if (scene.status === 'image_pending') {
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_generated' });
          }
          results.push({ scene_number: sceneNum, status: 'done', image_url: imageUrl });
        } else {
          results.push({ scene_number: sceneNum, status: 'skipped', reason: 'unknown_url_format' });
        }

      } catch (err) {
        console.warn(`⚠️ Poll error scene ${sceneNum}: ${err.message}`);
        results.push({ scene_number: sceneNum, status: 'error', error: err.message });
      }
    }

    // ── Tally ────────────────────────────────────────────────
    const pending = results.filter(r => r.status === 'processing').length;
    const completed = results.filter(r => r.status === 'done').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const errors = results.filter(r => r.status === 'error').length;

    // Check total project state
    let allProjectPending = 0;
    const pid = project_id || scenesToPoll[0]?.project_id;
    if (pid) {
      const allScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: pid });
      allProjectPending = allScenes.filter(s => s.status === 'image_pending').length;

      // If everything is done, update project status
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

    console.log(`📊 Poll result: ${completed} done, ${pending} processing, ${failed} failed, ${errors} errors | Project pending: ${allProjectPending}`);

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