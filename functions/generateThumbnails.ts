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
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-text-to-image", {
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
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-text-to-image", {
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
    const [brandResult, topicResult, scriptResult, projectResult] = await Promise.allSettled([
      base44.entities.BrandIdentities.list(),
      base44.entities.Topics.filter({ project_id }),
      base44.entities.Scripts.filter({ project_id }),
      base44.asServiceRole.entities.Projects.filter({ id: project_id })
    ]);

    let visualStyle = 'cinematic_realistic';
    let projectNiche = '';
    if (projectResult.status === 'fulfilled' && projectResult.value[0]) {
      visualStyle = projectResult.value[0].visual_style || 'cinematic_realistic';
      projectNiche = projectResult.value[0].niche || '';
    }

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

    const prompt = `You are the world's #1 YouTube thumbnail designer. You study what makes thumbnails generate millions of clicks by analyzing top creators like MrBeast, Veritasium, The Futur, and niche-specific channels.

VIDEO TITLE: "${video_title}"
VIDEO NICHE: ${projectNiche || 'general'}
VISUAL STYLE: ${visualStyle}
BRAND TONE: ${thumbTone}
${brandColors ? `BRAND COLORS: ${brandColors}` : ''}
${topicContext ? `VIDEO CONTEXT: ${topicContext}` : ''}
${scriptSection}

CHANNEL TYPE: Faceless documentary/educational — uses "${visualStyle}" visual style for videos
IMAGE MODEL: Ideogram V3 (renders text natively — put text in "quotation marks")
DIMENSIONS: 1920x1080 Full HD, 16:9 widescreen landscape

═══════════════════════════════════════
STEP 1: UNDERSTAND THE VIDEO
═══════════════════════════════════════
Before designing anything, extract from the title${scriptContext ? ', context, and script' : ' and context'}:

1. CORE SUBJECT: What is this video actually about in 5 words?
2. KEY VISUAL MOMENT: The single most visually powerful scene or concept from the script
3. EMOTIONAL CORE: What should the viewer FEEL? (curiosity, fear, excitement, wonder, urgency, hope)
4. NICHE OBJECTS: 3-5 physical items viewers of this niche immediately recognize
5. TITLE KEYWORDS: The 2-3 most important words from the video title that MUST appear or be reflected in the thumbnail

═══════════════════════════════════════
THUMBNAIL FORMAT TYPES (use variety)
═══════════════════════════════════════
Study these real formats from top-performing channels:

FORMAT A — BOLD TEXT + OBJECT (like Veritasium "Asbestos", "White Gold", "$400,000,000"):
- ONE powerful word or number dominates 40-60% of frame
- Relevant object/scene fills background
- Minimal design, maximum impact
- Text IS the thumbnail

FORMAT B — BEFORE/AFTER CONTRAST (split screen, then vs now):
- Left side: before state. Right side: after state
- Arrow or divider between them
- Bold contrasting colors (red vs green, dark vs bright)
- Works for transformation stories, comparisons, reveals

FORMAT C — CHARACTER + BOLD OVERLAY (like The Futur "PACKAGE IT RIGHT", "NO MORE MAYBES"):
- Character/person prominently placed (use the video's visual style character — ${visualStyle === 'skeleton_protagonist' ? 'the transparent glass skeleton' : visualStyle.includes('cartoon') || visualStyle.includes('low_poly') ? 'the cartoon/animated character' : 'a relevant person or figure'})
- 2-4 word bold text overlay that captures the video's main point
- Simple solid or gradient background
- Text relates directly to the video title

FORMAT D — DATA/NUMBER SHOCK (like "$50,000 RULE", "100K TO 1M", "50K TO 100K"):
- A specific number, dollar amount, or statistic dominates
- Supporting visual (chart, money, object) provides context
- Works for finance, science, business content
- Number extracted from script or title

FORMAT E — QUESTION/CHALLENGE (like "WHY BUY?", "Am I Retiring?"):
- A provocative question from the title or script
- Character looking puzzled, thinking, or reacting
- Clean background, text is large and readable
- Creates immediate curiosity

FORMAT F — SCENE SNAPSHOT (key moment from the story):
- The single most dramatic visual moment from the script
- Rendered in the video's visual style (${visualStyle})
- Minimal or no text — the scene tells the story
- Cinematic composition, movie-poster quality

FORMAT G — SYMBOLIC OBJECT (like the glowing key, the mousetrap, the cracking foundation):
- One powerful symbolic object fills the frame
- Dramatic lighting, shallow depth of field
- 1-2 words of text if needed
- Object represents the video's core concept

FORMAT H — DIAGRAM/EXPLAINER (arrows, labels, simple visual logic):
- Simple visual explanation of the video's concept
- Arrows, comparison boxes, labeled elements
- Clean, educational feel
- Works for how-to, explainer, step-by-step content

═══════════════════════════════════════
VISUAL STYLE MATCHING
═══════════════════════════════════════
CRITICAL: The thumbnail must match the video's visual style.

${({
  skeleton_protagonist: `SKELETON PROTAGONIST STYLE:
