// ══════════════════════════════════════════════════════════════════
// PATCH SUMMARY — 5 targeted fixes for hallucination/duplication:
//
// FIX 1: styleMap — split style `positive` into `rendering` + `default_env`
//         Rendering-only keywords go into every prompt.
//         Default env keywords are ONLY injected when no scene env is provided.
//
// FIX 2: detectSceneEnvironmentType() — classify director notes as
//         INDOOR / OUTDOOR / ABSTRACT before building the prompt.
//         Strips conflicting environment tokens from the style prefix.
//
// FIX 3: buildStylePrefix() — constructs the style prefix dynamically,
//         removing any env keywords that contradict the detected scene type.
//
// FIX 4: styleBodyRules.environments — replace static strings with a
//         function that takes the detected env type and returns matching copy.
//
// FIX 5: LLM prompt gains an explicit "ONE SINGLE CHARACTER" line
//         and a hard negative anchor derived from the actual scene,
//         stopping the duplicate-figure / floating-head hallucination.
// ══════════════════════════════════════════════════════════════════

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const BASE_BATCH_SIZE = 12;
const CLIP_DURATION = 5;

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
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function extractDirectorNotes(imagePrompt) {
  if (!imagePrompt) return null;
  if (imagePrompt.startsWith('DIRECTOR_NOTES:')) {
    try { return JSON.parse(imagePrompt.substring('DIRECTOR_NOTES:'.length)); }
    catch (_) { return null; }
  }
  return null;
}

function normalizeStyleKey(raw) {
  if (!raw) return 'cinematic_realistic';
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (styleMap[normalized]) return normalized;
  for (const key of Object.keys(styleMap)) {
    if (normalized.includes(key) || key.includes(normalized)) return key;
  }
  if (normalized.includes('skeleton')) return 'skeleton_protagonist';
  return 'cinematic_realistic';
}

// ══════════════════════════════════════════════════════════════════
// FIX 1 — styleMap restructured: `rendering` (always injected) +
//          `default_env` (only injected when scene has no env context)
//          `positive` kept for backward compat = rendering + default_env
//          `negative` unchanged
// ══════════════════════════════════════════════════════════════════

