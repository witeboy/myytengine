import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL CONCEPTS v3 — SCRIPT-ANCHORED SINGLE-CALL ENGINE
// ══════════════════════════════════════════════════════════════════
// 10 concepts × 3-Element Composition × Script Anchor Extraction
// Every thumbnail is visually anchored to the script's content.
//
// UPGRADE: Now loads final_aggregated script for anchor extraction.
// Text options require topic-specific words (6+ of 10).
// Subjects require anchor objects from the script.
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
  // Attempt 1: Ideogram V3 QUALITY
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

  // Attempt 2: Ideogram V3 BALANCED
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

  // Attempt 3: Flux 2 Pro
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
  if (!thumbnail.script_anchor_used || thumbnail.script_anchor_used === 'none') issues.push('No script anchor');
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

    // ══════════════════════════════════════════════════════════════
    // LOAD DATA (parallel) — now includes script for anchors
    // ══════════════════════════════════════════════════════════════
    const [brandResult, topicResult, scriptResult] = await Promise.allSettled([
      base44.entities.BrandIdentities.list(),
      base44.entities.Topics.filter({ project_id }),
      base44.entities.Scripts.filter({ project_id })
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

    // ── Load script for anchor extraction ──────────────────────────
    let scriptContext = '';
    if (scriptResult.status === 'fulfilled' && scriptResult.value.length > 0) {
      const script = scriptResult.value.find(s => s.version === 'final_aggregated')
        || scriptResult.value[0];
      const content = script.full_script
        || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
      scriptContext = content.substring(0, 3000);
    }

    console.log('══════════════════════════════════════════════════════');
    console.log('THUMBNAIL CONCEPTS v3 (Script-Anchored 3-Element)');
    console.log(`Video: ${video_title}`);
    console.log(`Tone: ${thumbTone} | Script: ${scriptContext.length > 0 ? 'loaded' : 'title-only'}`);
    console.log(`Ideogram V3 → Flux 2`);
    console.log('══════════════════════════════════════════════════════');

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  SINGLE GEMINI CALL — Script-Anchored Three-Element Engine   ║
    // ║  Step 0: Script anchor extraction                            ║
    // ║  Step 1: 10 topic-specific text options                      ║
    // ║  Step 2: Anchor-driven visual compositions                   ║
    // ║  Step 3: 5-Block Ideogram prompts                            ║
    // ╚═══════════════════════════════════════════════════════════════╝

    const scriptSection = scriptContext
      ? `\n═══════════════════════════════════════
SCRIPT CONTENT (extract anchors from this):
═══════════════════════════════════════
${scriptContext}`
      : '';

    const prompt = `You are the world's #1 YouTube thumbnail psychologist, visual architect, and script analyst. You design using the THREE-ELEMENT COMPOSITION RULE used by MrBeast, Veritasium, and top creators. Every thumbnail you create is VISUALLY ANCHORED to the script's actual content.

VIDEO TITLE: "${video_title}"
BRAND TONE: ${thumbTone}
${brandColors ? `BRAND COLORS: ${brandColors}` : ''}
${brandStyle ? `BRAND STYLE: ${brandStyle}` : ''}
${topicContext ? `VIDEO CONTEXT: ${topicContext}` : ''}
${scriptSection}

CHANNEL TYPE: Faceless documentary/educational (no on-camera presenter)
IMAGE MODEL: Ideogram V3 (renders text natively — put text in "quotation marks")
DIMENSIONS: 1920x1080 Full HD, 16:9 widescreen landscape

═══════════════════════════════════════
STEP 0: SCRIPT ANCHOR EXTRACTION
═══════════════════════════════════════
Before designing ANY thumbnail, extract visual anchors from the title${scriptContext ? ', context, and script' : ' and context'}:

1. VILLAIN OBJECT: Physical thing causing harm (bank building, mortgage contract, credit card, algorithm, corporation, insurance denial, hidden fee, processed food, pharmaceutical company, etc.)
2. VICTIM OBJECT: Physical thing being harmed (family home, savings jar, paycheck, small business, retirement fund, health, neighborhood, childhood dream, etc.)
3. TRAP SYMBOL: Visual metaphor for the core trap (chains around house, cage around family, mousetrap with bait, sinking ship, cracking foundation, puppet strings, ticking time bomb, spider web, quicksand, etc.)
4. SHOCK DATA: Specific number/percentage/timeline that creates visceral reaction ("30 years", "crashed 40%", "$0 equity", "2008", "$500K interest", etc.) — extract from script if available, estimate from title if not
5. CONTRAST PAIR: Illusion vs reality (dream home vs foreclosure, safe investment vs crash, freedom vs 30 years debt, healthy label vs toxic ingredients, etc.)
6. NICHE OBJECTS: 3-5 physical items this niche's viewers immediately recognize (for finance: house keys, mortgage papers, bank vault, APPROVED/DENIED stamps, dollar bills; for health: pills, hospital bed, test results; for tech: phone screen, server rack, broken lock, etc.)

MANDATORY: At least ONE anchor object must be visible in EVERY thumbnail concept.
"Shocked face + THEY LIED" = generic outrage = 6% CTR.
"Shocked face gripping crumbling house deed + YOU OWN NOTHING" = specific fear = 12% CTR.

═══════════════════════════════════════
THE THREE-ELEMENT COMPOSITION RULE
═══════════════════════════════════════
Every thumbnail has EXACTLY 3 elements. More = cognitive overload = scroll past.
- ELEMENT 1 — SUBJECT: The image hook — MUST contain a script anchor object
- ELEMENT 2 — TEXT: The cognitive itch (1-3 scroll-stopping words, topic-specific)
- ELEMENT 3 — BACKGROUND: The visual separation layer (psychologically designed)

═══════════════════════════════════════
ELEMENT 2 — TEXT RULES (TOPIC-SPECIFIC)
═══════════════════════════════════════

PSYCHOLOGICAL CATEGORIES (use variety across 10 concepts):

A — ANCHOR-SPECIFIC CURIOSITY GAP (4 of 10):
Reference the villain_object or victim_object without fully explaining.
- GOOD for mortgage: "YOU OWN NOTHING", "BANK'S HOUSE", "NOT YOURS"
- GOOD for health: "YOUR DOCTOR KNEW", "PILL TRAP", "WRONG DOSE"
- BAD (generic): "THEY LIED", "THEY KNEW", "IT'S OVER"

B — ANCHOR-SPECIFIC FORBIDDEN KNOWLEDGE (3 of 10):
Reference the trap_symbol or shock_data.
- GOOD for mortgage: "30 YEAR TRAP", "FAKE EQUITY", "$0 YOURS"
- GOOD for diet: "POISON LABEL", "FDA LIED", "NOT FOOD"
- BAD (generic): "STOP WATCHING", "I WAS WRONG"

C — ANCHOR-SPECIFIC SHOCK / CONTRADICTION (3 of 10):
State the illusion from the contrast_pair to create dissonance.
- GOOD for mortgage: "DREAM HOME?", "SAFE INVESTMENT?"
- BAD (generic): "IT'S FAKE", "THEY AGREED"

HARD RULES:
1. MAX 3 WORDS (ideal: 2). Never exceed 4.
2. ALL CAPS always
3. Never reveal the full answer
4. BANNED: "AMAZING", "INCREDIBLE", "YOU WON'T BELIEVE", "SHOCKING TRUTH"
5. Power verbs: STOP, HIDE, BROKE, LIED, KNEW, LEFT, GONE, CAUGHT, LEAKED, EXPOSED, TRAP, OWN, STOLE, FAKE
6. Pronouns > names EXCEPT when the entity IS the hook: "THE BANK LIED" > "THEY LIED" for finance
7. Positive topic? FLIP negative
8. Must hint at specific topic even without context
9. TOPIC ANCHOR RULE: At least 6 of 10 text options MUST contain a word from the video's specific subject matter. Pure emotion-only text limited to MAX 4 of 10.
10. SPECIFICITY TEST: "Would this work on 50 different videos?" If YES → too generic → rewrite.

TEXT COLOR + BACKGROUND COLOR PAIR (mandatory):
| Text Color | Background MUST Be | Never As BG |
|---|---|---|
| Vivid crimson red | Deep teal / dark cyan | YouTube red, black |
| Electric neon yellow | Deep purple / violet | White, grey |
| Pure white | Rich teal / deep navy | YouTube white/grey |
| Hot amber orange | Deep indigo / cobalt | Red, grey |
| Neon lime green | Deep magenta / dark berry | Black |

TEXT DESIGN: color, outline (very thick black / dark navy), shadow (heavy drop shadow / colored glow), container (raw/banner/stamp/badge/glow), position (upper-left/upper-center/bottom-center/across-center), size (massive/large), font (Impact/Bebas Neue/bold condensed)

═══════════════════════════════════════
ELEMENT 1 — SUBJECT RULES (WITH ANCHOR)
═══════════════════════════════════════

SUBJECT HOOK TYPES (MUST include script anchor object):

- exaggerated_emotion_WITH_ANCHOR: Extreme close-up face WITH script-relevant object visible — holding it, reflected in eyes, looming behind, being crushed by it. Face = emotion. Anchor = topic context. "Shocked face" alone = REJECTED. "Shocked face gripping [villain_object]" = APPROVED.
- scale_shock_WITH_ANCHOR: villain_object or trap_symbol at unnatural scale next to victim_object. Giant bank stamp crushing tiny house. Massive chain around small family.
- anchor_object_spotlight: villain_object or trap_symbol as dramatic hero, lit like evidence. Mortgage contract with glowing clause, house keys in mousetrap, sinking house.
- environmental_anchor: contrast_pair as split environment. Left: dream. Right: nightmare. Above: pristine. Below: rotting.
- For FACELESS channels: objects, symbolic items, environments, hands gripping anchor objects, silhouettes with anchor props — the anchor IS the subject.

POSITIONING — RULE OF THIRDS:
- LEFT or RIGHT vertical third line — NEVER center
- Subject and text in OPPOSING quadrants

═══════════════════════════════════════
ELEMENT 3 — BACKGROUND RULES
═══════════════════════════════════════

5 MANDATORY QUESTIONS:
1. COLOR: From complementary pair table (opposite of text)
2. BLUR: Heavy Gaussian / cinematic bokeh
3. VIGNETTE: Heavy dark edges ALL sides
4. PSYCHOLOGY: What it communicates (danger=embers, mystery=fog, wealth=gold, isolation=emptiness)
5. ANCHOR ECHO: Can a subtle anchor appear in background? (faint house silhouette in fog, chain texture in vignette, faint dollar signs in bokeh) — reinforces topic WITHOUT a 4th element
6. AVOIDANCE: No pure RED, WHITE, or dark GREY backgrounds

═══════════════════════════════════════
DEAD ZONE ENFORCEMENT
═══════════════════════════════════════
BOTTOM-RIGHT QUADRANT: Always empty. YouTube timestamp zone.
All critical elements in UPPER TWO-THIRDS and LEFT TWO-THIRDS.

═══════════════════════════════════════
CONCEPT TYPES (use ALL 10):
═══════════════════════════════════════
A=REVELATION, B=WARNING, C=COMPARISON, D=EMOTION CLOSE-UP, E=DATA SHOCK,
F=FORBIDDEN, G=TRANSFORMATION, H=SYMBOL, I=ENVIRONMENT, J=ABSTRACT METAPHOR

═══════════════════════════════════════
IMAGE PROMPT — 5-BLOCK STRUCTURE
═══════════════════════════════════════

BLOCK 1 — OPENING:
"1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail with exactly three visual elements — one subject containing a [anchor type] visual anchor, one bold text overlay, one psychologically designed background. Graphic design composition with bold typography."

BLOCK 2 — TEXT (write FIRST — the star):
"Dominant text: massive bold [font] text reading "[EXACT WORDS]" in [text_color_name] with [outline] and [shadow], [container if any], positioned at [position], filling [one-third for 2 words / one-quarter for 3 words] of frame width. Area behind text is [background_color_pair] ensuring readability."

BLOCK 3 — SUBJECT WITH ANCHOR (opposite to text):
"Subject on [left-third / right-third] gridline: [description by hook_type]:
- exaggerated_emotion_WITH_ANCHOR: extreme close-up of [archetype] with [facial muscles], [eye direction]. CRITICALLY: [anchor object described — what it is, how it's integrated: gripped in hands, visible over shoulder, looming behind, reflected in eyes]. The [anchor] identifies this as a [topic] video. [Lighting details].
- scale_shock_WITH_ANCHOR: [anchor at unnatural scale] next to [reference]. Size difference immediately jarring. Anchor connects to specific topic.
- anchor_object_spotlight: [anchor as hero object] in razor-sharp focus, dramatic lighting, everything else blurred. Object tells the story.
- environmental_anchor: [contrast_pair split] with extreme depth. Environment IS the story.
For faceless: anchor objects, symbolic items, hands, silhouettes, environments."

BLOCK 4 — BACKGROUND WITH ANCHOR ECHO:
"Background: dominant [background_color_pair] [gradient/wash]. Heavy Gaussian blur creating bokeh depth. [Atmosphere: smoke/embers/fog/particles]. [Anchor echo: subtle anchor silhouette/texture through atmosphere]. Heavy vignette all edges. No YouTube UI colors."

BLOCK 5 — STYLE + DEAD ZONE:
"Cinematic dramatic lighting. Bottom-right quadrant clear. All critical visuals in upper two-thirds and left two-thirds. Ultra high resolution, professional quality."

RULES: NO hex codes. NO percentages. NO pixel values. Named colors + spatial language. 200+ words per prompt. Three elements + anchor. Text in "QUOTATION MARKS" for Ideogram.

═══════════════════════════════════════
OUTPUT FORMAT (EXACT JSON)
═══════════════════════════════════════

{
  "script_anchors": {
    "villain_object": "specific physical villain",
    "victim_object": "specific physical victim",
    "trap_symbol": "visual metaphor described visually",
    "shock_data": "specific number/percentage/timeline",
    "contrast_pair": { "illusion": "what people believe", "reality": "what's true" },
    "niche_objects": ["obj1", "obj2", "obj3", "obj4", "obj5"]
  },
  "ctr_strategy": "Overall psychological approach anchored to script content",
  "thumbnails": [
    {
      "rank": 1,
      "concept_type": "revelation/warning/comparison/emotion_closeup/data_shock/forbidden/transformation/symbol/environment/abstract",
      "psychological_trigger": "curiosity_gap/fear/forbidden_knowledge/social_proof/emotional_contrast",
      "text_category": "curiosity_gap / forbidden_knowledge / shock_contradiction",
      "concept_description": "Three elements + anchor working together",
      "text_overlay": "MAX 3 WORDS IN CAPS",
      "topic_anchor_word": "The topic-specific word in this text, or 'emotion_only'",
      "specificity_test_passed": true,
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
        "hook_type": "exaggerated_emotion_WITH_ANCHOR / scale_shock_WITH_ANCHOR / anchor_object_spotlight / environmental_anchor",
        "description": "Subject + anchor object — both described",
        "anchor_object": "The specific script anchor visible",
        "anchor_placement": "held / reflected / looming / over shoulder / hero object / split environment",
        "grid_position": "left-third / right-third",
        "eye_direction": "at camera / at anchor / at text",
        "crop": "extreme close-up / chest-up / wide"
      },
      "background_design": {
        "dominant_color": "complementary color from pair table",
        "blur": "heavy Gaussian bokeh",
        "vignette": "heavy all edges",
        "atmosphere": "smoke / embers / fog / particles / gold shimmer / vast emptiness / clean",
        "anchor_echo": "subtle anchor silhouette/texture/pattern or none",
        "psychological_purpose": "danger / mystery / wealth / isolation / revelation / urgency"
      },
      "script_anchor_used": "villain_object / victim_object / trap_symbol / shock_data / contrast_pair",
      "anchor_placement": "How anchor appears in subject + background",
      "topic_identifiable_without_text": "Can viewer identify topic from image alone? YES + reason / NO",
      "background_color_pair": "text color ON background color",
      "focal_point": "Primary visual anchor point",
      "visual_metaphor": "Symbolic meaning",
      "color_scheme": "3 named colors: text, subject accent, background",
      "style_reference": "cinematic / minimal / documentary / dramatic / gritty",
      "ctr_score": 9,
      "why_it_stops_scrolling": "Psychological mechanism — which bias + how anchor makes it topic-specific",
      "faceless_adaptation": "How it works without a presenter face — what anchor replaces the face",
      "dead_zone_clear": true,
      "three_element_count": 3,
      "image_prompt": "200+ words: Block 1 (opening+anchor type) → Block 2 (text in quotes) → Block 3 (subject WITH anchor object described) → Block 4 (background+anchor echo) → Block 5 (style+dead zone). Named colors. Spatial language.",
      "negative_prompt": "blurry, low quality, pixelated, watermark, distorted text, misspelled text, illegible text, small text, text overlap on face, more than three visual elements, cluttered, pure red background, pure white background, dark grey background, jpeg artifacts, text in bottom right, generic expression without context object, no topic anchor visible"
    }
  ]
}

REQUIREMENTS:
- FIRST extract script_anchors, THEN design all 10 concepts using those anchors
- ALL 10 concepts use ALL 10 different concept types
- EVERY concept has a visible script anchor object in the subject or background
- EVERY image_prompt follows the 5-BLOCK structure with anchor in Block 3
- EVERY text_overlay is MAX 3 words, ALL CAPS, topic-specific
- At least 6 of 10 text overlays contain a topic-specific word (not emotion-only)
- EVERY background uses complementary color pair + optional anchor echo
- EVERY concept scores 8+ CTR
- Dead zone (bottom-right) clear on ALL concepts
- Text and subject in OPPOSING quadrants on ALL concepts
- Faceless channel — no presenter faces. Anchor objects, symbolic items, environments instead.
- Variety: different text categories, subject hooks, background atmospheres, anchor objects

Generate 10 premium script-anchored thumbnail concepts now.`;

    const result = await safeGeminiCall(prompt, 0.9);

    if (!result.success) {
      console.error('Gemini failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.thumbnails || !Array.isArray(result.data.thumbnails)) {
      return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });
    }

    const anchors = result.data.script_anchors || {};
    console.log(`Script Anchors: villain=${anchors.villain_object} | victim=${anchors.victim_object} | trap=${anchors.trap_symbol}`);

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

      const designSummary = `TEXT: ${td.color || 'white'} ${td.container || 'raw'} @ ${td.position || 'upper-left'} | SUBJ: ${sd.hook_type || 'emotion'} @ ${sd.grid_position || 'right-third'} anchor:${sd.anchor_object || 'none'} [${sd.anchor_placement || ''}] | BG: ${bd.dominant_color || 'teal'} ${bd.atmosphere || 'clean'} echo:${bd.anchor_echo || 'none'} [${bd.psychological_purpose || 'drama'}]`;

      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id,
          rank: t.rank || i + 1,
          concept_type: t.concept_type || 'revelation',
          psychological_trigger: t.psychological_trigger || 'curiosity_gap',
          concept_description: `${t.concept_description || ''}\n\n🏷️ Anchor: ${t.script_anchor_used || 'none'} (${sd.anchor_object || 'none'} — ${sd.anchor_placement || 'none'})\n📐 3-Element: ${designSummary}\n🛑 ${t.why_it_stops_scrolling || ''}\n👁️ Topic visible without text: ${t.topic_identifiable_without_text || 'unknown'}`,
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

        console.log(`✓ Concept ${t.rank}: [${t.concept_type}] "${t.text_overlay}" | anchor:${sd.anchor_object || 'none'} @ ${sd.anchor_placement || '?'} | ${bd.dominant_color || '?'} BG | CTR:${t.ctr_score}`);
        return {
          success: true,
          record,
          imagePrompt,
          negativePrompt: t.negative_prompt || "blurry, low quality, pixelated, watermark, distorted text, misspelled text, small text, cluttered, more than three elements, pure red background, pure white background, dark grey background, jpeg artifacts, text in bottom right, generic expression without context"
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
    const topicAnchoredTexts = result.data.thumbnails.filter(t => t.topic_anchor_word && t.topic_anchor_word !== 'emotion_only').length;

    console.log('══════════════════════════════════════════════════════');
    console.log(`Anchors: villain=${anchors.villain_object} | victim=${anchors.victim_object} | trap=${anchors.trap_symbol}`);
    console.log(`Concepts: ${successfullySaved.length} | Images: ${imagesGenerated}`);
    console.log(`Topic-anchored texts: ${topicAnchoredTexts}/10 | Skipped: ${skipped.length} | Warnings: ${qualityWarnings}`);
    console.log(`Strategy: ${result.data.ctr_strategy}`);
    console.log(`Architecture: Script-Anchored × 3-Element × 5-Block × Color Blocking`);
    console.log('══════════════════════════════════════════════════════');

    return Response.json({
      success: true,
      thumbnails,
      script_anchors: anchors,
      meta: {
        ctr_strategy: result.data.ctr_strategy,
        total_generated: result.data.thumbnails.length,
        total_saved: successfullySaved.length,
        total_images: imagesGenerated,
        total_skipped: skipped.length,
        quality_warnings: qualityWarnings,
        topic_anchored_texts: topicAnchoredTexts,
        architecture: "script-anchored, 3-element composition, 5-block Ideogram prompts, color blocking, dead zone, anchor echo",
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