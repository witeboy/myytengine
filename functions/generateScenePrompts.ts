import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';


// ══════════════════════════════════════════════════════════════════
// SCENE PROMPT GENERATOR — DIRECTOR NOTES → PRODUCTION PROMPTS
// Pipeline: Script → Breakdown → [THIS] → Image Gen → Animation
// ══════════════════════════════════════════════════════════════════


const BASE_BATCH_SIZE = 12;
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
    negative: "photorealistic, photograph, 3D render, anime, sketch, rough, painterly, dark, gritty, horror, complex textures, film grain, chibi, bobblehead, oversized head, big head small body, exaggerated proportions, caricature"
  },
  picstory_cocomelon: {
    positive: "Adorable 3D rendered children's animation style, CoComelon and Pixar Junior quality, soft rounded characters with big expressive eyes, pastel color palette with bright accents, smooth plastic-like textures, warm studio lighting, cheerful and friendly atmosphere, child-safe wholesome imagery, gentle soft shadows, nursery rhyme aesthetic",
   negative: "photorealistic, scary, dark, horror, sharp edges, complex, adult themes, violence, anime, sketch, painterly, gritty, chibi, bobblehead, oversized head, big head small body, exaggerated proportions, caricature"
  },
  cinematic_picstory: {
    positive: "Cinematic 3D animated feature film quality, Pixar and DreamWorks level rendering, dramatic studio lighting with rim lights, rich color grading, detailed textures with subsurface scattering on skin, expressive stylized characters with realistic proportions, cinematic depth of field, volumetric atmosphere, professional animated feature film composition, emotional cinematography",
    negative: "flat 2D, sketch, anime linework, rough, low quality, uncanny valley, photorealistic human, cheap 3D, mobile game quality, chibi, bobblehead, oversized head, big head small body, exaggerated proportions, caricature"
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
   negative: "photorealistic, modern, dark, scary, anime, 3D render, flat vector, bold colors, adult themes, sharp geometric, chibi, bobblehead, oversized head, big head small body, exaggerated proportions, caricature"
  },
  harry_potter: {
    positive: "Magical fantasy world with warm candlelight and mysterious atmosphere, gothic castle interiors with stone textures and floating candles, rich jewel-tone color palette of deep burgundy gold and emerald, magical golden particles and ethereal glow effects, dramatic chiaroscuro lighting, weathered leather and parchment textures, enchanted artifacts with luminous properties, cozy yet mysterious British boarding school aesthetic, professional fantasy concept art quality",
    negative: "modern, contemporary, bright fluorescent, cartoon, anime, flat colors, minimalist, sci-fi, futuristic, clinical, sterile"
  },
  "3d_whiteboard_cartoon": {
    positive: "Clean 3D whiteboard cartoon, bold consistent black ink outlines, bright cheerful flat color fills with single-tone cel shading. All objects with bold outlines and flat color. Warm color palette with peach and brown tones. Even ambient lighting, no harsh shadows, YouTube explainer style, approachable professional",    negative: "photorealistic, photograph, 3D render, CGI, anime, painterly, watercolor, oil painting, sketch, dark, gritty, horror, film grain, lens flare, bokeh, dramatic shadows, neon, cyberpunk, fantasy, abstract, pixel art, low poly, voxel, chibi, bobblehead, oversized head, big head small body, exaggerated proportions, caricature"
  },
  low_poly_3d_cartoon: {
    positive: "Stylized low-poly 3D cartoon, all geometry from visible flat-shaded polygons and triangular facets. Realistic human proportions with geometric stylization. Angular facial features, expressive eyes, defined eyebrows. Geometric hair, warm peach-tan skin with polygon-edge shading. Clothing with visible folds and flat polygon faces. All environments built from flat-shaded polygons. Vibrant saturated colors, clean polygon edges, no smoothing, matte clay-toy quality, soft ambient occlusion, sharp focused background with all elements in focus, deep depth of field, Pixar expressiveness with geometric stylization",
   negative: "photorealistic, photograph, smooth high-poly, hyperrealistic, film grain, lens flare, bokeh, blurred background, shallow depth of field, out of focus background, anime, cel-shaded, 2D flat, hand-drawn, sketch, watercolor, oil painting, dark horror, neon cyberpunk, abstract, pixel art, voxel art, wireframe, monochrome, desaturated, ray-traced, photogrammetry, chibi, bobblehead, oversized head, big head small body, exaggerated proportions, caricature, funko pop"  },
  skeleton_protagonist: {
   positive: "wide shot showing complete scene, photorealistic detailed environment with sharp focused background, multiple people in frame, cinematic establishing shot composition, golden hour volumetric lighting, HDR cinematic lens, warm amber grading, masterpiece quality",
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
      characters: "Describe characters with photorealistic detail — skin texture, real clothing fabrics, natural hair, realistic body proportions. Character proportions defined per-scene by the Body Proportion directive.",
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
      characters: "2D cartoon characters with bold black outlines, flat vibrant color fills, correct proportions, big expressive faces, dynamic poses.",
      environments: "Cartoon backgrounds with bold outlines, flat color fills, playful simplified architecture, bright cheerful colors.",
      objects: "Cartoon-style objects with clean outlines, flat colors, slightly correct proportions, playful design.",
      rendering: "Cartoon Network / Disney Channel quality. Bold outlines, flat colors, no photorealistic terms."
    },
    picstory_cocomelon: {
     characters: "Soft rounded 3D characters with plastic-smooth skin, pastel clothing, cheerful expressions. Body framing defined per-scene by the Body Proportion directive.",
      environments: "Bright pastel 3D environments — soft rounded architecture, gentle lighting, toy-like world, child-safe wholesome settings.",
      objects: "Smooth plastic-textured 3D objects, rounded edges, bright pastel colors, toy-like quality.",
      rendering: "CoComelon/Pixar Junior 3D rendering — soft shadows, warm studio lighting, smooth plastic textures."
    },
    cinematic_picstory: {
      characters: "Pixar/DreamWorks quality 3D characters — expressive stylized faces, realistic proportions, subsurface scattering on skin, detailed clothing. Body framing defined per-scene by the Body Proportion directive.",
      environments: "Cinematic 3D environments — dramatic studio lighting, rich color grading, volumetric atmosphere, detailed textures.",
      objects: "High-quality 3D rendered objects with detailed materials, dramatic lighting, cinematic depth.",
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
     characters: "Characters with bold consistent black ink outlines, flat color fills with single-tone cel-shading. Clothing rendered as flat color with subtle darker-tone fold shading. Body framing defined per-scene by the Body Proportion directive.",
      environments: "Clean isometric/oblique perspective environments — simplified but recognizable settings. Environments match the scene description — . All surfaces rendered with bold outlines and flat color fills. Sharp focus on all background elements..",
      objects: "ALL objects rendered with bold black outlines and flat color fills — vending machines, storage units, vehicles, furniture. Clearly identifiable with labeled visual metaphors. Information callout bubbles and thought bubbles as part of the visual language.",
      rendering: "YouTube explainer / business education cartoon style — approachable, friendly, professional, visually clean. Even ambient lighting, no harsh shadows, only subtle ground shadows and single-tone darker shading."
    },
    low_poly_3d_cartoon: {
     characters: "Low-poly 3D characters from visible flat-shaded polygon facets with realistic human proportions. Geometric facial features, expressive eyes. Geometric hair. Warm peach-tan skin with polygon-edge shading. Clothing with visible folds and flat polygon faces. Body framing defined per-scene by the Body Proportion directive.",
      environments: "All surfaces from visible flat-shaded triangular polygons. All environments built from flat-shaded polygons. Vibrant saturated colors, clean polygon edges, no smoothing, matte clay-toy quality, soft ambient occlusion, sharp focused background with all elements in focus, deep depth of field, Pixar expressiveness with geometric stylization",

      objects: "All objects as low-poly geometric forms — boxy cars, yellow disc headlights, chrome bumpers, mailboxes, fire hydrants, street lamps. Every surface shows polygon edges and flat-shaded faces. Matte plastic quality like clay toys.",
      rendering: "Clean polygon edges on all surfaces, flat-shaded with no smoothing (signature faceted look). Soft ambient occlusion, gentle directional shadows, no outlines or cel-shading. Bright gradient sky, geometric cloud clusters. Vibrant saturated colors, warm and inviting."
    },
    skeleton_protagonist: {
      characters: "Protagonist in EVERY scene: photorealistic transparent skeleton with clear glass-like body shell, glossy ivory bones visible through translucent torso, big round expressive brown/amber EYEBALLS in skull sockets. MUST be shown according to director's notes — standing, sitting, kneeling, walking, running. Wears context-appropriate clothing. Must be DOING an action (holding objects, gesturing, interacting with people). Other characters are photorealistic normal humans shown alongside or interacting with the skeleton.",
      environments: "Photorealistic DETAILED real-world environments shown in SHARP FOCUS — NOT blurred bokeh backgrounds. Every scene has a specific location with visible architecture, landscape features, props, furniture, tools, weather effects. The skeleton exists INSIDE this world, not floating in front of it. Include foreground elements for depth.",
      objects: "Photorealistic props the skeleton is actively interacting with — tools in hand, objects being held or carried, furniture being used, vehicles, food, weapons, documents. Props tell the story and connect scenes together.",
      rendering: "Cinematic wide-to-medium framing showing within environment. HDR cinematic lens, warm amber grading, dramatic volumetric golden hour lighting, strong rim light separating skeleton from background. Sharp detailed backgrounds. Favor 9:16 vertical framing with character visible."
    }
  };


  // ═══ UNIVERSAL FRAMING — appended to ALL styles ═══
  const base = rules[styleName] || null;
  if (base) {
    base.rendering = (base.rendering || '') + ' Frame characters according to the Body Proportion directive for each scene. Show detailed sharp environments with visible props and architecture, not empty blurred backgrounds. Characters should be mid-action interacting with environment and other people.';
  }
  return base;
}