const styleMap = {
  cinematic_realistic: {
    rendering: "Cinematic film still, ARRI Alexa 65, anamorphic Panavision lenses, beautiful lens flare, chromatic aberration, shallow depth of field f/1.4, creamy bokeh, dramatic three-point lighting, strong rim light, teal and orange LUT, subtle Kodak Vision3 film grain, Hollywood blockbuster cinematography, photorealistic rendering, 8K resolution",
    default_env: "volumetric god rays through atmosphere",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "cartoon, anime, illustration, painting, drawing, sketch, 3D render, CGI, video game, cel shaded, flat colors, clipart, comic book, manga, stylized, amateur, low quality, blurry, distorted, deformed, oversaturated"
  },

  photorealistic_4k: {
    rendering: "Ultra-photorealistic DSLR photograph, Canon EOS R5, RF 85mm f/1.2 L lens, razor-sharp focus, natural ambient lighting, professional color grading, editorial photography, visible skin texture and pores, accurate shadows and highlights, real-world proportions, zero AI artifacts, 8K RAW quality",
    default_env: "natural environment with realistic architecture and materials",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "cartoon, anime, CGI, 3D render, painting, digital art, stylized, unrealistic, soft focus, beauty filter, over-processed, HDR overdone"
  },

  anime: {
    rendering: "High-quality anime illustration, Studio Ghibli meets modern anime, vibrant saturated colors, clean linework, cel-shaded with soft gradients, expressive detailed eyes, detailed hair with natural flow, professional anime production quality",
    default_env: "colorful anime background art with atmospheric perspective",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, live action, photograph, 3D render, western cartoon, rough sketch, inconsistent style, off-model, chibi, super deformed"
  },

  cinematic_anime: {
    rendering: "Cinematic anime key visual, Makoto Shinkai and Ufotable production quality, dramatic volumetric lighting with god rays, sharp character linework with subtle cel shading, rich color grading with vibrant highlights and deep shadows, anamorphic lens effects, film grain overlay, widescreen cinematic composition, professional anime feature film quality",
    default_env: "ultra-detailed background art with atmospheric depth",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, live action, photograph, chibi, super deformed, rough sketch, flat colors, low budget, inconsistent proportions, western cartoon"
  },

  cartoon_2d: {
    rendering: "High-quality 2D cartoon illustration, bold clean outlines, vibrant flat colors with subtle gradients, expressive character design, dynamic poses, professional vector-quality artwork, Cartoon Network and Disney Channel production quality, smooth color fills, playful proportions, appealing character design, clean composition",
    default_env: "bright cheerful cartoon background",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, photograph, 3D render, anime, sketch, rough, painterly, dark, gritty, horror, complex textures, film grain"
  },

  picstory_cocomelon: {
    rendering: "Adorable 3D rendered children's animation style, CoComelon and Pixar Junior quality, soft rounded characters with big expressive eyes, pastel color palette with bright accents, smooth plastic-like textures, warm studio lighting, cheerful and friendly atmosphere, child-safe wholesome imagery, toy-like proportions, gentle soft shadows, nursery rhyme aesthetic",
    default_env: "bright cheerful 3D environment",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, scary, dark, horror, sharp edges, complex, adult themes, violence, anime, sketch, painterly, gritty"
  },

  cinematic_picstory: {
    rendering: "Cinematic 3D animated feature film quality, Pixar and DreamWorks level rendering, dramatic studio lighting with rim lights, rich color grading, detailed textures with subsurface scattering on skin, expressive stylized characters with realistic proportions, depth of field with bokeh, volumetric atmosphere, professional animated feature film composition, emotional cinematography",
    default_env: "richly detailed cinematic 3D environment",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "flat 2D, sketch, anime linework, rough, low quality, uncanny valley, photorealistic human, cheap 3D, mobile game quality"
  },

  oil_painting: {
    rendering: "Masterful oil painting on canvas, visible thick impasto brushstrokes, rich pigment texture, classical fine art composition, Rembrandt and Vermeer lighting with chiaroscuro, warm varnish glow, gallery-quality artwork, traditional glazing technique with luminous depth, painterly color mixing on canvas, museum masterpiece quality",
    default_env: "classical fine art setting",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, digital, smooth, flat, cartoon, anime, 3D render, CGI, vector, clean lines, modern"
  },

  watercolor: {
    rendering: "Beautiful traditional watercolor painting on textured cold-press paper, soft translucent color washes with visible paper grain, delicate wet-on-wet blending, controlled bleeding edges, subtle granulation, luminous transparency where white paper shows through, gentle color harmonies, professional fine art watercolor technique, botanical illustration quality",
    default_env: "soft watercolor environment",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, digital, oil painting, acrylic, cartoon, anime, 3D render, sharp edges, flat colors, bold outlines, heavy saturation"
  },

  comic_book: {
    rendering: "Professional comic book art, bold black ink outlines, dynamic panel composition, halftone dot shading, vibrant saturated colors with dramatic shadows, superhero and graphic novel aesthetic, Marvel and DC Comics quality artwork, strong action lines, dramatic foreshortening, professional sequential art, Ben-Day dots and cross-hatching",
    default_env: "dynamic comic book environment",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, photograph, soft, watercolor, painterly, anime, 3D render, pastel, muted colors, blurry, sketchy"
  },

  humpty_dumpty: {
    rendering: "Charming storybook illustration style, whimsical hand-drawn quality with gentle watercolor washes, rounded friendly character designs, fairy tale aesthetic, warm nostalgic nursery rhyme atmosphere, soft golden lighting, vintage children's book illustration quality, Maurice Sendak and Beatrix Potter inspired, delicate cross-hatching with pastel tones",
    default_env: "enchanted storybook world",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, modern, dark, scary, anime, 3D render, flat vector, bold colors, adult themes, sharp geometric"
  },

  harry_potter: {
    rendering: "Magical fantasy world with warm candlelight and mysterious atmosphere, rich jewel-tone color palette of deep burgundy gold and emerald, magical golden particles and ethereal glow effects, dramatic chiaroscuro lighting, weathered leather and parchment textures, enchanted artifacts with luminous properties, cozy yet mysterious British boarding school aesthetic, professional fantasy concept art quality",
    default_env: "gothic castle interior with stone textures and floating candles",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "modern, contemporary, bright fluorescent, cartoon, anime, flat colors, minimalist, sci-fi, futuristic, clinical, sterile"
  },

  "3d_whiteboard_cartoon": {
    rendering: "Clean 3D whiteboard cartoon, bold consistent black ink outlines, bright cheerful flat color fills with single-tone cel shading. Characters with friendly exaggerated proportions — larger heads, expressive eyes, thick eyebrows, simple noses, casual clothing in flat color with fold shading. All objects with bold outlines and flat color. Even ambient lighting, no harsh shadows, YouTube explainer style, approachable professional",
    // ── FIX 1 applied: removed "green grass, gradient blue skies, brick buildings" from rendering ──
    // These are env-specific, not style-specific. They go in default_env only.
    default_env: "clean isometric environment with blue teal tones, warm peach skin tones",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, photograph, 3D render, CGI, anime, painterly, watercolor, oil painting, sketch, dark, gritty, horror, film grain, lens flare, bokeh, dramatic shadows, neon, cyberpunk, fantasy, abstract, pixel art, low poly, voxel"
  },

  low_poly_3d_cartoon: {
    // ── FIX 1 CORE CHANGE: "Suburban environments — clapboard houses, white picket fences,
    //    bright green grass, faceted tree canopies, boxy vehicles. Bright gradient sky,
    //    geometric clouds, warm sunlight." REMOVED from `rendering`.
    //    These tokens were causing the outdoor suburban hallucination on indoor scenes.
    //    They now live ONLY in `default_env` and are stripped by buildStylePrefix()
    //    whenever director notes indicate an indoor/abstract scene.
    rendering: "Stylized low-poly 3D cartoon, all geometry from visible flat-shaded polygons and triangular facets. Exaggerated proportions — oversized heads, angular noses, large round eyes, thick eyebrows. Chunky geometric hair, warm peach-tan skin with polygon-edge shading. Clothing with visible folds and flat polygon faces. Vibrant saturated colors, clean polygon edges, no smoothing, matte clay-toy quality, soft ambient occlusion, Pixar expressiveness with geometric stylization",
    default_env: "suburban environment — clapboard houses, white picket fences, bright green grass, faceted tree canopies, boxy vehicles, bright gradient sky, geometric clouds, warm sunlight",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "photorealistic, photograph, smooth high-poly, hyperrealistic, film grain, lens flare, bokeh, anime, cel-shaded, 2D flat, hand-drawn, sketch, watercolor, oil painting, dark horror, neon cyberpunk, abstract, pixel art, voxel art, wireframe, monochrome, desaturated, ray-traced, photogrammetry"
  },

  skeleton_protagonist: {
    rendering: "Full body wide shot showing complete scene from head to feet, photorealistic detailed environment with sharp background, multiple people in frame, cinematic establishing shot composition, the main character is a transparent glass-bodied skeleton with ivory bones and expressive brown amber eyeballs, character shown full body anatomy in a richly detailed real-world location interacting with photorealistic humans, golden hour volumetric lighting, HDR cinematic lens, 4K detail, warm amber grading",
    default_env: "richly detailed real-world location",
    get positive() { return `${this.rendering}. ${this.default_env}`; },
    negative: "cartoon skeleton, halloween decoration, flat 2D, anime, comic, x-ray medical, horror gore, neon, plastic toy, low quality, blurry, abstract, minimalist, sketch, painting, chibi, dia de los muertos, empty dark eye sockets, bare bones without transparent body, scary horror skeleton, torso only, bust shot, head and shoulders only, cropped at waist, isolated character on blank background, portrait crop, close-up, macro, extreme close-up, chest detail, upper body only, dark background, black background"
  }
};

const UNIVERSAL_NEGATIVE_SUFFIX = ", torso only, bust shot, cropped at waist, isolated character on blank background, portrait crop, blurred empty background";

// ══════════════════════════════════════════════════════════════════
// FIX 2 — detectSceneEnvironmentType()
// Reads director notes and narration to classify each scene as
// INDOOR / OUTDOOR / ABSTRACT before any prompt is built.
// This classification drives FIX 3 (prefix scrubbing).
// ══════════════════════════════════════════════════════════════════

