import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// KIE AI UNIFIED IMAGE GENERATION
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
    throw new Error(`Kie createTask failed (${model}): ${result.msg || JSON.stringify(result)}`);
  }
  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxWaitMs = 120000) {
  const pollInterval = 4000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval));

    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });

    const poll = await res.json();
    if (poll.code !== 200) { console.warn(`Poll error: ${poll.message}`); continue; }

    const state = poll.data?.state;
    console.log(`Task ${taskId}: ${state}`);

    if (state === "success") {
      const resultJson = JSON.parse(poll.data.resultJson || "{}");
      const url = resultJson.resultUrls?.[0] || resultJson.url || resultJson.imageUrl;
      if (!url) throw new Error("Task completed but no image URL found in resultJson");
      return url;
    }

    if (state === "fail") {
      throw new Error(`Kie task failed: ${poll.data?.failMsg || "Unknown"}`);
    }
  }

  throw new Error(`Kie task ${taskId} timed out after ${maxWaitMs / 1000}s`);
}

// Grok Imagine: aspect_ratio supports "2:3", "3:2", "1:1", "9:16", "16:9"
async function generateWithGrok(apiKey, prompt, aspectRatio) {
  console.log(`[Grok Imagine] Generating with aspect_ratio: ${aspectRatio}`);
  const taskId = await kieCreateTask(apiKey, "grok-imagine/text-to-image", {
    prompt,
    aspect_ratio: aspectRatio
  });
  return await kiePollResult(apiKey, taskId);
}

// Qwen: image_size supports "square", "square_hd", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"
function orientationToQwenSize(orientation) {
  return orientation === 'portrait' ? 'portrait_16_9' : 'landscape_16_9';
}

async function generateWithQwen(apiKey, prompt, orientation) {
  const imageSize = orientationToQwenSize(orientation);
  console.log(`[Qwen] Generating with image_size: ${imageSize}`);
  const taskId = await kieCreateTask(apiKey, "qwen/text-to-image", {
    prompt,
    image_size: imageSize,
    output_format: "png",
    enable_safety_checker: true,
    num_inference_steps: 30,
    guidance_scale: 2.5
  });
  return await kiePollResult(apiKey, taskId);
}

