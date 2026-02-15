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
    
    // Clean common JSON issues from LLM output
    jsonStr = jsonStr
      .replace(/[\x00-\x1F\x7F]/g, (ch) => ch === '\n' || ch === '\r' || ch === '\t' ? ch : ' ')  // remove control chars
      .replace(/,\s*([}\]])/g, '$1')  // remove trailing commas
      .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');  // fix missing commas between properties
    
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON parse failed, attempting repair. Error:", e.message);
      // Try to extract just the array/object structure
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) {
        return JSON.parse(objMatch[0]);
      }
      throw new Error("Failed to parse Gemini response as JSON: " + e.message);
    }
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

    const rawStyle = project.visual_style || 'cinematic_realistic';
    // Never use children's styles for thumbnails - override to cinematic
    const childStyles = ['picstory_cocomelon', 'cartoon_2d'];
    const visualStyle = childStyles.includes(rawStyle) ? 'cinematic_realistic' : rawStyle;

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
You must deeply analyze this script and produce 3 THUMBNAIL CONCEPT BLUEPRINTS — exhaustive forensic-level visual descriptions of what each thumbnail should look like. These are NOT prompts yet — they are HYPER-DETAILED creative briefs.

For EACH concept, write a MINIMUM 300-word "forensic_description" covering:

=== WORLD-CLASS THUMBNAIL CHECKLIST (USE THIS AS YOUR YARDSTICK) ===
Every concept MUST pass ALL of these criteria. If it doesn't, redesign until it does:

1. CHARACTERS = ACTION, NOT PORTRAITS
   - Characters must be DOING something — holding, shielding, pointing, reacting — NOT just standing/floating
   - The hero should show a SPECIFIC emotion through body language: defiant stance, protective embrace, heartbroken gaze
   - Add micro-details that tell the story: a tear, a clenched fist, a protective hand on someone's shoulder
   - Villains/antagonists must feel THREATENING: looming, shadowy, faceless, pointing, larger than the hero
   - Characters must INTERACT with each other (eye contact, confrontation, turning away) — never both staring at camera ignoring each other

2. TEXT OVERLAY = CURIOSITY GAP, NOT FACT
   - Text must create a QUESTION the viewer needs answered, NOT state a fact or reveal the ending
   - Good: "HE DIDN'T LEAVE", "THEY LET HIM GO...", "THE LAST MARCH" — implies mystery
   - Bad: "CHOSE HIS CHILDREN" — gives away the story, no reason to click
   - Text MUST NOT cover faces or key subjects — place in negative space (bottom center, top edge)
   - Text must be the LARGEST, most readable element — visible at phone thumbnail size

3. COMPOSITION = "HEAVEN vs HELL" EXTREME CONTRAST
   - Use EXTREME color contrast between opposing sides (warm golden vs cold steel blue)
   - The "safe" side: warm golden glow, orange rim light, life/hope
   - The "danger" side: desaturated, cold blue/grey, ash, embers, destruction
   - Split line should feel VIOLENT — diagonal jagged rip, not a clean vertical line
   - Heavy vignette to force eye to center
   - HEAVY depth of field — backgrounds and secondary elements blurred, main subjects razor-sharp

4. SCROLL-STOP ELEMENTS
   - One dominant emotion must hit in 0.3 seconds
   - Visual "vectors" that force eye movement (a pointing finger, a gaze direction, a weapon)
   - The thumbnail must look NOTHING like an educational/textbook illustration — it must feel CINEMATIC and EMOTIONAL

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
- BODY ACTION: what are they DOING? (holding a child, shielding someone, pointing, running, clutching something) — never just standing
- Clothing: exact garment types, specific color names (not "red" but "deep crimson" or "blood red"), patterns, fabric texture
- Body angle, crop (extreme close-up head only, head-and-shoulders, chest up), facing direction
- Lighting ON them: key light direction, rim/edge light color and side, any colored light cast
- INTERACTION: how do they relate to other characters? Eye contact? Confrontation? Protection?

BACKGROUND:
- Setting derived from script's key locations
- Blur level: HEAVY Gaussian blur on backgrounds, razor-sharp foreground subjects
- Atmospheric effects (smoke, haze, particles, floating ash/embers, lens flare, God rays)
- Color palette: EXTREME warm vs cold contrast if split composition
- Vignette: heavy dark edges forcing eye to center

TEXT & GRAPHICS:
- The exact 2-4 word text overlay that creates a CURIOSITY GAP (question, not answer)
- Font: bold Impact or heavy condensed sans-serif, MASSIVE size
- Color: pure white with THICK black outline for maximum readability on any background
- Heavy drop shadow for depth
- Position: bottom center or top edge — NEVER covering faces/key subjects
- Any badges, banners, VS dividers, warning graphics

ASPECT RATIO (MANDATORY):
      - ALL thumbnails MUST be 16:9 landscape aspect ratio (1280x720)
      - The forensic description MUST note this is a widescreen landscape composition
      - Every visual element should be described in terms of a 16:9 wide frame

      OVERALL STYLING:
      - NEVER use children's illustration styles (cocomelon, cartoon) for thumbnails — always cinematic/dramatic
      - Must match the project's visual style "${visualStyle}" — if anime, the thumbnail should feel anime; if photorealistic, it should be hyper-real photography
      - Color grading: EXTREME contrast, high saturation on key elements, desaturated on opposing elements
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

Below are 3 FORENSIC VISUAL DESCRIPTIONS of thumbnail concepts. Your job is to transform EACH one into a PERFECT AI image generation prompt.

