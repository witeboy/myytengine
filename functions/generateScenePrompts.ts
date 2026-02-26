import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE PROMPT GENERATOR — DIRECTOR NOTES → PRODUCTION PROMPTS
// Pipeline: Script → Breakdown → [THIS] → Image Gen → Animation
// ══════════════════════════════════════════════════════════════════

const BATCH_SIZE = 12;
const CLIP_DURATION = 5;
const PARALLEL_PROMPT_BATCHES = 3; // Run 3 Gemini prompt calls concurrently

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

      try { return JSON.parse(rawText); } catch (_) {}
      try { return JSON.parse(repairJSON(rawText)); } catch (_) {}

      let jsonStr = rawText;
      if (rawText.includes("```json")) jsonStr = rawText.split("```json")[1].split("```")[0].trim();
      else if (rawText.includes("```")) jsonStr = rawText.split("```")[1].split("```")[0].trim();
      try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}

      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) { try { return JSON.parse(objMatch[0]); } catch (_) {} }

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
// STYLE NORMALIZER — handles "Skeleton Protagonist" → "skeleton_protagonist"
// ══════════════════════════════════════════════════════════════════

function normalizeStyleKey(raw) {
  if (!raw) return 'cinematic_realistic';
  console.log(`🔍 RAW visual_style value: "${raw}" (type: ${typeof raw}, length: ${raw.length}, charCodes: ${[...raw].slice(0,30).map(c=>c.charCodeAt(0)).join(',')})`);
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  console.log(`🔍 Normalized to: "${normalized}"`);
  if (styleMap[normalized]) { console.log(`✅ Direct match: ${normalized}`); return normalized; }
  for (const key of Object.keys(styleMap)) {
    if (normalized.includes(key) || key.includes(normalized)) { console.log(`✅ Fuzzy match: ${key}`); return key; }
  }
  if (normalized.includes('skeleton')) { console.log(`✅ Keyword match: skeleton_protagonist`); return 'skeleton_protagonist'; }
  console.warn(`❌ No match for "${raw}" → "${normalized}"`);
  return 'cinematic_realistic';
}

// ══════════════════════════════════════════════════════════════════
// VISUAL STYLE MAP
// ══════════════════════════════════════════════════════════════════

