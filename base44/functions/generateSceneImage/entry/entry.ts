import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// IMAGE GENERATION — SUBMIT-ONLY (v3 — Z-Image only)
// Pipeline: Script → Breakdown → Prompts → [THIS] → pollSceneImage → Animation
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

const MAX_CONCURRENT = 4;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 2000;
const Z_IMAGE_MAX_CHARS = 1000; // Hard limit per Z-Image API spec

// ─────────────────────────────────────────────
// KIE API — SUBMIT ONLY (no polling)
// ─────────────────────────────────────────────

async function kieCreateTask(apiKey, model, input) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const payload = { model, input };
      console.log(`📡 Kie createTask: model=${model}, prompt=${(input.prompt || '').substring(0, 80)}... (${(input.prompt || '').length} chars)`);
      const res = await fetch(`${KIE_BASE}/createTask`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (res.status === 429) {
        const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
        console.warn(`⏳ Kie rate limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok || result.code !== 200) {
        throw new Error(result.msg || `Kie createTask failed (HTTP ${res.status})`);
      }

      return result.data.taskId;
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
      const waitMs = RETRY_BASE_MS * Math.pow(2, attempt);
      console.warn(`⚠️ Kie attempt ${attempt + 1} failed: ${error.message}, retrying in ${waitMs / 1000}s...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

// ─────────────────────────────────────────────
// PROMPT PREPARATION — Z-Image specific
// Hard limit: 1000 chars per Z-Image API spec
// ─────────────────────────────────────────────

function preparePromptForZImage(rawPrompt) {
  let p = rawPrompt;

  // Strip aspect ratio / orientation language (handled by API param)
  p = p
    .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
    .replace(/\b\d{1,2}\s*:\s*\d{1,2}\s*(frame|format|ratio|widescreen|vertical|horizontal)?\s*,?\s*/gi, '');

  // Strip resolution language
  p = p
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
    .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');

  // Strip f-stop (triggers portrait mode)
  p = p.replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, 'shallow depth of field');

  // Strip markdown
  p = p
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*/g, '')
    .replace(/#{1,3}\s*/g, '');

  // Strip skeleton protagonist label prefix
  p = p.replace(/^Skeleton\s+protagonist\s*→\s*/i, '').replace(/\bSkeleton\s+protagonist\s*→\s*/gi, '');

  // Strip screen text content (Z-Image may render it literally)
  p = p
    .replace(/\b(phone|iphone|smartphone|tablet|ipad|mobile)\s+(screen|display)\s+(showing|displaying|with|reading|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'phone screen glowing with soft light,')
    .replace(/\b(laptop|computer|monitor|desktop|macbook)\s+(screen|display)\s+(showing|displaying|with|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'laptop screen casting cool light,')
    .replace(/\b(screen|display)\s+(showing|displaying|that\s+reads|reading|with\s+the\s+text|with\s+text)\s+[^,.]{5,80}[.,]/gi, 'screen glowing softly,')
    .replace(/\bthat\s+(reads|says)\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/\bwith\s+the\s+words?\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/\$[\d,]+\.?\d*\s*(in\s+)?(outstanding|owed|due|remaining|total|balance|charges?|debt|worth|dollars?)?\s*/gi, '')
    .replace(/\b\d+\.?\d*\s*(%|percent)\b/gi, '');

  // Strip embedded anti-text instructions (Z-Image doesn't need them and they waste chars)
  p = p
    .replace(/,?\s*ABSOLUTELY\s+NO\s+text[^.]*\.\s*/gi, '')
    .replace(/,?\s*NO\s+text,?\s*words,?\s*letters[^.]*\.\s*/gi, '')
    .replace(/,?\s*FORBIDDEN:?\s*text[^.]*\.\s*/gi, '');

  // Strip bare NAME placeholders
  p = p.replace(/\bNAME(?:'s)?\b/g, '');

  // Strip all-caps words that are not common acronyms (may render as text)
  p = p.replace(/\b([A-Z]{2,15})\b/g, (match) => {
    const commonCaps = ['ARRI', 'DSLR', 'HDR', 'LUT', 'POV', 'OTS', 'RGB', 'LED', 'CGI', 'DOF',
      'ECU', 'MCU', 'CU', 'MS', 'WS', 'EWS', 'MWS', 'DM', 'UI', 'NO', 'ON', 'IN', 'AT', 'TO',
      'BY', 'OF', 'OR', 'IF', 'AS', 'IS', 'IT', 'AN', 'DO', 'SO', 'UP', 'THE', 'AND', 'FOR',
      'NOT', 'BUT', 'ALL', 'HAS', 'HIS', 'HER', 'RAW', 'RED', 'BMW', 'USA'];
    if (commonCaps.includes(match)) return match;
    return '';
  });

  // Clean up punctuation artifacts
  p = p
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.]+/, '')
    .replace(/\(\s*\)/g, '')
    .trim();

  // Deduplicate near-identical sentences
  const sentences = p.split(/(?<=\.)\s+/).filter(s => s.length > 0);
  if (sentences.length > 3) {
    const kept = [];
    const seenNormalized = [];
    for (const sentence of sentences) {
      const words = sentence.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
      let isDupe = false;
      for (const prevWords of seenNormalized) {
        if (prevWords.length < 5 || words.length < 5) continue;
        const overlap = words.filter(w => prevWords.includes(w)).length;
        const overlapRatio = overlap / Math.min(words.length, prevWords.length);
        if (overlapRatio >= 0.7 && overlap >= 5) { isDupe = true; break; }
      }
      if (!isDupe) { kept.push(sentence); seenNormalized.push(words); }
    }
    if (kept.length < sentences.length) {
      p = kept.join(' ').trim();
      console.log(`🔄 Dedup: removed ${sentences.length - kept.length} duplicate sentence(s)`);
    }
  }

  // ── HARD TRUNCATE to Z-Image 1000 char limit ──
  if (p.length > Z_IMAGE_MAX_CHARS) {
    // Try to cut at a sentence boundary first
    const cutZone = p.substring(Z_IMAGE_MAX_CHARS - 150, Z_IMAGE_MAX_CHARS);
    const lastPeriod = cutZone.lastIndexOf('.');
    const lastComma = cutZone.lastIndexOf(',');
    const cutPoint = lastPeriod >= 0
      ? (Z_IMAGE_MAX_CHARS - 150) + lastPeriod + 1
      : lastComma >= 0
        ? (Z_IMAGE_MAX_CHARS - 150) + lastComma
        : Z_IMAGE_MAX_CHARS;
    p = p.substring(0, cutPoint).trim();
    console.log(`✂️ Truncated to ${p.length} chars for z-image (limit: ${Z_IMAGE_MAX_CHARS})`);
  }

  return p;
}

// ─────────────────────────────────────────────
// CHARACTER PRESENCE DETECTION
// ─────────────────────────────────────────────

function detectCharacterPresence(scene) {
  if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
    try {
      const notes = JSON.parse(scene.image_prompt.substring('DIRECTOR_NOTES:'.length));
      if (notes.characters_present && Array.isArray(notes.characters_present) && notes.characters_present.length > 0) {
        return true;
      }
    } catch (_) {}
  }

  const prompt = (scene.image_prompt || '').toLowerCase();
  const humanIndicators = /\b(woman|man|person|figure|character|boy|girl|child|worker|doctor|soldier|officer|teacher|scientist|skeleton|people|crowd|couple|family|mother|father|husband|wife|protagonist|narrator)\b/;
  return humanIndicators.test(prompt);
}

// ─────────────────────────────────────────────
// SINGLE SCENE PROCESSOR — Z-Image only
// ─────────────────────────────────────────────

async function processScene(base44, scene, project, kieApiKey, aspectRatio) {
  const sceneNum = scene.scene_number;

  if (!scene.image_prompt) {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'no_prompt' };
  }

  // Skip if already fully generated (not a pending task token)
  if (
    scene.status === 'image_generated' &&
    scene.image_url &&
    !scene.image_url.startsWith('zimage_task:')
  ) {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'already_generated' };
  }

  if (scene.status === 'image_pending') {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'already_pending' };
  }

  // Prepare and truncate prompt to Z-Image's 1000 char hard limit
  const finalPrompt = preparePromptForZImage(scene.image_prompt);

  console.log(`📐 Scene ${sceneNum}: prompt ${finalPrompt.length} chars (max ${Z_IMAGE_MAX_CHARS}): "${finalPrompt.substring(0, 150)}..."`);

  try {
    // Z-Image: requires prompt + aspect_ratio (colon format: "16:9" or "9:16")
    const taskId = await kieCreateTask(kieApiKey, "z-image", {
      prompt: finalPrompt,
      aspect_ratio: aspectRatio   // "16:9" or "9:16"
    });

    await base44.asServiceRole.entities.Scenes.update(scene.id, {
      image_url: `zimage_task:${taskId}`,
      status: "image_pending"
    });

    console.log(`✓ Scene ${sceneNum}: z-image task submitted (${taskId})`);

    return {
      scene_id: scene.id,
      scene_number: sceneNum,
      status: 'submitted',
      task_id: taskId,
      provider: 'z_image'
    };

  } catch (err) {
    console.warn(`⚠️ Scene ${sceneNum} z-image submit failed: ${err.message}`);

    try {
      await base44.asServiceRole.entities.Scenes.update(scene.id, { status: "image_failed" });
    } catch (_) {}

    return {
      scene_id: scene.id,
      scene_number: sceneNum,
      status: 'failed',
      error: err.message
    };
  }
}