function detectSceneEnvironmentType(directorNotes, narrationText) {
  const INDOOR_SIGNALS = [
    'apartment', 'room', 'office', 'kitchen', 'bedroom', 'bathroom', 'hallway',
    'corridor', 'interior', 'inside', 'indoors', 'warehouse', 'store', 'shop',
    'restaurant', 'cafe', 'hospital', 'school', 'classroom', 'library', 'basement',
    'attic', 'garage', 'lobby', 'studio', 'gym', 'bar', 'club', 'theater', 'cinema',
    'mall', 'museum', 'church', 'temple', 'home', 'house interior', 'couch', 'sofa',
    'desk', 'table', 'ceiling', 'floor tiles', 'carpet', 'lamp', 'window blinds',
    'cluttered', 'bills', 'paperwork', 'bookshelf', 'closet'
  ];

  const OUTDOOR_SIGNALS = [
    'street', 'road', 'park', 'garden', 'field', 'forest', 'mountain', 'beach',
    'ocean', 'river', 'lake', 'sky', 'outdoor', 'outside', 'yard', 'parking',
    'highway', 'sidewalk', 'plaza', 'square', 'rooftop', 'balcony', 'porch',
    'driveway', 'suburb', 'neighborhood', 'city street', 'alley', 'bridge'
  ];

  const ABSTRACT_SIGNALS = [
    'void', 'darkness', 'light', 'dream', 'memory', 'metaphor', 'concept',
    'abstract', 'symbolic', 'liminal', 'floating', 'infinite', 'ethereal',
    'mindscape', 'visualize', 'represent', 'imagine'
  ];

  const haystack = [
    directorNotes?.visual_concept || '',
    directorNotes?.shot_type || '',
    narrationText || ''
  ].join(' ').toLowerCase();

  const indoorScore = INDOOR_SIGNALS.filter(s => haystack.includes(s)).length;
  const outdoorScore = OUTDOOR_SIGNALS.filter(s => haystack.includes(s)).length;
  const abstractScore = ABSTRACT_SIGNALS.filter(s => haystack.includes(s)).length;

  if (abstractScore > indoorScore && abstractScore > outdoorScore) return 'abstract';
  if (indoorScore > outdoorScore) return 'indoor';
  if (outdoorScore > indoorScore) return 'outdoor';
  return 'outdoor'; // default fallback — outdoor suburban is the style default
}

// ══════════════════════════════════════════════════════════════════
// FIX 3 — buildStylePrefix()
// Constructs the style prefix dynamically based on scene env type.
// For INDOOR scenes: strips outdoor env keywords from the prefix.
// For OUTDOOR scenes: uses the full prefix including default_env.
// For ABSTRACT scenes: strips ALL env keywords, keeps rendering only.
// ══════════════════════════════════════════════════════════════════

// Keywords that belong to outdoor/default environments for each style.
// These are removed from the prefix when the scene is INDOOR or ABSTRACT.
const STYLE_OUTDOOR_ENV_TOKENS = {
  low_poly_3d_cartoon: [
    'suburban environment', 'clapboard houses', 'white picket fences',
    'bright green grass', 'faceted tree canopies', 'boxy vehicles',
    'bright gradient sky', 'geometric clouds', 'warm sunlight',
    'suburban', 'picket fence', 'green grass'
  ],
  "3d_whiteboard_cartoon": [
    'green grass fields', 'gradient blue skies', 'brick buildings',
    'clean isometric environment'
  ],
  cinematic_realistic: ['volumetric god rays through atmosphere'],
  harry_potter: ['gothic castle interior', 'stone textures', 'floating candles'],
  // Add more styles here as needed
};

function buildStylePrefix(visualStyle, styleConfig, envType) {
  // OUTDOOR: return full positive (rendering + default_env) — style's natural habitat
  if (envType === 'outdoor') {
    return styleConfig.positive;
  }

  // INDOOR or ABSTRACT: start with rendering only, strip outdoor env tokens
  let prefix = styleConfig.rendering;

  // Additional scrub: remove any tokens from the outdoor list for this style
  const tokensToStrip = STYLE_OUTDOOR_ENV_TOKENS[visualStyle] || [];
  for (const token of tokensToStrip) {
    // Case-insensitive removal of the token and any trailing comma/space
    const re = new RegExp(`,?\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^,]*`, 'gi');
    prefix = prefix.replace(re, '');
  }

  // Clean up any double commas or leading/trailing commas left behind
  prefix = prefix.replace(/,\s*,/g, ',').replace(/^\s*,|,\s*$/g, '').trim();

  return prefix;
}

// ══════════════════════════════════════════════════════════════════
// FIX 4 — getStyleSceneBodyRules() now takes envType parameter
// The `environments` field returns scene-appropriate language
// instead of always describing suburban outdoors.
// ══════════════════════════════════════════════════════════════════

