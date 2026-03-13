import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// IMAGE GENERATION — Grok Imagine via Kie API
// Pipeline: Script → Breakdown → Prompts → [THIS] → Animation
// ══════════════════════════════════════════════════════════════════
// Accepts: single scene_id OR array of scene_ids for batch mode
// Processes scenes concurrently with configurable parallelism
// Retries failed generations with exponential backoff
// Polls with timeout to avoid infinite hangs
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ── Tuning knobs ──────────────────────────────────────────────
const MAX_CONCURRENT = 3;        // Parallel Kie image jobs
const MAX_RETRIES = 3;           // Retries per scene on failure
const POLL_INTERVAL_MS = 4000;   // Time between poll checks
const POLL_TIMEOUT_MS = 300000;  // 5 min max wait per image
const MAX_PROMPT_CHARS = 1200;   // Grok's sweet spot ceiling
const RETRY_BASE_MS = 3000;      // Base delay for exponential backoff

// ─────────────────────────────────────────────
// KIE API HELPERS — with retry + timeout
// ─────────────────────────────────────────────

async function kieCreateTask(apiKey, model, input, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${KIE_BASE}/createTask`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model, input })
      });

      const result = await res.json();

      // Rate limited — back off and retry
      if (res.status === 429) {
        const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`⏳ Kie rate limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok || result.code !== 200) {
        throw new Error(result.msg || `Kie createTask failed (HTTP ${res.status})`);
      }

      return result.data.taskId;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`⚠️ Kie createTask attempt ${attempt + 1} failed: ${error.message}, retrying in ${waitMs / 1000}s...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

async function kiePollResult(apiKey, taskId) {
  const startTime = Date.now();

  while (true) {
    // ── Timeout guard ──
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      throw new Error(`Kie polling timed out after ${POLL_TIMEOUT_MS / 1000}s for task ${taskId}`);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });

      const poll = await res.json();
      if (poll.code !== 200) continue;

      if (poll.data?.state === "success") {
        const resultJson = JSON.parse(poll.data.resultJson || "{}");
        const url = resultJson.resultUrls?.[0];
        if (!url) throw new Error(`Kie task ${taskId} succeeded but returned no URL`);
        return url;
      }

      if (poll.data?.state === "fail") {
        throw new Error(poll.data?.failMsg || `Kie task ${taskId} failed`);
      }

      // Still processing — continue polling
    } catch (error) {
      // Network error during poll — don't crash, just retry the poll
      if (error.message.includes('timed out') || error.message.includes('failed')) {
        throw error; // Re-throw actual failures
      }
      console.warn(`⚠️ Poll network error for task ${taskId}: ${error.message}, retrying...`);
    }
  }
}

async function generateWithGrokImagine(apiKey, prompt, aspectRatio) {
  const taskId = await kieCreateTask(apiKey, "grok-imagine/text-to-image", {
    prompt: prompt,
    aspect_ratio: aspectRatio
  });

  return await kiePollResult(apiKey, taskId);
}

// ─────────────────────────────────────────────
// PROMPT CLEANING — strip metadata Grok renders as visible text
// ─────────────────────────────────────────────

function cleanPromptForGrok(rawPrompt) {
  let p = rawPrompt;

  // 1. Strip orientation/format directives (handled by aspect_ratio param)
  p = p
    .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
    .replace(/\b(widescreen|wide\s*screen)\b/gi, '')
    .replace(/\b\d{1,2}\s*:\s*\d{1,2}\s*(frame|format|ratio|widescreen|vertical|horizontal)?\s*,?\s*/gi, '')
    .replace(/\b(wide|tall)\s+(cinematic|vertical|horizontal)\s+(framing|composition)\b/gi, '')
    .replace(/\bvertical\s+\d+:\d+\b/gi, '')
    .replace(/\bhorizontal\s+\d+:\d+\b/gi, '');

  // 2. Strip anti-text instructions (Grok renders these AS text)
  p = p
    .replace(/,?\s*ABSOLUTELY\s+NO\s+text[\s\S]{0,120}?(in the image|of any kind)[.\s]*/gi, '')
    .replace(/,?\s*NO\s+text,?\s*words,?\s*letters[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '')
    .replace(/,?\s*FORBIDDEN:?\s*text[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '');

  // 3. Strip resolution/quality metadata that leaks as text
  p = p
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
    .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');

  // 4. Strip all numbers/measurements Grok renders as visible text
  p = p
    .replace(/\b\d+\s*mm\b/gi, '')             // "35mm", "24mm"
    .replace(/\b\d+\s*m\b/gi, '')              // "10m", "35m"
    .replace(/\b\d+\s*meters?\b/gi, '')        // "10 meters"
    .replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, '')   // "f/5.6", "F:6"
    .replace(/\b\d+\s*degrees?\b/gi, '')       // "36 degrees"
    .replace(/\b\d+\s*°\b/g, '')               // "36°"
    .replace(/\b\d+k\b/gi, '')                 // "4k", "35k"
    .replace(/\b\d+p\b/gi, '')                 // "480p", "720p"
    .replace(/\b\d+\s*mers?\b/gi, '')          // "10 mers" (LLM typos)
    .replace(/\b\d+\s*x\s*\d+\b/gi, '');       // "1920x1080"

  // 5. Strip markdown/formatting artifacts from identity injection
  p = p
    .replace(/\*\*[^*]+\*\*/g, (match) => match.replace(/\*\*/g, ''))  // **bold** → bold
    .replace(/\*/g, '')
    .replace(/#{1,3}\s*/g, '');

  // 6. Clean up artifacts (double commas, double spaces, leading commas/periods)
  p = p
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.]+/, '')
    .trim();

  // 7. Smart cap — never cut mid-sentence
  if (p.length > MAX_PROMPT_CHARS) {
    const cutZone = p.substring(MAX_PROMPT_CHARS - 100, MAX_PROMPT_CHARS);
    const lastPeriod = cutZone.lastIndexOf('.');
    const lastComma = cutZone.lastIndexOf(',');
    const cutPoint = lastPeriod >= 0 ? (MAX_PROMPT_CHARS - 100) + lastPeriod + 1
                   : lastComma >= 0 ? (MAX_PROMPT_CHARS - 100) + lastComma + 1
                   : MAX_PROMPT_CHARS;
    p = p.substring(0, cutPoint).trim();
  }

  return p;
}

// ─────────────────────────────────────────────
// SINGLE SCENE PROCESSOR
// ─────────────────────────────────────────────

async function processScene(base44, scene, project, apiKey, aspectRatio) {
  const sceneNum = scene.scene_number;

  if (!scene.image_prompt) {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'no_prompt' };
  }

  // Skip if already generated (idempotent re-runs)
  if (scene.status === 'image_generated' && scene.image_url) {
    console.log(`⏭️ Scene ${sceneNum}: already has image — skipping`);
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'already_generated' };
  }

  const finalPrompt = cleanPromptForGrok(scene.image_prompt);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`🎨 Scene ${sceneNum}: generating (attempt ${attempt + 1}/${MAX_RETRIES}, ${finalPrompt.length} chars)...`);

      const imageUrl = await generateWithGrokImagine(apiKey, finalPrompt, aspectRatio);

      // Validate URL
      if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
        throw new Error(`Invalid image URL returned: ${imageUrl}`);
      }

      await base44.asServiceRole.entities.Scenes.update(scene.id, {
        image_url: imageUrl,
        status: "image_generated"
      });

      console.log(`✓ Scene ${sceneNum}: image generated (${finalPrompt.length} chars → ${imageUrl.substring(0, 60)}...)`);

      return {
        scene_id: scene.id,
        scene_number: sceneNum,
        status: 'success',
        image_url: imageUrl,
        prompt_length: finalPrompt.length,
        attempts: attempt + 1
      };

    } catch (error) {
      console.warn(`⚠️ Scene ${sceneNum} attempt ${attempt + 1} failed: ${error.message}`);

      if (attempt === MAX_RETRIES - 1) {
        // Final attempt failed — mark scene so it can be retried later
        try {
          await base44.asServiceRole.entities.Scenes.update(scene.id, {
            status: "image_failed"
          });
        } catch (_) {}

        console.error(`❌ Scene ${sceneNum}: all ${MAX_RETRIES} attempts failed — marked as image_failed`);

        return {
          scene_id: scene.id,
          scene_number: sceneNum,
          status: 'failed',
          error: error.message,
          attempts: MAX_RETRIES
        };
      }

      // Exponential backoff before retry
      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
      console.log(`⏳ Scene ${sceneNum}: retrying in ${waitMs / 1000}s...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

