import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// FAL.AI DIMENSION CONFIGURATION
// ══════════════════════════════════════════════════════════════════
function getFalAiImageParams(orientation) {
  const mode = orientation?.toLowerCase() || 'landscape';
  
  if (mode === 'portrait') {
    return {
      image_size: { width: 832, height: 1248 },  // Fal.ai portrait (~1MP, divisible by 32)
      aspect_ratio: "9:16"
    };
  } else {
    return {
      image_size: { width: 1216, height: 832 },  // Fal.ai landscape (~1MP, divisible by 32)
      aspect_ratio: "16:9"
    };
  }
}

// ══════════════════════════════════════════════════════════════════
// PREMIUM VISUAL STYLE MAP
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

Deno.serve(async (req) => {
  let base44;
  let scene_id;
  
  try {
    // ══════════════════════════════════════════════════════════════════
    // AUTHENTICATION & DATA LOADING
    // ══════════════════════════════════════════════════════════════════
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    scene_id = body.scene_id;

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ══════════════════════════════════════════════════════════════════
    // STYLE & ORIENTATION CONFIGURATION
    // ══════════════════════════════════════════════════════════════════
    const visualStyle = project?.visual_style || 'cinematic_realistic';
    const styleDirective = STYLE_MAP[visualStyle] || STYLE_MAP.cinematic_realistic;

    const orientation = project?.orientation || 'landscape';
    const falAiParams = getFalAiImageParams(orientation);
    
    const aspectBlock = orientation === 'portrait'
      ? 'PORTRAIT 9:16 vertical composition, 832x1248 pixels, tall vertical framing'
      : 'LANDSCAPE 16:9 widescreen horizontal composition, 1216x832 pixels, wide cinematic framing, fill entire frame edge to edge';

    // ══════════════════════════════════════════════════════════════════
    // PROMPT SANITIZATION — LAYER 1: SAFETY (violence/distress)
    // ══════════════════════════════════════════════════════════════════
    let cleanedPrompt = scene.image_prompt || "";

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

    // ══════════════════════════════════════════════════════════════════
    // PROMPT SANITIZATION — LAYER 2: VISUAL METAPHORS (text/documents)
    // ══════════════════════════════════════════════════════════════════
    const documentMetaphors = [
      // Financial documents → metaphorical alternatives
      [/balance sheet(s)?/gi, 'weathered financial papers with abstract red markings'],
      [/financial (report|statement|document|ledger)/gi, 'stack of blurred papers with concerned hands reviewing them'],
      [/spreadsheet|invoice|receipt|form/gi, 'document held in worried hands, details intentionally out of focus'],
      
      // Charts/graphs → symbolic representation
      [/chart showing (decline|decrease|loss|drop|fall)/gi, 'symbolic descending visual elements suggesting downward motion'],
      [/chart showing (increase|growth|rise|gain)/gi, 'symbolic ascending visual elements suggesting upward motion'],
      [/(stock|market|financial) chart/gi, 'abstract geometric pattern suggesting market volatility'],
      [/graph (with|showing|displaying) (red|green|up|down) arrow/gi, 'directional visual metaphor'],
      [/(pie|bar|line) chart/gi, 'abstract proportional visual representation'],
      
      // Text-heavy items → contextual alternatives
      [/(newspaper|magazine|article) (headline|showing|with|reading)/gi, 'person reading publication with emotional reaction visible'],
      [/sign (reading|saying|with text|that says)/gi, 'weathered directional marker or symbolic indicator'],
      [/(computer |phone |tablet |laptop )?screen (showing|displaying|with) (text|numbers|data|information)/gi, 'glowing screen with abstract light patterns reflected on face'],
      [/website|webpage|app (showing|displaying)/gi, 'device screen with blurred interface elements'],
      
      // Numbers/data references → remove or symbolize
      [/(shows?|displays?|reads?|says|contains?|lists?) (the )?(specific )?(number|figure|amount|data|statistic|percentage)s?/gi, 'suggests scale through visual proportion'],
      [/with (visible |readable )?(text|numbers|words|digits|letters|writing|captions)/gi, 'with intentionally blurred details'],
      [/(calendar|clock|watch) showing (date|time)/gi, 'timepiece suggesting urgency through composition'],
    ];

    for (const [pattern, replacement] of documentMetaphors) {
      cleanedPrompt = cleanedPrompt.replace(pattern, replacement);
    }

    // ══════════════════════════════════════════════════════════════════
    // PROMPT SANITIZATION — LAYER 3: NUMERIC & TEXT REMOVAL
    // ══════════════════════════════════════════════════════════════════
    cleanedPrompt = cleanedPrompt.replace(/\$[\d,]+(\.\d+)?/g, 'a large sum of money');
    cleanedPrompt = cleanedPrompt.replace(/\b(19|20)\d{2}\b/g, '');  // Strip years
    cleanedPrompt = cleanedPrompt.replace(/\d+(\.\d+)?%/g, '');  // Strip percentages
    cleanedPrompt = cleanedPrompt.replace(/\b\d{4,}\b/g, '');  // Strip large numbers
    cleanedPrompt = cleanedPrompt.replace(/\b(title|headline|caption|subtitle|text overlay|text on screen|words|writing|lettering|typography|banner|sign reading|label|logo|chart|graph|data|statistics|infographic|diagram|table|spreadsheet|screenshot|display showing|screen showing|showing numbers|with numbers)\b/gi, '');
    cleanedPrompt = cleanedPrompt.replace(/"[^"]{3,}"/g, '');  // Strip quoted text
    cleanedPrompt = cleanedPrompt.replace(/'[^']{3,}'/g, '');  // Strip single-quoted text

    // ══════════════════════════════════════════════════════════════════
    // PROMPT SANITIZATION — LAYER 4: STYLE-CONFLICTING WORDS
    // ══════════════════════════════════════════════════════════════════
    if (visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic') {
      cleanedPrompt = cleanedPrompt.replace(/\b(cartoon|animated|illustration|illustrated|anime|manga|cel.?shaded|comic|painting|painted|watercolor|sketch|drawn|vector|flat.?color|2D|3D render|pixar|ghibli|dreamworks|digital art|concept art)\b/gi, '');
    } else if (visualStyle === 'anime' || visualStyle === 'cinematic_anime') {
      cleanedPrompt = cleanedPrompt.replace(/\b(photograph|photo|DSLR|Canon|Nikon|lens|f\/\d|focal length|RAW|editorial|photorealistic)\b/gi, '');
    }

    // ══════════════════════════════════════════════════════════════════
    // PROMPT SANITIZATION — LAYER 5: ORIENTATION-CONFLICTING WORDS
    // ══════════════════════════════════════════════════════════════════
    if (orientation === 'landscape') {
      cleanedPrompt = cleanedPrompt.replace(/\bportrait\b(?!\s+of)/gi, '');
      cleanedPrompt = cleanedPrompt.replace(/\bvertical\b/gi, '');
      cleanedPrompt = cleanedPrompt.replace(/9:16/g, '');
      cleanedPrompt = cleanedPrompt.replace(/720x1280/g, '');
      cleanedPrompt = cleanedPrompt.replace(/832x1248/g, '');
    } else {
      cleanedPrompt = cleanedPrompt.replace(/\blandscape\b(?!\s)/gi, '');
      cleanedPrompt = cleanedPrompt.replace(/\bhorizontal\b/gi, '');
      cleanedPrompt = cleanedPrompt.replace(/16:9/g, '');
      cleanedPrompt = cleanedPrompt.replace(/1280x720/g, '');
      cleanedPrompt = cleanedPrompt.replace(/1216x832/g, '');
    }

    // ══════════════════════════════════════════════════════════════════
    // BUILD FINAL PROMPT
    // ══════════════════════════════════════════════════════════════════
    const noTextRule = "ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO dates, NO dollar amounts, NO captions, NO watermarks, NO logos, NO signs with writing, NO typography, NO charts, NO graphs anywhere in the image. PURELY VISUAL.";
    
    let finalPrompt = `${styleDirective}. ${aspectBlock}. ${noTextRule}. ${cleanedPrompt}. ${noTextRule}. ${aspectBlock}. ${styleDirective}.`;

    // Add character consistency if available
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

    // Enforce max length
    const MAX_PROMPT_LENGTH = 2000;
    if (finalPrompt.length > MAX_PROMPT_LENGTH) {
      const endBlock = `. ${aspectBlock}. ${noTextRule}`;
      const maxContentLen = MAX_PROMPT_LENGTH - endBlock.length;
      finalPrompt = finalPrompt.substring(0, maxContentLen) + endBlock;
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Scene ${scene.scene_number} | Style: ${visualStyle} | Orientation: ${orientation}`);
    console.log(`Fal.ai params: ${JSON.stringify(falAiParams)}`);
    console.log(`Prompt length: ${finalPrompt.length} chars`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ══════════════════════════════════════════════════════════════════
    // IMAGE GENERATION WITH 3-ATTEMPT RETRY LOGIC
    // ══════════════════════════════════════════════════════════════════
    const referenceImages = project?.reference_image_url ? [project.reference_image_url] : [];
    
    // ✅ Try this - pass width/height at top level + multiple format hints
const baseParams = {
  prompt: finalPrompt,
  width: falAiParams.image_size.width,
  height: falAiParams.image_size.height,
  image_size: falAiParams.image_size,
  aspect_ratio: falAiParams.aspect_ratio,
  size: `${falAiParams.image_size.width}x${falAiParams.image_size.height}`
};
    let result;

    // Attempt 1: With reference image
    try {
      if (referenceImages.length > 0) {
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ 
          ...baseParams,
          existing_image_urls: referenceImages
        });
        console.log(`✓ Scene ${scene.scene_number} generated (attempt 1 - with reference)`);
      } else {
        throw new Error("No reference image available");
      }
    } catch (firstErr) {
      console.log(`✗ Attempt 1 failed: ${firstErr.message}`);
      
      // Attempt 2: Without reference image
      try {
        result = await base44.asServiceRole.integrations.Core.GenerateImage(baseParams);
        console.log(`✓ Scene ${scene.scene_number} generated (attempt 2 - no reference)`);
        
      } catch (secondErr) {
        console.log(`✗ Attempt 2 failed: ${secondErr.message}`);
        
        // Attempt 3: Simplified prompt
        try {
          const simplePrompt = `${styleDirective}. ${aspectBlock}. ${cleanedPrompt}. ${noTextRule}`;
          result = await base44.asServiceRole.integrations.Core.GenerateImage({ 
            prompt: simplePrompt,
            image_size: falAiParams.image_size,
            aspect_ratio: falAiParams.aspect_ratio
          });
          console.log(`✓ Scene ${scene.scene_number} generated (attempt 3 - simplified prompt)`);
          
        } catch (thirdErr) {
          console.error(`✗ All 3 attempts failed for scene ${scene.scene_number}`);
          throw new Error(`Image generation failed after 3 attempts: ${thirdErr.message}`);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // SAVE RESULTS
    // ══════════════════════════════════════════════════════════════════
    
    // If this is scene 1 and no reference image exists, save it
    if (scene.scene_number === 1 && !project?.reference_image_url) {
      await base44.asServiceRole.entities.Projects.update(scene.project_id, {
        reference_image_url: result.url
      });
      console.log(`✓ Scene 1 saved as reference image for project`);
    }

    // Update scene with generated image
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: result.url,
      status: "image_generated"
    });

    console.log(`✓ Scene ${scene.scene_number} complete: ${result.url}`);

    return Response.json({ 
      success: true, 
      image_url: result.url,
      orientation: orientation,
      dimensions: falAiParams.image_size,
      scene_number: scene.scene_number,
      style: visualStyle,
      prompt_length: finalPrompt.length
    });

  } catch (error) {
    console.error(`❌ generateSceneImage error: ${error.message}`);
    
    // Attempt to mark scene as failed
    try {
      if (scene_id && base44) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { 
          status: "failed" 
        });
      }
    } catch (updateErr) {
      console.error(`Failed to update scene status: ${updateErr.message}`);
    }
    
    return Response.json({ error: error.message }, { status: 500 });
  }
});