// ══════════════════════════════════════════════════════════════════
// VISUAL STYLE MAP
// ══════════════════════════════════════════════════════════════════
const STYLE_MAP = {
  cinematic_realistic: "Cinematic film still shot on ARRI Alexa 65 with anamorphic Panavision lenses, beautiful lens flare and chromatic aberration, shallow depth of field f/1.4 with creamy bokeh, dramatic three-point lighting with hard key light and soft fill, strong rim light separation, color graded with professional teal and orange LUT, subtle Kodak Vision3 film grain texture, volumetric god rays through atmosphere, Hollywood blockbuster cinematography, photorealistic rendering, 8K resolution",
  
  photorealistic_4k: "Ultra-photorealistic DSLR photograph shot on Canon EOS R5 with RF 85mm f/1.2 L lens, razor-sharp focus with incredible detail, natural ambient lighting with soft diffused quality, professional color grading with accurate skin tones, editorial photography style for National Geographic or Vogue, visible skin texture with pores and fine details, accurate physically-based shadows and highlights, real-world proportions and anatomy, zero AI artifacts, 8K RAW image quality, museum-grade fine art photography",
  
  cinematic_anime: "Cinematic anime illustration in the signature style of Makoto Shinkai and Ufotable studio, dramatic volumetric god rays with atmospheric scattering, incredibly detailed background art with painted clouds, film-grain overlay texture, anime characters with semi-realistic proportions, dynamic dramatic camera angle with depth, beautiful depth of field bokeh, color palette of warm sunset oranges blending into cool twilight blues, award-winning anime film quality",
  
  anime: "High-quality anime illustration combining Studio Ghibli whimsy with modern anime aesthetic, vibrant saturated colors with rich tones, clean precise linework with consistent line weight, cel-shaded with soft airbrushed gradients, expressive detailed eyes with multiple highlights and reflections, detailed hair strands with natural flow and movement, colorful detailed background art with atmospheric perspective, professional anime production quality",
  
  cartoon_2d: "Professional 2D vector animation style reminiscent of modern Cartoon Network and Disney Television Animation, flat cel-shaded colors with strategic gradients, bold clean outlines with consistent line weight, playful exaggerated proportions, bright cheerful primary color palette, clean gradient backgrounds with atmospheric depth, broadcast television quality",
  
  picstory_cocomelon: "3D rendered Pixar-quality children's animation with soft subsurface scattering on skin, rounded chunky character design with appeal for young audiences, oversized expressive eyes with detailed reflections, bright candy-colored palette with high saturation, soft ambient occlusion for subtle depth, cheerful warm global illumination with soft shadows, toy-like proportions that feel huggable, smooth plastic-like materials, raytraced rendering quality",
  
  cinematic_picstory: "Cinematic 3D CGI render matching Pixar Animation Studios or DreamWorks feature film quality, realistic subsurface scattering for skin and translucent materials, raytraced global illumination with accurate light bounces, volumetric fog and atmospheric effects, dramatic rim lighting for character separation, physically based rendering (PBR) with accurate material properties, detailed fabric simulation with realistic wrinkles, advanced hair simulation, film color grading with rich contrast, IMAX-quality framing",
  
  oil_painting: "Classical oil painting on textured linen canvas, visible impasto brushstrokes with thick paint application, chiaroscuro lighting technique with dramatic contrast between light and shadow, Rembrandt-inspired use of dramatic shadow and highlighted faces, rich warm umber and burnt sienna undertones, warm golden varnish glow over the entire piece, museum-quality fine art worthy of the Louvre, Renaissance composition using golden ratio",
  
  watercolor: "Delicate transparent watercolor painting on cold-pressed Arches paper, visible paper grain texture showing through the paint, soft wet-on-wet color bleeding technique with organic edges, transparent luminous washes layered for atmospheric depth, gentle color gradients that flow naturally, white paper strategically showing through for highlights and sparkle, loose expressive brushwork capturing spontaneity, muted pastel palette with occasional vivid accent colors",
  
  comic_book: "Bold American comic book art style with heavy black ink outlines and dynamic line weight variation, Ben-Day halftone dot shading for texture and tone, dynamic foreshortened perspective with dramatic angles, motion lines and speed lines for kinetic energy, dramatic chiaroscuro inking with deep blacks and bright highlights, saturated CMYK color palette optimized for print, Jack Kirby-inspired dynamic composition with powerful poses, professional comic book illustration quality"
};

function getAspectRatio(orientation) {
  return (orientation?.toLowerCase() === 'portrait') ? '9:16' : '16:9';
}

