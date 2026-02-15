import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function safeGeminiCall(prompt, temperature = 0.8, maxTokens = 16384, retries = 3) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens }
        })
      }
    );

    if (response.status === 429) {
      const waitMs = Math.pow(2, attempt + 1) * 5000; // 10s, 20s, 40s
      console.log(`Rate limited, waiting ${waitMs/1000}s before retry ${attempt + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) throw new Error("No candidates from Gemini");
    const text = data.candidates[0].content.parts[0].text;
    let jsonStr = text;
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();
    return JSON.parse(jsonStr);
  }
  
  throw new Error("Gemini API rate limit exceeded after retries. Please try again in a minute.");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, reference_style } = await req.json();

    const project = await base44.entities.Projects.get(project_id);
    const script = await base44.entities.Scripts.get(project.script_id);
    const topic = await base44.entities.Topics.get(project.selected_topic_id);

    // Gather script content
    const scriptContent = script.full_script || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
    const truncatedScript = scriptContent.substring(0, 4000);

    // Gather visual style & scene info for context
    let sceneContext = '';
    try {
      const scenes = await base44.entities.Scenes.filter({ project_id });
      if (scenes.length > 0) {
        const sortedScenes = scenes.sort((a, b) => a.scene_number - b.scene_number);
        const sceneSnippets = sortedScenes.slice(0, 5).map(s => 
          `Scene ${s.scene_number}: ${s.image_prompt || s.narration_text || ''}`
        ).join('\n');
        sceneContext = `\n\nSCENE VISUAL PROMPTS (from the generated content — use these as style reference):\n${sceneSnippets}`;
      }
    } catch (e) {
      // No scenes available, continue without
    }

    // Gather brand identity if available
    let brandContext = '';
    try {
      const brands = await base44.entities.BrandIdentities.filter({ project_id });
      if (brands.length > 0) {
        const b = brands[0];
        brandContext = `\n\nBRAND IDENTITY:\n- Thumbnail tone: ${b.thumbnail_tone || 'cinematic'}\n- Colors: ${b.color_primary || ''} / ${b.color_secondary || ''} / ${b.color_accent || ''}\n- Visual rules: ${b.visual_rules || ''}`;
      }
    } catch (e) {
      // No brand, continue
    }

    const styleInstruction = reference_style 
      ? `\n\nIMPORTANT — REFERENCE STYLE FROM IMPORTED THUMBNAIL:\nYou MUST replicate this EXACT visual style, layout, and composition:\n${reference_style}\nAdapt subjects and text to THIS video's content but keep IDENTICAL composition, rim lighting, depth, text treatment, aesthetic.`
      : '';

    const visualStyle = project.visual_style || 'cinematic_realistic';

    // ============================================================
    // PHASE 1: Deep forensic-level description of the IDEAL thumbnail
    // ============================================================
    const phase1Prompt = `You are the world's #1 YouTube thumbnail conceptualizer with expertise in viral content across ALL niches.

VIDEO TOPIC: "${topic.title}"
VIDEO TITLE: "${script.title}"
NICHE: "${project.niche}"
VISUAL STYLE used in this project's content: "${visualStyle}"
VIDEO ORIENTATION: "${project.orientation || 'landscape'}"
${brandContext}
${sceneContext}
${styleInstruction}

FULL SCRIPT (find the most shocking, emotional, curiosity-inducing, visually compelling moments):
${truncatedScript}

=== YOUR MISSION ===
You must deeply analyze this script and produce 10 THUMBNAIL CONCEPT BLUEPRINTS — exhaustive forensic-level visual descriptions of what each thumbnail should look like. These are NOT prompts yet — they are HYPER-DETAILED creative briefs.

For EACH concept, write a MINIMUM 300-word "forensic_description" covering:

NARRATIVE HOOK:
- What specific moment/reveal/conflict from the script does this thumbnail capture?
- What is the curiosity gap — what question does the viewer NEED answered?
- What emotion should hit the viewer in 0.3 seconds?

COMPOSITION & LAYOUT:
- Exact layout type (split-screen face-off, centered hero, the reveal, the contrast, the warning, bold statement)
- What occupies each zone: top-left, center, bottom-right, etc.
- Visual hierarchy: what is BIGGEST and most eye-catching, what supports it
- Any diagonal lines, V-shapes, triangular compositions

EVERY SUBJECT/PERSON/CHARACTER (based on the script's characters):
- Full archetype: age range, build, skin tone shade, face shape, jawline
- Hair: style, color shade, texture, length
- Expression: which facial muscles are engaged (furrowed brow, wide eyes, clenched jaw, open mouth shock)
- Clothing: exact garment types, specific color names (not "red" but "deep crimson" or "blood red"), patterns, fabric texture
- Body angle, crop (extreme close-up head only, head-and-shoulders, chest up), facing direction
- Lighting ON them: key light direction, rim/edge light color and side, any colored light cast

BACKGROUND:
- Setting derived from script's key locations
- Blur level, atmospheric effects (smoke, haze, particles, lens flare, God rays)
- Color palette of the background, light sources, mood lighting
- Vignette, gradient directions

TEXT & GRAPHICS:
- The exact 2-4 word text overlay that creates maximum curiosity/shock
- Font weight, style family concept
- Color of text, outline treatment, shadow, glow
- Any badges, banners, VS dividers, warning graphics
- Position as spatial relationship

ASPECT RATIO (MANDATORY):
      - ALL thumbnails MUST be 16:9 landscape aspect ratio (1280x720)
      - The forensic description MUST note this is a widescreen landscape composition
      - Every visual element should be described in terms of a 16:9 wide frame

      OVERALL STYLING:
      - Must match the project's visual style "${visualStyle}" — if anime, the thumbnail should feel anime; if photorealistic, it should be hyper-real photography
      - Color grading, contrast level, saturation approach
      - Render quality keywords

RESPOND IN THIS EXACT JSON:
{
  "concepts": [
    {
      "rank": 1,
      "template_type": "Face-Off / The Reveal / The Contrast / The Reaction / Bold Statement / The Mystery / The Warning",
      "narrative_moment": "Which specific script moment this captures and WHY it's the most clickable",
      "curiosity_gap": "The question the viewer must click to answer",
      "emotional_trigger": "The primary emotion in 0.3 seconds",
      "scroll_stop_reason": "1 sentence why NO ONE scrolls past this",
      "text_overlay": "2-4 word text (HUGE, readable at thumbnail size)",
      "forensic_description": "300+ word exhaustive visual description covering every element: exact composition, every subject archetype with face/hair/expression/clothing/lighting details, background setting with atmosphere, text design, color grading, and style matching the project's visual style"
    }
  ]
}`;

    console.log("Phase 1: Generating forensic concept descriptions...");
    const phase1Result = await safeGeminiCall(phase1Prompt, 0.95, 16384);

    // Brief pause between phases to avoid rate limiting
    await new Promise(r => setTimeout(r, 3000));

    // ============================================================
    // PHASE 2: Transform each forensic description into an AI image prompt
    // ============================================================
    const phase2Prompt = `You are the world's #1 AI image prompt engineer specializing in YouTube thumbnails.

Below are 10 FORENSIC VISUAL DESCRIPTIONS of thumbnail concepts. Your job is to transform EACH one into a PERFECT AI image generation prompt.

=== FORENSIC CONCEPT BLUEPRINTS ===
${JSON.stringify(phase1Result.concepts, null, 2)}

=== CRITICAL PROMPT RULES ===
Your "image_prompt" output must follow these rules STRICTLY:
- Think in VISUAL CONCEPTS and DESCRIPTIVE LANGUAGE, not CSS/code/measurements
- NEVER use percentages, pixel coordinates, opacity values, or hex color codes
- Use SPATIAL RELATIONSHIPS: "anchored at the top center", "filling the left third", "spanning the bottom edge"
- Use PHOTOGRAPHY LANGUAGE: "extreme close-up", "rim lighting on left profile", "shallow depth of field with heavy bokeh"
- Use ARCHETYPE descriptions: "bald man with intense expression and dark goatee" NOT "person"
- Use COLOR NAMES: "crimson red", "electric blue", "pure white" — never #FF0000
- Describe text+container as ONE design unit: "a red pill-shaped badge containing white bold text 'LIVE'"
- MAX 2-3 text elements. AI generates garbled text with more.
- Include "graphic design composition" to force flat 2D text overlays
- Include depth cues: "smaller in frame showing distance" not percentages
- Include "extreme close-up cropped mid-chest up" not "110% height"
- Match the project visual style "${visualStyle}":
  ${visualStyle === 'anime' || visualStyle === 'cinematic_anime' ? '- Use anime/manga art style keywords: cel-shaded, vibrant anime coloring, bold linework, Studio Ghibli/MAPPA quality, anime character design' : ''}
  ${visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic' ? '- Use hyper-real photography keywords: 4K HDR, visible skin pores, DSLR quality, natural light physics, photojournalistic realism' : ''}
  ${visualStyle === 'cartoon_2d' || visualStyle === 'picstory_cocomelon' ? '- Use cartoon illustration keywords: bold outlines, flat shading, bright saturated colors, children-friendly illustration style' : ''}
  ${visualStyle === 'oil_painting' ? '- Use painterly keywords: visible brushstrokes, oil painting texture, chiaroscuro lighting, fine art quality, museum-worthy realism' : ''}
  ${visualStyle === 'watercolor' ? '- Use watercolor keywords: soft wet edges, translucent washes, paper texture, bleeding colors, delicate light' : ''}
  ${visualStyle === 'comic_book' ? '- Use comic keywords: halftone dots, bold ink outlines, dynamic action poses, speech bubbles, pop art colors' : ''}

MANDATORY ASPECT RATIO: ALL image prompts MUST explicitly state "16:9 aspect ratio, 1280x720 resolution, widescreen landscape format" at the very beginning. Every thumbnail is a WIDE landscape composition, never square or portrait.

      Each prompt MUST be 250+ words incorporating EVERY detail from the forensic description.

      RESPOND IN THIS EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "template_type": "from Phase 1",
      "concept_description": "2-3 sentence concept summary",
      "emotional_hook": "What emotion this triggers and WHY it stops scrolling",
      "scroll_stop_reason": "1 sentence",
      "text_overlay": "exact text from Phase 1",
      "font_style": "heavy Impact / bold condensed sans-serif / etc",
      "font_color": "white with thick black outline",
      "font_effects": "thick black outline, heavy drop shadow — described in words",
      "background_description": "Natural language: blurred dark setting with atmospheric effects",
      "subject_description": "All subject archetypes with physical details, expressions, clothing",
      "accent_color": "the eye-catching color name (crimson red, electric blue, etc)",
      "color_scheme": "Overall approach: warm saturated, cold moody, high contrast vivid",
      "visual_effects": "rim lighting on profiles, heavy bokeh background, lens flare, vignette",
      "style_reference": "cinema / minimal / documentary",
      "ctr_score": 9,
      "image_prompt": "A COMPLETE 250+ word natural-language AI image prompt. MUST START WITH: 'A high-detail 4K YouTube thumbnail in 16:9 aspect ratio (1280x720), widescreen landscape format, graphic design composition featuring [COMPOSITION TYPE]. [STYLE matching ${visualStyle}]. FOREGROUND: [every subject with archetype, expression muscles, hair details, clothing color names, crop, facing, rim lighting]. MID-GROUND: [depth subjects]. BACKGROUND: [blurred setting with mood, atmosphere, light sources, colors]. TEXT & GRAPHICS: [main text as single design unit with font and effects]. [Any badges/banners as single units]. STYLE: [render quality keywords matching ${visualStyle}].' NO percentages. NO hex codes. NO pixel values. MUST specify 16:9 widescreen."
    }
  ]
}`;

    console.log("Phase 2: Generating AI image prompts from forensic descriptions...");
    const phase2Result = await safeGeminiCall(phase2Prompt, 0.85, 16384);

    // Delete existing thumbnails for this project
    const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
    for (const e of existing) {
      await base44.entities.ThumbnailConcepts.delete(e.id);
    }

    // Save the concepts
    const thumbnails = [];
    for (const t of phase2Result.thumbnails) {
      const styleRef = (t.style_reference || 'cinema').split('/')[0].trim().toLowerCase();
      const validStyles = ['cinema', 'minimal', 'documentary'];
      
      const record = await base44.entities.ThumbnailConcepts.create({
        project_id,
        rank: t.rank,
        concept_description: `[${t.template_type}] ${t.concept_description}\n\n🎯 Hook: ${t.emotional_hook}\n🛑 Scroll-stop: ${t.scroll_stop_reason}`,
        facial_expression: t.subject_description,
        visual_metaphor: t.template_type,
        color_scheme: `${t.color_scheme} | Accent: ${t.accent_color} | ${t.font_color} | Effects: ${t.visual_effects}`,
        text_overlay: t.text_overlay,
        style_reference: validStyles.includes(styleRef) ? styleRef : 'cinema',
        ctr_score: t.ctr_score,
        image_prompt: t.image_prompt,
        is_selected: false
      });
      thumbnails.push(record);
    }

    return Response.json({ success: true, thumbnails });
  } catch (error) {
    console.error("generateThumbnailsFromScript error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});