function getStyleSceneBodyRules(styleName, envType = 'outdoor') {
  // Indoor environment descriptions per style
  const indoorEnvDescriptions = {
    low_poly_3d_cartoon: "Interior space built entirely from flat-shaded polygon facets — wood-paneled walls, geometric furniture, polygon-edge tiled floors, boxy appliances, faceted ceiling fixtures, stacked geometric objects. Every surface shows polygon edges. Warm interior lighting from low-poly lamps.",
    "3d_whiteboard_cartoon": "Interior with flat-colored walls, cartoon furniture with bold outlines, tiled floor in single-tone shading, window with simple frame, overhead light casting even ambient glow. Clean and uncluttered whiteboard cartoon aesthetic.",
    cinematic_realistic: "Real interior location with architectural accuracy — plaster walls, hardwood or tile floors, natural light from windows, practical lamps, realistic furniture materials, authentic domestic or commercial setting.",
    anime: "Anime interior — painted background with warm lighting, stylized furniture and decorations, atmospheric perspective suggesting depth, soft color gradients on walls and floor.",
    cinematic_anime: "Cinematic anime interior — Makoto Shinkai quality backgrounds, dramatic window light with god rays, ultra-detailed walls and furniture, rich atmospheric depth.",
    default: "Interior space with visible walls, floor, ceiling, furniture, and props appropriate to the scene's setting."
  };

  // Outdoor environment descriptions per style  
  const outdoorEnvDescriptions = {
    low_poly_3d_cartoon: "All surfaces from visible flat-shaded triangular polygons. Suburban houses, porches with white railings, geometric roofs, white picket fences. Bright green grass planes, chunky faceted tree canopies. Sidewalks, asphalt roads. Bright gradient sky, geometric cloud clusters.",
    "3d_whiteboard_cartoon": "Clean isometric outdoor environment — green grass fields with bright yellow-green, gradient blue skies, brick buildings with clean window outlines. Sky blue and teal tones throughout.",
    cinematic_realistic: "Real-world exterior with architectural accuracy, natural materials, weather and atmospheric effects, natural lighting.",
    default: "Outdoor environment with visible sky, ground, structures, and natural elements appropriate to the scene."
  };

  const envDescriptions = envType === 'indoor' ? indoorEnvDescriptions : outdoorEnvDescriptions;
  const envDesc = envDescriptions[styleName] || envDescriptions.default;

  const rules = {
    cinematic_realistic: {
      characters: "Describe characters with photorealistic detail — skin texture, real clothing fabrics, natural hair, realistic body proportions.",
      environments: envDesc,
      objects: "Props with realistic material properties — metal reflections, fabric weave, glass transparency, leather grain.",
      rendering: "Use cinematic camera language freely — ARRI, anamorphic, bokeh, f-stops, film grain, color LUT."
    },
    photorealistic_4k: {
      characters: "Photograph-quality humans with visible pores, real fabric textures, natural hair strands, authentic expressions.",
      environments: envDesc,
      objects: "Objects with photographic material accuracy — reflections, textures, wear and patina.",
      rendering: "DSLR photography language — Canon/Sony, real lens specs, natural lighting, RAW quality."
    },
    anime: {
      characters: "Anime-style characters with large expressive eyes, cel-shaded skin, stylized colorful hair, clean linework, exaggerated expressions.",
      environments: envDesc,
      objects: "Objects drawn with clean anime linework, flat color fills with subtle highlight/shadow cel-shading.",
      rendering: "Describe as anime illustration. Use terms: cel-shaded, linework, color fills, anime eyes, Studio Ghibli style."
    },
    cinematic_anime: {
      characters: "Cinematic anime characters — sharp detailed linework, subtle cel-shading, dramatic lighting on faces, flowing hair with light interaction.",
      environments: envDesc,
      objects: "Anime-rendered objects with cinematic lighting — dramatic rim lights, volumetric atmosphere, sharp detail.",
      rendering: "Cinematic anime language — god rays, volumetric lighting, dramatic color grading, anime linework and cel-shading."
    },
    cartoon_2d: {
      characters: "2D cartoon characters with bold black outlines, flat vibrant color fills, exaggerated proportions, big expressive faces, dynamic poses.",
      environments: envDesc,
      objects: "Cartoon-style objects with clean outlines, flat colors, slightly exaggerated proportions, playful design.",
      rendering: "Cartoon Network / Disney Channel quality. Bold outlines, flat colors, no photorealistic terms."
    },
    picstory_cocomelon: {
      characters: "Soft rounded 3D characters with big expressive eyes, plastic-smooth skin, pastel clothing, toy-like proportions, cheerful expressions.",
      environments: envDesc,
      objects: "Smooth plastic-textured 3D objects, rounded edges, bright pastel colors, toy-like quality.",
      rendering: "CoComelon/Pixar Junior 3D rendering — soft shadows, warm studio lighting, smooth plastic textures."
    },
    cinematic_picstory: {
      characters: "Pixar/DreamWorks quality 3D characters — expressive stylized faces, realistic proportions, subsurface scattering on skin, detailed clothing.",
      environments: envDesc,
      objects: "High-quality 3D rendered objects with detailed materials, dramatic lighting, depth of field.",
      rendering: "Pixar/DreamWorks animated feature film quality — dramatic lighting, subsurface scattering, cinematic composition."
    },
    oil_painting: {
      characters: "Characters rendered with visible impasto brushstrokes, rich pigment skin tones, classical portrait technique, painterly soft edges.",
      environments: envDesc,
      objects: "Objects painted with rich pigment layers, visible brush texture, warm varnish glow, classical still-life technique.",
      rendering: "Fine art oil painting language — impasto, glazing, chiaroscuro, Rembrandt lighting, canvas texture."
    },
    watercolor: {
      characters: "Characters rendered in soft watercolor washes — translucent skin tones, gentle bleeding edges, paper grain showing through.",
      environments: envDesc,
      objects: "Objects painted with translucent watercolor layers, controlled bleeding edges, subtle granulation.",
      rendering: "Traditional watercolor technique — translucent washes, paper grain, wet-on-wet blending, luminous transparency."
    },
    comic_book: {
      characters: "Comic book characters with bold black ink outlines, halftone dot shading on skin, vibrant flat colors, dramatic foreshortening, dynamic action poses.",
      environments: envDesc,
      objects: "Objects with bold ink outlines, halftone dots, Ben-Day dot patterns, dramatic shadows.",
      rendering: "Marvel/DC Comics quality — bold ink, halftone dots, action lines, dramatic foreshortening."
    },
    humpty_dumpty: {
      characters: "Whimsical storybook characters — rounded friendly shapes, gentle watercolor washes, warm nostalgic feel, fairy tale proportions.",
      environments: envDesc,
      objects: "Storybook objects with delicate cross-hatching, gentle watercolor fills, vintage children's book charm.",
      rendering: "Maurice Sendak / Beatrix Potter inspired — hand-drawn, watercolor washes, warm nostalgic nursery rhyme feel."
    },
    harry_potter: {
      characters: "Fantasy characters in robes and wizard attire, warm candlelit skin tones, weathered textures, magical glow effects on faces.",
      environments: envDesc,
      objects: "Enchanted artifacts with luminous properties, weathered leather, parchment textures, magical golden glow.",
      rendering: "Fantasy concept art — warm candlelight, gothic textures, magical particles, jewel-tone color palette."
    },
    "3d_whiteboard_cartoon": {
      characters: "Characters with bold consistent black ink outlines, flat color fills with single-tone cel-shading, friendly exaggerated proportions — larger heads, expressive cartoon eyes, thick eyebrows. Clothing rendered as flat color with subtle darker-tone fold shading. Skin in warm browns and peach tones.",
      environments: envDesc,
      objects: "ALL objects rendered with bold black outlines and flat color fills. Clearly identifiable with labeled visual metaphors.",
      rendering: "YouTube explainer / business education cartoon style — approachable, friendly, professional, visually clean. Even ambient lighting, no harsh shadows."
    },
    low_poly_3d_cartoon: {
      characters: "Low-poly 3D characters from visible flat-shaded polygon facets — oversized heads, angular protruding noses, large expressive round eyes, thick geometric eyebrows. Chunky geometric hair. Warm peach-tan skin with polygon-edge shading. Blocky hands. Clothing with visible folds and flat polygon faces.",
      // ── FIX 4 APPLIED: environments now returns indoor OR outdoor copy ──
      environments: envDesc,
      objects: "All objects as low-poly geometric forms — boxy furniture, geometric appliances, every surface shows polygon edges and flat-shaded faces. Matte plastic quality like clay toys.",
      rendering: "Clean polygon edges on all surfaces, flat-shaded with no smoothing (signature faceted look). Soft ambient occlusion, gentle directional shadows, no outlines or cel-shading. Vibrant saturated colors, warm and inviting."
    },
    skeleton_protagonist: {
      characters: "Protagonist in EVERY scene: photorealistic transparent skeleton with clear glass-like body shell, glossy ivory bones visible through translucent torso, big round expressive brown/amber EYEBALLS in skull sockets. MUST be shown FULL BODY head-to-toe. Wears context-appropriate clothing. Must be DOING an action.",
      environments: envDesc,
      objects: "Photorealistic props the skeleton is actively interacting with — tools, objects being held or carried, furniture being used.",
      rendering: "Cinematic wide-to-medium framing showing full body within environment. HDR cinematic lens, warm amber grading, dramatic volumetric golden hour lighting. Sharp detailed backgrounds."
    }
  };

  const base = rules[styleName] || null;
  if (base) {
    base.rendering = (base.rendering || '') + ' Frame characters full body head-to-toe in most scenes. Show detailed sharp environments with visible props and architecture, not empty blurred backgrounds.';
  }
  return base;
}

