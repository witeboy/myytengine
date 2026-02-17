import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// PREMIUM STYLE MAP - matches generateScenePrompts & generateSceneImage
// ══════════════════════════════════════════════════════════════════
const STYLE_MAP = {
  cinematic_realistic: {
    positive: "Cinematic film still shot on ARRI Alexa 65 with anamorphic Panavision lenses, beautiful lens flare and chromatic aberration, shallow depth of field f/1.4 with creamy bokeh, dramatic three-point lighting with hard key light and soft fill, strong rim light separation, color graded with professional teal and orange LUT, subtle Kodak Vision3 film grain texture, volumetric god rays, Hollywood blockbuster cinematography, photorealistic rendering, 8K resolution",
    negative: "cartoon, anime, illustration, painting, drawing, sketch, 3D render, CGI, video game, cel shaded, flat colors, clipart, stylized, non-photorealistic, amateur, low quality, blurry, distorted"
  },
  photorealistic_4k: {
    positive: "Ultra-photorealistic DSLR photograph shot on Canon EOS R5 with RF 85mm f/1.2 L lens, razor-sharp focus with incredible detail, natural ambient lighting with soft diffused quality, professional color grading with accurate skin tones, editorial photography style for National Geographic or Vogue, visible skin texture with pores and fine details, accurate physically-based shadows and highlights, real-world proportions and anatomy, zero AI artifacts, 8K RAW image quality",
    negative: "cartoon, anime, illustration, CGI, 3D render, painting, digital art, stylized, unrealistic, soft focus, beauty filter, over-processed, non-photographic, video game, synthetic, heavily edited"
  },
  cinematic_anime: {
    positive: "Cinematic anime illustration in the signature style of Makoto Shinkai and Ufotable studio, dramatic volumetric god rays with atmospheric scattering, incredibly detailed background art with painted clouds and environments, film-grain overlay texture for cinematic feel, anime characters with semi-realistic proportions and detailed features, dynamic dramatic camera angle with depth, beautiful depth of field bokeh effect, color palette of warm sunset oranges blending into cool twilight blues, emotional lighting, award-winning anime film quality",
    negative: "photorealistic, live action, photograph, western cartoon, Disney style, 3D CGI render, rough sketch, amateur drawing, simple coloring, flat lighting, low detail backgrounds, chibi style, overly simplified, black and white, unfinished art"
  },
  anime: {
    positive: "High-quality anime illustration combining Studio Ghibli whimsy with modern anime aesthetic, vibrant saturated colors with rich tones, clean precise linework with consistent line weight, cel-shaded with soft airbrushed gradients, expressive detailed eyes with multiple highlights and reflections, detailed hair strands with natural flow and movement, colorful detailed background art with atmospheric perspective, well-composed layout, professional anime production quality",
    negative: "photorealistic, live action, photograph, 3D render, western cartoon style, rough sketch, amateur coloring, flat backgrounds, inconsistent art style, poorly drawn anatomy, low budget, chibi, super deformed"
  },
  cartoon_2d: {
    positive: "Professional 2D vector animation style reminiscent of modern Cartoon Network, Disney Television Animation, or Nickelodeon productions, flat cel-shaded colors with strategic gradients, bold clean outlines with consistent line weight, playful exaggerated proportions that maintain appeal, bright cheerful primary color palette with good contrast, clean gradient backgrounds with atmospheric depth, animation keyframe quality with strong poses, appealing character design with clear silhouettes, broadcast television quality",
    negative: "photorealistic, anime, 3D render, realistic proportions, gritty, dark, sketch, rough lines, amateur drawing, inconsistent style, stiff poses, muddy colors"
  },
  picstory_cocomelon: {
    positive: "3D rendered Pixar-quality children's animation with soft subsurface scattering on skin, rounded chunky character design with appeal for young audiences, oversized expressive eyes with detailed reflections, bright candy-colored palette with high saturation, soft ambient occlusion for subtle depth, cheerful warm global illumination with soft shadows, toy-like proportions that feel huggable, smooth plastic-like materials with subtle specularity, raytraced rendering quality, family-friendly content",
    negative: "realistic, photographic, anime, 2D cartoon, gritty, dark themes, scary, sharp edges, adult themes, rough textures, muted colors, horror elements, angular design, serious tone"
  },
  cinematic_picstory: {
    positive: "Cinematic 3D CGI render matching Pixar Animation Studios or DreamWorks feature film quality, realistic subsurface scattering for skin and translucent materials, raytraced global illumination with accurate light bounces, volumetric fog and atmospheric effects, dramatic rim lighting for character separation, physically based rendering (PBR) with accurate material properties, detailed fabric simulation with realistic wrinkles and folds, advanced hair simulation, film color grading with rich contrast, IMAX-quality framing, theatrical release cinematography",
    negative: "2D animation, flat colors, anime, cartoon style, low poly, video game graphics, rough rendering, amateur 3D, simplistic shading, unrealistic materials, TV budget quality, mobile game graphics"
  },
  oil_painting: {
    positive: "Classical oil painting on textured linen canvas, visible impasto brushstrokes with thick paint application, chiaroscuro lighting technique with dramatic contrast between light and shadow, Rembrandt-inspired use of dramatic shadow and highlighted faces, rich warm umber and burnt sienna undertones, warm golden varnish glow over the entire piece, museum-quality fine art worthy of the Louvre, Renaissance composition using golden ratio and divine proportions, thick visible paint texture with palette knife work, gallery directional lighting enhancing the texture",
    negative: "photorealistic, digital art, anime, cartoon, illustration, flat colors, vector art, modern digital painting, photograph, CGI, 3D render, smooth finish, airbrushed, lacking texture, contemporary illustration style"
  },
  watercolor: {
    positive: "Delicate transparent watercolor painting on cold-pressed Arches paper, visible paper grain texture showing through, soft wet-on-wet color bleeding technique with organic edges, transparent luminous washes layered for depth, gentle color gradients that flow naturally, white paper strategically showing through for highlights and sparkle, loose expressive brushwork capturing spontaneity, muted pastel palette with occasional vivid accent colors, dreamy atmospheric perspective with soft edges, professional watercolor artist technique",
    negative: "photorealistic, digital art, oil painting, acrylic, cartoon, anime, vector illustration, 3D render, CGI, heavy opaque colors, hard edges, digital watercolor filter, overly saturated, graphic design, flat illustration, photograph"
  },
  comic_book: {
    positive: "Bold American comic book art style, heavy black ink outlines with dynamic line weight variation, Ben-Day halftone dot shading for texture and tone, dynamic foreshortened perspective with dramatic angles, motion lines and speed lines for kinetic energy, dramatic chiaroscuro inking with deep blacks and bright highlights, saturated CMYK color palette for print, Jack Kirby-inspired dynamic composition with powerful poses, thick panel borders, action-packed graphic novel quality, professional comic book illustration",
    negative: "photorealistic, anime, manga, photograph, 3D render, watercolor, oil painting, soft shading, realistic lighting, muted colors, static composition, sketch, unfinished art, amateur webcomic, simple coloring"
  },
};

