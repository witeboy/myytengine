import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE PROMPT GENERATOR
// ══════════════════════════════════════════════════════════════════
// Pipeline: Script → Scene Breakdown → [THIS] → Image Gen → Animation
//
// Reads director notes from image_prompt field (DIRECTOR_NOTES: prefix)
// Converts to production-ready image + animation prompts
// All batches processed in a single call — no cross-call state
// ══════════════════════════════════════════════════════════════════

const BATCH_SIZE = 12; // Scenes per Gemini call

function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

async function callGemini(prompt, temperature = 0.7, maxTokens = 16384, retries = 3) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: "application/json" }
          })
        }
      );

      if (response.status === 429) {
        const waitMs = Math.pow(2, attempt + 1) * 5000;
        console.log(`Rate limited, waiting ${waitMs / 1000}s...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
      }

      const data = await response.json();
      if (!data.candidates?.length) throw new Error("No candidates from Gemini");
      const rawText = data.candidates[0].content.parts[0].text;

      // 3-stage JSON parsing
      try { return JSON.parse(rawText); } catch (_) {}
      try { return JSON.parse(repairJSON(rawText)); } catch (_) {}

      let jsonStr = rawText;
      if (rawText.includes("```json")) jsonStr = rawText.split("```json")[1].split("```")[0].trim();
      else if (rawText.includes("```")) jsonStr = rawText.split("```")[1].split("```")[0].trim();
      try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}

      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }

      // Truncation recovery
      const lastBrace = rawText.lastIndexOf('}');
      if (lastBrace > 0) {
        const trimmed = rawText.substring(0, lastBrace + 1);
        for (const suffix of [']}', '}]}', '']) {
          try {
            const parsed = JSON.parse(trimmed + suffix);
            if (parsed.prompts && Array.isArray(parsed.prompts)) return parsed;
          } catch (_) {}
        }
      }

      throw new Error("Failed to parse Gemini JSON after recovery");
    } catch (error) {
      if (attempt === retries - 1) throw error;
      console.warn(`Attempt ${attempt + 1} failed: ${error.message}, retrying...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// EXTRACT DIRECTOR NOTES FROM image_prompt
// ══════════════════════════════════════════════════════════════════

function extractDirectorNotes(imagePrompt) {
  if (!imagePrompt) return null;
  if (imagePrompt.startsWith('DIRECTOR_NOTES:')) {
    try {
      return JSON.parse(imagePrompt.substring('DIRECTOR_NOTES:'.length));
    } catch (_) {
      console.warn('Failed to parse director notes from image_prompt');
      return null;
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════
// VISUAL STYLE MAP
// ══════════════════════════════════════════════════════════════════

const styleMap = {
  cinematic_realistic: {
    positive: "Cinematic film still shot on ARRI Alexa 65 with anamorphic Panavision lenses, beautiful lens flare and chromatic aberration, shallow depth of field f/1.4 with creamy bokeh, dramatic three-point lighting with hard key light and soft fill, strong rim light separation, color graded with professional teal and orange LUT, subtle Kodak Vision3 film grain texture, volumetric god rays through atmosphere, Hollywood blockbuster cinematography, photorealistic rendering, 8K resolution",
    reinforcement: "STYLE LOCK: photorealistic cinematic film still, real actors, real lighting, ARRI camera, Kodak film grain",
    antiStyle: "NOT a cartoon, NOT illustration, NOT anime, NOT painting, NOT 2D, NOT 3D render, NOT CGI. Photorealistic only",
    negative: "cartoon, anime, illustration, painting, drawing, sketch, 3D render, CGI, video game, cel shaded, flat colors, clipart, comic book, manga, stylized, amateur, low quality, blurry, distorted, deformed, oversaturated"
  },
  photorealistic_4k: {
    positive: "Ultra-photorealistic DSLR photograph shot on Canon EOS R5 with RF 85mm f/1.2 L lens, razor-sharp focus, natural ambient lighting, professional color grading, editorial photography for National Geographic, visible skin texture and pores, accurate shadows and highlights, real-world proportions, zero AI artifacts, 8K RAW quality",
    reinforcement: "STYLE LOCK: ultra-photorealistic DSLR photograph, real people, visible pores, natural light, Canon RAW quality",
    antiStyle: "NOT a cartoon, NOT illustration, NOT anime, NOT painting, NOT 3D render, NOT CGI. Photograph only",
    negative: "cartoon, anime, CGI, 3D render, painting, digital art, stylized, unrealistic, soft focus, beauty filter, over-processed, HDR overdone"
  },
  cinematic_anime: {
    positive: "Cinematic anime illustration in the signature style of Makoto Shinkai and Ufotable studio, dramatic volumetric god rays with atmospheric scattering, incredibly detailed background art with painted clouds, film-grain overlay texture, anime characters with semi-realistic proportions, dynamic dramatic camera angle with depth, beautiful depth of field bokeh, award-winning anime film quality",
    reinforcement: "STYLE LOCK: cinematic anime illustration, Makoto Shinkai style, anime proportions, cel-shaded, painted backgrounds, anime film aesthetic",
    antiStyle: "NOT a photograph, NOT photorealistic, NOT live action, NOT DSLR, NOT a 3D render. Anime illustration only",
    negative: "photorealistic, live action, photograph, 3D render, western cartoon, rough sketch"
  },
  anime: {
    positive: "High-quality anime illustration, Studio Ghibli meets modern anime, vibrant saturated colors, clean linework, cel-shaded with soft gradients, expressive detailed eyes, detailed hair with natural flow, colorful background art with atmospheric perspective, professional anime production quality",
    reinforcement: "STYLE LOCK: anime illustration, cel-shaded, clean linework, anime eyes, vibrant anime colors, Ghibli aesthetic",
    antiStyle: "NOT a photograph, NOT photorealistic, NOT live action, NOT 3D render, NOT oil painting. Anime only",
    negative: "photorealistic, live action, photograph, 3D render, western cartoon, rough sketch, inconsistent style, off-model, chibi, super deformed"
  },
  cartoon_2d: {
    positive: "Professional 2D vector animation style reminiscent of modern Cartoon Network and Disney Television Animation, flat cel-shaded colors with strategic gradients, bold clean outlines with consistent line weight, playful exaggerated proportions, bright cheerful primary color palette, clean gradient backgrounds with atmospheric depth, broadcast television quality",
    reinforcement: "STYLE LOCK: 2D cartoon animation, flat colors, bold outlines, exaggerated proportions, Cartoon Network style",
    antiStyle: "NOT a photograph, NOT photorealistic, NOT 3D rendered, NOT anime, NOT oil painting, NOT watercolor. 2D cartoon only",
    negative: "photorealistic, photograph, 3D render, anime, oil painting, watercolor, realistic proportions"
  },
  picstory_cocomelon: {
    positive: "3D rendered Pixar-quality children's animation with soft subsurface scattering on skin, rounded chunky character design with appeal for young audiences, oversized expressive eyes with detailed reflections, bright candy-colored palette with high saturation, soft ambient occlusion for subtle depth, cheerful warm global illumination with soft shadows, toy-like proportions that feel huggable, smooth plastic-like materials, raytraced rendering quality",
    reinforcement: "STYLE LOCK: 3D children's animation, Cocomelon/Pixar style, rounded toy-like characters, bright candy colors, soft 3D rendering",
    antiStyle: "NOT a photograph, NOT photorealistic, NOT 2D, NOT anime, NOT dark or gritty. Children's 3D animation only",
    negative: "photorealistic, photograph, 2D, anime, dark, gritty, noir, horror, realistic humans"
  },
  cinematic_picstory: {
    positive: "Cinematic 3D CGI render matching Pixar Animation Studios or DreamWorks feature film quality, realistic subsurface scattering for skin and translucent materials, raytraced global illumination with accurate light bounces, volumetric fog and atmospheric effects, dramatic rim lighting for character separation, physically based rendering (PBR) with accurate material properties, detailed fabric and hair simulation, film color grading with rich contrast, IMAX-quality framing",
    reinforcement: "STYLE LOCK: cinematic 3D CGI, Pixar/DreamWorks film quality, PBR rendering, raytraced lighting, 3D animated characters",
    antiStyle: "NOT a photograph, NOT photorealistic, NOT 2D, NOT anime, NOT hand-drawn, NOT watercolor. Cinematic 3D CGI only",
    negative: "photorealistic, photograph, 2D, flat, sketch, watercolor, anime"
  },
  oil_painting: {
    positive: "Classical oil painting on textured linen canvas, visible impasto brushstrokes with thick paint application, chiaroscuro lighting technique with dramatic contrast between light and shadow, Rembrandt-inspired dramatic shadow and highlighted faces, rich warm umber and burnt sienna undertones, warm golden varnish glow, museum-quality fine art worthy of the Louvre, Renaissance composition using golden ratio",
    reinforcement: "STYLE LOCK: oil painting, visible brushstrokes, canvas texture, impasto technique, warm varnish glow, Rembrandt lighting",
    antiStyle: "NOT a photograph, NOT photorealistic, NOT 3D rendered, NOT anime, NOT cartoon, NOT digital art. Oil painting on canvas only",
    negative: "photorealistic, photograph, 3D render, CGI, anime, cartoon, vector, digital art"
  },
  watercolor: {
    positive: "Delicate transparent watercolor painting on cold-pressed Arches paper, visible paper grain texture showing through the paint, soft wet-on-wet color bleeding technique with organic edges, transparent luminous washes layered for atmospheric depth, gentle color gradients that flow naturally, white paper showing through for highlights, loose expressive brushwork, muted pastel palette with occasional vivid accent colors",
    reinforcement: "STYLE LOCK: watercolor painting, visible paper texture, transparent washes, color bleeding edges, white paper showing through",
    antiStyle: "NOT a photograph, NOT photorealistic, NOT 3D rendered, NOT anime, NOT cartoon, NOT oil painting. Watercolor on paper only",
    negative: "photorealistic, photograph, 3D render, CGI, anime, cartoon, vector, oil painting"
  },
  comic_book: {
    positive: "Bold American comic book art style with heavy black ink outlines and dynamic line weight variation, Ben-Day halftone dot shading for texture and tone, dynamic foreshortened perspective with dramatic angles, motion lines and speed lines for kinetic energy, dramatic chiaroscuro inking with deep blacks and bright highlights, saturated CMYK color palette, Jack Kirby-inspired dynamic composition, professional comic book illustration quality",
    reinforcement: "STYLE LOCK: comic book art, heavy ink outlines, halftone dots, dynamic poses, CMYK colors, Jack Kirby energy",
    antiStyle: "NOT a photograph, NOT photorealistic, NOT 3D rendered, NOT watercolor, NOT oil painting. Comic book ink art only",
    negative: "photorealistic, photograph, 3D render, CGI, watercolor, oil painting, pastel"
  },
  humpty_dumpty: {
    positive: "Minimalist cartoon illustration in the 'Humpty Dumpty' web animation style. Characters are EXTREMELY simple: large perfect white circle for a head with thick dark-brown (#3D2B1F) outline stroke (3-4px weight), tiny black dot-eyes that are small horizontal dashes or dots placed close together, simple single-line mouth (curved up for happy, curved down for sad, wavy for worried, V-shape smirk for mischievous, small O for surprised, flat line for neutral), NO nose unless just a tiny dot. Bodies are simple rounded bean/egg shapes with flat solid-color fill and the same thick dark-brown outline — NO body detail, NO muscle definition, NO anatomical accuracy. Arms are simple curved lines extending from the body (like noodle arms), legs are two straight stick lines. Clothing is indicated ONLY by flat color fills within the body outline: dark slate-blue (#3D4F5F) for suits/jackets, warm brown (#8B6F47) for casual wear, muted red (#C0392B) for uniforms/robes, cream/beige (#F5DEB3) for shirts, light blue (#87CEEB) for police/official. Characters are distinguished by: clothing color, simple accessories drawn in the same minimal style (flat-brim hats, police caps with yellow badge dot, hair as simple colored shapes on top of the circle head — dark bob, blonde side-sweep, bun on top). Female characters get simple hair shapes (long dark hair as two curved lines framing the head, or a bun circle on top). Background is ALWAYS a solid warm cream (#F5E6D3) or warm beige (#FAEBD7) flat fill — completely flat, no gradient, no texture. When environments are needed, draw them in the SAME ultra-minimal style: buildings are simple colored rectangles with thick brown outlines, windows are small blue squares, doors are dark rectangles, signs are simple rectangles with a small icon inside. Occasionally, one photorealistic object (car, house, building exterior) appears composited next to the drawn characters for comedic juxtaposition — this is a KEY signature of the style. Multiple characters in a scene have slightly different body sizes and clothing colors to distinguish them. Emotional scenes use the character's simple face expression plus body posture (arms raised = celebration, arms on hips = authority, hunched = sad, arms out = surprise). Group shots show 2-6 characters at different sizes, some partially overlapping. Portrait-style composition with characters filling 40-70% of the frame. Clean, crisp vector-like edges despite the hand-drawn feel.",
    reinforcement: "STYLE LOCK: Humpty Dumpty minimalist cartoon — white circle heads, thick dark-brown outlines, flat solid-color bean bodies, stick arms and legs, tiny dot-eyes, simple line-mouths, solid warm cream background, NO shading, NO gradients, NO textures on characters, NO realistic proportions. This style is deliberately crude and charming — like a well-made web animation. Characters look like they were drawn by a talented artist deliberately choosing extreme simplicity. The humor comes from telling serious/dramatic stories with these absurdly simple characters. EVERY element that is drawn (characters, simple props, simple buildings) uses the same thick dark-brown outline and flat color fill. The ONLY exception is occasional photorealistic objects composited in for comedic contrast. Faces have MAXIMUM 4 elements: two dot-eyes, one line-mouth, and optionally one simple eyebrow line per eye. NO additional facial features.",
    antiStyle: "NOT photorealistic characters, NOT detailed faces, NOT anime eyes, NOT 3D rendered characters, NOT realistic human proportions, NOT complex shading or lighting on characters, NOT gradient fills on characters, NOT busy or detailed backgrounds, NOT watercolor, NOT oil painting. The characters must look like simple stick figures with circle heads — NOT like any other cartoon style (not Disney, not anime, not Cartoon Network). The backgrounds must be FLAT solid cream — not painted, not textured, not gradient.",
    negative: "photorealistic people, realistic faces, realistic eyes, detailed anatomy, realistic proportions, anime, manga, 3D render, CGI, complex shading, gradient on characters, textured background, painted background, detailed background, intricate details, complex lighting, volumetric lighting, realistic skin, realistic hair, depth of field, motion blur, shadows on characters, multiple light sources, complex environment, busy composition, ornate, decorative, watercolor wash, oil paint texture, brush strokes on characters"
  }
};

// ══════════════════════════════════════════════════════════════════
// PROMPT VALIDATION
// ══════════════════════════════════════════════════════════════════

function validateAndEnhancePrompt(imagePrompt, styleConfig, orientationConfig, sceneNumber) {
  let enhanced = imagePrompt;

  // Strip pixel dimensions
  enhanced = enhanced.replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\s*\.?\s*/gi, '');

  // Ensure style prefix
  const styleCheck = styleConfig.positive.substring(0, 30).toLowerCase();
  if (!enhanced.toLowerCase().includes(styleCheck.substring(0, 20))) {
    enhanced = `${styleConfig.positive}. ${enhanced}`;
  }

  // Ensure composition hint
  const compHint = orientationConfig.format === 'portrait'
    ? 'vertical 9:16 frame, tall vertical composition'
    : 'widescreen 16:9 cinematic frame, wide horizontal composition';

  if (orientationConfig.format === 'portrait') {
    if (!/portrait|vertical|9:16/i.test(enhanced)) {
      enhanced = enhanced.replace(/landscape|horizontal|widescreen|16:?9/gi, '');
      enhanced = `${compHint}. ${enhanced}`;
    }
  } else {
    if (!/landscape|widescreen|16:9/i.test(enhanced)) {
      enhanced = enhanced.replace(/portrait|vertical|9:?16/gi, '');
      enhanced = `${compHint}. ${enhanced}`;
    }
  }

  // Ensure no-text rule
  if (!/no text/i.test(enhanced)) {
    enhanced += ', ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image';
  }

  // Ensure quality markers
  if (!/masterpiece|professional|8k|award/i.test(enhanced)) {
    enhanced += ', masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography';
  }

  return enhanced;
}

// ══════════════════════════════════════════════════════════════════
// MAIN — ALL BATCHES IN ONE CALL
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    // ── Fetch project + scenes (parallel) ──────────────────────────
    const [projects, allScenes] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scenes.filter({ project_id })
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ── Find scenes needing prompts ────────────────────────────────
    const pendingScenes = allScenes
      .filter(s => s.status === 'breakdown_ready')
      .sort((a, b) => a.scene_number - b.scene_number);

    if (pendingScenes.length === 0) {
      return Response.json({
        success: true, done: true,
        message: 'All scenes already have prompts.',
        total_scenes: allScenes.length
      });
    }

    // ── Style & orientation config ─────────────────────────────────
    const visualStyle = project.visual_style || 'cinematic_realistic';
    const styleConfig = styleMap[visualStyle] || styleMap.cinematic_realistic;
    const orientation = project.orientation || 'landscape';

    let orientationConfig;
    if (orientation === 'portrait') {
      orientationConfig = {
        format: 'portrait',
        directive: "PORTRAIT VERTICAL 9:16 format, tall vertical framing",
        composition: "Compose for VERTICAL 9:16 mobile frame: tall compositions, center subjects, close-up and medium shots, vertical depth stacking",
        animation: "vertical 9:16 — tilt up/down, vertical reveals, close-up push-ins, portrait motion"
      };
    } else {
      orientationConfig = {
        format: 'landscape',
        directive: "LANDSCAPE HORIZONTAL 16:9 widescreen, wide cinematic framing",
        composition: "Compose for WIDESCREEN 16:9: wide establishing shots, rule of thirds, horizontal leading lines, foreground/midground/background depth",
        animation: "widescreen 16:9 — horizontal pans, dolly forward/back, crane shots, lateral parallax"
      };
    }

    const promptPrefix = `${styleConfig.positive}, ${orientationConfig.directive}`;

    // ── Load characters ────────────────────────────────────────────
    let characters = [];
    if (project.character_descriptions) {
      try { characters = JSON.parse(project.character_descriptions); } catch (_) {}
    }
    const characterBlock = characters.length > 0
      ? `**CHARACTERS (embed FULL physical description into every prompt where they appear):**\n${characters.map(c => `• ${c.name}: ${c.visual_description || c.description || ''}`).join('\n')}`
      : '';

    // ── Try to load story analysis (optional — enhances quality) ───
    let storyContext = '';
    try {
      const blueprint = JSON.parse(project.scene_blueprint);
      const sa = blueprint.story_analysis;
      storyContext = `**STORY:** Theme: ${sa.central_theme} | Visual World: ${sa.visual_world} | Color Arc: ${sa.color_arc} | Motifs: ${JSON.stringify(sa.recurring_visual_motifs)}`;
    } catch (_) {
      storyContext = `**STORY:** Topic: "${project.name}" | Niche: ${project.niche || 'general'}`;
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 PROMPT GENERATION — ${pendingScenes.length} scenes`);
    console.log(`🖼️ Style: ${visualStyle} | 📐 ${orientation}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ── Process in batches ──────────────────────────────────────────
    let totalPrompts = 0;
    let totalWarnings = 0;
    const totalBatches = Math.ceil(pendingScenes.length / BATCH_SIZE);

    for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
      const batchScenes = pendingScenes.slice(bIdx * BATCH_SIZE, (bIdx + 1) * BATCH_SIZE);
      if (batchScenes.length === 0) break;

      if (bIdx > 0) await new Promise(r => setTimeout(r, 2000)); // Rate limit buffer

      // Build scene directions from director notes stored on each scene
      const scenesWithNotes = batchScenes.map(scene => {
        const director = extractDirectorNotes(scene.image_prompt);
        return { scene_number: scene.scene_number, scene_id: scene.id, narration_text: scene.narration_text, director };
      });

      const sceneDirections = scenesWithNotes.map(s => {
        if (!s.director) {
          return `Scene ${s.scene_number}: (No director notes — generate from narration)\n  Narration: "${s.narration_text}"`;
        }
        return `Scene ${s.scene_number}:
  Narration: "${s.narration_text}"
  Visual Concept: ${s.director.visual_concept}
  Shot Type: ${s.director.shot_type}
  Camera Angle: ${s.director.camera_angle}
  ★ Camera Movement (CRITICAL for animation): ${s.director.camera_movement}
  Lighting: ${s.director.lighting}
  Color Palette: ${s.director.color_palette}
  Mood: ${s.director.mood}
  DOF: ${s.director.depth_of_field}
  Niche Element: ${s.director.niche_visual_element || 'N/A'}
  Continuity: ${s.director.continuity_bridge || 'N/A'}
  Emotional Intensity: ${s.director.emotional_intensity || 0.5} (use this to scale animation energy)`;
      }).join('\n\n');

      const prompt = `**SYSTEM ROLE — You are an expert storyboard artist and cinematic director.**
Your job is to translate narrative text into highly visual, dynamic image prompts for AI image generation.
You think like a cinematographer on set — you see the PHYSICAL REALITY of what the narration describes.
You do NOT take metaphors literally. You do NOT default to abstract symbols or lab settings when the narration describes a human experience.
You ALWAYS prioritize the physical action, human anatomy (if applicable), environmental context, and sequential storytelling.

---

**PROMPT CONSTRUCTION FORMULA (MANDATORY for every image_prompt):**
Every image_prompt you write MUST follow this 5-part formula in order:

  [Subject/Anatomy] + [Dynamic Action/Process] + [Environment/Context] + [Camera Angle/Cinematography] + [Lighting & Style]

- **Subject/Anatomy**: WHO or WHAT is the focus? Describe the subject with physical specificity — body parts, objects, creatures, textures.
- **Dynamic Action/Process**: WHAT is happening? Capture the verb — the motion, the transformation, the journey. If something is being swallowed, show the swallowing. If something is burning, show the flames consuming it. Never reduce an action to a static object.
- **Environment/Context**: WHERE is this taking place? Interior of a body, underwater, a dark alley, a cosmic void — ground the action in a specific place.
- **Camera Angle/Cinematography**: HOW are we seeing it? Macro lens inside the throat, aerial drone over a battlefield, Dutch angle in a hallway — be specific about the camera's relationship to the subject.
- **Lighting & Style**: WHAT is the mood? Specify light sources, color temperature, shadows, and the project's visual style.

---

**FEW-SHOT EXAMPLES (study these carefully):**

Example Narration: "The boy accidentally swallowed a shiny quarter."
❌ BAD prompt (AVOID THIS): "A shiny quarter inside a stomach, realistic, 4k."
→ This is lazy, static, and misses the narrative action entirely.

✅ GOOD prompt (EMULATE THIS): "Cinematic macro shot inside a human esophagus — a shiny silver coin tumbles downward through the pink muscular walls of the throat, caught mid-descent with motion blur, the esophageal muscles contracting around it. The environment is the warm, glistening interior of the human digestive tract with subtle translucent tissue textures. Extreme close-up medical-cinematic camera angle, shallow depth of field. Warm amber bioluminescent lighting with soft volumetric glow through tissue. ${styleConfig.reinforcement}."
→ This follows the formula: [coin + human throat anatomy] + [tumbling descent through esophagus] + [interior of digestive tract] + [macro close-up inside body] + [warm bioluminescent medical-cinematic lighting]

Example Narration: "The stock market crashed overnight."
❌ BAD: "A stock chart going down, red arrows."
✅ GOOD: "A massive wall of glass stock tickers shattering into thousands of fragments in slow motion — suited traders frozen mid-panic in a grand marble trading floor, papers suspended in mid-air. The environment is a cavernous financial exchange with towering columns. Wide-angle dramatic lens, low camera position looking up at the destruction. Harsh overhead fluorescent lights mixing with red emergency warning glow. ${styleConfig.reinforcement}."

Example Narration: "She felt her heart break."
❌ BAD: "A broken heart shape, red, sad."
✅ GOOD: "Extreme close-up of a woman's chest — beneath her skin, rendered in translucent x-ray style, a human heart visibly fractures with hairline cracks spreading across the ventricles, tiny shards of light escaping through each crack. Her hands press against her sternum. The environment is a dim, rain-streaked bedroom with blue-gray tones. Intimate close-up shot with shallow depth of field, macro lens detail on the cracking heart. Cool desaturated lighting with a single warm light source behind her. ${styleConfig.reinforcement}."

---

**CHAIN OF THOUGHT — MANDATORY for each scene:**
Before generating the image_prompt, you MUST first produce a "narrative_intent" field that explains:
1. What is the PHYSICAL ACTION or PROCESS described in the narration?
2. What should the viewer SEE happening — not symbolically, but literally/visually?
3. What is the emotional tone and energy level?
This grounds your prompt in reality and prevents lazy symbolic outputs.

---

${storyContext}

${characterBlock}

**STYLE:** ${visualStyle} | **ORIENTATION:** ${orientationConfig.format}

**DIRECTOR'S SCENE NOTES:**
${sceneDirections}

**YOUR TASK — for EACH scene produce:**

1. **narrative_intent** — Your chain-of-thought reasoning (2-3 sentences):
   - What is the PHYSICAL ACTION described in the narration?
   - What should the viewer literally SEE?
   - What is the emotional energy?

2. **image_prompt** — Dense technical prompt following the FORMULA: [Subject/Anatomy] + [Dynamic Action/Process] + [Environment/Context] + [Camera Angle/Cinematography] + [Lighting & Style]
   - MUST begin with: "${promptPrefix}."
   - Translate visual concept into SPECIFIC, DETAILED image (300+ chars)
   - PRIORITIZE the ACTION and PROCESS — show things happening, not static objects
   - If narration describes something inside a body → show the internal anatomical journey (x-ray, cross-section, macro interior)
   - If narration describes a metaphor → translate to a PHYSICAL visual metaphor (not literal text/symbols)
   - If narration describes an emotion → show it through BODY LANGUAGE, ENVIRONMENT, and LIGHTING (not icons or shapes)
   - Embed exact shot type, camera angle, DOF from director notes
   - Embed exact lighting setup
   - Apply color palette as color grading
   - If characters appear → embed FULL physical description (not just name)
   - ${orientationConfig.composition}
   - FORBIDDEN: text, words, letters, numbers, charts, graphs, signs, readable content
   - MUST end with the style reinforcement: "${styleConfig.reinforcement}. ${styleConfig.antiStyle}. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"
   - The LAST 50 words of every prompt MUST reinforce the visual style

3. **animation_prompt** — 5-8 second motion direction:
    - Translate the director's camera_movement into RICH, SPECIFIC animation language
    - Format: ${orientationConfig.animation}
    - MUST include ALL of these motion layers:
      a) PRIMARY CAMERA: exact movement path, speed, and timing (e.g. "Slow dolly push-in from medium to close-up over 5s")
      b) ATMOSPHERIC MOTION: particles, fog wisps, light rays shifting, dust motes, smoke curls
      c) SUBJECT MICRO-MOTION: breathing chest rise, hair sway, fabric ripple, eye blinks, hand trembles
      d) ENVIRONMENTAL MOTION: leaves rustling, water rippling, curtains billowing, shadows shifting
      e) FOCUS/DOF SHIFTS: "rack focus from background to subject at 3s mark" or "shallow DOF slowly deepening"
    - Match emotional_intensity: low (0.1-0.3) = glacial, contemplative | mid (0.4-0.6) = steady, purposeful | high (0.7-1.0) = dynamic, urgent, dramatic
    - Camera movement IS the emotion: push-in = tension/intimacy, pull-back = revelation/isolation, crane up = triumph/scale, handheld = urgency/chaos
    - NEVER write generic "slow zoom in" — always be SPECIFIC about speed, direction, and what's in frame

