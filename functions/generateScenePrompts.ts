import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE PROMPT GENERATOR — DIRECTOR NOTES → PRODUCTION PROMPTS
// ══════════════════════════════════════════════════════════════════
// Pipeline: Script → Scene Breakdown (deterministic) → [THIS] → Image Gen → Animation
//
// The breakdown guarantees EXACTLY the right number of scenes.
// This function's ONLY job is converting director notes into
// production-ready image + animation prompts. No compression,
// no scene deletion, no count changes.
//
// Reads director notes from image_prompt field (DIRECTOR_NOTES: prefix)
// Converts to production-ready image + animation prompts
// ══════════════════════════════════════════════════════════════════

const BATCH_SIZE = 12;
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
    positive: "Clean 3D whiteboard cartoon illustration style, bold consistent medium-thickness black ink outlines around ALL characters objects and environment elements, bright cheerful slightly desaturated flat color fills with minimal single-tone cel shading, characters have friendly slightly exaggerated proportions with larger heads expressive cartoon eyes thick eyebrows and simple noses, casual modern clothing rendered with flat color and subtle darker-tone fold shading (plaid flannel shirts jeans work boots hard hats), environments use clean isometric oblique perspective giving depth to buildings rooms and outdoor scenes while keeping a hand-drawn illustrative quality, backgrounds feature simplified but recognizable settings — green grass fields with bright yellow-green color, clear gradient blue skies, brick buildings with clean window outlines, indoor rooms with tiled floors and flat-colored walls, objects rendered clearly with outlines and flat color (vending machines storage units washing machines furniture vehicles), color palette centers on sky blue steel blue teal for environments and cool tones, warm browns and peach for skin, navy and dark blue plaid for clothing, pops of orange yellow green red on accent objects, soft lavender-blue or warm cream background wash behind scenes, lighting is even and ambient with no harsh shadows — only subtle ground shadows and single-tone darker shading on forms, overall aesthetic matches YouTube explainer and business education cartoon channels — approachable friendly professional and visually clean, information callout bubbles thought bubbles and split-panel compositions are part of the visual language, all props and objects are clearly identifiable with clean outlines and labeled visual metaphors",
    negative: "photorealistic, photograph, 3D render, CGI, anime, painterly, watercolor, oil painting, sketch, rough, dark, gritty, horror, complex textures, film grain, lens flare, bokeh, depth of field blur, dramatic shadows, neon, cyberpunk, fantasy, magical, abstract, impressionist, pixel art, low poly, voxel"
  },
  low_poly_3d_cartoon: {
    positive: "Stylized low-poly 3D cartoon animation, all geometry built from visible flat-shaded polygons and triangular facets creating a charming geometric aesthetic throughout the entire scene. CHARACTERS: exaggerated stylized proportions with oversized heads relative to bodies, prominent angular noses that protrude significantly from the face, deeply expressive large round eyes with visible white sclera and dark pupils, thick sculpted eyebrows that convey strong emotion, hair and beards rendered as chunky geometric strands with visible polygon facets in saturated colors (blue-gray hair for elderly characters, brown for younger), skin has warm peach-tan tones with subtle polygon-edge shading, hands are simplified blocky forms with distinct fingers, clothing is clearly modeled with visible folds — knit sweater vests with visible weave texture over collared shirts, police uniforms with badges and belt details, casual suburban attire like jeans and flannel, purple dresses with matching hats for elderly women, all fabric rendered with flat polygon faces and gentle ambient occlusion in creases. ENVIRONMENTS: quintessential American suburban neighborhood with rows of wooden clapboard houses in blues grays greens and warm tans, each house has clearly modeled porches with white railings, front steps, screen doors, shingled roofs with geometric ridge lines, attached garages, white picket fences and lattice work under porches, mailboxes on posts (orange and blue USPS style), fire hydrants, street lamps with geometric bulbs, sidewalks with visible concrete panel lines, smooth dark asphalt roads with subtle gray variation, green grass lawns rendered as low-poly ground planes with bright saturated green and occasional grass blade geometry. TREES AND FOLIAGE: trees have chunky faceted canopies made of large triangular polygon clusters in rich greens (olive, forest, lime) sitting atop smooth brown cylindrical trunks, hedges are blocky rectangular green masses with visible facet edges, bushes are rounded polygon clusters. VEHICLES: simplified boxy cartoon cars with rounded-rectangular bodies, clearly modeled headlights as yellow circular discs, chrome-style bumpers and grille details, visible side mirrors, windshield wipers, door handles, interiors show tan-brown dashboards with circular gauge clusters, steering wheels, gear shifts, and fabric seats all in low-poly style, a signature yellow sunflower in a small vase on the dashboard as a recurring motif. SKY AND ATMOSPHERE: bright clear gradient sky from vivid cerulean blue at top to lighter horizon blue, fluffy geometric clouds rendered as clusters of white polygon spheres, distant low-poly mountain silhouettes in pale blue-white, warm natural sunlight creating soft directional shadows on the ground, overall lighting is bright cheerful and evenly distributed with gentle ambient occlusion in corners and under objects. INDOOR SCENES: office and institutional interiors with wood-paneled walls, reception desks with clearly modeled computer monitors keyboards and desk items, bulletin boards with pinned papers, overhead fluorescent panel lighting casting even warm-cool light, tiled or carpeted floors with visible texture pattern, potted plants as geometric green shapes, wall clocks, framed certificates and badges on walls. COLOR PALETTE: vibrant saturated primary and secondary colors — rich reds and oranges for vehicles and mailboxes, deep blues and teals for houses and sky, warm browns and tans for wood and interiors, bright greens for foliage and lawns, warm peach for skin tones, purple and lavender for clothing accents, yellow for sunflowers and headlights, overall warm and inviting tone. RENDERING STYLE: clean polygon edges visible on all surfaces, flat-shaded faces with no smoothing between polygon normals creating the signature faceted look, soft ambient occlusion in crevices, gentle directional shadows, no outlines or cel-shading, materials have a matte slightly plastic quality similar to clay or vinyl toys, subsurface scattering hint on skin for warmth, the overall quality matches high-end indie 3D animation or a premium mobile game cutscene with Pixar-level character expressiveness combined with geometric stylization",
    negative: "photorealistic, photograph, live action, smooth high-poly rendering, hyperrealistic skin, film grain, lens flare, bokeh, motion blur, chromatic aberration, anime, cel-shaded, 2D flat, hand-drawn, sketch, watercolor, oil painting, painterly, dark gritty horror, neon cyberpunk, sci-fi futuristic, abstract, impressionist, pixel art, voxel art, wireframe, untextured, gray, monochrome, desaturated, complex PBR materials, ray-traced reflections, realistic hair strands, photogrammetry"
  }
};

