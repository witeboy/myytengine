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

// ══════════════════════════════════════════════════════════════════
// CINEMATIC LOGIC HELPERS (Infused)
// ══════════════════════════════════════════════════════════════════

function deriveMotifs(niche) {
  const motifMap = {
    finance: ["kitchen table with paperwork", "sunlight through blinds", "empty chair at dinner table", "close-up of hands holding bills"],
    retirement: ["quiet beach shoreline", "old photo album", "suburban home at sunset", "empty park bench"],
    motivation: ["mountain peak at sunrise", "city skyline at dawn", "training gym", "deep breath before action"]
  };
  return motifMap[niche?.toLowerCase()] || ["soft window light", "symbolic interior space", "moody natural light", "shallow depth of field portrait"];
}

function getRoleBasedShotPattern(phase) {
  const rolePatterns = {
    cold_open: ["ECU with shallow depth of field", "detail insert of symbolic object", "wide isolated shot", "low angle dramatic light"],
    problem: ["medium shot MS environmental context", "OTS over-shoulder", "high angle vulnerable", "handheld doc style"],
    emotional_core: ["MCU", "tight CU", "two-shot interaction", "silhouette against light source"],
    resolution: ["wide hopeful lighting", "tracking/dolly shot", "aerial cinematic perspective", "extreme wide establishing"]
  };
  return rolePatterns[phase] || rolePatterns.problem;
}

function splitScriptByPhase(script, phases) {
  const sentences = script.match(/[^.!?]+[.!?]+[\s]*/g) || [script];
  const totalSentences = sentences.length;
  let cursor = 0;
  const chunks = [];

  for (const phase of phases) {
    const proportion = phase.scenes / phases.reduce((a, b) => a + b.scenes, 0);
    const sentenceCount = Math.max(1, Math.round(totalSentences * proportion));
    // Ensure we don't go out of bounds
    const endCursor = Math.min(cursor + sentenceCount, totalSentences);
    
    // If it's the last phase, take everything remaining
    const isLast = phase.name === phases[phases.length-1].name;
    const segment = sentences.slice(cursor, isLast ? totalSentences : endCursor).join("").trim();
    
    if (segment.length > 0) {
        chunks.push({ phase: phase.name, scenes: phase.scenes, text: segment });
    }
    cursor = endCursor;
  }
  return chunks;
}

