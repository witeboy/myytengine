import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// IMAGE GENERATION — SUBMIT-ONLY (v2)
// Pipeline: Script → Breakdown → Prompts → [THIS] → pollSceneImage → Animation
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";
const AI33_BASE = "https://api.ai33.pro";

const MAX_CONCURRENT = 4;
const MAX_RETRIES = 2;
const AI33_MAX_PROMPT_CHARS = 4000;
const RETRY_BASE_MS = 2000;

// ─────────────────────────────────────────────
// ASPECT RATIO HELPERS
// ─────────────────────────────────────────────

// Z-Image and Grok accept "16:9" / "9:16" directly (colon format)
// Nano Banana's image_size uses underscore format e.g. "landscape_16_9"
function toNanoImageSize(aspectRatio) {
  // aspectRatio is "16:9" or "9:16"
  if (aspectRatio === "9:16") return "portrait_9_16";
  return "landscape_16_9"; // default landscape
}

// ─────────────────────────────────────────────
// KIE API — SUBMIT ONLY (no polling)
// ─────────────────────────────────────────────

async function kieCreateTask(apiKey, model, input) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const payload = { model, input };
      console.log(`📡 Kie createTask: model=${model}, prompt=${(input.prompt || '').substring(0, 80)}...`);
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
// AI33 SEEDREAM — SUBMIT ONLY
// ─────────────────────────────────────────────

async function submitAI33Seedream(apiKey, prompt, aspectRatio) {
  const ai33Aspect = aspectRatio === "9:16" ? "9:16" : "16:9";
  console.log(`🌱 AI33 Seedream: submitting (${prompt.length} chars, ratio=${ai33Aspect})...`);

  const formData = new FormData();
  formData.append('prompt', prompt.substring(0, AI33_MAX_PROMPT_CHARS));
  formData.append('model_id', 'bytedance-seedream-4.5');
  formData.append('generations_count', '1');
  formData.append('model_parameters', JSON.stringify({
    aspect_ratio: ai33Aspect,
    resolution: "2K"
  }));

  const submitRes = await fetch(`${AI33_BASE}/v1i/task/generate-image`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData
  });

  const submitData = await submitRes.json();

  if (!submitData.success || !submitData.task_id) {
    throw new Error(`AI33 submit failed: ${submitData.message || JSON.stringify(submitData)}`);
  }

  console.log(`📡 AI33 task submitted: ${submitData.task_id}`);
  return submitData.task_id;
}

// ─────────────────────────────────────────────
// PROMPT PREPARATION
// ─────────────────────────────────────────────