const styleMap = {
  cinematic_realistic: {
    positive: "Cinematic film still shot on ARRI Alexa 65 with anamorphic Panavision lenses, beautiful lens flare and chromatic aberration, shallow depth of field f/1.4 with creamy bokeh, dramatic three-point lighting with hard key light and soft fill, strong rim light separation, color graded with professional teal and orange LUT, subtle Kodak Vision3 film grain texture, volumetric god rays through atmosphere, Hollywood blockbuster cinematography, photorealistic rendering, 8K resolution",
    negative: "cartoon, anime, illustration, painting, drawing, sketch, 3D render, CGI, video game, cel shaded, flat colors, clipart, comic book, manga, stylized, amateur, low quality, blurry, distorted, deformed, oversaturated"
  },
  photorealistic_4k: {
    positive: "Ultra-photorealistic DSLR photograph shot on Canon EOS R5 with RF 85mm f/1.2 L lens, razor-sharp focus, natural ambient lighting, professional color grading, editorial photography for National Geographic, visible skin texture and pores, accurate shadows and highlights, real-world proportions, zero AI artifacts, 8K RAW quality",
    negative: "cartoon, anime, CGI, 3D render, painting, digital art, stylized, unrealistic, soft focus, beauty filter, over-processed, HDR overdone"
  },
  anime: {
    positive: "High-quality anime illustration, Studio Ghibli meets modern anime, vibrant saturated colors, clean linework, cel-shaded with soft gradients, expressive detailed eyes, detailed hair with natural flow, colorful background art with atmospheric perspective, professional anime production quality",
    negative: "photorealistic, live action, photograph, 3D render, western cartoon, rough sketch, inconsistent style, off-model, chibi, super deformed"
  },
  cinematic_anime: {
    positive: "Cinematic anime key visual, Makoto Shinkai and Ufotable production quality, dramatic volumetric lighting with god rays, ultra-detailed background art with atmospheric depth, sharp character linework with subtle cel shading, rich color grading with vibrant highlights and deep shadows, anamorphic lens effects, film grain overlay, widescreen cinematic composition, professional anime feature film quality",
    negative: "photorealistic, live action, photograph, chibi, super deformed, rough sketch, flat colors, low budget, inconsistent proportions, western cartoon"
  },
  cartoon_2d: {
    positive: "High-quality 2D cartoon illustration, bold clean outlines, vibrant flat colors with subtle gradients, expressive character design, dynamic poses, professional vector-quality artwork, Cartoon Network and Disney Channel production quality, smooth color fills, playful proportions, appealing character design, clean composition",
    negative: "photorealistic, photograph, 3D render, anime, sketch, rough, painterly, dark, gritty, horror, complex textures, film grain"
  },
  picstory_cocomelon: {
    positive: "Adorable 3D rendered children's animation style, CoComelon and Pixar Junior quality, soft rounded characters with big expressive eyes, pastel color palette with bright accents, smooth plastic-like textures, warm studio lighting, cheerful and friendly atmosphere, child-safe wholesome imagery, toy-like proportions, gentle soft shadows, nursery rhyme aesthetic",
    negative: "photorealistic, scary, dark, horror, sharp edges, complex, adult themes, violence, anime, sketch, painterly, gritty"
  },
  cinematic_picstory: {
    positive: "Cinematic 3D animated feature film quality, Pixar and DreamWorks level rendering, dramatic studio lighting with rim lights, rich color grading, detailed textures with subsurface scattering on skin, expressive stylized characters with realistic proportions, depth of field with bokeh, volumetric atmosphere, professional animated feature film composition, emotional cinematography",
    negative: "flat 2D, sketch, anime linework, rough, low quality, uncanny valley, photorealistic human, cheap 3D, mobile game quality"
  },
  oil_painting: {
    positive: "Masterful oil painting on canvas, visible thick impasto brushstrokes, rich pigment texture, classical fine art composition, Rembrandt and Vermeer lighting with chiaroscuro, warm varnish glow, gallery-quality artwork, traditional glazing technique with luminous depth, painterly color mixing on canvas, museum masterpiece quality, art historical significance",
    negative: "photorealistic, digital, smooth, flat, cartoon, anime, 3D render, CGI, vector, clean lines, modern"
  },
  watercolor: {
    positive: "Beautiful traditional watercolor painting on textured cold-press paper, soft translucent color washes with visible paper grain, delicate wet-on-wet blending, controlled bleeding edges, subtle granulation, luminous transparency where white paper shows through, gentle color harmonies, professional fine art watercolor technique, botanical illustration quality",
    negative: "photorealistic, digital, oil painting, acrylic, cartoon, anime, 3D render, sharp edges, flat colors, bold outlines, heavy saturation"
  },
  comic_book: {
    positive: "Professional comic book art, bold black ink outlines, dynamic panel composition, halftone dot shading, vibrant saturated colors with dramatic shadows, superhero and graphic novel aesthetic, Marvel and DC Comics quality artwork, strong action lines, dramatic foreshortening, professional sequential art, Ben-Day dots and cross-hatching",
    negative: "photorealistic, photograph, soft, watercolor, painterly, anime, 3D render, pastel, muted colors, blurry, sketchy"
  },
  humpty_dumpty: {
    positive: "Charming storybook illustration style, whimsical hand-drawn quality with gentle watercolor washes, rounded friendly character designs, fairy tale aesthetic, warm nostalgic nursery rhyme atmosphere, soft golden lighting, vintage children's book illustration quality, Maurice Sendak and Beatrix Potter inspired, delicate cross-hatching with pastel tones, enchanted storybook world",
    negative: "photorealistic, modern, dark, scary, anime, 3D render, flat vector, bold colors, adult themes, sharp geometric"
  },
  harry_potter: {
    positive: "Magical fantasy world with warm candlelight and mysterious atmosphere, gothic castle interiors with stone textures and floating candles, rich jewel-tone color palette of deep burgundy gold and emerald, magical golden particles and ethereal glow effects, dramatic chiaroscuro lighting, weathered leather and parchment textures, enchanted artifacts with luminous properties, cozy yet mysterious British boarding school aesthetic, professional fantasy concept art quality",
    negative: "modern, contemporary, bright fluorescent, cartoon, anime, flat colors, minimalist, sci-fi, futuristic, clinical, sterile"
  },
  "3d_whiteboard_cartoon": {
    positive: "Clean 3D whiteboard cartoon, bold consistent black ink outlines, bright cheerful flat color fills with single-tone cel shading. Characters with friendly exaggerated proportions — larger heads, expressive eyes, thick eyebrows, simple noses, casual clothing in flat color with fold shading. Clean isometric environments — green grass, gradient blue skies, brick buildings, tiled floors. All objects with bold outlines and flat color. Sky blue and teal environments, warm browns and peach skin. Even ambient lighting, no harsh shadows, YouTube explainer style, approachable professional",
    negative: "photorealistic, photograph, 3D render, CGI, anime, painterly, watercolor, oil painting, sketch, dark, gritty, horror, film grain, lens flare, bokeh, dramatic shadows, neon, cyberpunk, fantasy, abstract, pixel art, low poly, voxel"
  },
  low_poly_3d_cartoon: {
    positive: "Stylized low-poly 3D cartoon, all geometry from visible flat-shaded polygons and triangular facets. Exaggerated proportions — oversized heads, angular noses, large round eyes, thick eyebrows. Chunky geometric hair, warm peach-tan skin with polygon-edge shading. Clothing with visible folds and flat polygon faces. Suburban environments — clapboard houses, white picket fences, bright green grass, faceted tree canopies, boxy vehicles. Bright gradient sky, geometric clouds, warm sunlight. Vibrant saturated colors, clean polygon edges, no smoothing, matte clay-toy quality, soft ambient occlusion, Pixar expressiveness with geometric stylization",
    negative: "photorealistic, photograph, smooth high-poly, hyperrealistic, film grain, lens flare, bokeh, anime, cel-shaded, 2D flat, hand-drawn, sketch, watercolor, oil painting, dark horror, neon cyberpunk, abstract, pixel art, voxel art, wireframe, monochrome, desaturated, ray-traced, photogrammetry"
  },
  skeleton_protagonist: {
   positive: "Full body wide shot showing complete scene from head to feet, photorealistic detailed environment with sharp background, multiple people in frame, cinematic establishing shot composition, the main character is a transparent glass-bodied skeleton with ivory bones and expressive brown amber eyeballs, character has full body in a richly detailed real-world location interacting with photorealistic humans, golden hour volumetric lighting, HDR cinematic lens, 4K detail, warm amber grading",
   negative: "cartoon skeleton, halloween decoration, flat 2D, anime, comic, x-ray medical, horror gore, neon, plastic toy, low quality, blurry, abstract, minimalist, sketch, painting, chibi, dia de los muertos, empty dark eye sockets, bare bones without transparent body, scary horror skeleton, torso only, bust shot, head and shoulders only, cropped at waist, isolated character on blank background, portrait crop, close-up, macro, extreme close-up, chest detail, upper body only, dark background, black background"
  }
};