// ─────────────────────────────────────────────
// CONCURRENCY POOL
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
// MAIN HANDLER
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

    let scenesToProcess = [];
    let project = null;

    if (scene_id) {
      const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
      if (!scenes[0]) return Response.json({ error: "Scene not found" }, { status: 404 });
      scenesToProcess = [scenes[0]];
      const projects = await base44.asServiceRole.entities.Projects.filter({ id: scenes[0].project_id });
      project = projects[0];

    } else if (scene_ids && Array.isArray(scene_ids)) {
      const allScenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_ids[0] });
      if (!allScenes[0]) return Response.json({ error: "No scenes found" }, { status: 404 });
      const pid = allScenes[0].project_id;
      const projectScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: pid });
      scenesToProcess = projectScenes
        .filter(s => scene_ids.includes(s.id))
        .sort((a, b) => a.scene_number - b.scene_number);
      const projects = await base44.asServiceRole.entities.Projects.filter({ id: pid });
      project = projects[0];

    } else if (project_id) {
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
      return Response.json({ success: true, done: true, message: "No scenes pending", total_processed: 0 });
    }

    const aspectRatio = project.orientation === "portrait" ? "9:16" : "16:9";

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 IMAGE SUBMIT — ${scenesToProcess.length} scenes`);
    console.log(`📐 Aspect: ${aspectRatio} | ⚡ Concurrency: ${MAX_CONCURRENT} | 🎯 Provider: z-image`);
    console.log(`✂️  Prompt limit: ${Z_IMAGE_MAX_CHARS} chars (Z-Image API hard limit)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const tasks = scenesToProcess.map(scene => () =>
      processScene(base44, scene, project, KIE_API_KEY, aspectRatio)
    );

    const results = await processWithConcurrency(tasks, MAX_CONCURRENT);

    const submitted = results.filter(r => r.status === 'submitted');
    const failed = results.filter(r => r.status === 'failed');
    const skipped = results.filter(r => r.status === 'skipped');

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 SUBMIT COMPLETE`);
    console.log(`📤 ${submitted.length} submitted | ❌ ${failed.length} failed | ⏭️ ${skipped.length} skipped`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      done: false,
      total_processed: scenesToProcess.length,
      submitted: submitted.length,
      failed: failed.length,
      skipped: skipped.length,
      results: results.map(r => ({
        scene_number: r.scene_number,
        status: r.status,
        task_id: r.task_id,
        provider: r.provider || 'z_image',
        error: r.error
      }))
    });

  } catch (error) {
    console.error("❌ generateSceneImage error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});