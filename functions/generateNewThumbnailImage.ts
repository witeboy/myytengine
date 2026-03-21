import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// generateNewThumbnailImage — Nano Banana 2 via KIE API

// ── Build the face-preservation prompt ──────────────────────────────────
// This is the core innovation: Nano Banana has no dedicated "face swap" field,
// so we engineer the prompt to achieve the same result.
function buildFaceSwapPrompt({ overlayText, font, textColor, textPosition, hasTemplate, hasPhotos, photoCount, concept, charDescriptions }) {
  const imagePrompt = concept.image_prompt || '';

  if (hasTemplate && hasPhotos) {
    // ═══════════════════════════════════════════════════════════════════
    // TEMPLATE + PHOTOS: The most important case
    // Image 1 = template layout, Images 2+ = character reference photos
    // ═══════════════════════════════════════════════════════════════════
    const photoLabels = [];
    for (let i = 0; i < photoCount; i++) {
      photoLabels.push(`Image ${i + 2}`);
    }

    return `You are a professional YouTube thumbnail compositor. You have been given ${1 + photoCount} images.

IMAGE ROLES:
- Image 1 is the LAYOUT TEMPLATE — a proven high-CTR YouTube thumbnail. This defines the EXACT composition you must recreate: same background, same colors, same lighting, same split/gradient, same decorative elements (arrows, icons, badges), same framing, same camera angles.
- ${photoLabels.join(', ')} ${photoCount === 1 ? 'is a CHARACTER REFERENCE PHOTO' : 'are CHARACTER REFERENCE PHOTOS'} — ${photoCount === 1 ? 'this shows the real person whose face' : 'these show the real people whose faces'} must appear in the final thumbnail.

═══════════════════════════════════════════════
YOUR TASK — PRECISE FACE TRANSPLANT
═══════════════════════════════════════════════

Recreate the EXACT layout and composition from Image 1 (the template), but replace the people in the template with the person(s) from the reference photo(s).

PERSON PRESERVATION RULES (CRITICAL — DO NOT VIOLATE):

FACE (highest priority — must be pixel-perfect):
1. BONE STRUCTURE: Reproduce the exact skull shape, jawline, chin shape, and forehead proportions from the reference photo(s). Do not morph, slim, widen, or reshape any facial bones.
2. SKIN: Match the exact skin tone, texture, and complexion across face AND body. If the reference person has dark skin, the result must have the same shade everywhere. Include freckles, moles, or scars.
3. NOSE: Exact same nose — bridge width, nostril shape, tip shape. Do not narrow or reshape.
4. EYES: Same eye shape, eye color, eyelid crease depth, eyebrow thickness and arch. Do not change eye size or shape.
5. LIPS: Same lip thickness, shape, and color. Do not thin or reshape.
6. HAIR: Exact same hair color, texture (straight/curly/coiled/braided), length, and style. Do not change the hairstyle.
7. EARS: Same ear shape and size if visible.
8. AGE: The person in the output must appear the SAME age as in the reference photo. Do not age up or age down.

BODY (adapt based on what's visible in the reference photo):
9. BODY BUILD: If the reference photo shows the person's body (full or partial), match their exact build — weight, shoulder width, torso length, arm thickness, body fat distribution. A heavy person must stay heavy. A slim person must stay slim.
10. BODY COMPLETION: The reference photo may only show a face, head+shoulders, upper body, or full body. Follow these rules:
    - If FULL BODY is visible: use the person's exact body proportions, build, and frame for the output.
    - If only UPPER BODY/TORSO is visible: match the visible build, shoulder width, arm size, and skin tone. Complete the lower body proportionally — use the template's pose/stance as a guide, but keep proportions consistent with the visible upper body.
    - If only HEAD/SHOULDERS or FACE is visible: match the neck width, shoulder hints, and skin tone. Infer a proportional body type from facial fullness and visible cues. Use the template character's pose, stance, and outfit as the body guide, but adjust proportions to look natural for the reference person's face.
11. CLOTHING: Follow this priority order for each character's outfit:
    a) If the USER PROVIDED a clothing description for this character, use EXACTLY that description (see CHARACTER CLOTHING NOTES below).
    b) If no description was provided but the reference photo shows clothing, use the clothing visible in the reference photo.
    c) If no description was provided and only a face/headshot is visible, dress the character in clothing that fits the video's story context and mood.
12. HANDS & ARMS: If the reference shows hands/arms, match skin tone and proportions. If not visible, generate hands that match the person's skin tone and body build.

WHAT TO KEEP FROM THE TEMPLATE (Image 1):
- The overall composition and layout (where people are positioned, the background split, color zones)
- The background elements, decorative graphics, arrows, icons, badges
- The lighting style and color temperature
- The general pose/framing of where people stand (but with the NEW person's body and face)
- The emotional energy and thumbnail style

WHAT TO CHANGE:
- Replace ALL people in the template with the person(s) from the reference photo(s)
- The expression should match what the template person was doing (shocked face → reference person with shocked face, etc.) but with the reference person's REAL facial features

OBJECT REPLACEMENT (CRITICAL FOR STORY RELEVANCE):
- Study the image_prompt below CAREFULLY to identify the SPECIFIC SUBJECT of this video (e.g., custom t-shirts, crypto trading, a restaurant, a specific product)
- If the template contains OBJECTS that are NOT related to this specific subject, you MUST REPLACE them with story-relevant objects
- For example: if the template shows dump trucks but the story is about custom t-shirts → replace the trucks with colorful custom t-shirts, merch displays, a heat press, or stacks of branded clothing
- If the template shows a car but our story is about Bitcoin → replace the car with Bitcoin/crypto imagery
- NEVER keep generic "success" objects (luxury cars, mansions, trucks, yachts) if the story is about a specific product or business — replace them with THAT product
- Keep the same SIZE, POSITION, and FRAMING of the original object — just swap what the object IS
- The replacement object must look photorealistic and naturally composited into the scene
- If the template uses split-screen/before-after layout, maintain that structure but with story-relevant content on each side

STORY CONTEXT FROM IMAGE PROMPT (read this to know what objects should appear):
${imagePrompt}

${(() => {
      const descs = (charDescriptions || []).filter((d, i) => d && d.trim());
      if (descs.length === 0) return '';
      let block = `\n═══════════════════════════════════════════════\nCHARACTER CLOTHING NOTES (from user)\n═══════════════════════════════════════════════\n`;
      charDescriptions.forEach((d, i) => {
        if (d && d.trim()) block += `- Character ${i + 1} (Image ${hasTemplate ? i + 2 : i + 1}): ${d.trim()}\n`;
      });
      block += `Use these descriptions for clothing/outfit. They override what is visible in the reference photo.\n`;
      return block;
    })()}
═══════════════════════════════════════════════
TEXT HANDLING — CRITICAL (DO NOT SKIP)
═══════════════════════════════════════════════
- REMOVE every single piece of text, title, watermark, channel name, cast name, studio name, logo text, badge text, and any other written words that exist in the template image. The output must have ZERO text from the original template.
${overlayText ? `- After removing ALL original text, add ONLY this new text: "${overlayText}"
  • Font: ${font}, ultra-bold, condensed
  • Color: ${textColor} with thick black outline/stroke (6px+) and strong drop shadow
  • Size: Match the size of the LARGEST/MAIN title text that was in the original template
  • Position: Place it in the SAME position where the main title text was in the template
  • Style: Match the same 3D/gradient/embossed style of the original main title if it had one
  • This must be the ONLY text in the entire image — nothing else` : '- The output must contain NO text whatsoever — completely clean image with no words'}

OUTPUT REQUIREMENTS:
- YouTube thumbnail aspect ratio 16:9, 1920×1080
- Photorealistic quality — must look like a real photograph, not AI-generated
- Faces must be razor-sharp and high-detail
- The final image must look like the template but starring the reference person(s)
- The ONLY text allowed is "${overlayText || 'NONE'}" — remove everything else
- Professional studio-grade compositing quality`;

  } else if (hasTemplate && !hasPhotos) {
    // Template only — swap text AND replace objects with story-relevant ones
    return `You have been given 1 image — a YouTube thumbnail template.

Recreate this thumbnail with the same overall layout, composition, lighting, and energy.

OBJECT REPLACEMENT (CRITICAL FOR STORY RELEVANCE):
Study the image_prompt carefully for the SPECIFIC SUBJECT of this video. Then:
- IDENTIFY all major objects in the template (products, items, symbols, props, vehicles, etc.)
- REPLACE these objects with the STORY-RELEVANT objects described in the concept
- Example: Template shows trucks but the video is about custom t-shirts → replace trucks with colorful custom t-shirts, merch displays, clothing racks
- Example: Template has generic product → replace with the specific subject of our video (crypto coin, stock chart, food item, custom clothing, etc.)
- NEVER keep generic objects (luxury cars, trucks, mansions) if the story is about a specific product — always replace with THAT product
- Keep the same SIZE, POSITION, and FRAMING — just change WHAT the object is
- If the template uses split-screen or before/after layout, keep that structure but fill each side with story-appropriate imagery
- People in the template can stay (with appropriate expressions) unless the story requires different characters

STORY CONTEXT FROM IMAGE PROMPT:
${imagePrompt}

TEXT REPLACEMENT (CRITICAL):
- REMOVE every single piece of text from the template: all titles, subtitles, channel names, cast names, studio names, watermarks, badges with text, and any other written words. The output must have ZERO original text.
${overlayText ? `- Replace ALL removed text with ONLY this single new text: "${overlayText}"
  • Font: ${font}, ultra-bold, condensed
  • Color: ${textColor} with thick black outline/stroke (6px+) and strong drop shadow
  • Size: Match the size of the LARGEST/MAIN title in the original
  • Position: Place it where the main title was in the original template
  • Style: Match the 3D/gradient/embossed style of the original title if applicable
  • This must be the ONLY text in the entire output image` : '- Output must contain NO text at all — completely clean.'}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic.`;

  } else if (!hasTemplate && hasPhotos) {
    // No template — generate from prompt with face reference
    const photoLabels = [];
    for (let i = 0; i < photoCount; i++) {
      photoLabels.push(`Image ${i + 1}`);
    }

    return `You have been given ${photoCount} CHARACTER REFERENCE PHOTO${photoCount > 1 ? 'S' : ''} (${photoLabels.join(', ')}).

Generate the following YouTube thumbnail scene, but the person(s) in the scene MUST be the exact person(s) from the reference photo(s):

${imagePrompt}

FACE PRESERVATION RULES (CRITICAL):
1. BONE STRUCTURE: Reproduce the exact skull shape, jawline, chin, forehead from the reference.
2. SKIN: Exact same skin tone, texture, complexion — no lightening or darkening.
3. NOSE: Same bridge width, nostril shape, tip shape.
4. EYES: Same eye shape, color, eyelid crease, eyebrow thickness.
5. LIPS: Same thickness, shape, color.
6. HAIR: Exact same color, texture, length, style.
7. BODY: Match build and proportions from the reference.
8. AGE: Same apparent age — do not age up or down.

The person in the output must be IMMEDIATELY recognizable as the same person from the reference photo. Anyone who knows this person should be able to identify them instantly.

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic, cinematic quality.`;

  } else {
    // No template, no photos — pure generation
    return `${imagePrompt}

Output: YouTube thumbnail 16:9, 1920×1080, photorealistic, cinematic DSLR quality. Razor-sharp faces. Professional compositing.`;
  }
}