// Universal anti-crop negative (appended to ALL styles)
const UNIVERSAL_NEGATIVE_SUFFIX = ", torso only, bust shot, cropped at waist, isolated character on blank background, portrait crop, blurred empty background";

// ══════════════════════════════════════════════════════════════════
// STYLE-SPECIFIC INSTRUCTIONS FOR LLM
// ══════════════════════════════════════════════════════════════════

function getStyleSceneBodyRules(styleName) {
  const rules = {
    cinematic_realistic: {
      characters: "Describe characters with photorealistic detail — skin texture, real clothing fabrics, natural hair, realistic body proportions.",
      environments: "Real-world locations with architectural accuracy, natural materials (wood, stone, glass), weather and atmospheric effects.",
      objects: "Props with realistic material properties — metal reflections, fabric weave, glass transparency, leather grain.",
      rendering: "Use cinematic camera language freely — ARRI, anamorphic, bokeh, f-stops, film grain, color LUT."
    },
    photorealistic_4k: {
      characters: "Photograph-quality humans with visible pores, real fabric textures, natural hair strands, authentic expressions.",
      environments: "Real locations as a photographer would capture them — natural light, real architecture, genuine materials.",
      objects: "Objects with photographic material accuracy — reflections, textures, wear and patina.",
      rendering: "DSLR photography language — Canon/Sony, real lens specs, natural lighting, RAW quality."
    },
    anime: {
      characters: "Anime-style characters with large expressive eyes, cel-shaded skin, stylized colorful hair, clean linework, exaggerated expressions.",
      environments: "Anime background art — painted skies with dramatic clouds, stylized architecture, atmospheric perspective with soft color gradients.",
      objects: "Objects drawn with clean anime linework, flat color fills with subtle highlight/shadow cel-shading.",
      rendering: "Describe as anime illustration. Use terms: cel-shaded, linework, color fills, anime eyes, Studio Ghibli style."
    },
    cinematic_anime: {
      characters: "Cinematic anime characters — sharp detailed linework, subtle cel-shading, dramatic lighting on faces, flowing hair with light interaction.",
      environments: "Makoto Shinkai quality backgrounds — ultra-detailed painted environments, dramatic god rays, atmospheric depth, rich color grading.",
      objects: "Anime-rendered objects with cinematic lighting — dramatic rim lights, volumetric atmosphere, sharp detail.",
      rendering: "Cinematic anime language — god rays, volumetric lighting, dramatic color grading, but with anime linework and cel-shading."
    },
    cartoon_2d: {
      characters: "2D cartoon characters with bold black outlines, flat vibrant color fills, exaggerated proportions, big expressive faces, dynamic poses.",
      environments: "Cartoon backgrounds with bold outlines, flat color fills, playful simplified architecture, bright cheerful colors.",
      objects: "Cartoon-style objects with clean outlines, flat colors, slightly exaggerated proportions, playful design.",
      rendering: "Cartoon Network / Disney Channel quality. Bold outlines, flat colors, no photorealistic terms."
    },
    picstory_cocomelon: {
      characters: "Soft rounded 3D characters with big expressive eyes, plastic-smooth skin, pastel clothing, toy-like proportions, cheerful expressions.",
      environments: "Bright pastel 3D environments — soft rounded architecture, gentle lighting, toy-like world, child-safe wholesome settings.",
      objects: "Smooth plastic-textured 3D objects, rounded edges, bright pastel colors, toy-like quality.",
      rendering: "CoComelon/Pixar Junior 3D rendering — soft shadows, warm studio lighting, smooth plastic textures."
    },
    cinematic_picstory: {
      characters: "Pixar/DreamWorks quality 3D characters — expressive stylized faces, realistic proportions, subsurface scattering on skin, detailed clothing.",
      environments: "Cinematic 3D environments — dramatic studio lighting, rich color grading, volumetric atmosphere, detailed textures.",
      objects: "High-quality 3D rendered objects with detailed materials, dramatic lighting, depth of field.",
      rendering: "Pixar/DreamWorks animated feature film quality — dramatic lighting, subsurface scattering, cinematic composition."
    },
    oil_painting: {
      characters: "Characters rendered with visible impasto brushstrokes, rich pigment skin tones, classical portrait technique, painterly soft edges.",
      environments: "Landscapes and interiors with thick oil paint texture, classical composition, chiaroscuro lighting, canvas grain visible.",
      objects: "Objects painted with rich pigment layers, visible brush texture, warm varnish glow, classical still-life technique.",
      rendering: "Fine art oil painting language — impasto, glazing, chiaroscuro, Rembrandt lighting, canvas texture."
    },
    watercolor: {
      characters: "Characters rendered in soft watercolor washes — translucent skin tones, gentle bleeding edges, paper grain showing through.",
      environments: "Watercolor landscapes — soft color washes, wet-on-wet blending, visible paper texture, delicate atmospheric effects.",
      objects: "Objects painted with translucent watercolor layers, controlled bleeding edges, subtle granulation.",
      rendering: "Traditional watercolor technique — translucent washes, paper grain, wet-on-wet blending, luminous transparency."
    },
    comic_book: {
      characters: "Comic book characters with bold black ink outlines, halftone dot shading on skin, vibrant flat colors, dramatic foreshortening, dynamic action poses.",
      environments: "Comic panel backgrounds — bold outlines, halftone shading, dramatic perspective, vibrant saturated colors.",
      objects: "Objects with bold ink outlines, halftone dots, Ben-Day dot patterns, dramatic shadows.",
      rendering: "Marvel/DC Comics quality — bold ink, halftone dots, action lines, dramatic foreshortening."
    },
    humpty_dumpty: {
      characters: "Whimsical storybook characters — rounded friendly shapes, gentle watercolor washes, warm nostalgic feel, fairy tale proportions.",
      environments: "Enchanted storybook world — hand-drawn quality, soft golden lighting, pastel tones, fairy tale architecture, cozy warmth.",
      objects: "Storybook objects with delicate cross-hatching, gentle watercolor fills, vintage children's book charm.",
      rendering: "Maurice Sendak / Beatrix Potter inspired — hand-drawn, watercolor washes, warm nostalgic nursery rhyme feel."
    },
    harry_potter: {
      characters: "Fantasy characters in robes and wizard attire, warm candlelit skin tones, weathered textures, magical glow effects on faces.",
      environments: "Gothic castle interiors — stone walls, floating candles, jewel-tone stained glass, magical golden particles, mysterious corridors.",
      objects: "Enchanted artifacts with luminous properties, weathered leather, parchment textures, magical golden glow.",
      rendering: "Fantasy concept art — warm candlelight, gothic textures, magical particles, jewel-tone color palette."
    },
    "3d_whiteboard_cartoon": {
      characters: "Characters with bold consistent black ink outlines, flat color fills with single-tone cel-shading, friendly exaggerated proportions — larger heads, expressive cartoon eyes, thick eyebrows, simple noses. Clothing rendered as flat color with subtle darker-tone fold shading (plaid flannel shirts, jeans, work boots, hard hats). Skin in warm browns and peach tones.",
      environments: "Clean isometric/oblique perspective environments — simplified but recognizable settings. Green grass fields with bright yellow-green, gradient blue skies, brick buildings with clean window outlines, indoor rooms with tiled floors and flat-colored walls. Sky blue, steel blue, teal for environments.",
      objects: "ALL objects rendered with bold black outlines and flat color fills — vending machines, storage units, vehicles, furniture. Clearly identifiable with labeled visual metaphors. Information callout bubbles and thought bubbles as part of the visual language.",
      rendering: "YouTube explainer / business education cartoon style — approachable, friendly, professional, visually clean. Even ambient lighting, no harsh shadows, only subtle ground shadows and single-tone darker shading."
    },
    low_poly_3d_cartoon: {
      characters: "Low-poly 3D characters from visible flat-shaded polygon facets — oversized heads, angular protruding noses, large expressive round eyes, thick geometric eyebrows. Chunky geometric hair. Warm peach-tan skin with polygon-edge shading. Blocky hands. Clothing with visible folds and flat polygon faces.",
      environments: "All surfaces from visible flat-shaded triangular polygons. Suburban houses, porches with white railings, geometric roofs, white picket fences. Bright green grass planes, chunky faceted tree canopies. Sidewalks, asphalt roads. Indoor: wood-paneled walls, modeled monitors, bulletin boards, tiled floors.",
      objects: "All objects as low-poly geometric forms — boxy cars, yellow disc headlights, chrome bumpers, mailboxes, fire hydrants, street lamps. Every surface shows polygon edges and flat-shaded faces. Matte plastic quality like clay toys.",
      rendering: "Clean polygon edges on all surfaces, flat-shaded with no smoothing (signature faceted look). Soft ambient occlusion, gentle directional shadows, no outlines or cel-shading. Bright gradient sky, geometric cloud clusters. Vibrant saturated colors, warm and inviting."
    },
    skeleton_protagonist: {
      characters: "Protagonist in EVERY scene: photorealistic transparent skeleton with clear glass-like body shell, glossy ivory bones visible through translucent torso, big round expressive brown/amber EYEBALLS in skull sockets. MUST be shown FULL BODY head-to-toe in most scenes — standing, sitting, kneeling, walking, running. Wears context-appropriate clothing. Must be DOING an action (holding objects, gesturing, interacting with people). Other characters are photorealistic normal humans shown alongside or interacting with the skeleton.",
      environments: "Photorealistic DETAILED real-world environments shown in SHARP FOCUS — NOT blurred bokeh backgrounds. Every scene has a specific location with visible architecture, landscape features, props, furniture, tools, weather effects. The skeleton exists INSIDE this world, not floating in front of it. Include foreground elements for depth.",
      objects: "Photorealistic props the skeleton is actively interacting with — tools in hand, objects being held or carried, furniture being used, vehicles, food, weapons, documents. Props tell the story and connect scenes together.",
      rendering: "Cinematic wide-to-medium framing showing full body within environment. HDR cinematic lens, warm amber grading, dramatic volumetric golden hour lighting, strong rim light separating skeleton from background. Sharp detailed backgrounds. Favor 9:16 vertical framing with character full body visible."
    }
  };

  // ═══ UNIVERSAL FRAMING — appended to ALL styles ═══
  const base = rules[styleName] || null;
  if (base) {
    base.rendering = (base.rendering || '') + ' Frame characters full body head-to-toe in most scenes. Show detailed sharp environments with visible props and architecture, not empty blurred backgrounds. Characters should be mid-action interacting with environment and other people.';
  }
  return base;
}

