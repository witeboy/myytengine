import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// IMAGE GENERATION — AI33 Seedream primary, Grok + Nano Banana fallback
// Pipeline: Script → Breakdown → Prompts → [THIS] → Animation
// ══════════════════════════════════════════════════════════════════
// Priority: AI33 Seedream 4.5 → Grok Imagine → Nano Banana
// Sleep:    AI33 Seedream 4.5 → Nano Banana → Grok Imagine
// Accepts: single scene_id OR array of scene_ids for batch mode
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
      console.log(`📡 Kie createTask response: code=${result.code}, msg=${result.msg}, taskId=${result.data?.taskId}`);

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
        const failMsg = poll.data?.failMsg || `Kie task ${taskId} failed`;
        throw new Error(failMsg);
      }

      // Content safety restriction — this IS a failure, not a transient error
      if (poll.data?.state === "success" && !JSON.parse(poll.data.resultJson || "{}").resultUrls?.[0]) {
        throw new Error(`Kie task ${taskId} returned no image URL`);
      }

      // Still processing — continue polling
    } catch (error) {
      // Content safety or actual failure — re-throw immediately
      if (error.message.includes('timed out') || error.message.includes('failed') || error.message.includes('content safety') || error.message.includes('no image URL')) {
        throw error;
      }
      console.warn(`⚠️ Poll network error for task ${taskId}: ${error.message}, retrying...`);
    }
  }
}

// ─────────────────────────────────────────────
// NANO BANANA — fallback image generator (no content safety filter)
// Uses same KIE API, different model: google/nano-banana
// ─────────────────────────────────────────────

async function generateWithNanoBanana(apiKey, prompt, imageSize) {
  console.log(`🍌 Nano Banana: generating (${prompt.length} chars, size=${imageSize})...`);
  const taskId = await kieCreateTask(apiKey, "google/nano-banana", {
    prompt: prompt,
    output_format: "png",
    image_size: imageSize
  });
  return await kiePollResult(apiKey, taskId);
}

async function generateWithGrokImagine(apiKey, prompt, aspectRatio, referenceImageUrl = null) {
  // If we have a reference image (Scene 1's character), use image-to-image for consistency
  if (referenceImageUrl) {
    let kieFileUrl = referenceImageUrl;

    // If the reference URL isn't already a KIE file URL, upload it first
    if (!referenceImageUrl.includes('kieai.redpandaai.co')) {
      try {
        console.log(`📤 Uploading reference image to KIE storage...`);
        const uploadRes = await fetch('https://kieai.redpandaai.co/api/file-url-upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileUrl: referenceImageUrl,
            uploadPath: 'character-refs',
            fileName: `char-ref-${Date.now()}.jpg`
          })
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.data?.fileUrl) {
          kieFileUrl = uploadData.data.fileUrl;
          console.log(`✓ Reference uploaded to KIE: ${kieFileUrl.substring(0, 60)}...`);
        } else {
          console.warn(`⚠️ KIE upload failed, falling back to text-to-image`);
          kieFileUrl = null;
        }
      } catch (err) {
        console.warn(`⚠️ KIE upload error: ${err.message}, falling back to text-to-image`);
        kieFileUrl = null;
      }
    }

    if (kieFileUrl) {
      console.log(`🔗 Using image-to-image with character reference`);
      const taskId = await kieCreateTask(apiKey, "grok-imagine/image-to-image", {
        prompt: prompt,
        image_urls: [kieFileUrl],
        aspect_ratio: aspectRatio
      });
      return await kiePollResult(apiKey, taskId);
    }
  }

  // Default: text-to-image (Scene 1 or no reference available)
  const taskId = await kieCreateTask(apiKey, "grok-imagine/text-to-image", {
    prompt: prompt,
    aspect_ratio: aspectRatio
  });

  return await kiePollResult(apiKey, taskId);
}

// ─────────────────────────────────────────────
// PROMPT CLEANING — strip metadata Grok renders as visible text
// ─────────────────────────────────────────────