// ─────────────────────────────────────────────
// CONCURRENCY POOL — process N scenes at a time
// ─────────────────────────────────────────────

async function processWithConcurrency(tasks, concurrency) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = task().then(result => {
      executing.delete(promise);
      return result;
    });
    executing.add(promise);
    results.push(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

// ─────────────────────────────────────────────
// MAIN HANDLER — supports single + batch mode
// ─────────────────────────────────────────────
// Single: { scene_id: "abc" }
// Batch:  { scene_ids: ["abc", "def", ...] }
// Auto:   { project_id: "xyz" } → all prompts_ready scenes
// ─────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { scene_id, scene_ids, project_id } = body;

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return Response.json({ error: "KIE_API_KEY not configured" }, { status: 500 });
    }

    // ── Resolve which scenes to process ──────────────────────

    let scenesToProcess = [];
    let project = null;

    if (scene_id) {
      // Single scene mode (backward compatible)
      const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
      if (!scenes[0]) return Response.json({ error: "Scene not found" }, { status: 404 });
      scenesToProcess = [scenes[0]];

      const projects = await base44.asServiceRole.entities.Projects.filter({ id: scenes[0].project_id });
      project = projects[0];

    } else if (scene_ids && Array.isArray(scene_ids)) {
      // Explicit batch mode
      const allScenes = await base44.asServiceRole.entities.Scenes.filter({
        id: scene_ids[0] // Fetch by first to get project_id, then filter
      });
      if (!allScenes[0]) return Response.json({ error: "No scenes found" }, { status: 404 });

      const pid = allScenes[0].project_id;
      const projectScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: pid });
      scenesToProcess = projectScenes
        .filter(s => scene_ids.includes(s.id))
        .sort((a, b) => a.scene_number - b.scene_number);

      const projects = await base44.asServiceRole.entities.Projects.filter({ id: pid });
      project = projects[0];

    } else if (project_id) {
      // Auto mode — all prompts_ready + image_failed scenes
      const projectScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      scenesToProcess = projectScenes
        .filter(s => s.status === 'prompts_ready' || s.status === 'image_failed')
        .sort((a, b) => a.scene_number - b.scene_number);

      const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
      project = projects[0];

    } else {
      return Response.json({ error: "Provide scene_id, scene_ids, or project_id" }, { status: 400 });
    }

    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    if (scenesToProcess.length === 0) {
      return Response.json({
        success: true,
        done: true,
        message: "No scenes pending image generation",
        total_processed: 0
      });
    }

    // ── Project settings ──────────────────────────────────────
    const aspectRatio = project.orientation === "portrait" ? "9:16" : "16:9";

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 IMAGE GENERATION — ${scenesToProcess.length} scenes`);
    console.log(`📐 Aspect ratio: ${aspectRatio} | ⚡ Concurrency: ${MAX_CONCURRENT}`);
    console.log(`🔄 Retries: ${MAX_RETRIES} | ⏱️ Poll timeout: ${POLL_TIMEOUT_MS / 1000}s`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ── Process with concurrency pool ─────────────────────────
    const tasks = scenesToProcess.map(scene => () =>
      processScene(base44, scene, project, KIE_API_KEY, aspectRatio)
    );

    const results = await processWithConcurrency(tasks, MAX_CONCURRENT);

    // ── Tally results ─────────────────────────────────────────
    const succeeded = results.filter(r => r.status === 'success');
    const failed = results.filter(r => r.status === 'failed');
    const skipped = results.filter(r => r.status === 'skipped');

    // Check if ALL project scenes are now generated
    const allProjectScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: project.id });
    const remainingScenes = allProjectScenes.filter(s =>
      s.status === 'prompts_ready' || s.status === 'image_failed'
    ).length;
    const allDone = remainingScenes === 0;

    if (allDone) {
      try {
        await base44.asServiceRole.entities.Projects.update(project.id, {
          status: "images_complete"
        });
      } catch (_) {}
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 IMAGE GENERATION COMPLETE`);
    console.log(`✓ ${succeeded.length} generated | ❌ ${failed.length} failed | ⏭️ ${skipped.length} skipped`);
    if (failed.length > 0) {
      console.log(`Failed scenes: ${failed.map(f => `S${f.scene_number}: ${f.error}`).join(' | ')}`);
    }
    console.log(`📊 Remaining: ${remainingScenes} scenes still need images`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      done: allDone,
      total_processed: scenesToProcess.length,
      succeeded: succeeded.length,
      failed: failed.length,
      skipped: skipped.length,
      remaining_scenes: remainingScenes,
      results: results.map(r => ({
        scene_number: r.scene_number,
        status: r.status,
        attempts: r.attempts,
        image_url: r.image_url,
        error: r.error
      }))
    });

  } catch (error) {
    console.error("❌ generateImage error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});