// ══════════════════════════════════════════════════════════════════
// STYLE-SPECIFIC LLM REINFORCEMENT
// ══════════════════════════════════════════════════════════════════

function getStyleReinforcementInstruction(visualStyle) {
  const instructions = {
    skeleton_protagonist: `
**🦴 SKELETON PROTAGONIST STYLE — CRITICAL FRAMING RULES:**
The protagonist in EVERY image prompt must be described as: "a photorealistic transparent skeleton with a clear glass-like semi-transparent humanoid body shell, glossy ivory bones visible through the translucent torso, big round expressive brown amber eyeballs in the skull sockets"

MANDATORY FRAMING:
- Show the skeleton FULL BODY (head to feet) in MOST scenes — NOT torso-only, NOT bust shots
- Describe the ENVIRONMENT in detail FIRST (location, props, weather, textures) THEN place the skeleton within it
- The skeleton must be DOING an action — holding, reaching, kneeling, walking — NOT standing static
- Include other photorealistic humans in most scenes — crowds, companions, onlookers
- Backgrounds must be SHARP and DETAILED — NOT blurred bokeh
- Each scene must contain a visual CONTINUITY element connecting to the next scene
- The skeleton wears context-appropriate clothing per scene
- Lighting: golden hour, volumetric rays, warm amber grading, rim light on bone edges
- NEVER empty dark eye sockets — always BIG ROUND EXPRESSIVE BROWN/AMBER EYEBALLS
- NEVER torso-only portrait against blurred background`
  };
  return instructions[visualStyle] || '';
}