// ══════════════════════════════════════════════════════════════════
// PREMIUM QUALITY VALIDATION
// ══════════════════════════════════════════════════════════════════
function validateAndEnhancePrompt(imagePrompt, styleConfig, orientationConfig, sceneNumber) {
  let enhanced = imagePrompt;
  const issues = [];

  // Check 0: Strip wrong dimensions, enforce Fal.ai correct ones
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

  // Check 1: Minimum length
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

    const { project_id, batch_index, selected_hook } = await req.json(); // Added selected_hook to input
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
      // ... (Keeping your existing styles for brevity, assume all other styles exist here) ...
      anime: {
        positive: "High-quality anime illustration combining Studio Ghibli's whimsy with modern anime aesthetic, vibrant saturated colors with rich tones, clean precise linework with consistent line weight, cel-shaded with soft airbrushed gradients, expressive detailed eyes with multiple highlights and reflections, detailed hair strands with natural flow and movement, colorful detailed background art with atmospheric perspective, well-composed manga panel layout with rule of thirds, professional anime production quality like top-tier seasonal anime",
        negative: "photorealistic, live action, photograph, 3D render, western cartoon style, rough sketch, amateur coloring, flat backgrounds, inconsistent art style, off-model characters, poorly drawn anatomy, rushed animation, low budget anime, chibi, super deformed"
      }
    };

    const visualStyle = project.visual_style || 'cinematic_realistic';
    // Fallback to cinematic_realistic if specific style not found
    const styleConfig = styleMap[visualStyle] || styleMap.cinematic_realistic; 

    // ══════════════════════════════════════════════════════════════════
    // ORIENTATION CONFIGURATION
    // ══════════════════════════════════════════════════════════════════
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

    // ══════════════════════════════════════════════════════════════════
    // SCRIPT PROCESSING WITH CINEMATIC PHASING
    // ══════════════════════════════════════════════════════════════════
    
    // 1. Cold Open Integration
    const cleanedScriptBase = cleanScriptText(script.full_script);
    let modifiedScript = cleanedScriptBase;
    
    if (selected_hook) {
        const scriptWithoutHook = cleanedScriptBase.replace(selected_hook, "").trim();
        modifiedScript = `${selected_hook}. ${scriptWithoutHook}`;
    }

    const wordCount = modifiedScript.split(/\s+/).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    
    // 2. Emotional Phase Allocation (Replacing linear math)
    const MAX_SCENE_SECONDS = 8;
    const totalTargetScenes = Math.max(8, Math.round((durationMinutes * 60) / MAX_SCENE_SECONDS));

    const phaseWeights = [
      { name: "cold_open", weight: 0.12 },
      { name: "problem", weight: 0.30 },
      { name: "emotional_core", weight: 0.38 },
      { name: "resolution", weight: 0.20 }
    ];

    let remainingScenes = totalTargetScenes;
    const phaseSceneCounts = phaseWeights.map((phase, index) => {
      if (index === phaseWeights.length - 1) {
        return { ...phase, scenes: remainingScenes };
      }
      const scenes = Math.round(totalTargetScenes * phase.weight);
      remainingScenes -= scenes;
      return { ...phase, scenes };
    });

    // 3. Split Script by Phase
    // This creates 4 distinct chunks based on narrative flow
    const scriptChunks = splitScriptByPhase(modifiedScript, phaseSceneCounts);
    const numBatches = scriptChunks.length;

    // First batch: delete old scenes
    if (currentBatch === 0) {
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      for (const s of oldScenes) {
        await base44.asServiceRole.entities.Scenes.delete(s.id);
      }
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "content_generation",
        current_step: 5,
        character_descriptions: null // Reset characters on restart
      });
    }

    // Count existing scenes for offset
    const existingScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    const sceneOffset = existingScenes.length;

    if (currentBatch >= scriptChunks.length) {
      return Response.json({ success: true, done: true, scene_count: sceneOffset, total_batches: numBatches });
    }

    const currentPhaseChunk = scriptChunks[currentBatch];
    const scenesForBatch = currentPhaseChunk.scenes;

    // 4. Derive Visual Assets for this Phase
    const visualMotifs = deriveMotifs(project.niche);
    
    // Lighting progression: dark (cold open/problem) → warm (emotional) → bright (resolution)
    const lightingStages = ["low-key shadowed", "moody/dramatic", "warm soft light", "bright natural light"];
    const lightingForPhase = lightingStages[currentBatch % lightingStages.length];
    
    const suggestedShotPatterns = getRoleBasedShotPattern(currentPhaseChunk.phase);

    // ══════════════════════════════════════════════════════════════════
    // COMPREHENSIVE RULES FOR GEMINI
    // ══════════════════════════════════════════════════════════════════
    const imageRules = `**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**CRITICAL IMAGE PROMPT RULES (MUST FOLLOW EXACTLY):**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
1. **MANDATORY PREFIX:** EVERY image_prompt MUST begin with exactly: "${promptPrefix}."
2. **COMPOSITION:** ${orientationConfig.composition}
3. **SHOT VARIETY IS CRITICAL:** Each scene MUST use a DIFFERENT shot type from the provided list. NEVER repeat the same framing for consecutive scenes.
4. **CHARACTER CONSISTENCY:** When a character appears, include their COMPLETE description every single time (exact age, gender, clothing, etc.).
5. **LIGHTING MASTERY:** Current Phase Lighting Requirement: **${lightingForPhase}**.
6. **TECHNICAL CAMERA DETAILS:** Include specific camera work (angle, lens, depth of field).
7. **ABSOLUTELY FORBIDDEN:** NO text, words, letters, numbers, captions, or writing of any kind.
8. **QUALITY MANDATE:** EVERY prompt must end with: "ABSOLUTELY NO text, words, letters, numbers, captions, or writing of any kind in the image. masterpiece quality, highly detailed, 8K resolution, professional composition, award-winning cinematography"
9. **NEGATIVE ELEMENTS TO AVOID:** ${styleConfig.negative}`;

    const animationRules = `**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**ANIMATION PROMPT RULES:**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
1. **FRAME FORMAT:** Designed for ${orientationConfig.animation}
2. **MANDATORY ELEMENTS:** Camera movement (direction, speed), Atmospheric motion, Subject micro-motion, Depth-of-field changes.
3. **EMOTIONAL MATCHING:** Animation movement must match the emotional tone of the "${currentPhaseChunk.phase}" phase.`;

    const narrationRules = `**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**NARRATION TEXT RULES — EXTREMELY CRITICAL:**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
1. **PURE SPOKEN WORDS ONLY:** No [SCENE:], VOICEOVER:, or parenthetical directions.
2. **EXACT SCRIPT WORDS:** Use the EXACT words from the provided script segment. No paraphrasing.
3. **COMPLETE COVERAGE:** Every sentence from the script segment must appear in EXACTLY ONE scene.`;

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
    } else if (currentBatch > 0) {
        // Double check DB if not on project object yet (race condition safety)
        const updatedProject = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
         if (updatedProject[0]?.character_descriptions) {
            characters = JSON.parse(updatedProject[0].character_descriptions);
         }
    }

    const characterBlock = characters.length > 0
      ? `**ESTABLISHED CHARACTERS (copy FULL description every time they appear):**\n${characters.map(c => `• ${c.name}: ${c.description}`).join("\n")}`
      : "**NO CHARACTERS ESTABLISHED YET** - If characters appear in this segment, create detailed descriptions in the 'characters' array.";

    // ══════════════════════════════════════════════════════════════════
    // BUILD GEMINI PROMPT
    // ══════════════════════════════════════════════════════════════════
    const prompt = `
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**
**YOUR MISSION: CINEMATIC SCENE GENERATION**
**━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━**

You are a world-class cinematic director. Your goal is to break a script into high-quality scenes based on the emotional phase of the story.

**PROJECT DETAILS:**
- Topic: "${project.name}"
- Niche: "${project.niche}"
- Visual Style: ${visualStyle}
- Format: ${orientationConfig.format} ${orientationConfig.directive}
- **Current Emotional Phase:** ${currentPhaseChunk.phase.toUpperCase()}
- **Lighting Atmosphere:** ${lightingForPhase}
- **Visual Motifs to Weave In:** ${visualMotifs.join(", ")}
- Target Scenes for this Phase: ${scenesForBatch} scenes

**NARRATION SCRIPT SEGMENT (${currentPhaseChunk.phase}):**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${currentPhaseChunk.text}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${characterBlock}

**WORKFLOW:**

1. **SCENE SEGMENTATION:** Break the narration segment into exactly ${scenesForBatch} separate visual scenes.
   - Each scene = 1 visual idea.
   - Use EVERY word from the script exactly once.

2. **SHOT SELECTION:** Use the following shot patterns prioritized for this phase: 
   ${suggestedShotPatterns.join(", ")}

3. **PREMIUM IMAGE PROMPTS:** Write detailed prompts (300+ chars) following the rules below.

**JSON RESPONSE FORMAT:**
{
  "characters": [
    {
      "name": "Character Full Name",
      "description": "Exact age, gender, ethnicity, hair, clothing, features"
    }
  ],
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1}, // Start incrementing from here
      "narration_text": "Exact words from script segment",
      "image_prompt": "${promptPrefix}. [shot type]. [detailed description]. ABSOLUTELY NO text... masterpiece quality...",
      "animation_prompt": "[camera movement], [atmospheric motion]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}
`;

    // ══════════════════════════════════════════════════════════════════
    // CALL GEMINI
    // ══════════════════════════════════════════════════════════════════
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎬 Phase: ${currentPhaseChunk.phase} (Batch ${currentBatch + 1}/${numBatches})`);
    console.log(`📍 Generating scenes ${sceneOffset + 1}-${sceneOffset + scenesForBatch}`);
    console.log(`🎨 Style: ${visualStyle} | 💡 Lighting: ${lightingForPhase}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const result = await callGemini(prompt, 0.7);

    // Save characters if new ones generated and not present
    if (result.characters && result.characters.length > 0) {
      const mergedCharacters = [...characters];
      for (const newChar of result.characters) {
          if (!mergedCharacters.some(c => c.name === newChar.name)) {
              mergedCharacters.push(newChar);
          }
      }
      if (mergedCharacters.length > characters.length) {
          console.log(`✓ Updating characters: ${mergedCharacters.map(c => c.name).join(', ')}`);
          await base44.asServiceRole.entities.Projects.update(project_id, {
            character_descriptions: JSON.stringify(mergedCharacters),
          });
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // VALIDATE & SAVE SCENES
    // ══════════════════════════════════════════════════════════════════
    let scenesCreated = 0;
    let qualityWarnings = 0;

    if (result.scenes) {
      for (const scene of result.scenes) {
        const sceneNum = sceneOffset + scenesCreated + 1;
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
          console.warn(`⚠️ Scene ${sceneNum} prompt was enhanced/corrected`);
        }

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
    const isDone = (currentBatch + 1) >= numBatches; // Done when all phase chunks are processed

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Batch ${currentBatch + 1} complete`);
    console.log(`📊 Created: ${scenesCreated} scenes | Total: ${totalScenesNow}/${totalTargetScenes}`);
    if (qualityWarnings > 0) console.log(`⚠️ Quality warnings: ${qualityWarnings} prompts enhanced`);
    console.log(`${isDone ? '🎉 ALL SCENES GENERATED!' : '⏭️ More batches (phases) remaining'}`);
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