// ── Enhance prompt builder (for post-processing) ────────────────────────
function buildEnhancePrompt(mood, grade) {
  const moodDesc = {
    crime: 'Dark true crime. Heavy desaturation, red/crimson tint, deep black vignette, high contrast, gritty.',
    drama: 'Dramatic cinematic. Cool blue shadows, warm highlights, medium vignette, boosted saturation.',
    nollywood: 'Warm vibrant Nollywood. Rich golden skin tones, vivid oranges/reds, punchy contrast.',
    comedy: 'Ultra-vibrant MrBeast candy store. Maximum saturation, bright, punchy, energetic.',
    finance: 'Premium corporate. Cool blue-teal tint, desaturated, medium dark vignette, professional.',
    inspirational: 'Uplifting warm-to-cool gradient. Soft purple and gold tones, slightly dreamy.',
    educational: 'Clean authoritative blue. Cool blue midtones, professional, trustworthy.',
  };
  return `ENHANCE this image. Do NOT change composition, people, text, or layout.
Apply: ${moodDesc[mood] || moodDesc.drama}
Sharpness: increase significantly. Saturation: ${grade.saturation > 1.3 ? 'boost vibrancy' : grade.saturation < 0.9 ? 'desaturate' : 'slight boost'}.
Contrast: ${grade.contrast > 1.2 ? 'high' : 'medium boost'}. Vignette: ${grade.vignetteStrength > 0.7 ? 'heavy dark' : grade.vignetteStrength > 0.4 ? 'medium' : 'light/none'}.
Preserve ALL faces, text, layout exactly. Only adjust color, sharpness, contrast, mood.`;
}