function getStyleReinforcementInstruction(visualStyle) {
  const universalReinforcement = `
**🎬 MANDATORY PRODUCTION RULES (ALL STYLES):**

ENVIRONMENT-FIRST: Every image_prompt must describe the LOCATION and SETTING in the first 1-2 sentences BEFORE mentioning any character.

SINGLE CHARACTER RULE: There is ONE instance of each character in the scene. NEVER render the same character twice at different scales. NEVER render a giant floating head alongside a full-body figure. ONE body per character name.

FULL-BODY ACTION: Characters shown FULL BODY (head to feet) in 80% of scenes. They must be DOING an action. NEVER static standing portrait facing camera.

CAMERA DIRECTION: Each image_prompt must specify a SHOT TYPE and it must DIFFER from adjacent scenes.

POPULATED WORLD: Include other people, objects, vehicles, animals in MOST scenes.

THREE-LAYER DEPTH: Every scene has foreground, midground (character + action), background.

EMOTIONAL LIGHTING: Specify light SOURCE, DIRECTION, and MOOD.

BODY LANGUAGE: Characters express emotion through POSTURE.

CONTINUITY: Each scene must contain a visual element that connects to the next scene.
`;

  const instructions = {
    skeleton_protagonist: universalReinforcement + `
**🦴 SKELETON PROTAGONIST STYLE — ADDITIONAL RULES:**
The protagonist in EVERY image prompt must be described as: "a photorealistic transparent skeleton with a clear glass-like semi-transparent humanoid body shell, glossy ivory bones visible through the translucent torso, big round expressive brown amber eyeballs in the skull sockets"

- Show the skeleton FULL BODY in MOST scenes
- Describe the ENVIRONMENT in detail FIRST then place the skeleton within it
- Include other photorealistic humans in most scenes
- NEVER empty dark eye sockets — always BIG ROUND EXPRESSIVE BROWN/AMBER EYEBALLS
- NEVER torso-only portrait against blurred background`
  };
  return instructions[visualStyle] || universalReinforcement;
}

// ══════════════════════════════════════════════════════════════════
// FIX 5 — buildSceneNegatives()
// Generates a scene-specific negative prompt by combining:
//   a) The style's base negative
//   b) Universal anti-crop suffix
//   c) Scene-derived negatives (if indoor, add outdoor keywords as negatives)
// This is passed to the LLM as part of the prompt instruction block.
// ══════════════════════════════════════════════════════════════════

function buildSceneNegatives(visualStyle, styleConfig, envType, characterCount) {
  let negatives = styleConfig.negative + UNIVERSAL_NEGATIVE_SUFFIX;

  // Add environment-conflict negatives
  if (envType === 'indoor') {
    negatives += ', outdoor scene, open sky, picket fence, suburban street, driveway, parking lot, green lawn, trees in background, exterior building facade';
  }
  if (envType === 'abstract') {
    negatives += ', outdoor scene, indoor room, specific location, architectural setting';
  }

  // Add character-count negatives — most important fix for the duplicate head bug
  if (characterCount === 1) {
    negatives += ', two characters, duplicate figure, multiple instances of same person, giant head with small body, floating head, oversized portrait head, character appearing twice, background and foreground versions of same character';
  }

  return negatives;
}

function validateAndEnhancePrompt(imagePrompt, styleConfig, orientationConfig, sceneNumber, visualStyle) {
  let enhanced = imagePrompt;
  enhanced = enhanced.replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\s*\.?\s*/gi, '');

  const isPhotoStyle = ['cinematic_realistic', 'photorealistic_4k', 'skeleton_protagonist'].includes(visualStyle);
  if (!isPhotoStyle) {
    enhanced = enhanced.replace(/\b(shot on|ARRI|Alexa|Canon|Sony|Nikon|Panavision|anamorphic|DSLR|RAW)\b/gi, '');
    enhanced = enhanced.replace(/\b(Kodak|Vision3|film grain texture|chromatic aberration)\b/gi, '');
    enhanced = enhanced.replace(/\bf\/\d+\.?\d*\b/g, '');
    enhanced = enhanced.replace(/\b(bokeh|lens flare)\b/gi, '');
    enhanced = enhanced.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',');
  }

  enhanced = enhanced
    .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
    .replace(/\bvertical\s+\d+:\d+\s*(frame|format)?\b/gi, '')
    .replace(/\bwidescreen\s+\d+:\d+\s*(frame|format)?\b/gi, '')
    .replace(/\b\d{1,2}:\d{1,2}\s*(widescreen|vertical|horizontal|frame|format|ratio)\b/gi, '')
    .replace(/\b(wide|tall)\s+(cinematic|vertical|horizontal)\s+(framing|composition)\b/gi, '');

  if (!/masterpiece|professional|high quality/i.test(enhanced)) {
    enhanced += ', masterpiece quality, highly detailed, professional composition';
  }

  return enhanced;
}

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
// STYLE-SPECIFIC CHARACTER RENDERING TAGS (unchanged from original)
// ══════════════════════════════════════════════════════════════════

const styleCharacterRules = {
  cinematic_realistic: (desc) => `photorealistic human with ${desc}, natural skin texture with visible pores, real fabric clothing, natural hair with individual strand detail, cinematic three-point lighting on face`,
  photorealistic_4k: (desc) => `DSLR-quality photorealistic person with ${desc}, razor-sharp skin detail, real fabric textures, natural hair strands, authentic micro-expressions`,
  anime: (desc) => `anime-style character with ${desc}, large expressive detailed eyes with highlight reflections, clean sharp linework, cel-shaded smooth skin, stylized colorful flowing hair`,
  cinematic_anime: (desc) => `cinematic anime character with ${desc}, Makoto Shinkai quality rendering, sharp detailed linework with subtle cel-shading gradients, dramatic volumetric lighting on face and hair`,
  cartoon_2d: (desc) => `2D cartoon character with ${desc}, bold clean black outlines around entire body, flat vibrant color fills with subtle gradient shading, exaggerated friendly proportions`,
  picstory_cocomelon: (desc) => `adorable 3D rendered character with ${desc}, soft rounded plastic-smooth features, big sparkly expressive eyes, pastel-colored clothing, CoComelon animation quality`,
  cinematic_picstory: (desc) => `Pixar-quality 3D animated character with ${desc}, subsurface scattering on skin, detailed clothing with fabric physics, expressive stylized features, dramatic studio rim lighting`,
  oil_painting: (desc) => `oil-painted character with ${desc}, visible impasto brushstrokes on skin, classical portrait lighting with Rembrandt chiaroscuro, soft painterly edges`,
  watercolor: (desc) => `watercolor-rendered character with ${desc}, soft translucent color washes for skin with paper grain showing through, delicate wet-on-wet blending on hair`,
  comic_book: (desc) => `comic book character with ${desc}, bold black ink outlines, halftone dot shading on skin and clothing, vibrant saturated flat colors, dynamic foreshortened pose`,
  humpty_dumpty: (desc) => `whimsical storybook character with ${desc}, rounded friendly soft shapes, gentle watercolor wash coloring, warm nostalgic fairy tale proportions`,
  harry_potter: (desc) => `fantasy character with ${desc}, warm candlelit skin tones with amber glow, weathered textured robes, magical golden particle effects around edges`,
  "3d_whiteboard_cartoon": (desc) => `3D whiteboard cartoon character with ${desc}, bold consistent black ink outlines around entire body, bright cheerful flat color fills with single-tone cel-shading, friendly exaggerated proportions`,
  low_poly_3d_cartoon: (desc) => `low-poly 3D character with ${desc}, all features built from visible flat-shaded polygon facets, oversized geometric head, angular protruding nose, large round expressive eyes, chunky geometric hair blocks, warm peach-tan skin with polygon-edge shading, matte clay-toy quality`,
  skeleton_protagonist: (desc) => `photorealistic transparent skeleton with clear glass-like semi-transparent humanoid body shell, glossy ivory bones visible through translucent torso, big round expressive brown amber eyeballs in skull sockets, ${desc}, full body head-to-toe, wearing context-appropriate clothing`
};

