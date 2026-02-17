import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function callGemini(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 16384, responseMimeType: "application/json" }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");
  const rawText = data.candidates[0].content.parts[0].text;

  try {
    return JSON.parse(rawText);
  } catch (e) {
    console.log("JSON parse failed, attempting recovery...");
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace === -1) throw new Error("Cannot recover JSON from Gemini response");
    const trimmed = rawText.substring(0, lastBrace + 1);
    const attempts = [trimmed + ']}', trimmed + '}]}', trimmed];
    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed.scenes && Array.isArray(parsed.scenes)) {
          console.log(`Recovered ${parsed.scenes.length} scenes from truncated JSON`);
          return parsed;
        }
      } catch (_) {}
    }
    throw new Error("Failed to parse Gemini JSON response after recovery attempts");
  }
}

function cleanNarrationText(text) {
  if (!text) return text;
  let cleaned = text;
  cleaned = cleaned.replace(/\[[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '');
  cleaned = cleaned.replace(/^[A-Z\s]+\(V\.?O\.?\)\s*:?\s*/gim, '');
  cleaned = cleaned.replace(/\*\*[^*]+\*\*:?\s*/g, '');
  cleaned = cleaned.replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic|softly|urgent|compelling)[^)]*\)/gi, '');
  cleaned = cleaned.replace(/\(?\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?\)?/g, '');
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');
  cleaned = cleaned.replace(/\n{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

function cleanScriptText(text) {
  let cleaned = text;
  cleaned = cleaned.replace(/\[[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '');
  cleaned = cleaned.replace(/^[A-Z\s]+\(V\.?O\.?\)\s*:?\s*/gim, '');
  cleaned = cleaned.replace(/\*\*[^*]+\*\*:?\s*/g, '');
  cleaned = cleaned.replace(/\*\*/g, '');
  cleaned = cleaned.replace(/\*/g, '');
  cleaned = cleaned.replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic|softly|urgent|compelling)[^)]*\)/gi, '');
  cleaned = cleaned.replace(/\(?\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?\)?/g, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

function splitScriptIntoChunks(script, numChunks) {
  const sentences = script.match(/[^.!?]+[.!?]+[\s]*/g) || [script];
  const sentencesPerChunk = Math.ceil(sentences.length / numChunks);
  const chunks = [];
  for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
    chunks.push(sentences.slice(i, i + sentencesPerChunk).join('').trim());
  }
  return chunks;
}

// ══════════════════════════════════════════════════════════════════
// PREMIUM QUALITY VALIDATION
// ══════════════════════════════════════════════════════════════════
function validateAndEnhancePrompt(imagePrompt, styleConfig, orientation, sceneNumber) {
  let enhanced = imagePrompt;
  const issues = [];

  // Check 1: Minimum length (premium prompts are detailed)
  if (enhanced.length < 150) {
    issues.push(`Scene ${sceneNumber}: Prompt too short (${enhanced.length} chars)`);
  }

  // Check 2: Must start with style directive
  const styleKeywords = styleConfig.positive.substring(0, 50).toLowerCase();
  if (!enhanced.toLowerCase().includes(styleKeywords.substring(0, 20))) {
    issues.push(`Scene ${sceneNumber}: Missing style directive`);
    enhanced = `${styleConfig.positive}, ${orientation.directive}. ${enhanced}`;
  }

  // Check 3: Must include orientation
  if (orientation.format === 'portrait') {
    if (!enhanced.toLowerCase().includes('portrait') && !enhanced.includes('9:16')) {
      issues.push(`Scene ${sceneNumber}: Missing portrait orientation`);
      enhanced = enhanced.replace(/landscape|horizontal|16:?9/gi, '');
      if (!enhanced.includes(orientation.directive)) {
        enhanced = `${orientation.directive}. ${enhanced}`;
      }
    }
  } else {
    if (!enhanced.toLowerCase().includes('landscape') && !enhanced.includes('16:9')) {
      issues.push(`Scene ${sceneNumber}: Missing landscape orientation`);
      enhanced = enhanced.replace(/portrait|vertical|9:?16/gi, '');
      if (!enhanced.includes(orientation.directive)) {
        enhanced = `${orientation.directive}. ${enhanced}`;
      }
    }
  }

  // Check 4: Must have "no text" rule
  if (!enhanced.toLowerCase().includes('no text')) {
    issues.push(`Scene ${sceneNumber}: Missing "no text" rule`);
    enhanced += ', ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image';
  }

  // Check 5: Must have quality markers
  const hasQuality = enhanced.toLowerCase().includes('masterpiece') || 
                     enhanced.toLowerCase().includes('professional') ||
                     enhanced.toLowerCase().includes('8k') ||
                     enhanced.toLowerCase().includes('award');
  
  if (!hasQuality) {
    issues.push(`Scene ${sceneNumber}: Missing quality markers`);
    enhanced += ', masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography';
  }

  // Check 6: Should have specific lighting
  const hasLighting = /\b(light|lighting|illumination|glow|shadow|ray|sun|moon|lamp|candle|fire)\b/i.test(enhanced);
  if (!hasLighting) {
    issues.push(`Scene ${sceneNumber}: Missing lighting description`);
  }

  // Check 7: Should have camera/shot details
  const hasCameraWork = /\b(shot|angle|view|camera|lens|focal|close-up|wide|medium|depth of field|bokeh|f\/\d)\b/i.test(enhanced);
  if (!hasCameraWork) {
    issues.push(`Scene ${sceneNumber}: Missing camera/shot details`);
  }

  // Log issues
  if (issues.length > 0) {
    console.warn(`⚠️ Prompt quality issues found:\n${issues.join('\n')}`);
  }

  return enhanced;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, batch_index } = await req.json();
    const currentBatch = batch_index || 0;

    // Get project
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get ONLY the final_aggregated script
    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found. Please generate the full script first.' }, { status: 400 });
    }

    console.log(`Using final_aggregated script, words: ${script.full_script.split(/\s+/).length}`);

    // ══════════════════════════════════════════════════════════════════
    // PREMIUM VISUAL STYLE MAPPING (with positive + negative prompts)
    // ══════════════════════════════════════════════════════════════════
    const styleMap = {
      cinematic_realistic: {
        positive: "Cinematic film still shot on ARRI Alexa 65 with anamorphic Panavision lenses, beautiful lens flare and chromatic aberration, shallow depth of field f/1.4 with creamy bokeh, dramatic three-point lighting with hard key light and soft fill, strong rim light separation, color graded with professional teal and orange LUT, subtle Kodak Vision3 film grain texture, volumetric god rays through atmosphere, lens breathing on focus pulls, Hollywood blockbuster cinematography, photorealistic rendering, 8K resolution",
        negative: "cartoon, anime, illustration, painting, drawing, sketch, 3D render, CGI, video game graphics, cel shaded, flat colors, clipart, comic book, manga, stylized, non-photorealistic, amateur photography, smartphone photo, low quality, blurry, distorted, deformed, oversaturated, artificial looking"
      },
      photorealistic_4k: {
        positive: "Ultra-photorealistic DSLR photograph shot on Canon EOS R5 with RF 85mm f/1.2 L lens, razor-sharp focus with incredible detail, natural ambient lighting with soft diffused quality, professional color grading with accurate skin tones, editorial photography style for National Geographic or Vogue, visible skin texture with pores and fine details, accurate physically-based shadows and highlights, real-world proportions and anatomy, zero AI artifacts, 8K RAW image quality, museum-grade fine art photography",
        negative: "cartoon, anime, illustration, CGI, 3D render, painting, digital art, artistic interpretation, stylized, unrealistic, soft focus, beauty filter, over-processed, illustration style, non-photographic, video game, synthetic, artificial, heavily edited, HDR overdone"
      },
      cinematic_anime: {
        positive: "Cinematic anime illustration in the signature style of Makoto Shinkai (Your Name, Weathering With You) and Ufotable studio, dramatic volumetric god rays with atmospheric scattering, incredibly detailed background art with painted clouds and environments, film-grain overlay texture for cinematic feel, anime characters with semi-realistic proportions and detailed features, dynamic dramatic camera angle with depth, beautiful depth of field bokeh effect, color palette of warm sunset oranges blending into cool twilight blues, emotional lighting that enhances the mood, award-winning anime film quality",
        negative: "photorealistic, live action, photograph, western cartoon, Disney style, 3D CGI render, rough sketch, amateur drawing, simple coloring, flat lighting, low detail backgrounds, chibi style, overly simplified, manga page, black and white, unfinished art"
      },
      anime: {
        positive: "High-quality anime illustration combining Studio Ghibli's whimsy with modern anime aesthetic, vibrant saturated colors with rich tones, clean precise linework with consistent line weight, cel-shaded with soft airbrushed gradients, expressive detailed eyes with multiple highlights and reflections, detailed hair strands with natural flow and movement, colorful detailed background art with atmospheric perspective, well-composed manga panel layout with rule of thirds, professional anime production quality like top-tier seasonal anime",
        negative: "photorealistic, live action, photograph, 3D render, western cartoon style, rough sketch, amateur coloring, flat backgrounds, inconsistent art style, off-model characters, poorly drawn anatomy, rushed animation, low budget anime, chibi, super deformed"
      },
      cartoon_2d: {
        positive: "Professional 2D vector animation style reminiscent of modern Cartoon Network, Disney Television Animation, or Nickelodeon productions, flat cel-shaded colors with strategic gradients, bold clean outlines with consistent line weight, playful exaggerated proportions that maintain appeal, bright cheerful primary color palette with good contrast, clean gradient backgrounds with atmospheric depth, animation keyframe quality with strong poses, appealing character design with clear silhouettes, broadcast television quality",
        negative: "photorealistic, anime, 3D render, realistic proportions, gritty, dark, sketch, rough lines, amateur drawing, inconsistent style, South Park simplicity, crude animation, Flash animation quality, stiff poses, muddy colors"
      },
      picstory_cocomelon: {
        positive: "3D rendered Pixar-quality children's animation with soft subsurface scattering on skin for realistic light diffusion, rounded chunky character design with appeal for young audiences, oversized expressive eyes with detailed reflections, bright candy-colored palette with high saturation, soft ambient occlusion for subtle depth, cheerful warm global illumination with soft shadows, toy-like proportions that feel huggable, smooth plastic-like materials with subtle specularity, raytraced rendering quality, family-friendly G-rated content, Cocomelon or Super Simple Songs production value",
        negative: "realistic, photographic, anime, 2D cartoon, gritty, dark themes, scary, sharp edges, adult themes, rough textures, muted colors, horror elements, violent imagery, angular design, serious tone"
      },
      cinematic_picstory: {
        positive: "Cinematic 3D CGI render matching Pixar Animation Studios or DreamWorks feature film quality, realistic subsurface scattering for skin and translucent materials, raytraced global illumination with accurate light bounces, volumetric fog and atmospheric effects, dramatic rim lighting for character separation, physically based rendering (PBR) with accurate material properties, detailed fabric simulation with realistic wrinkles and folds, advanced hair simulation with individual strand detail, film color grading with rich contrast and teal-orange look, IMAX-quality framing and composition, theatrical release cinematography, Academy Award-level animation quality",
        negative: "2D animation, flat colors, anime, cartoon style, low poly, video game graphics, rough rendering, amateur 3D, simplistic shading, unrealistic materials, stiff animation, TV budget quality, mobile game graphics"
      },
      oil_painting: {
        positive: "Classical oil painting on textured linen canvas, visible impasto brushstrokes with thick paint application, chiaroscuro lighting technique with dramatic contrast between light and shadow, Rembrandt-inspired use of dramatic shadow and highlighted faces, rich warm umber and burnt sienna undertones, warm golden varnish glow over the entire piece, museum-quality fine art worthy of the Louvre or Metropolitan Museum, Renaissance composition using golden ratio and divine proportions, thick visible paint texture with palette knife work, gallery directional lighting enhancing the texture, old master painting technique",
        negative: "photorealistic, digital art, anime, cartoon, illustration, flat colors, vector art, modern digital painting, photograph, CGI, 3D render, smooth finish, airbrushed, lacking texture, contemporary illustration style, graphic design"
      },
      watercolor: {
        positive: "Delicate transparent watercolor painting on cold-pressed Arches paper, visible paper grain texture showing through, soft wet-on-wet color bleeding technique with organic edges, transparent luminous washes layered for depth, gentle color gradients that flow naturally, white paper strategically showing through for highlights and sparkle, loose expressive brushwork capturing spontaneity, muted pastel palette with occasional vivid accent colors, dreamy atmospheric perspective with soft edges, professional watercolor artist technique like John Singer Sargent or Winslow Homer, fine art gallery quality",
        negative: "photorealistic, digital art, oil painting, acrylic, cartoon, anime, vector illustration, 3D render, CGI, heavy opaque colors, hard edges, digital watercolor filter, overly saturated, graphic design, flat illustration, photograph"
      },
      comic_book: {
        positive: "Bold American comic book art style, heavy black ink outlines with dynamic line weight variation, Ben-Day halftone dot shading for texture and tone, dynamic foreshortened perspective with dramatic angles, motion lines and speed lines for kinetic energy, dramatic chiaroscuro inking with deep blacks and bright highlights, saturated CMYK color palette for print, Jack Kirby-inspired dynamic composition with powerful poses, thick panel borders and gutters, action-packed graphic novel quality like Marvel or DC Comics, professional comic book illustration by industry veterans, award-winning sequential art",
        negative: "photorealistic, anime, manga, photograph, 3D render, watercolor, oil painting, soft shading, realistic lighting, muted colors, static composition, sketch, unfinished art, amateur webcomic, simple coloring, flat illustration"
      },
    };

    const visualStyle = project.visual_style || 'cinematic_realistic';
    const styleConfig = styleMap[visualStyle] || styleMap.cinematic_realistic;

    // ══════════════════════════════════════════════════════════════════
    // ORIENTATION CONFIGURATION
    // ══════════════════════════════════════════════════════════════════
    const orientation = project.orientation || 'landscape';
    let orientationConfig;

    if (orientation === 'portrait') {
      orientationConfig = {
        format: 'portrait',
        directive: "PORTRAIT VERTICAL 9:16 format (720×1280 pixels)",
        composition: "Compose for VERTICAL 9:16 mobile frame: use tall vertical compositions with strong vertical leading lines, center subjects in the vertical frame with headroom and foot room, close-up and medium shots work best for vertical format, use vertical depth with foreground/midground/background elements stacked vertically, avoid wide horizontal elements that get cropped",
        animation: "vertical 9:16 smartphone frame — prefer tilt up/down camera movements, vertical reveals and wipes, close-up push-ins and pull-outs, vertical parallax scrolling effects, portrait-oriented motion",
        dimensions: { width: 720, height: 1280 }
      };
    } else {
      orientationConfig = {
        format: 'landscape',
        directive: "LANDSCAPE HORIZONTAL 16:9 widescreen format (1280×720 pixels)",
        composition: "Compose for WIDESCREEN 16:9 cinematic frame: use wide establishing shots with panoramic depth, apply rule of thirds with subjects placed left/right for negative space, utilize horizontal leading lines and lateral composition, create depth with foreground/midground/background layers spread horizontally, embrace wide cinematic framing with breathing room on sides",
        animation: "widescreen 16:9 cinematic frame — prefer horizontal pans and tracking shots, dolly movements forward/backward, wide-angle crane shots, lateral parallax with depth, horizontal reveals and wipes",
        dimensions: { width: 1280, height: 720 }
      };
    }

    const promptPrefix = `${styleConfig.positive}, ${orientationConfig.directive}`;

    // ══════════════════════════════════════════════════════════════════
    // SCRIPT PROCESSING
    // ══════════════════════════════════════════════════════════════════
    const cleanedScript = cleanScriptText(script.full_script);
    const wordCount = cleanedScript.split(/\s+/).length;

    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    const totalTargetScenes = Math.max(5, Math.round(durationMinutes * 60 / 8));
    const SCENES_PER_BATCH = 10;
    const numBatches = Math.ceil(totalTargetScenes / SCENES_PER_BATCH);

    const scriptChunks = splitScriptIntoChunks(cleanedScript, numBatches);

    // First batch: delete old scenes
    if (currentBatch === 0) {
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      for (const s of oldScenes) {
        await base44.asServiceRole.entities.Scenes.delete(s.id);
      }
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "content_generation",
        current_step: 5
      });
    }

    // Count existing scenes for offset
    const existingScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    const sceneOffset = existingScenes.length;

    if (currentBatch >= scriptChunks.length || sceneOffset >= totalTargetScenes) {
      return Response.json({ success: true, done: true, scene_count: sceneOffset, total_batches: numBatches });
    }

    const scenesForBatch = Math.min(SCENES_PER_BATCH, totalTargetScenes - sceneOffset);

    // ══════════════════════════════════════════════════════════════════
    // CINEMATIC SHOT VARIETY (Expanded for Premium Quality)
    // ══════════════════════════════════════════════════════════════════
    const shotTypes = [
      "extreme wide establishing shot (EWS) showing the full environment from a distance with the subject small in frame",
      "wide shot (WS) showing the subject full body in their environment with context and surroundings visible",
      "medium wide shot (MWS) showing subject from knees up with some environmental context",
      "medium shot (MS) showing subject from waist up, balancing subject and background",
      "medium close-up (MCU) showing subject from chest up with emphasis on face and upper body, background still visible",
      "close-up (CU) showing subject's face filling most of the frame with shallow depth of field",
      "extreme close-up (ECU) showing just eyes, mouth, or hands with intense dramatic focus",
      "over-the-shoulder shot (OTS) looking past one subject's shoulder toward another or the scene",
      "point-of-view shot (POV) showing what the subject sees from their perspective",
      "bird's eye view / overhead shot looking straight down at the scene from above",
      "low angle shot looking up at the subject from below for dramatic power and dominance",
      "high angle shot looking down at the subject from above for vulnerability or scale",
      "Dutch angle / canted angle with tilted horizon for unease or dynamic energy",
      "silhouette shot with subject backlit against bright background creating dramatic outline",
      "detail shot / insert shot focusing on a specific meaningful object, texture, or small element",
      "two-shot showing two subjects in frame together with their spatial relationship",
      "tracking shot / dolly shot following subject movement smoothly through space",
      "aerial shot from high above showing landscape or environment with godlike perspective"
    ];

    // ══════════════════════════════════════════════════════════════════
    // PREMIUM EXAMPLE PROMPTS FOR GEMINI
    // ══════════════════════════════════════════════════════════════════
    const examplePrompts = `
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**EXAMPLE PREMIUM-QUALITY IMAGE PROMPTS (Study these carefully):**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

✅ EXCELLENT Example (Cinematic Realistic, Landscape):
"Cinematic film still shot on ARRI Alexa 65 with anamorphic Panavision lenses, beautiful lens flare, shallow depth of field f/1.4, LANDSCAPE HORIZONTAL 16:9 widescreen format (1280×720 pixels). Medium wide shot of a weathered 65-year-old Caucasian male ship captain with salt-and-pepper full beard, deep-set steel-blue eyes with crow's feet, weathered sun-damaged skin, wearing navy blue wool peacoat with brass buttons and white captain's hat with gold emblem, standing confidently on the bow of a classic wooden sailing vessel. Golden hour magic hour lighting with warm orange sun rays streaming from camera right creating strong rim light on his profile, teal-blue Atlantic ocean in sharp focus background, volumetric fog rolling across weathered teak deck, seagulls in distance. Kodak Vision3 film grain texture, color graded with cinematic teal and orange LUT. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"

✅ EXCELLENT Example (Anime, Portrait):
"High-quality anime illustration in Studio Ghibli and Makoto Shinkai style, vibrant saturated colors, clean precise linework, PORTRAIT VERTICAL 9:16 format (720×1280 pixels). Close-up shot of a young female protagonist, 16 years old, Japanese ethnicity, with large expressive emerald green eyes featuring multiple highlights, long flowing auburn hair with natural movement and individual strand detail, wearing traditional Japanese school uniform with white blouse and navy blue sailor collar with red bow, gentle smile with slight blush on cheeks. Warm afternoon golden sunlight streaming from upper left creating beautiful rim light on her hair, soft focus background of cherry blossom trees in full bloom with pink petals gently floating, depth of field bokeh effect. Cel-shaded with soft airbrushed gradients, professional anime production quality. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, award-winning anime film quality"

✅ EXCELLENT Example (Photorealistic, Portrait):
"Ultra-photorealistic DSLR photograph shot on Canon EOS R5 with RF 85mm f/1.2 L lens, razor-sharp focus, PORTRAIT VERTICAL 9:16 format (720×1280 pixels). Medium close-up portrait of a confident 32-year-old Black female entrepreneur with natural type 4C textured hair in a professional afro style, warm brown eyes with subtle makeup, smooth skin with visible pore detail, wearing contemporary business attire consisting of charcoal gray blazer over crisp white collared shirt. Soft directional window lighting from camera left creating gentle loop lighting pattern on face, subtle catchlight in eyes, neutral gray studio backdrop slightly out of focus. Natural ambient lighting, editorial photography for Forbes magazine. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. museum-grade fine art photography, 8K RAW image quality, professional color grading"

❌ BAD Example (Too generic, lacks detail):
"A man standing on a boat at sunset"

❌ BAD Example (Missing style, orientation, technical details):
"Captain on ship, golden hour lighting"

❌ BAD Example (Includes text elements - NEVER DO THIS):
"Ship captain with nameplate reading 'Captain Johnson' on his uniform"

**NOTICE:** Premium prompts are 200-400 characters long, include specific technical camera/lens details, precise subject descriptions with exact age/ethnicity/features/clothing, detailed lighting with direction and quality, environmental details, and explicit format requirements.
`;

    // ══════════════════════════════════════════════════════════════════
    // COMPREHENSIVE RULES FOR GEMINI
    // ══════════════════════════════════════════════════════════════════
    const imageRules = `**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**CRITICAL IMAGE PROMPT RULES (MUST FOLLOW EXACTLY):**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

1. **MANDATORY PREFIX:** EVERY image_prompt MUST begin with exactly: "${promptPrefix}."

2. **COMPOSITION:** ${orientationConfig.composition}

3. **SHOT VARIETY IS CRITICAL:** Each scene MUST use a DIFFERENT shot type/camera angle from the provided list. NEVER repeat the same framing for consecutive scenes. Study cinematography.

4. **CHARACTER CONSISTENCY:** When a character appears:
   - Include their COMPLETE description every single time (exact age, gender, ethnicity, hair color/style/length, facial hair specifics, eye color, build/height, exact clothing with colors, distinguishing features/scars/tattoos)
   - NEVER use generic terms like "a man", "a woman", "the person"
   - Maintain EXACT same appearance across ALL scenes unless story explicitly describes a change
   - If character has a beard in scene 1, they have the EXACT SAME beard in all scenes

5. **LIGHTING MASTERY:** Every prompt must include:
   - Light source (sun, moon, lamp, candle, practical lights, etc.)
   - Light direction (from left, from right, overhead, backlit, etc.)
   - Light quality (soft/diffused, hard/dramatic, warm/cool color temperature)
   - Shadows and highlights placement

6. **TECHNICAL CAMERA DETAILS:** Include specific camera work:
   - Shot type from the provided list (wide, medium, close-up, etc.)
   - Camera angle (eye level, low angle, high angle, Dutch angle, etc.)
   - Depth of field (shallow f/1.4 bokeh, deep focus f/11, etc.)
   - Lens characteristics if relevant (wide angle distortion, telephoto compression, etc.)

7. **ENVIRONMENTAL DEPTH:** Describe foreground, midground, and background elements for depth

8. **COLOR PALETTE:** Specify overall color scheme and mood (warm sunset tones, cool blue twilight, desaturated noir, vibrant saturated, etc.)

9. **ABSOLUTELY FORBIDDEN:** NO text, words, letters, numbers, dates, dollar amounts, captions, titles, subtitles, watermarks, logos, signs with writing, typography, labels, charts, graphs, data visualization, statistics, on-screen text, speech bubbles, or ANY written content of ANY kind in the image. Images must be PURELY VISUAL with zero text elements.

10. **QUALITY MANDATE:** EVERY prompt must end with: "ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"

11. **VISUAL STORYTELLING:** Each scene must show a DIFFERENT moment, action, emotion, or perspective. Show what is HAPPENING in the story - not static posed portraits. If narration describes action, SHOW that action in progress.

12. **PROMPT LENGTH:** Minimum 200 characters, ideal 300-400 characters for premium quality with full detail

13. **NEGATIVE ELEMENTS TO AVOID:** ${styleConfig.negative}`;

    const animationRules = `**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**ANIMATION PROMPT RULES:**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

1. **FRAME FORMAT:** Designed for ${orientationConfig.animation}

2. **MANDATORY ELEMENTS (include ALL of these):**
   - **Camera movement:** Direction (left, right, up, down, forward, backward, circular), speed (slow/medium/fast), arc/path (straight, curved, circular orbit)
   - **Atmospheric motion:** Wind, fog, clouds, dust particles, rain, snow, steam, smoke - something moving in the environment
   - **Subject micro-motion:** Subtle character movement (breathing, hair movement, clothing flutter, slight sway)
   - **Depth-of-field changes:** Focus pulling from foreground to background or vice versa
   - **Lighting transitions:** Subtle light changes, shadows moving, flickering, color temperature shifts

3. **EMOTIONAL MATCHING:** Animation movement must match the emotional tone of the scene (calm = slow gentle movements, intense = fast dynamic movements)

4. **VARIETY:** Each scene must have DIFFERENT camera movement type. Never repeat "slow push in" or "gentle pan right" multiple times in a row.

5. **SMOOTH vs KINETIC:** Specify movement quality - smooth fluid motion, kinetic jumpy energy, graceful glide, abrupt snap, etc.

Example: "Slow smooth dolly-in moving forward toward subject at 30% speed along straight path, gentle breeze moving hair and clothing, subject breathing subtly, shallow depth of field gradually sharpening from f/2.8 to f/4, warm golden hour light slowly intensifying"`;

    const narrationRules = `**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**NARRATION TEXT RULES — EXTREMELY CRITICAL:**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

1. **PURE SPOKEN WORDS ONLY:** narration_text contains ONLY the words that will be spoken by the voiceover narrator. Nothing else.

2. **ABSOLUTELY FORBIDDEN:** NO [SCENE:], [CUT TO:], [MUSIC:], [SOUND:], [SFX:], VOICEOVER:, Narrator:, V.O.:, Sound:, or ANY direction/label/tag/markup of any kind

3. **NO STAGE DIRECTIONS:** NO parenthetical directions like (pause), (dramatic), (whisper), (softly), (beat), (compelling), (urgent), etc.

4. **EXACT SCRIPT WORDS:** Use the EXACT words from the provided script segment. Do NOT:
   - Paraphrase or reword
   - Summarize or condense
   - Add your own words
   - Skip any words from the script

5. **COMPLETE COVERAGE:** Cover the FULL script segment assigned to this batch. Every sentence from the script must appear in EXACTLY ONE scene's narration. No duplicates, no omissions.

6. **OPTIMAL LENGTH:** Each scene = 15-40 words of narration (approximately 5-15 seconds of speech at normal pace)

7. **SENTENCE DISTRIBUTION:** Each complete sentence should appear in one scene only. Don't split sentences mid-thought unless absolutely necessary for timing.

8. **CLEAN DELIVERY:** The text should flow naturally when read aloud, with proper grammar and punctuation.

Example CORRECT narration_text: "The ancient fortress stood atop the windswept cliff, its weathered stones bearing witness to centuries of storms and sieges."

Example WRONG narration_text: "[SCENE: Fortress exterior] NARRATOR: The ancient fortress stood atop the windswept cliff (dramatic pause), its weathered stones bearing witness to centuries of storms and sieges. [MUSIC: Epic orchestral]"`;

    // ══════════════════════════════════════════════════════════════════
    // LOAD EXISTING CHARACTERS
    // ══════════════════════════════════════════════════════════════════
    let characters = [];
    if (project.character_descriptions) {
      try { 
        characters = JSON.parse(project.character_descriptions); 
      } catch (e) {
        console.warn('Failed to parse character descriptions:', e);
      }
    }

    const characterBlock = characters.length > 0
      ? `**ESTABLISHED CHARACTERS (copy FULL description every time they appear):**\n${characters.map(c => `• ${c.name}: ${c.description}`).join("\n")}`
      : "**NO CHARACTERS ESTABLISHED YET** - If characters appear in this segment, create detailed descriptions in the 'characters' array.";

    // Shot suggestions for variety
    const batchShotSuggestions = [];
    for (let i = 0; i < scenesForBatch; i++) {
      batchShotSuggestions.push(shotTypes[(sceneOffset + i) % shotTypes.length]);
    }

    // ══════════════════════════════════════════════════════════════════
    // BUILD GEMINI PROMPT
    // ══════════════════════════════════════════════════════════════════
    let prompt;

    if (currentBatch === 0) {
      prompt = `${examplePrompts}

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**YOUR MISSION: PREMIUM VIDEO PRODUCTION**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

You are an award-winning video production director working on a professional commercial video project. Your job is to break the provided narration script into cinematic visual scenes of the HIGHEST quality.

**PROJECT DETAILS:**
- Topic: "${project.name}"
- Niche: "${project.niche}"
- Visual Style: ${visualStyle}
- Format: ${orientationConfig.format} ${orientationConfig.directive}
- This is Part 1 of ${numBatches}
- Target: ${scenesForBatch} scenes for this batch

**NARRATION SCRIPT (Part 1 of ${numBatches}):**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${scriptChunks[0]}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**YOUR WORKFLOW:**

**STEP 1: CHARACTER IDENTIFICATION**
Read through the script segment. If any characters appear (people, animals, anthropomorphized objects), create detailed physical descriptions including:
- Exact age or age range
- Gender
- Ethnicity/race
- Hair: color, style, length, texture
- Facial hair: exact style (full beard, goatee, stubble, clean shaven)
- Eye color
- Build/physique/height
- Exact clothing with specific colors and style
- Distinguishing features (scars, tattoos, accessories, unique traits)

**STEP 2: SCENE SEGMENTATION**
Break the narration into ${scenesForBatch} separate visual scenes. Each scene should:
- Contain 15-40 words of narration (5-15 seconds of speech)
- Represent ONE distinct visual moment
- Cover a complete thought or sentence when possible
- Use EVERY word from the script exactly once (no skipping, no duplicates)

**STEP 3: PREMIUM IMAGE PROMPTS**
For each scene, write a detailed image prompt (300-400 characters) that includes:
- Style directive: "${styleConfig.positive}"
- Format directive: "${orientationConfig.directive}"
- Specific shot type from suggestions below
- Complete character descriptions if characters appear
- What is happening (action/event/moment being shown)
- Lighting: source, direction, quality, color temperature
- Environment/setting details with depth layers
- Color palette and mood
- Camera technical details (lens, focus, angle)
- Quality ending: "ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"

**STEP 4: CINEMATIC ANIMATION**
For each scene, write animation prompt including:
- Camera movement with direction and speed
- Atmospheric motion elements
- Subject micro-movements
- Depth of field changes
- Lighting transitions

**SUGGESTED SHOT TYPES** (use ONE per scene for maximum variety):
${batchShotSuggestions.map((shot, i) => `Scene ${i + 1}: ${shot}`).join('\n')}

**JSON RESPONSE FORMAT:**
{
  "characters": [
    {
      "name": "Character Full Name",
      "description": "Exact age, gender, ethnicity, hair color/style/length, facial hair details, eye color, build, exact clothing with colors, distinguishing features"
    }
  ],
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "Exact words from script with no labels or directions",
      "image_prompt": "${promptPrefix}. [shot type]. [detailed description]. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography",
      "animation_prompt": "[camera movement], [atmospheric motion], [subject motion], [depth changes], [lighting]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}

**SCENE VARIETY REQUIREMENTS:**
- Each scene = DIFFERENT visual moment (different action, angle, composition, lighting)
- Show what is HAPPENING in the story - active moments, not static portraits
- Alternate shot types: establishing, action, emotional close-ups, environmental, symbolic
- NEVER two consecutive scenes with same character in same pose/location
- Create a visually dynamic sequence that tells the story cinematically

**QUALITY CHECKLIST (verify each prompt has ALL of these):**
✓ Starts with full style directive
✓ Includes format directive (landscape/portrait)
✓ Specifies shot type from suggestions
✓ Complete character descriptions (no abbreviations)
✓ Detailed lighting (source + direction + quality)
✓ Environmental depth layers
✓ Camera technical details
✓ "NO text" rule stated
✓ Quality markers at end
✓ 200+ characters in length`;

    } else {
      // Continuation batch
      prompt = `${examplePrompts}

**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**CONTINUING PREMIUM VIDEO PRODUCTION**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

Continue breaking the narration script into cinematic visual scenes, maintaining consistency with established characters and style.

${characterBlock}

**PROJECT DETAILS:**
- Topic: "${project.name}"
- Niche: "${project.niche}"
- Visual Style: ${visualStyle}
- Format: ${orientationConfig.format} ${orientationConfig.directive}
- This is Part ${currentBatch + 1} of ${numBatches}
- Target: ${scenesForBatch} scenes, starting at scene ${sceneOffset + 1}

**NARRATION SCRIPT (Part ${currentBatch + 1} of ${numBatches}):**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${scriptChunks[currentBatch]}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**WORKFLOW:**

1. **MAINTAIN CHARACTER CONSISTENCY:** If established characters appear, copy their FULL descriptions exactly from above. Same appearance, same clothing (unless story dictates change).

2. **SCENE SEGMENTATION:** Break into ${scenesForBatch} scenes (15-40 words each) starting at scene ${sceneOffset + 1}. Use EVERY word from the script.

3. **PREMIUM IMAGE PROMPTS:** Each 300-400 characters including style, format, shot type, characters, action, lighting, environment, camera work, "NO text" rule, quality markers.

4. **CINEMATIC ANIMATION:** Camera movement, atmospheric elements, subject motion, depth changes, lighting transitions.

**SUGGESTED SHOT TYPES** (use ONE per scene for variety):
${batchShotSuggestions.map((shot, i) => `Scene ${sceneOffset + i + 1}: ${shot}`).join('\n')}

**JSON RESPONSE FORMAT:**
{
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1},
      "narration_text": "Exact words from script",
      "image_prompt": "${promptPrefix}. [shot type]. [detailed description]. ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography",
      "animation_prompt": "[camera movement], [atmospheric motion], [subject motion], [depth changes], [lighting]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}

**CONTINUITY & VARIETY:**
- Continuing from scene ${sceneOffset} - maintain visual coherence
- Each NEW scene = DIFFERENT moment (action, angle, composition)
- Vary shot types using suggestions above
- Show story progression through changing visuals
- Balance consistency (characters/style) with variety (compositions/moments)

**QUALITY CHECKLIST:**
✓ Style directive ✓ Format directive ✓ Shot type ✓ Character details
✓ Lighting details ✓ Environmental depth ✓ Camera specs ✓ "NO text" rule
✓ Quality markers ✓ 200+ characters`;
    }

    // ══════════════════════════════════════════════════════════════════
    // CALL GEMINI
    // ══════════════════════════════════════════════════════════════════
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 Batch ${currentBatch + 1}/${numBatches}`);
    console.log(`📍 Generating scenes ${sceneOffset + 1}-${sceneOffset + scenesForBatch}`);
    console.log(`🎨 Style: ${visualStyle}`);
    console.log(`📐 Format: ${orientationConfig.format}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const result = await callGemini(prompt, 0.6);

    // Save characters on first batch
    if (currentBatch === 0 && result.characters && result.characters.length > 0) {
      console.log(`✓ Characters identified: ${result.characters.map(c => c.name).join(', ')}`);
      await base44.asServiceRole.entities.Projects.update(project_id, {
        character_descriptions: JSON.stringify(result.characters),
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // VALIDATE & SAVE SCENES WITH PREMIUM QUALITY ENFORCEMENT
    // ══════════════════════════════════════════════════════════════════
    let scenesCreated = 0;
    let qualityWarnings = 0;

    if (result.scenes) {
      for (const scene of result.scenes) {
        const sceneNum = sceneOffset + scenesCreated + 1;

        // Clean narration
        const cleanedNarration = cleanNarrationText(scene.narration_text);

        // Validate and enhance image prompt
        let imagePrompt = scene.image_prompt || "";
        const enhancedPrompt = validateAndEnhancePrompt(
          imagePrompt,
          styleConfig,
          orientationConfig,
          sceneNum
        );

        if (enhancedPrompt !== imagePrompt) {
          qualityWarnings++;
          console.warn(`⚠️  Scene ${sceneNum} prompt was enhanced/corrected`);
        }

        // Final quality check
        const finalQualityScore = {
          hasStyle: enhancedPrompt.toLowerCase().includes(styleConfig.positive.substring(0, 30).toLowerCase()),
          hasOrientation: enhancedPrompt.includes(orientationConfig.directive.substring(0, 20)),
          hasNoText: enhancedPrompt.toLowerCase().includes('no text'),
          hasQuality: enhancedPrompt.toLowerCase().includes('masterpiece') || enhancedPrompt.toLowerCase().includes('8k'),
          minLength: enhancedPrompt.length >= 150,
          hasLighting: /\b(light|lighting|sun|lamp|glow)\b/i.test(enhancedPrompt),
          hasCamera: /\b(shot|angle|lens|camera|focus)\b/i.test(enhancedPrompt)
        };

        const qualityPoints = Object.values(finalQualityScore).filter(Boolean).length;
        const qualityPercentage = Math.round((qualityPoints / 7) * 100);

        console.log(`Scene ${sceneNum}: ${qualityPercentage}% quality score (${qualityPoints}/7 checks) | ${enhancedPrompt.length} chars`);

        await base44.asServiceRole.entities.Scenes.create({
          project_id,
          scene_number: sceneNum,
          narration_text: cleanedNarration,
          image_prompt: enhancedPrompt,
          animation_prompt: scene.animation_prompt || "slow gentle camera movement forward, atmospheric haze, subtle subject breathing, shallow depth of field",
          duration_seconds: scene.duration_seconds || 8,
          status: "prompts_ready"
        });
        
        scenesCreated++;
      }
    }

    const totalScenesNow = sceneOffset + scenesCreated;
    const isDone = (currentBatch + 1) >= scriptChunks.length || totalScenesNow >= totalTargetScenes;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Batch ${currentBatch + 1} complete`);
    console.log(`📊 Created: ${scenesCreated} scenes | Total: ${totalScenesNow}/${totalTargetScenes}`);
    if (qualityWarnings > 0) {
      console.log(`⚠️  Quality warnings: ${qualityWarnings} prompts enhanced`);
    }
    console.log(`${isDone ? '🎉 ALL SCENES GENERATED!' : '⏭️  More batches remaining'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true, 
      done: isDone,
      batch_completed: currentBatch, 
      scenes_created: scenesCreated,
      total_scenes: totalScenesNow, 
      total_target: totalTargetScenes, 
      total_batches: numBatches,
      quality_warnings: qualityWarnings
    });

  } catch (error) {
    console.error("❌ generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});