// Fallback mapping for any legacy style keys
const STYLE_KEY_ALIASES = {
  photorealistic: 'photorealistic_4k',
  anime_style: 'anime',
  cartoon: 'cartoon_2d',
  oil_colour: 'oil_painting',
  oil_color: 'oil_painting',
  cinematic: 'cinematic_realistic',
  pixar: 'cinematic_picstory',
  cocomelon: 'picstory_cocomelon',
  comic: 'comic_book',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      prompt,
      asset_style = 'cinematic_realistic',
      scene_number = 1,
      orientation = 'landscape',
      project_id = null,
      narration_text = '',
    } = await req.json();

    if (!prompt) {
      return Response.json({ error: 'Missing prompt' }, { status: 400 });
    }

    console.log('================================================');
    console.log(`ENHANCING PROMPT - Scene ${scene_number}`);
    console.log(`Style: ${asset_style} | Orientation: ${orientation}`);
    console.log('================================================');

    // ══════════════════════════════════════════════════════════════════
    // RESOLVE STYLE KEY (handle legacy keys + current keys)
    // ══════════════════════════════════════════════════════════════════
    const resolvedStyleKey = STYLE_KEY_ALIASES[asset_style] || asset_style;
    const styleConfig = STYLE_MAP[resolvedStyleKey] || STYLE_MAP.cinematic_realistic;

    // ══════════════════════════════════════════════════════════════════
    // ORIENTATION DIRECTIVE
    // ══════════════════════════════════════════════════════════════════
    const orientationDirective = orientation === 'portrait'
      ? 'PORTRAIT VERTICAL 9:16 format (720x1280 pixels), tall vertical composition, center subjects vertically, close-up and medium shots work best'
      : 'LANDSCAPE HORIZONTAL 16:9 widescreen format (1280x720 pixels), wide cinematic framing, rule-of-thirds horizontal placement, panoramic depth';

    const promptPrefix = `${styleConfig.positive}, ${orientationDirective}`;

    // ══════════════════════════════════════════════════════════════════
    // LOAD CHARACTER DESCRIPTIONS IF PROJECT ID PROVIDED
    // ══════════════════════════════════════════════════════════════════
    let charBlock = '';
    if (project_id) {
      try {
        const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
        const project = projects[0];
        if (project?.character_descriptions) {
          const chars = JSON.parse(project.character_descriptions);
          if (chars.length > 0) {
            charBlock = 'ESTABLISHED CHARACTERS (include FULL description if they appear):\n' +
              chars.map(c => `- ${c.name}: ${c.description}`).join('\n');
          }
        }
      } catch (e) {
        console.warn('Could not load character descriptions:', e.message);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // AI-POWERED ENHANCEMENT VIA GEMINI
    // ══════════════════════════════════════════════════════════════════
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    let enhancedPrompt = '';

    if (geminiApiKey) {
      const geminiPrompt = `You are a world-class AI image prompt engineer specializing in cinematic, high-retention visual content for YouTube documentaries and video stories.

Your job: Transform the provided base prompt into a PREMIUM, highly detailed image generation prompt.

================================================
BASE PROMPT (needs enhancement):
${prompt}

SCENE NUMBER: ${scene_number}
VISUAL STYLE: ${styleConfig.positive}
FORMAT: ${orientationDirective}
${narration_text ? `NARRATION (what viewers hear): "${narration_text}"` : ''}
${charBlock ? `\n${charBlock}` : ''}
================================================

ENHANCEMENT MANDATE:

1. MANDATORY START: Begin with exactly this prefix:
"${promptPrefix}."

2. SHOT TYPE: Choose ONE cinematic shot appropriate to the content:
   - Extreme wide establishing shot (EWS) for scale/environment
   - Wide shot (WS) for full body in context
   - Medium shot (MS) for waist up with environment
   - Medium close-up (MCU) for chest up, emotional focus
   - Close-up (CU) for face/hands with shallow DOF
   - Bird's eye overhead for context/scale
   - Low angle for power/drama
   - Silhouette for mood/mystery

3. SUBJECT & ACTION: Describe EXACTLY what is visually happening, matching the narration if provided

4. CHARACTERS: If characters from the references appear, include their COMPLETE description. Never say "a man" or "a woman" - be specific.

5. LIGHTING (include ALL):
   - Source: sun, moon, lamp, fire, neon, studio
   - Direction: from left, backlit, overhead, side lighting, rim light
   - Quality: hard dramatic, soft diffused, warm golden, cool clinical
   - Atmosphere: volumetric rays, fog, haze, bokeh

6. ENVIRONMENT: Describe foreground, midground, background for depth

7. COLOR PALETTE: Warm sunset tones / cool blue twilight / desaturated noir / vibrant saturated etc.

8. STYLE REINFORCEMENT: Reinforce the visual style at the end

9. NO TEXT RULE: Include "ABSOLUTELY NO text, words, letters, numbers, captions, signs, or writing of any kind in the image"

10. QUALITY ENDING: End with "masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"

11. LENGTH: 250-450 characters for premium quality

12. AVOID: ${styleConfig.negative}

RETURN ONLY the enhanced prompt as a plain string. No explanations, no JSON, no markdown.`;

      try {
        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: geminiPrompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
            })
          }
        );

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (rawText.trim().length > 50) {
            enhancedPrompt = rawText.trim();
            console.log(`Gemini enhanced prompt: ${enhancedPrompt.length} chars`);
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini enhancement failed, falling back to template:', geminiErr.message);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // FALLBACK: Template-based enhancement if Gemini fails/unavailable
    // ══════════════════════════════════════════════════════════════════
    if (!enhancedPrompt) {
      console.log('Using template-based enhancement fallback');
      enhancedPrompt = `${promptPrefix}. Scene ${scene_number}: ${prompt}. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography`;
    }

    // ══════════════════════════════════════════════════════════════════
    // POST-ENHANCEMENT VALIDATION & AUTO-PATCHING
    // ══════════════════════════════════════════════════════════════════

    // Patch 1: Ensure style directive present
    if (!enhancedPrompt.toLowerCase().includes(styleConfig.positive.substring(0, 20).toLowerCase())) {
      console.warn('Style directive missing - patching');
      enhancedPrompt = `${promptPrefix}. ${enhancedPrompt}`;
    }

    // Patch 2: Ensure orientation is present
    const orientationKeyword = orientation === 'portrait' ? 'portrait' : 'landscape';
    if (!enhancedPrompt.toLowerCase().includes(orientationKeyword)) {
      console.warn('Orientation missing - patching');
      enhancedPrompt = `${orientationDirective}. ${enhancedPrompt}`;
    }

    // Patch 3: Strip conflicting orientation keywords
    if (orientation === 'landscape') {
      enhancedPrompt = enhancedPrompt.replace(/\bportrait\b(?!\s+of)/gi, '');
      enhancedPrompt = enhancedPrompt.replace(/\bvertical\b/gi, '');
      enhancedPrompt = enhancedPrompt.replace(/9:16/g, '');
    } else {
      enhancedPrompt = enhancedPrompt.replace(/\blandscape\b(?!\s)/gi, '');
      enhancedPrompt = enhancedPrompt.replace(/\bhorizontal\b/gi, '');
      enhancedPrompt = enhancedPrompt.replace(/16:9/g, '');
    }

    // Patch 4: Strip conflicting style words
    if (resolvedStyleKey === 'photorealistic_4k' || resolvedStyleKey === 'cinematic_realistic') {
      enhancedPrompt = enhancedPrompt.replace(/\b(cartoon|animated|illustration|anime|manga|cel.?shaded|comic|painting|painted|watercolor|sketch|drawn|vector|flat.?color|2D|3D render|pixar|ghibli|digital art)\b/gi, '');
    } else if (resolvedStyleKey === 'anime' || resolvedStyleKey === 'cinematic_anime') {
      enhancedPrompt = enhancedPrompt.replace(/\b(photograph|photo|DSLR|Canon|Nikon|lens|f\/\d|focal length|RAW|editorial|photorealistic)\b/gi, '');
    }

    // Patch 5: Ensure no-text rule
    if (!enhancedPrompt.toLowerCase().includes('no text')) {
      enhancedPrompt += ', ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image';
    }

    // Patch 6: Ensure quality markers
    if (!enhancedPrompt.toLowerCase().includes('masterpiece')) {
      enhancedPrompt += ', masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography';
    }

    // ══════════════════════════════════════════════════════════════════
    // QUALITY SCORE
    // ══════════════════════════════════════════════════════════════════
    const qualityChecks = {
      hasStyleDirective: enhancedPrompt.toLowerCase().includes(styleConfig.positive.substring(0, 15).toLowerCase()),
      hasOrientation: enhancedPrompt.toLowerCase().includes(orientationKeyword),
      hasNoTextRule: enhancedPrompt.toLowerCase().includes('no text'),
      hasQualityMarkers: enhancedPrompt.toLowerCase().includes('masterpiece'),
      hasLighting: /\b(light|lighting|sun|lamp|glow|shadow|ray|backlit)\b/i.test(enhancedPrompt),
      hasCamera: /\b(shot|angle|lens|camera|focus|close-up|wide|medium|depth)\b/i.test(enhancedPrompt),
      minLength: enhancedPrompt.length >= 150,
    };

    const qualityScore = Math.round(
      (Object.values(qualityChecks).filter(Boolean).length / Object.keys(qualityChecks).length) * 100
    );

    console.log(`Quality score: ${qualityScore}% | Length: ${enhancedPrompt.length} chars`);
    console.log(`Checks: ${JSON.stringify(qualityChecks)}`);
    console.log('================================================');

    return Response.json({
      success: true,
      original_prompt: prompt,
      enhanced_prompt: enhancedPrompt,
      style: resolvedStyleKey,
      original_style_key: asset_style,
      orientation: orientation,
      quality_score: qualityScore,
      quality_checks: qualityChecks,
      prompt_length: enhancedPrompt.length,
    });

  } catch (error) {
    console.error('Error enhancing prompt:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});