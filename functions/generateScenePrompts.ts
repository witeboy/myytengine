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
    const attempts = [
      trimmed + ']}',
      trimmed + '}]}',
      trimmed,
    ];
    for (const attempt of attempts) {
      try {
        const parsed = JSON.parse(attempt);
        if (parsed.scenes && Array.isArray(parsed.scenes)) {
          console.log(`Recovered ${parsed.scenes.length} scenes from truncated JSON`);
          return parsed;
        }
      } catch (_) { /* try next */ }
    }
    throw new Error("Failed to parse Gemini JSON response after recovery attempts");
  }
}

// Split script into roughly equal chunks by sentence boundaries
function splitScriptIntoChunks(script, numChunks) {
  const sentences = script.match(/[^.!?]+[.!?]+[\s]*/g) || [script];
  const sentencesPerChunk = Math.ceil(sentences.length / numChunks);
  const chunks = [];
  
  for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
    const chunkSentences = sentences.slice(i, i + sentencesPerChunk);
    chunks.push(chunkSentences.join('').trim());
  }
  
  return chunks;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, batch_index } = await req.json();
    const currentBatch = batch_index || 0;

    // Get project and script
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = scripts.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
    if (!script?.full_script) return Response.json({ error: 'No script found' }, { status: 400 });

    // ── VISUAL STYLE MAPPING ──
    const styleMap = {
      cinematic_realistic: "Cinematic realistic film still, dramatic lighting, shallow depth of field, Hollywood production quality, moody atmosphere, anamorphic lens feel",
      photorealistic_4k: "Ultra-photorealistic 4K photography, sharp detail, natural lighting, DSLR quality, editorial photo, professional color grading",
      cinematic_anime: "Cinematic anime style, dramatic lighting and composition, detailed anime illustration with film-like framing, Makoto Shinkai inspired, wide cinematic framing",
      anime: "Anime illustration style, vibrant colors, clean linework, expressive characters, manga-influenced, detailed anime art",
      cartoon_2d: "2D cartoon style, flat colors, bold outlines, playful and colorful, animated series quality, clean vector-like illustration",
      picstory_cocomelon: "3D rendered children's animation style like Cocomelon/PicStory, bright colors, soft rounded characters, cheerful and cute, Pixar-like rendering for kids",
      cinematic_picstory: "Cinematic 3D animation style like Pixar/DreamWorks, high-quality 3D rendering, dramatic lighting, expressive 3D characters, movie-quality CGI",
      oil_painting: "Classical oil painting style, rich textures, visible brushstrokes, Renaissance-inspired composition, warm color palette, museum-quality artwork, wide canvas format",
      watercolor: "Soft watercolor illustration, gentle color washes, delicate details, dreamy and ethereal atmosphere, artistic illustration",
      comic_book: "Bold comic book style, strong ink outlines, halftone dot shading, dynamic panel composition, vibrant saturated colors, graphic novel quality",
    };

    const visualStyle = project.visual_style || 'cinematic_realistic';
    const styleDirective = styleMap[visualStyle] || styleMap.cinematic_realistic;

    // ── ORIENTATION / ASPECT RATIO ──
    const orientation = project.orientation || 'landscape';
    let orientationDirective, compositionGuide, animationFramingGuide;

    if (orientation === 'portrait') {
      orientationDirective = "PORTRAIT 9:16 vertical format (720x1280)";
      compositionGuide = "Compose for VERTICAL 9:16 frame: use tall compositions, center subjects vertically, emphasize height and vertical depth, close-up and medium shots work best, stack visual elements top-to-bottom, leave space for text overlays at top and bottom.";
      animationFramingGuide = "vertical 9:16 frame — prefer tilt up/down movements, vertical reveals, close-up push-ins, and vertical parallax.";
    } else {
      orientationDirective = "LANDSCAPE 16:9 widescreen horizontal format (1280x720)";
      compositionGuide = "Compose for WIDESCREEN 16:9 frame: use wide establishing shots, place subjects using rule-of-thirds horizontally, emphasize panoramic depth and horizontal scope, use negative space on sides for cinematic feel, wide and medium-wide shots work best, leverage the full width for environmental storytelling.";
      animationFramingGuide = "widescreen 16:9 frame — prefer horizontal pans, dolly movements, wide-angle tracking shots, and lateral parallax depth.";
    }

    const promptPrefix = `${styleDirective}, ${orientationDirective}`;

    const fullScript = script.full_script;
    const wordCount = fullScript.split(/\s+/).length;
    
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    const totalTargetScenes = Math.max(5, Math.round(durationMinutes * 60 / 8));
    const SCENES_PER_BATCH = 10;
    const numBatches = Math.ceil(totalTargetScenes / SCENES_PER_BATCH);

    // Split script into chunks
    const scriptChunks = splitScriptIntoChunks(fullScript, numBatches);

    // ── FIRST BATCH: delete old scenes, extract characters ──
    if (currentBatch === 0) {
      // Delete old scenes
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      for (const s of oldScenes) {
        await base44.asServiceRole.entities.Scenes.delete(s.id);
      }

      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "content_generation",
        current_step: 5
      });
    }

    // Count existing scenes to determine scene numbering offset
    const existingScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    const sceneOffset = existingScenes.length;

    // Check if we've already generated enough scenes
    if (currentBatch >= scriptChunks.length || sceneOffset >= totalTargetScenes) {
      return Response.json({ 
        success: true, 
        done: true, 
        scene_count: sceneOffset,
        total_batches: numBatches
      });
    }

    const scenesForBatch = Math.min(SCENES_PER_BATCH, totalTargetScenes - sceneOffset);

    // ── SHARED RULES ──
    const imageRules = `**CRITICAL IMAGE PROMPT RULES:**
1. EVERY image_prompt MUST begin with EXACTLY this prefix: "${promptPrefix}."
2. ${compositionGuide}
3. When ANY character appears in a scene, you MUST COPY-PASTE their COMPLETE character description into the image_prompt. Do NOT abbreviate, summarize, or paraphrase. Include EVERY detail: age, ethnicity, hair, facial hair, clothing, build, features.
4. FACIAL HAIR IS CRITICAL: If a character has a beard, EVERY scene must include the exact beard description. If clean-shaven, EVERY scene must say "clean-shaven".
5. Characters wear the EXACT SAME clothing and have the EXACT SAME appearance across ALL scenes unless the story explicitly says otherwise.
6. Include specific lighting direction, color palette, and atmosphere in every prompt.
7. NEVER use generic descriptions like "a man" or "a woman" — always use the full character description block.
8. End each image_prompt with: "masterpiece, highly detailed, 8K, professional composition"
9. NO text, watermarks, signatures, or UI elements in the image.`;

    const animationRules = `**CRITICAL ANIMATION PROMPT RULES:**
1. Every animation_prompt must be designed for ${animationFramingGuide}
2. Include ALL of these: specific camera movement (direction, speed, arc type), atmospheric motion (particles, fog, light rays, weather), subject micro-motion (breathing, hair sway, fabric, blinking), depth-of-field shifts, and lighting transitions.
3. Match emotional arc: tension = slow creeping zoom; revelation = dramatic pull-back; calm = gentle floating dolly; action = quick tracking.`;

    const narrationRules = `**NARRATION RULES:**
- narration_text must be the EXACT words from the script — do NOT modify, summarize, or paraphrase.
- Each scene = 5-15 seconds of narration (~15-40 words per scene).
- Cover the FULL narration segment — do NOT skip any words.`;

    // ── BUILD PROMPT BASED ON BATCH ──
    let characters = [];
    
    // Try to load existing character descriptions from project
    if (project.character_descriptions) {
      try {
        characters = JSON.parse(project.character_descriptions);
      } catch (_) {}
    }

    const characterBlock = characters.length > 0
      ? characters.map(c => `[${c.name}: ${c.description}]`).join("\n")
      : "";

    let prompt;

    if (currentBatch === 0) {
      // First batch: extract characters + generate scenes
      prompt = `You are a world-class video production director and cinematographer. You are given a narration script segment. Your job is to:

1. FIRST, identify ALL KEY CHARACTERS in the story and write extremely detailed, locked-in character descriptions
2. Break this narration segment into individual scenes
3. For each scene, write a detailed AI image generation prompt optimized for ${orientationDirective}
4. For each scene, write a cinematic animation/motion prompt

**Narration Script Segment (Part 1 of ${numBatches}):**
"""
${scriptChunks[0]}
"""

**Topic context**: "${project.name}" in the "${project.niche}" niche

**MANDATORY VISUAL STYLE**: ${styleDirective}
**MANDATORY FORMAT**: ${orientationDirective}

**TARGET: approximately ${scenesForBatch} scenes for this segment.**

Return JSON:
{
  "characters": [
    {"name": "Character Name", "description": "Extremely detailed physical description: exact age, gender, ethnicity, hair color/style/length, specific facial hair, facial features, body build, exact clothing, distinguishing features. Be MAXIMALLY specific."}
  ],
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "The exact narration text...",
      "image_prompt": "${promptPrefix}. [scene description]. masterpiece, highly detailed, 8K, professional composition",
      "animation_prompt": "For ${animationFramingGuide}: [motion description]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}

**CONTINUITY RULES:**
- Use consistent color grading across all prompts.
- Maintain consistent time-of-day and weather across related scenes.`;

    } else {
      // Subsequent batches: use established characters
      prompt = `You are a world-class video production director continuing to break a narration script into scenes.

**ESTABLISHED CHARACTERS (COPY-PASTE these EXACT full descriptions whenever a character appears — NEVER abbreviate):**
${characterBlock}

**Narration Script Segment (Part ${currentBatch + 1} of ${numBatches}):**
"""
${scriptChunks[currentBatch]}
"""

**Topic context**: "${project.name}" in the "${project.niche}" niche

**MANDATORY VISUAL STYLE**: ${styleDirective}
**MANDATORY FORMAT**: ${orientationDirective}

**TARGET: approximately ${scenesForBatch} scenes for this segment.**
**START scene_number at: ${sceneOffset + 1}**

Return JSON:
{
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1},
      "narration_text": "The exact narration text...",
      "image_prompt": "${promptPrefix}. [scene description]. masterpiece, highly detailed, 8K, professional composition",
      "animation_prompt": "For ${animationFramingGuide}: [motion description]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}

**CONTINUITY:**
- These scenes continue from scene ${sceneOffset}. Maintain consistent color grading, time-of-day, weather, and environment.`;
    }

    // ── CALL GEMINI ──
    console.log(`Batch ${currentBatch + 1}/${numBatches}: generating scenes ${sceneOffset + 1}+ (target: ${scenesForBatch} scenes)...`);
    const result = await callGemini(prompt, 0.6);

    // Save characters on first batch
    if (currentBatch === 0 && result.characters && result.characters.length > 0) {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        character_descriptions: JSON.stringify(result.characters),
      });
    }

    // Save scenes
    let scenesCreated = 0;
    if (result.scenes) {
      for (const scene of result.scenes) {
        const sceneNum = sceneOffset + scenesCreated + 1;
        await base44.asServiceRole.entities.Scenes.create({
          project_id,
          scene_number: sceneNum,
          narration_text: scene.narration_text,
          image_prompt: scene.image_prompt,
          animation_prompt: scene.animation_prompt,
          duration_seconds: scene.duration_seconds || 8,
          status: "prompts_ready"
        });
        scenesCreated++;
      }
    }

    const totalScenesNow = sceneOffset + scenesCreated;
    const isDone = (currentBatch + 1) >= scriptChunks.length || totalScenesNow >= totalTargetScenes;

    console.log(`Batch ${currentBatch + 1} complete: ${scenesCreated} scenes (total: ${totalScenesNow}/${totalTargetScenes}) ${isDone ? '✓ DONE' : ''}`);

    return Response.json({ 
      success: true, 
      done: isDone,
      batch_completed: currentBatch,
      scenes_created: scenesCreated,
      total_scenes: totalScenesNow,
      total_target: totalTargetScenes,
      total_batches: numBatches
    });
  } catch (error) {
    console.error("generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});