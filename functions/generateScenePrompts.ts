import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import OpenAI from 'npm:openai@4.52.0';


// ══════════════════════════════════════════════════════════════════
// SCENE PROMPT GENERATOR — DIRECTOR NOTES → PRODUCTION PROMPTS
// Pipeline: Script → Breakdown → [THIS] → OpenAI Clean → Image Gen → Animation
// ══════════════════════════════════════════════════════════════════


const BASE_BATCH_SIZE = 12;

// ══════════════════════════════════════════════════════════════════
// OPENAI PROMPT CLEANER — structures messy prompts for image gen
// ══════════════════════════════════════════════════════════════════

const _openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

const CLEANER_SYSTEM_PROMPT = `You are a principal prompt engineer specialized in cinematic image and video generation.

Your task is to CLEAN and STRUCTURE the following messy prompt WITHOUT changing, paraphrasing, or adding new creative ideas.

DO NOT rewrite creatively.
DO NOT expand or embellish.
ONLY organize, clarify relationships, remove ambiguity, and enforce visual hierarchy so an AI model can interpret it correctly without hallucination.

REQUIREMENTS:
1. Preserve ALL original elements exactly as given
2. Explicitly define: subject priority, spatial relationships, camera perspective, action timing
3. Resolve ambiguity in: who is holding objects, where objects appear, what is foreground/midground/background
4. Enforce: one clear primary subject, no conflicting perspectives, no duplicate or floating elements

TEXT HANDLING (CRITICAL):
If the prompt includes ANY text, UI, or screen elements:
- Treat text as a digital UI overlay, NOT part of the environment
- Place all text inside a defined container (no floating text)
- Use minimal, short, clean text only
- Enforce legibility: all text must be perfectly spelled, sharp, readable, high contrast
- Specify position (e.g., top banner, inside phone screen)
- Prevent hallucination with: no garbled text, no distorted letters, no stylized typography

STYLE ENFORCEMENT:
If a style is mentioned (e.g., 3D whiteboard cartoon):
- Lock it strictly
- Add constraints to prevent realism bleed: no photorealism, no complex textures, no cinematic blur unless specified

OUTPUT: Return ONLY a single clean structured prompt as ONE continuous text block. Structure it in this internal order as flowing prose (NOT labeled sections):
[MAIN SUBJECT] → [ENVIRONMENT] → [OBJECTS & DETAILS] → [CHARACTERS & POSITIONS] → [ACTIONS] → [CAMERA / COMPOSITION] → [LIGHTING] → [STYLE / MOOD] → [TEXT / UI if applicable] → [TECHNICAL SPECS] → [CONSTRAINTS / NEGATIVES]

IMPORTANT: Do NOT explain anything. Do NOT add commentary. Output ONLY the final cleaned prompt. Do NOT add section labels.`;

