import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// IMAGE GENERATION — SUBMIT-ONLY (no polling)
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
const MAX_PROMPT_CHARS = 1200;      // Grok's sweet spot ceiling
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
// PROMPT CLEANING — strip metadata Grok renders as visible text
// ─────────────────────────────────────────────

function cleanPromptForGrok(rawPrompt, isSleep = false) {
  let p = rawPrompt;

  // 1. Strip orientation/format directives
  p = p
    .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
    .replace(/\b(widescreen|wide\s*screen)\b/gi, '')
    .replace(/\b\d{1,2}\s*:\s*\d{1,2}\s*(frame|format|ratio|widescreen|vertical|horizontal)?\s*,?\s*/gi, '')
    .replace(/\b(wide|tall)\s+(cinematic|vertical|horizontal)\s+(framing|composition)\b/gi, '')
    .replace(/\bvertical\s+\d+:\d+\b/gi, '')
    .replace(/\bhorizontal\s+\d+:\d+\b/gi, '');

  // 2. Strip anti-text instructions
  p = p
    .replace(/,?\s*ABSOLUTELY\s+NO\s+text[\s\S]{0,120}?(in the image|of any kind)[.\s]*/gi, '')
    .replace(/,?\s*NO\s+text,?\s*words,?\s*letters[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '')
    .replace(/,?\s*FORBIDDEN:?\s*text[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '');

  // 2.5 Strip readable content descriptions
  p = p
    .replace(/\b(open\s+)?(iphone|phone|android|smartphone|tablet|ipad)\s+(settings|home\s*screen|lock\s*screen|notifications?|messages?|app\s*store|control\s*center|safari|browser)/gi, 'phone held in hand')
    .replace(/\b(settings|notifications?|messages?|home)\s+(menu|screen|page|interface|panel|app)\s+(on\s+)?(a\s+)?(digital\s+)?(display|screen|phone|device)/gi, 'phone glowing softly')
    .replace(/\b(tap|tapping|scroll|scrolling|swipe|swiping|click|clicking|press|pressing|toggle|toggling)\s+(a\s+)?(setting|option|button|toggle|switch|menu\s+item|notification|link|icon)\s+(on|in)\s+(the\s+)?(phone|screen|device|display|iphone|tablet)/gi, 'interacting with the phone')
    .replace(/\b(phone|iphone|smartphone|tablet|ipad|mobile)\s+(screen|display)\s+(showing|displaying|with|reading|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'phone screen glowing with soft blue-white light,')
    .replace(/\b(laptop|computer|monitor|desktop|macbook)\s+(screen|display)\s+(showing|displaying|with|open\s+to)\s+[^,.]{5,80}[.,]/gi, 'laptop screen casting cool light,')
    .replace(/\b(screen|display)\s+(showing|displaying|that\s+reads|reading|with\s+the\s+text|with\s+text)\s+[^,.]{5,80}[.,]/gi, 'screen glowing softly,')
    .replace(/\ba\s+list\s+of\s+(options|items|settings|menu\s+items)\s*,?\s*including\s+[^.]{5,100}\./gi, 'a glowing interface.')
    .replace(/\b(Settings\s+app|Messages\s+app|Gmail|Instagram|Twitter|TikTok|YouTube|Facebook|Safari|Chrome)\b/gi, 'app interface')
    .replace(/\bon\s+a\s+digital\s+(display|screen)\b/gi, '')
    .replace(/\b(receipt|bill|invoice|statement|contract|form|report|check|cheque|notice|certificate|diploma|ticket|prescription|memo|letter|document|page|note|card|paper|flyer|brochure|foreclosure\s+notice|eviction\s+notice|medical\s+bill|bank\s+statement|tax\s+return)\s+(showing|displaying|that\s+reads|that\s+says|reading|with\s+the\s+text|with\s+text|with\s+the\s+words|stamped\s+with|marked\s+with|printed\s+with)\s+[^,.]{3,100}[.,]/gi, '$1 clutched tightly,')
    .replace(/\b(book|document|letter|newspaper|folder|file|binder)\s+(open\s+to|showing|reading|displaying|that\s+reads|with\s+the\s+text)\s+[^,.]{5,80}[.,]/gi, '$1 visible in the scene,')
    .replace(/\b(fine\s+print|small\s+text|printed\s+text|handwritten\s+text|typed\s+text|the\s+words|the\s+text|legible\s+text|readable\s+text)\b/gi, 'visible markings')
    .replace(/\b(signature\s+line|dotted\s+line\s+for|sign\s+here|printed\s+name|date\s+line)\b/gi, 'document details')
    .replace(/\$[\d,]+\.?\d*\s*(in\s+)?(outstanding|owed|due|remaining|total|balance|charges?|debt|worth|dollars?)?\s*/gi, '')
    .replace(/\b(total|balance|sum|amount|cost|price|fee|charge|payment|debt)\s+of\s+\$[\d,]+\.?\d*/gi, 'significant amount')
    .replace(/\b(from|between)\s+\$[\d,]+\.?\d*\s*(to|and)\s+\$[\d,]+\.?\d*/gi, 'changing dramatically')
    .replace(/\b\d+\.?\d*\s*(%|percent)\b/gi, '')
    .replace(/\bthat\s+(reads|says)\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/\bwith\s+the\s+words?\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    .replace(/,?\s*(including|such\s+as|like)\s+['''""]?[A-Z][^.]{3,80}\./gi, '.')
    .replace(/['''""][A-Z][a-z]+[,'''""][\s'''""]*/g, '');

  // 3. Strip resolution/quality metadata
  p = p
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
    .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');

  // 4. Strip numbers/measurements
  p = p
    .replace(/\b\d+\s*mm\b/gi, '')
    .replace(/\b\d+\s*m\b/gi, '')
    .replace(/\b\d+\s*meters?\b/gi, '')
    .replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, '')
    .replace(/\b\d+\s*degrees?\b/gi, '')
    .replace(/\b\d+\s*°\b/g, '')
    .replace(/\b\d+k\b/gi, '')
    .replace(/\b\d+p\b/gi, '')
    .replace(/\b\d+\s*mers?\b/gi, '')
    .replace(/\b\d+\s*x\s*\d+\b/gi, '');

  // 5. Strip markdown artifacts
  p = p
    .replace(/\*\*[^*]+\*\*/g, (match) => match.replace(/\*\*/g, ''))
    .replace(/\*/g, '')
    .replace(/#{1,3}\s*/g, '');

  p = p
    .replace(/^Skeleton\s+protagonist\s*→\s*/i, '')
    .replace(/\bSkeleton\s+protagonist\s*→\s*/gi, '');

  // 6. Clean up artifacts
  p = p
    .replace(/\.['''""][\s]*/g, '. ')
    .replace(/\ban\s+(phone|document|receipt|bill|laptop|screen)\b/gi, 'a $1')
    .replace(/\bto\s+(interacting|holding|reaching|tapping)\b/gi, '$1')
    .replace(/\ba\s+menu\b/gi, '')
    .replace(/\bshowing\s+an?\s+(phone\s+)?held\s+in\s+hand\s+(menu|screen|page)?\s*/gi, 'in ')
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.]+/, '')
    .trim();

  // 6.25 DEDUP
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

  // 6.5 OBJECT CLOSE-UP REFRAME
  const objectFocusPattern = /^(close[\s-]*up|tight|macro|detail|insert)\s+(shot\s+)?(of|on|showing)\s+(an?\s+)?(iphone|phone|smartphone|tablet|laptop|computer|screen|document|book|letter|newspaper|sign|menu|interface|settings|dashboard|receipt|bill|invoice|statement|contract|form|report|check|cheque|notice|certificate|diploma|ticket|prescription|note|memo|flyer|brochure|pamphlet|paper|page|card|postcard|telegram|bank\s+statement|medical\s+bill|foreclosure|eviction|tax\s+return)/i;

  if (objectFocusPattern.test(p)) {
    const objectMatch = p.match(objectFocusPattern);
    const objectName = objectMatch[5] || 'document';
    let firstSentenceEnd = -1;
    for (let i = objectMatch[0].length; i < p.length - 1; i++) {
      if (p[i] === '.' && i + 2 < p.length && p[i + 1] === ' ' && /[A-Z]/.test(p[i + 2])) {
        firstSentenceEnd = i; break;
      }
    }
    if (firstSentenceEnd === -1) firstSentenceEnd = p.indexOf('.', objectMatch[0].length);
    if (firstSentenceEnd > 0) {
      p = `Medium shot showing the character holding a ${objectName}, ${p.substring(firstSentenceEnd + 2).trim()}`;
    } else {
      p = `Medium shot showing the character holding a ${objectName}.`;
    }
    console.log(`🔄 Reframed object close-up → medium shot (object: ${objectName})`);
  }

  // 7. FRAMING ANCHOR
  const alreadyFramed = /^(full\s+(body|scene)|wide\s+shot|medium\s+(wide\s+)?shot|low\s+angle|high\s+angle|overhead|establishing|tracking|dutch\s+angle|pov\s+shot|landscape)/i.test(p);

  if (alreadyFramed || isSleep) {
    // No prepend needed
  } else {
    const isIntentionalCloseUp = /\b(ecu|extreme\s*close[\s-]*up|ecu\s*—|macro\s*shot)\b/i.test(p);
    const isIntentionalCU = /\b(cu\s*—|close[\s-]*up\s*—|mcu\s*—|medium\s*close[\s-]*up)\b/i.test(p) && !isIntentionalCloseUp;

    if (isIntentionalCloseUp) {
      p = `Extreme close-up shot showing face and upper shoulders with detailed background environment visible behind, shallow depth of field. ${p}`;
    } else if (isIntentionalCU) {
      p = `Close-up portrait from chest up, showing shoulders and upper body, detailed environment visible in background. ${p}`;
    } else {
      p = p
        .replace(/\bextreme\s*close[\s-]*up\b/gi, 'medium wide shot')
        .replace(/\bclose[\s-]*up\s*(shot|portrait|of|showing)?\b/gi, 'medium shot')
        .replace(/\bheadshot\b/gi, 'medium wide shot')
        .replace(/\bportrait\s*(shot|crop|of)?\b/gi, 'medium wide shot')
        .replace(/\bbust\s*shot\b/gi, 'medium wide shot')
        .replace(/\bface\s*only\b/gi, 'full scene')
        .replace(/\bfloating\s*head\b/gi, '');
      p = `Full scene wide shot showing the character's complete body head to feet in a detailed environment with visible architecture and props, multiple depth layers with foreground and background elements. ${p}`;
    }
  }

  p = p
    .replace(/\bshown full (?:body|figure)\s*(?:in the scene)?\b/gi, '')
    .replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.');

  // 8. Smart cap
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
// SINGLE SCENE PROCESSOR — SUBMIT ONLY
// ─────────────────────────────────────────────

async function processScene(base44, scene, project, kieApiKey, ai33ApiKey, aspectRatio) {
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

  // ── Build cleaned prompt ──────────────────────────────────
  let finalPrompt = scene.image_prompt;

  if (isSleepProject) {
    finalPrompt = finalPrompt
      .replace(/\b(photorealistic|DSLR|Canon|Sony|Nikon)\b[^.]{0,60}/gi, '')
      .replace(/\bnatural skin texture[^,.]*/gi, '')
      .replace(/\beditorial photography[^,.]*/gi, '')
      .replace(/\brazor[\s-]sharp detail[^,.]*/gi, '')
      .replace(/\b(a\s+)?(photorealistic\s+)?(female|male|woman|man|person|figure|girl|boy|lady|gentleman),?\s+[A-Z][a-z]+,?\s+(with\s+)?[^.]{20,300}(pajamas|clothing|dressed|wearing|shirt|pants|outfit|build|slender|muscular)[^.]*\.\s*/gi, '')
      .replace(/\b[A-Z][a-z]{2,15}\s*(→|is|sits?|stands?|lies?|rests?|gazes?|walks?|holds?|closes?|faces?)\s+/gi, '')
      .replace(/\b(Sarah|The Listener|the listener|the figure|the character|the protagonist)\b/gi, '')
      .replace(/\b(light\s+ivory\s+skin|oval\s+face|hazel\s+eyes?|almond[- ]shaped|chestnut[- ]brown\s+hair|wavy\s+hair|upturned\s+nose|full\s+lips|slender\s+build)\b[^,.]{0,60}[.,]\s*/gi, '')
      .replace(/\b(wearing|dressed\s+in|clothed\s+in)\s+[^.]{5,80}(pajamas|cotton|silk|comfortable)[^.]*\.\s*/gi, '')
      .replace(/\bcomfortable\s+(cotton\s+)?pajamas?\b/gi, '')
      .replace(/\b(is\s+)?(the\s+)?(main|primary)\s+subject\b/gi, '')
      .replace(/\b(her|his)\s+(hands?|face|eyes?|arms?|legs?|chest|shoulders?|skin|lips?|hair)\b/gi, 'the scene')
      .replace(/\b(from\s+the\s+waist\s+up|head\s+to\s+feet|complete\s+body|full\s+body)\b/gi, '')
      .replace(/^Full (body |scene )?wide shot showing[^.]*\.\s*/i, '')
      .replace(/\bcharacter shown head to feet[^.]*\.\s*/gi, '')
      .replace(/\bmid-action in a populated world[^.]*\.\s*/gi, '')
      .replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();

    finalPrompt = finalPrompt
      .replace(/Cinematic film still shot on ARRI[^.]*\./gi, '')
      .replace(/shot on ARRI[^.]*\./gi, '')
      .replace(/Hollywood blockbuster[^.]*\./gi, '')
      .replace(/photorealistic rendering[^,.]*/gi, '')
      .replace(/8K resolution[^,.]*/gi, '')
      .replace(/color graded with professional[^,.]*/gi, '')
      .replace(/Kodak Vision3[^,.]*/gi, '')
      .replace(/volumetric god rays[^,.]*/gi, '')
      .replace(/(dark moody oil painting[^.]*\.)\s*(dark moody oil painting)/gi, '$1');

    finalPrompt = cleanPromptForGrok(finalPrompt, true);

    finalPrompt = finalPrompt
      .replace(/\bbright\s+(daylight|sunlight|sunshine|light|white|blue)\b/gi, 'very dim warm glow')
      .replace(/\bhigh[- ]key\s+lighting\b/gi, 'ultra low-key lighting')
      .replace(/\boverexposed\b/gi, 'underexposed')
      .replace(/\bvibrant\s+(saturated\s+)?colors?\b/gi, 'muted dark tones')
      .replace(/\bneon\b/gi, 'very dim candlelight')
      .replace(/\bsoft glow\b/gi, 'very faint glow')
      .replace(/\bwarm glow\b/gi, 'very dim warm glow')
      .replace(/\bgentle glow\b/gi, 'very faint glow')
      .replace(/\bsoft light\b/gi, 'very dim light')
      .replace(/\bwarm light\b/gi, 'very dim warm light')
      .replace(/\bgentle light\b/gi, 'very dim light')
      .replace(/\bsoft moonlight\b/gi, 'very dim moonlight')
      .replace(/\bsoft candlelight\b/gi, 'very dim candlelight')
      .replace(/\bsoft amber\b/gi, 'very dim amber')
      .replace(/(?<!(very |faint |dim ))\b(candlelight)\b(?!\s+atmosphere)/gi, 'very dim candlelight')
      .replace(/(?<!(very |faint |dim ))\b(moonlight)\b(?!\s+atmosphere)/gi, 'very dim moonlight')
      .replace(/(?<!(very |faint |dim ))\b(firelight)\b/gi, 'very faint firelight')
      .replace(/(?<!(very |faint |dim ))\b(lantern\s*light)\b/gi, 'very dim lantern light');

    if (finalPrompt.length > 500) {
      const cutPatterns = [/\.\s*(Cinematic|dark moody|Deep shadow|Rembrandt|ARRI|shallow depth|dramatic three)/i];
      for (const pattern of cutPatterns) {
        const match = finalPrompt.match(pattern);
        if (match && match.index > 80) {
          finalPrompt = finalPrompt.substring(0, match.index + 1).trim();
          break;
        }
      }
      finalPrompt += ' Dark moody oil painting, deep shadows, very dim warm amber candlelight, ultra low-key lighting.';
    }

    finalPrompt = finalPrompt
      .replace(/\bbedroom\b/gi, 'room')
      .replace(/\bbed\b(?!\s*rock|\s*of)/gi, 'couch')
      .replace(/\bpillow\b/gi, 'cushion')
      .replace(/\bblanket\b/gi, 'cloth')
      .replace(/\bsleeping\b/gi, 'resting')
      .replace(/\bnight\s*stand\b/gi, 'side table')
      .replace(/\bnight\s*gown\b/gi, 'robe')
      .replace(/,?\s*no people\b[^.]*/gi, '')
      .replace(/,?\s*no human figures\b[^.]*/gi, '');

    // Final sleep cleanup
    finalPrompt = finalPrompt
      .replace(/^Full scene wide shot showing the character's complete body[^.]*\.\s*/i, '')
      .replace(/^Full body wide shot[^.]*\.\s*/i, '')
      .replace(/\bthe character's\b/gi, '')
      .replace(/\bcomplete body head to feet\b/gi, '')
      .replace(/\bcharacter\b/gi, '')
      .replace(/Cinematic film still[^.]*\./gi, '')
      .replace(/\bARRI\s+Alexa[^,.]*/gi, '')
      .replace(/\banamorphic\s+Panavision[^,.]*/gi, '')
      .replace(/\bHollywood blockbuster[^,.]*/gi, '')
      .replace(/\bphotorealistic rendering[^,.]*/gi, '')
      .replace(/\s{2,}/g, ' ').trim();

    console.log(`🌙 Scene ${sceneNum}: sleep prompt (${finalPrompt.length}ch): ${finalPrompt.substring(0, 200)}`);
  } else {
    finalPrompt = cleanPromptForGrok(finalPrompt);
  }

  console.log(`📐 Scene ${sceneNum}: ${finalPrompt.length} chars, prompt: "${finalPrompt.substring(0, 150)}..."`);

  // ── Provider order ────────────────────────────────────────
  // If scene previously failed, skip AI33 (likely content safety) and try fallbacks
  const wasFailedBefore = scene.status === 'image_failed';
  const providers = isSleepProject
    ? [(!wasFailedBefore && ai33ApiKey) ? 'ai33_seedream' : null, 'nano_banana', 'grok'].filter(Boolean)
    : [(!wasFailedBefore && ai33ApiKey) ? 'ai33_seedream' : null, 'grok', 'nano_banana'].filter(Boolean);

  if (wasFailedBefore) {
    console.log(`🔄 Scene ${sceneNum}: previously failed — skipping AI33, trying ${providers.join(' → ')}`);
  }

  // ── TRY EACH PROVIDER (submit only) ──────────────────────
  for (const provider of providers) {
    try {
      let taskId;
      let taskPrefix;

      if (provider === 'ai33_seedream') {
        taskId = await submitAI33Seedream(ai33ApiKey, finalPrompt, aspectRatio);
        taskPrefix = 'ai33_task';
      } else if (provider === 'grok') {
        taskId = await kieCreateTask(kieApiKey, "grok-imagine/text-to-image", {
          prompt: finalPrompt,
          aspect_ratio: aspectRatio
        });
        taskPrefix = 'grok_img_task';
      } else if (provider === 'nano_banana') {
        taskId = await kieCreateTask(kieApiKey, "google/nano-banana", {
          prompt: finalPrompt,
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
    const { scene_id, scene_ids, project_id } = body;

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

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 IMAGE SUBMIT — ${scenesToProcess.length} scenes`);
    console.log(`📐 Aspect: ${aspectRatio} | ⚡ Concurrency: ${MAX_CONCURRENT}`);
    console.log(`🏗️ Providers: ${AI33_API_KEY ? 'AI33' : '—'} → ${KIE_API_KEY ? 'Grok → Nano' : '—'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ── Submit all with concurrency pool ───────────────────────
    const tasks = scenesToProcess.map(scene => () =>
      processScene(base44, scene, project, KIE_API_KEY, AI33_API_KEY, aspectRatio)
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