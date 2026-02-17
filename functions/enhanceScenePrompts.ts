import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scene_id, enhance_type = 'both' } = await req.json();

    if (!scene_id) {
      return Response.json({ error: 'Missing scene_id' }, { status: 400 });
    }

    // ══════════════════════════════════════════════════════════════════
    // LOAD SCENE, PROJECT & CONTEXT
    // ══════════════════════════════════════════════════════════════════
    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get surrounding scenes for continuity
    const allScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: scene.project_id });
    const sorted = allScenes.sort((a, b) => a.scene_number - b.scene_number);
    const idx = sorted.findIndex(s => s.id === scene_id);
    const prevScene = idx > 0 ? sorted[idx - 1] : null;
    const nextScene = idx < sorted.length - 1 ? sorted[idx + 1] : null;

    console.log('================================================');
    console.log(`ENHANCING SCENE ${scene.scene_number} | Type: ${enhance_type}`);
    console.log(`Project style: ${project?.visual_style} | Orientation: ${project?.orientation}`);
    console.log('================================================');

    // ══════════════════════════════════════════════════════════════════
    // PREMIUM STYLE MAP (Full descriptions, not summaries)
    // ══════════════════════════════════════════════════════════════════
    const styleMap = {
      cinematic_realistic: "Cinematic film still shot on ARRI Alexa 65 with anamorphic Panavision lenses, beautiful lens flare and chromatic aberration, shallow depth of field f/1.4 with creamy bokeh, dramatic three-point lighting with hard key light and soft fill, strong rim light separation, color graded with professional teal and orange LUT, subtle Kodak Vision3 film grain texture, volumetric god rays, Hollywood blockbuster cinematography, photorealistic rendering, 8K resolution",
      photorealistic_4k: "Ultra-photorealistic DSLR photograph shot on Canon EOS R5 with RF 85mm f/1.2 L lens, razor-sharp focus with incredible detail, natural ambient lighting with soft diffused quality, professional color grading with accurate skin tones, editorial photography style, visible skin texture with pores, accurate physically-based shadows and highlights, real-world proportions, zero AI artifacts, 8K RAW image quality",
      cinematic_anime: "Cinematic anime illustration in the signature style of Makoto Shinkai and Ufotable studio, dramatic volumetric god rays with atmospheric scattering, incredibly detailed background art with painted clouds, film-grain overlay texture, anime characters with semi-realistic proportions, dynamic dramatic camera angle with depth, beautiful depth of field bokeh, color palette of warm sunset oranges blending into cool twilight blues, award-winning anime film quality",
      anime: "High-quality anime illustration combining Studio Ghibli whimsy with modern anime aesthetic, vibrant saturated colors with rich tones, clean precise linework with consistent line weight, cel-shaded with soft airbrushed gradients, expressive detailed eyes with multiple highlights, detailed hair strands with natural flow and movement, colorful detailed background art, professional anime production quality",
      cartoon_2d: "Professional 2D vector animation style reminiscent of modern Cartoon Network and Disney Television Animation, flat cel-shaded colors with strategic gradients, bold clean outlines with consistent line weight, playful exaggerated proportions, bright cheerful primary color palette, clean gradient backgrounds with atmospheric depth, broadcast television quality",
      picstory_cocomelon: "3D rendered Pixar-quality children's animation, soft subsurface scattering on skin, rounded chunky character design with appeal for young audiences, oversized expressive eyes with detailed reflections, bright candy-colored palette, soft ambient occlusion, cheerful warm global illumination, toy-like proportions, smooth plastic-like materials, raytraced rendering quality",
      cinematic_picstory: "Cinematic 3D CGI render matching Pixar Animation Studios or DreamWorks feature film quality, realistic subsurface scattering, raytraced global illumination with accurate light bounces, volumetric fog and atmospheric effects, dramatic rim lighting, physically based rendering (PBR), detailed fabric simulation, advanced hair simulation, film color grading with rich contrast, IMAX-quality framing",
      oil_painting: "Classical oil painting on textured linen canvas, visible impasto brushstrokes with thick paint application, chiaroscuro lighting technique with dramatic contrast, Rembrandt-inspired use of dramatic shadow, rich warm umber and burnt sienna undertones, warm golden varnish glow, museum-quality fine art, Renaissance composition using golden ratio, thick visible paint texture, gallery directional lighting",
      watercolor: "Delicate transparent watercolor painting on cold-pressed Arches paper, visible paper grain texture showing through, soft wet-on-wet color bleeding with organic edges, transparent luminous washes layered for depth, gentle color gradients that flow naturally, white paper strategically showing through highlights, loose expressive brushwork, muted pastel palette with vivid accents, dreamy atmospheric perspective",
      comic_book: "Bold American comic book art style, heavy black ink outlines with dynamic line weight variation, Ben-Day halftone dot shading, dynamic foreshortened perspective with dramatic angles, speed lines for kinetic energy, dramatic chiaroscuro inking with deep blacks, saturated CMYK color palette, Jack Kirby-inspired dynamic composition, professional comic book illustration quality",
    };

    // ══════════════════════════════════════════════════════════════════
    // ORIENTATION CONFIG
    // ══════════════════════════════════════════════════════════════════
    const orientation = project?.orientation || 'landscape';
    const orientationDirective = orientation === 'portrait'
  ? 'PORTRAIT VERTICAL 9:16 format, 832x1248 pixels, tall vertical composition, center subjects vertically'
  : 'LANDSCAPE HORIZONTAL 16:9 widescreen format, 1216x832 pixels, wide cinematic framing, rule-of-thirds horizontal placement, fill entire frame edge to edge';
  
    const visualStyle = project?.visual_style || 'cinematic_realistic';
    const styleDirective = styleMap[visualStyle] || styleMap.cinematic_realistic;
    const promptPrefix = `${styleDirective}, ${orientationDirective}`;

    // ══════════════════════════════════════════════════════════════════
    // CHARACTER BLOCK
    // ══════════════════════════════════════════════════════════════════
    let charBlock = '';
    if (project?.character_descriptions) {
      try {
        const chars = JSON.parse(project.character_descriptions);
        if (chars.length > 0) {
          charBlock = 'ESTABLISHED CHARACTERS (copy FULL description every time they appear):\n' +
            chars.map(c => `- ${c.name}: ${c.description}`).join('\n');
        }
      } catch (e) {
        console.warn('Failed to parse character descriptions:', e.message);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // CONTEXT BLOCK
    // ══════════════════════════════════════════════════════════════════
    const contextBlock = [
      prevScene ? `PREVIOUS SCENE ${prevScene.scene_number} (for visual continuity):\nNarration: "${prevScene.narration_text}"\nImage prompt: ${prevScene.image_prompt}` : '',
      nextScene ? `NEXT SCENE ${nextScene.scene_number} (for visual continuity):\nNarration: "${nextScene.narration_text}"\nImage prompt: ${nextScene.image_prompt}` : '',
    ].filter(Boolean).join('\n\n');

    const updates = {};

    // ══════════════════════════════════════════════════════════════════
    // ENHANCE IMAGE PROMPT
    // ══════════════════════════════════════════════════════════════════
    if (enhance_type === 'image' || enhance_type === 'both') {
      console.log(`Enhancing image prompt for scene ${scene.scene_number}...`);

      const imageResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a world-class AI image prompt engineer specializing in cinematic, high-retention visual content. Your job is to transform the provided image prompt into a premium, highly detailed, visually stunning prompt that will generate a breathtaking image.

================================================
CURRENT IMAGE PROMPT (needs enhancement):
${scene.image_prompt || 'No prompt provided'}

NARRATION (what viewers hear during this scene):
"${scene.narration_text}"

SCENE NUMBER: ${scene.scene_number} of ${sorted.length}
VISUAL STYLE: ${styleDirective}
FORMAT: ${orientationDirective}
================================================

${charBlock ? charBlock + '\n\n' : ''}${contextBlock ? contextBlock + '\n\n' : ''}

ENHANCEMENT MANDATE:

1. MANDATORY PREFIX: Start with exactly "${promptPrefix}."

2. SHOT TYPE: Specify an exact cinematography shot type appropriate to the narration:
   - Wide/establishing shots for context/scale
   - Medium shots for action/dialogue
   - Close-ups for emotion/detail
   - Bird's eye for overview
   - Low angle for power/drama
   - Dutch angle for unease

3. SUBJECT & ACTION: Describe EXACTLY what is happening visually, matching the narration

4. CHARACTER DETAILS: If any character appears, include their COMPLETE description from the character references above. Never abbreviate.

5. LIGHTING (CRITICAL): Specify all of these:
   - Light source (sun, moon, lamp, practical)
   - Light direction (from left, backlit, overhead, side)
   - Light quality (hard dramatic, soft diffused, warm golden)
   - Shadow placement and depth

6. ENVIRONMENT & DEPTH: Describe foreground, midground, and background layers

7. COLOR PALETTE: Specify the overall color mood (warm sunset tones, cool blue twilight, desaturated noir)

8. VISUAL CONTINUITY: Match color grading and mood to adjacent scenes

9. NO TEXT RULE: End with "ABSOLUTELY NO text, words, letters, numbers, captions, signs, or writing of any kind in the image"

10. QUALITY MARKERS: End with "masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"

11. CONTENT SAFETY: Replace any graphic violence or distressing imagery with dignified alternatives

12. LENGTH: 250-400 characters for premium quality

RETURN ONLY the enhanced prompt as a plain string. No explanations, no JSON, no markdown. Just the enhanced prompt text.`,
        response_json_schema: {
          type: 'object',
          properties: {
            enhanced_prompt: { type: 'string' }
          },
          required: ['enhanced_prompt']
        }
      });

      if (imageResult?.enhanced_prompt) {
        // Validate and patch if needed
        let enhancedImagePrompt = imageResult.enhanced_prompt;

        // Ensure style directive is present
        if (!enhancedImagePrompt.toLowerCase().includes(styleDirective.substring(0, 25).toLowerCase())) {
          enhancedImagePrompt = `${promptPrefix}. ${enhancedImagePrompt}`;
        }

        // Ensure no-text rule is present
        if (!enhancedImagePrompt.toLowerCase().includes('no text')) {
          enhancedImagePrompt += ', ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image';
        }

        // Ensure quality markers
        if (!enhancedImagePrompt.toLowerCase().includes('masterpiece')) {
          enhancedImagePrompt += ', masterpiece quality, highly detailed, 8K resolution, professional composition';
        }

        updates.image_prompt = enhancedImagePrompt;
        console.log(`Image prompt enhanced: ${enhancedImagePrompt.length} chars`);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // ENHANCE ANIMATION PROMPT
    // ══════════════════════════════════════════════════════════════════
    if (enhance_type === 'animation' || enhance_type === 'both') {
      console.log(`Enhancing animation prompt for scene ${scene.scene_number}...`);

      const animResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a world-class cinematographer and motion director specializing in AI video generation. Create a premium, highly specific animation prompt that describes exactly how this scene's image should come alive with cinematic motion.

================================================
CURRENT ANIMATION PROMPT:
${scene.animation_prompt || 'Subtle cinematic motion'}

SCENE IMAGE:
${updates.image_prompt || scene.image_prompt}

NARRATION (what viewers hear):
"${scene.narration_text}"

SCENE DURATION: ${scene.duration_seconds || 8} seconds
ORIENTATION: ${orientationDirective}
CURRENT CAMERA SETTING: ${scene.camera_movement || 'slow_pan'}
CURRENT SPEED SETTING: ${scene.animation_speed || 'normal'}
================================================

${prevScene ? `PREVIOUS SCENE ANIMATION (match flow from this):\n${prevScene.animation_prompt || 'gentle motion'}\n\n` : ''}${nextScene ? `NEXT SCENE ANIMATION (prepare flow into this):\n${nextScene.animation_prompt || 'gentle motion'}\n\n` : ''}

ENHANCEMENT MANDATE:

1. CAMERA MOVEMENT (required): Describe with precision:
   - Direction: left/right/forward/backward/up/down/circular
   - Speed: imperceptibly slow / glacially slow / slow / moderate / fast
   - Path: straight dolly, curved arc, orbital, crane ascent/descent
   - Start framing and end framing
   Example: "Slow imperceptible dolly-in moving forward at 15% speed, starting wide at chest height and ending in medium close-up"

2. ATMOSPHERIC MOTION (required): At least ONE environmental movement:
   - Wind effects: leaves rustling, hair flowing, fabric billowing, curtains swaying
   - Particles: dust motes floating, snow drifting, embers rising, rain falling
   - Natural: clouds drifting, waves lapping, smoke curling, fire flickering
   - Light: god rays shifting, shadows moving, reflections shimmering

3. SUBJECT MICRO-MOTION (required): Subtle character/subject movement:
   - Physiological: breathing, chest rising/falling, subtle sway
   - Environmental response: hair movement, clothing flutter, eye movement, blinking

4. DEPTH OF FIELD (if applicable):
   - Rack focus: shift from foreground to background or vice versa
   - Bokeh bloom: background gradually defocusing
   - Breathing: subtle focus breathing for organic feel

5. LIGHTING TRANSITIONS:
   - Light quality changing: clouds passing over sun, light flickering
   - Color temperature shift: warming or cooling over scene duration
   - Shadow movement: sun moving, shadows lengthening

6. EMOTIONAL MATCHING:
   - Tension/Dread = extremely slow creeping zoom, still atmosphere
   - Wonder/Revelation = slow pull-back revealing scale, brightening
   - Sadness/Loss = almost imperceptible downward tilt, desaturating
   - Triumph/Hope = slow crane rise, light intensifying, warming tones
   - Action/Urgency = handheld feel, faster movement, energy

7. TRANSITION PREPARATION:
   - Movement should naturally flow OUT of the previous scene
   - End position should naturally flow INTO the next scene
   - Avoid jarring direction reversals between adjacent scenes

8. LENGTH: 200-350 characters, specific and cinematic

Also select the most appropriate:
- camera_movement from: static, slow_pan, slow_zoom_in, slow_zoom_out, dolly_zoom, crane_shot, tracking_shot, orbital, tilt_up, tilt_down
- animation_speed from: very_slow, slow, normal, fast

Return JSON with:
{
  "enhanced_animation_prompt": "detailed animation prompt",
  "suggested_camera_movement": "one of the camera movement options",
  "suggested_animation_speed": "one of the speed options",
  "motion_rationale": "brief explanation of why these choices match the emotional tone"
}`,
        response_json_schema: {
          type: 'object',
          properties: {
            enhanced_animation_prompt: { type: 'string' },
            suggested_camera_movement: { type: 'string' },
            suggested_animation_speed: { type: 'string' },
            motion_rationale: { type: 'string' }
          },
          required: ['enhanced_animation_prompt', 'suggested_camera_movement', 'suggested_animation_speed']
        }
      });

      if (animResult?.enhanced_animation_prompt) {
        updates.animation_prompt = animResult.enhanced_animation_prompt;

        const validCameraMovements = ['static', 'slow_pan', 'slow_zoom_in', 'slow_zoom_out', 'dolly_zoom', 'crane_shot', 'tracking_shot', 'orbital', 'tilt_up', 'tilt_down'];
        const validSpeeds = ['very_slow', 'slow', 'normal', 'fast'];

        if (animResult.suggested_camera_movement && validCameraMovements.includes(animResult.suggested_camera_movement)) {
          updates.camera_movement = animResult.suggested_camera_movement;
        }

        if (animResult.suggested_animation_speed && validSpeeds.includes(animResult.suggested_animation_speed)) {
          updates.animation_speed = animResult.suggested_animation_speed;
        }

        console.log(`Animation prompt enhanced: ${animResult.enhanced_animation_prompt.length} chars`);
        if (animResult.motion_rationale) {
          console.log(`Motion rationale: ${animResult.motion_rationale}`);
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // SAVE UPDATES
    // ══════════════════════════════════════════════════════════════════
    if (Object.keys(updates).length === 0) {
      return Response.json({ 
        success: false, 
        error: 'No enhancements were generated' 
      }, { status: 500 });
    }

    await base44.asServiceRole.entities.Scenes.update(scene_id, updates);

    console.log(`Scene ${scene.scene_number} enhanced successfully`);
    console.log(`Fields updated: ${Object.keys(updates).join(', ')}`);
    console.log('================================================');

    return Response.json({ 
      success: true, 
      scene_number: scene.scene_number,
      enhance_type: enhance_type,
      updates: updates
    });

  } catch (error) {
    console.error('enhanceScenePrompts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});