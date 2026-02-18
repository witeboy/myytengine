import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// KIE AI IMAGE GENERATION (Ideogram V3 + Flux 2 fallback)
// ══════════════════════════════════════════════════════════════════
const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

async function kieCreateTask(apiKey, model, input) {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, input })
  });
  const result = await res.json();
  if (!res.ok || result.code !== 200) {
    throw new Error(`Kie createTask (${model}): ${result.msg || JSON.stringify(result)}`);
  }
  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const poll = await res.json();
    if (poll.code !== 200) continue;
    const state = poll.data?.state;
    if (state === "success") {
      const rj = JSON.parse(poll.data.resultJson || "{}");
      return rj.resultUrls?.[0] || rj.url || rj.imageUrl || null;
    }
    if (state === "fail") throw new Error(poll.data?.failMsg || "Task failed");
  }
  throw new Error(`Task ${taskId} timed out`);
}

async function generateThumbnailImage(apiKey, imagePrompt, negativePrompt) {
  try {
    console.log(`[Ideogram V3] Generating...`);
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-generate", {
      prompt: `${imagePrompt}. Ultra high resolution 1920x1080 Full HD, crisp sharp details, professional quality.`,
      image_size: "landscape_16_9",
      style: "DESIGN",
      rendering_speed: "QUALITY",
      expand_prompt: false,
      negative_prompt: negativePrompt || "blurry, low quality, pixelated, watermark, low resolution, compressed, artifacts"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-generate" };
  } catch (e) { console.warn(`Ideogram V3 failed: ${e.message}`); }

  try {
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-generate", {
      prompt: `${imagePrompt.substring(0, 800)}. 1920x1080 Full HD, professional YouTube thumbnail.`,
      image_size: "landscape_16_9",
      style: "DESIGN",
      rendering_speed: "BALANCED",
      expand_prompt: false,
      negative_prompt: negativePrompt || "blurry, low quality, pixelated, watermark"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-generate (simplified)" };
  } catch (e) { console.warn(`Ideogram simplified failed: ${e.message}`); }

  try {
    console.log(`[Flux 2 Pro] Fallback...`);
    const taskId = await kieCreateTask(apiKey, "flux-2/pro-text-to-image", {
      prompt: `${imagePrompt}. Ultra high resolution 1920x1080 Full HD, crisp details.`,
      aspect_ratio: "16:9",
      resolution: "2K"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "flux-2/pro-text-to-image" };
  } catch (e) { console.warn(`Flux 2 failed: ${e.message}`); }

  return { url: null, model: "none" };
}

// ══════════════════════════════════════════════════════════════════
// GEMINI HELPER
// ══════════════════════════════════════════════════════════════════
function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();
    if (!data.candidates?.length) throw new Error("No candidates from Gemini");

    const text = data.candidates[0].content.parts[0].text;

    try { return { success: true, data: JSON.parse(text) }; } catch (_) {}
    try { return { success: true, data: JSON.parse(repairJSON(text)) }; } catch (_) {}

    let jsonStr = text;
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

    try { return { success: true, data: JSON.parse(repairJSON(jsonStr)) }; } catch (_) {}

    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) return { success: true, data: JSON.parse(objMatch[0]) };

    throw new Error("Failed to parse Gemini JSON");
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// VALIDATION
// ══════════════════════════════════════════════════════════════════
function validateThumbnail(thumbnail) {
  const issues = [];
  if (!thumbnail.image_prompt || thumbnail.image_prompt.length < 100) issues.push('Prompt too short');
  if (!thumbnail.text_overlay || thumbnail.text_overlay.trim().length === 0) issues.push('Missing text');
  if (thumbnail.text_overlay && thumbnail.text_overlay.split(' ').length > 5) issues.push('Text >5 words');
  if (!thumbnail.ctr_score || thumbnail.ctr_score < 1 || thumbnail.ctr_score > 10) issues.push('Invalid CTR');
  return { valid: issues.length === 0, issues };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, video_title } = body;

    if (!project_id || !video_title) {
      return Response.json({ error: 'Missing required fields: project_id, video_title' }, { status: 400 });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    // Load context in parallel
    const [brandResult, topicResult] = await Promise.allSettled([
      base44.entities.BrandIdentities.list(),
      base44.entities.Topics.filter({ project_id })
    ]);

    let thumbTone = 'cinematic documentary';
    let brandColors = '';
    let brandStyle = '';
    if (brandResult.status === 'fulfilled') {
      const brand = brandResult.value.find(b => b.project_id === project_id);
      if (brand) {
        thumbTone = brand.thumbnail_tone || thumbTone;
        brandColors = brand.color_palette || '';
        brandStyle = brand.visual_style || '';
      }
    }

    let topicContext = '';
    if (topicResult.status === 'fulfilled') {
      const topic = topicResult.value.find(t => t.is_selected === true);
      topicContext = topic?.description || '';
    }

    console.log('══════════════════════════════════════════════════════');
    console.log('THUMBNAIL CONCEPTS (3-Element Composition Engine)');
    console.log(`Video: ${video_title}`);
    console.log(`Tone: ${thumbTone} | Ideogram V3 → Flux 2`);
    console.log('══════════════════════════════════════════════════════');

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  SINGLE GEMINI CALL — Full Three-Element Framework           ║
    // ║  Text Engine + Visual Composition + Background Psychology     ║
    // ║  + Dead Zone + Color Blocking + 5-Block Prompt Structure     ║
    // ╚═══════════════════════════════════════════════════════════════╝

    const prompt = `You are the world's #1 YouTube thumbnail psychologist and visual architect. You design using the THREE-ELEMENT COMPOSITION RULE used by MrBeast, Veritasium, and top creators.

VIDEO TITLE: "${video_title}"
BRAND TONE: ${thumbTone}
${brandColors ? `BRAND COLORS: ${brandColors}` : ''}
${brandStyle ? `BRAND STYLE: ${brandStyle}` : ''}
${topicContext ? `VIDEO CONTEXT: ${topicContext}` : ''}

CHANNEL TYPE: Faceless documentary/educational (no on-camera presenter)
IMAGE MODEL: Ideogram V3 (renders text natively — put text in "quotation marks")
DIMENSIONS: 1920x1080 Full HD, 16:9 widescreen landscape

═══════════════════════════════════════
THE THREE-ELEMENT COMPOSITION RULE
═══════════════════════════════════════
Every thumbnail has EXACTLY 3 elements. More = cognitive overload = scroll past.
- ELEMENT 1 — SUBJECT: The image hook (face, object, environment)
- ELEMENT 2 — TEXT: The cognitive itch (1-3 scroll-stopping words)
- ELEMENT 3 — BACKGROUND: The visual separation layer (psychologically designed)

Each element serves: Contrast, Context, or Constraint. If it doesn't — delete it.

═══════════════════════════════════════
ELEMENT 2 — TEXT RULES (THE STAR)
═══════════════════════════════════════

PSYCHOLOGICAL CATEGORIES (use variety across 10 concepts):
A — CURIOSITY GAP: Incomplete thoughts demanding resolution. "THEY KNEW...", "HE DIDN'T LEAVE"
B — FORBIDDEN / NEGATIVE FRAMING: Loss aversion. "STOP DOING THIS", "I WAS WRONG", "THEY HID THIS"
C — SHOCK / CONTRADICTION: Cognitive dissonance. "IT'S FAKE", "HE SMILED", "ONLY $1"

HARD RULES:
1. MAX 3 WORDS (ideal: 2). Never exceed 4.
2. ALL CAPS always
3. Never reveal the answer — tease, never tell
4. BANNED: "AMAZING", "INCREDIBLE", "YOU WON'T BELIEVE", "SHOCKING TRUTH"
5. Power verbs: STOP, HIDE, BROKE, LIED, KNEW, LEFT, GONE, CAUGHT, LEAKED, EXPOSED
6. Pronouns > names: "THEY KNEW" > "THE CEO KNEW"
7. Positive topic? FLIP negative: "How to save" → "YOU'RE WASTING IT"
8. Must work WITHOUT any context

TEXT COLOR + BACKGROUND COLOR PAIR (mandatory):
The text color DETERMINES the background color. These are complementary opposites for maximum contrast:

| Text Color | Background MUST Be | NEVER Use As BG |
|---|---|---|
| Vivid crimson red | Deep teal / dark cyan | YouTube red, pure black |
| Electric neon yellow | Deep purple / violet | White, grey |
| Pure white | Rich teal / deep navy | YouTube white/grey |
| Hot amber orange | Deep indigo / cobalt | Red (too close), grey |
| Neon lime green | Deep magenta / dark berry | Black (too generic) |

TEXT DESIGN: Specify for each — color name, outline, shadow, container (raw/banner/stamp/badge/glow), position (upper-left/upper-center/bottom-center/across-center), size (massive/large), font (Impact/Bebas Neue/bold condensed)

═══════════════════════════════════════
ELEMENT 1 — SUBJECT RULES (THE HOOK)
═══════════════════════════════════════

SUBJECT HOOK TYPES (pick best per concept):
- exaggerated_emotion: Extreme close-up face. Wide eyes, open mouth, furrowed brow. CTR +35%. Eyes at camera or at mystery element.
- scale_shock: Unnaturally large/small object next to reference. Instant visual intrigue.
- mystery_object: Single unexplained object in sharp focus. Viewer thinks "what IS that?"
- environmental_stakes: Location tells the story (empty room, burning building, dark vault)

POSITIONING — RULE OF THIRDS:
- Subject on LEFT or RIGHT vertical third line — NEVER dead center (centered = amateur)
- Subject and text in OPPOSING quadrants (subject right → text left)
- For faceless: objects, hands, silhouettes, environments, symbolic items

═══════════════════════════════════════
ELEMENT 3 — BACKGROUND RULES (THE SEPARATOR)
═══════════════════════════════════════

THIS IS NOT FILLER. The background is a designed psychological element.

5 MANDATORY QUESTIONS every background answers:
1. COLOR: Dominant color from the complementary pair table above (opposite of text)
2. BLUR: Heavy Gaussian blur / cinematic bokeh — creates 3D depth, forces eye to subject + text
3. VIGNETTE: Heavy dark edges ALL four sides — tunnels vision to center
4. PSYCHOLOGY: What it communicates (danger=embers/smoke, mystery=fog, wealth=gold particles, isolation=vast emptiness, urgency=red haze)
5. AVOIDANCE: NEVER use YouTube UI colors as dominant BG:
   - No pure RED (YouTube subscribe button)
   - No pure WHITE (YouTube light mode)
   - No dark GREY (YouTube dark mode)

═══════════════════════════════════════
DEAD ZONE ENFORCEMENT
═══════════════════════════════════════
- BOTTOM-RIGHT QUADRANT: Always empty. YouTube places timestamp here.
- All critical elements in UPPER TWO-THIRDS and LEFT TWO-THIRDS.

═══════════════════════════════════════
THUMBNAIL PSYCHOLOGY TRIGGERS
═══════════════════════════════════════
1. CURIOSITY GAP: Incomplete visuals + text creating unanswered questions
2. FEAR/WARNING: Danger, loss — red dominance, warning symbols
3. FORBIDDEN KNOWLEDGE: Classified/suppressed info revealed
4. SOCIAL PROOF/STATUS: Insider knowledge, winners vs losers
5. EMOTIONAL CONTRAST: Visceral dissonance between elements

CONCEPT TYPES (use ALL 10 across concepts):
A=REVELATION, B=WARNING, C=COMPARISON, D=EMOTION CLOSE-UP, E=DATA SHOCK,
F=FORBIDDEN, G=TRANSFORMATION, H=SYMBOL, I=ENVIRONMENT, J=ABSTRACT METAPHOR

═══════════════════════════════════════
IMAGE PROMPT — 5-BLOCK STRUCTURE
═══════════════════════════════════════
Every image_prompt MUST follow this EXACT 5-block structure:

BLOCK 1 — OPENING:
"1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail with exactly three visual elements — one subject, one bold text overlay, one psychologically designed background. Graphic design composition with bold typography."

BLOCK 2 — TEXT (write FIRST — it's the star):
"Dominant text: massive bold [font] text reading "[EXACT WORDS]" in [text_color_name] with [outline] and [shadow], [container if any], positioned at [position], filling approximately [one-third for 2 words / one-quarter for 3 words] of frame width. Area behind text is [background_color_pair] ensuring readability. No overlap with subject."

BLOCK 3 — SUBJECT (positioned OPPOSITE to text):
"Subject on [left-third / right-third] gridline: [description based on hook_type — extreme close-up face with specific emotions / unnaturally scaled object / mystery object in sharp focus / dramatic environment]. [Eye direction / lighting / crop details]. Creates visual tension with the text."

BLOCK 4 — BACKGROUND (psychological layer):
"Background: dominant [background_color_pair] [gradient/wash]. Heavy Gaussian blur creating bokeh depth. [Atmospheric: smoke/embers/fog/particles based on psychological purpose]. Heavy vignette darkening all edges, tunneling eye to center. Avoids YouTube UI colors."

BLOCK 5 — STYLE + DEAD ZONE:
"Cinematic dramatic lighting. Bottom-right quadrant clear of all elements (YouTube timestamp zone). All critical visuals in upper two-thirds and left two-thirds. Ultra high resolution, crisp sharp details, professional quality."

RULES: NO hex codes. NO percentages. NO pixel values. Named colors + spatial language only. 200+ words per prompt. Three elements only — no clutter.

═══════════════════════════════════════
OUTPUT FORMAT (EXACT JSON)
═══════════════════════════════════════

{
  "ctr_strategy": "Overall psychological approach across all 10 concepts",
  "thumbnails": [
    {
      "rank": 1,
      "concept_type": "revelation/warning/comparison/emotion_closeup/data_shock/forbidden/transformation/symbol/environment/abstract",
      "psychological_trigger": "curiosity_gap/fear/forbidden_knowledge/social_proof/emotional_contrast",
      "text_category": "curiosity_gap / forbidden_knowledge / shock_contradiction",
      "concept_description": "Why this stops scrolling — the three elements working together",
      "text_overlay": "MAX 3 WORDS IN CAPS",
      "text_design": {
        "color": "vivid color name",
        "outline": "very thick black / thick dark navy",
        "shadow": "heavy black drop shadow / colored glow",
        "container": "raw / banner / stamp / badge / glow",
        "container_color": "color name or null",
        "position": "upper-left / upper-center / bottom-center / across-center",
        "size": "massive / large",
        "font_style": "Impact / Bebas Neue / bold condensed sans-serif"
      },
      "subject_design": {
        "hook_type": "exaggerated_emotion / scale_shock / mystery_object / environmental_stakes",
        "description": "What the subject is and what makes it a scroll-stopper",
        "grid_position": "left-third / right-third",
        "eye_direction": "at camera / at text / at mystery element",
        "crop": "extreme close-up / chest-up / wide"
      },
      "background_design": {
        "dominant_color": "complementary color from pair table",
        "blur": "heavy Gaussian bokeh",
        "vignette": "heavy all edges",
        "atmosphere": "smoke / embers / fog / particles / gold shimmer / vast emptiness / clean",
        "psychological_purpose": "danger / mystery / wealth / isolation / revelation / urgency"
      },
      "background_color_pair": "text color ON background color",
      "focal_point": "Primary visual anchor",
      "visual_metaphor": "Symbolic meaning",
      "color_scheme": "3 named colors: text, subject accent, background",
      "style_reference": "cinematic / minimal / documentary / dramatic / gritty",
      "ctr_score": 9,
      "why_it_stops_scrolling": "Psychological mechanism — which bias it exploits",
      "faceless_adaptation": "How it works without a presenter face",
      "dead_zone_clear": true,
      "three_element_count": 3,
      "image_prompt": "200+ word prompt following 5-BLOCK structure: Opening → Text (in quotation marks) → Subject (on third line, opposing text) → Background (complementary color, blur, vignette, atmosphere, psychology) → Style + Dead Zone. Three elements only. Named colors. Spatial language.",
      "negative_prompt": "blurry, low quality, pixelated, watermark, low resolution, compressed, distorted text, misspelled text, illegible text, small text, text overlap on face, more than three visual elements, cluttered, pure red background, pure white background, dark grey background, jpeg artifacts, text in bottom right"
    }
  ]
}

REQUIREMENTS:
- Generate ALL 10 concepts using ALL 10 different concept types
- EVERY image_prompt follows the 5-BLOCK structure
- EVERY concept has exactly 3 elements (subject + text + background)
- EVERY text_overlay is MAX 3 words (2 ideal), ALL CAPS, scroll-stopping
- EVERY background uses the complementary color pair (not generic "dark")
- EVERY concept scores 8+ CTR
- Dead zone (bottom-right) clear on ALL concepts
- Text and subject in OPPOSING quadrants on ALL concepts
- Faceless channel — no presenter faces
- Use variety: different text categories, subject hooks, background atmospheres

Generate 10 premium viral thumbnail concepts now.`;

    const result = await safeGeminiCall(prompt, 0.9);

    if (!result.success) {
      console.error('Gemini failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.thumbnails || !Array.isArray(result.data.thumbnails)) {
      return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });
    }

    // ══════════════════════════════════════════════════════════════
    // DELETE EXISTING (parallel)
    // ══════════════════════════════════════════════════════════════
    try {
      const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
      await Promise.all(existing.map(e => base44.entities.ThumbnailConcepts.delete(e.id)));
    } catch (delErr) {
      console.warn('Delete existing failed:', delErr.message);
    }

    // ══════════════════════════════════════════════════════════════
    // SAVE CONCEPTS (parallel)
    // ══════════════════════════════════════════════════════════════
    const thumbnails = [];
    const skipped = [];
    let qualityWarnings = 0;

    const savePromises = result.data.thumbnails.map(async (t, i) => {
      const validation = validateThumbnail(t);
      if (!validation.valid) {
        qualityWarnings++;
        console.warn(`Thumbnail ${t.rank} issues: ${validation.issues.join(', ')}`);
      }

      let imagePrompt = t.image_prompt || '';
      if (!imagePrompt.includes('1920x1080') && !imagePrompt.includes('16:9')) {
        imagePrompt = `1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail with three visual elements. ${imagePrompt}`;
      }
      if (!imagePrompt.toLowerCase().includes('crisp sharp details')) {
        imagePrompt += '. Ultra high resolution, crisp sharp details, professional quality.';
      }

      const td = t.text_design || {};
      const sd = t.subject_design || {};
      const bd = t.background_design || {};

      const designSummary = `TEXT: ${td.color || 'white'} ${td.container || 'raw'} @ ${td.position || 'upper-left'} | SUBJ: ${sd.hook_type || 'emotion'} @ ${sd.grid_position || 'right-third'} | BG: ${bd.dominant_color || 'teal'} ${bd.atmosphere || 'clean'} [${bd.psychological_purpose || 'drama'}]`;

      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id,
          rank: t.rank || i + 1,
          concept_type: t.concept_type || 'revelation',
          psychological_trigger: t.psychological_trigger || 'curiosity_gap',
          concept_description: `${t.concept_description || ''}\n\n📐 3-Element: ${designSummary}\n🛑 ${t.why_it_stops_scrolling || ''}`,
          focal_point: t.focal_point || '',
          visual_metaphor: t.visual_metaphor || '',
          color_scheme: `${t.color_scheme || ''} | ${t.background_color_pair || ''}`,
          text_overlay: t.text_overlay || '',
          text_style: `${td.color || 'white'} | ${td.outline || 'black outline'} | ${td.shadow || 'drop shadow'} | ${td.container || 'raw'}${td.container_color ? ` (${td.container_color})` : ''} | ${td.position || 'upper-left'} | ${td.size || 'massive'} | ${td.font_style || 'Impact'}`,
          style_reference: t.style_reference || 'cinematic',
          ctr_score: t.ctr_score || 7,
          why_it_stops_scrolling: t.why_it_stops_scrolling || '',
          faceless_adaptation: t.faceless_adaptation || '',
          ab_test_alternative: '',
          image_prompt: imagePrompt,
          quality_valid: validation.valid,
          is_selected: false
        });

        console.log(`✓ Concept ${t.rank}: [${t.concept_type}] "${t.text_overlay}" | ${sd.hook_type} on ${sd.grid_position} | ${bd.dominant_color} BG | CTR:${t.ctr_score}`);
        return {
          success: true,
          record,
          imagePrompt,
          negativePrompt: t.negative_prompt || "blurry, low quality, pixelated, watermark, distorted text, misspelled text, small text, cluttered, more than three elements, pure red background, pure white background, dark grey background, jpeg artifacts, text in bottom right"
        };
      } catch (saveErr) {
        console.error(`✗ Save failed concept ${t.rank}:`, saveErr.message);
        skipped.push({ rank: t.rank, error: saveErr.message });
        return { success: false };
      }
    });

    const savedResults = await Promise.all(savePromises);
    const successfullySaved = savedResults.filter(r => r.success);

    // ══════════════════════════════════════════════════════════════
    // GENERATE IMAGES (parallel)
    // ══════════════════════════════════════════════════════════════
    console.log(`\n═══ Generating ${successfullySaved.length} thumbnail images ═══`);

    const imagePromises = successfullySaved.map(async (saved) => {
      const { record, imagePrompt, negativePrompt } = saved;
      try {
        const { url, model } = await generateThumbnailImage(KIE_API_KEY, imagePrompt, negativePrompt);
        if (url) {
          await base44.asServiceRole.entities.ThumbnailConcepts.update(record.id, { image_url: url });
          console.log(`✓ Image rank ${record.rank} via ${model}`);
          thumbnails.push({ ...record, image_url: url, model_used: model });
        } else {
          console.warn(`✗ No image rank ${record.rank}`);
          thumbnails.push({ ...record, image_url: null, model_used: 'failed' });
        }
      } catch (imgErr) {
        console.error(`✗ Image error rank ${record.rank}:`, imgErr.message);
        thumbnails.push({ ...record, image_url: null, model_used: 'error' });
      }
    });

    await Promise.all(imagePromises);

    try {
      await base44.entities.Projects.update(project_id, { current_step: 12 });
    } catch (updateErr) {
      console.warn('Failed to update project step:', updateErr.message);
    }

    const imagesGenerated = thumbnails.filter(t => t.image_url).length;

    console.log('══════════════════════════════════════════════════════');
    console.log(`Concepts: ${successfullySaved.length} | Images: ${imagesGenerated}`);
    console.log(`Skipped: ${skipped.length} | Quality warnings: ${qualityWarnings}`);
    console.log(`Strategy: ${result.data.ctr_strategy}`);
    console.log(`Architecture: 3-Element × 5-Block × Color Blocking`);
    console.log('══════════════════════════════════════════════════════');

    return Response.json({
      success: true,
      thumbnails,
      meta: {
        ctr_strategy: result.data.ctr_strategy,
        total_generated: result.data.thumbnails.length,
        total_saved: successfullySaved.length,
        total_images: imagesGenerated,
        total_skipped: skipped.length,
        quality_warnings: qualityWarnings,
        architecture: "3-element composition, 5-block Ideogram prompts, color blocking, dead zone enforcement",
        image_model_primary: "ideogram/v3-generate",
        image_model_fallback: "flux-2/pro-text-to-image",
        dimensions: "1920x1080",
        skipped_details: skipped
      }
    });

  } catch (error) {
    console.error('generateThumbnailConcepts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});