function cleanPromptForGrok(rawPrompt, isSleep = false) {
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

  // 2.5 Strip readable content descriptions — Grok renders ALL text as garbled nonsense
  // This covers BOTH digital screens AND physical paper documents.
  p = p

    // ── DIGITAL SCREENS ──
    // Direct UI/app/menu references (NOT dependent on "screen showing" pattern)
    // Catches: "iPhone settings menu", "open iPhone settings", "settings menu on a display"
    .replace(/\b(open\s+)?(iphone|phone|android|smartphone|tablet|ipad)\s+(settings|home\s*screen|lock\s*screen|notifications?|messages?|app\s*store|control\s*center|safari|browser)/gi,
      'phone held in hand')
    // "settings menu on a digital display" / "settings screen" / "home screen"
    .replace(/\b(settings|notifications?|messages?|home)\s+(menu|screen|page|interface|panel|app)\s+(on\s+)?(a\s+)?(digital\s+)?(display|screen|phone|device)/gi,
      'phone glowing softly')
    // "tap/scroll/swipe a setting on the phone" — action on UI element
    .replace(/\b(tap|tapping|scroll|scrolling|swipe|swiping|click|clicking|press|pressing|toggle|toggling)\s+(a\s+)?(setting|option|button|toggle|switch|menu\s+item|notification|link|icon)\s+(on|in)\s+(the\s+)?(phone|screen|device|display|iphone|tablet)/gi,
      'interacting with the phone')
    // Phone/tablet screen content: "screen showing X" / "screen displaying X"
    .replace(/\b(phone|iphone|smartphone|tablet|ipad|mobile)\s+(screen|display)\s+(showing|displaying|with|reading|open\s+to)\s+[^,.]{5,80}[.,]/gi, 
      'phone screen glowing with soft blue-white light,')
    // Laptop/computer screen content
    .replace(/\b(laptop|computer|monitor|desktop|macbook)\s+(screen|display)\s+(showing|displaying|with|open\s+to)\s+[^,.]{5,80}[.,]/gi,
      'laptop screen casting cool light,')
    // Generic "screen displaying/showing"
    .replace(/\b(screen|display)\s+(showing|displaying|that\s+reads|reading|with\s+the\s+text|with\s+text)\s+[^,.]{5,80}[.,]/gi,
      'screen glowing softly,')
    // "a list of options including X, Y, Z" — UI descriptions
    .replace(/\ba\s+list\s+of\s+(options|items|settings|menu\s+items)\s*,?\s*including\s+[^.]{5,100}\./gi,
      'a glowing interface.')
    // Specific app names
    .replace(/\b(Settings\s+app|Messages\s+app|Gmail|Instagram|Twitter|TikTok|YouTube|Facebook|Safari|Chrome)\b/gi, 'app interface')
    // "on a digital display" / "on the phone screen" — orphaned after earlier stripping
    .replace(/\bon\s+a\s+digital\s+(display|screen)\b/gi, '')

    // ── PAPER DOCUMENTS ──
    // Paper docs with "showing/displaying/that reads" content
    .replace(/\b(receipt|bill|invoice|statement|contract|form|report|check|cheque|notice|certificate|diploma|ticket|prescription|memo|letter|document|page|note|card|paper|flyer|brochure|foreclosure\s+notice|eviction\s+notice|medical\s+bill|bank\s+statement|tax\s+return)\s+(showing|displaying|that\s+reads|that\s+says|reading|with\s+the\s+text|with\s+text|with\s+the\s+words|stamped\s+with|marked\s+with|printed\s+with)\s+[^,.]{3,100}[.,]/gi,
      '$1 clutched tightly,')
    // "open to a page about/showing/that reads..."
    .replace(/\b(book|document|letter|newspaper|folder|file|binder)\s+(open\s+to|showing|reading|displaying|that\s+reads|with\s+the\s+text)\s+[^,.]{5,80}[.,]/gi,
      '$1 visible in the scene,')
    // "fine print" / "small text" / "handwritten text" — describes readable content
    .replace(/\b(fine\s+print|small\s+text|printed\s+text|handwritten\s+text|typed\s+text|the\s+words|the\s+text|legible\s+text|readable\s+text)\b/gi,
      'visible markings')
    // "signature line" / "dotted line" — pen-and-paper details that produce artifacts
    .replace(/\b(signature\s+line|dotted\s+line\s+for|sign\s+here|printed\s+name|date\s+line)\b/gi,
      'document details')

    // ── DOLLAR AMOUNTS / NUMBERS AS TEXT ──
    // "$45,000" / "$12.99" / "$2,300" — Grok renders these as visible garbled numbers
    .replace(/\$[\d,]+\.?\d*\s*(in\s+)?(outstanding|owed|due|remaining|total|balance|charges?|debt|worth|dollars?)?\s*/gi, '')
    // "total amount of $X" / "balance of $X" / "sum of $X"
    .replace(/\b(total|balance|sum|amount|cost|price|fee|charge|payment|debt)\s+of\s+\$[\d,]+\.?\d*/gi, 'significant amount')
    // "declining balance from $X to $Y" — narrative number descriptions
    .replace(/\b(from|between)\s+\$[\d,]+\.?\d*\s*(to|and)\s+\$[\d,]+\.?\d*/gi, 'changing dramatically')
    // "X percent" / "X%" — numbers Grok renders
    .replace(/\b\d+\.?\d*\s*(%|percent)\b/gi, '')

    // ── UNIVERSAL "THAT READS" / "SAYING" PATTERNS ──
    // Catches ANY object + "that reads/says 'text here'"
    .replace(/\bthat\s+(reads|says)\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')
    // "with the words 'text here'" 
    .replace(/\bwith\s+the\s+words?\s+['''""][^''""\n]{3,100}['''""][.,]?\s*/gi, '')

    // ── LISTED ITEMS ──
    // "including 'X,' 'Y,' and 'Z.'" 
    .replace(/,?\s*(including|such\s+as|like)\s+['''""]?[A-Z][^.]{3,80}\./gi, '.')
    // Remaining quoted items: 'Battery,' 'Privacy,' etc
    .replace(/['''""][A-Z][a-z]+[,'''""][\s'''""]*/g, '');

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

  // 6. Clean up artifacts from all prior stripping/replacement
  p = p
    .replace(/\.['''""][\s]*/g, '. ')   // "softly.' The" → "softly. The"
    .replace(/\ban\s+(phone|document|receipt|bill|laptop|screen)\b/gi, 'a $1')  // "an phone" → "a phone"
    .replace(/\bto\s+(interacting|holding|reaching|tapping)\b/gi, '$1')  // "to interacting" → "interacting"
    .replace(/\ba\s+menu\b/gi, '')      // orphaned "a menu" after settings stripping
    .replace(/\bshowing\s+an?\s+(phone\s+)?held\s+in\s+hand\s+(menu|screen|page)?\s*/gi, 'in ')  // "showing an phone held in hand menu" → "in"
    .replace(/,\s*,/g, ',')
    .replace(/\.\s*\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.]+/, '')
    .trim();

  // ══════════════════════════════════════════════════════════════
  // 6.25 DEDUP — strip repeated descriptions (works for ALL styles)
  // ══════════════════════════════════════════════════════════════
  // LLM description + identity tag injection + style suffix can produce
  // the same character/environment described 2-3 times. We split into
  // sentences, normalize, and strip duplicates (keeping the first).
  // ══════════════════════════════════════════════════════════════
  
  const sentences = p.split(/(?<=\.)\s+/).filter(s => s.length > 0);
  if (sentences.length > 3) {
    const kept = [];
    const seenNormalized = [];
    
    for (const sentence of sentences) {
      // Normalize: lowercase, strip punctuation, collapse spaces → word bag
      const words = sentence.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
      
      // Check if this sentence substantially overlaps with any kept sentence
      let isDupe = false;
      for (const prevWords of seenNormalized) {
        if (prevWords.length < 5 || words.length < 5) continue; // Skip short sentences
        const overlap = words.filter(w => prevWords.includes(w)).length;
        const overlapRatio = overlap / Math.min(words.length, prevWords.length);
        if (overlapRatio >= 0.7 && overlap >= 5) {
          isDupe = true;
          break;
        }
      }
      
      if (!isDupe) {
        kept.push(sentence);
        seenNormalized.push(words);
      }
    }
    
    if (kept.length < sentences.length) {
      const removed = sentences.length - kept.length;
      p = kept.join(' ').trim();
      console.log(`🔄 Dedup: removed ${removed} duplicate sentence(s), ${sentences.length} → ${kept.length}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // 6.5 OBJECT CLOSE-UP REFRAME
  // ══════════════════════════════════════════════════════════════
  // Detect prompts that focus on an OBJECT (phone, laptop, document)
  // rather than the CHARACTER. These produce broken hand physics
  // and garbled screen text. Reframe to medium shot showing character.
  // ══════════════════════════════════════════════════════════════

  // Two-part pattern:
  // Part 1: "Close-up shot of a medical bill" (the shot type + object)
  // Part 2: "showing $45,000 in outstanding charges." (the content clause we need to eat)
  // We eat BOTH and replace with a clean character-focused reframe.
  const objectFocusPattern = /^(close[\s-]*up|tight|macro|detail|insert)\s+(shot\s+)?(of|on|showing)\s+(an?\s+)?(iphone|phone|smartphone|tablet|laptop|computer|screen|document|book|letter|newspaper|sign|menu|interface|settings|dashboard|receipt|bill|invoice|statement|contract|form|report|check|cheque|notice|certificate|diploma|ticket|prescription|note|memo|flyer|brochure|pamphlet|paper|page|card|postcard|telegram|bank\s+statement|medical\s+bill|foreclosure|eviction|tax\s+return)/i;

  if (objectFocusPattern.test(p)) {
    // Extract just the object name for the replacement
    const objectMatch = p.match(objectFocusPattern);
    const objectName = objectMatch[5] || 'document'; // The captured object type

    // Eat the entire first sentence (object + its content description)
    // Find the real sentence end: period followed by space + capital letter
    // (avoids breaking on decimal points like "$12.99")
    let firstSentenceEnd = -1;
    for (let i = objectMatch[0].length; i < p.length - 1; i++) {
      if (p[i] === '.' && i + 2 < p.length && p[i + 1] === ' ' && /[A-Z]/.test(p[i + 2])) {
        firstSentenceEnd = i;
        break;
      }
    }
    // Fallback: if no clear sentence boundary found, find last period
    if (firstSentenceEnd === -1) {
      firstSentenceEnd = p.indexOf('.', objectMatch[0].length);
    }
    if (firstSentenceEnd > 0) {
      p = `Medium shot showing the character holding a ${objectName}, ${p.substring(firstSentenceEnd + 2).trim()}`;
    } else {
      p = `Medium shot showing the character holding a ${objectName}.`;
    }
    console.log(`🔄 Reframed object close-up → character medium shot (object: ${objectName})`);
  }

  // ══════════════════════════════════════════════════════════════
  // 7. FRAMING ANCHOR — safety net for prompt structure
  // ══════════════════════════════════════════════════════════════
  // The prompt generator now outputs prompts in the correct order:
  // FRAMING → ENVIRONMENT → CHARACTER → STYLE
  // This step is a safety net — if the prompt already starts with
  // framing language, we skip. Otherwise we prepend it.
  // ══════════════════════════════════════════════════════════════

  const alreadyFramed = /^(full\s+(body|scene)|wide\s+shot|medium\s+(wide\s+)?shot|low\s+angle|high\s+angle|overhead|establishing|tracking|dutch\s+angle|pov\s+shot|landscape)/i.test(p);

  if (alreadyFramed || isSleep) {
    // Sleep projects: NEVER add character framing anchors — pure environments
    // Already framed prompts: no prepend needed
  } else {
    // Detect if this is INTENTIONALLY a close-up (from director breakdown shot_type)
    const isIntentionalCloseUp = /\b(ecu|extreme\s*close[\s-]*up|ecu\s*—|macro\s*shot)\b/i.test(p);
    const isIntentionalCU = /\b(cu\s*—|close[\s-]*up\s*—|mcu\s*—|medium\s*close[\s-]*up)\b/i.test(p)
      && !isIntentionalCloseUp;

    if (isIntentionalCloseUp) {
      p = `Extreme close-up shot showing face and upper shoulders with detailed background environment visible behind, shallow depth of field. ${p}`;
    } else if (isIntentionalCU) {
      p = `Close-up portrait from chest up, showing shoulders and upper body, detailed environment visible in background. ${p}`;
    } else {
      // DEFAULT: Strip any close-up/portrait language that leaked in
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

  // Strip "shown full body/figure" rendering instructions — these are NOT visual descriptions
  // and cause Grok to over-emphasize body framing instead of environment
  p = p
    .replace(/\bshown full (?:body|figure)\s*(?:in the scene)?\b/gi, '')
    .replace(/\bshown full body in the scene\b/gi, '')
    .replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.');

  // 8. Smart cap — never cut mid-sentence
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
  const isSleepProject = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story' || project.visual_style === 'sleep_ambient';

  // For sleep: log the raw prompt before any cleaning so we can debug safety issues
  if (isSleepProject) {
    console.log(`🔍 Scene ${sceneNum} RAW prompt (first 300): ${(scene.image_prompt || '').substring(0, 300)}`);
  }

  if (!scene.image_prompt) {
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'no_prompt' };
  }

  // Skip if already generated (idempotent re-runs)
  if (scene.status === 'image_generated' && scene.image_url) {
    console.log(`⏭️ Scene ${sceneNum}: already has image — skipping`);
    return { scene_id: scene.id, scene_number: sceneNum, status: 'skipped', reason: 'already_generated' };
  }

  let finalPrompt = scene.image_prompt;

  // ═══ SLEEP MODE — ambient environments, dark aesthetic ═══
  if (isSleepProject) {
    finalPrompt = finalPrompt
      // Strip ALL photorealistic/cinematic language that doesn't belong in sleep oil paintings
      .replace(/\b(photorealistic|DSLR|Canon|Sony|Nikon)\b[^.]{0,60}/gi, '')
      .replace(/\bnatural skin texture[^,.]*/gi, '')
      .replace(/\beditorial photography[^,.]*/gi, '')
      .replace(/\brazor[\s-]sharp detail[^,.]*/gi, '')
      // Strip full character identity blocks
      .replace(/\b(a\s+)?(photorealistic\s+)?(female|male|woman|man|person|figure|girl|boy|lady|gentleman),?\s+[A-Z][a-z]+,?\s+(with\s+)?[^.]{20,300}(pajamas|clothing|dressed|wearing|shirt|pants|outfit|build|slender|muscular)[^.]*\.\s*/gi, '')
      .replace(/\b[A-Z][a-z]{2,15}\s*(→|is|sits?|stands?|lies?|rests?|gazes?|walks?|holds?|closes?|faces?)\s+/gi, '')
      .replace(/\b(Sarah|The Listener|the listener|the figure|the character|the protagonist)\b/gi, '')
      .replace(/\b(light\s+ivory\s+skin|oval\s+face|hazel\s+eyes?|almond[- ]shaped|chestnut[- ]brown\s+hair|wavy\s+hair|upturned\s+nose|full\s+lips|slender\s+build)\b[^,.]{0,60}[.,]\s*/gi, '')
      .replace(/\b(wearing|dressed\s+in|clothed\s+in)\s+[^.]{5,80}(pajamas|cotton|silk|comfortable)[^.]*\.\s*/gi, '')
      .replace(/\bcomfortable\s+(cotton\s+)?pajamas?\b/gi, '')
      .replace(/\b(is\s+)?(the\s+)?(main|primary)\s+subject\b/gi, '')
      .replace(/\b(her|his)\s+(hands?|face|eyes?|arms?|legs?|chest|shoulders?|skin|lips?|hair)\b/gi, 'the scene')
      .replace(/\b(from\s+the\s+waist\s+up|head\s+to\s+feet|complete\s+body|full\s+body)\b/gi, '')
      // Strip the full-body framing anchor
      .replace(/^Full (body |scene )?wide shot showing[^.]*\.\s*/i, '')
      .replace(/\bcharacter shown head to feet[^.]*\.\s*/gi, '')
      .replace(/\bmid-action in a populated world[^.]*\.\s*/gi, '')
      // Clean artifacts
      .replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();

    // For sleep: strip heavyweight style suffixes that may trigger safety filters
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

    // Now apply standard cleaning — pass isSleep=true to skip character framing anchor
    finalPrompt = cleanPromptForGrok(finalPrompt, true);

    // Strip any bright/daylight language and enforce very dim lighting
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

    // Keep prompt SHORT for sleep — under 500 chars to avoid safety filter triggers
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

    // Strip words that Grok's content safety filter flags in dark/night contexts
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

    // Log the cleaned prompt for debugging
    console.log(`🌙 Scene ${sceneNum}: sleep prompt (${finalPrompt.length}ch): ${finalPrompt.substring(0, 200)}`);
  } else {
    finalPrompt = cleanPromptForGrok(finalPrompt);
  }

  // SLEEP: Strip framing anchors and any leaked cinematic/photorealistic language
  if (isSleepProject) {
    finalPrompt = finalPrompt
      .replace(/^Full scene wide shot showing the character's complete body[^.]*\.\s*/i, '')
      .replace(/^Full body wide shot[^.]*\.\s*/i, '')
      .replace(/^Wide ambient shot of[^.]*\.\s*/i, '')
      .replace(/\bthe character's\b/gi, '')
      .replace(/\bcomplete body head to feet\b/gi, '')
      .replace(/\bcharacter\b/gi, '')
      // Strip any ARRI/cinematic language that leaked through
      .replace(/Cinematic film still[^.]*\./gi, '')
      .replace(/\bARRI\s+Alexa[^,.]*/gi, '')
      .replace(/\banamorphic\s+Panavision[^,.]*/gi, '')
      .replace(/\bbeautiful lens flare[^,.]*/gi, '')
      .replace(/\bshallow depth of field f\/[^,.]*/gi, '')
      .replace(/\bdramatic three-point lighting[^,.]*/gi, '')
      .replace(/\bcolor graded with professional[^,.]*/gi, '')
      .replace(/\bHollywood blockbuster[^,.]*/gi, '')
      .replace(/\bphotorealistic rendering[^,.]*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Log which framing mode was applied
  const framingMode = /^Extreme close-up/i.test(finalPrompt) ? 'ECU'
    : /^Close-up portrait/i.test(finalPrompt) ? 'CU/MCU'
    : /^Full scene wide/i.test(finalPrompt) ? 'WIDE (anchor)'
    : 'WIDE (native)';
  console.log(`📐 Scene ${sceneNum}: framing → ${framingMode} (${finalPrompt.length} chars)`);

  // ── CHARACTER REFERENCE ANCHORING ──
  // Sleep projects: no character reference (pure environments)
  // Standard: Scene 1 text-to-image, Scene 2+ image-to-image with reference
  const referenceUrl = isSleepProject ? null : (sceneNum > 1 ? (project.reference_image_url || null) : null);
  if (referenceUrl) {
    console.log(`🔗 Scene ${sceneNum}: using character reference from Scene 1`);
  }

  // Map aspect_ratio to Nano Banana image_size format
  const nanoBananaSize = aspectRatio; // Both use "16:9" / "9:16" format

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      let promptToSend = finalPrompt;
      let useNanoBanana = false;

      // Sleep projects: attempt 1 = Nano Banana (cheap, no content safety), attempt 2+ = Grok fallback
      // Non-sleep: all attempts use Grok with exponential backoff
      if (isSleepProject && attempt === 0) {
        useNanoBanana = true;
      } else if (isSleepProject && attempt > 0) {
        console.log(`🔄 Scene ${sceneNum}: falling back to Grok (attempt ${attempt + 1})`);
      }

      console.log(`🎨 Scene ${sceneNum}: generating via ${useNanoBanana ? 'Nano Banana' : 'Grok'} (attempt ${attempt + 1}/${MAX_RETRIES}, ${promptToSend.length} chars)...`);
      console.log(`📝 FINAL PROMPT: "${promptToSend.substring(0, 200)}"`);

      let imageUrl;
      if (useNanoBanana) {
        imageUrl = await generateWithNanoBanana(apiKey, promptToSend, nanoBananaSize);
      } else {
        imageUrl = await generateWithGrokImagine(apiKey, promptToSend, aspectRatio, referenceUrl);
      }

      // Validate URL
      if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
        throw new Error(`Invalid image URL returned: ${imageUrl}`);
      }

      await base44.asServiceRole.entities.Scenes.update(scene.id, {
        image_url: imageUrl,
        status: "image_generated"
      });

      // ── SCENE 1 ANCHOR: Save as reference for all subsequent scenes ──
      if (sceneNum === 1 && !project.reference_image_url) {
        try {
          await base44.asServiceRole.entities.Projects.update(project.id, {
            reference_image_url: imageUrl
          });
          project.reference_image_url = imageUrl;
          console.log(`📌 Scene 1 saved as character reference for all subsequent scenes`);
        } catch (refErr) {
          console.warn(`⚠️ Failed to save reference image: ${refErr.message}`);
        }
      }

      console.log(`✓ Scene ${sceneNum}: image generated via ${useNanoBanana ? 'Nano Banana 🍌' : 'Grok'} (${promptToSend.length} chars → ${imageUrl.substring(0, 60)}...)`);

      return {
        scene_id: scene.id,
        scene_number: sceneNum,
        status: 'success',
        image_url: imageUrl,
        prompt_length: promptToSend.length,
        attempts: attempt + 1,
        model: useNanoBanana ? 'nano_banana' : 'grok'
      };

    } catch (error) {
      console.warn(`⚠️ Scene ${sceneNum} attempt ${attempt + 1} failed: ${error.message}`);

      if (attempt === MAX_RETRIES - 1) {
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

      // Short backoff before switching to fallback model
      const waitMs = isSleepProject ? 2000 : RETRY_BASE_MS * Math.pow(2, attempt);
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
    console.log(`🔗 Character reference: ${project.reference_image_url ? 'YES (Scene 2+ will use image-to-image)' : 'NONE (Scene 1 will establish reference)'}`);
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