Deno.serve(async (req) => {
  let base44;
  let scene_id;
  
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    scene_id = body.scene_id;

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const visualStyle = project?.visual_style || 'cinematic_realistic';
    const styleDirective = STYLE_MAP[visualStyle] || STYLE_MAP.cinematic_realistic;
    const orientation = project?.orientation || 'landscape';
    const aspectRatio = getAspectRatio(orientation);

    // ══════════════════════════════════════════════════════════════════
    // PROMPT SANITIZATION
    // ══════════════════════════════════════════════════════════════════
    let cleanedPrompt = scene.image_prompt || "";

    // Layer 1: Safety
    const safetySanitizations = [
      [/child('s)?\s+(face|eyes|body).*?(hunger|sick|starv|suffer|dying|dead|gaunt|tattered)/gi, "a solemn historical scene with dignified figures in period clothing"],
      [/bodies?\s+(lying|in the street|dead|piled)/gi, "a somber empty street scene"],
      [/begging\s+for\s+food/gi, "people waiting in line"],
      [/squalor|deprivation|overcrowded/gi, "crowded historical urban setting"],
      [/crying\s+and\s+suffering/gi, "quiet somber atmosphere"],
    ];
    for (const [pattern, replacement] of safetySanitizations) {
      cleanedPrompt = cleanedPrompt.replace(pattern, replacement);
    }

    // Layer 2: Visual metaphors
    const documentMetaphors = [
      [/balance sheet(s)?/gi, 'weathered financial papers with abstract red markings'],
      [/financial (report|statement|document|ledger)/gi, 'stack of blurred papers with concerned hands reviewing them'],
      [/spreadsheet|invoice|receipt|form/gi, 'document held in worried hands, details intentionally out of focus'],
      [/chart showing (decline|decrease|loss|drop|fall)/gi, 'symbolic descending visual elements suggesting downward motion'],
      [/chart showing (increase|growth|rise|gain)/gi, 'symbolic ascending visual elements suggesting upward motion'],
      [/(stock|market|financial) chart/gi, 'abstract geometric pattern suggesting market volatility'],
      [/graph (with|showing|displaying) (red|green|up|down) arrow/gi, 'directional visual metaphor'],
      [/(pie|bar|line) chart/gi, 'abstract proportional visual representation'],
      [/(newspaper|magazine|article) (headline|showing|with|reading)/gi, 'person reading publication with emotional reaction visible'],
      [/sign (reading|saying|with text|that says)/gi, 'weathered directional marker or symbolic indicator'],
      [/(computer |phone |tablet |laptop )?screen (showing|displaying|with) (text|numbers|data|information)/gi, 'glowing screen with abstract light patterns reflected on face'],
      [/website|webpage|app (showing|displaying)/gi, 'device screen with blurred interface elements'],
      [/(shows?|displays?|reads?|says|contains?|lists?) (the )?(specific )?(number|figure|amount|data|statistic|percentage)s?/gi, 'suggests scale through visual proportion'],
      [/with (visible |readable )?(text|numbers|words|digits|letters|writing|captions)/gi, 'with intentionally blurred details'],
      [/(calendar|clock|watch) showing (date|time)/gi, 'timepiece suggesting urgency through composition'],
    ];
    for (const [pattern, replacement] of documentMetaphors) {
      cleanedPrompt = cleanedPrompt.replace(pattern, replacement);
    }

    // Layer 3: Numeric & text removal
    cleanedPrompt = cleanedPrompt.replace(/\$[\d,]+(\.\d+)?/g, 'a large sum of money');
    cleanedPrompt = cleanedPrompt.replace(/\b(19|20)\d{2}\b/g, '');
    cleanedPrompt = cleanedPrompt.replace(/\d+(\.\d+)?%/g, '');
    cleanedPrompt = cleanedPrompt.replace(/\b\d{4,}\b/g, '');
    cleanedPrompt = cleanedPrompt.replace(/\b(title|headline|caption|subtitle|text overlay|text on screen|words|writing|lettering|typography|banner|sign reading|label|logo|chart|graph|data|statistics|infographic|diagram|table|spreadsheet|screenshot|display showing|screen showing|showing numbers|with numbers)\b/gi, '');
    cleanedPrompt = cleanedPrompt.replace(/"[^"]{3,}"/g, '');
    cleanedPrompt = cleanedPrompt.replace(/'[^']{3,}'/g, '');

    // Layer 4: Style-conflicting words
    if (visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic') {
      cleanedPrompt = cleanedPrompt.replace(/\b(cartoon|animated|illustration|illustrated|anime|manga|cel.?shaded|comic|painting|painted|watercolor|sketch|drawn|vector|flat.?color|2D|3D render|pixar|ghibli|dreamworks|digital art|concept art)\b/gi, '');
    } else if (visualStyle === 'anime' || visualStyle === 'cinematic_anime') {
      cleanedPrompt = cleanedPrompt.replace(/\b(photograph|photo|DSLR|Canon|Nikon|lens|f\/\d|focal length|RAW|editorial|photorealistic)\b/gi, '');
    }

    // Layer 5: Orientation-conflicting words
    if (orientation === 'landscape') {
      cleanedPrompt = cleanedPrompt.replace(/\bportrait\b(?!\s+of)/gi, '');
      cleanedPrompt = cleanedPrompt.replace(/\bvertical\b/gi, '');
    } else {
      cleanedPrompt = cleanedPrompt.replace(/\blandscape\b(?!\s)/gi, '');
      cleanedPrompt = cleanedPrompt.replace(/\bhorizontal\b/gi, '');
    }

    // ══════════════════════════════════════════════════════════════════
    // BUILD FINAL PROMPT
    // ══════════════════════════════════════════════════════════════════
    const noTextRule = "ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO captions, NO watermarks, NO logos anywhere in the image. PURELY VISUAL.";
    
    let finalPrompt = `${styleDirective}. ${cleanedPrompt}. ${noTextRule}`;

    if (project?.character_descriptions) {
      try {
        const chars = JSON.parse(project.character_descriptions);
        if (chars.length > 0) {
          const charBlock = chars.map(c => `[${c.name}: ${c.description}]`).join(" ");
          finalPrompt = `MAINTAIN EXACT character appearances: ${charBlock}. ${finalPrompt}`;
        }
      } catch (err) {
        console.warn('Failed to parse character descriptions:', err.message);
      }
    }

    if (finalPrompt.length > 2000) {
      finalPrompt = finalPrompt.substring(0, 1950) + `. ${noTextRule}`;
    }

    console.log(`Scene ${scene.scene_number} | Style: ${visualStyle} | Aspect: ${aspectRatio}`);
    console.log(`Prompt length: ${finalPrompt.length} chars`);

    // ══════════════════════════════════════════════════════════════════
    // IMAGE GENERATION: GROK IMAGINE → QWEN FALLBACK
    // ══════════════════════════════════════════════════════════════════
    let imageUrl;
    let usedModel = '';

    // Attempt 1: Grok Imagine (cheap, supports aspect_ratio natively)
    try {
      imageUrl = await generateWithGrok(KIE_API_KEY, finalPrompt, aspectRatio);
      usedModel = 'grok-imagine/text-to-image';
      console.log(`✓ Scene ${scene.scene_number} generated with Grok Imagine`);
    } catch (grokErr) {
      console.log(`✗ Grok Imagine failed: ${grokErr.message}`);

      // Attempt 2: Grok with simplified prompt
      try {
        const simplePrompt = `${cleanedPrompt}. ${styleDirective}. ${noTextRule}`;
        imageUrl = await generateWithGrok(KIE_API_KEY, simplePrompt, aspectRatio);
        usedModel = 'grok-imagine/text-to-image (simplified)';
        console.log(`✓ Scene ${scene.scene_number} generated with Grok Imagine (simplified)`);
      } catch (grokErr2) {
        console.log(`✗ Grok Imagine simplified failed: ${grokErr2.message}`);

        // Attempt 3: Qwen fallback
        try {
          imageUrl = await generateWithQwen(KIE_API_KEY, finalPrompt, orientation);
          usedModel = 'qwen/text-to-image';
          console.log(`✓ Scene ${scene.scene_number} generated with Qwen (fallback)`);
        } catch (qwenErr) {
          throw new Error(`All attempts failed. Grok: ${grokErr.message} | Qwen: ${qwenErr.message}`);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // SAVE RESULTS
    // ══════════════════════════════════════════════════════════════════
    if (scene.scene_number === 1 && !project?.reference_image_url) {
      await base44.asServiceRole.entities.Projects.update(scene.project_id, {
        reference_image_url: imageUrl
      });
      console.log(`✓ Scene 1 saved as reference image`);
    }

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: imageUrl,
      status: "image_generated"
    });

    console.log(`✓ Scene ${scene.scene_number} complete: ${imageUrl}`);

    return Response.json({ 
      success: true, 
      image_url: imageUrl,
      orientation,
      aspect_ratio: aspectRatio,
      scene_number: scene.scene_number,
      style: visualStyle,
      model_used: usedModel,
      prompt_length: finalPrompt.length
    });

  } catch (error) {
    console.error(`❌ generateSceneImage error: ${error.message}`);
    
    try {
      if (scene_id && base44) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
      }
    } catch (updateErr) {
      console.error(`Failed to update scene status: ${updateErr.message}`);
    }
    
    return Response.json({ error: error.message }, { status: 500 });
  }
});