// ══════════════════════════════════════════════════════════════════
// PROMPT VALIDATION
// ══════════════════════════════════════════════════════════════════

function validateAndEnhancePrompt(imagePrompt, styleConfig, orientationConfig, sceneNumber, visualStyle) {
  let enhanced = imagePrompt;
  enhanced = enhanced.replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\s*\.?\s*/gi, '');

  // Ensure style prefix is present
  const styleCheck = styleConfig.positive.substring(0, 30).toLowerCase();
  if (!enhanced.toLowerCase().includes(styleCheck.substring(0, 20))) {
    enhanced = `${styleConfig.positive}. ${enhanced}`;
  }

 
  // Orientation
  const compHint = orientationConfig.format === 'portrait'
    ? 'vertical 9:16 frame, tall vertical composition'
    : 'widescreen 16:9 frame, wide horizontal composition';

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

  // No text rule
  if (!/no text/i.test(enhanced)) {
    enhanced += ', ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image';
  }

  // Quality suffix — style-appropriate
  if (!/masterpiece|professional|high quality/i.test(enhanced)) {
    if (isPhotoStyle) {
      enhanced += ', masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography';
    } else {
      enhanced += ', masterpiece quality, highly detailed, professional composition, best quality';
    }
  }

  return enhanced;
}