// ══════════════════════════════════════════════════════════════════
// STYLE-SPECIFIC INSTRUCTIONS FOR LLM
// ══════════════════════════════════════════════════════════════════

function getStyleSceneBodyRules(styleName) {
  // These rules tell the LLM HOW to describe characters, environments, objects, and architecture
  // in the scene body — so the style DNA is baked into every description, not just the prefix.
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
      characters: "Low-poly 3D characters built from visible flat-shaded polygon facets — exaggerated proportions with oversized heads, prominent angular protruding noses, deeply expressive large round eyes with white sclera and dark pupils, thick sculpted geometric eyebrows. Hair rendered as chunky geometric strands with visible polygon facets. Skin in warm peach-tan with polygon-edge shading. Hands as simplified blocky forms. Clothing clearly modeled with visible folds and flat polygon faces — knit sweater vests over collared shirts, police uniforms with badges, casual jeans and flannel, purple dresses.",
      environments: "Low-poly 3D environments — ALL surfaces built from visible flat-shaded triangular polygons. Suburban houses with clapboard siding in blues/grays/greens, modeled porches with white railings, shingled roofs with geometric ridge lines, white picket fences. Green grass as low-poly ground planes with bright saturated green. Trees with chunky faceted canopies of large triangular polygon clusters in rich greens on smooth brown trunks. Sidewalks with visible concrete panels, smooth dark asphalt roads. Indoor: wood-paneled walls, reception desks, modeled computer monitors, bulletin boards, tiled floors.",
      objects: "ALL objects as low-poly geometric forms — boxy cartoon cars with rounded-rectangular bodies, yellow circular disc headlights, chrome bumpers. Mailboxes on posts, fire hydrants, street lamps with geometric bulbs. Every surface shows visible polygon edges and flat-shaded faces. Matte slightly plastic material quality like clay or vinyl toys.",
      rendering: "Low-poly 3D rendering — clean polygon edges visible on ALL surfaces, flat-shaded faces with NO smoothing between polygon normals (the signature faceted look). Soft ambient occlusion in crevices, gentle directional shadows, NO outlines or cel-shading. Bright clear gradient sky, fluffy geometric clouds as clusters of white polygon spheres. Vibrant saturated primary colors — rich reds, deep blues, bright greens, warm peach, yellow accents. Overall warm and inviting. Quality matches high-end indie 3D animation with Pixar-level expressiveness combined with geometric stylization."
    }
  };

  return rules[styleName] || null;
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

  // For non-photorealistic styles, strip any photorealistic camera language that may have leaked in
  const isPhotoStyle = ['cinematic_realistic', 'photorealistic_4k'].includes(visualStyle);
  if (!isPhotoStyle) {
    // Remove real camera/lens references that contradict non-photo styles
    enhanced = enhanced.replace(/\b(shot on|ARRI|Alexa|Canon|Sony|Nikon|Panavision|anamorphic|DSLR|RAW)\b/gi, '');
    enhanced = enhanced.replace(/\b(Kodak|Vision3|film grain texture|chromatic aberration)\b/gi, '');
    enhanced = enhanced.replace(/\bf\/\d+\.?\d*\b/g, ''); // Remove f-stop numbers
    enhanced = enhanced.replace(/\b(bokeh|lens flare)\b/gi, '');
    enhanced = enhanced.replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',');
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

    // ══════════════════════════════════════════════════════════════
    // NO COMPRESSION GATE — Scene count is deterministic from breakdown.
    // generateSceneBreakdown pre-splits narration into exact clip count.
    // This function ONLY converts director notes → production prompts.
    // It NEVER deletes, merges, or changes scene count.
    // ══════════════════════════════════════════════════════════════

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 PROMPT GENERATION`);
    console.log(`📊 ${pendingScenes.length} scenes from deterministic breakdown — converting to production prompts`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ══════════════════════════════════════════════════════════════
    // PROMPT GENERATION
    // ══════════════════════════════════════════════════════════════

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

    let characters = [];
    if (project.character_descriptions) {
      try { characters = JSON.parse(project.character_descriptions); } catch (_) {}
    }
    const characterBlock = characters.length > 0
      ? `**CHARACTERS (embed FULL physical description into every prompt where they appear):**\n${characters.map(c => `• ${c.name}: ${c.visual_description || c.description || ''}`).join('\n')}`
      : '';

    let storyContext = '';
    try {
      const blueprint = JSON.parse(project.scene_blueprint);
      const sa = blueprint.story_analysis;
      storyContext = `**STORY:** Theme: ${sa.central_theme} | Visual World: ${sa.visual_world} | Color Arc: ${sa.color_arc} | Motifs: ${JSON.stringify(sa.recurring_visual_motifs)}`;
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
        const director = extractDirectorNotes(scene.image_prompt);
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

      // Build style-specific instructions so the LLM knows EXACTLY what aesthetic to produce
      const styleInstructions = getStyleSpecificInstructions(visualStyle, styleConfig);

      const prompt = `**MISSION: Convert Director's Notes → Production-Ready Image & Animation Prompts**

