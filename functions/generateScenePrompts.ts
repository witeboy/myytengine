import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE PROMPT GENERATOR (v2)
// ══════════════════════════════════════════════════════════════════
// PURPOSE: Converts directorial scene breakdowns into image/animation prompts.
// INPUT:   Scenes with status "breakdown_ready" + scene_blueprint on Project
// OUTPUT:  Scenes updated with image_prompt + animation_prompt, status → "prompts_ready"
//
// Pipeline: Script → Scene Breakdown → [THIS FUNCTION] → Image Gen → Animation
// ══════════════════════════════════════════════════════════════════

const BATCH_SIZE = 12; // Scenes per Gemini call

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
        if (parsed.prompts && Array.isArray(parsed.prompts)) {
          console.log(`Recovered ${parsed.prompts.length} prompts from truncated JSON`);
          return parsed;
        }
      } catch (_) {}
    }
    throw new Error("Failed to parse Gemini JSON response after recovery attempts");
  }
}

// ══════════════════════════════════════════════════════════════════
// PREMIUM VISUAL STYLE MAPPING
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
  anime: {
    positive: "High-quality anime illustration combining Studio Ghibli's whimsy with modern anime aesthetic, vibrant saturated colors with rich tones, clean precise linework with consistent line weight, cel-shaded with soft airbrushed gradients, expressive detailed eyes with multiple highlights and reflections, detailed hair strands with natural flow and movement, colorful detailed background art with atmospheric perspective, well-composed manga panel layout with rule of thirds, professional anime production quality like top-tier seasonal anime",
    negative: "photorealistic, live action, photograph, 3D render, western cartoon style, rough sketch, amateur coloring, flat backgrounds, inconsistent art style, off-model characters, poorly drawn anatomy, rushed animation, low budget anime, chibi, super deformed"
  }
};

