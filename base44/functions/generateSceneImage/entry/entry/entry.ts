import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// IMAGE GENERATION — SUBMIT-ONLY (v2)
// Pipeline: Script → Breakdown → Prompts → [THIS] → pollSceneImage → Animation
// ══════════════════════════════════════════════════════════════════
// This function SUBMITS image tasks and returns immediately.
// Polling is handled by the separate pollSceneImage function.
// Frontend flow: submitAll → poll every 5s → done
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";
const AI33_BASE = "https://api.ai33.pro";

// ── Tuning knobs ──────────────────────────────────────────────
const MAX_CONCURRENT = 4;           // Parallel SUBMIT jobs (submits are fast ~1-2s each)
const MAX_RETRIES = 2;              // Retries per provider submit
const AI33_MAX_PROMPT_CHARS = 4000; // Seedream supports longer prompts
const RETRY_BASE_MS = 2000;         // Base delay for exponential backoff 

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
// PROMPT PREPARATION — lightweight provider-specific cleanup
// ─────────────────────────────────────────────
// DESIGN PRINCIPLE: The prompt from generateScenePrompts + OpenAI Cleaner
// is the AUTHORITATIVE source. This function does MINIMAL adjustments:
// 1. Strip things image models render as visible text (numbers, markdown, resolution)
// 2. Strip screen/document content descriptions (models render them as text)
// 3. Deduplicate repeated sentences
// 4. Apply provider-specific length cap
// DOES NOT: re-inject framing, override camera angles, add style suffixes
// ─────────────────────────────────────────────

