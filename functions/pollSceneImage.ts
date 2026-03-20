import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// POLL SCENE IMAGE — checks pending image tasks and resolves them
// ══════════════════════════════════════════════════════════════════
// Called by frontend every 5s after generateSceneImage submits tasks.
// Checks AI33 Seedream, Grok Imagine, and Nano Banana task statuses.
// Resolves task IDs (ai33_task:xxx, grok_img_task:xxx, nano_task:xxx)
// into final image URLs and updates scene records.
// ══════════════════════════════════════════════════════════════════
// Inputs:
//   { scene_id: "abc" }           — poll single scene
//   { project_id: "xyz" }         — poll all image_pending scenes in project
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";
const AI33_BASE = "https://api.ai33.pro";

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

    console.log(`🔍 Polling ${scenesToPoll.length} pending image tasks...`);

    const results = [];

    for (const scene of scenesToPoll) {
      const imageUrl = scene.image_url || '';
      const sceneNum = scene.scene_number;

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

          const pollRes = await fetch(`${AI33_BASE}/v1/task/${taskId}`, {
            headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_API_KEY }
          });

          if (!pollRes.ok) {
            console.log(`⏳ Scene ${sceneNum}: AI33 poll returned HTTP ${pollRes.status}, still processing`);
            results.push({ scene_number: sceneNum, status: 'processing' });
            continue;
          }

          const pollData = await pollRes.json();

          // ── DONE ──
          if (pollData.status === 'done') {
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

          // ── FAILED ──
          if (pollData.status === 'error' || pollData.status === 'failed') {
            const errMsg = pollData.error_message || 'AI33 task failed';
            console.warn(`❌ Scene ${sceneNum}: AI33 failed — ${errMsg}`);
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
            results.push({ scene_number: sceneNum, status: 'failed', error: errMsg });
            continue;
          }

          // ── STILL PROCESSING ──
          const progress = pollData.progress || pollData.percentage || null;
          console.log(`⏳ Scene ${sceneNum}: AI33 processing${progress ? ` (${progress}%)` : ''}...`);
          results.push({ scene_number: sceneNum, status: 'processing', progress });
          continue;
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

          // ── FAIL ──
          if (poll.data?.state === 'fail') {
            const errMsg = poll.data?.failMsg || 'Grok task failed';
            console.warn(`❌ Scene ${sceneNum}: Grok failed — ${errMsg}`);
            await base44.asServiceRole.entities.Scenes.update(scene.id, { status: 'image_failed', image_url: '' });
            results.push({ scene_number: sceneNum, status: 'failed', error: errMsg });
            continue;
          }

          // ── STILL PROCESSING ──
          console.log(`⏳ Scene ${sceneNum}: Grok processing (state: ${poll.data?.state || 'unknown'})...`);
          results.push({ scene_number: sceneNum, status: 'processing' });
          continue;
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

              if (sceneNum === 1 && projectForRef && !projectForRef.reference_image_url) {
                try {
                  await base44.asServiceRole.entities.Projects.update(projectForRef.id, {
                    reference_image_url: finalUrl
                  });
                  projectForRef.reference_image_url = finalUrl;
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
          console.log(`⏳ Scene ${sceneNum}: Nano Banana processing...`);
          results.push({ scene_number: sceneNum, status: 'processing' });
          continue;
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