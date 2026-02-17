import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  let base44;
  let scene_id;
  
  try {
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

    // ──────────────────────────────────────────────────────────────
    // VISUAL STYLE MAPPING
    // ──────────────────────────────────────────────────────────────
    const styleMap = {
      cinematic_realistic: "Cinematic film still shot on ARRI Alexa, anamorphic lens flare, shallow depth of field f/1.4, dramatic three-point lighting with rim light, color graded with teal and orange tones, film grain, volumetric lighting, Hollywood blockbuster cinematography, photorealistic",
      photorealistic_4k: "Ultra-photorealistic DSLR photograph shot on Canon EOS R5 85mm f/1.2, razor-sharp detail, natural ambient lighting, professional color grading, editorial photography, skin texture visible, accurate shadows, real-world proportions, no AI artifacts, no illustration, no cartoon, no painting, PHOTOGRAPH ONLY",
      cinematic_anime: "Cinematic anime illustration in the style of Makoto Shinkai and Ufotable, dramatic volumetric god rays, detailed background art, film-grain overlay, anime characters with realistic proportions, dynamic camera angle, depth of field bokeh",
      anime: "High-quality anime illustration, Studio Ghibli meets modern anime aesthetic, vibrant saturated colors, clean precise linework, cel-shaded with soft gradients, expressive detailed eyes, colorful background art",
      cartoon_2d: "Professional 2D vector animation style like modern Cartoon Network or Disney TVA, flat cel-shaded colors, bold clean outlines, playful exaggerated proportions, bright primary color palette",
      picstory_cocomelon: "3D rendered Pixar-quality children's animation, soft subsurface scattering on skin, rounded chunky character design, oversized expressive eyes, bright candy-colored palette, cheerful warm global illumination",
      cinematic_picstory: "Cinematic 3D CGI render like Pixar/DreamWorks feature film, subsurface scattering, ray-traced global illumination, volumetric fog, dramatic rim lighting, physically based rendering, film color grading",
      oil_painting: "Classical oil painting on textured canvas, visible impasto brushstrokes, chiaroscuro lighting technique, Rembrandt-inspired dramatic shadow, rich umber and sienna undertones, museum-quality fine art",
      watercolor: "Delicate watercolor painting on cold-pressed paper, visible paper grain texture, soft wet-on-wet color bleeding, transparent luminous washes, gentle color gradients, loose expressive brushwork",
      comic_book: "Bold American comic book art style, heavy black ink outlines, Ben-Day halftone dot shading, dynamic foreshortened perspective, speed lines for motion, dramatic chiaroscuro inking, saturated CMYK color palette",
    };

    const visualStyle = project?.visual_style || 'cinematic_realistic';
    const styleDirective = styleMap[visualStyle] || styleMap.cinematic_realistic;

    // ──────────────────────────────────────────────────────────────
    // ORIENTATION & DIMENSIONS
    // ──────────────────────────────────────────────────────────────
    const orientation = project?.orientation || 'landscape';
    
    let aspectBlock, dimensions;
    if (orientation === 'portrait') {
      aspectBlock = 'PORTRAIT 9:16 vertical composition, tall vertical framing';
      dimensions = { width: 720, height: 1280 };  // 9:16 aspect ratio
    } else {
      aspectBlock = 'LANDSCAPE 16:9 widescreen horizontal composition, wide cinematic framing, NO black bars, fill the entire frame edge to edge';
      dimensions = { width: 1280, height: 720 };  // 16:9 aspect ratio
    }

    // ──────────────────────────────────────────────────────────────
    // CLEAN THE IMAGE PROMPT
    // ──────────────────────────────────────────────────────────────
    let basePrompt = scene.image_prompt || "";

    // Content safety sanitization
    const sanitizations = [
      [/child('s)?\s+(face|eyes|body).*?(hunger|sick|starv|suffer|dying|dead|gaunt|tattered)/gi, "a solemn historical scene with dignified figures in period clothing"],
      [/bodies?\s+(lying|in the street|dead|piled)/gi, "a somber empty street scene"],
      [/begging\s+for\s+food/gi, "people waiting in line"],
      [/squalor|deprivation|overcrowded/gi, "crowded historical urban setting"],
      [/crying\s+and\s+suffering/gi, "quiet somber atmosphere"],
    ];
    
    for (const [pattern, replacement] of sanitizations) {
      basePrompt = basePrompt.replace(pattern, replacement);
    }

    // Strip text-triggering content
    basePrompt = basePrompt.replace(/\$[\d,]+(\.\d+)?/g, 'a large sum of money');  // Dollar amounts
    basePrompt = basePrompt.replace(/\b(19|20)\d{2}\b/g, '');  // Years
    basePrompt = basePrompt.replace(/\d+(\.\d+)?%/g, '');  // Percentages
    basePrompt = basePrompt.replace(/\b\d{4,}\b/g, '');  // Large numbers
    basePrompt = basePrompt.replace(/\b(title|headline|caption|subtitle|text overlay|text on screen|words|writing|lettering|typography|banner|sign reading|label|logo|chart|graph|data|statistics|infographic|diagram|table|spreadsheet|screenshot|display showing|screen showing|showing numbers|with numbers)\b/gi, '');
    basePrompt = basePrompt.replace(/"[^"]{3,}"/g, '');  // Quoted text
    basePrompt = basePrompt.replace(/'[^']{3,}'/g, '');

    // ──────────────────────────────────────────────────────────────
    // STRIP CONFLICTING STYLE WORDS
    // ──────────────────────────────────────────────────────────────
    if (visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic') {
      basePrompt = basePrompt.replace(/\b(cartoon|animated|illustration|illustrated|anime|manga|cel.?shaded|comic|painting|painted|watercolor|sketch|drawn|vector|flat.?color|2D|3D render|pixar|ghibli|dreamworks|digital art|concept art)\b/gi, '');
    } else if (visualStyle === 'anime' || visualStyle === 'cinematic_anime') {
      basePrompt = basePrompt.replace(/\b(photograph|photo|DSLR|Canon|Nikon|lens|f\/\d|focal length|RAW|editorial|photorealistic)\b/gi, '');
    }

    // Strip conflicting orientation keywords
    if (orientation === 'landscape') {
      basePrompt = basePrompt.replace(/\bportrait\b(?!\s+of)/gi, '');
      basePrompt = basePrompt.replace(/\bvertical\b/gi, '');
      basePrompt = basePrompt.replace(/9:16/g, '');
      basePrompt = basePrompt.replace(/720x1280/g, '');
    } else {
      basePrompt = basePrompt.replace(/\blandscape\b(?!\s)/gi, '');
      basePrompt = basePrompt.replace(/\bhorizontal\b/gi, '');
      basePrompt = basePrompt.replace(/16:9/g, '');
      basePrompt = basePrompt.replace(/1280x720/g, '');
    }

    // ──────────────────────────────────────────────────────────────
    // BUILD FINAL PROMPT
    // ──────────────────────────────────────────────────────────────
    const noTextRule = "ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO dates, NO dollar amounts, NO captions, NO watermarks, NO logos, NO signs with writing, NO typography, NO charts, NO graphs anywhere in the image. PURELY VISUAL.";

    // Style FIRST (strongest weight), then aspect, then content, then reinforcement
    let fullPrompt = `${styleDirective}. ${aspectBlock}. ${noTextRule}. ${basePrompt}. ${noTextRule}. ${aspectBlock}. ${styleDirective}.`;

    // ──────────────────────────────────────────────────────────────
    // ADD CHARACTER DESCRIPTIONS
    // ──────────────────────────────────────────────────────────────
    if (project?.character_descriptions) {
      try {
        const chars = JSON.parse(project.character_descriptions);
        if (chars.length > 0) {
          const charBlock = chars.map(c => `[${c.name}: ${c.description}]`).join(" ");
          fullPrompt = `MAINTAIN EXACT character appearances: ${charBlock}. ${fullPrompt}`;
        }
      } catch (err) {
        console.warn('Failed to parse character descriptions:', err.message);
      }
    }

    // ──────────────────────────────────────────────────────────────
    // SMART TRUNCATION
    // ──────────────────────────────────────────────────────────────
    const MAX_PROMPT_LENGTH = 2000;
    if (fullPrompt.length > MAX_PROMPT_LENGTH) {
      const endBlock = `. ${styleDirective}. ${aspectBlock}. ${noTextRule}`;
      const maxContentLen = MAX_PROMPT_LENGTH - endBlock.length;
      fullPrompt = fullPrompt.substring(0, maxContentLen) + endBlock;
    }

    console.log(`Scene ${scene.scene_number} | Style: ${visualStyle} | Orientation: ${orientation} (${dimensions.width}x${dimensions.height}) | Prompt: ${fullPrompt.length} chars`);

    // ──────────────────────────────────────────────────────────────
    // GENERATE IMAGE WITH RETRIES
    // ──────────────────────────────────────────────────────────────
    const referenceImages = [];
    if (project?.reference_image_url) {
      referenceImages.push(project.reference_image_url);
    }

    let result;

    // Attempt 1: Full prompt with reference images
    try {
      const generateParams = { 
        prompt: fullPrompt,
        width: dimensions.width,
        height: dimensions.height
      };
      
      if (referenceImages.length > 0) {
        generateParams.existing_image_urls = referenceImages;
      }
      
      result = await base44.asServiceRole.integrations.Core.GenerateImage(generateParams);
      console.log(`✓ Scene ${scene.scene_number} image generated (attempt 1)`);
      
    } catch (firstErr) {
      console.log(`✗ Attempt 1 failed for scene ${scene.scene_number}:`, firstErr.message);
      
      // Attempt 2: Without reference images
      try {
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ 
          prompt: fullPrompt,
          width: dimensions.width,
          height: dimensions.height
        });
        console.log(`✓ Scene ${scene.scene_number} image generated (attempt 2, no reference)`);
        
      } catch (secondErr) {
        console.log(`✗ Attempt 2 failed for scene ${scene.scene_number}:`, secondErr.message);
        
        // Attempt 3: Simplified prompt
        try {
          const simplePrompt = `${styleDirective}. ${aspectBlock}. ${basePrompt}. ${noTextRule}`;
          result = await base44.asServiceRole.integrations.Core.GenerateImage({ 
            prompt: simplePrompt,
            width: dimensions.width,
            height: dimensions.height
          });
          console.log(`✓ Scene ${scene.scene_number} image generated (attempt 3, simplified)`);
          
        } catch (thirdErr) {
          console.error(`✗ All 3 attempts failed for scene ${scene.scene_number}`);
          throw new Error(`Image generation failed after 3 attempts: ${thirdErr.message}`);
        }
      }
    }

    // ──────────────────────────────────────────────────────────────
    // SAVE SCENE 1 AS REFERENCE
    // ──────────────────────────────────────────────────────────────
    if (scene.scene_number === 1 && !project?.reference_image_url) {
      await base44.asServiceRole.entities.Projects.update(scene.project_id, {
        reference_image_url: result.url
      });
      console.log(`✓ Scene 1 saved as reference image for project`);
    }

    // ──────────────────────────────────────────────────────────────
    // UPDATE SCENE
    // ──────────────────────────────────────────────────────────────
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: result.url,
      status: "image_generated"
    });

    return Response.json({ 
      success: true, 
      image_url: result.url,
      dimensions: dimensions,
      scene_number: scene.scene_number
    });

  } catch (error) {
    console.error("generateSceneImage error:", error.message);
    
    // Mark scene as failed
    try {
      if (scene_id && base44) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { 
          status: "failed" 
        });
      }
    } catch (updateErr) {
      console.error("Failed to update scene status:", updateErr.message);
    }
    
    return Response.json({ error: error.message }, { status: 500 });
  }
});