const defaultStyleTransform = (desc) => `character with ${desc}, detailed and consistent appearance`;

// ══════════════════════════════════════════════════════════════════
// MAIN
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
      return Response.json({ success: true, done: true, message: 'All scenes already have prompts.', total_scenes: allScenes.length });
    }

    const rawStyle = project.visual_style || 'cinematic_realistic';
    const visualStyle = normalizeStyleKey(rawStyle);
    const styleConfig = styleMap[visualStyle];
    console.log(`🎨 Style: raw="${rawStyle}" → resolved="${visualStyle}"`);

    const effectiveNegative = (styleConfig.negative || '') + UNIVERSAL_NEGATIVE_SUFFIX;
    const orientation = project.orientation || 'landscape';
    const styleReinforcement = getStyleReinforcementInstruction(visualStyle);

    let orientationConfig;
    if (orientation === 'portrait') {
      orientationConfig = {
        format: 'portrait',
        directive: "PORTRAIT VERTICAL 9:16 format, tall vertical framing",
        composition: "Compose for VERTICAL 9:16 mobile frame: tall compositions, full body characters visible head to toe, vertical depth stacking",
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

    let characters = [];
    if (project.character_descriptions) {
      try { characters = JSON.parse(project.character_descriptions); } catch (_) {}
    }

    const characterBlock = characters.length > 0
      ? `**CHARACTERS (embed FULL physical description into every prompt where they appear):**\n${characters.map(c => `• ${c.name}: ${c.visual_description || c.description || ''}`).join('\n')}`
      : '';

    const styleTransform = styleCharacterRules[visualStyle] || defaultStyleTransform;
    const characterIdentityTags = {};
    for (const c of characters) {
      const name = (c.name || '').toLowerCase().trim();
      const rawDesc = c.visual_description || c.description || '';
      if (name && rawDesc) {
        const styledDesc = styleTransform(rawDesc);
        characterIdentityTags[name] = styledDesc.length > 400 ? styledDesc.substring(0, 400).trim() : styledDesc;
      }
    }

    let storyContext = '';
    let blueprintSceneMap = {};
    try {
      const blueprint = JSON.parse(project.scene_blueprint);
      const sa = blueprint.story_analysis;
      storyContext = `**STORY:** Theme: ${sa.central_theme} | Visual World: ${sa.visual_world} | Color Arc: ${sa.color_arc} | Motifs: ${JSON.stringify(sa.recurring_visual_motifs)}`;
      if (blueprint.scenes && Array.isArray(blueprint.scenes)) {
        for (const bs of blueprint.scenes) {
          if (bs.scene_number) blueprintSceneMap[bs.scene_number] = bs;
        }
      }
    } catch (_) {
      storyContext = `**STORY:** Topic: "${project.name}" | Niche: ${project.niche || 'general'}`;
    }

    const completedSoFar = allScenes.filter(s => s.status === 'prompts_ready').length;
    const BATCH_SIZE = completedSoFar > 200 ? 6 : completedSoFar > 60 ? 8 : BASE_BATCH_SIZE;
    const totalBatches = Math.ceil(pendingScenes.length / BATCH_SIZE);

    let qualityAnchors = '';
    try {
      const completedScenes = allScenes
        .filter(s => s.status === 'prompts_ready' && s.image_prompt && !s.image_prompt.startsWith('DIRECTOR_NOTES:'))
        .sort((a, b) => a.scene_number - b.scene_number);
      if (completedScenes.length >= 2) {
        const ranked = [...completedScenes]
          .sort((a, b) => (b.image_prompt?.length || 0) - (a.image_prompt?.length || 0))
          .slice(0, 3);
        qualityAnchors = `
**QUALITY REFERENCE — your output MUST match or exceed this detail level:**
${ranked.map((s, i) => `EXAMPLE ${i + 1} (Scene ${s.scene_number}):\nimage_prompt: "${s.image_prompt.substring(0, 500)}"\nanimation_prompt: "${(s.animation_prompt || '').substring(0, 200)}"`).join('\n\n')}
**Every prompt you write MUST be at least this detailed.**`;
      }
    } catch (_) {}

    let totalPrompts = 0;
    let totalWarnings = 0;

    const startBIdx = 0;
    const maxBatchesPerCall = 1;

    for (let bIdx = startBIdx; bIdx < Math.min(startBIdx + maxBatchesPerCall, totalBatches); bIdx++) {
      const batchScenes = pendingScenes.slice(bIdx * BATCH_SIZE, (bIdx + 1) * BATCH_SIZE);
      if (batchScenes.length === 0) break;
      if (bIdx > 0) await new Promise(r => setTimeout(r, 2000));

      const scenesWithNotes = batchScenes.map(scene => {
        let director = blueprintSceneMap[scene.scene_number] || null;
        if (!director) director = extractDirectorNotes(scene.image_prompt);
        return { scene_number: scene.scene_number, scene_id: scene.id, narration_text: scene.narration_text, director };
      });

      // ── FIX 2+3+4+5: Per-scene env detection → dynamic prefix → dynamic negatives ──
      // Build per-scene metadata that the LLM prompt will reference
      const sceneMetadata = scenesWithNotes.map(s => {
        const envType = detectSceneEnvironmentType(s.director, s.narration_text);
        const sceneStylePrefix = buildStylePrefix(visualStyle, styleConfig, envType);
        const sceneNegatives = buildSceneNegatives(visualStyle, styleConfig, envType, characters.length);
        return { ...s, envType, sceneStylePrefix, sceneNegatives };
      });

      // Log env detections for debugging
      sceneMetadata.forEach(s => {
        console.log(`🏠 Scene ${s.scene_number}: envType="${s.envType}" | prefix length: ${s.sceneStylePrefix.length}`);
      });

      const sceneDirections = sceneMetadata.map(s => {
        const arcAnim = getArcAnimationGuidance(s.director?.arc_position || 'rising');
        // ── FIX 5: Scene-specific negative anchor injected directly into scene data ──
        const negativeAnchor = `NEGATIVE (never include): ${s.sceneNegatives.split(',').slice(-8).join(', ')}`;
        if (!s.director) {
          return `Scene ${s.scene_number} [ENV: ${s.envType.toUpperCase()}]:
  Narration: "${s.narration_text}"
  Arc Animation: ${arcAnim}
  Style Prefix for THIS scene: "${s.sceneStylePrefix}"
  ${negativeAnchor}`;
        }
        return `Scene ${s.scene_number} [ENV: ${s.envType.toUpperCase()}]:
  Narration: "${s.narration_text}"
  Visual Concept: ${s.director.visual_concept}
  Shot Type: ${s.director.shot_type}
  Camera Angle: ${s.director.camera_angle}
  Camera Movement: ${s.director.camera_movement}
  Lighting: ${s.director.lighting}
  Color Palette: ${s.director.color_palette}
  Mood: ${s.director.mood}
  DOF: ${s.director.depth_of_field}
  Arc Animation: ${arcAnim}
  Style Prefix for THIS scene: "${s.sceneStylePrefix}"
  ${negativeAnchor}`;
      }).join('\n\n');

      // Use the first scene's styleBodyRules as the batch example
      // (each scene will get its own prefix embedded in its scene data above)
      const firstEnvType = sceneMetadata[0]?.envType || 'outdoor';
      const styleBodyRules = getStyleSceneBodyRules(visualStyle, firstEnvType);

      const styleBodyBlock = styleBodyRules ? `
**HOW TO DESCRIBE SCENE CONTENT IN "${visualStyle}" STYLE:**
**Characters:** ${styleBodyRules.characters}
**Environments (OUTDOOR):** ${getStyleSceneBodyRules(visualStyle, 'outdoor')?.environments || ''}
**Environments (INDOOR):** ${getStyleSceneBodyRules(visualStyle, 'indoor')?.environments || ''}
**Objects & Props:** ${styleBodyRules.objects}
**Rendering Language:** ${styleBodyRules.rendering}
(Use the INDOOR environment description for scenes marked [ENV: INDOOR], OUTDOOR for [ENV: OUTDOOR])` : '';

      const prompt = `**MISSION: Convert Director's Notes → Production-Ready Image & Animation Prompts**

${storyContext}

${characterBlock}
${styleReinforcement}
${qualityAnchors}

**VISUAL STYLE: "${visualStyle}"**
**ORIENTATION:** ${orientationConfig.format}

${styleBodyBlock}

**⚠️ CRITICAL RULES — READ BEFORE WRITING ANY PROMPT:**

1. SCENE ENVIRONMENT: Each scene is labeled [ENV: INDOOR], [ENV: OUTDOOR], or [ENV: ABSTRACT].
   - [ENV: INDOOR] scenes MUST describe interior spaces — walls, floors, ceilings, furniture, interior props.
     NEVER include outdoor elements (sky, picket fences, grass, trees, street) in INDOOR scenes.
   - [ENV: OUTDOOR] scenes use the full outdoor style with sky, grass, architecture.
   - Each scene has a "Style Prefix for THIS scene" — USE THAT EXACT PREFIX, not a generic one.

2. ONE BODY PER CHARACTER: Every named character appears EXACTLY ONCE in the image.
   NEVER render the same character as both a giant head AND a full body simultaneously.
   NEVER render a large-scale floating head above a small seated figure.
   There is ONE instance of each character. ONE body. ONE scale. ONE position.

3. ENVIRONMENT BEFORE CHARACTER: Describe the setting/location/environment in the FIRST sentence.
   Only after the environment is established do you describe the character and their action.

4. FULL BODY: Characters shown head-to-toe in most scenes. NOT bust shots. NOT torso-only.

5. USE THE SCENE'S STYLE PREFIX: Each scene's "Style Prefix for THIS scene" is already environment-stripped
   for that scene type. START your image_prompt with it.

**DIRECTOR'S SCENE NOTES:**
${sceneDirections}

**YOUR TASK — for EACH scene produce:**

1. **image_prompt**:
   - START with the scene's own "Style Prefix for THIS scene" field (not a generic prefix).
   - ENVIRONMENT FIRST: describe the setting in detail (location, architecture/interior, props, lighting, atmosphere).
   - CHARACTER: place ONE character full body mid-action within that environment.
     Use this pattern: "[Full physical description], [clothing], [specific action they are doing]"
     Example: "a low-poly 3D woman with oversized geometric head, angular nose, large round brown eyes, chunky geometric dark hair in a messy bun, warm peach-tan skin, wearing a worn gray polygon-fold sweater and jeans, sitting slumped on a faceted geometric couch, staring blankly at a low-poly coffee table covered in stacked polygonal bills and papers"
   - ALWAYS include full physical description — hair color, style, skin tone, eye color, clothing. Never just "Sarah" or "the woman".
   - ${orientationConfig.composition}
   - End with: "ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image"

2. **animation_prompt** — ${CLIP_DURATION}-second motion direction with ALL layers:
   a) Camera motion b) Atmospheric motion c) Subject motion d) Light dynamics e) Emotional quality
   Minimum 3-4 sentences.

**RESPONSE:**
{
  "prompts": [
    {
      "scene_number": 1,
      "image_prompt": "[scene's style prefix]. [ENVIRONMENT FIRST]. [ONE character full body mid-action]. ...",
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

      const updatePromises = sceneMetadata.map(async (s) => {
        const generated = result.prompts.find(p => p.scene_number === s.scene_number);

        let imagePrompt, animationPrompt;

        if (generated) {
          let rawPrompt = generated.image_prompt || '';
          const promptWords = rawPrompt.split(/\s+/).filter(w => w.length > 0).length;

          if (promptWords < 30) {
            console.warn(`⚠️ Scene ${s.scene_number}: only ${promptWords} words — regenerating...`);
            try {
              const soloPrompt = `Generate ONE detailed image prompt for this scene.

**VISUAL STYLE:** "${visualStyle}" — ${s.sceneStylePrefix}
**SCENE ENV TYPE:** ${s.envType.toUpperCase()}
${getStyleSceneBodyRules(visualStyle, s.envType) ? `**Environments:** ${getStyleSceneBodyRules(visualStyle, s.envType)?.environments}` : ''}

**SCENE ${s.scene_number}:**
Narration: "${s.narration_text}"
${s.director ? `Visual Concept: ${s.director.visual_concept}\nShot: ${s.director.shot_type} | Lighting: ${s.director.lighting} | Mood: ${s.director.mood}` : ''}

REQUIREMENTS: Minimum 80 words. Environment first. ONE character full body mid-action. Full physical description.
Do NOT include outdoor elements if ENV is INDOOR.
Do NOT render the same character twice at different scales.

Respond with ONLY the image_prompt text, no JSON, no labels.`;
              const soloResult = await callGemini(soloPrompt, 0.8, 4096);
              const soloText = typeof soloResult === 'string' ? soloResult : (soloResult.image_prompt || soloResult.prompt || JSON.stringify(soloResult));
              if (soloText && soloText.split(/\s+/).length > 30) {
                rawPrompt = soloText;
              }
            } catch (regenErr) {
              console.warn(`Scene ${s.scene_number} regen failed: ${regenErr.message}`);
            }
          }

          // ── Inline character identity injection (unchanged logic) ──
          const sceneCast = [];
          for (const [charName, charDesc] of Object.entries(characterIdentityTags)) {
            const namePattern = new RegExp(`\\b${charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            if (namePattern.test(rawPrompt)) {
              sceneCast.push({ name: charName, desc: charDesc });
            }
          }

          const genericRefs = /\b(the protagonist|the main character|the character|the figure|the hero|the narrator)\b/gi;
          if (genericRefs.test(rawPrompt) && characters.length > 0) {
            const primaryName = (characters[0].name || '').toLowerCase().trim();
            if (primaryName && !sceneCast.find(c => c.name === primaryName)) {
              sceneCast.unshift({ name: primaryName, desc: characterIdentityTags[primaryName] || '' });
            }
          }

          if (sceneCast.length > 0) {
            const totalCharBudget = 500;
            const perCharBudget = Math.floor(totalCharBudget / sceneCast.length);
            const inlineDescs = {};
            for (const c of sceneCast) {
              let desc = c.desc || '';
              if (desc.length > perCharBudget) {
                const lastComma = desc.lastIndexOf(',', perCharBudget);
                desc = lastComma > perCharBudget * 0.5 ? desc.substring(0, lastComma).trim() : desc.substring(0, perCharBudget).trim();
              }
              inlineDescs[c.name] = desc;
            }

            let modifiedPrompt = rawPrompt;
            for (const [charName, desc] of Object.entries(inlineDescs)) {
              if (!desc) continue;
              const escapedName = charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const descCheck = new RegExp(`\\b${escapedName}\\b[,\\s]+[^.]{40,}`, 'gi');
              if (descCheck.test(modifiedPrompt)) continue;
              const nameWithParens = new RegExp(`\\b${escapedName}\\b\\s*\\([^)]{5,}\\)`, 'gi');
              modifiedPrompt = modifiedPrompt.replace(nameWithParens, charName);
              const firstOccurrence = new RegExp(`\\b${escapedName}\\b`, 'i');
              const match = modifiedPrompt.match(firstOccurrence);
              if (match) {
                const idx = modifiedPrompt.indexOf(match[0]);
                modifiedPrompt = `${modifiedPrompt.substring(0, idx)}a ${desc}${modifiedPrompt.substring(idx + match[0].length)}`;
              }
            }

            if (characters.length > 0) {
              const primaryName = (characters[0].name || '').toLowerCase().trim();
              const primaryDesc = inlineDescs[primaryName];
              if (primaryDesc) {
                modifiedPrompt = modifiedPrompt.replace(genericRefs, `a ${primaryDesc}`);
                if (sceneCast.length === 1) {
                  modifiedPrompt = modifiedPrompt.replace(/\bthe (man|woman|boy|girl|person)\b/gi, `the ${primaryDesc.split(',').slice(0, 3).join(',')}`);
                }
              }
            }
            rawPrompt = modifiedPrompt;
          }

          // ── FIX 3 post-process: strip any leaked outdoor tokens from indoor prompts ──
          if (s.envType === 'indoor') {
            const leakTokens = STYLE_OUTDOOR_ENV_TOKENS[visualStyle] || [];
            for (const token of leakTokens) {
              const re = new RegExp(`,?\\s*${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^,\\.]*`, 'gi');
              rawPrompt = rawPrompt.replace(re, '');
            }
            rawPrompt = rawPrompt.replace(/,\s*,/g, ',').replace(/^\s*,|,\s*$/g, '').trim();
          }

          imagePrompt = validateAndEnhancePrompt(rawPrompt, styleConfig, orientationConfig, s.scene_number, visualStyle);
          animationPrompt = generated.animation_prompt || '';

          if (animationPrompt.length < 80) {
            const arc = s.director?.arc_position || 'rising';
            const mood = s.director?.mood || 'contemplative';
            const movement = s.director?.camera_movement || 'slow drift forward';
            animationPrompt = `${movement} over ${CLIP_DURATION} seconds. ${getArcAnimationGuidance(arc)} Atmospheric particles drift through the frame. Subtle breathing motion on subject. Light shifts gradually. The mood is ${mood}.`;
          }
        } else {
          console.warn(`⚠️ Scene ${s.scene_number} missing from response — building fallback`);
          totalWarnings++;
          let fallback = `${s.sceneStylePrefix}. `;
          if (s.director) {
            fallback += `${s.director.shot_type}. ${s.director.visual_concept}. ${s.director.lighting}. Color palette: ${s.director.color_palette}. ${s.director.depth_of_field}. Mood: ${s.director.mood}. `;
          } else {
            fallback += `Cinematic scene depicting: ${s.narration_text}. Professional composition. `;
          }
          imagePrompt = validateAndEnhancePrompt(fallback, styleConfig, orientationConfig, s.scene_number, visualStyle);
          const arc = s.director?.arc_position || 'rising';
          const mood = s.director?.mood || 'contemplative';
          animationPrompt = `Slow drift forward over ${CLIP_DURATION} seconds. ${getArcAnimationGuidance(arc)} Fine dust particles float through volumetric light. Subtle breathing rhythm on subject. Light evolves slowly. The emotional quality is ${mood}.`;
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
      totalPrompts += results.filter(Boolean).length;
    }

    try {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "content_generation", current_step: 5
      });
    } catch (_) {}

    const remainingScenes = (await base44.asServiceRole.entities.Scenes.filter({ project_id }))
      .filter(s => s.status === 'breakdown_ready').length;

    return Response.json({
      success: true,
      done: remainingScenes === 0,
      prompts_applied: totalPrompts,
      quality_warnings: totalWarnings,
      total_batches: totalBatches,
      remaining_scenes: remainingScenes,
      total_scenes: pendingScenes.length
    });

  } catch (error) {
    console.error("❌ generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});