// ── Poll helper ─────────────────────────────────────────────────────────
async function pollForResult(taskId, apiKey, maxAttempts = 24, interval = 5000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, interval));
    let pollData;
    try {
      const res = await fetch(
        `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );
      const text = await res.text();
      try { pollData = JSON.parse(text); } catch (_) {}
    } catch (e) {
      console.warn(`Poll ${attempt}: fetch error: ${e.message}`);
      continue;
    }
    const state = pollData?.data?.state || '';
    console.log(`Poll ${attempt}/${maxAttempts}: state="${state}"`);

    if (state === 'success') {
      const rj = pollData?.data?.resultJson;
      let url = null;
      if (rj) {
        try {
          const p = typeof rj === 'string' ? JSON.parse(rj) : rj;
          url = p?.resultUrls?.[0] || p?.urls?.[0] || p?.images?.[0] || p?.url;
        } catch (_) {
          if (typeof rj === 'string' && rj.startsWith('http')) url = rj;
        }
      }
      if (!url) url = pollData?.data?.imageUrl || pollData?.data?.image_url || pollData?.data?.url;
      return { success: true, url };
    }
    if (state === 'fail') {
      const msg = pollData?.data?.failMsg || pollData?.data?.error || 'Generation failed';
      return { success: false, error: msg };
    }
  }
  return { success: false, error: 'Timed out waiting for result' };
}

// ── Upload image to KIE ─────────────────────────────────────────────────
async function uploadToKIE(b64, mime, label, apiKey) {
  const rawB64 = b64.includes(',') ? b64.split(',')[1] : b64;
  const cleanB64 = rawB64.replace(/[\s\r\n]/g, '');
  const binaryString = atob(cleanB64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  const actualMime = isPng ? 'image/png' : 'image/jpeg';
  const ext = isPng ? 'png' : 'jpg';
  const fileName = `${label}_${Date.now()}.${ext}`;
  console.log(`📤 Uploading ${label}: ${(bytes.length / 1024).toFixed(0)}KB`);

  // KIE stream upload
  try {
    const blob = new Blob([bytes], { type: actualMime });
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('uploadPath', 'thumbnails');
    const res = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (_) {}
    const url = data?.data?.fileUrl || data?.data?.downloadUrl || data?.data?.url;
    if (url) { console.log(`✅ ${label} → ${url}`); return url; }
    console.warn(`⚠️ ${label} stream: ${text.substring(0, 200)}`);
  } catch (e) { console.warn(`⚠️ ${label} stream error: ${e.message}`); }

  // Fallback: base64 upload
  try {
    const dataUrl = `data:${actualMime};base64,${cleanB64}`;
    const res = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ base64Data: dataUrl, uploadPath: 'thumbnails', fileName }),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (_) {}
    const url = data?.data?.fileUrl || data?.data?.downloadUrl || data?.data?.url;
    if (url) { console.log(`✅ ${label} (b64) → ${url}`); return url; }
    console.warn(`❌ ${label} b64: ${text.substring(0, 200)}`);
  } catch (e) { console.warn(`❌ ${label} b64 error: ${e.message}`); }

  return null;
}

// ════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { concept_id, char_photos: directCharPhotos, template_ref: directTemplateRef, custom_overlay_text, char_descriptions: directCharDescriptions } = body;
    if (!concept_id) return Response.json({ error: 'concept_id is required' }, { status: 400 });

    const KIE_API_KEY = Deno.env.get('KIE_API_KEY');
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    console.log('=== generateNewThumbnailImage (nano-banana-2) ===');
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 90000; // 90s safety limit (leave headroom for Deno timeout)
    const timeLeft = () => MAX_RUNTIME_MS - (Date.now() - startTime);

    // 1. Load concept
    let concept;
    try { concept = await base44.entities.ThumbnailConcepts.get(concept_id); }
    catch (e) { return Response.json({ error: `Could not load concept: ${e.message}` }, { status: 404 }); }
    if (!concept?.image_prompt) return Response.json({ error: 'Concept has no image_prompt' }, { status: 400 });

    // 2. Resolve character photos (support both b64 and url)
    let charPhotos = [];
    if (Array.isArray(directCharPhotos) && directCharPhotos.some(p => p?.b64 || p?.url)) {
      charPhotos = directCharPhotos.filter(p => p?.b64 || p?.url);
      console.log('Direct char photos:', charPhotos.length, '(b64:', charPhotos.filter(p=>p.b64).length, 'url:', charPhotos.filter(p=>p.url).length, ')');
    } else if (concept.char_photos_json) {
      try {
        const stored = JSON.parse(concept.char_photos_json);
        charPhotos = stored.filter(p => p?.b64 && !p.truncated);
        console.log('Stored char photos:', charPhotos.length);
      } catch (_) {}
    }

    // 3. Resolve template reference
    let templateRef = null;
    if (directTemplateRef?.b64) {
      templateRef = directTemplateRef;
      console.log('Direct template:', templateRef.name);
    } else if (concept.template_ref_json) {
      try { templateRef = JSON.parse(concept.template_ref_json); } catch (_) {}
    }

    const hasCharPhotos = charPhotos.length > 0;
    const hasTemplateRef = !!templateRef?.b64;
    console.log(`📸 Photos: ${charPhotos.length} | Template: ${hasTemplateRef ? templateRef.name : 'NONE'}`);

    // ── STEP 4: Upload ALL images to KIE ──────────────────────────
    // For nano-banana-2, everything goes into image_input[]
    // Order matters: template FIRST (Image 1), then character photos (Image 2, 3, ...)
    const imageUrls = [];

    if (hasTemplateRef) {
      const url = await uploadToKIE(templateRef.b64, templateRef.mime || 'image/jpeg', 'template', KIE_API_KEY);
      if (url) imageUrls.push(url);
    }

    for (const [i, p] of charPhotos.entries()) {
      if (p.b64) {
        // Base64 photo — upload to KIE
        const url = await uploadToKIE(p.b64, p.mime || 'image/jpeg', `char_${i + 1}`, KIE_API_KEY);
        if (url) imageUrls.push(url);
      } else if (p.url) {
        // Remote URL photo — fetch server-side, then upload to KIE
        console.log(`📥 Fetching remote photo ${i + 1}: ${p.url.substring(0, 80)}...`);
        try {
          const resp = await fetch(p.url);
          if (resp.ok) {
            const arrayBuf = await resp.arrayBuffer();
            const bytes = new Uint8Array(arrayBuf);
            // Convert to base64 in chunks to avoid stack overflow
            let binaryStr = '';
            const chunkSize = 8192;
            for (let j = 0; j < bytes.length; j += chunkSize) {
              const chunk = bytes.subarray(j, Math.min(j + chunkSize, bytes.length));
              binaryStr += String.fromCharCode.apply(null, chunk);
            }
            const b64 = btoa(binaryStr);
            console.log(`✅ Fetched & encoded char_${i + 1}: ${(bytes.length / 1024).toFixed(0)}KB`);
            const url = await uploadToKIE(b64, 'image/jpeg', `char_${i + 1}`, KIE_API_KEY);
            if (url) imageUrls.push(url);
          } else {
            console.warn(`⚠️ Remote fetch failed: HTTP ${resp.status}`);
          }
        } catch (e) {
          console.warn(`⚠️ Remote fetch error for char_${i + 1}: ${e.message}`);
        }
      }
    }

    console.log(`Uploaded ${imageUrls.length} images to KIE (expected: ${(hasTemplateRef ? 1 : 0) + charPhotos.length})`);

    // Log which images succeeded
    if (hasTemplateRef && imageUrls.length === 0) {
      console.warn('⚠️ Template upload FAILED — falling back to prompt-only generation');
    }
    if (hasCharPhotos && imageUrls.length <= (hasTemplateRef ? 1 : 0)) {
      console.warn('⚠️ Character photo uploads FAILED — faces will not be preserved');
    }

    // Determine effective state based on what actually uploaded
    const templateUploaded = hasTemplateRef && imageUrls.length > 0;
    const photosUploaded = imageUrls.length > (templateUploaded ? 1 : 0);
    const effectivePhotoCount = templateUploaded ? imageUrls.length - 1 : imageUrls.length;

    console.log(`Effective state: template=${templateUploaded}, photos=${photosUploaded} (${effectivePhotoCount} uploaded)`);

    // ── STEP 5: Build the face-preservation prompt ──────────────
    const overlayText = (custom_overlay_text || concept.text_overlay || '').toUpperCase().trim();
    const rawStyle = concept.text_style || '';
    const fontMatch = rawStyle.match(/bebas neue|impact|montserrat|roboto|arial/i);
    const font = fontMatch ? fontMatch[0] : 'Impact';
    const colorMatch = rawStyle.match(/white|yellow|gold|red|black|orange/i);
    const textColor = colorMatch ? colorMatch[0] : 'white';
    const textPosition = rawStyle.toLowerCase().includes('bottom') ? 'bottom-center' : 'upper-left';

    // Resolve character descriptions
    const charDescriptions = Array.isArray(directCharDescriptions) ? directCharDescriptions : [];

    const prompt = buildFaceSwapPrompt({
      overlayText,
      font,
      textColor,
      textPosition,
      hasTemplate: templateUploaded,
      hasPhotos: photosUploaded,
      photoCount: effectivePhotoCount,
      concept,
      charDescriptions,
    });

    console.log(`Prompt length: ${prompt.length} chars`);

    // ── STEP 6: Submit to nano-banana-2 ─────────────────────────
    const model = 'nano-banana-2';
    const kieHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    };

    const inputPayload = {
      prompt,
      image_input: imageUrls.length > 0 ? imageUrls : [],
      aspect_ratio: '16:9',
      resolution: '2K',
      output_format: 'png',
    };

    console.log(`Submitting to ${model} | images: ${imageUrls.length} | resolution: 2K`);

    const createRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: kieHeaders,
      body: JSON.stringify({ model, input: inputPayload }),
    });
    const createText = await createRes.text();
    console.log(`${model} → HTTP ${createRes.status}: ${createText.substring(0, 300)}`);

    let createData;
    try { createData = JSON.parse(createText); } catch (_) {}
    const taskId = createData?.data?.taskId;
    if (!taskId) {
      return Response.json({ error: `Task creation failed: ${createText.substring(0, 200)}` }, { status: 500 });
    }
    console.log(`✅ Task: ${taskId}`);

    // ── STEP 7: Poll for result (time-aware) ────────────────────
    // Use remaining time budget for polling. Leave 15s buffer for post-processing + save.
    const pollBudgetMs = Math.max(30000, timeLeft() - 15000);
    const pollInterval = 5000;
    const maxPollAttempts = Math.min(20, Math.floor(pollBudgetMs / pollInterval));
    console.log(`Polling: up to ${maxPollAttempts} attempts, ${Math.round(pollBudgetMs/1000)}s budget`);
    const result = await pollForResult(taskId, KIE_API_KEY, maxPollAttempts, pollInterval);
    
    // If still waiting, return task_id so frontend can continue polling
    if (!result.success && result.error === 'Timed out waiting for result') {
      console.log('⏱ Generation still in progress — returning task_id for frontend polling');
      return Response.json({
        success: false,
        pending: true,
        task_id: taskId,
        concept_id,
        model_used: model,
        message: 'Generation in progress. Poll with task_id.',
      });
    }
    
    if (!result.success) throw new Error(result.error);
    let imageUrl = result.url;
    if (!imageUrl) throw new Error('Generation succeeded but no image URL returned');
    console.log(`✅ Generated: ${imageUrl} (${Math.round((Date.now()-startTime)/1000)}s elapsed)`);

    // ── STEP 8: Post-processing — Upscale ───────────────────────
    // Mood can be pipe-separated (e.g. "crime|drama") — take the first segment
    const rawMood = (concept.mood || concept.visual_metaphor || 'drama').toLowerCase();
    const mood = rawMood.split('|')[0].trim() || 'drama';
    console.log(`🎨 Mood resolved: "${rawMood}" → "${mood}"`);

    let finalUrl = imageUrl;

    // Skip post-processing if time is tight — return the raw image
    if (timeLeft() < 20000) {
      console.log(`⏱ Skipping post-processing — only ${Math.round(timeLeft()/1000)}s left`);
    } else {
      const MOOD_GRADES = {
        crime:        { saturation: 0.7,  contrast: 1.35, brightness: 0.75, vignetteStrength: 0.92 },
        drama:        { saturation: 1.4,  contrast: 1.2,  brightness: 0.95, vignetteStrength: 0.75 },
        nollywood:    { saturation: 1.6,  contrast: 1.2,  brightness: 1.0,  vignetteStrength: 0.6  },
        comedy:       { saturation: 2.0,  contrast: 1.1,  brightness: 1.1,  vignetteStrength: 0.2  },
        finance:      { saturation: 1.15, contrast: 1.15, brightness: 0.9,  vignetteStrength: 0.65 },
        inspirational:{ saturation: 1.3,  contrast: 1.05, brightness: 1.05, vignetteStrength: 0.3  },
        educational:  { saturation: 1.15, contrast: 1.15, brightness: 0.95, vignetteStrength: 0.55 },
      };
      const grade = MOOD_GRADES[mood] || MOOD_GRADES.drama;

      // 8a. Upscale
      if (timeLeft() > 40000) {
        try {
          console.log(`🔍 Upscaling... (${Math.round(timeLeft()/1000)}s remaining)`);
          const upRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
            method: 'POST', headers: kieHeaders,
            body: JSON.stringify({ model: 'kie-ai/upscaler', input: { image_url: imageUrl, scale: 2 } }),
          });
          const upText = await upRes.text();
          let upData; try { upData = JSON.parse(upText); } catch (_) {}
          const upTaskId = upData?.data?.taskId;
          if (upTaskId) {
            const maxUp = Math.min(8, Math.floor(timeLeft() / 5000));
            const upResult = await pollForResult(upTaskId, KIE_API_KEY, maxUp, 4000);
            if (upResult.success && upResult.url) { finalUrl = upResult.url; console.log('✅ Upscaled'); }
          }
        } catch (e) { console.warn('Upscale error (non-fatal):', e.message); }
      }

      // 8b. Color grade
      if (timeLeft() > 35000) {
        try {
          console.log(`🎨 Color grading... (${Math.round(timeLeft()/1000)}s remaining)`);
          const enhancePrompt = buildEnhancePrompt(mood, grade);
          const enRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
            method: 'POST', headers: kieHeaders,
            body: JSON.stringify({ model: 'kie-ai/image-enhance', input: { image_url: finalUrl, prompt: enhancePrompt, creativity: 0.15 } }),
          });
          const enText = await enRes.text();
          let enData; try { enData = JSON.parse(enText); } catch (_) {}
          const enTaskId = enData?.data?.taskId;
          if (enTaskId) {
            const maxEn = Math.min(6, Math.floor(timeLeft() / 5000));
            const enResult = await pollForResult(enTaskId, KIE_API_KEY, maxEn, 4000);
            if (enResult.success && enResult.url) { finalUrl = enResult.url; console.log('✅ Enhanced'); }
          }
        } catch (e) { console.warn('Enhance error (non-fatal):', e.message); }
      }
    }

    // ── STEP 9: Re-upload to Cloudflare R2 (CORS-safe) ────────
    let persistentUrl = finalUrl;
    if (timeLeft() > 8000) {
      try {
        console.log('📦 Re-uploading to Cloudflare R2 for CORS-safe access...');
        const imgResp = await fetch(finalUrl);
        if (imgResp.ok) {
          const imgBytes = new Uint8Array(await imgResp.arrayBuffer());
          const contentType = imgResp.headers.get('content-type') || 'image/png';
          const ext = contentType.includes('jpeg') ? 'jpg' : 'png';
          const fileName = `thumbnails/${concept_id}-${Date.now()}.${ext}`;
          const r2Client = new S3Client({
            region: 'auto',
            endpoint: `https://${(Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim()}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim(),
              secretAccessKey: (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim(),
            },
          });
          await r2Client.send(new PutObjectCommand({
            Bucket: (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim(),
            Key: fileName,
            Body: imgBytes,
            ContentType: contentType,
          }));
          const publicBase = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');
          persistentUrl = `${publicBase}/${fileName}`;
          console.log('✅ Re-uploaded to R2:', persistentUrl);
        }
      } catch (e) {
        console.warn('Re-upload to R2 failed (non-fatal, using KIE URL):', e.message);
      }
    } else {
      console.log('⏱ Skipping re-upload — not enough time left');
    }

    // ── STEP 10: Save ─────────────────────────────────────────────
    try {
      await base44.entities.ThumbnailConcepts.update(concept_id, {
        image_url: persistentUrl, status: 'complete', is_selected: true,
      });
      console.log('✅ Saved');
    } catch (e) { console.warn('Save error:', e.message); }

    return Response.json({
      success: true,
      image_url: persistentUrl,
      concept_id,
      model_used: model,
      post_processing: { upscaled: finalUrl !== imageUrl, mood_graded: mood, original_url: imageUrl },
    });

  } catch (error) {
    console.error('generateNewThumbnailImage error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});