// ══════════════════════════════════════════════════════════════════
// PROMPT QUALITY VALIDATION
// ══════════════════════════════════════════════════════════════════
function validateAndEnhancePrompt(imagePrompt, styleConfig, orientationConfig, sceneNumber) {
  let enhanced = imagePrompt;
  const issues = [];

  // Enforce correct Fal.ai dimensions
  const falDimension = orientationConfig.format === 'portrait' ? '832x1248' : '1216x832';
  const wrongDimensions = orientationConfig.format === 'portrait'
    ? ['720x1280', '720×1280', '1080x1920', '1024x1792', '1280x720', '1216x832']
    : ['1280x720', '1280×720', '1920x1080', '1792x1024', '720x1280', '832x1248'];

  for (const wrong of wrongDimensions) {
    enhanced = enhanced.replace(new RegExp(wrong.replace('x', '[x×]'), 'g'), falDimension);
  }

  if (!enhanced.includes(falDimension)) {
    issues.push(`Scene ${sceneNumber}: Missing Fal.ai dimension ${falDimension}`);
    enhanced = `${falDimension} pixels. ${enhanced}`;
  }

  if (enhanced.length < 150) {
    issues.push(`Scene ${sceneNumber}: Prompt too short (${enhanced.length} chars)`);
  }

  const styleKeywords = styleConfig.positive.substring(0, 50).toLowerCase();
  if (!enhanced.toLowerCase().includes(styleKeywords.substring(0, 20))) {
    issues.push(`Scene ${sceneNumber}: Missing style directive`);
    enhanced = `${styleConfig.positive}, ${orientationConfig.directive}. ${enhanced}`;
  }

  if (orientationConfig.format === 'portrait') {
    if (!enhanced.toLowerCase().includes('portrait') && !enhanced.includes('9:16')) {
      issues.push(`Scene ${sceneNumber}: Missing portrait orientation`);
      enhanced = enhanced.replace(/landscape|horizontal|16:?9/gi, '');
      if (!enhanced.includes(orientationConfig.directive)) {
        enhanced = `${orientationConfig.directive}. ${enhanced}`;
      }
    }
  } else {
    if (!enhanced.toLowerCase().includes('landscape') && !enhanced.includes('16:9')) {
      issues.push(`Scene ${sceneNumber}: Missing landscape orientation`);
      enhanced = enhanced.replace(/portrait|vertical|9:?16/gi, '');
      if (!enhanced.includes(orientationConfig.directive)) {
        enhanced = `${orientationConfig.directive}. ${enhanced}`;
      }
    }
  }

  if (!enhanced.toLowerCase().includes('no text')) {
    issues.push(`Scene ${sceneNumber}: Missing "no text" rule`);
    enhanced += ', ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image';
  }

  const hasQuality = /masterpiece|professional|8k|award/i.test(enhanced);
  if (!hasQuality) {
    issues.push(`Scene ${sceneNumber}: Missing quality markers`);
    enhanced += ', masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography';
  }

  if (issues.length > 0) {
    console.warn(`Prompt quality issues:\n${issues.join('\n')}`);
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

    // ── Fetch project ──────────────────────────────────────────────
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ── Load blueprint ─────────────────────────────────────────────
    let blueprint;
    try {
      blueprint = JSON.parse(project.scene_blueprint);
    } catch (e) {
      return Response.json({
        error: 'Scene blueprint not found. Run scene breakdown first.'
      }, { status: 400 });
    }

    const storyAnalysis = blueprint.story_analysis;

    // ── Fetch scenes that need prompts ─────────────────────────────
    const allScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    const pendingScenes = allScenes
      .filter(s => s.status === 'breakdown_ready')
      .sort((a, b) => a.scene_number - b.scene_number);

    if (pendingScenes.length === 0) {
      return Response.json({
        success: true,
        done: true,
        message: 'All scenes already have prompts.',
        total_scenes: allScenes.length
      });
    }

    // ── Batch the pending scenes ───────────────────────────────────
    const totalBatches = Math.ceil(pendingScenes.length / BATCH_SIZE);
    const batchScenes = pendingScenes.slice(
      currentBatch * BATCH_SIZE,
      (currentBatch + 1) * BATCH_SIZE
    );

    if (batchScenes.length === 0) {
      return Response.json({
        success: true,
        done: true,
        total_scenes: allScenes.length,
        total_batches: totalBatches
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
        directive: "PORTRAIT VERTICAL 9:16 format, 832x1248 pixels, tall vertical framing",
        composition: "Compose for VERTICAL 9:16 mobile frame: use tall vertical compositions with strong vertical leading lines, center subjects in the vertical frame with headroom and foot room, close-up and medium shots work best for vertical format, use vertical depth with foreground/midground/background elements stacked vertically, avoid wide horizontal elements that get cropped",
        animation: "vertical 9:16 smartphone frame — prefer tilt up/down camera movements, vertical reveals and wipes, close-up push-ins and pull-outs, vertical parallax scrolling effects, portrait-oriented motion",
        dimensions: { width: 832, height: 1248 }
      };
    } else {
      orientationConfig = {
        format: 'landscape',
        directive: "LANDSCAPE HORIZONTAL 16:9 widescreen format, 1216x832 pixels, wide cinematic framing, fill entire frame edge to edge",
        composition: "Compose for WIDESCREEN 16:9 cinematic frame: use wide establishing shots with panoramic depth, apply rule of thirds with subjects placed left/right for negative space, utilize horizontal leading lines and lateral composition, create depth with foreground/midground/background layers spread horizontally, embrace wide cinematic framing with breathing room on sides",
        animation: "widescreen 16:9 cinematic frame — prefer horizontal pans and tracking shots, dolly movements forward/backward, wide-angle crane shots, lateral parallax with depth, horizontal reveals and wipes",
        dimensions: { width: 1216, height: 832 }
      };
    }

    const promptPrefix = `${styleConfig.positive}, ${orientationConfig.directive}`;

    // ── Load characters ────────────────────────────────────────────
    let characters = [];
    if (project.character_descriptions) {
      try { characters = JSON.parse(project.character_descriptions); } catch (_) {}
    }

    const characterBlock = characters.length > 0
      ? `**ESTABLISHED CHARACTERS (embed FULL physical description into every prompt where they appear):**\n${characters.map(c => `• ${c.name}: ${c.visual_description || c.description}`).join('\n')}`
      : '';

    // ── Build the directorial data for this batch ──────────────────
    const scenesWithDirectorNotes = batchScenes.map(scene => {
      // Find matching blueprint data
      const blueprintScene = blueprint.scenes.find(b => b.scene_number === scene.scene_number);
      return {
        scene_number: scene.scene_number,
        scene_id: scene.id,
        narration_text: scene.narration_text,
        director: blueprintScene || null
      };
    });

    // ── Build Gemini prompt ────────────────────────────────────────
    const sceneDirections = scenesWithDirectorNotes.map(s => {
      if (!s.director) {
        return `Scene ${s.scene_number}: (No director notes — generate based on narration)
  Narration: "${s.narration_text}"`;
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
  Depth of Field: ${s.director.depth_of_field}
  Niche Visual Element: ${s.director.niche_visual_element || 'N/A'}
  Continuity Bridge: ${s.director.continuity_bridge || 'N/A'}
  Emotional Intensity: ${s.director.emotional_intensity || 0.5}`;
    }).join('\n\n');

    const prompt = `
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**MISSION: Convert Director's Scene Notes into Production-Ready Image & Animation Prompts**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

You are a visual effects supervisor translating a director's vision into precise technical prompts for AI image generation.

**STORY CONTEXT:**
- Topic: "${project.name}"
- Central Theme: ${storyAnalysis.central_theme}
- Visual World: ${storyAnalysis.visual_world}
- Color Arc: ${storyAnalysis.color_arc}
- Recurring Motifs: ${JSON.stringify(storyAnalysis.recurring_visual_motifs)}

${characterBlock}

**VISUAL STYLE:** ${visualStyle}
**ORIENTATION:** ${orientationConfig.format} (${orientationConfig.directive})

**━━━━ DIRECTOR'S SCENE NOTES ━━━━**

${sceneDirections}

**━━━━ YOUR TASK ━━━━**

For EACH scene above, produce:

1. **image_prompt** — A single, dense, technical prompt for AI image generation. Rules:
   - MUST begin with: "${promptPrefix}."
   - Translate the director's visual concept into a SPECIFIC, DETAILED image description (300+ chars)
   - Embed the exact shot type, camera angle, and depth of field from the director's notes
   - Embed the exact lighting setup described
   - Apply the color palette as color grading direction
   - If characters appear, embed their FULL physical description inline (not just their name)
   - ${orientationConfig.composition}
   - ABSOLUTELY FORBIDDEN: Any text, words, letters, numbers, charts, graphs, signs, or readable content
   - Transform any abstract concepts into PHYSICAL VISUAL METAPHORS:
     * Financial decline → hourglass with last grains falling
     * Loneliness → single place setting at a table for six
     * Hope → first crack of light through dark curtains
     * Burden → heavy chains on weathered hands
   - If documents must appear: ONLY blurred with emotional context (worried hands, scattered pages, red ink stains)
   - MUST end with: "ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"

2. **animation_prompt** — Motion direction for 8-second video animation. Rules:
   - Translate the director's camera_movement into animation language
   - Frame format: ${orientationConfig.animation}
   - Include: camera movement direction + speed, atmospheric motion (particles, fog, light shifts), subject micro-motion (breathing, hair, fabric), depth of field changes
   - Match the emotional intensity: low intensity = slow/subtle, high intensity = dynamic/dramatic
   - Create smooth motion that doesn't distract from narration

**RESPONSE FORMAT:**
{
  "prompts": [
    {
      "scene_number": 1,
      "image_prompt": "${promptPrefix}. [full detailed prompt]... ABSOLUTELY NO text... masterpiece quality...",
      "animation_prompt": "[detailed animation direction]"
    }
  ]
}

**QUALITY CHECKLIST (verify EACH prompt):**
✓ Begins with style prefix? 
✓ 300+ characters?
✓ Specific shot type embedded?
✓ Lighting described technically?
✓ Color palette applied?
✓ Characters fully described (not just named)?
✓ No text/words/numbers in the image?
✓ Ends with quality markers?
✓ Abstract concepts converted to physical metaphors?
✓ Animation matches emotional intensity?
`;

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎨 PROMPT GENERATION — Batch ${currentBatch + 1}/${totalBatches}`);
    console.log(`📍 Converting scenes ${batchScenes[0].scene_number}-${batchScenes[batchScenes.length - 1].scene_number}`);
    console.log(`🖼️ Style: ${visualStyle} | 📐 Orientation: ${orientation}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const result = await callGemini(prompt, 0.7);

    // ── Update scenes with generated prompts ───────────────────────
    let promptsApplied = 0;
    let qualityWarnings = 0;

    if (result.prompts && Array.isArray(result.prompts)) {
      for (const generated of result.prompts) {
        // Find the matching scene from our batch
        const matchingScene = scenesWithDirectorNotes.find(
          s => s.scene_number === generated.scene_number
        );

        if (!matchingScene) {
          console.warn(`⚠️ Generated prompt for scene ${generated.scene_number} has no matching scene in batch`);
          continue;
        }

        // Validate and enhance the image prompt
        let imagePrompt = generated.image_prompt || "";
        const enhancedPrompt = validateAndEnhancePrompt(
          imagePrompt,
          styleConfig,
          orientationConfig,
          generated.scene_number
        );

        if (enhancedPrompt !== imagePrompt) {
          qualityWarnings++;
          console.warn(`⚠️ Scene ${generated.scene_number} prompt was enhanced/corrected`);
        }

        const animationPrompt = generated.animation_prompt
          || "slow gentle camera movement forward, atmospheric haze, subtle subject breathing, shallow depth of field";

        // Update the scene record
        await base44.asServiceRole.entities.Scenes.update(matchingScene.scene_id, {
          image_prompt: enhancedPrompt,
          animation_prompt: animationPrompt,
          status: "prompts_ready"
        });

        promptsApplied++;
      }
    }

    // ── Handle any scenes that didn't get prompts (safety net) ─────
    for (const s of scenesWithDirectorNotes) {
      const wasProcessed = result.prompts?.some(p => p.scene_number === s.scene_number);
      if (!wasProcessed) {
        console.warn(`⚠️ Scene ${s.scene_number} missing from Gemini response — generating fallback`);

        const director = s.director;
        let fallbackPrompt = `${promptPrefix}. `;

        if (director) {
          fallbackPrompt += `${director.shot_type}. ${director.visual_concept}. `;
          fallbackPrompt += `${director.lighting}. Color palette: ${director.color_palette}. `;
          fallbackPrompt += `${director.depth_of_field}. Mood: ${director.mood}. `;
        } else {
          fallbackPrompt += `Cinematic scene depicting the narration. Professional composition. `;
        }

        fallbackPrompt += 'ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography';

        const enhancedFallback = validateAndEnhancePrompt(
          fallbackPrompt, styleConfig, orientationConfig, s.scene_number
        );

        await base44.asServiceRole.entities.Scenes.update(s.scene_id, {
          image_prompt: enhancedFallback,
          animation_prompt: director?.camera_movement
            || "slow gentle camera movement forward, atmospheric haze, subtle subject breathing, shallow depth of field",
          status: "prompts_ready"
        });

        promptsApplied++;
        qualityWarnings++;
      }
    }

    // ── Check completion ───────────────────────────────────────────
    const remainingAfterBatch = pendingScenes.length - batchScenes.length;
    const isDone = remainingAfterBatch <= 0 || (currentBatch + 1) >= totalBatches;

    if (isDone) {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "content_generation",
        current_step: 5
      });
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Prompt batch ${currentBatch + 1} complete`);
    console.log(`📊 Prompts applied: ${promptsApplied} | Remaining: ${remainingAfterBatch}`);
    if (qualityWarnings > 0) console.log(`⚠️ Quality warnings: ${qualityWarnings}`);
    console.log(`${isDone ? '🎉 ALL PROMPTS GENERATED — Ready for image generation' : '⏭️ More batches remaining'}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      done: isDone,
      batch_completed: currentBatch,
      prompts_applied: promptsApplied,
      remaining_scenes: remainingAfterBatch,
      total_batches: totalBatches,
      quality_warnings: qualityWarnings
    });

  } catch (error) {
    console.error("❌ generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});