- The transparent glass skeleton with ivory bones and expressive brown/amber eyeballs should appear in thumbnails where characters are needed
- Show the skeleton interacting with the topic (holding objects, in dramatic situations, reacting to events)
- The skeleton IS the brand — viewers recognize it instantly
- Full body or waist-up, never just a skull. Always with expressive amber eyeballs
- Combine skeleton with bold text overlays and photorealistic environments for maximum impact
- Other people in frame should be photorealistic humans contrasting with the glass skeleton`,

  cinematic_realistic: `CINEMATIC REALISTIC STYLE:
- Photorealistic compositions with Hollywood-grade cinematic lighting
- Dramatic three-point lighting, rim light separation, volumetric atmosphere
- Characters look like real people in movie stills — skin texture, real clothing, natural hair
- Text overlays should feel like movie titles or documentary title cards
- Moody color grading: teal and orange, warm amber, cool blue`,

  photorealistic_4k: `PHOTOREALISTIC 4K STYLE:
- DSLR photograph quality — razor sharp, natural lighting, editorial feel
- Characters and objects look like professional National Geographic photography
- Clean, real, no stylization — the power comes from reality itself
- Text overlays should be clean and modern, like magazine covers or news graphics
- Natural color palette, no dramatic color grading`,

  anime: `ANIME STYLE:
- Studio Ghibli meets modern anime — vibrant colors, expressive eyes, clean linework
- Characters have anime proportions: large eyes, stylized hair, cel-shaded skin
- Backgrounds are painted anime art with atmospheric perspective
- Text can be bold and colorful, matching anime energy — think manga title pages
- Vivid saturated colors, dramatic expressions, dynamic poses`,

  cinematic_anime: `CINEMATIC ANIME STYLE:
- Makoto Shinkai / Ufotable quality — dramatic god rays, ultra-detailed backgrounds
- Anime characters with cinematic lighting: rim lights, volumetric atmosphere, rich color grading
- Widescreen epic compositions, film grain overlay, anamorphic lens feel
- Text overlays should feel like anime movie posters — bold, dramatic, integrated into the scene
- Deep shadows, vibrant highlights, atmospheric depth`,

  cartoon_2d: `2D CARTOON STYLE:
- Bold clean outlines, vibrant flat colors, Cartoon Network / Disney Channel quality
- Characters with exaggerated proportions, big expressive faces, dynamic poses
- Playful simplified backgrounds with bright cheerful colors
- Text overlays should be big, bold, fun — matching cartoon energy with thick outlines
- Think: educational cartoon channels with character + bold text + simple colorful scene`,

  picstory_cocomelon: `COCOMELON / KIDS 3D STYLE:
- Adorable soft rounded 3D characters with big eyes, pastel colors, toy-like proportions
- Warm studio lighting, cheerful atmosphere, child-safe wholesome imagery
- Smooth plastic-like textures, gentle soft shadows
- Text overlays should be friendly, rounded fonts, bright primary colors
- Nursery rhyme aesthetic — parents should feel safe clicking`,

  cinematic_picstory: `CINEMATIC PIXAR STYLE:
- Pixar / DreamWorks quality 3D characters with dramatic studio lighting
- Expressive stylized faces, subsurface scattering on skin, rich color grading
- Depth of field with bokeh, volumetric atmosphere, emotional cinematography
- Text overlays should feel like animated movie posters — polished and professional
- Think: Pixar movie poster energy with a thumbnail's boldness`,

  oil_painting: `OIL PAINTING STYLE:
- Visible thick impasto brushstrokes, rich pigment texture, museum masterpiece quality
- Classical fine art composition with Rembrandt chiaroscuro lighting
- Warm varnish glow, painterly soft edges, canvas grain visible
- Text overlays should feel like gallery exhibition titles — elegant yet bold
- Deep rich colors, warm tones, classical drama`,

  watercolor: `WATERCOLOR STYLE:
- Soft translucent washes on textured paper, visible paper grain, delicate bleeding edges
- Gentle color harmonies, luminous transparency where white paper shows through
- Botanical illustration quality, soft and ethereal atmosphere
- Text overlays should be clean and modern to contrast with the soft painterly background
- Pastel and gentle tones, dreamy atmospheric quality`,

  comic_book: `COMIC BOOK STYLE:
- Bold black ink outlines, halftone dot shading, vibrant saturated colors
- Marvel / DC Comics quality — dynamic action poses, dramatic foreshortening
- Strong action lines, Ben-Day dots, professional sequential art energy
- Text overlays should feel like comic book title cards — bold, impactful, with action energy
- POW/BAM energy without being cheesy — dramatic and bold`,

  humpty_dumpty: `STORYBOOK ILLUSTRATION STYLE:
- Whimsical hand-drawn quality with gentle watercolor washes, fairy tale aesthetic
- Rounded friendly character designs, warm nostalgic nursery rhyme atmosphere
- Soft golden lighting, vintage children's book illustration quality
- Text overlays should feel like storybook titles — charming, warm, inviting
- Maurice Sendak / Beatrix Potter inspired warmth`,

  harry_potter: `MAGICAL FANTASY STYLE:
- Warm candlelight, gothic castle interiors, mysterious atmosphere
- Rich jewel-tone colors: deep burgundy, gold, emerald with magical golden particles
- Weathered leather and parchment textures, enchanted artifacts with luminous glow
- Text overlays should feel like magical inscriptions — gold text with ethereal glow effects
- Cozy yet mysterious British boarding school aesthetic`,

  '3d_whiteboard_cartoon': `3D WHITEBOARD CARTOON STYLE:
- Clean bold black ink outlines, flat cheerful color fills, YouTube explainer aesthetic
- Characters with friendly exaggerated proportions — larger heads, expressive eyes, simple noses
- Clean isometric environments, simplified recognizable settings
- Text overlays should be bold, clean, educational — like whiteboard annotations
- Approachable professional visual style — think popular finance/business explainer channels`,

  low_poly_3d_cartoon: `LOW-POLY 3D CARTOON STYLE:
- All geometry from visible flat-shaded polygons and triangular facets
- Exaggerated proportions: oversized heads, angular noses, large round expressive eyes
- Bright saturated colors, matte clay-toy quality, warm and inviting
- Text overlays should be bold and clean against the colorful low-poly backgrounds
- Think: the popular personal finance cartoon channels with character + big text + money visuals`
})[visualStyle] || `CINEMATIC STYLE:
- Professional photorealistic compositions with dramatic lighting
- Moody, cinematic, movie-quality feel
- Text overlays should feel like movie titles
- Strong color grading and atmospheric depth`}