function preparePromptForProvider(rawPrompt, provider = 'grok', isSleep = false) {
  let p = rawPrompt;

  p = p
    .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
    .replace(/\b\d{1,2}\s*:\s*\d{1,2}\s*(frame|format|ratio|widescreen|vertical|horizontal)?\s*,?\s*/gi, '');

  p = p
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
    .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');

  p = p.replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, 'shallow depth of field');

  p = p
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*/g, '')
    .replace(/#{1,3}\s*/g, '');

  p = p.replace(/^Skeleton\s+protagonist\s*→\s*/i, '').replace(/\bSkeleton\s+protagonist\s*→\s*/gi, '');

  p = p
    .replace(/\b(phone|iphone|smartphone|tablet|ipad|mobile)\s+(screen|display)\s+(showing|displaying|with|reading|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'phone screen glowing with soft light,')
    .replace(/\b(laptop|computer|monitor|desktop|macbook)\s+(screen|display)\s+(showing|displaying|with|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'laptop screen casting cool light,')
    .replace(/\b(screen|display)\s+(showing|displaying|that\s+reads|reading|with\s+the\s+text|with\s+text)\s+[^,.]{5,80}[.,]/gi, 'screen glowing softly,')
    .replace(/\bthat\s+(reads|says)\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/\bwith\s+the\s+words?\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/\$[\d,]+\.?\d*\s*(in\s+)?(outstanding|owed|due|remaining|total|balance|charges?|debt|worth|dollars?)?\s*/gi, '')
    .replace(/\b\d+\.?\d*\s*(%|percent)\b/gi, '');

  p = p
    .replace(/,?\s*ABSOLUTELY\s+NO\s+text[^.]*\.\s*/gi, '')
    .replace(/,?\s*NO\s+text,?\s*words,?\s*letters[^.]*\.\s*/gi, '')
    .replace(/,?\s*FORBIDDEN:?\s*text[^.]*\.\s*/gi, '');

  p = p.replace(/\bNAME(?:'s)?\b/g, '');
  p = p.replace(/\b([A-Z]{2,15})\b/g, (match) => {
    const commonCaps = ['ARRI', 'DSLR', 'HDR', 'LUT', 'POV', 'OTS', 'RGB', 'LED', 'CGI', 'DOF', 'ECU', 'MCU', 'CU', 'MS', 'WS', 'EWS', 'MWS', 'DM', 'UI', 'NO', 'ON', 'IN', 'AT', 'TO', 'BY', 'OF', 'OR', 'IF', 'AS', 'IS', 'IT', 'AN', 'DO', 'SO', 'UP', 'THE', 'AND', 'FOR', 'NOT', 'BUT', 'ALL', 'HAS', 'HIS', 'HER', 'RAW', 'RED', 'BMW', 'USA'];
    if (commonCaps.includes(match)) return match;
    return '';
  });

  p = p
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.]+/, '')
    .replace(/\(\s*\)/g, '')
    .trim();

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

  const maxChars = provider === 'ai33_seedream' ? AI33_MAX_PROMPT_CHARS : 1500;

  if (p.length > maxChars) {
    const cutZone = p.substring(maxChars - 150, maxChars);
    const lastPeriod = cutZone.lastIndexOf('.');
    const cutPoint = lastPeriod >= 0 ? (maxChars - 150) + lastPeriod + 1 : maxChars;
    p = p.substring(0, cutPoint).trim();
    console.log(`✂️ Truncated to ${p.length} chars for ${provider}`);
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
// SINGLE SCENE PROCESSOR — SUBMIT ONLY
// ─────────────────────────────────────────────

async function processScene(base44, scene, project, kieApiKey, ai33ApiKey, aspectRatio, referenceImageUrl, providerPref = 'auto') {
  const sceneNum = scene.scene_number;
  const isSleepProject = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story' || project.visual_style === 'sleep_ambient';

  if (!scene.image_prompt) {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'no_prompt' };
  }

  if (scene.status === 'image_generated' && scene.image_url && !scene.image_url.startsWith('ai33_task:') && !scene.image_url.startsWith('grok_img_task:') && !scene.image_url.startsWith('nano_task:') && !scene.image_url.startsWith('zimage_task:')) {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'already_generated' };
  }
  if (scene.status === 'image_pending') {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'already_pending' };
  }

  const sceneHasCharacter = detectCharacterPresence(scene);

  let finalPrompt = scene.image_prompt;

  if (isSleepProject) {
    finalPrompt = finalPrompt
      .replace(/\b(a\s+)?(photorealistic\s+)?(female|male|woman|man|person|figure|girl|boy|lady|gentleman),?\s+[A-Z][a-z]+,?\s+(with\s+)?[^.]{20,300}(pajamas|clothing|dressed|wearing|shirt|pants|outfit|build|slender|muscular)[^.]*\.\s*/gi, '')
      .replace(/\b[A-Z][a-z]{2,15}\s*(→|is|sits?|stands?|lies?|rests?|gazes?|walks?|holds?|closes?|faces?)\s+/gi, '')
      .replace(/\b(Sarah|The Listener|the listener|the figure|the character|the protagonist)\b/gi, '')
      .replace(/\bbright\s+(daylight|sunlight|sunshine|light|white|blue)\b/gi, 'very dim warm glow')
      .replace(/\bhigh[- ]key\s+lighting\b/gi, 'ultra low-key lighting')
      .replace(/\bvibrant\s+(saturated\s+)?colors?\b/gi, 'muted dark tones')
      .replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();

    if (!/dark moody oil painting/i.test(finalPrompt)) {
      finalPrompt += ' Dark moody oil painting, deep shadows, very dim warm amber candlelight, ultra low-key lighting.';
    }

    finalPrompt = preparePromptForProvider(finalPrompt, 'ai33_seedream', true);
    console.log(`🌙 Scene ${sceneNum}: sleep prompt (${finalPrompt.length}ch): ${finalPrompt.substring(0, 200)}`);
  } else {
    finalPrompt = scene.image_prompt;
  }

  console.log(`📐 Scene ${sceneNum}: raw prompt ${finalPrompt.length} chars: "${finalPrompt.substring(0, 150)}..."`);

  // ── Provider order ────────────────────────────────────────
  const wasFailedBefore = scene.status === 'image_failed';
  let providers;

  if (providerPref === 'auto') {
    providers = isSleepProject
      ? [ai33ApiKey ? 'ai33_seedream' : null, 'nano_banana', 'z_image', 'grok'].filter(Boolean)
      : [ai33ApiKey ? 'ai33_seedream' : null, 'grok', 'nano_banana', 'z_image'].filter(Boolean);
  } else {
    const allProviders = ['ai33_seedream', 'grok', 'nano_banana', 'z_image'];
    providers = [providerPref, ...allProviders.filter(p => p !== providerPref)];
    providers = providers.filter(p => {
      if (p === 'ai33_seedream' && !ai33ApiKey) return false;
      if (['grok', 'nano_banana', 'z_image'].includes(p) && !kieApiKey) return false;
      return true;
    });
  }

  console.log(`🎯 Scene ${sceneNum}: provider order [${providers.join(' → ')}]`);

  const useReference = !isSleepProject
    && referenceImageUrl
    && sceneHasCharacter
    && referenceImageUrl.startsWith('http');

  if (useReference) {
    console.log(`🔗 Scene ${sceneNum}: using character reference (image-to-image)`);
  }

  // ── TRY EACH PROVIDER ──────────────────────
  for (const provider of providers) {
    try {
      let taskId;
      let taskPrefix;
      const providerPrompt = preparePromptForProvider(finalPrompt, provider, isSleepProject);

      if (provider === 'ai33_seedream') {
        taskId = await submitAI33Seedream(ai33ApiKey, providerPrompt, aspectRatio);
        taskPrefix = 'ai33_task';

      } else if (provider === 'grok') {
        if (useReference) {
          taskId = await kieCreateTask(kieApiKey, "grok-imagine/image-to-image", {
            prompt: providerPrompt,
            image_urls: [referenceImageUrl]
          });
        } else {
          taskId = await kieCreateTask(kieApiKey, "grok-imagine/text-to-image", {
            prompt: providerPrompt,
            aspect_ratio: aspectRatio   // ✅ "16:9" or "9:16"
          });
        }
        taskPrefix = 'grok_img_task';

      } else if (provider === 'nano_banana') {
        // ✅ FIX: nano_banana uses image_size with underscore format, NOT aspect_ratio with colon
        const nanoImageSize = toNanoImageSize(aspectRatio);
        taskId = await kieCreateTask(kieApiKey, "google/nano-banana", {
          prompt: providerPrompt,
          output_format: "png",
          image_size: nanoImageSize    // ✅ "landscape_16_9" or "portrait_9_16"
        });
        taskPrefix = 'nano_task';

      } else if (provider === 'z_image') {
        // ✅ Z-Image: requires both prompt AND aspect_ratio (both required per spec)
        taskId = await kieCreateTask(kieApiKey, "z-image", {
          prompt: providerPrompt,
          aspect_ratio: aspectRatio    // ✅ "16:9" or "9:16" — matches z-image spec enum
        });
        taskPrefix = 'zimage_task';
      }

      await base44.asServiceRole.entities.Scenes.update(scene.id, {
        image_url: `${taskPrefix}:${taskId}`,
        status: "image_pending"
      });

      console.log(`✓ Scene ${sceneNum}: ${provider} task submitted (${taskId})`);

      return {
        scene_id: scene.id,
        scene_number: sceneNum,
        status: 'submitted',
        task_id: taskId,
        provider
      };

    } catch (err) {
      console.warn(`⚠️ Scene ${sceneNum} ${provider} submit failed: ${err.message}`);
      // Try next provider
    }
  }

  try {
    await base44.asServiceRole.entities.Scenes.update(scene.id, { status: "image_failed" });
  } catch (_) {}

  return {
    scene_id: scene.id,
    scene_number: sceneNum,
    status: 'failed',
    error: 'All providers failed to submit'
  };
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
    const { scene_id, scene_ids, project_id, preferred_provider } = body;

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    const AI33_API_KEY = Deno.env.get("AI33_API_KEY");
    if (!KIE_API_KEY && !AI33_API_KEY) {
      return Response.json({ error: "No image API keys configured" }, { status: 500 });
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

    let providerPref = preferred_provider || project?.image_provider || 'auto';
    // ✅ FIX: added z_image to valid provider list
    if (!['auto', 'ai33_seedream', 'grok', 'nano_banana', 'z_image'].includes(providerPref)) providerPref = 'auto';

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 IMAGE SUBMIT — ${scenesToProcess.length} scenes`);
    console.log(`📐 Aspect: ${aspectRatio} | ⚡ Concurrency: ${MAX_CONCURRENT} | 🎯 Provider: ${providerPref}`);
    console.log(`🏗️ Available: ${AI33_API_KEY ? 'AI33' : '—'} | ${KIE_API_KEY ? 'Grok + Nano + Z-Image' : '—'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const referenceImageUrl = project.reference_image_url || null;
    if (referenceImageUrl) {
      console.log(`🔗 Reference image available: ${referenceImageUrl.substring(0, 60)}...`);
    }

    const tasks = scenesToProcess.map(scene => () =>
      processScene(base44, scene, project, KIE_API_KEY, AI33_API_KEY, aspectRatio, referenceImageUrl, providerPref)
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
        provider: r.provider,
        error: r.error
      }))
    });

  } catch (error) {
    console.error("❌ generateSceneImage error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});