async function cleanPromptWithOpenAI(messyPrompt, visualStyle) {
  try {
    const styleConstraint = visualStyle
      ? (visualStyle === 'skeleton_protagonist'
        ? `\nThe visual style is skeleton protagonist — a transparent skeleton with glass-like body replaces the human character entirely. The skeleton is NOT overlaid on a real person. No real human skin or flesh on the protagonist. Other characters are normal humans. Do NOT write "Skeleton protagonist" as a label prefix.`
        : `\nThe visual style is strictly ${visualStyle.replace(/_/g, ' ')}. Lock this style and prevent any realism bleed or style mixing.`)
      : '';
    const response = await _openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 1024,
      messages: [
        { role: "system", content: CLEANER_SYSTEM_PROMPT },
        { role: "user", content: `Clean and structure this prompt:${styleConstraint}\n\n${messyPrompt}` }
      ]
    });
    const cleaned = (response.choices[0]?.message?.content || '').trim();
    if (cleaned && cleaned.length > 50) return cleaned;
    console.warn(`OpenAI cleaner returned thin result (${cleaned.length}ch), keeping original`);
    return messyPrompt;
  } catch (err) {
    console.warn(`OpenAI cleaner failed: ${err.message}, keeping original`);
    return messyPrompt;
  }
}
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
  if (normalized.includes('roblox')) { console.log(`✅ Keyword match: roblox`); return 'roblox'; }
  if (normalized.includes('skeleton')) { console.log(`✅ Keyword match: skeleton_protagonist`); return 'skeleton_protagonist'; }
  if (normalized.includes('afro') || normalized.includes('nolly')) { console.log(`✅ Keyword match: afro_nolly_global`); return 'afro_nolly_global'; }
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
  roblox: {
    positive: "Roblox-style 3D blocky character with cube-shaped head, rectangular torso and limbs, simple 2D cartoon face painted on the cube head (two round dot eyes, small curved mouth), bright flat-shaded matte plastic colors, toy-like R15 avatar proportions, clean geometric edges, no smoothing, Roblox game aesthetic, studio lighting, vibrant saturated colors",
    negative: "photorealistic, photograph, realistic anatomy, detailed muscles, curved joints, high-poly mesh, smooth skin, realistic face, wrinkles, pores, film grain, bokeh, lens flare, anime, watercolor, oil painting, sketch, dark horror, scary, complex textures, realistic hair strands, chibi, funko pop"
  },
  skeleton_protagonist: {
   positive: "cinematic establishing shot composition, golden hour volumetric lighting, HDR cinematic lens, warm amber grading, photorealistic detailed environment with sharp focused background, masterpiece quality",
   negative: "real human skin, real human face, realistic flesh, normal human appearance, human skin visible through skeleton, dual character overlay, skeleton overlaid on human, x-ray medical scan, cartoon skeleton, halloween decoration, flat 2D, anime, comic, horror gore, neon, plastic toy, low quality, blurry, abstract, minimalist, sketch, painting, chibi, dia de los muertos, empty dark eye sockets, bare bones without transparent body, scary horror skeleton, torso only, bust shot, head and shoulders only, cropped at waist, isolated character on blank background, portrait crop, dark background, black background, text, words, letters, numbers, UI elements, screen content, garbled text"
  },
  afro_nolly_global: {
    positive: "3D Pixar-Illumination quality CGI animation, African setting, subsurface scattering on dark skin, soft ambient occlusion, individually strand-rendered hair showing fiber detail in braids afros and headwraps, realistic cloth folds and weight on ankara and traditional garments, warm natural lighting, vibrant saturated colors, cinematic composition with 3-layer depth staging, dramatic expressions, detailed African clothing textures, community of onlookers with expressive reactions, 16:9 cinematic aspect ratio, high-quality 3D rendering, Nollywood drama meets Disney Pixar aesthetic",
    negative: "photorealistic, live action, photograph, anime, manga, watercolor, sketch, flat 2D, dark gloomy, cartoon outline style, cel-shaded, low quality, blurry, grey ashy skin tones, western European features, pale skin, blonde hair, empty backgrounds, isolated portraits, minimalist, abstract, horror, scary, chibi, bobblehead, oversized head, text garbled, distorted letters"
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
    roblox: {
      characters: "Roblox-style 3D blocky characters with cube-shaped heads, rectangular torso and rectangular limbs. Simple 2D cartoon faces painted on the cube head: two round dot eyes and a small curved mouth. Bright flat-shaded matte plastic skin colors (yellow, beige, tan, brown). Clothing rendered as 2D texture mapped onto rectangular body parts. R15 avatar proportions: head ~1 unit, torso ~1.3 units, arms ~1.3 units, legs ~1.6 units. NO realistic anatomy, NO curved joints, NO detailed muscles.",
      environments: "Bright colorful Roblox-style 3D environments with clean geometric shapes, flat-shaded surfaces, vibrant saturated colors. Simplified blocky architecture, smooth plastic-like textures, toy-like world aesthetic. Environments should feel like Roblox game worlds — obby courses, tycoon maps, roleplay towns.",
      objects: "All objects as simplified geometric 3D shapes — blocky cars, rectangular buildings, cylindrical trees, cube furniture. Flat-shaded matte plastic finish, bright saturated colors, no complex textures or realistic materials.",
      rendering: "Roblox game engine aesthetic — clean geometric edges, flat shading with no smoothing, bright studio lighting, vibrant saturated colors. No film grain, no bokeh, no lens effects. Think toy-like plastic world with matte finish."
    },
    skeleton_protagonist: {
      characters: "The protagonist is a transparent skeleton with a clear glass-like humanoid body shell and glossy ivory bones visible through the translucent torso, with big round expressive brown/amber EYEBALLS in the skull sockets. The skeleton wears context-appropriate clothing over its transparent body. The skeleton must be DOING an action — holding objects, gesturing, interacting with people. Other characters in the scene are normal photorealistic humans. CRITICAL: The skeleton REPLACES the human — it is NOT overlaid on top of a real person. There is NO real human skin or flesh visible. The skeleton IS the character.",
      environments: "Photorealistic DETAILED real-world environments in SHARP FOCUS — visible architecture, landscape features, props, furniture, tools, weather effects. The skeleton exists INSIDE this world. Include foreground elements for depth. NEVER blurred bokeh backgrounds.",
      objects: "Photorealistic props the skeleton is actively interacting with — tools in hand, objects being held, furniture being used. Props tell the story. NEVER show readable text, numbers, or screen content on any object — describe the CHARACTER'S REACTION to information, not the information itself.",
      rendering: "Cinematic wide-to-medium framing. HDR cinematic lens, warm amber grading, dramatic volumetric golden hour lighting, strong rim light on bone edges. Sharp detailed backgrounds."
    },
    afro_nolly_global: {
      characters: "3D Pixar/Illumination quality CGI African characters with subsurface scattering on dark skin (warm undertones, NEVER grey/ashy), individually strand-rendered hair (braids with beads, afros, headwraps with fiber detail). Character archetypes: MAMA/AUTHORITY — heavyset, imposing, round face, gold hoop earrings, headwrap or dyed short hair, ankara wrapper + lace blouse, barefoot, often wielding wooden stick; YOUNG WOMAN — tall slim model proportions, long flowing black hair, modern African fusion (dashiki crop top + jeans, pink sneakers), defiant composed expression; POLICE — large overweight, light blue uniform, cap with badge, baton; VILLAGE ELDER — thin weathered dignified, white beard, agbada/dashiki, colorful kufi cap, carved walking stick; CHILD — 8-12 years old, HUGE Disney-style expressive eyes (30%+ of face), cornrow braids with beads, traditional wrapped cloth, barefoot. ALL characters have DRAMATIC EXAGGERATED expressions — screaming, shocked, crying, defiant — never neutral.",
      environments: "MODERN COMPOUND: Colorful buildings (mustard #D4943A, terracotta #C67B5C, dusty blue #8FA3C4, sage green #7CAA6E, salmon pink #D1847A), dark terracotta roofs #A0442E, red-orange laterite dirt ground #B85C3A, dark wood doors #5C3A20, louvered windows, hanging laundry between buildings, potted flowers at doorsteps, scattered rocks, hand-painted signs with proverbs on buildings (black text on cream/white wood, all caps, hand-lettered). TRADITIONAL VILLAGE: Thatched-roof round huts (warm mud brown #A08060), brown earth ground #6A5030, large shade trees, central campfire with smoke, cooking pots and baskets, wooden stools, lush green vegetation #2A5A20 at edges. Night: central campfire as primary light, HUGE stylized full moon, deep blue-black sky #0A1530, silhouettes of huts.",
      objects: "Hand-painted wooden signs with proverbs that foreshadow the moral (e.g. 'PRIDE COMES BEFORE THE FALL', 'COMPOUND RULES: LANDLADY IS ALWAYS RIGHT'), wooden sticks/canes (mama's signature prop), gold jewelry (earrings, bangles, necklaces), ankara/kente cloth patterns, cooking pots, woven baskets, carved wooden stools, corrugated iron roofing, potted plants.",
      rendering: "3D Pixar-Illumination quality CGI. Subsurface scattering on skin. Soft ambient occlusion in shadows. Slight depth-of-field blur on background characters. Hair individually strand-rendered. Cloth shows realistic folds, wrinkles, and weight. Camera slightly below eye level (heroic/dramatic). Slight wide-angle lens distortion making foreground characters larger. 3-layer depth: foreground characters, mid-ground action, background crowd (6-15 shocked/amused onlookers). Faces ALWAYS well-lit and readable even in dark scenes. Warm bounce light from orange/red dirt ground. Saturated punchy vibrant colors."
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
    afro_nolly_global: universalReinforcement + `
**🌍 AFRO-NOLLY-GLOBAL STYLE — CRITICAL RULES:**

This is a 3D Pixar/Illumination quality CGI style depicting African stories — Nollywood drama meets Disney animation.

**MANDATORY VISUAL RULES:**
- EVERY scene must be rendered as high-quality 3D CGI that mimics Pixar/Illumination quality — NOT actual 3D renders, NOT photorealistic, NOT flat cartoon
- Skin has subsurface scattering (realistic light transmission), visible pores at close-up but smoothed at mid-range. Warm undertone ALWAYS — NEVER grey, NEVER ashy
- Hair is individually strand-rendered — braids, afros, headwraps ALL show fiber detail
- Cloth shows realistic folds, wrinkles, and weight (wrapper sag, blouse crease, ankara patterns)
- Camera positioned slightly below eye level for heroic/dramatic feel
- Slight wide-angle lens distortion making foreground characters larger/more imposing
- 3-layer depth staging: foreground characters → mid-ground action → background crowd of 6-15 onlookers
- Background crowd ALWAYS has dramatic expressions: SHOCKED (mouths open, hands on face), AMUSED (laughing, pointing), SCARED (pulling children close)

**ENVIRONMENTAL WORLD-BUILDING:**
- MODERN SCENES: Colorful compound buildings around central courtyard, red laterite dirt ground, wooden doors with metal handles, louvered windows, corrugated iron roofing. INCLUDE hand-painted SIGNS on buildings with proverbs/rules that foreshadow the story's moral (e.g. "PRIDE COMES BEFORE THE FALL", "TIME WAITS FOR NO ONE"). Signs: black text on white/cream wood, all caps, slightly uneven hand-lettered look.
- TRADITIONAL SCENES: Thatched-roof round/rectangular huts, central village clearing, large shade trees, campfire with smoke, cooking pots, baskets, wooden stools, lush green vegetation at edges.
- Night village: central campfire as primary light, HUGE stylized full moon, warm fire glow on near faces, cool blue moonlight on shoulders/back.

**CHARACTER ARCHETYPES (use these recurring templates):**
- MAMA/LANDLADY: Heavyset, physically imposing, gold lace blouse + patterned ankara wrapper, headwrap or dyed short curly hair, gold hoop earrings + bangles, often wielding wooden stick, SCREAMING angry expression (70% of scenes) or crying/pleading (20%) or smug (10%)
- YOUNG WOMAN: Tall slim, long flowing black hair (wind-blown), modern African fusion clothing (dashiki crop top + jeans, pink sneakers), defiant unbothered expression, arms crossed
- POLICE: Large overweight, light blue uniform + dark navy pants, police cap with badge, baton, stern expression
- ELDER: Thin weathered dignified, white beard, brown agbada/dashiki, colorful striped kufi cap, carved walking stick, kind wise eyes
- CHILD: 8-12 years old, HUGE Disney-style eyes (30%+ of face), cornrow braids with beads, traditional wrapped cloth, barefoot

**COLOR PALETTE:**
- Modern: building walls mustard/terracotta/blue/green/pink, red-orange dirt, saturated punchy clothing
- Traditional: warm mud browns, golden straw, deep forest green, golden hour amber or deep night blue
- Skin tones: #4A2E1A dark to #A07850 warm brown, ALL with warm undertone
- Clothing: gold, emerald green lace, purple, blue, orange dashiki, patterned ankara

**FORBIDDEN:** photorealistic, live action, dark/gloomy, anime, watercolor, sketch, grey/ashy skin, western features, empty backgrounds`,

    skeleton_protagonist: universalReinforcement + `
**🦴 SKELETON PROTAGONIST STYLE — CRITICAL RULES:**

The character identity tag system will inject the skeleton description automatically. Do NOT write "Skeleton protagonist" or "skeleton character" as a label/prefix in the prompt. Just describe the scene naturally and let the identity injection handle the skeleton appearance.

The skeleton REPLACES the human entirely — it is NOT an overlay or x-ray effect on top of a real person. There must be NO real human skin, flesh, or face visible anywhere on the protagonist. The skeleton IS the person. Other characters in the scene are normal photorealistic humans.

MANDATORY FRAMING:
- Describe the ENVIRONMENT in detail FIRST (location, props, weather, textures) THEN place the skeleton within it doing an action
- The skeleton must be DOING something — holding, reaching, kneeling, walking — NOT standing static
- Include other photorealistic humans in most scenes — crowds, companions, onlookers
- Backgrounds must be SHARP and DETAILED — NOT blurred bokeh
- Lighting: golden hour, volumetric rays, warm amber grading, rim light on bone edges
- NEVER empty dark eye sockets — always BIG ROUND EXPRESSIVE BROWN/AMBER EYEBALLS
- NEVER show readable text, numbers, dollar amounts, or screen content — use physical metaphors instead
- NEVER write the style name as a prefix (e.g. "Skeleton protagonist →") — just describe the scene`
  };
  return instructions[visualStyle] || universalReinforcement;
}