=== FORENSIC CONCEPT BLUEPRINTS ===
${JSON.stringify(phase1Result.concepts, null, 2)}

=== CRITICAL PROMPT RULES ===
Your "image_prompt" output must follow these rules STRICTLY:

GENERAL LANGUAGE:
- Think in VISUAL CONCEPTS and DESCRIPTIVE LANGUAGE, not CSS/code/measurements
- NEVER use percentages, pixel coordinates, opacity values, or hex color codes
- Use SPATIAL RELATIONSHIPS: "anchored at the top center", "filling the left third", "spanning the bottom edge"
- Use PHOTOGRAPHY LANGUAGE: "extreme close-up", "rim lighting on left profile", "shallow depth of field with heavy bokeh"
- Use ARCHETYPE descriptions: "bald man with intense expression and dark goatee" NOT "person"
- Use COLOR NAMES: "crimson red", "electric blue", "pure white" — never #FF0000

CHARACTERS MUST BE IN ACTION (CRITICAL):
- NEVER describe characters as just "standing" or "facing forward" — this creates static, boring, textbook thumbnails
- Every character MUST be performing an ACTION: holding, shielding, pointing, embracing, confronting, reacting
- Add emotional micro-details: "a single tear rolling down his weathered cheek", "his arm wrapped protectively around a small child"
- Villains/antagonists: make them LOOMING, SHADOWY, MENACING — larger than the hero, pointing, threatening
- Characters MUST interact: eye contact, confrontation, turning away — never both staring blankly at camera

TEXT OVERLAY (MOST IMPORTANT VISUAL ELEMENT):
- The text_overlay MUST be the SINGLE MOST PROMINENT graphic element in the thumbnail
- Describe text as a MASSIVE DESIGN UNIT: "enormous bold white Impact-style text reading 'EXACT WORDS' with very thick black outline and heavy drop shadow, positioned at bottom center of the frame"
- Text MUST create a CURIOSITY GAP — a question, NOT an answer. Never give away the story.
- Text must NEVER overlap faces or key subjects — always in negative space
- Text must be READABLE at phone thumbnail size — this means HUGE, high-contrast, minimal words (2-4 max)
- Include "graphic design composition" to force flat 2D text overlays

COLOR & CONTRAST (THE "HEAVEN VS HELL" APPROACH):
- Use EXTREME warm vs cold color contrast for split compositions
- "Safe" side: warm golden lighting, orange rim light, hope
- "Danger" side: cold desaturated steel blue, dark grey, ash and embers
- Split lines should feel VIOLENT: "a jagged diagonal rip dividing the frame" not a clean line
- HEAVY vignette (dark edges) to force eye to center
- HEAVY depth of field: backgrounds blurred to creamy bokeh, foreground subjects RAZOR sharp

STYLE:
- Thumbnails should ALWAYS look cinematic and dramatic, NEVER educational or textbook-like
- Match the project visual style "${visualStyle}":
  ${visualStyle === 'anime' || visualStyle === 'cinematic_anime' ? '- Use dramatic anime style: cel-shaded, vibrant anime coloring, bold linework, dynamic emotional poses, dramatic lighting' : ''}
  ${visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic' ? '- Use hyper-real cinematic photography: 4K HDR, visible skin detail, DSLR shallow depth, dramatic movie-poster lighting' : ''}
  ${visualStyle === 'oil_painting' ? '- Use painterly keywords: visible brushstrokes, oil painting texture, chiaroscuro lighting, fine art quality, museum-worthy realism' : ''}
  ${visualStyle === 'watercolor' ? '- Use watercolor keywords: soft wet edges, translucent washes, paper texture, bleeding colors, delicate light' : ''}
  ${visualStyle === 'comic_book' ? '- Use comic keywords: halftone dots, bold ink outlines, dynamic action poses, pop art colors' : ''}

MANDATORY ASPECT RATIO: ALL image prompts MUST explicitly state "16:9 aspect ratio, 1280x720 resolution, widescreen landscape format" at the very beginning. Every thumbnail is a WIDE landscape composition, never square or portrait.

      Each prompt MUST be 300+ words incorporating EVERY detail from the forensic description.

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
      "image_prompt": "A COMPLETE 300+ word natural-language AI image prompt. MUST START WITH: 'A high-detail 4K YouTube thumbnail in 16:9 aspect ratio (1280x720), widescreen landscape format, graphic design composition featuring [COMPOSITION TYPE].' Then: STYLE: cinematic, dramatic, emotional storytelling (matching ${visualStyle} but NEVER childish/educational). FOREGROUND: [every subject IN ACTION — holding, shielding, confronting, protecting — with archetype, expression muscles, hair details, clothing color names, crop, facing, rim lighting, INTERACTION between characters]. MID-GROUND: [depth subjects with heavy blur]. BACKGROUND: [EXTREME warm vs cold contrast, heavy bokeh blur, atmospheric effects, ash/embers/smoke, dramatic lighting, heavy vignette darkening edges]. TEXT & GRAPHICS: [MASSIVE bold white Impact text reading 'CURIOSITY GAP WORDS' with very thick black outline and heavy drop shadow, positioned at BOTTOM CENTER in negative space — NEVER covering faces, must be the MOST prominent visual element]. SPLIT: [if split composition, use jagged diagonal rip not clean line]. NO percentages. NO hex codes. NO pixel values. MUST specify 16:9 widescreen."
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