import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

function getUniversalImageParams(orientation) {
  const mode = orientation?.toLowerCase() || 'landscape';
  
  if (mode === 'portrait') {
    return {
      image_size: { width: 832, height: 1248 },
      aspect_ratio: "9:16"
    };
  } else {
    return {
      image_size: { width: 1216, height: 832 },
      aspect_ratio: "16:9"
    };
  }
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
    // ORIENTATION — Fal.ai dimensions
    // ──────────────────────────────────────────────────────────────
    const orientation = project?.orientation || 'landscape';
    const universalParams = getUniversalImageParams(orientation);

    let aspectBlock;
    if (orientation === 'portrait') {
      aspectBlock = 'PORTRAIT 9:16 vertical composition, 832x1248 pixels, tall vertical framing';
    } else {
      aspectBlock = 'LANDSCAPE 16:9 widescreen horizontal composition, 1216x832 pixels, wide cinematic framing, fill entire frame edge to edge';
    }

    // ──────────────────────────────────────────────────────────────
    // CLEAN THE IMAGE PROMPT
    // ──────────────────────────────────────────────────────────────
    let basePrompt = scene.image_prompt || "";

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

// ══════════════════════════════════════════════════════════════════
// VISUAL METAPHOR TRANSLATIONS (Safety Net for AI Policy Compliance)
// ══════════════════════════════════════════════════════════════════
const documentMetaphors = [
  // Financial documents → metaphorical alternatives
  [/balance sheet(s)?/gi, 'weathered financial papers with abstract red markings'],
  [/financial (report|statement|document|ledger)/gi, 'stack of blurred papers with concerned hands reviewing them'],
  [/spreadsheet|invoice|receipt|form/gi, 'document held in worried hands, details intentionally out of focus'],
  
  // Charts/graphs (literal data → symbolic representation)
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
  basePrompt = basePrompt.replace(pattern, replacement);
}

// NOW do the existing number cleanups
basePrompt = basePrompt.replace(/\$[\d,]+(\.\d+)?/g, 'a large sum of money');
    basePrompt = basePrompt.replace(/\b(19|20)\d{2}\b/g, '');
    basePrompt = basePrompt.replace(/\d+(\.\d+)?%/g, '');
    basePrompt = basePrompt.replace(/\b\d{4,}\b/g, '');
    basePrompt = basePrompt.replace(/\b(title|headline|caption|subtitle|text overlay|text on screen|words|writing|lettering|typography|banner|sign reading|label|logo|chart|graph|data|statistics|infographic|diagram|table|spreadsheet|screenshot|display showing|screen showing|showing numbers|with numbers)\b/gi, '');
    basePrompt = basePrompt.replace(/"[^"]{3,}"/g, '');
    basePrompt = basePrompt.replace(/'[^']{3,}'/g, '');

    if (visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic') {
      basePrompt = basePrompt.replace(/\b(cartoon|animated|illustration|illustrated|anime|manga|cel.?shaded|comic|painting|painted|watercolor|sketch|drawn|vector|flat.?color|2D|3D render|pixar|ghibli|dreamworks|digital art|concept art)\b/gi, '');
    } else if (visualStyle === 'anime' || visualStyle === 'cinematic_anime') {
      basePrompt = basePrompt.replace(/\b(photograph|photo|DSLR|Canon|Nikon|lens|f\/\d|focal length|RAW|editorial|photorealistic)\b/gi, '');
    }

    if (orientation === 'landscape') {
      basePrompt = basePrompt.replace(/\bportrait\b(?!\s+of)/gi, '');
      basePrompt = basePrompt.replace(/\bvertical\b/gi, '');
      basePrompt = basePrompt.replace(/9:16/g, '');
      basePrompt = basePrompt.replace(/720x1280/g, '');
      basePrompt = basePrompt.replace(/832x1248/g, '');
    } else {
      basePrompt = basePrompt.replace(/\blandscape\b(?!\s)/gi, '');
      basePrompt = basePrompt.replace(/\bhorizontal\b/gi, '');
      basePrompt = basePrompt.replace(/16:9/g, '');
      basePrompt = basePrompt.replace(/1280x720/g, '');
      basePrompt = basePrompt.replace(/1216x832/g, '');
    }

    const noTextRule = "ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO dates, NO dollar amounts, NO captions, NO watermarks, NO logos, NO signs with writing, NO typography, NO charts, NO graphs anywhere in the image. PURELY VISUAL.";
    let fullPrompt = `${styleDirective}. ${aspectBlock}. ${noTextRule}. ${basePrompt}. ${noTextRule}. ${aspectBlock}. ${styleDirective}.`;

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

    const MAX_PROMPT_LENGTH = 2000;
    if (fullPrompt.length > MAX_PROMPT_LENGTH) {
      const endBlock = `. ${aspectBlock}. ${noTextRule}`;
      const maxContentLen = MAX_PROMPT_LENGTH - endBlock.length;
      fullPrompt = fullPrompt.substring(0, maxContentLen) + endBlock;
    }

    console.log(`Scene ${scene.scene_number} | Style: ${visualStyle} | Orientation: ${orientation}`);
    console.log(`Fal.ai params: ${JSON.stringify(universalParams)}`);
    console.log(`Prompt length: ${fullPrompt.length} chars`);

    // ──────────────────────────────────────────────────────────────
    // GENERATE IMAGE — explicit Fal.ai params
    // ──────────────────────────────────────────────────────────────
    const referenceImages = [];
    if (project?.reference_image_url) {
      referenceImages.push(project.reference_image_url);
    }

    // Explicit params — no spread ambiguity
    const commonParams = {
      prompt: fullPrompt,
      image_size: universalParams.image_size,
      aspect_ratio: universalParams.aspect_ratio
    };

    let result;

    try {
      if (referenceImages.length > 0) {
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ 
          ...commonParams,
          existing_image_urls: referenceImages
        });
        console.log(`Scene ${scene.scene_number} generated (attempt 1 - with reference)`);
      } else {
        throw new Error("No reference image, skipping to attempt 2");
      }
    } catch (firstErr) {
      console.log(`Attempt 1 failed/skipped: ${firstErr.message}`);
      
      try {
        result = await base44.asServiceRole.integrations.Core.GenerateImage(commonParams);
        console.log(`Scene ${scene.scene_number} generated (attempt 2 - no reference)`);
        
      } catch (secondErr) {
        console.log(`Attempt 2 failed: ${secondErr.message}`);
        
        try {
          const simplePrompt = `${styleDirective}. ${aspectBlock}. ${basePrompt}. ${noTextRule}`;
          result = await base44.asServiceRole.integrations.Core.GenerateImage({ 
            prompt: simplePrompt,
            image_size: universalParams.image_size,
            aspect_ratio: universalParams.aspect_ratio
          });
          console.log(`Scene ${scene.scene_number} generated (attempt 3 - simplified)`);
          
        } catch (thirdErr) {
          console.error(`All 3 attempts failed for scene ${scene.scene_number}`);
          throw new Error(`Image generation failed after 3 attempts: ${thirdErr.message}`);
        }
      }
    }

    if (scene.scene_number === 1 && !project?.reference_image_url) {
      await base44.asServiceRole.entities.Projects.update(scene.project_id, {
        reference_image_url: result.url
      });
      console.log(`Scene 1 saved as reference image`);
    }

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: result.url,
      status: "image_generated"
    });

    return Response.json({ 
      success: true, 
      image_url: result.url,
      orientation: orientation,
      dimensions: universalParams.image_size,
      scene_number: scene.scene_number
    });

  } catch (error) {
    console.error("generateSceneImage error:", error.message);
    
    try {
      if (scene_id && base44) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
      }
    } catch (updateErr) {
      console.error("Failed to update scene status:", updateErr.message);
    }
    
    return Response.json({ error: error.message }, { status: 500 });
  }
});