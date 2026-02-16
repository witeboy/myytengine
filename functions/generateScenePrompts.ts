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

    const { project_id } = await req.json();

    // Get project and script
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = scripts.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
    if (!script?.full_script) return Response.json({ error: 'No script found' }, { status: 400 });

    // Delete old scenes
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    for (const s of oldScenes) {
      await base44.asServiceRole.entities.Scenes.delete(s.id);
    }

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

    // ── COMBINED STYLE + ORIENTATION PREFIX (every image prompt must start with this) ──
    const promptPrefix = `${styleDirective}, ${orientationDirective}`;

    const fullScript = script.full_script;
    const wordCount = fullScript.split(/\s+/).length;
    
    // Use video duration for scene count: 1 scene per ~8 seconds
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    const totalTargetScenes = Math.max(5, Math.round(durationMinutes * 60 / 8));
    
    // Each batch handles ~10 scenes to stay safely within Gemini's 16k output token limit
    const SCENES_PER_BATCH = 10;
    const numBatches = Math.ceil(totalTargetScenes / SCENES_PER_BATCH);
    
    console.log(`Script: ${wordCount} words → ${totalTargetScenes} target scenes in ${numBatches} batch(es) [${orientation}]`);

    // Split script into chunks for each batch
    const scriptChunks = splitScriptIntoChunks(fullScript, numBatches);

    // ── SHARED RULES BLOCK (used in all batches) ──
    const imageRules = `**CRITICAL IMAGE PROMPT RULES:**
1. EVERY image_prompt MUST begin with EXACTLY this prefix: "${promptPrefix}."
2. ${compositionGuide}
3. When ANY character appears in a scene, you MUST COPY-PASTE their COMPLETE character description into the image_prompt. Do NOT abbreviate, summarize, or paraphrase. Include EVERY detail: age, ethnicity, hair, facial hair, clothing, build, features. This is the #1 most important rule.
4. FACIAL HAIR IS CRITICAL: If a character has a beard, EVERY scene must include the exact beard description. If clean-shaven, EVERY scene must say "clean-shaven". Never omit facial hair.
5. Characters wear the EXACT SAME clothing and have the EXACT SAME appearance across ALL scenes unless the story explicitly says otherwise.
6. Include specific lighting direction (e.g. "warm golden rim light from upper left"), color palette (e.g. "muted earth tones with amber highlights"), and atmosphere (e.g. "soft morning haze", "dust particles in air").
7. NEVER use generic descriptions like "a man" or "a woman" — always use the full character description block.
8. End each image_prompt with: "masterpiece, highly detailed, 8K, professional composition"
9. NO text, watermarks, signatures, or UI elements in the image.`;

    const animationRules = `**CRITICAL ANIMATION PROMPT RULES:**
1. Every animation_prompt must be designed for ${animationFramingGuide}
2. Include ALL of these: specific camera movement (direction, speed, arc type), atmospheric motion (particles, fog, light rays, weather), subject micro-motion (breathing, hair sway, fabric, blinking), depth-of-field shifts (rack focus, bokeh changes), and lighting transitions.
3. Match emotional arc: tension = slow creeping zoom tight framing; revelation = dramatic pull-back wide angle; calm = gentle floating dolly soft bokeh; action = quick tracking dynamic angles.
4. Avoid jarring or unrealistic movements. Keep it smooth and cinematic.`;

    const narrationRules = `**NARRATION RULES:**
- narration_text must be the EXACT words from the script — do NOT modify, summarize, or paraphrase.
- Each scene = 5-15 seconds of narration (roughly 15-40 words per scene).
- Cover the FULL narration segment — do NOT skip any words from the script.`;

    const continuityRules = `**CONTINUITY RULES:**
- Use consistent color grading language across all prompts.
- Maintain consistent time-of-day and weather across related scenes.
- Scenes should feel like sequential frames from a single cinematic production.`;

    // ── BATCH 1: Extract characters + first batch of scenes ──
    let characters = [];
    const allScenes = [];
    let sceneOffset = 0;

    const firstChunkPrompt = `You are a world-class video production director and cinematographer. You are given a narration script segment (voiceover text only). Your job is to:

1. FIRST, identify ALL KEY CHARACTERS in the story and write extremely detailed, locked-in character descriptions
2. Break this narration segment into individual scenes (each scene = one visual moment)
3. For each scene, write a detailed AI image generation prompt optimized for ${orientationDirective}
4. For each scene, write a cinematic animation/motion prompt optimized for ${animationFramingGuide}

**Narration Script Segment (Part 1 of ${numBatches}):**
"""
${scriptChunks[0]}
"""

**Topic context**: "${project.name}" in the "${project.niche}" niche

**MANDATORY VISUAL STYLE**: ${styleDirective}
**MANDATORY FORMAT**: ${orientationDirective}

**TARGET: approximately ${Math.min(SCENES_PER_BATCH, totalTargetScenes)} scenes for this segment.**

Return JSON:
{
  "characters": [
    {"name": "Character Name", "description": "Extremely detailed physical description: exact age (e.g. 45-year-old), gender, ethnicity, hair color AND style AND length (e.g. dark brown short wavy hair), specific facial hair (e.g. full thick dark beard and mustache OR clean-shaven — be exact), facial features (eye color, nose shape, jaw), body build, exact clothing (e.g. dark charcoal wool three-piece suit with white collar shirt and dark tie), distinguishing features (scars, glasses, etc.). Be MAXIMALLY specific."}
  ],
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "The exact narration text for this scene...",
      "image_prompt": "${promptPrefix}. [detailed scene composition and character descriptions here]. masterpiece, highly detailed, 8K, professional composition",
      "animation_prompt": "For ${animationFramingGuide}: [detailed camera and motion description]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}

${continuityRules}`;

    console.log("Batch 1: extracting characters + scenes...");
    const firstResult = await callGemini(firstChunkPrompt, 0.6);

    if (firstResult.characters && firstResult.characters.length > 0) {
      characters = firstResult.characters;
      await base44.asServiceRole.entities.Projects.update(project_id, {
        character_descriptions: JSON.stringify(characters),
      });
    }

    if (firstResult.scenes) {
      for (const scene of firstResult.scenes) {
        const sceneNum = allScenes.length + 1;
        allScenes.push({ ...scene, scene_number: sceneNum });
        
        await base44.asServiceRole.entities.Scenes.create({
          project_id,
          scene_number: sceneNum,
          narration_text: scene.narration_text,
          image_prompt: scene.image_prompt,
          animation_prompt: scene.animation_prompt,
          duration_seconds: scene.duration_seconds || 8,
          status: "prompts_ready"
        });
      }
    }
    sceneOffset = allScenes.length;
    console.log(`Batch 1 complete: ${firstResult.scenes?.length || 0} scenes, ${characters.length} characters`);

    // ── SUBSEQUENT BATCHES: Use established characters ──
    const characterBlock = characters.length > 0
      ? characters.map(c => `[${c.name}: ${c.description}]`).join("\n")
      : "No named characters identified.";

    for (let b = 1; b < scriptChunks.length; b++) {
      const batchNum = b + 1;
      const scenesForBatch = Math.min(SCENES_PER_BATCH, totalTargetScenes - allScenes.length);
      
      if (scenesForBatch <= 0) break;

      const batchPrompt = `You are a world-class video production director continuing to break a narration script into scenes.

**ESTABLISHED CHARACTERS (COPY-PASTE these EXACT full descriptions whenever a character appears — NEVER abbreviate):**
${characterBlock}

**Narration Script Segment (Part ${batchNum} of ${numBatches}):**
"""
${scriptChunks[b]}
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
      "narration_text": "The exact narration text for this scene...",
      "image_prompt": "${promptPrefix}. [detailed scene composition and character descriptions here]. masterpiece, highly detailed, 8K, professional composition",
      "animation_prompt": "For ${animationFramingGuide}: [detailed camera and motion description]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}

**CONTINUITY:**
- These scenes continue from scene ${sceneOffset}. Maintain consistent color grading, time-of-day, weather, and environment details.
- Keep visual coherence with all previous scenes in this production.`;

      console.log(`Batch ${batchNum}/${scriptChunks.length}: generating scenes ${sceneOffset + 1}+...`);
      
      try {
        const batchResult = await callGemini(batchPrompt, 0.6);
        
        if (batchResult.scenes) {
          for (const scene of batchResult.scenes) {
            const sceneNum = allScenes.length + 1;
            allScenes.push({ ...scene, scene_number: sceneNum });
            
            await base44.asServiceRole.entities.Scenes.create({
              project_id,
              scene_number: sceneNum,
              narration_text: scene.narration_text,
              image_prompt: scene.image_prompt,
              animation_prompt: scene.animation_prompt,
              duration_seconds: scene.duration_seconds || 8,
              status: "prompts_ready"
            });
          }
          sceneOffset = allScenes.length;
          console.log(`Batch ${batchNum} complete: ${batchResult.scenes.length} scenes (total: ${allScenes.length})`);
        }
      } catch (err) {
        console.error(`Batch ${batchNum} failed: ${err.message}. Continuing with remaining batches...`);
      }
    }

    // ── UPDATE PROJECT ──
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: "content_generation",
      current_step: 5
    });

    console.log(`Done! Created ${allScenes.length} scenes for project ${project_id}`);
    return Response.json({ success: true, scene_count: allScenes.length });
  } catch (error) {
    console.error("generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});