═══════════════════════════════════════
TEXT OVERLAY RULES
═══════════════════════════════════════
1. MAX 4 words (ideal: 2-3). ALL CAPS.
2. Text must DIRECTLY relate to the video title — a viewer should connect the thumbnail text to the title
3. Use the video title's own keywords when possible, not generic shock words
4. BANNED generic text: "THEY LIED", "IT'S OVER", "SHOCKING", "YOU WON'T BELIEVE" (unless the title literally says this)
5. GOOD text examples tied to titles:
   - Title "How Mortgages Really Work" → Text: "YOUR MORTGAGE" or "30 YEAR TRAP" or "NOT YOURS"
   - Title "Why Diamond Drills Cost Millions" → Text: "$2M DRILL" or "DIAMOND CORE" or "WHY SO MUCH?"
   - Title "The Psychology Behind Buying" → Text: "WHY BUY?" or "YOUR BRAIN" or "BUYING TRAP"
6. Text color: vivid (crimson, electric yellow, white, neon green, hot orange)
7. Text must have thick outline and drop shadow for readability
8. Font: Impact, Bebas Neue, or bold condensed sans-serif
9. Position: upper area preferred, never in bottom-right (YouTube timestamp zone)

═══════════════════════════════════════
COMPOSITION RULES
═══════════════════════════════════════
- Maximum 3 visual elements (subject + text + background)
- Dead zone: bottom-right quadrant always empty
- Text and subject in opposing areas of frame
- Background: simple, supports mood, never distracting
- NO hex codes, NO percentages, NO pixel values in prompts
- Use named colors and spatial language

═══════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════
{
  "video_analysis": {
    "core_subject": "5-word summary",
    "key_visual_moment": "most powerful scene from script",
    "emotional_core": "primary emotion",
    "niche_objects": ["obj1", "obj2", "obj3"],
    "title_keywords": ["word1", "word2"]
  },
  "thumbnails": [
    {
      "rank": 1,
      "format": "A/B/C/D/E/F/G/H",
      "concept_description": "What this thumbnail shows and why it works",
      "text_overlay": "MAX 4 WORDS CAPS",
      "title_connection": "How this text connects to the video title",
      "text_design": {
        "color": "vivid color name",
        "outline": "thick black outline",
        "shadow": "heavy drop shadow",
        "position": "upper-left / upper-center / across-center",
        "size": "massive / large",
        "font_style": "Impact / Bebas Neue / bold condensed"
      },
      "subject_design": {
        "description": "What appears in the thumbnail — using ${visualStyle} visual style",
        "position": "left-third / right-third / center",
        "style_match": "How this matches the video's ${visualStyle} style"
      },
      "background_design": {
        "color": "complementary to text color",
        "style": "gradient / solid / scene / blurred environment",
        "mood": "what it communicates"
      },
      "visual_metaphor": "Symbolic meaning if any",
      "color_scheme": "text color, accent color, background color",
      "style_reference": "cinematic / minimal / documentary / bold / educational",
      "ctr_score": 9,
      "why_it_works": "Why a viewer would click this",
      "faceless_adaptation": "How it works without a presenter face",
      "image_prompt": "200+ word Ideogram prompt. Start with: 1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail. Text in QUOTATION MARKS for Ideogram rendering. Use named colors, spatial language, NO hex codes. Describe the complete scene matching ${visualStyle} visual style.",
      "negative_prompt": "blurry, low quality, pixelated, watermark, distorted text, misspelled text, small text, cluttered, jpeg artifacts, text in bottom right"
    }
  ]
}

REQUIREMENTS:
- Generate 10 thumbnails using at least 5 DIFFERENT format types
- EVERY text overlay must connect to the video title (not generic outrage)
- EVERY thumbnail must match the "${visualStyle}" visual style where characters appear
- At least 3 thumbnails should feature the video's character style (${visualStyle === 'skeleton_protagonist' ? 'the glass skeleton' : 'the video character'})
- Include at least 1 data/number format, 1 question format, and 1 scene snapshot
- All text must be readable, bold, and properly contrasted against background
- Dead zone (bottom-right) clear on all concepts
- Variety in formats, colors, compositions, and emotional approaches

Generate 10 thumbnails now.`;

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