// ══════════════════════════════════════════════════════════════════
// STYLE-SPECIFIC LLM REINFORCEMENT
// ══════════════════════════════════════════════════════════════════


function getStyleReinforcementInstruction(visualStyle) {
  // ═══ UNIVERSAL — every style gets this ═══
  const universalReinforcement = `
**🎬 MANDATORY PRODUCTION RULES (ALL STYLES):**


ENVIRONMENT-FIRST: Every image_prompt must describe the LOCATION and SETTING in the first 1-2 sentences BEFORE mentioning any character. Include: specific place, architecture/landscape, weather/time of day, foreground props, atmospheric details.


FULL-BODY ACTION: Characters shown. They must be DOING an action — walking, sitting, reaching, holding, kneeling, gesturing. NEVER static standing portrait facing camera. Close-ups allowed for max 2 scenes.


CAMERA DIRECTION: Each image_prompt must specify a SHOT TYPE (wide, medium, low angle, overhead, OTS, tracking, dutch angle, POV) and it must DIFFER from adjacent scenes.


POPULATED WORLD: Include other people, objects, vehicles, animals in MOST scenes. The character lives in a busy, living world — not alone in empty space.


THREE-LAYER DEPTH: Every scene has foreground (edge objects, blurred props), midground (character + action), background (environment stretching into distance).


EMOTIONAL LIGHTING: Specify light SOURCE (sun, lamp, fire, neon, window), DIRECTION (from left, backlit, overhead, rim), and MOOD (warm golden, cold blue, harsh white, dramatic chiaroscuro).


BODY LANGUAGE: Characters express emotion through POSTURE — slumped, wide stance, hunched, arms spread, hands clasped, leaning forward, stepping back. NOT just facial expression.


CONTINUITY: Each scene must contain a visual element that connects to the next scene — shared prop, color shift, gesture echo, location transform.
`;


  const instructions = {
    skeleton_protagonist: universalReinforcement + `
**🦴 SKELETON PROTAGONIST STYLE — ADDITIONAL RULES:**
The protagonist in EVERY image prompt must be described as: "a photorealistic transparent skeleton with a clear glass-like semi-transparent humanoid body shell, glossy ivory bones visible through the translucent torso, big round expressive brown amber eyeballs in the skull sockets"


MANDATORY FRAMING:
- Show the skeleton  — NOT torso-only, NOT bust shots
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
  return instructions[visualStyle] || universalReinforcement;
}


// ══════════════════════════════════════════════════════════════════
// PROMPT VALIDATION
// ══════════════════════════════════════════════════════════════════


function validateAndEnhancePrompt(imagePrompt, styleConfig, orientationConfig, sceneNumber, visualStyle) {
  let enhanced = imagePrompt;
  enhanced = enhanced.replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\s*\.?\s*/gi, '');


  // Ensure style quality suffix is present — APPEND at END, never prepend
  // The first 200 chars of the prompt must be FRAMING + ENVIRONMENT, not style language
  const styleCheck = styleConfig.positive.substring(0, 30).toLowerCase();
  if (!enhanced.toLowerCase().includes(styleCheck.substring(0, 20))) {
    enhanced = `${enhanced}. ${styleConfig.positive}`;
  }


  // For non-photorealistic styles, strip any photorealistic camera language that may have leaked in
  const isPhotoStyle = ['cinematic_realistic', 'photorealistic_4k', 'skeleton_protagonist'].includes(visualStyle);
  if (!isPhotoStyle) {
    enhanced = enhanced.replace(/\b(shot on|ARRI|Alexa|Canon|Sony|Nikon|Panavision|anamorphic|DSLR|RAW)\b/gi, '');
    enhanced = enhanced.replace(/\b(Kodak|Vision3|film grain texture|chromatic aberration)\b/gi, '');
    enhanced = enhanced.replace(/\bf\/\d+\.?\d*\b/g, '');
    enhanced = enhanced.replace(/\b(bokeh|lens flare)\b/gi, '');
    // Clean up "depth of field with ," left after bokeh removal
    enhanced = enhanced.replace(/\bdepth of field with\s*,/gi, 'cinematic depth of field,');
    enhanced = enhanced// Strip rendering instructions that leaked into prompt
            .replace(/\bshown full (?:body|figure)\s*(?:in the scene)?\b/gi, '')
            .replace(/\bshown full body in the scene\b/gi, '')
            .replace(/\s{2,}/g, ' ').replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.');
  }


 // Strip any orientation words the LLM may have included (orientation is handled by API aspect_ratio param)
  enhanced = enhanced
    .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
    .replace(/\bvertical\s+\d+:\d+\s*(frame|format)?\b/gi, '')
    .replace(/\bwidescreen\s+\d+:\d+\s*(frame|format)?\b/gi, '')
    .replace(/\b\d{1,2}:\d{1,2}\s*(widescreen|vertical|horizontal|frame|format|ratio)\b/gi, '')
    .replace(/\b(wide|tall)\s+(cinematic|vertical|horizontal)\s+(framing|composition)\b/gi, '');


  // DO NOT add anti-text instruction — Grok renders it as visible text
  // The LLM prompt already instructs physical metaphors for abstract concepts


  // Quality suffix — style-appropriate (no resolution numbers — Grok renders them)
  if (!/masterpiece|professional|high quality/i.test(enhanced)) {
    enhanced += ', masterpiece quality, highly detailed, professional composition';
  }


  return enhanced;
}


// ══════════════════════════════════════════════════════════════════
// ARC-AWARE ANIMATION DYNAMICS
// ══════════════════════════════════════════════════════════════════


function getArcAnimationGuidance(arcPosition) {
  const map = {
    setup: "SLOW, RESTRAINED. Gentle drift or creeping pan. Camera discovers the world — parallax depth as foreground drifts past background. Settling motion like arriving somewhere.",
    rising: "BUILDING energy. Gradual push-ins with purpose. Handheld micro-shake emerging. Parallax intensifying. Elements in frame start responding — curtains shift, papers flutter, light quickens.",
    climax: "PEAK intensity but CONTROLLED. Deliberate slow push-in to subject's eyes or hands. Everything else stills. Rack focus snaps. Single dramatic light shift. Hold the moment — let it land.",
    resolution: "EXHALE. Slow pull-back revealing wider context. Settling dust, calming light, softening focus. Motion decelerates like a heartbeat returning to rest. Warmth enters the frame.",
    cold_open: "IMMEDIATE and ASSERTIVE. Camera already moving when scene starts — mid-track or mid-push. No easing in. Foreground whips past. Light cuts sharp. Grab the eye in the first frame.",
    rising_tension: "ESCALATING rhythm. Each motion slightly faster or tighter than the last. Push-ins grow bolder, tracking grows more urgent. Environmental motion picks up — wind, flickering light, shifting shadows. Building toward something.",
    emotional_core: "DELIBERATE POWER. Camera slows to meaningful crawl. Every inch of movement earns its place. Subject micro-expressions amplified — a swallow, a blink, fingers tightening. Shallow DOF breathes. Light pools and shifts like it's alive. This is the frame viewers remember.",
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


    // ── Style-specific LLM reinforcement (e.g. skeleton protagonist) ──
    const styleReinforcement = getStyleReinforcementInstruction(visualStyle);
    if (styleReinforcement) {
      console.log(`🦴 Style reinforcement active: ${visualStyle}`);
    }


    let orientationConfig;
    if (orientation === 'portrait') {
      orientationConfig = {
        format: 'portrait',
        directive: "PORTRAIT VERTICAL 9:16 format, tall vertical framing",
        composition: "Compose for VERTICAL 9:16 mobile frame: tall compositions, characters visible , vertical depth stacking, environment visible above and below character",
        animation: "vertical 9:16 — tilt up/down, vertical reveals, close-up push-ins, portrait motion"
      };
    } else {
      orientationConfig = {
        format: 'landscape',
        directive: "LANDSCAPE HORIZONTAL 16:9 widescreen, wide cinematic framing",
        composition: "Compose for WIDESCREEN 16:9: wide establishing shots, rule of thirds, horizontal leading lines, foreground/midground/background depth, characters within environment",
        animation: "widescreen 16:9 — horizontal pans, dolly forward/back, crane shots, lateral parallax"
      };
    }


    const framingPrefix = "Full body wide shot showing complete scene with detailed sharp environment, visible architecture and props, character shown head to feet mid-action in a populated world";
    const promptPrefix = `${framingPrefix}. `;


    let characters = [];
    if (project.character_descriptions) {
      try { characters = JSON.parse(project.character_descriptions); } catch (_) {}
    }

    // ═══ CHARACTER IDENTITY SYSTEM ═══
    // Split character data into IMMUTABLE identity (face, body, hair, skin, eyes, marks)
    // and MUTABLE appearance (clothing, accessories, pose).
    // Only identity_core gets force-injected into every prompt.
    // Clothing is left to the LLM per-scene.

    const characterBlock = characters.length > 0
      ? `**CHARACTERS — IDENTITY DNA (these features are PERMANENT and NEVER change between scenes):**\n${characters.map(c => {
          const identity = c.identity_core || c.visual_description || c.description || '';
          const clothing = c.default_clothing || '';
          return `• ${c.name}:\n  IDENTITY (permanent): ${identity}${clothing ? `\n  DEFAULT CLOTHING (can change per scene): ${clothing}` : ''}`;
        }).join('\n')}\n\n**RULE: You MUST embed the FULL identity description for EVERY character in EVERY image_prompt. The image generator has ZERO memory — each prompt is a fresh start. Name alone means NOTHING to the renderer.**\n\n**CRITICAL WEAVING RULE — THE #1 CAUSE OF BAD IMAGES IS VIOLATING THIS:**\nCharacter features must be WOVEN INTO the action and environment — NEVER listed as an isolated block.\nThe image generator reads prompts left-to-right. If it encounters a paragraph of face/body traits detached from any action, it renders a PORTRAIT of that person — ignoring the scene entirely.\n\nDEATH PATTERN (produces floating heads / portraits): "Close-up of a coin in a gutter. A 55 year old male with light-medium skin, oval face, hazel eyes, straight nose, medium lips, graying hair, average build, 5ft10, wrinkles around eyes, confident smile is implied by the perspective."\nThe image gen reads the trait dump and renders a face in a gutter.\n\nCORRECT PATTERN (produces a scene with character IN it): "Close-up of a tarnished coin lying in a rain-filled gutter, the gray asphalt reflecting overcast sky. A graying-haired man in a rumpled coat crouches at the curb, his weathered face twisted in disappointment as he stares down at the coin, rain collecting on his hunched shoulders."\nEvery trait is CONNECTED: hair → visible because he\'s crouching, face → twisted in emotion, shoulders → hunched + wet from rain.\n\nRULES:\n1. NEVER write a character description as a standalone clause or sentence. Every trait must be mid-action or affected by the environment.\n2. Spread traits across the prompt — hair in one clause, skin in another, build shown through posture. Don\'t front-load them.\n3. Use the character\'s NAME in your prompt — our post-processing system will replace it with the correct identity tag. Write "Sarah crouches by the gutter" not "A 55 year old male with light-medium skin crouches...".\n4. The environment sentence MUST come BEFORE the character.`
      : '';


    // ═══ CHARACTER IDENTITY TAGS — style-aware, force-injected into EVERY prompt post-LLM ═══
    // CRITICAL: Tags are structured BODY-FIRST to prevent Grok from rendering portraits.
    // The identity_core from breakdown is a face-first casting sheet (great for consistency)
    // but when injected verbatim, Grok reads "oval face, almond eyes, upturned nose..."
    // and commits to rendering a portrait. We restructure it here:
    //   → body/build/height/posture FIRST (sets "this is a person in a scene" framing)
    //   → face/hair as a COMPACT trailing clause (maintains identity without triggering portrait mode)


    // Split identity_core into body traits vs face traits
    // Produces CLEAN natural-language descriptions, not raw regex extractions.
    // Body = age + gender + build + height (reads like: "35-year-old male, average build, 5'10")
    // Face = everything else (skin, face shape, eyes, nose, lips, hair, marks)
    function splitIdentity(rawDesc) {
      // ── Extract structured parts ──
      // Age: bare number at start or "X years old" or "X-year-old"
      const ageMatch = rawDesc.match(/\b(\d{1,2})\s*[-–]?\s*(?:years?\s*old|year[\s-]old)\b/i)
        || rawDesc.match(/^(\d{1,2})\s*,/);  // bare "35," at start
      const age = ageMatch ? ageMatch[1] : null;

      // Gender
      const genderMatch = rawDesc.match(/\b(female|male|woman|man)\b/i);
      const gender = genderMatch ? genderMatch[1].toLowerCase() : null;

      // Build: "average build", "athletic build", "slim", etc — but NOT "short" alone (ambiguous with hair)
      const buildMatch = rawDesc.match(/\b(average|athletic|slim|slender|heavy|lean|stocky|muscular|medium|thin|stout|petite|lanky|heavyset|curvy|hourglass|broad[\s-]shouldered)\s*(build)?\b/i);
      const build = buildMatch ? buildMatch[0].trim() : null;

      // Height: "5'10", "5ft10", "170cm", etc
      const heightMatch = rawDesc.match(/\b(\d+\s*['′]\s*\d+\s*["″]?|\d+\s*ft\s*\d+|\d+\s*cm)\b/i);
      const height = heightMatch ? heightMatch[0].trim() : null;

      // ── Build body string (natural language) ──
      const bodyParts = [];
      if (age) bodyParts.push(`${age}-year-old`);
      if (gender) bodyParts.push(gender);
      if (build) bodyParts.push(build);
      if (height) bodyParts.push(height);
      const bodyStr = bodyParts.join(', ');

      // ── Build face string (everything NOT in body) ──
      let faceDesc = rawDesc;
      // Remove the parts we extracted (carefully, to avoid removing substrings of other words)
      if (ageMatch) faceDesc = faceDesc.replace(ageMatch[0], '');
      if (genderMatch) faceDesc = faceDesc.replace(genderMatch[0], '');
      if (buildMatch) faceDesc = faceDesc.replace(buildMatch[0], '');
      if (heightMatch) faceDesc = faceDesc.replace(heightMatch[0], '');

      // Clean orphaned punctuation, empty quotes, double commas
      faceDesc = faceDesc
        .replace(/[""'']+\s*/g, '')          // orphaned quotes from height like 5'10"
        .replace(/,\s*,/g, ',')              // double commas
        .replace(/^\s*,\s*/, '')             // leading comma
        .replace(/\s*,\s*$/, '')             // trailing comma
        .replace(/\s{2,}/g, ' ')             // double spaces
        .trim();

      return { body: bodyStr, face: faceDesc };
    }

    // Style transforms — IDENTITY ONLY, no framing/body instructions
    // Body proportion is controlled by getBodyProportionDirective() per shot type.
    // These tags describe WHAT the character LOOKS LIKE, not how they're framed.
    // Pattern: "[style] [body build], [compressed face/hair clause], [style rendering]"
    const styleCharacterRules = {
      cinematic_realistic: (bodyDesc, faceDesc) =>
        `photorealistic ${bodyDesc}, ${faceDesc}, natural skin texture, cinematic lighting`,
      photorealistic_4k: (bodyDesc, faceDesc) =>
        `DSLR-quality photorealistic ${bodyDesc}, ${faceDesc}, razor-sharp detail, editorial photography`,
      anime: (bodyDesc, faceDesc) =>
        `anime-style ${bodyDesc}, ${faceDesc}, large expressive eyes with highlight reflections, clean linework, cel-shaded`,
      cinematic_anime: (bodyDesc, faceDesc) =>
        `cinematic anime ${bodyDesc}, ${faceDesc}, Makoto Shinkai quality, dramatic volumetric lighting, flowing hair`,
     cartoon_2d: (bodyDesc, faceDesc) =>
        `2D cartoon ${bodyDesc} with bold outlines, ${faceDesc}, flat vibrant colors, dynamic pose, normal proportions`,
     picstory_cocomelon: (bodyDesc, faceDesc) =>
        `3D rendered ${bodyDesc}, ${faceDesc}, soft rounded plastic-smooth features, pastel colors, Pixar Junior quality`,
      cinematic_picstory: (bodyDesc, faceDesc) =>
        `Pixar-quality 3D animated ${bodyDesc}, ${faceDesc}, subsurface scattering on skin, expressive features, dramatic studio rim lighting`,
      oil_painting: (bodyDesc, faceDesc) =>
        `oil-painted ${bodyDesc}, ${faceDesc}, visible impasto brushstrokes, Rembrandt chiaroscuro lighting`,
      watercolor: (bodyDesc, faceDesc) =>
        `watercolor-rendered ${bodyDesc}, ${faceDesc}, soft translucent washes, paper grain showing through`,
      comic_book: (bodyDesc, faceDesc) =>
        `comic book ${bodyDesc}, ${faceDesc}, bold black ink outlines, halftone shading, Marvel/DC quality`,
      humpty_dumpty: (bodyDesc, faceDesc) =>
        `storybook ${bodyDesc}, ${faceDesc}, rounded friendly shapes, gentle watercolor washes, fairy tale warmth`,
      harry_potter: (bodyDesc, faceDesc) =>
        `fantasy ${bodyDesc}, ${faceDesc}, warm candlelit tones, magical golden particles, gothic atmosphere`,
      "3d_whiteboard_cartoon": (bodyDesc, faceDesc) =>
        `3D whiteboard cartoon ${bodyDesc} with bold outlines, ${faceDesc}, flat color fills, normal proportions, warm peach-brown skin`,
     low_poly_3d_cartoon: (bodyDesc, faceDesc) =>
        `low-poly 3D ${bodyDesc} from flat-shaded polygons, ${faceDesc}, angular geometric features, matte clay-toy quality`,
      skeleton_protagonist: (bodyDesc, faceDesc) =>
        `photorealistic transparent skeleton with clear glass-like body shell, glossy ivory bones visible through translucent torso, big round expressive brown amber eyeballs in skull sockets`
    };


    const defaultStyleTransform = (bodyDesc, faceDesc) => `${bodyDesc}, ${faceDesc}`;


    // ══════════════════════════════════════════════════════════════
    // IDENTITY TIER SYSTEM — shot-type-aware character depth
    // ══════════════════════════════════════════════════════════════
    // Not every scene needs a 500-char character description.
    // A wide city street shot where the character is tiny needs just
    // "a woman with a dark-brown bob in a lavender jacket."
    // A close-up emotional beat needs the full casting-sheet identity.
    //
    // MINIMAL: Wide/environmental shots — silhouette identifiers only
    // MODERATE: Medium/action shots — add skin tone, key features
    // FULL: Close-up/emotional — complete identity for face consistency
    // ══════════════════════════════════════════════════════════════

    function getIdentityTier(shotType) {
      if (!shotType) return 'moderate'; // safe default
      const st = shotType.toLowerCase();
      // FULL: close-ups where face matters
      if (/\b(ecu|extreme\s*close|mcu|medium\s*close|cu\b|close[\s-]*up|insert|detail|pov)\b/.test(st)) return 'full';
      // MINIMAL: wide shots where character is small in frame
      if (/\b(ews|extreme\s*wide|ws\b|wide\s*shot|mws|medium\s*wide|high\s*angle|overhead|god.?s?\s*eye|establishing|aerial|drone|bird.?s?\s*eye)\b/.test(st)) return 'minimal';
      // MODERATE: everything else (MS, low angle, OTS, tracking, dutch)
      return 'moderate';
    }

    // ══════════════════════════════════════════════════════════════
    // BODY PROPORTION DIRECTIVE — shot type → explicit body framing
    // ══════════════════════════════════════════════════════════════
    // This tells the image generator EXACTLY how much of the body to show
    // based on the director's shot type. Prevents full-body dumps in CU
    // and head-only portraits in wide shots.
    // ══════════════════════════════════════════════════════════════

    function getBodyProportionDirective(shotType) {
      if (!shotType) return 'shown from waist up, interacting with nearby objects';
      const st = shotType.toLowerCase();
      if (/\b(ews|extreme\s*wide|establishing|aerial|drone|bird.?s?\s*eye)\b/.test(st))
        return 'visible as a small full-body figure within the vast environment, body language readable from distance, surrounded by architecture and landscape';
      if (/\b(ws\b|wide\s*shot|mws|medium\s*wide)\b/.test(st))
        return 'shown full body head to feet within the environment, body proportions natural against surrounding objects and architecture, actively moving through the space';
      if (/\b(high\s*angle|overhead|god.?s?\s*eye)\b/.test(st))
        return 'seen from above, full body visible against the ground plane, body creating a shape within the environment geometry';
      if (/\b(low\s*angle)\b/.test(st))
        return 'seen from below looking up, showing full body from feet upward, figure towering against sky or ceiling, environment visible behind and around';
      if (/\b(ots|over[\s-]*the[\s-]*shoulder)\b/.test(st))
        return 'shown from behind another person\'s shoulder, upper body and hands visible, actively engaged with something in front of them';
      if (/\b(ms\b|medium\s*shot|tracking|dutch)\b/.test(st))
        return 'framed from waist up, hands and arms visible and actively doing something — holding, gesturing, reaching, gripping — torso and posture conveying emotion';
      if (/\b(mcu|medium\s*close)\b/.test(st))
        return 'framed from chest up, shoulders and upper arms visible, hands partially in frame if gesturing, facial expression prominent but body posture still readable';
      if (/\b(cu\b|close[\s-]*up)\b/.test(st))
        return 'framed from shoulders up, face dominant but neck and shoulder tension visible, environment still present as soft context behind';
      if (/\b(ecu|extreme\s*close|insert|detail)\b/.test(st))
        return 'extreme close-up filling the frame — face details, skin texture, and micro-expressions dominant, but eyes reflecting the environment';
      return 'shown from waist up, interacting with nearby objects';
    }

    const characterTieredTags = {};  // name → { minimal, moderate, full }
    const characterReferencePrompts = {};
    const styleTransform = styleCharacterRules[visualStyle] || defaultStyleTransform;


    for (const c of characters) {
      const name = (c.name || '').toLowerCase().trim();
      let identityDesc = c.identity_core || c.visual_description || c.description || '';
      const clothing = c.default_clothing || '';
      // Clean junk Gemini sometimes echoes back from our prompt instructions
      // Clean junk + normalize gender-neutral → concrete gender for image gen
      identityDesc = identityDesc
        .replace(/^Casting[- ]sheet:?\s*/i, '')
        .replace(/^IMMUTABLE[^:]*:\s*/i, '')
        .replace(/^Identity[^:]*:\s*/i, '')
        .replace(/\bCasting[- ]sheet:?\s*/gi, '')
        .replace(/\(\s*Beige\s*\d*\s*\)/gi, match => match) // keep but don't duplicate
        .replace(/\bshown full (?:body|figure)\b/gi, '')     // rendering instruction, not identity
        .replace(/\bshown full body in the scene\b/gi, '')
        // Force a concrete gender — image gen can't render "neutral"
        .replace(/\bgender[\s:]*neutral\b/gi, 'female')
        .replace(/\bgender[\s:]*any\b/gi, 'female')
        .replace(/\bnon[\s-]?binary\b/gi, 'female')
        // Strip key-value label prefixes the breakdown LLM generates
        .replace(/\bAge[\s:]+/gi, '')
        .replace(/\bGender[\s:]+/gi, '')
        .replace(/\bSkin tone[\s:]*(shade[\s:]*)?/gi, '')
        .replace(/\bFace shape[\s:]+/gi, '')
        .replace(/\bEye color\+?shape[\s:]+/gi, '')
        .replace(/\bNose[\s:]+/gi, '')
        .replace(/\bLips[\s:]+/gi, '')
        .replace(/\bHair[\s:]*\([^)]*\)[\s:]+/gi, '')
        .replace(/\bHair[\s:]+/gi, '')
        .replace(/\bBuild\+?height[\s:]+/gi, '')
        .replace(/\bDistinguishing marks[\s:]+/gi, '')
        .replace(/\bBuild[\s:]+/gi, '')
        .replace(/,\s*,/g, ',').replace(/^\s*,/, '').replace(/,\s*$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (name && identityDesc) {
        const { body, face } = splitIdentity(identityDesc);
        const bodyDesc = body || 'adult character';

        // Extract just hair color+length for minimal tier
        const hairMatch = face.match(/\b([\w-]+\s+)?(hair|bob|ponytail|bun|braids?|curls?|locs|afro)\b[^,]*/i);
        const hairShort = hairMatch ? hairMatch[0].trim() : '';
        // Extract just skin tone for moderate tier
        const skinMatch = face.match(/\b[\w-]+\s+skin\b[^,]*/i);
        const skinShort = skinMatch ? skinMatch[0].trim() : '';

        // ── MINIMAL: silhouette only (wide shots — character is small in frame)
        // Just enough to recognize "that's our character" at a distance
        const minimalDesc = `a ${bodyDesc}${hairShort ? ', ' + hairShort : ''}${clothing ? ', wearing ' + clothing.substring(0, 60) : ''}`;

        // ── MODERATE: action-level (medium shots — body visible, face not dominant)
        // Body + hair + skin + clothing — no detailed facial features
        let compactFaceMod = face;
        if (compactFaceMod.length > 100) {
          const cut = compactFaceMod.lastIndexOf(',', 100);
          compactFaceMod = cut > 50 ? compactFaceMod.substring(0, cut).trim() : compactFaceMod.substring(0, 100).trim();
        }
        const moderateDesc = styleTransform(bodyDesc, compactFaceMod);

        // ── FULL: portrait-level (close-ups — face is the subject)
        let compactFaceFull = face;
        if (compactFaceFull.length > 200) {
          const cut = compactFaceFull.lastIndexOf(',', 200);
          compactFaceFull = cut > 100 ? compactFaceFull.substring(0, cut).trim() : compactFaceFull.substring(0, 200).trim();
        }
        const fullDesc = styleTransform(bodyDesc, compactFaceFull);

        // Derive gender from THIS character's identity (not hardcoded)
        const charIdentity = identityDesc.toLowerCase();
        // Determine gender: explicit male wins, explicit female wins, otherwise default to female
        const hasExplicitMale = /\b(male|man|boy|father|husband|grandfather|son|brother)\b/.test(charIdentity);
        const hasExplicitFemale = /\b(female|woman|girl|mother|wife|grandmother|daughter|sister|she|her)\b/.test(charIdentity);
        const charIsMale = hasExplicitMale && !hasExplicitFemale;
        const charGN = charIsMale ? 'man' : 'woman';
        const charGA = charIsMale ? 'male' : 'female';
        console.log(`   ${name}: gender resolved → ${charGA} (explicitM=${hasExplicitMale}, explicitF=${hasExplicitFemale})`);

        function sanitizeGender(desc) {
          return desc
            .replace(/\bany gender\b/gi, charGA)
            .replace(/\bindividual\b/gi, charGN)
            .replace(/\bperson of any gender\b/gi, charGN)
            .replace(/\bgender[- ]neutral\b/gi, charGA)
            .replace(/\ba person\b/gi, `a ${charGN}`)
            .replace(/\bthe person\b/gi, `the ${charGN}`)
            .replace(/\ban adult\b/gi, `a ${charGN}`);
        }

        characterTieredTags[name] = {
          minimal: sanitizeGender(minimalDesc.length > 150 ? minimalDesc.substring(0, 150).trim() : minimalDesc),
          moderate: sanitizeGender(moderateDesc.length > 300 ? moderateDesc.substring(0, 300).trim() : moderateDesc),
          full: sanitizeGender(fullDesc.length > 500 ? fullDesc.substring(0, 500).trim() : fullDesc)
        };

        if (c.reference_prompt) {
          characterReferencePrompts[name] = c.reference_prompt;
        }
      }
    }

    // Backward-compat: keep characterIdentityTags pointing to moderate tier
    const characterIdentityTags = {};
    for (const [name, tiers] of Object.entries(characterTieredTags)) {
      characterIdentityTags[name] = tiers.moderate;
    }

    console.log(`👤 Character identity tiers (${visualStyle}) built for: ${Object.keys(characterTieredTags).join(', ') || 'none'}`);
    for (const [name, tiers] of Object.entries(characterTieredTags)) {
      console.log(`   ${name}: minimal=${tiers.minimal.length}ch | moderate=${tiers.moderate.length}ch | full=${tiers.full.length}ch`);
    }
    if (Object.keys(characterReferencePrompts).length > 0) {
      console.log(`📸 Reference prompts available for: ${Object.keys(characterReferencePrompts).join(', ')}`);
    }


    // ══════════════════════════════════════════════════════════════
    // PROP EXTRACTOR — named objects from narration
    // ══════════════════════════════════════════════════════════════
    // The narration says "iPhone" but the LLM might write "phone" or
    // even "laptop." We extract specific nouns from narration and
    // inject them into the scene directions so Gemini uses them.
    // Props are PART of the scene — never the SUBJECT.
    // ══════════════════════════════════════════════════════════════

    function extractNamedProps(narrationText) {
      if (!narrationText) return [];
      const props = [];
      // Devices (specific beats generic)
      const deviceMap = [
        [/\biphone\b/i, 'an iPhone'],
        [/\bipad\b/i, 'an iPad'],
        [/\bmacbook\b/i, 'a MacBook'],
        [/\bandroid\s*(phone|device)?\b/i, 'an Android phone'],
        [/\bsamsung\b/i, 'a Samsung phone'],
        [/\bgalaxy\b/i, 'a Samsung Galaxy'],
        [/\blaptop\b/i, 'a laptop'],
        [/\bcomputer\b/i, 'a computer'],
        [/\btablet\b/i, 'a tablet'],
        [/\bkindle\b/i, 'a Kindle'],
      ];
      // Vehicles
      const vehicleMap = [
        [/\btesla\b/i, 'a Tesla'],
        [/\bporsche\b/i, 'a Porsche'],
        [/\bbmw\b/i, 'a BMW'],
        [/\buber\b/i, 'an Uber car'],
      ];
      // Brands/places
      const brandMap = [
        [/\bstarbucks\b/i, 'a Starbucks cup'],
        [/\bamazon\s*package\b/i, 'an Amazon package'],
        [/\bnetflix\b/i, 'a screen'],
      ];
      
      for (const mapList of [deviceMap, vehicleMap, brandMap]) {
        for (const [pattern, replacement] of mapList) {
          if (pattern.test(narrationText)) {
            props.push(replacement);
            break; // one per category
          }
        }
      }
      return props;
    }


    let storyContext = '';
    let blueprintSceneMap = {}; // scene_number → director data (now read from Scene records, not blueprint)
    try {
      // Story analysis is stored in ProductionSettings (scene_blueprint has a size limit)
      const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
      const ps = psList[0];
      if (ps?.story_analysis) {
        const sa = JSON.parse(ps.story_analysis);
        storyContext = `**STORY:** Theme: ${sa.central_theme || ''} | Visual World: ${sa.visual_world || ''} | Color Arc: ${sa.color_arc || ''} | Motifs: ${JSON.stringify(sa.recurring_visual_motifs || [])}`;
        console.log(`📋 Story analysis loaded from ProductionSettings`);
      } else {
        // Fallback: try scene_blueprint (backward compat with older projects)
        const blueprint = JSON.parse(project.scene_blueprint || '{}');
        const sa = blueprint.story_analysis || blueprint.sa;
        if (sa) {
          storyContext = `**STORY:** Theme: ${sa.central_theme || sa.t || ''} | Visual World: ${sa.visual_world || sa.v || ''} | Color Arc: ${sa.color_arc || sa.c || ''} | Motifs: ${JSON.stringify(sa.recurring_visual_motifs || sa.m || [])}`;
        }
      }
      // Director notes are now stored on each Scene record (DIRECTOR_NOTES: prefix)
      // extractDirectorNotes() handles this — blueprintSceneMap stays empty
    } catch (_) {
      storyContext = `**STORY:** Topic: "${project.name}" | Niche: ${project.niche || 'general'}`;
    }


    console.log(`🎨 Generating prompts for ${pendingScenes.length} scenes`);
    console.log(`🖼️ Style: ${visualStyle} | 📐 ${orientation}`);


    let totalPrompts = 0;
    let totalWarnings = 0;
    const totalBatches = Math.ceil(pendingScenes.length / BASE_BATCH_SIZE);


    // ═══ QUALITY ANCHORS — best prompts from completed scenes ═══
    // Inject 2-3 examples of GOOD prompts into every batch so the LLM
    // knows the expected quality bar, not just the instructions
    let qualityAnchors = '';
    try {
      const completedScenes = allScenes
        .filter(s => s.status === 'prompts_ready' && s.image_prompt && !s.image_prompt.startsWith('DIRECTOR_NOTES:'))
        .sort((a, b) => a.scene_number - b.scene_number);


      if (completedScenes.length >= 2) {
        // Pick the longest/richest prompts as quality examples
        const ranked = [...completedScenes]
          .sort((a, b) => (b.image_prompt?.length || 0) - (a.image_prompt?.length || 0))
          .slice(0, 3);


        qualityAnchors = `
**═══════════════════════════════════════════════════════════════**
**QUALITY REFERENCE — your output MUST match or exceed this detail level:**
**═══════════════════════════════════════════════════════════════**
${ranked.map((s, i) => `
EXAMPLE ${i + 1} (Scene ${s.scene_number} — ${s.image_prompt.length} chars):
image_prompt: "${s.image_prompt.substring(0, 500)}"
animation_prompt: "${(s.animation_prompt || '').substring(0, 200)}"
`).join('\n')}
**Every prompt you write MUST be at least this detailed. Prompts shorter than 150 characters will be REJECTED.**
**═══════════════════════════════════════════════════════════════**`;


        console.log(`📋 Quality anchors loaded from ${ranked.length} existing scenes (${ranked.map(s => `S${s.scene_number}: ${s.image_prompt.length}ch`).join(', ')})`);
      }
    } catch (_) {
      console.log('No quality anchors available — first batch');
    }
    // Process 1 batch per call to avoid platform timeout
    // Adaptive batch size: 12 for first 60 scenes, 8 for 60-200, 6 for 200+
    const totalPendingScenes = pendingScenes.length;
    const completedSoFar = allScenes.filter(s => s.status === 'prompts_ready').length;
    const BATCH_SIZE = completedSoFar > 200 ? 6 : completedSoFar > 60 ? 8 : BASE_BATCH_SIZE;
    console.log(`📦 Batch size: ${BATCH_SIZE} (${completedSoFar} scenes already completed)`);


    const startBIdx = 0;
    const maxBatchesPerCall = 1;
    for (let bIdx = startBIdx; bIdx < Math.min(startBIdx + maxBatchesPerCall, totalBatches); bIdx++) {
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
        return {
          scene_number: scene.scene_number,
          scene_id: scene.id,
          narration_text: scene.narration_text,
          duration_seconds: scene.duration_seconds || 5,
          director
        };
      });


      const sceneDirections = scenesWithNotes.map(s => {
        // Resolve arc position: prefer director.phase (from breakdown), fall back to arc_position, then 'rising'
        const arcPosition = s.director?.phase || s.director?.arc_position || 'rising';
        const arcAnim = getArcAnimationGuidance(arcPosition);
        const sceneDuration = s.duration_seconds;
        
        // Extract named props from narration for prop fidelity
        const namedProps = extractNamedProps(s.narration_text);
        const propsLine = namedProps.length > 0
          ? `\n  Named Props (use these EXACT names, as background props NOT subjects): ${namedProps.join(', ')}`
          : '';

        // Determine character description depth from shot type
        const shotType = s.director?.shot_type || 'MS — Medium Shot';
        const identityTier = getIdentityTier(shotType);

        const bodyDirective = getBodyProportionDirective(s.director?.shot_type || 'MS — Medium Shot');

        if (!s.director) {
          return `Scene ${s.scene_number}: (No director notes — generate from narration)\n  Narration: "${s.narration_text}"\n  Duration: ${sceneDuration}s\n  Character Detail Level: ${identityTier.toUpperCase()} (match description depth to this)\n  Body Proportion: ${bodyDirective}\n  Arc Phase: ${arcPosition}\n  Arc Animation: ${arcAnim}${propsLine}`;
        }
        return `Scene ${s.scene_number}:
  Narration: "${s.narration_text}"
  Duration: ${sceneDuration}s
  Visual Concept: ${s.director.visual_concept}
  Shot Type: ${s.director.shot_type}
  Character Detail Level: ${identityTier.toUpperCase()} (${identityTier === 'minimal' ? 'wide shot — silhouette only, NO face details' : identityTier === 'moderate' ? 'medium shot — body + hair + skin, brief features' : 'close-up — full identity for face consistency'})
  Body Proportion: ${bodyDirective}
  Camera Angle: ${s.director.camera_angle}
  Camera Movement: ${s.director.camera_movement}
  Lighting: ${s.director.lighting}
  Color Palette: ${s.director.color_palette}
  Mood: ${s.director.mood}
  DOF: ${s.director.depth_of_field}
  Niche Element: ${s.director.niche_visual_element || 'N/A'}
  Continuity: ${s.director.continuity_bridge || 'N/A'}
  Intensity: ${s.director.emotional_intensity || 0.5}
  Arc Phase: ${arcPosition}
  Arc Animation: ${arcAnim}${propsLine}`;
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
${qualityAnchors}


**VISUAL STYLE: "${visualStyle}"**
**ORIENTATION:** ${orientationConfig.format}


**STYLE QUALITY SUFFIX (append at the END of each image_prompt, NOT the beginning):**
"${styleConfig.positive}"
${styleBodyBlock}


**UNIVERSAL FRAMING RULES (apply to ALL visual styles):**
- Show characters FULL where needed — NOT torso-only or bust crops unless specifically an ECU emotional beat
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


1. **image_prompt** — Production-ready AI image generation prompt. The image generator renders whatever it reads FIRST as the dominant element. STRUCTURE MATTERS:

   **STEP A — SHOT FRAMING + BODY PROPORTION (first sentence, most important):**
   Start EVERY prompt with the shot type AND how much of the character's body is visible: "Full body wide shot showing a woman walking head to feet through..." or "Medium shot from waist up showing hands gripping..." or "Low angle looking up at a figure towering against..."
   This MUST be the very first thing in the prompt. The image generator commits to this framing before reading anything else.
   USE THE "Body Proportion" FIELD from the scene notes — it tells you EXACTLY how much body to show and how the character relates to objects in the frame.

   **STEP B — ENVIRONMENT (next 1-2 sentences):**
   Describe the COMPLETE environment: location, architecture, weather, time of day, foreground props, background depth.
   Example: "...a rain-slicked Tokyo street at dusk, neon signs reflecting in puddles between parked cars, steam rising from a ramen cart in the foreground, office towers vanishing into low clouds behind."

   **STEP C — CHARACTER IN CONTEXT (depth depends on shot type):**
   The amount of character detail must match the shot framing. Over-describing a character in a wide shot causes the image generator to zoom into their face.

   **CRITICAL — WEAVE, DON'T ISOLATE:**
   Character descriptions must be WOVEN INTO THE ACTION AND ENVIRONMENT — never as a separate catalog of features.
   The character exists IN the world, interacting with objects, affected by lighting, touching surfaces.
   
   BAD (isolated): "A woman with brown hair, oval face, light skin, brown eyes, 5ft4, wearing a blue jacket. She is in a kitchen."
   GOOD (woven): "A brown-haired woman in a rumpled blue jacket leans against the kitchen counter, her light skin catching the warm glow of the overhead lamp as she scrolls through her phone, coffee steam curling past her face."
   
   The GOOD version weaves identity (brown hair, light skin, blue jacket) INTO the action (leaning, scrolling) and environment (kitchen counter, lamp glow, coffee steam). Every character trait connects to something in the scene.

   **WIDE/ENVIRONMENTAL shots (WS, EWS, MWS, HIGH ANGLE, OVERHEAD, ESTABLISHING):**
   Character is SMALL in frame. Use MINIMAL description — just silhouette identifiers woven into movement:
   "A woman with a dark-brown bob in a lavender jacket walks through the crosswalk, phone in hand."
   NO face details, NO eye color, NO skin texture. The character is a figure in a landscape.

   **MEDIUM/ACTION shots (MS, LOW ANGLE, OTS, TRACKING, DUTCH):**
   Character is visible but environment shares the frame. Use MODERATE description — body, hair, skin tone WOVEN INTO action:
   "A 5ft4 woman with dark-brown hair strides through the crowd, light-beige skin catching the neon glow, clutching her phone mid-step."
   Brief identifying features WOVEN INTO ACTION — not a feature catalog.

   **CLOSE-UP shots (CU, MCU, ECU, POV, INSERT):**
   Character's face IS the subject. Use FULL description for consistency, WOVEN with emotion:
   "Extreme close-up — a woman's light-beige face with warm undertones crumples as wide-set light-brown eyes glisten with unshed tears, dark-brown hair falling across her forehead as she bites her lower lip."

   **PROP FIDELITY:**
   When the narration mentions a specific device or object (iPhone, MacBook, Tesla, Starbucks cup), use that EXACT name in the prompt — NOT a generic replacement. But the prop is part of the scene, never the subject. The character and environment dominate; the prop is in their hand or nearby.
   GOOD: "...clutching her iPhone as she crosses the street"
   BAD: "...a close-up of an iPhone screen showing settings" ← prop became the subject

   **STEP D — ATMOSPHERE + STYLE (final sentence):**
   End with mood, lighting, and the style quality suffix.
   Example: "...warm golden hour backlight casting long shadows, volumetric dust in the air. ${styleConfig.positive.substring(0, 80)}."

   **THE GOLDEN RULE:** If the image generator only renders the first 200 characters of your prompt, would it produce a SCENE or a PORTRAIT? It MUST produce a scene. That means FRAMING + ENVIRONMENT must come first, ALWAYS.

   Additional rules:
     • Character description depth MUST match shot type — wide shots get minimal, medium gets moderate, close-ups get full. NEVER dump a full casting-sheet description into a wide shot.
     • If the narration mentions a specific prop (iPhone, MacBook, Tesla, etc.), use that exact name — but keep it as a prop in the character's hand or environment, NOT the visual subject.
     • ${orientationConfig.composition}
   - FORBIDDEN: text, words, letters, numbers, charts, graphs, signs in the image
   - FORBIDDEN: Describing what's ON a screen, phone, laptop, book, receipt, bill, letter, contract, or any document. The image generator WILL try to render it as garbled text. Instead, show the character's emotional reaction to the object from a wider angle. Example: "crumpled bill clutched in trembling hands, face pale under harsh light" NOT "medical bill showing $45,000 in charges"
   - FORBIDDEN: Dollar amounts ($X), percentages, dates, names, or any specific text that would appear on a prop. These render as random garbled characters.
   - When a character holds or uses an object (phone, document, tool, weapon, cup), describe it from a MEDIUM or WIDER shot. Close-ups of hand-object interaction produce broken physics (fingers clipping through objects, impossible grips). Let the object be PART of the scene, not the SUBJECT of it.
   - Abstract concepts → PHYSICAL METAPHORS
   - End with: "ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image"


2. **animation_prompt** — RICH, CINEMATIC motion direction for the EXACT duration of each scene (see Duration field per scene):
   - NOT a simple camera instruction — a FULL MOTION POEM describing everything that moves over the scene's duration.
   - **IMPORTANT: Each scene has its own duration.** A 3.5s scene needs TIGHT, PUNCHY motion. A 7s scene can BREATHE. Match the motion density to the seconds available.
   - **Include ALL layers:**
     a) **CAMERA MOTION**: Specific movement with speed, direction, framing change
     b) **ATMOSPHERIC MOTION**: Dust motes, fog, light shifting, rain, leaves, fabric rippling, steam
     c) **SUBJECT MOTION**: Breathing, hair shifting, fingers tightening, eyes darting, fabric settling
     d) **LIGHT DYNAMICS**: Rays creeping across surfaces, firelight dancing, shadows drifting
     e) **DEPTH SHIFTS**: Rack focus, DOF breathing, focus pulls revealing detail
     f) **EMOTIONAL QUALITY**: "heavy and reluctant" vs "urgent and searching" vs "tender and hesitant"
   - **ARC POSITION**: ${orientationConfig.animation}
     • COLD_OPEN / SETUP: Sharp, immediate. Camera grabs attention — quick cuts, assertive angles.
     • RISING_TENSION / RISING: Building momentum. Camera grows bolder. Push-ins, tracking.
     • EMOTIONAL_CORE / CLIMAX: Peak intensity but DELIBERATE. Camera lingers. Meaningful holds. Let moments breathe.
     • RESOLUTION: Exhale. Camera pulls back gently. Peace settles.
   - **MINIMUM 3-4 rich sentences** — NEVER generic "slow pan right"