// ══════════════════════════════════════════════════════════════════
// ARC-AWARE ANIMATION DYNAMICS
// ══════════════════════════════════════════════════════════════════

function getArcAnimationGuidance(arcPosition) {
  const map = {
    setup: "SLOW, RESTRAINED motion. Wider compositions. Gentle drift or slow pan. Establish atmosphere. Camera breathes.",
    rising: "BUILDING motion energy. Gradual push-ins, steady tracking. More dynamic than setup. Momentum increasing.",
    climax: "STRONGEST motion. Tight framing, assertive camera. Quick push-ins, dramatic angles. Peak emotional energy.",
    resolution: "SOFTENED motion. Pull-back, gentle. Wider, contemplative. The emotional exhale. Calm and resolved."
  };
  return map[arcPosition] || map.rising;
}

// ══════════════════════════════════════════════════════════════════
// MAIN — PROMPT GENERATION (no compression — breakdown is authority)
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const [projects, allScenes] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scenes.filter({ project_id })
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    let pendingScenes = allScenes
      .filter(s => s.status === 'breakdown_ready')
      .sort((a, b) => a.scene_number - b.scene_number);

    if (pendingScenes.length === 0) {
      return Response.json({
        success: true, done: true,
        message: 'All scenes already have prompts.',
        total_scenes: allScenes.length
      });
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 PROMPT GENERATION`);
    console.log(`📊 ${pendingScenes.length} scenes from deterministic breakdown — converting to production prompts`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const rawStyle = project.visual_style || 'cinematic_realistic';
    const visualStyle = normalizeStyleKey(rawStyle);
    const styleConfig = styleMap[visualStyle];
    console.log(`🎨 Style: raw="${rawStyle}" → resolved="${visualStyle}"`);

    // ═══ UNIVERSAL: Append anti-crop negatives to ALL styles ═══
    const effectiveNegative = (styleConfig.negative || '') + UNIVERSAL_NEGATIVE_SUFFIX;

    const orientation = project.orientation || 'landscape';

    
    let orientationConfig;
    if (orientation === 'portrait') {
      orientationConfig = {
        format: 'portrait',
        directive: "PORTRAIT VERTICAL 9:16 format, tall vertical framing",
        composition: "Compose for VERTICAL 9:16 mobile frame: tall compositions, full body characters visible head to toe, vertical depth stacking, environment visible above and below character",
        animation: "vertical 9:16 — tilt up/down, vertical reveals, close-up push-ins, portrait motion"
      };
    } else {
      orientationConfig = {
        format: 'landscape',
        directive: "LANDSCAPE HORIZONTAL 16:9 widescreen, wide cinematic framing",
        composition: "Compose for WIDESCREEN 16:9: wide establishing shots, rule of thirds, horizontal leading lines, foreground/midground/background depth, full body characters within environment",
        animation: "widescreen 16:9 — horizontal pans, dolly forward/back, crane shots, lateral parallax"
      };
    }

    const framingPrefix = "Full body wide shot showing complete scene from head to feet, detailed sharp environment with visible props and architecture, character mid-action in a populated world";
const promptPrefix = `${framingPrefix}, ${styleConfig.positive}, ${orientationConfig.directive}`;

    let characters = [];
    if (project.character_descriptions) {
      try { characters = JSON.parse(project.character_descriptions); } catch (_) {}
    }
    const characterBlock = characters.length > 0
      ? `**CHARACTERS (embed FULL physical description into every prompt where they appear):**\n${characters.map(c => `• ${c.name}: ${c.visual_description || c.description || ''}`).join('\n')}`
      : '';

    let storyContext = '';
    let blueprintSceneMap = {}; // scene_number → director data from blueprint
    try {
      const blueprint = JSON.parse(project.scene_blueprint);
      const sa = blueprint.story_analysis;
      storyContext = `**STORY:** Theme: ${sa.central_theme} | Visual World: ${sa.visual_world} | Color Arc: ${sa.color_arc} | Motifs: ${JSON.stringify(sa.recurring_visual_motifs)}`;

      // Build lookup map from blueprint scenes (where breakdown stores director data)
      if (blueprint.scenes && Array.isArray(blueprint.scenes)) {
        for (const bs of blueprint.scenes) {
          if (bs.scene_number) {
            blueprintSceneMap[bs.scene_number] = bs;
          }
        }
        console.log(`📋 Loaded ${Object.keys(blueprintSceneMap).length} scenes from blueprint`);
      }
    } catch (_) {
      storyContext = `**STORY:** Topic: "${project.name}" | Niche: ${project.niche || 'general'}`;
    }

    console.log(`🎨 Generating prompts for ${pendingScenes.length} scenes`);
    console.log(`🖼️ Style: ${visualStyle} | 📐 ${orientation}`);

    let totalPrompts = 0;
    let totalWarnings = 0;
    const totalBatches = Math.ceil(pendingScenes.length / BATCH_SIZE);

    for (let bIdx = 0; bIdx < totalBatches; bIdx++) {
      const batchScenes = pendingScenes.slice(bIdx * BATCH_SIZE, (bIdx + 1) * BATCH_SIZE);
      if (batchScenes.length === 0) break;

      if (bIdx > 0) await new Promise(r => setTimeout(r, 2000));

      const scenesWithNotes = batchScenes.map(scene => {
        // Priority 1: Blueprint scenes (where phase-based breakdown stores director data)
        // Priority 2: DIRECTOR_NOTES: prefix in image_prompt (deterministic breakdown format)
        // Priority 3: null (generate from narration only)
        let director = blueprintSceneMap[scene.scene_number] || null;
        if (!director) {
          director = extractDirectorNotes(scene.image_prompt);
        }
        return { scene_number: scene.scene_number, scene_id: scene.id, narration_text: scene.narration_text, director };
      });

      const sceneDirections = scenesWithNotes.map(s => {
        const arcAnim = getArcAnimationGuidance(s.director?.arc_position || 'rising');
        if (!s.director) {
          return `Scene ${s.scene_number}: (No director notes — generate from narration)\n  Narration: "${s.narration_text}"\n  Arc Animation: ${arcAnim}`;
        }
        return `Scene ${s.scene_number}:
  Narration: "${s.narration_text}"
  Visual Concept: ${s.director.visual_concept}
  Shot Type: ${s.director.shot_type}
  Camera Angle: ${s.director.camera_angle}
  Camera Movement: ${s.director.camera_movement}
  Lighting: ${s.director.lighting}
  Color Palette: ${s.director.color_palette}
  Mood: ${s.director.mood}
  DOF: ${s.director.depth_of_field}
  Niche Element: ${s.director.niche_visual_element || 'N/A'}
  Continuity: ${s.director.continuity_bridge || 'N/A'}
  Intensity: ${s.director.emotional_intensity || 0.5}
  Arc Position: ${s.director.arc_position || 'rising'}
  Arc Animation: ${arcAnim}`;
      }).join('\n\n');

      const styleBodyRules = getStyleSceneBodyRules(visualStyle);
      const styleBodyBlock = styleBodyRules ? `
**═══════════════════════════════════════════════════════════════**
**HOW TO DESCRIBE SCENE CONTENT IN "${visualStyle}" STYLE:**
**Characters:** ${styleBodyRules.characters}
**Environments:** ${styleBodyRules.environments}
**Objects & Props:** ${styleBodyRules.objects}
**Rendering Language:** ${styleBodyRules.rendering}
**═══════════════════════════════════════════════════════════════**` : '';

      const prompt = `**MISSION: Convert Director's Notes → Production-Ready Image & Animation Prompts**

${storyContext}

${characterBlock}
${styleReinforcement}

**VISUAL STYLE: "${visualStyle}"**
**ORIENTATION:** ${orientationConfig.format}

**STYLE PREFIX (prepended automatically — you still MUST start each image_prompt with it):**
"${styleConfig.positive}"
${styleBodyBlock}

**UNIVERSAL FRAMING RULES (apply to ALL visual styles):**
- Show characters FULL BODY (head to feet) in most scenes — NOT torso-only or bust crops unless specifically an ECU emotional beat
- Describe the ENVIRONMENT in detail FIRST (location, architecture, props, weather, textures) THEN place characters within it doing an ACTION
- Characters must be DOING something — holding, reaching, walking, gesturing, interacting — NOT standing static facing camera
- Backgrounds must be SHARP and DETAILED with visible props and architecture, not blurred to nothing
- Include foreground elements for depth and scene richness (objects on tables, plants, tools, fences, etc.)
- Each scene must contain a visual CONTINUITY element connecting to adjacent scenes (shared prop, color shift, gesture echo, location transform)
- NEVER generate an isolated character portrait against a blank or blurred background — always place them IN a detailed world
- Include other people in scenes where the story calls for it — the character lives in a populated world

**DIRECTOR'S SCENE NOTES:**
${sceneDirections}

**YOUR TASK — for EACH scene produce:**

1. **image_prompt** — Production-ready AI image generation prompt:
   - START with the style prefix: "${styleConfig.positive}."
   - Then add orientation: "${orientationConfig.directive}."
   - Then write the SCENE BODY describing what's actually in the frame:
     • Describe the ENVIRONMENT and SETTING first — location, weather, architecture, props, atmosphere
     • Then place characters FULL BODY within that environment, doing a specific ACTION
     • Use the style body rules above to describe characters, environments, and objects
     • The scene body is WHERE the visual style really shows — describe characters with the style's specific features
     • Embed shot type and composition from director notes
     • If characters appear → embed FULL physical description USING THE STYLE'S CHARACTER RULES
     • ${orientationConfig.composition}
   - FORBIDDEN: text, words, letters, numbers, charts, graphs, signs in the image
   - Abstract concepts → PHYSICAL METAPHORS
   - End with: "ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image"

2. **animation_prompt** — RICH, CINEMATIC ${CLIP_DURATION}-second motion direction:
   - NOT a simple camera instruction — a FULL MOTION POEM describing everything that moves over ${CLIP_DURATION} seconds.
   - **Include ALL layers:**
     a) **CAMERA MOTION**: Specific movement with speed, direction, framing change
     b) **ATMOSPHERIC MOTION**: Dust motes, fog, light shifting, rain, leaves, fabric rippling, steam
     c) **SUBJECT MOTION**: Breathing, hair shifting, fingers tightening, eyes darting, fabric settling
     d) **LIGHT DYNAMICS**: Rays creeping across surfaces, firelight dancing, shadows drifting
     e) **DEPTH SHIFTS**: Rack focus, DOF breathing, focus pulls revealing detail
     f) **EMOTIONAL QUALITY**: "heavy and reluctant" vs "urgent and searching" vs "tender and hesitant"
   - **ARC POSITION**: ${orientationConfig.animation}
     • SETUP: Slow, contemplative. Camera observes with patience.
     • RISING: Building momentum. Camera grows bolder.
     • CLIMAX: Peak intensity. Dynamic camera. Every element vibrates.
     • RESOLUTION: Exhale. Camera pulls back gently. Peace settles.
   - **MINIMUM 3-4 rich sentences** — NEVER generic "slow pan right"