**RESPONSE (JSON ONLY):**
{
  "prompts": [
    {
      "scene_number": 1,
      "narrative_intent": "[chain-of-thought: what is the physical action, what should the viewer see, what is the emotional energy]",
      "image_prompt": "${promptPrefix}. [Subject/Anatomy] + [Dynamic Action/Process] + [Environment/Context] + [Camera Angle/Cinematography] + [Lighting & Style]. ${styleConfig.reinforcement}. ${styleConfig.antiStyle}. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography",
      "animation_prompt": "[motion direction with all 5 layers]"
    }
  ]
}

✓ Formula followed? ✓ Narrative intent grounded? ✓ Action/process shown (not static)? ✓ Begins with style prefix? ✓ 300+ chars? ✓ Shot type embedded? ✓ Lighting described? ✓ No text in image? ✓ Ends with STYLE LOCK? ✓ Last 50 words reinforce style?`;
      console.log(`🎨 Batch ${bIdx + 1}/${totalBatches}: scenes ${batchScenes[0].scene_number}-${batchScenes[batchScenes.length - 1].scene_number}...`);

      const result = await callGemini(prompt, 0.7, 16384);

      if (!result.prompts || !Array.isArray(result.prompts)) {
        console.error(`Batch ${bIdx + 1} returned no prompts array`);
        continue;
      }

      // Update scenes with prompts (parallel within batch)
      const updatePromises = scenesWithNotes.map(async (s) => {
        const generated = result.prompts.find(p => p.scene_number === s.scene_number);

        let imagePrompt, animationPrompt;

        if (generated) {
          imagePrompt = validateAndEnhancePrompt(
            generated.image_prompt || '', styleConfig, orientationConfig, s.scene_number
          );
          animationPrompt = generated.animation_prompt
            || "slow deliberate dolly push-in from medium shot to close-up over 5s, atmospheric dust motes floating in golden light, subtle breathing motion on subject, shallow depth of field with gentle focus pull, background slowly going out of focus";
        } else {
          // Fallback — build from director notes
          console.warn(`⚠️ Scene ${s.scene_number} missing from response — building fallback`);
          totalWarnings++;

          let fallback = `${promptPrefix}. `;
          if (s.director) {
            fallback += `${s.director.shot_type}. ${s.director.visual_concept}. `;
            fallback += `${s.director.lighting}. Color palette: ${s.director.color_palette}. `;
            fallback += `${s.director.depth_of_field}. Mood: ${s.director.mood}. `;
          } else {
            fallback += `Cinematic scene depicting: ${s.narration_text}. Professional composition. ${styleConfig.reinforcement}. ${styleConfig.antiStyle}. `;
          }

          imagePrompt = validateAndEnhancePrompt(fallback, styleConfig, orientationConfig, s.scene_number);
          animationPrompt = s.director?.camera_movement
            || "slow deliberate dolly push-in from medium shot to close-up over 5s, atmospheric dust motes floating in golden light, subtle breathing motion on subject, shallow depth of field with gentle focus pull";
        }

        try {
          await base44.asServiceRole.entities.Scenes.update(s.scene_id, {
            image_prompt: imagePrompt,
            animation_prompt: animationPrompt,
            status: "prompts_ready"
          });
          return true;
        } catch (err) {
          console.error(`Failed to update scene ${s.scene_number}:`, err.message);
          return false;
        }
      });

      const results = await Promise.all(updatePromises);
      const batchApplied = results.filter(Boolean).length;
      totalPrompts += batchApplied;
      console.log(`✓ Batch ${bIdx + 1}: ${batchApplied} prompts applied`);
    }

    // ── Mark complete ──────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "content_generation", current_step: 5
      });
    } catch (_) {}

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 ALL PROMPTS GENERATED — ${totalPrompts} scenes ready for image gen`);
    if (totalWarnings > 0) console.log(`⚠️ ${totalWarnings} fallback prompts used`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      done: true,
      prompts_applied: totalPrompts,
      quality_warnings: totalWarnings,
      total_batches: totalBatches,
      total_scenes: allScenes.length
    });

  } catch (error) {
    console.error("❌ generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});