**RESPONSE:**
{
  "prompts": [
    {
      "scene_number": 1,
      "image_prompt": "[SHOT FRAMING first]. [ENVIRONMENT]. [CHARACTER body-first in action with compact identity]. [ATMOSPHERE + style quality suffix]",
      "animation_prompt": "[motion direction for this scene's specific duration]"
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
          let rawPrompt = generated.image_prompt || '';

          // Use per-scene duration from breakdown, not the old hardcoded CLIP_DURATION
          const sceneDuration = s.duration_seconds;

          // ═══ QUALITY GATE — catch lazy/thin prompts ═══
          const promptWords = rawPrompt.split(/\s+/).filter(w => w.length > 0).length;


          if (promptWords < 30) {
            // Critically thin — LLM got lazy on this scene. Regenerate solo.
            console.warn(`⚠️ Scene ${s.scene_number}: only ${promptWords} words — regenerating...`);
            try {
              const bodyRules = getStyleSceneBodyRules(visualStyle);
              const soloPrompt = `Generate ONE detailed image prompt for this scene.

${bodyRules ? `**STYLE RENDERING RULES:**\n**Characters:** ${bodyRules.characters}\n**Environments:** ${bodyRules.environments}` : ''}

**SCENE ${s.scene_number}:**
Narration: "${s.narration_text}"
${s.director ? `Visual Concept: ${s.director.visual_concept}\nShot: ${s.director.shot_type} | Angle: ${s.director.camera_angle} | Lighting: ${s.director.lighting} | Mood: ${s.director.mood}` : ''}

**STRUCTURE (follow this order EXACTLY):**
1. FIRST sentence: Shot framing — "Full body wide shot showing..." or "Medium shot of..."
2. NEXT 1-2 sentences: Environment — location, architecture, weather, props, atmosphere
3. NEXT 1-2 sentences: Character BODY-FIRST (build, height, posture, action), then face features as compact clause
4. FINAL sentence: Mood, lighting, then style quality: "${styleConfig.positive.substring(0, 100)}"

**FORBIDDEN:** text/words/numbers on any surface, screen content descriptions, dollar amounts, close-ups of hands holding objects.
If the scene mentions a phone/document/receipt, describe the CHARACTER'S REACTION to it, not the content on it.

Minimum 80 words. Respond with ONLY the image_prompt text, no JSON.`;


              const soloResult = await callGemini(soloPrompt, 0.8, 4096);
              const soloText = typeof soloResult === 'string' ? soloResult : (soloResult.image_prompt || soloResult.prompt || JSON.stringify(soloResult));
              if (soloText && soloText.split(/\s+/).length > 30) {
                rawPrompt = soloText;
                console.log(`✓ Scene ${s.scene_number}: regenerated — now ${soloText.split(/\s+/).length} words`);
              }
            } catch (regenErr) {
              console.warn(`Scene ${s.scene_number} regen failed: ${regenErr.message}`);
            }
          }


          // ═══ SHOT-TYPE-AWARE CHARACTER IDENTITY INJECTION ═══
          // The amount of character detail injected depends on the shot type.
          // Wide shots: minimal (silhouette). Medium: moderate. Close-ups: full.
          // This prevents the floating-head problem where detailed face descriptions
          // in wide shots cause Grok to zoom into the face.

          const shotType = s.director?.shot_type || 'MS — Medium Shot';
          const identityTier = getIdentityTier(shotType);

          // Step 1: Find which known characters appear in this scene
          const sceneCast = [];
          for (const [charName] of Object.entries(characterTieredTags)) {
            const namePattern = new RegExp(`\\b${charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            if (namePattern.test(rawPrompt)) {
              sceneCast.push({ name: charName, tiers: characterTieredTags[charName] });
            }
          }

          // Step 2: Check for generic references → map to primary character
          const genericRefs = /\b(the protagonist|the main character|the character|the figure|the hero|the narrator)\b/gi;
          if (genericRefs.test(rawPrompt) && characters.length > 0) {
            const primaryName = (characters[0].name || '').toLowerCase().trim();
            if (primaryName && characterTieredTags[primaryName] && !sceneCast.find(c => c.name === primaryName)) {
              sceneCast.unshift({ name: primaryName, tiers: characterTieredTags[primaryName] });
            }
          }

          if (sceneCast.length > 0) {
            let modifiedPrompt = rawPrompt;

            for (const c of sceneCast) {
              // Pick the right tier based on shot type
              const desc = c.tiers[identityTier] || c.tiers.moderate;
              if (!desc) continue;

              const escapedName = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

              // Strip ALL LLM-generated character descriptions to prevent duplication.
              // We'll inject the correct tier-appropriate identity tag after stripping.

              // Parentheticals: "The Consumer (a 35-year-old woman with...)"
              modifiedPrompt = modifiedPrompt.replace(
                new RegExp(`\\b${escapedName}\\b\\s*\\([^)]{5,}\\)`, 'gi'), c.name
              );
              // Inline comma descriptions: "The Consumer, a 35-year-old woman with brown eyes, average build, ..."
              modifiedPrompt = modifiedPrompt.replace(
                new RegExp(`\\b${escapedName}\\b,\\s*(?:a\\s)?\\d{1,2}[^.]*?(?=\\b(?:stands|sits|walks|is|was|holds|stares|looks|leans|clutch|grip|reach|kneel|crouch|watch|gaze|turn|step|press|scroll|tap|carry)\\b)`, 'gi'), `${c.name} `
              );
              // Fallback: broader comma-separated inline descriptions
              modifiedPrompt = modifiedPrompt.replace(
                new RegExp(`\\b${escapedName}\\b,\\s*a\\s[^,]{10,}(?:,\\s*[^,]{5,}){0,6},\\s*`, 'gi'), `${c.name}, `
              );
              // "Name has light-medium skin..." / "Name/Archetype has..."
              modifiedPrompt = modifiedPrompt.replace(
                new RegExp(`\\b${escapedName}(?:\\/[\\w\\s]+)?\\s+has\\s+[^.]{20,}?\\.`, 'gi'), ''
              );
              // "Name is a 30-year-old woman with..."
              modifiedPrompt = modifiedPrompt.replace(
                new RegExp(`\\b${escapedName}\\s+is\\s+a\\s+\\d{1,2}[^.]{15,}?\\.`, 'gi'), ''
              );
              // "Name, age 35, female, medium skin tone..." (key-value identity the LLM copies from character block)
              modifiedPrompt = modifiedPrompt.replace(
                new RegExp(`\\b${escapedName}\\b,\\s*age\\s+\\d{1,2}[^.]{10,}?\\.`, 'gi'), `${c.name}.`
              );
              // Slash-name duplicates: "Sarah/The Everyperson"
              modifiedPrompt = modifiedPrompt.replace(
                new RegExp(`\\b${escapedName}\\/[\\w\\s]{3,30}\\b`, 'gi'), c.name
              );
              // Strip raw identity_core dumps the LLM copies verbatim from the character block
              // e.g. "The 55 year old male with light-medium skin, oval face shape, hazel eyes (almond-shaped)..."
              // These isolated descriptions cause image gen to render a portrait/floating head
              modifiedPrompt = modifiedPrompt.replace(
                /\b(?:The|A|An)\s+\d{1,2}\s*[-–]?\s*year[\s-]*old\s+(?:male|female|man|woman)\s+with\s+[^.]{30,}?(?=\b(?:is|was|sits|stands|walks|looks|leans|holds|stares|shows|implied|clutch|grip)\b)/gi,
                ''
              );
              // Strip remaining SECOND occurrence of the full name (the LLM often writes it twice)
              let nameCount = 0;
              modifiedPrompt = modifiedPrompt.replace(
                new RegExp(`\\b${escapedName}\\b`, 'gi'),
                (match) => { nameCount++; return nameCount <= 1 ? match : ''; }
              );
              // Clean up orphaned punctuation from stripping
              modifiedPrompt = modifiedPrompt.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ');

              // ═══ CONTEXTUAL CHARACTER INJECTION ═══
              // Replace the name with the tier-appropriate identity description.
              // CRITICAL: Always REPLACE the name, never create "Name, HUGE BLOB, verb" patterns.
              // The old appositive pattern ("Name, desc, is sitting") caused image gen to
              // read the identity blob as a portrait subject, producing floating heads.
              // Instead, we substitute: "Name walks" → "[identity desc] walks"
              const firstOcc = modifiedPrompt.match(new RegExp(`\\b${escapedName}\\b`, 'i'));
              if (firstOcc) {
                const idx = modifiedPrompt.indexOf(firstOcc[0]);
                const before = modifiedPrompt.substring(0, idx);
                const after = modifiedPrompt.substring(idx + firstOcc[0].length);
                const afterTrimmed = after.trimStart();
                const isPossessive = /^'s\b/.test(afterTrimmed);
                if (isPossessive) {
                  modifiedPrompt = `${before}${desc}, whose${after.substring(after.indexOf("'s") + 2)}`;
                } else {
                  // Always substitute — the desc reads as a natural noun phrase
                  // "The Consumer walks" → "a 55-year-old man with graying hair walks"
                  modifiedPrompt = `${before}${desc}${after}`;
                }
                console.log(`👤 Scene ${s.scene_number}: ${identityTier.toUpperCase()} identity for "${c.name}" (${desc.length} chars)`);
              }
            }

            // Replace generic "the protagonist" etc with primary character's tiered description
            if (characters.length > 0) {
              const primaryName = (characters[0].name || '').toLowerCase().trim();
              const primaryTiers = characterTieredTags[primaryName];
              if (primaryTiers) {
                const primaryDesc = primaryTiers[identityTier] || primaryTiers.moderate;
                modifiedPrompt = modifiedPrompt.replace(genericRefs, primaryDesc);

                // "the man"/"the woman" → minimal desc only (these are always background references)
                if (sceneCast.length === 1) {
                  modifiedPrompt = modifiedPrompt.replace(
                    /\bthe (man|woman|boy|girl|person)\b/gi,
                    primaryTiers.minimal
                  );
                }
              }
            }

            rawPrompt = modifiedPrompt;
          }

          // ═══ PROP FIDELITY — inject named props from narration ═══
          // If narration says "iPhone" but LLM wrote "phone", fix it
          const namedProps = extractNamedProps(s.narration_text);
          if (namedProps.length > 0) {
            for (const prop of namedProps) {
              const genericProp = prop.replace(/^an?\s+/i, ''); // "an iPhone" → "iPhone"
              // Only inject if a generic version exists in the prompt
              const genericPatterns = {
                'iPhone': /\b(her|his|the|a)\s+phone\b/i,
                'iPad': /\b(her|his|the|a)\s+tablet\b/i,
                'MacBook': /\b(her|his|the|a)\s+laptop\b/i,
                'Android phone': /\b(her|his|the|a)\s+phone\b/i,
                'Samsung phone': /\b(her|his|the|a)\s+phone\b/i,
                'Samsung Galaxy': /\b(her|his|the|a)\s+phone\b/i,
                'Tesla': /\b(her|his|the|a)\s+(car|vehicle)\b/i,
                'Porsche': /\b(her|his|the|a)\s+(car|vehicle|sports\s+car)\b/i,
                'BMW': /\b(her|his|the|a)\s+(car|vehicle)\b/i,
              };
              const pattern = genericPatterns[genericProp];
              if (pattern && pattern.test(rawPrompt)) {
                rawPrompt = rawPrompt.replace(pattern, `$1 ${genericProp}`);
                console.log(`📱 Scene ${s.scene_number}: prop "${genericProp}" injected (replaced generic)`);
              }
            }
          }




          // ═══ FINAL PROMPT SANITIZATION — catch anything tier system missed ═══
          // Derive gender dynamically from primary character
          const primaryChar = characters[0] || {};
          const primaryId = (primaryChar.identity_core || primaryChar.visual_description || primaryChar.description || '').toLowerCase();
          const isMale = /\b(male|man|boy|he|his|father|husband|grandfather|son|brother)\b/.test(primaryId);
          const genderNoun = isMale ? 'man' : 'woman';
          const genderAdj = isMale ? 'male' : 'female';

          // Gender: never "individual", "any gender", "a person"
          rawPrompt = rawPrompt
            .replace(/\bany gender\b/gi, genderAdj)
            .replace(/\b(an?\s+)?individual\b/gi, `a ${genderNoun}`)
            .replace(/\bperson of any gender\b/gi, genderNoun)
            .replace(/\bgender[- ]neutral\b/gi, genderAdj);

          // If NO character was injected (sceneCast was empty), weave primary character at first human reference
          if (sceneCast.length === 0 && characters.length > 0) {
            const pName = (characters[0].name || '').toLowerCase().trim();
            const pTiers = characterTieredTags[pName];
            if (pTiers) {
              const shotType = s.director?.shot_type || 'MS — Medium Shot';
              const tier = getIdentityTier(shotType);
              const desc = pTiers[tier] || pTiers.moderate;
              const genericHuman = /\b(a\s+(?:woman|man|person|figure|character|user|narrator))\b/i;
              const ghMatch = rawPrompt.match(genericHuman);
              if (ghMatch) {
                const ghIdx = rawPrompt.indexOf(ghMatch[0]);
                const ghBefore = rawPrompt.substring(0, ghIdx);
                const ghAfter = rawPrompt.substring(ghIdx + ghMatch[0].length);
                // Always substitute — never appositive ("a woman, DESC, is sitting")
                rawPrompt = `${ghBefore}${desc}${ghAfter}`;
                console.log(`👤 Scene ${s.scene_number}: injected primary char via generic ref (${tier}, ${desc.length}ch)`);
              }
            }
          }

          // Ensure character is DOING something — inject action if no verb found
          if (!/\b(is|was|sits|stands|walks|runs|holds|stares|looks|leans|clutch|grip|reach|kneel|crouch|watch|gaze|turn|step|press|scroll|tap|delet|swip|carry|push|pull|lift|throw|pour|eat|drink|read|writ|typ|driv|sitting|standing|walking|holding|staring|leaning|scrolling|tapping|deleting|carrying|pushing)\w*\b/i.test(rawPrompt)) {
            const mood = s.director?.mood || 'contemplative';
            const action = mood.includes('tense') ? 'standing rigid with clenched fists'
              : mood.includes('sad') || mood.includes('despair') || mood.includes('defeat') ? 'sitting hunched with shoulders drawn in'
              : mood.includes('happy') || mood.includes('relief') ? 'walking with a light stride'
              : mood.includes('frustrat') ? 'pressing fingers against forehead'
              : 'pausing mid-step, weight shifting';
            rawPrompt = rawPrompt.replace(/\b(in the scene|in frame|visible|standing)\b/i, `${action} in the scene`);
            console.log(`🎬 Scene ${s.scene_number}: injected action "${action}" (no verb detected)`);
          }

          // ═══ STRIP FORBIDDEN CONTENT — screen/UI/text that image gen renders as garbled text ═══
          rawPrompt = rawPrompt
            // Screen content: "Storage Almost Full notification", "showing settings menu"
            .replace(/\b(?:the\s+)?['"]?storage\s+(?:almost\s+)?full['"]?\s*(?:notification|warning|alert|message|popup|banner)?/gi, 'a notification on')
            .replace(/\bdisplaying\s+a\s+(?:warning\s+)?notification\s+on\b/gi, 'glowing with a notification')
            .replace(/\bnotification\s+(?:flashes|appears|shows|displays|reads|says)[^.]*\./gi, 'notification glows on the screen.')
            .replace(/\bscreen\s+(?:showing|displaying|reading|that reads|with)[^.]*\./gi, 'screen glowing in the dark.')
            .replace(/\bsettings?\s+(?:menu|app|page|screen)\b[^.]*\./gi, 'phone screen.')
            // Specific app/UI names
            .replace(/\b(?:Battery|Privacy|General|Wi-Fi|Bluetooth|iCloud|Photos|Camera|Safari|Chrome|Gmail|Instagram|TikTok|YouTube|Settings)\s*(?:app|menu|option|setting|page)?\b/gi, '')
            // Dollar amounts and percentages
            .replace(/\$[\d,.]+/g, 'a significant amount')
            .replace(/\d+(?:\.\d+)?%/g, 'a large percentage')
            // UI elements
            .replace(/\b(?:the\s+)?['"]?OK['"]?\s*button\b/gi, 'the screen')
            .replace(/\b(?:tap|press|click|hover)\w*\s+(?:on\s+)?(?:the\s+)?['"]?(?:OK|Cancel|Delete|Accept|Confirm|Submit|Close|Back|Next|Done|Settings|Allow|Deny)['"]?\s*(?:button|option|link)?\b/gi, 'interacting with the phone')
            .replace(/\bher\s+thumb\s+hovering\s+over\b[^,.]*/gi, 'her fingers gripping the phone tightly')
            // Cleanup double spaces and orphaned punctuation
            .replace(/\s{2,}/g, ' ')
            .replace(/,\s*,/g, ',')
            .replace(/\.\s*\./g, '.');
          imagePrompt = validateAndEnhancePrompt(
            rawPrompt, styleConfig, orientationConfig, s.scene_number, visualStyle
          );
          animationPrompt = generated.animation_prompt || '';
          if (animationPrompt.length < 80) {
            const arcPosition = s.director?.phase || s.director?.arc_position || 'rising';
            const mood = s.director?.mood || 'contemplative';
            const movement = s.director?.camera_movement || 'slow drift forward';
            const vc = s.director?.visual_concept || s.narration_text || '';
            animationPrompt = `${movement} over ${sceneDuration} seconds. ${getArcAnimationGuidance(arcPosition)} Foreground elements shift with parallax depth against the background. Subject's body language carries the emotion — micro-movements in hands, shoulders, breathing rhythm. Environmental details respond: ${vc.includes('rain') ? 'rain streaks down surfaces, pooling light reflections ripple' : vc.includes('wind') ? 'fabric and hair catch the wind, leaves scatter across frame' : vc.includes('night') ? 'shadows crawl across walls, distant lights pulse faintly' : 'ambient textures shift — dust motes, fabric settling, light evolving across surfaces'}. The emotional quality is ${mood} — motion weight and speed match this energy. Shallow depth of field breathes subtly between foreground and subject.`;
          }
        } else {
          console.warn(`⚠️ Scene ${s.scene_number} missing from response — building fallback`);
          totalWarnings++;

          const sceneDuration = s.duration_seconds;

          let fallback = `${promptPrefix}. `;
          if (s.director) {
            fallback += `${s.director.shot_type}. ${s.director.visual_concept}. `;
            fallback += `${s.director.lighting}. Color palette: ${s.director.color_palette}. `;
            fallback += `${s.director.depth_of_field}. Mood: ${s.director.mood}. `;
          } else {
            fallback += `Cinematic scene depicting: ${s.narration_text}. Professional composition. `;
          }


          // ═══ FALLBACK SANITIZATION — same fixes as primary path ═══
          const primaryChar = characters[0] || {};
          const primaryId = (primaryChar.identity_core || primaryChar.visual_description || primaryChar.description || '').toLowerCase();
          const isMale = /\b(male|man|boy|he|his|father|husband|grandfather|son|brother)\b/.test(primaryId);
          const genderNoun = isMale ? 'man' : 'woman';
          const genderAdj = isMale ? 'male' : 'female';

          fallback = fallback
            .replace(/\bany gender\b/gi, genderAdj)
            .replace(/\b(an?\s+)?individual\b/gi, `a ${genderNoun}`)
            .replace(/\bperson of any gender\b/gi, genderNoun)
            .replace(/\bgender[- ]neutral\b/gi, genderAdj);

          // Inject primary character into fallback
          if (characters.length > 0) {
            const pName = (characters[0].name || '').toLowerCase().trim();
            const pTiers = characterTieredTags[pName];
            if (pTiers) {
              const genericHuman = /\b(a\s+(?:woman|man|person|figure|character))\b/i;
              const fbMatch = fallback.match(genericHuman);
              if (fbMatch) {
                const fbIdx = fallback.indexOf(fbMatch[0]);
                const fbBefore = fallback.substring(0, fbIdx);
                const fbAfter = fallback.substring(fbIdx + fbMatch[0].length);
                // Always substitute — never appositive
                fallback = `${fbBefore}${pTiers.moderate}${fbAfter}`;
              }
            }
          }

          imagePrompt = validateAndEnhancePrompt(fallback, styleConfig, orientationConfig, s.scene_number, visualStyle);
          const arcPosition = s.director?.phase || s.director?.arc_position || 'rising';
          const mood = s.director?.mood || 'contemplative';
          const movement = s.director?.camera_movement || 'slow drift forward';
          const vc = s.director?.visual_concept || s.narration_text || '';
          animationPrompt = `${movement} over ${sceneDuration} seconds. ${getArcAnimationGuidance(arcPosition)} Camera reveals the scene through parallax — foreground elements drift at different speed than background, creating cinematic depth. Subject exhibits natural micro-motion: breathing rhythm visible in chest and shoulders, weight shifts, small involuntary gestures. Environmental physics respond to the world: ${vc.includes('rain') ? 'water streaks surfaces, reflections ripple in puddles, droplets catch light' : vc.includes('wind') ? 'fabric ripples, hair lifts and settles, loose objects shift' : vc.includes('crowd') ? 'background figures move at varied speeds, creating depth layers' : 'ambient textures evolve — light creeps across surfaces, shadows rotate, particles drift through beams'}. Light is alive — ${mood.includes('tense') || mood.includes('anxiety') ? 'flickering, unstable, casting nervous shadows' : mood.includes('warm') || mood.includes('hope') ? 'gradually warming, golden rays expanding across frame' : 'shifting slowly, painting the scene with evolving tones'}. Shallow DOF breathes between planes, drawing focus where emotion lives.`;        }


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


    const remainingScenes = (await base44.asServiceRole.entities.Scenes.filter({ project_id }))
      .filter(s => s.status === 'breakdown_ready').length;
    const allDone = remainingScenes === 0;


    return Response.json({
      success: true,
      done: allDone,
      prompts_applied: totalPrompts,
      quality_warnings: totalWarnings,
      total_batches: totalBatches,
      remaining_scenes: remainingScenes,
      total_scenes: pendingScenes.length,
      // Character reference prompts for hero image generation
      // The image gen pipeline should generate ONE reference image per character
      // BEFORE generating scene images, and pass it as character_reference/cref
      character_reference_prompts: Object.keys(characterReferencePrompts).length > 0
        ? characterReferencePrompts
        : undefined
    });


  } catch (error) {
    console.error("❌ generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});