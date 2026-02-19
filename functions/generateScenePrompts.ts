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
  Camera Movement: ${s.director.camera_movement}
  Lighting: ${s.director.lighting}
  Color Palette: ${s.director.color_palette}
  Mood: ${s.director.mood}
  DOF: ${s.director.depth_of_field}
  Niche Element: ${s.director.niche_visual_element || 'N/A'}
  Continuity: ${s.director.continuity_bridge || 'N/A'}
  Intensity: ${s.director.emotional_intensity || 0.5}`;
      }).join('\n\n');

      const prompt = `**MISSION: Convert Director's Notes → Production-Ready Image & Animation Prompts**

${storyContext}

${characterBlock}

**STYLE:** ${visualStyle} | **ORIENTATION:** ${orientationConfig.format}

**DIRECTOR'S SCENE NOTES:**
${sceneDirections}

**YOUR TASK — for EACH scene produce:**

1. **image_prompt** — Dense technical prompt for AI image generation:
   - MUST begin with: "${promptPrefix}."
   - Translate visual concept into SPECIFIC, DETAILED image (300+ chars)
   - Embed exact shot type, camera angle, DOF from director notes
   - Embed exact lighting setup
   - Apply color palette as color grading
   - If characters appear → embed FULL physical description (not just name)
   - ${orientationConfig.composition}
   - FORBIDDEN: text, words, letters, numbers, charts, graphs, signs, readable content
   - Abstract concepts → PHYSICAL METAPHORS (financial decline → hourglass with last grains)
   - Documents → ONLY blurred with emotional context
   - - MUST end with the style reinforcement: "${styleConfig.reinforcement}. ${styleConfig.antiStyle}. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"
   - The LAST 50 words of every prompt MUST reinforce the visual style — this is critical for consistent generation

2. **animation_prompt** — 8-second motion direction:
   - Translate camera_movement into animation language
   - Format: ${orientationConfig.animation}
   - Include: camera motion + speed, atmospheric motion (particles, fog, light), subject micro-motion (breathing, hair), DOF changes
   - Low intensity = slow/subtle, high intensity = dynamic/dramatic

**RESPONSE:**
{
  "prompts": [
    {
      "scene_number": 1,
      "image_prompt": "${promptPrefix}. [detailed scene prompt]. ${styleConfig.reinforcement}. ${styleConfig.antiStyle}. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography",
      "animation_prompt": "[motion direction]"
    }
  ]
}

✓ Begins with style prefix? ✓ 300+ chars? ✓ Shot type embedded? ✓ Lighting described? ✓ No text in image? ✓ Ends with STYLE LOCK + anti-style + quality markers? ✓ Last 50 words reinforce the visual style?`;
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
            || "slow gentle camera movement forward, atmospheric haze, subtle breathing, shallow DOF";
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