${storyContext}

${characterBlock}

**VISUAL STYLE: "${visualStyle}"** — THIS IS THE #1 PRIORITY. Every prompt MUST produce images in this EXACT style.
**ORIENTATION:** ${orientationConfig.format}

**═══════════════════════════════════════════════════════════════**
**STYLE DEFINITION — EVERY PROMPT MUST MATCH THIS AESTHETIC:**
${styleInstructions}

**STYLE PREFIX (must appear at the START of every image_prompt):**
"${styleConfig.positive}"

**STYLE NEGATIVE (content that must NEVER appear in the image):**
"${styleConfig.negative}"
**═══════════════════════════════════════════════════════════════**

**DIRECTOR'S SCENE NOTES:**
${sceneDirections}

**YOUR TASK — for EACH scene produce:**

1. **image_prompt** — Dense technical prompt for AI image generation:
   - MUST begin EXACTLY with: "${styleConfig.positive}."
   - Then add: "${orientationConfig.directive}."
   - Then describe the scene content in the CORRECT STYLE (see style definition above)
   - DO NOT mix styles. If style is cartoon/anime/low-poly, do NOT use photorealistic language (no "ARRI", "Canon", "DSLR", "f/1.4", "film grain", "bokeh", "anamorphic")
   - If style is photorealistic, DO use camera/lens language
   - Translate visual concept into SPECIFIC scene description (300+ chars) using ONLY language appropriate to the selected style
   - Embed shot type and composition from director notes adapted to the style
   - If characters appear → embed FULL physical description
   - ${orientationConfig.composition}
   - FORBIDDEN: text, words, letters, numbers, charts, graphs, signs, readable content in the image
   - Abstract concepts → PHYSICAL METAPHORS appropriate to the style
   - MUST end with: "ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image"

2. **animation_prompt** — ${CLIP_DURATION}-second motion direction:
   - Translate camera_movement into animation language
   - **RESPECT ARC POSITION**: Use the Arc Animation guidance for pacing
   - Format: ${orientationConfig.animation}
   - Include: camera motion + speed, atmospheric motion, subject micro-motion
   - Low intensity = slow/subtle, high intensity = dynamic/dramatic

**RESPONSE:**
{
  "prompts": [
    {
      "scene_number": 1,
      "image_prompt": "${styleConfig.positive.substring(0, 60)}... [scene description in correct style]... ABSOLUTELY NO text...",
      "animation_prompt": "[motion direction respecting arc position]"
    }
  ]
}

CRITICAL STYLE CHECK before outputting each prompt:
- Does it start with the exact style prefix? 
- Is the visual language consistent with "${visualStyle}"?
- Are there any CONTRADICTORY style terms? (e.g. "photorealistic" in an anime prompt, or "cel-shaded" in a photorealistic prompt)
- Would this prompt produce an image that looks like ${visualStyle}?`;

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
          animationPrompt = generated.animation_prompt
            || "slow gentle camera movement forward, atmospheric haze, subtle breathing, shallow DOF";
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
          animationPrompt = s.director?.camera_movement
            || "slow gentle camera movement forward, atmospheric haze, subtle breathing, shallow DOF";
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