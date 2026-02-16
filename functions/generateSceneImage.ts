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

    // ── VISUAL STYLE — reinforced at image generation time ──
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

    // ── ORIENTATION ──
    const orientation = project?.orientation || 'landscape';
    let aspectBlock;
    if (orientation === 'portrait') {
      aspectBlock = 'PORTRAIT 9:16 vertical composition, 720x1280 pixels, tall vertical framing';
    } else {
      aspectBlock = 'LANDSCAPE 16:9 widescreen horizontal composition, 1280x720 pixels, wide cinematic framing, NO black bars, fill the entire frame edge to edge';
    }

    // ── CLEAN THE IMAGE PROMPT ──
    let basePrompt = scene.image_prompt || "";

    // Content safety
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

    // ── STRIP TEXT-TRIGGERING CONTENT ──
    // Dollar amounts → visual metaphor
    basePrompt = basePrompt.replace(/\$[\d,]+(\.\d+)?/g, 'a large sum of money');
    // Standalone years (1980, 2023, etc)
    basePrompt = basePrompt.replace(/\b(19|20)\d{2}\b/g, '');
    // Percentages
    basePrompt = basePrompt.replace(/\d+(\.\d+)?%/g, '');
    // Large standalone numbers
    basePrompt = basePrompt.replace(/\b\d{4,}\b/g, '');
    // Text-trigger words
    basePrompt = basePrompt.replace(/\b(title|headline|caption|subtitle|text overlay|text on screen|words|writing|lettering|typography|banner|sign reading|label|logo|chart|graph|data|statistics|infographic|diagram|table|spreadsheet|screenshot|display showing|screen showing|showing numbers|with numbers)\b/gi, '');
    // Quoted text
    basePrompt = basePrompt.replace(/"[^"]{3,}"/g, '');
    basePrompt = basePrompt.replace(/'[^']{3,}'/g, '');

    // ── FORCE CORRECT VISUAL STYLE — strip conflicting style words ──
    if (visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic') {
      basePrompt = basePrompt.replace(/\b(cartoon|animated|illustration|illustrated|anime|manga|cel.?shaded|comic|painting|painted|watercolor|sketch|drawn|vector|flat.?color|2D|3D render|pixar|ghibli|dreamworks|digital art|concept art)\b/gi, '');
    } else if (visualStyle === 'anime' || visualStyle === 'cinematic_anime') {
      basePrompt = basePrompt.replace(/\b(photograph|photo|DSLR|Canon|Nikon|lens|f\/\d|focal length|RAW|editorial|photorealistic)\b/gi, '');
    }

    // ── BUILD FINAL PROMPT ──
    const noTextRule = "ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO dates, NO dollar amounts, NO captions, NO watermarks, NO logos, NO signs with writing, NO typography, NO charts, NO graphs anywhere in the image. PURELY VISUAL.";

    // Style FIRST (strongest weight position), then aspect, then content, then style again at end
    let fullPrompt = `${styleDirective}. ${aspectBlock}. ${noTextRule}. ${basePrompt}. ${noTextRule}. ${aspectBlock}. ${styleDirective}.`;

    // Strip conflicting orientation keywords
    if (orientation === 'landscape') {
      fullPrompt = fullPrompt.replace(/\bportrait\b(?!\s+of)/gi, '');
      fullPrompt = fullPrompt.replace(/\bvertical\b/gi, '');
      fullPrompt = fullPrompt.replace(/9:16/g, '');
      fullPrompt = fullPrompt.replace(/720x1280/g, '');
    } else {
      fullPrompt = fullPrompt.replace(/\blandscape\b(?!\s)/gi, '');
      fullPrompt = fullPrompt.replace(/\bhorizontal\b/gi, '');
      fullPrompt = fullPrompt.replace(/16:9/g, '');
      fullPrompt = fullPrompt.replace(/1280x720/g, '');
    }

    // ── CHARACTER DESCRIPTIONS ──
    if (project?.character_descriptions) {
      try {
        const chars = JSON.parse(project.character_descriptions);
        if (chars.length > 0) {
          const charBlock = chars.map(c => `[${c.name}: ${c.description}]`).join(" ");
          fullPrompt = `MAINTAIN EXACT character appearances: ${charBlock}. ${fullPrompt}`;
        }
      } catch (_) {}
    }

    // ── SMART TRUNCATION ──
    if (fullPrompt.length > 2000) {
      const endBlock = `. ${styleDirective}. ${aspectBlock}. ${noTextRule}`;
      const maxContentLen = 2000 - endBlock.length;
      fullPrompt = fullPrompt.substring(0, maxContentLen) + endBlock;
    }

    console.log(`Scene ${scene.scene_number} | Style: ${visualStyle} | Orientation: ${orientation} | Prompt length: ${fullPrompt.length}`);

    // ── GENERATE IMAGE ──
    const referenceImages = [];
    if (project?.reference_image_url) {
      referenceImages.push(project.reference_image_url);
    }

    let result;
    try {
      const generateParams = { prompt: fullPrompt };
      if (referenceImages.length > 0) {
        generateParams.existing_image_urls = referenceImages;
      }
      result = await base44.asServiceRole.integrations.Core.GenerateImage(generateParams);
    } catch (firstErr) {
      console.log("First attempt failed, retrying without reference:", firstErr.message);
      try {
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt: fullPrompt });
      } catch (secondErr) {
        console.log("Second attempt failed, simplified prompt:", secondErr.message);
        const simplePrompt = `${styleDirective}. ${aspectBlock}. ${basePrompt}. ${noTextRule}`;
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt: simplePrompt });
      }
    }

    // Save scene 1 as reference
    if (scene.scene_number === 1 && !project?.reference_image_url) {
      await base44.asServiceRole.entities.Projects.update(scene.project_id, {
        reference_image_url: result.url
      });
    }

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: result.url,
      status: "image_generated"
    });

    return Response.json({ success: true, image_url: result.url });
  } catch (error) {
    console.error("generateSceneImage error:", error.message);
    try {
      if (scene_id) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
      }
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});