**RESPONSE:**
{
  "prompts": [
    {
      "scene_number": 1,
      "image_prompt": "[style prefix]. [orientation]. [ENVIRONMENT FIRST, then FULL BODY character mid-action within it, using style-specific rules]... ABSOLUTELY NO text...",
      "animation_prompt": "[motion direction]"
    }
  ]
}`;

      console.log(`🎨 Batch ${bIdx + 1}/${totalBatches}: scenes ${batchScenes[0].scene_number}-${batchScenes[batchScenes.length - 1].scene_number}...`);

      const result = await callGemini(prompt, 0.7, 16384);

      if (!result.prompts || !Array.isArray(result.prompts)) {
        console.error(`Batch ${bIdx + 1} returned no prompts array`);
        continue;
      }

      const updatePromises = scenesWithNotes.map(async (s) => {
        const generated = result.prompts.find(p => p.scene_number === s.scene_number);

        let imagePrompt, animationPrompt;

        if (generated) {
          imagePrompt = validateAndEnhancePrompt(
            generated.image_prompt || '', styleConfig, orientationConfig, s.scene_number, visualStyle
          );
          animationPrompt = generated.animation_prompt || '';
          if (animationPrompt.length < 80) {
            const arc = s.director?.arc_position || 'rising';
            const mood = s.director?.mood || 'contemplative';
            const movement = s.director?.camera_movement || 'slow drift forward';
            animationPrompt = `${movement} over ${CLIP_DURATION} seconds. ${getArcAnimationGuidance(arc)} Atmospheric particles drift lazily through the frame. Subtle breathing motion on subject. Light shifts gradually, casting evolving shadows. The mood is ${mood} — every micro-movement reflects this emotional weight.`;
          }
        } else {
          console.warn(`⚠️ Scene ${s.scene_number} missing from response — building fallback`);
          totalWarnings++;

          let fallback = `${promptPrefix}. `;
          if (s.director) {
            fallback += `${s.director.shot_type}. ${s.director.visual_concept}. `;
            fallback += `${s.director.lighting}. Color palette: ${s.director.color_palette}. `;
            fallback += `${s.director.depth_of_field}. Mood: ${s.director.mood}. `;
          } else {
            fallback += `Cinematic scene depicting: ${s.narration_text}. Professional composition. `;
          }

          imagePrompt = validateAndEnhancePrompt(fallback, styleConfig, orientationConfig, s.scene_number, visualStyle);
          const arc = s.director?.arc_position || 'rising';
          const mood = s.director?.mood || 'contemplative';
          const movement = s.director?.camera_movement || 'slow drift forward';
          animationPrompt = `${movement} over ${CLIP_DURATION} seconds. ${getArcAnimationGuidance(arc)} Fine dust particles float through volumetric light beams, drifting with invisible air currents. Subject exhibits subtle breathing rhythm — chest rises and falls gently, fabric settles. Light evolves slowly across the frame, warm tones shifting and shadows deepening. The emotional quality is ${mood} — motion feels weighted with this energy. Shallow depth of field breathes subtly, bokeh orbs pulse with ambient light.`;
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
      total_scenes: pendingScenes.length
    });

  } catch (error) {
    console.error("❌ generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