// ══════════════════════════════════════════════════════════════════
// PROMPT VALIDATION
// ══════════════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════════════
// SUBJECT-TYPE SANITY CHECK — Prompt Engine Rulebook enforcement
// Detects non-human subjects and strips leaked human anatomy words
// ══════════════════════════════════════════════════════════════════
function subjectTypeSanityCheck(prompt, sceneNumber) {
  // Detect primary subject from the first ~200 chars (image gen reads left-to-right)
  const head = prompt.substring(0, 250).toLowerCase();
  const humanIndicators = /\b(woman|man|person|figure|character|boy|girl|child|worker|doctor|soldier|officer|teacher|scientist|protagonist|narrator|skeleton|individual|people|crowd|group|couple|family|mother|father|husband|wife)\b/;
  const hasHuman = humanIndicators.test(head);

  if (hasHuman) return prompt; // Humans present — all descriptors allowed

  // Non-human scene: strip any leaked human anatomy
  const humanOnlyTerms = [
    /\b(visible\s+)?skin\s+texture(\s+and\s+pores)?\b/gi,
    /\b(visible\s+)?pores\b/gi,
    /\bwrinkles?\s*(around\s+(his|her|their)\s+eyes)?\b/gi,
    /\bfacial\s+expression\b/gi,
    /\bsubtle\s+facial\s+expression\b/gi,
    /\bnatural\s+skin\s+texture\b/gi,
    /\bsoft\s+eye\s+reflections\b/gi,
    /\bfine\s+wrinkles\b/gi,
    /\bshows?\s+(?:slight\s+)?wrinkles\b/gi,
    /\b(his|her|their)\s+(eyes|face|smile|expression|skin|hands|body|hair)\b/gi,
    /\bconfident\s+smile\b/gi,
  ];

  let cleaned = prompt;
  let stripped = false;
  for (const pattern of humanOnlyTerms) {
    const before = cleaned;
    cleaned = cleaned.replace(pattern, '');
    if (cleaned !== before) stripped = true;
  }

  if (stripped) {
    // Clean up orphaned punctuation
    cleaned = cleaned.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
    console.log(`🧹 Scene ${sceneNumber}: SUBJECT SANITY — stripped human anatomy from non-human scene`);
  }

  return cleaned;
}