function preparePromptForProvider(rawPrompt, provider = 'grok', isSleep = false) {
  let p = rawPrompt;

  // ── 1. Strip metadata image models render as visible text ──
  // Orientation directives (aspect ratio handled by API param)
  p = p
    .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
    .replace(/\b\d{1,2}\s*:\s*\d{1,2}\s*(frame|format|ratio|widescreen|vertical|horizontal)?\s*,?\s*/gi, '');

  // Resolution numbers (Grok renders "8K" as text)
  p = p
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
    .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');

  // F-stop numbers (rendered as text)
  p = p.replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, 'shallow depth of field');

  // Markdown artifacts
  p = p
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*/g, '')
    .replace(/#{1,3}\s*/g, '');

  // Skeleton protagonist label prefix
  p = p.replace(/^Skeleton\s+protagonist\s*→\s*/i, '').replace(/\bSkeleton\s+protagonist\s*→\s*/gi, '');

  // ── 2. Strip screen/document readable content ──
  // Image models attempt to render any described text/numbers/UI content
  p = p
    .replace(/\b(phone|iphone|smartphone|tablet|ipad|mobile)\s+(screen|display)\s+(showing|displaying|with|reading|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'phone screen glowing with soft light,')
    .replace(/\b(laptop|computer|monitor|desktop|macbook)\s+(screen|display)\s+(showing|displaying|with|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'laptop screen casting cool light,')
    .replace(/\b(screen|display)\s+(showing|displaying|that\s+reads|reading|with\s+the\s+text|with\s+text)\s+[^,.]{5,80}[.,]/gi, 'screen glowing softly,')
    .replace(/\b(receipt|bill|invoice|statement|contract|form|report|check|cheque|notice|certificate|diploma|ticket|prescription|memo|letter|document|page|note|card|paper|flyer|brochure|foreclosure\s+notice|eviction\s+notice|medical\s+bill|bank\s+statement|tax\s+return)\s+(showing|displaying|that\s+reads|that\s+says|reading|with\s+the\s+text|with\s+text|with\s+the\s+words|stamped\s+with|marked\s+with|printed\s+with)\s+[^,.]{3,100}[.,]/gi, '$1 clutched tightly,')
    .replace(/\bthat\s+(reads|says)\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/\bwith\s+the\s+words?\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/\$[\d,]+\.?\d*\s*(in\s+)?(outstanding|owed|due|remaining|total|balance|charges?|debt|worth|dollars?)?\s*/gi, '')
    .replace(/\b\d+\.?\d*\s*(%|percent)\b/gi, '');

  // Anti-text instructions (models render these as text too)
  p = p
    .replace(/,?\s*ABSOLUTELY\s+NO\s+text[^.]*\.\s*/gi, '')
    .replace(/,?\s*NO\s+text,?\s*words,?\s*letters[^.]*\.\s*/gi, '')
    .replace(/,?\s*FORBIDDEN:?\s*text[^.]*\.\s*/gi, '');

  // ── 2b. Strip remaining character NAME placeholders rendered as text ──
  // If character DNA used "NAME" or actual character names survived prompt generation,
  // the image model will render them as on-screen text overlays
  p = p.replace(/\bNAME(?:'s)?\b/g, '');
  // Strip any ALL-CAPS single words that look like name placeholders (2-15 chars, not common words)
  p = p.replace(/\b([A-Z]{2,15})\b/g, (match) => {
    const commonCaps = ['ARRI', 'DSLR', 'HDR', 'LUT', 'POV', 'OTS', 'RGB', 'LED', 'CGI', 'DOF', 'ECU', 'MCU', 'CU', 'MS', 'WS', 'EWS', 'MWS', 'DM', 'UI', 'NO', 'ON', 'IN', 'AT', 'TO', 'BY', 'OF', 'OR', 'IF', 'AS', 'IS', 'IT', 'AN', 'DO', 'SO', 'UP', 'THE', 'AND', 'FOR', 'NOT', 'BUT', 'ALL', 'HAS', 'HIS', 'HER', 'RAW', 'RED', 'BMW', 'USA'];
    if (commonCaps.includes(match)) return match;
    return '';
  });

  // ── 3. Clean punctuation artifacts ──
  p = p
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.]+/, '')
    .replace(/\(\s*\)/g, '')
    .trim();

  // ── 4. Deduplicate repeated sentences ──
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

  // ── 5. Provider-specific length cap ──
  // Grok: 1500 chars (was 1200 — too aggressive, was cutting style suffixes)
  // Seedream: 4000 chars
  // Nano: 1500 chars
  const maxChars = provider === 'ai33_seedream' ? AI33_MAX_PROMPT_CHARS : 1500;

  if (p.length > maxChars) {
    // Smart truncation: find last sentence boundary before the cap
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
// Determines if a scene contains a human character.
// Used for: (1) smart reference locking, (2) deciding text-to-image vs image-to-image
// Sources: director notes characters_present, prompt content analysis

function detectCharacterPresence(scene) {
  // Priority 1: Director notes (most reliable — set by scene breakdown)
  if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
    try {
      const notes = JSON.parse(scene.image_prompt.substring('DIRECTOR_NOTES:'.length));
      if (notes.characters_present && Array.isArray(notes.characters_present) && notes.characters_present.length > 0) {
        return true;
      }
    } catch (_) {}
  }

  // Priority 2: Prompt content analysis
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

  // Skip if already generated or already pending
  if (scene.status === 'image_generated' && scene.image_url && !scene.image_url.startsWith('ai33_task:') && !scene.image_url.startsWith('grok_img_task:') && !scene.image_url.startsWith('nano_task:')) {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'already_generated' };
  }
  if (scene.status === 'image_pending') {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'already_pending' };
  }

  // ── Determine if this scene has characters (for reference locking) ──
  const sceneHasCharacter = detectCharacterPresence(scene);

  // ── Build cleaned prompt ──────────────────────────────────
  let finalPrompt = scene.image_prompt;

  if (isSleepProject) {
    // Sleep projects: strip ALL human/character references, enforce dark palette
    finalPrompt = finalPrompt
      .replace(/\b(a\s+)?(photorealistic\s+)?(female|male|woman|man|person|figure|girl|boy|lady|gentleman),?\s+[A-Z][a-z]+,?\s+(with\s+)?[^.]{20,300}(pajamas|clothing|dressed|wearing|shirt|pants|outfit|build|slender|muscular)[^.]*\.\s*/gi, '')
      .replace(/\b[A-Z][a-z]{2,15}\s*(→|is|sits?|stands?|lies?|rests?|gazes?|walks?|holds?|closes?|faces?)\s+/gi, '')
      .replace(/\b(Sarah|The Listener|the listener|the figure|the character|the protagonist)\b/gi, '')
      .replace(/\b(light\s+ivory\s+skin|oval\s+face|hazel\s+eyes?|almond[- ]shaped|chestnut[- ]brown\s+hair|wavy\s+hair|upturned\s+nose|full\s+lips|slender\s+build)\b[^,.]{0,60}[.,]\s*/gi, '')
      .replace(/\b(wearing|dressed\s+in|clothed\s+in)\s+[^.]{5,80}(pajamas|cotton|silk|comfortable)[^.]*\.\s*/gi, '')
      .replace(/\b(her|his)\s+(hands?|face|eyes?|arms?|legs?|chest|shoulders?|skin|lips?|hair)\b/gi, 'the scene')
      .replace(/\b(from\s+the\s+waist\s+up|head\s+to\s+feet|complete\s+body|full\s+body)\b/gi, '')
      .replace(/\b(photorealistic|DSLR|Canon|Sony|Nikon|ARRI|Panavision|Hollywood|Kodak)\b[^.]{0,80}\./gi, '')
      .replace(/(dark moody oil painting[^.]*\.)\s*(dark moody oil painting)/gi, '$1')
      .replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();

    // Enforce dark lighting for sleep
    finalPrompt = finalPrompt
      .replace(/\bbright\s+(daylight|sunlight|sunshine|light|white|blue)\b/gi, 'very dim warm glow')
      .replace(/\bhigh[- ]key\s+lighting\b/gi, 'ultra low-key lighting')
      .replace(/\bvibrant\s+(saturated\s+)?colors?\b/gi, 'muted dark tones')
      .replace(/\bneon\b/gi, 'very dim candlelight')
      .replace(/(?<!(very |faint |dim ))\b(candlelight)\b(?!\s+atmosphere)/gi, 'very dim candlelight')
      .replace(/(?<!(very |faint |dim ))\b(moonlight)\b(?!\s+atmosphere)/gi, 'very dim moonlight')
      .replace(/\bbedroom\b/gi, 'room').replace(/\bbed\b(?!\s*rock|\s*of)/gi, 'couch')
      .replace(/\bpillow\b/gi, 'cushion').replace(/\bblanket\b/gi, 'cloth')
      .replace(/\bsleeping\b/gi, 'resting');

    // Ensure dark suffix
    if (!/dark moody oil painting/i.test(finalPrompt)) {
      finalPrompt += ' Dark moody oil painting, deep shadows, very dim warm amber candlelight, ultra low-key lighting.';
    }

    finalPrompt = preparePromptForProvider(finalPrompt, 'ai33_seedream', true);
    console.log(`🌙 Scene ${sceneNum}: sleep prompt (${finalPrompt.length}ch): ${finalPrompt.substring(0, 200)}`);
  } else {
    // Standard projects: prompt is already production-ready from generateScenePrompts + OpenAI Cleaner.
    // Provider-specific prep (length cap, text stripping) happens per-provider below.
    finalPrompt = scene.image_prompt;
  }

  console.log(`📐 Scene ${sceneNum}: raw prompt ${finalPrompt.length} chars: "${finalPrompt.substring(0, 150)}..."`);

  // ── Provider order (respects user preference) ────────────
  const wasFailedBefore = scene.status === 'image_failed';
  let providers;

  if (providerPref === 'auto') {
    // Default cascade: AI33 → Grok → Nano (always include AI33 — transient failures shouldn't permanently skip it)
    providers = isSleepProject
      ? [ai33ApiKey ? 'ai33_seedream' : null, 'nano_banana', 'grok'].filter(Boolean)
      : [ai33ApiKey ? 'ai33_seedream' : null, 'grok', 'nano_banana'].filter(Boolean);
  } else {
    // User explicitly picked a provider — use it FIRST, then fallback to others
    const allProviders = ['ai33_seedream', 'grok', 'nano_banana'];
    providers = [providerPref, ...allProviders.filter(p => p !== providerPref)];
    // Filter out unavailable providers
    providers = providers.filter(p => {
      if (p === 'ai33_seedream' && !ai33ApiKey) return false;
      if ((p === 'grok' || p === 'nano_banana') && !kieApiKey) return false;
      return true;
    });
  }

  if (wasFailedBefore && providerPref === 'auto') {
    console.log(`🔄 Scene ${sceneNum}: previously failed — skipping AI33, trying ${providers.join(' → ')}`);
  } else {
    console.log(`🎯 Scene ${sceneNum}: provider order [${providers.join(' → ')}]`);
  }

  // ── Determine if we can use image-to-image with reference ──
  // Conditions: reference exists, scene has a character, not the reference scene itself
  const useReference = !isSleepProject
    && referenceImageUrl
    && sceneHasCharacter
    && referenceImageUrl.startsWith('http');

  if (useReference) {
    console.log(`🔗 Scene ${sceneNum}: using character reference (image-to-image)`);
  }

  // ── TRY EACH PROVIDER (submit only) ──────────────────────
  for (const provider of providers) {
    try {
      let taskId;
      let taskPrefix;
      // Each provider gets its own length-optimized prompt
      const providerPrompt = preparePromptForProvider(finalPrompt, provider, isSleepProject);

      if (provider === 'ai33_seedream') {
        taskId = await submitAI33Seedream(ai33ApiKey, providerPrompt, aspectRatio);
        taskPrefix = 'ai33_task';
      } else if (provider === 'grok') {
        if (useReference) {
          // Use image-to-image model with reference for character consistency
          taskId = await kieCreateTask(kieApiKey, "grok-imagine/image-to-image", {
            prompt: providerPrompt,
            image_urls: [referenceImageUrl]
          });
        } else {
          taskId = await kieCreateTask(kieApiKey, "grok-imagine/text-to-image", {
            prompt: providerPrompt,
            aspect_ratio: aspectRatio
          });
        }
        taskPrefix = 'grok_img_task';
      } else if (provider === 'nano_banana') {
        taskId = await kieCreateTask(kieApiKey, "google/nano-banana", {
          prompt: providerPrompt,
          output_format: "png",
          image_size: aspectRatio
        });
        taskPrefix = 'nano_task';
      }

      // Save task reference — pollSceneImage will resolve this
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

  // All providers failed to submit
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

    // ── Resolve scenes ────────────────────────────────────────
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

    // ── Resolve preferred provider from payload or project setting ──
    let providerPref = preferred_provider || project?.image_provider || 'auto';
    // Validate
    if (!['auto', 'ai33_seedream', 'grok', 'nano_banana'].includes(providerPref)) providerPref = 'auto';

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 IMAGE SUBMIT — ${scenesToProcess.length} scenes`);
    console.log(`📐 Aspect: ${aspectRatio} | ⚡ Concurrency: ${MAX_CONCURRENT} | 🎯 Provider: ${providerPref}`);
    console.log(`🏗️ Available: ${AI33_API_KEY ? 'AI33' : '—'} | ${KIE_API_KEY ? 'Grok + Nano' : '—'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ── Reference image for character consistency ──────────────
    const referenceImageUrl = project.reference_image_url || null;
    if (referenceImageUrl) {
      console.log(`🔗 Reference image available: ${referenceImageUrl.substring(0, 60)}...`);
    }

    // ── Submit all with concurrency pool ───────────────────────
    const tasks = scenesToProcess.map(scene => () =>
      processScene(base44, scene, project, KIE_API_KEY, AI33_API_KEY, aspectRatio, referenceImageUrl, providerPref)
    );

    const results = await processWithConcurrency(tasks, MAX_CONCURRENT);

    // ── Tally ─────────────────────────────────────────────────
    const submitted = results.filter(r => r.status === 'submitted');
    const failed = results.filter(r => r.status === 'failed');
    const skipped = results.filter(r => r.status === 'skipped');

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 SUBMIT COMPLETE`);
    console.log(`📤 ${submitted.length} submitted | ❌ ${failed.length} failed | ⏭️ ${skipped.length} skipped`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      done: false, // Frontend must now poll with pollSceneImage
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