function validateAndEnhancePrompt(imagePrompt, styleConfig, orientationConfig, sceneNumber, visualStyle) {
  let enhanced = imagePrompt;

  // ═══ SUBJECT-TYPE SANITY CHECK (Prompt Engine Rulebook) ═══
  enhanced = subjectTypeSanityCheck(enhanced, sceneNumber);

  enhanced = enhanced.replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\s*\.?\s*/gi, '');


  // Ensure style quality suffix is present — APPEND at END, never prepend
  // The first 200 chars of the prompt must be FRAMING + ENVIRONMENT, not style language
  // For sleep: check for "dark moody oil painting" since that's the canonical sleep suffix
  const styleCheck = styleConfig.positive.substring(0, 30).toLowerCase();
  if (!enhanced.toLowerCase().includes(styleCheck.substring(0, 20))) {
    enhanced = `${enhanced}. ${styleConfig.positive}`;
  }


  // For non-photorealistic styles, strip any photorealistic camera language that may have leaked in
  const isPhotoStyle = ['cinematic_realistic', 'photorealistic_4k', 'skeleton_protagonist'].includes(visualStyle);
  // Roblox is NOT a photo style — camera language will be stripped
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
    const isSleepProject = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    const isSleepAmbient = rawStyle === 'sleep_ambient';
    const useSleepStyle = isSleepProject || isSleepAmbient;
    const visualStyle = useSleepStyle ? 'oil_painting' : normalizeStyleKey(rawStyle);
    let styleConfig;

    // ═══ SLEEP MODE or SLEEP_AMBIENT style — REPLACE style entirely with dark oil painting ═══
    if (useSleepStyle) {
      styleConfig = {
        positive: "dark moody oil painting, Rembrandt chiaroscuro lighting, deep shadow, very dim warm amber rim light, burnt sienna and dark chocolate palette, ultra low-key lighting, very dim candlelit atmosphere, masterpiece quality",
        negative: "photorealistic, ARRI, anamorphic, Panavision, lens flare, bokeh, film grain, bright daylight, harsh lighting, vivid saturated colors, neon, high key, overexposed, studio lighting, flash photography, 8K resolution, Hollywood, bright light, strong light, well-lit"
      };
      console.log(`🌙 Sleep/ambient mode: using PURE dark oil painting style (replaced "${rawStyle}")`);
    } else {
      styleConfig = { ...styleMap[normalizeStyleKey(rawStyle)] };
    }
    console.log(`🎨 Style: raw="${rawStyle}" → resolved="${visualStyle}"${useSleepStyle ? ' [SLEEP DARK MODE]' : ''}`);


    // ═══ UNIVERSAL: Append anti-crop negatives to ALL styles ═══
    const effectiveNegative = (styleConfig.negative || '') + UNIVERSAL_NEGATIVE_SUFFIX;


    const orientation = project.orientation || 'landscape';


    // ── Style-specific LLM reinforcement (e.g. skeleton protagonist) ──
    let styleReinforcement = getStyleReinforcementInstruction(visualStyle);

    // ═══ SLEEP MODE — override LLM reinforcement with dark aesthetic rules ═══
    if (useSleepStyle) {
      styleReinforcement = `
**🌙 SLEEP CONTENT — MANDATORY DARK AESTHETIC RULES (HIGHEST PRIORITY):**

This is a SLEEP video. Every image must be DARK, DIM, and WARM — safe for sleeping viewers.
These are **PURE ENVIRONMENT / LANDSCAPE scenes** — painterly, atmospheric, calming.

**⛔ ABSOLUTE PROHIBITION — ZERO TOLERANCE:**
- NEVER include ANY human figures, people, persons, characters, silhouettes, or shadows of people
- NEVER include ANY body parts: hands, fingers, feet, legs, arms, face, eyes, skin, torso, shoulders, hair, lips, head
- NEVER include human-occupied furniture shown in use: beds with someone in them, occupied chairs
- NEVER include clothing, shoes, accessories, or any object implying human presence
- NEVER use words like: person, figure, someone, viewer, listener, character, protagonist, woman, man, child, her, his, she, he
- Every scene must be a PURE ENVIRONMENT — nature, architecture, still life, abstract atmosphere
- If the narration mentions a person, represent it through SYMBOLIC environments (empty paths, distant lights, weathered doors) — NEVER through human forms
- IGNORE all universal rules about "characters", "body language", "identity tiers", "character injection" — they do NOT apply to sleep content

**LIGHTING:** 80-90% shadow/darkness. Only VERY DIM candlelight, VERY DIM moonlight, faint distant glow, dying embers. Always warm (amber, gold, sienna) and VERY DIM — barely visible. NEVER use "candlelight" or "moonlight" alone — ALWAYS prefix with "very dim" or "faint".

**COLOR PALETTE:** deep amber, burnt sienna, dark chocolate, midnight navy, warm gold, muted forest. NO bright blue, vivid green, neon, pure white, electric colors.

**STYLE:** Dark moody oil painting. Visible brushstroke quality, impasto highlights, soft blended shadows. Simple compositions with lots of dark negative space.

**EVERY image_prompt MUST end with:** "dark moody oil painting, Rembrandt chiaroscuro lighting, deep shadow, very dim warm amber rim light, burnt sienna and dark chocolate palette, ultra low-key lighting, very dim candlelit atmosphere, masterpiece quality"

**FORBIDDEN in prompts:** bright daylight, harsh lighting, vivid colors, neon, overexposed, studio lighting, white background, ARRI, Panavision, anamorphic, lens flare, bokeh, film grain, 8K, Hollywood, photorealistic, woman, man, person, figure, hands, face, body, skin, eyes, hair
`;
      console.log(`🌙 Sleep dark aesthetic reinforcement active`);
    } else if (styleReinforcement) {
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


    const framingPrefix = useSleepStyle
      ? "Wide ambient shot of a dark atmospheric environment"
      : "Full body wide shot showing complete scene with detailed sharp environment, visible architecture and props, character shown head to feet mid-action in a populated world";
    const promptPrefix = `${framingPrefix}. `;


    let characters = [];
    if (!useSleepStyle && project.character_descriptions) {
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
        `a ${bodyDesc} whose ${faceDesc} catches the light naturally`,
      photorealistic_4k: (bodyDesc, faceDesc) =>
        `a ${bodyDesc} — ${faceDesc}, every detail razor-sharp as if captured by a DSLR`,
      anime: (bodyDesc, faceDesc) =>
        `an anime-rendered ${bodyDesc} with ${faceDesc}, large expressive eyes catching highlight reflections, clean cel-shaded linework`,
      cinematic_anime: (bodyDesc, faceDesc) =>
        `a cinematic anime ${bodyDesc}, ${faceDesc} rendered in Makoto Shinkai detail, light playing through flowing hair`,
     cartoon_2d: (bodyDesc, faceDesc) =>
        `a bold-outlined 2D cartoon ${bodyDesc} with ${faceDesc}, vibrant flat colors, dynamic energy`,
     picstory_cocomelon: (bodyDesc, faceDesc) =>
        `a soft rounded 3D ${bodyDesc} with ${faceDesc}, plastic-smooth pastel features, Pixar Junior warmth`,
      cinematic_picstory: (bodyDesc, faceDesc) =>
        `a Pixar-quality 3D ${bodyDesc}, ${faceDesc} lit by dramatic studio rim lighting, skin glowing with subsurface scattering`,
      oil_painting: (bodyDesc, faceDesc) =>
        `a ${bodyDesc} rendered in thick impasto brushstrokes, ${faceDesc} emerging from Rembrandt shadow`,
      watercolor: (bodyDesc, faceDesc) =>
        `a ${bodyDesc} dissolving into soft watercolor washes, ${faceDesc} bleeding gently into paper grain`,
      comic_book: (bodyDesc, faceDesc) =>
        `a bold ink-outlined ${bodyDesc}, ${faceDesc} rendered in halftone dots and dramatic shadow, Marvel-quality`,
      humpty_dumpty: (bodyDesc, faceDesc) =>
        `a whimsical storybook ${bodyDesc} with ${faceDesc}, rounded and warm like a fairy tale illustration`,
      harry_potter: (bodyDesc, faceDesc) =>
        `a ${bodyDesc} bathed in candlelight, ${faceDesc} touched by magical golden particles in the gothic air`,
      "3d_whiteboard_cartoon": (bodyDesc, faceDesc) =>
        `a bold-outlined 3D whiteboard cartoon ${bodyDesc}, ${faceDesc} in flat warm color fills`,
     low_poly_3d_cartoon: (bodyDesc, faceDesc) =>
        `a low-poly ${bodyDesc} built from flat-shaded polygon facets, ${faceDesc} angular and geometric like a clay toy`,
      roblox: (bodyDesc, faceDesc) =>
        `a Roblox-style blocky ${bodyDesc} with cube head and rectangular limbs, simple cartoon dot-eyes and curved mouth painted on the face, ${faceDesc}, bright plastic matte colors`,
      skeleton_protagonist: (bodyDesc, faceDesc) =>
        `a transparent skeleton with glass-like body shell, glossy ivory bones visible through the translucent torso, big round expressive brown amber eyeballs alive in the skull sockets, dressed in context-appropriate clothing — no human skin or flesh anywhere`,
      afro_nolly_global: (bodyDesc, faceDesc) =>
        `a 3D Pixar-quality ${bodyDesc}, ${faceDesc}, warm brown skin glowing with subsurface scattering, individually strand-rendered African hairstyle, vibrant traditional clothing heavy with realistic fabric weight, gold jewelry catching the light`
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
      if (!shotType) return 'actively engaged with their surroundings';
      const st = shotType.toLowerCase();
      if (/\b(ews|extreme\s*wide|establishing|aerial|drone|bird.?s?\s*eye)\b/.test(st))
        return 'a distant figure dwarfed by the vast environment, their silhouette and movement telling the story';
      if (/\b(ws\b|wide\s*shot|mws|medium\s*wide)\b/.test(st))
        return 'moving through the space, their whole presence felt against the architecture and landscape around them';
      if (/\b(high\s*angle|overhead|god.?s?\s*eye)\b/.test(st))
        return 'seen from above, their body creating a shape against the ground, vulnerable beneath the camera';
      if (/\b(low\s*angle)\b/.test(st))
        return 'towering into frame from below, powerful against the sky or ceiling behind them';
      if (/\b(ots|over[\s-]*the[\s-]*shoulder)\b/.test(st))
        return 'glimpsed past another person\'s shoulder, leaning into whatever holds their attention';
      if (/\b(ms\b|medium\s*shot|tracking|dutch)\b/.test(st))
        return 'caught mid-action, hands busy, posture carrying the weight of the moment';
      if (/\b(mcu|medium\s*close)\b/.test(st))
        return 'close enough to read every flicker of emotion, shoulders tense, hands just visible at the edge of frame';
      if (/\b(cu\b|close[\s-]*up)\b/.test(st))
        return 'filling the frame, every line on their face a sentence, the world soft and distant behind them';
      if (/\b(ecu|extreme\s*close|insert|detail)\b/.test(st))
        return 'so close the screen becomes skin — pores, the tremor of a lip, light pooling in the iris';
      return 'actively engaged with their surroundings';
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
        // Detect best gender from surrounding identity context instead of defaulting female
        .replace(/\bgender[\s:]*neutral\b/gi, (match) => {
          // Check if surrounding text gives clues
          const ctx = identityDesc.toLowerCase();
          if (/\b(father|husband|king|prince|brother|uncle|nephew|grandson|sir|mr|beard|mustache)\b/.test(ctx)) return 'male';
          if (/\b(mother|wife|queen|princess|sister|aunt|niece|granddaughter|ms|mrs|miss|pregnant|headwrap|braids)\b/.test(ctx)) return 'female';
          return 'male'; // truly ambiguous — pick based on visual contrast
        })
        .replace(/\bgender[\s:]*any\b/gi, (match) => {
          const ctx = identityDesc.toLowerCase();
          if (/\b(mother|wife|queen|princess|sister|aunt|niece|ms|mrs|miss)\b/.test(ctx)) return 'female';
          return 'male';
        })
        .replace(/\bnon[\s-]?binary\b/gi, 'male')
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
        // Determine gender: detect from identity, no automatic female default
        const hasExplicitMale = /\b(male|man|boy|father|husband|grandfather|son|brother|he\b|his\b|king|prince|uncle|nephew|sir|mr\b|beard|mustache)\b/.test(charIdentity);
        const hasExplicitFemale = /\b(female|woman|girl|mother|wife|grandmother|daughter|sister|she\b|her\b|queen|princess|aunt|niece|ms\b|mrs|miss|headwrap|braids)\b/.test(charIdentity);
        // If both or neither are found, use the script/niche context to decide
        const charIsMale = hasExplicitMale && !hasExplicitFemale ? true
          : hasExplicitFemale && !hasExplicitMale ? false
          : hasExplicitMale && hasExplicitFemale ? true // conflicting signals, male wins
          : true; // truly ambiguous — default male for visual contrast (was female before)
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
image_prompt: ${s.image_prompt.substring(0, 500)}
animation_prompt: ${(s.animation_prompt || '').substring(0, 200)}
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
**HOW TO DESCRIBE SCENE CONTENT IN ${visualStyle.replace(/_/g, ' ')} STYLE:**
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


**VISUAL STYLE: ${visualStyle.replace(/_/g, ' ')}**
**ORIENTATION:** ${orientationConfig.format}


**STYLE QUALITY SUFFIX (append at the END of each image_prompt as plain descriptive text, NOT the beginning):**
${styleConfig.positive}
${styleBodyBlock}


**CINEMATIC LANGUAGE & CAMERA ANGLES (use these instead of generic "medium shot" or "wide shot"):**
Write prompts the way a cinematographer thinks — through CAMERA PLACEMENT and what it REVEALS about the character.

**Essential angles to use (VARY across scenes — never repeat the same angle consecutively):**
- **Low Angle:** Camera below subject's eyeline, shooting upward. Makes subject powerful, heroic, intimidating. Use for moments of dominance, revelation, or threat.
- **High Angle:** Camera above, looking down. Makes subject vulnerable, small, overwhelmed. Use for moments of defeat, realization, or insignificance.
- **Dutch Angle (Canted):** Camera tilted to one side. Creates unease, psychological distress, disorientation. Use for tension, madness, or moral ambiguity.
- **Over-the-Shoulder (OTS):** Shot from behind one person looking at another or at something. Gold standard for connection, confrontation, or discovery.
- **Eye-Level:** Neutral, at subject's height. Objective, realistic, documentary feel. Use sparingly — it's the "default" and can feel flat if overused.
- **Bird's-Eye (Overhead):** Directly above the scene. Emphasizes environment scale, isolation, or the pattern of human activity. Use for establishing shots or moments of existential weight.
- **Point-of-View (POV):** Shows exactly what the character sees. Immerses audience in character's experience. Use for discoveries, threats, or intimate moments.

**Core cinematography rules (ENFORCE in every prompt):**
- **180-Degree Rule:** In dialogue/confrontation scenes, maintain spatial consistency — characters stay on the same side of frame.
- **30-Degree Rule:** Never describe two consecutive scenes from nearly the same angle — shift at least 30° between cuts.
- **90-Degree Rule:** NEVER frame a character straight-on like a mugshot. Always describe the camera slightly off-center — this creates depth and dimension.

**SCENE CONSTRUCTION RULES:**
- Lead with the CAMERA ANGLE and what it reveals about the emotional beat — NOT with "Medium shot from waist up"
- NEVER use mechanical framing language: "from waist up", "from chest up", "from shoulders up", "torso visible", "head to feet"
- Instead, let the camera angle IMPLY the framing: "Low angle through the glass tabletop" tells the renderer everything about framing without a single body-crop instruction
- Characters must be DOING something — holding, reaching, walking, gesturing, interacting — NOT standing static facing camera
- Backgrounds must be SHARP and DETAILED with visible props and architecture, not blurred to nothing
- Include foreground elements for depth (objects on tables, plants, tools, fences, etc.)
- NEVER generate an isolated character portrait against a blank or blurred background — always place them IN a detailed world
- **POPULATED WORLD:** Include other people in most scenes — crowds, passersby, onlookers. The world feels ALIVE.
- **CHARACTER PRESENCE:** Only include human characters when the narration calls for them. If the narration describes a concept, landscape, or abstract idea — render a PURE ENVIRONMENT scene.
- **SCENE FLOW:** Adjacent scenes share color temperature, lighting direction, and environmental elements for visual continuity.


**DIRECTOR'S SCENE NOTES:**
${sceneDirections}


**YOUR TASK — for EACH scene produce:**


1. **image_prompt** — Write each prompt as a CINEMATOGRAPHER would describe a shot to their crew. NOT a feature catalog. NOT a mechanical breakdown. A living, breathing scene description.

   **HOW TO WRITE (the most important instruction in this entire prompt):**
   
   Write the way Roger Deakins talks about a shot — camera placement first, then what the lens DISCOVERS as it finds the scene.
   
   **LEAD WITH THE CAMERA, NOT THE BODY:**
   The first sentence tells the image generator WHERE THE CAMERA IS and what it's LOOKING AT.
   
   WRONG (mechanical): "Medium shot from waist up of a man in a dimly lit office."
   WRONG (feature dump): "A 60-year-old male, thin build, 5'10, weathered tan skin, square face, deep-set ice-blue eyes..."
   
   RIGHT (cinematic): "Low angle through the dusty glass of a desk lamp — a gaunt figure hunches over scattered papers in a back-office thick with cigarette haze, the amber light carving deep shadows under ice-blue eyes that haven't blinked in minutes."
   
   RIGHT (cinematic): "Dutch angle down a rain-slicked alley at dusk, neon kanji reflected in puddles, a silver-haired man in a dark wool coat pausing mid-stride to glance over his shoulder, the scar above his brow catching the red glow of a bar sign."
   
   RIGHT (cinematic): "Bird's-eye view of a vast trading floor, hundreds of screens glowing blue-white, and in the center of the chaos a single figure sits motionless — slicked-back silver hair visible even from above, hands flat on the desk, perfectly still while the world moves around him."
   
   Notice: NO "from waist up", NO "from chest up", NO "from shoulders up", NO height measurements in the prompt, NO feature catalogs. The camera angle IMPLIES the framing. The character traits are WOVEN into what the camera discovers.

   **CHARACTER IDENTITY — WEAVE, NEVER CATALOG:**
   Character features must be revealed THROUGH action, environment interaction, and light — never listed.
   
   Every physical trait connects to something happening in the scene:
   - Hair: "silver-white hair catching the desk lamp's glow" (not "receding silver-white hair, slicked back")
   - Eyes: "ice-blue eyes narrowing at the document" (not "deep-set ice-blue eyes")
   - Skin: "weathered skin gone pale under the fluorescent" (not "weathered tan skin")
   - Build: "thin shoulders hunched inside an oversized coat" (not "thin build, 5'10")
   - Scars/marks: "the scar above his brow pulling tight as he frowns" (not "prominent scar above left eyebrow")
   
   The character EXISTS in the world. Light hits them. Fabric wraps them. Gravity pulls them. They touch surfaces. Their body REACTS to the moment.

   **DEPTH BY CAMERA ANGLE (not by body-crop instructions):**
   - **Bird's-eye / High angle / Wide establishing:** Character is a shape in a landscape. Just silhouette identifiers — hair color, jacket, posture. No face details.
   - **Low angle / Dutch / OTS / Tracking:** Character shares the frame with environment. Moderate identity — enough to recognize them. Woven into action.
   - **Eye-level close / POV / ECU:** Face IS the subject. Full identity for consistency — but still woven with emotion, never cataloged.

   **PROP FIDELITY:**
   When the narration mentions a specific device or object (iPhone, MacBook, Tesla, Starbucks cup), use that EXACT name — but as part of the scene, never the subject.
   
   **ATMOSPHERE (final beat):**
   End with mood and style quality suffix. Let it feel like the last line of a shot description in a screenplay.
   
   Additional rules:
      • ${orientationConfig.composition}
    - Text/UI on surfaces: describe as clean overlay INSIDE a container (phone screen, monitor, sign). Keep text minimal, spelled perfectly.
    - Abstract concepts → PHYSICAL METAPHORS. Never "symbolizing" or "representing."

   **═══════════════════════════════════════════════════════════════**
   **🚨 PROMPT ENGINE RULEBOOK — MANDATORY COMPLIANCE 🚨**
   **═══════════════════════════════════════════════════════════════**

   **SUBJECT TYPE IDENTIFICATION (MOST IMPORTANT RULE):**
   Before writing each prompt, identify the PRIMARY SUBJECT TYPE of the scene:
   - human, object, animal, food, landscape, architecture, vehicle, abstract
   The prompt must ONLY include descriptors compatible with that subject type.

   **FORBIDDEN MIXING RULE:**
   Human anatomy descriptors (skin, pores, wrinkles, eyes, face, expression, smile, body, hands, hair) must NEVER appear in a prompt unless a HUMAN subject exists in the scene.
   If subject = object → NO skin, pores, wrinkles, eyes, face, expression, smile, body, hands, hair
   If subject = landscape → NO skin, pores, wrinkles, eyes, face, expression
   If subject = vehicle → NO skin, pores, wrinkles, eyes, face
   For non-human subjects, use: surface texture, material details, subtle imperfections, natural wear, reflections, creases

   **PROMPT BLOCK ORDER (never change this order):**
   1. SUBJECT — clearly defined in one sentence
   2. ENVIRONMENT — surroundings without symbolism or metaphors
   3. MOOD — ONE emotional tone only (melancholic, peaceful, tense, nostalgic, lonely, etc). NEVER stack multiple emotions.
   4. COLOR PALETTE — 3-5 color descriptors maximum
   5. LIGHTING — physically realistic (soft natural window light, dim ambient lighting, warm sunset lighting). NEVER "sad lighting" or "emotional lighting"
   6. CAMERA — real photography language (medium shot, shallow depth of field, Canon EOS R5)
   7. QUALITY — one concise quality phrase, never stack 20 buzzwords

   **WORD LIMIT:** 60-120 words per prompt. Long prompts confuse image models.

   **SYMBOLISM PREVENTION:** NEVER use: representing, symbolizing, embodying, illustrating, metaphor. Models render literal scenes.

   **SCENE CONSISTENCY:** All elements must logically coexist. No balloon + ocean waves + mountain sunset.

   **SANITY CHECK before outputting each prompt — REJECT if it contains:**
   - balloon + wrinkles/skin/pores
   - car + skin/facial expression
   - landscape + facial expression/pores
   - Any non-human subject + human anatomy descriptors

   **STYLE LOCK:** One visual style only per prompt, never mix photography + painting + anime.

   **TOKEN CLEANUP:** Remove repeated quality words. One quality phrase is enough.
   **═══════════════════════════════════════════════════════════════**


2. **animation_prompt** — RICH motion direction for the EXACT duration of each scene (see Duration field per scene):
${useSleepStyle ? `   **🌙 SLEEP MODE ANIMATION — STRICT RULES:**
   This is sleep content. The animation must be CALM, MINIMAL, and HYPNOTIC — designed to lull viewers to sleep.
   - **ONLY ALLOWED MOTION:**
     a) **CAMERA**: Ultra-slow pan left/right, ultra-slow zoom in/out, gentle drift. ONE direction per scene, no cuts.
     b) **NATURE/ENVIRONMENT**: Subtle wind rustling leaves/grass, gentle water ripple, slow fog/mist drift, falling snow, drifting clouds. Only if contextually appropriate to the scene.
     c) **DEPTH**: Very slow, gentle focus breathing between foreground and background.
   - **⛔ ABSOLUTELY FORBIDDEN in sleep animation prompts:**
     - ANY light animation: no light rays, no light shifts, no light creeping, no light evolving, no god rays, no flickering, no glowing, no shining, no illumination changes, no candlelight dancing, no firelight animation, no light pools, no rim light movement
     - ANY sudden movement, fast motion, or dramatic changes
     - ANY subject/character motion (no breathing, no body movement — these are PURE environments)
     - ANY rack focus snaps, DOF shifts, or focus pulls
     - ANY emotional intensity language ("urgent", "dramatic", "peak", "assertive")
   - Keep it to 1-2 calm sentences. Example: "Ultra-slow pan right across the misty forest, gentle breeze rustling distant leaves, soft fog drifting between trees."
   - The animation should feel like a screensaver — peaceful, unchanging, meditative.` : `   - NOT a simple camera instruction — a FULL MOTION POEM describing everything that moves over the scene's duration.
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
     • RESOLUTION: Exhale. Camera pulls back gently. Peace settles.`}
   - **MINIMUM 3-4 rich sentences** — NEVER generic "slow pan right"


**RESPONSE:**
{
  "prompts": [
    {
      "scene_number": 1,
      "image_prompt": "[CAMERA ANGLE + what it discovers]. [Environment breathing around the character]. [Character identity woven into action and light]. [Mood + style suffix]",
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
              const soloPrompt = `Generate ONE detailed cinematic image prompt for this scene.

${bodyRules ? `**STYLE RENDERING RULES:**\n**Characters:** ${bodyRules.characters}\n**Environments:** ${bodyRules.environments}` : ''}

**SCENE ${s.scene_number}:**
Narration: "${s.narration_text}"
${s.director ? `Visual Concept: ${s.director.visual_concept}\nShot: ${s.director.shot_type} | Angle: ${s.director.camera_angle} | Lighting: ${s.director.lighting} | Mood: ${s.director.mood}` : ''}

**HOW TO WRITE:**
Write like a cinematographer describing a shot. Lead with WHERE THE CAMERA IS (low angle, dutch angle, bird's-eye, OTS, POV), then what the lens discovers.
NEVER use "medium shot from waist up" or "from chest up" — let the camera angle imply the framing.
Weave character identity into action and light — "ice-blue eyes narrowing at the document" not "deep-set ice-blue eyes."
End with mood and style: ${styleConfig.positive.substring(0, 100)}

**FORBIDDEN:** "from waist up", "from chest up", feature catalogs, text on surfaces, screen content.

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
          // Uses characters_present from director notes (scene breakdown) as PRIMARY source.
          // Falls back to regex name matching if director notes don't have the field.
          // The amount of character detail injected depends on the shot type.

          const shotType = s.director?.shot_type || 'MS — Medium Shot';
          const identityTier = getIdentityTier(shotType);

          // Step 1: Determine which characters appear in this scene
          const sceneCast = [];
          const directorCast = s.director?.characters_present || [];

          if (directorCast.length > 0) {
            // PRIMARY: Use scene breakdown's character tagging
            for (const castName of directorCast) {
              const normalizedCast = castName.toLowerCase().trim();
              // Match against our character identity tags
              for (const [charName, tiers] of Object.entries(characterTieredTags)) {
                if (charName === normalizedCast || normalizedCast.includes(charName) || charName.includes(normalizedCast)) {
                  if (!sceneCast.find(c => c.name === charName)) {
                    sceneCast.push({ name: charName, tiers });
                  }
                }
              }
            }
            if (sceneCast.length > 0) {
              console.log(`🎯 Scene ${s.scene_number}: director-tagged cast: [${sceneCast.map(c => c.name).join(', ')}]`);
            }
          }

          // FALLBACK: regex name matching (backward compat + safety net)
          if (sceneCast.length === 0) {
            for (const [charName] of Object.entries(characterTieredTags)) {
              const namePattern = new RegExp(`\\b${charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
              if (namePattern.test(rawPrompt)) {
                sceneCast.push({ name: charName, tiers: characterTieredTags[charName] });
              }
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

          // Step 3: scene_keywords fallback — check if narration matches character keywords
          if (sceneCast.length === 0 && characters.length > 0) {
            const narrLower = (s.narration_text || '').toLowerCase();
            const promptLower = rawPrompt.toLowerCase();
            for (const c of characters) {
              const keywords = c.scene_keywords || [];
              const name = (c.name || '').toLowerCase().trim();
              const matched = keywords.some(kw => {
                const kwLower = kw.toLowerCase();
                return narrLower.includes(kwLower) || promptLower.includes(kwLower);
              });
              if (matched && characterTieredTags[name] && !sceneCast.find(sc => sc.name === name)) {
                sceneCast.push({ name, tiers: characterTieredTags[name] });
                console.log(`🔑 Scene ${s.scene_number}: keyword-matched "${c.name}" via scene_keywords`);
              }
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

          // If NO character was injected (sceneCast was empty), check if scene actually needs a character
          // Don't force characters into environment/concept/landscape scenes
          if (sceneCast.length === 0 && characters.length > 0) {
            const narr = (s.narration_text || '').toLowerCase();
            const prompt_lower = rawPrompt.toLowerCase();
            // Detect if this is a pure environment/concept scene where no human is needed
            const isEnvironmentScene = !(/\b(he|she|him|her|they|them|person|people|man|woman|boy|girl|child|worker|officer|doctor|teacher|walked|ran|sat|stood|held|grabbed|said|spoke|cried|laughed|smiled|screamed|looked|stared|watched|waved|pointed|shouted)\b/.test(narr));
            const hasHumanInPrompt = /\b(woman|man|person|figure|character|boy|girl|child|worker|people|crowd)\b/i.test(prompt_lower);
            
            if (hasHumanInPrompt && !isEnvironmentScene) {
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
                  rawPrompt = `${ghBefore}${desc}${ghAfter}`;
                  console.log(`👤 Scene ${s.scene_number}: injected primary char via generic ref (${tier}, ${desc.length}ch)`);
                }
              }
            } else if (isEnvironmentScene) {
              console.log(`🏞️ Scene ${s.scene_number}: environment/concept scene — no character forced`);
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

          // Text/UI content is now allowed and handled by OpenAI cleaner (structured legibility)
          // Clean up basic formatting only
          rawPrompt = rawPrompt
            .replace(/\s{2,}/g, ' ')
            .replace(/,\s*,/g, ',')
            .replace(/\.\s*\./g, '.');
          imagePrompt = validateAndEnhancePrompt(
            rawPrompt, styleConfig, orientationConfig, s.scene_number, visualStyle
          );
          animationPrompt = generated.animation_prompt || '';

          // ═══ SLEEP MODE: sanitize animation prompt — strip all light/shine animation ═══
          if (useSleepStyle && animationPrompt) {
            animationPrompt = animationPrompt
              .replace(/\b(light|rays?|god\s*rays?|rim\s*light|candle\s*light|fire\s*light|moon\s*light|glow|shine|shining|glowing|illuminat\w*|flicker\w*|shimmer\w*|sparkl\w*|gleam\w*|luminous|radiant|bright\w*)\s*(shift\w*|creep\w*|danc\w*|drift\w*|evolv\w*|mov\w*|chang\w*|puls\w*|sweep\w*|expand\w*|warm\w*|cool\w*|pool\w*|spill\w*|pour\w*|streak\w*|play\w*|flicker\w*|breath\w*|intensif\w*)\w*[^.]*[.,]?\s*/gi, '')
              .replace(/\b(rack\s*focus|focus\s*pull|DOF\s*shift|depth\s*of\s*field\s*breath\w*|focus\s*snap\w*)\b[^.]*[.,]?\s*/gi, '')
              .replace(/\blight\s+is\s+alive\b[^.]*\.\s*/gi, '')
              .replace(/\b(dramatic|urgent|assertive|peak\s+intensity|escalating)\b/gi, 'gentle')
              .replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
          }

          if (animationPrompt.length < 80) {
            const arcPosition = s.director?.phase || s.director?.arc_position || 'rising';
            const mood = s.director?.mood || 'contemplative';
            const movement = s.director?.camera_movement || 'slow drift forward';
            const vc = s.director?.visual_concept || s.narration_text || '';

            if (useSleepStyle) {
              // Sleep fallback: camera-only + subtle nature motion, NO light animation
              const sleepEnv = vc.includes('forest') || vc.includes('tree') ? 'gentle breeze rustling distant leaves, soft mist drifting between trees'
                : vc.includes('ocean') || vc.includes('water') || vc.includes('lake') || vc.includes('river') ? 'gentle water ripples spreading slowly across the surface'
                : vc.includes('rain') ? 'soft rain falling steadily, tiny ripples forming in still puddles'
                : vc.includes('snow') ? 'soft snowflakes drifting down slowly through still air'
                : vc.includes('mountain') || vc.includes('valley') ? 'thin clouds drifting slowly across distant peaks'
                : 'very faint mist drifting slowly through the still scene';
              animationPrompt = `Ultra-slow ${movement} over ${sceneDuration} seconds. ${sleepEnv}. Completely still atmosphere, no changes in lighting or brightness.`;
            } else {
              animationPrompt = `${movement} over ${sceneDuration} seconds. ${getArcAnimationGuidance(arcPosition)} Foreground elements shift with parallax depth against the background. Subject's body language carries the emotion — micro-movements in hands, shoulders, breathing rhythm. Environmental details respond: ${vc.includes('rain') ? 'rain streaks down surfaces, pooling light reflections ripple' : vc.includes('wind') ? 'fabric and hair catch the wind, leaves scatter across frame' : vc.includes('night') ? 'shadows crawl across walls, distant lights pulse faintly' : 'ambient textures shift — dust motes, fabric settling, light evolving across surfaces'}. The emotional quality is ${mood} — motion weight and speed match this energy. Shallow depth of field breathes subtly between foreground and subject.`;
            }
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

          if (useSleepStyle) {
            const sleepEnv = vc.includes('forest') || vc.includes('tree') ? 'gentle breeze rustling distant leaves, soft mist drifting between trees'
              : vc.includes('ocean') || vc.includes('water') || vc.includes('lake') || vc.includes('river') ? 'gentle water ripples spreading slowly across the surface'
              : vc.includes('rain') ? 'soft rain falling steadily, tiny ripples forming in still puddles'
              : vc.includes('snow') ? 'soft snowflakes drifting down slowly through still air'
              : 'very faint mist drifting slowly through the still scene';
            animationPrompt = `Ultra-slow ${movement} over ${sceneDuration} seconds. ${sleepEnv}. Completely still atmosphere, no changes in lighting or brightness.`;
          } else {
            animationPrompt = `${movement} over ${sceneDuration} seconds. ${getArcAnimationGuidance(arcPosition)} Camera reveals the scene through parallax — foreground elements drift at different speed than background, creating cinematic depth. Subject exhibits natural micro-motion: breathing rhythm visible in chest and shoulders, weight shifts, small involuntary gestures. Environmental physics respond to the world: ${vc.includes('rain') ? 'water streaks surfaces, reflections ripple in puddles, droplets catch light' : vc.includes('wind') ? 'fabric ripples, hair lifts and settles, loose objects shift' : vc.includes('crowd') ? 'background figures move at varied speeds, creating depth layers' : 'ambient textures evolve — light creeps across surfaces, shadows rotate, particles drift through beams'}. Light is alive — ${mood.includes('tense') || mood.includes('anxiety') ? 'flickering, unstable, casting nervous shadows' : mood.includes('warm') || mood.includes('hope') ? 'gradually warming, golden rays expanding across frame' : 'shifting slowly, painting the scene with evolving tones'}. Shallow DOF breathes between planes, drawing focus where emotion lives.`;
          }
        }


        // ═══ OPENAI PROMPT CLEANER — final structuring pass ═══
        // Skip for sleep projects — their prompts are already well-structured
        // and the OpenAI cleaner adds ~5s per scene causing timeouts
        let cleanedImagePrompt = imagePrompt;
        if (!useSleepStyle) {
          cleanedImagePrompt = await cleanPromptWithOpenAI(imagePrompt, visualStyle);
          if (cleanedImagePrompt !== imagePrompt) {
            console.log(`🧹 Scene ${s.scene_number}: OpenAI cleaned (${imagePrompt.length}→${cleanedImagePrompt.length}ch)`);
          }
        } else {
          console.log(`🌙 Scene ${s.scene_number}: skipping OpenAI cleaner (sleep mode)`);
        }

        try {
          await base44.asServiceRole.entities.Scenes.update(s.scene_id, {
            image_prompt: cleanedImagePrompt,
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