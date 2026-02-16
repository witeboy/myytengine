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

    // ── VISUAL STYLE MAPPING ──
    const styleMap = {
      cinematic_realistic: "Cinematic film still shot on ARRI Alexa, anamorphic lens flare, 2.39:1 aspect feel, shallow depth of field f/1.4, dramatic three-point lighting with rim light, color graded with teal and orange tones, film grain, volumetric lighting, lens breathing, Hollywood blockbuster cinematography, photorealistic",
      photorealistic_4k: "Ultra-photorealistic DSLR photograph shot on Canon EOS R5 85mm f/1.2, razor-sharp detail, natural ambient lighting, professional color grading, editorial photography, skin texture visible, accurate shadows, real-world proportions, no AI artifacts",
      cinematic_anime: "Cinematic anime illustration in the style of Makoto Shinkai and Ufotable, dramatic volumetric god rays, detailed background art with painted clouds, film-grain overlay, anime characters with realistic proportions, dynamic camera angle, depth of field bokeh, color palette of warm sunset oranges and cool sky blues",
      anime: "High-quality anime illustration, Studio Ghibli meets modern anime aesthetic, vibrant saturated colors, clean precise linework, cel-shaded with soft gradients, expressive detailed eyes, detailed hair strands, colorful background art, manga panel composition",
      cartoon_2d: "Professional 2D vector animation style like modern Cartoon Network or Disney TVA, flat cel-shaded colors, bold clean outlines, playful exaggerated proportions, bright primary color palette, clean gradient backgrounds, animation keyframe quality",
      picstory_cocomelon: "3D rendered Pixar-quality children's animation, soft subsurface scattering on skin, rounded chunky character design, oversized expressive eyes, bright candy-colored palette, soft ambient occlusion, cheerful warm global illumination, toy-like proportions, smooth plastic-like materials",
      cinematic_picstory: "Cinematic 3D CGI render like Pixar/DreamWorks feature film, subsurface scattering, ray-traced global illumination, volumetric fog, dramatic rim lighting, physically based rendering (PBR), detailed fabric and hair simulation, film color grading with rich contrast, IMAX quality framing",
      oil_painting: "Classical oil painting on textured canvas, visible impasto brushstrokes, chiaroscuro lighting technique, Rembrandt-inspired dramatic shadow, rich umber and sienna undertones, warm golden varnish glow, museum-quality fine art, Renaissance composition with golden ratio, thick paint texture, gallery lighting",
      watercolor: "Delicate watercolor painting on cold-pressed paper, visible paper grain texture, soft wet-on-wet color bleeding, transparent luminous washes, gentle color gradients, white paper showing through highlights, loose expressive brushwork, muted pastel palette with occasional vivid accents, dreamy atmospheric perspective",
      comic_book: "Bold American comic book art style, heavy black ink outlines, Ben-Day halftone dot shading, dynamic foreshortened perspective, speed lines for motion, dramatic chiaroscuro inking, saturated CMYK color palette, Jack Kirby-inspired dynamic composition, thick panel borders, action-packed graphic novel quality",
    };

    const visualStyle = project.visual_style || 'cinematic_realistic';
    const styleDirective = styleMap[visualStyle] || styleMap.cinematic_realistic;

    // ── ORIENTATION / ASPECT RATIO ──
    const orientation = project.orientation || 'landscape';
    let orientationDirective, compositionGuide, animationFramingGuide;

    if (orientation === 'portrait') {
      orientationDirective = "PORTRAIT 9:16 vertical format (720x1280)";
      compositionGuide = "Compose for VERTICAL 9:16 frame: use tall compositions, center subjects vertically, close-up and medium shots work best.";
      animationFramingGuide = "vertical 9:16 frame — prefer tilt up/down movements, vertical reveals, close-up push-ins.";
    } else {
      orientationDirective = "LANDSCAPE 16:9 widescreen horizontal format (1280x720)";
      compositionGuide = "Compose for WIDESCREEN 16:9 frame: use wide establishing shots, rule-of-thirds horizontal placement, panoramic depth, negative space on sides for cinematic feel.";
      animationFramingGuide = "widescreen 16:9 frame — prefer horizontal pans, dolly movements, wide-angle tracking shots, lateral parallax.";
    }

    const promptPrefix = `${styleDirective}, ${orientationDirective}`;

    // ── CLEAN THE SCRIPT ──
    const cleanedScript = cleanScriptText(script.full_script);
    const wordCount = cleanedScript.split(/\s+/).length;

    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount / 150);
    const totalTargetScenes = Math.max(5, Math.round(durationMinutes * 60 / 8));
    const SCENES_PER_BATCH = 10;
    const numBatches = Math.ceil(totalTargetScenes / SCENES_PER_BATCH);

    const scriptChunks = splitScriptIntoChunks(cleanedScript, numBatches);

    // ── FIRST BATCH: delete old scenes ──
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

    // ── SHOT TYPE VARIETY ──
    const shotTypes = [
      "extreme wide establishing shot showing the full environment",
      "medium wide shot with subject in context of surroundings",
      "medium close-up showing subject from chest up with background detail",
      "dramatic close-up focusing on face/hands with shallow depth of field",
      "over-the-shoulder perspective looking at the scene",
      "bird's eye aerial view looking down at the scene",
      "low angle shot looking up at the subject for dramatic power",
      "silhouette shot with subject backlit against dramatic sky/light",
      "detail/insert shot of a specific meaningful object or texture",
      "wide tracking shot following movement through the environment"
    ];

    // ── RULES ──
    const imageRules = `**CRITICAL IMAGE PROMPT RULES:**
1. EVERY image_prompt MUST begin with: "${promptPrefix}."
2. ${compositionGuide}
3. VISUAL VARIETY IS MANDATORY: Each scene MUST use a DIFFERENT shot type/camera angle. NEVER repeat the same framing for consecutive scenes.
4. When a character appears, include their FULL description. Never abbreviate.
5. FACIAL HAIR: always include exact facial hair details.
6. Same clothing/appearance across all scenes unless story says otherwise.
7. Include specific lighting (direction + color), color palette, and atmosphere.
8. NEVER use generic descriptions like "a man" or "a woman".
9. ABSOLUTELY NO TEXT, WORDS, LETTERS, NUMBERS, TITLES, CAPTIONS, WATERMARKS, LOGOS, OR WRITTEN CONTENT OF ANY KIND in the image.
10. End each image_prompt with: "absolutely no text or writing in the image, masterpiece, highly detailed, 8K, professional composition"
11. Each scene must show a DIFFERENT moment, action, or perspective — not the same character standing in the same pose.`;

    const animationRules = `**ANIMATION PROMPT RULES:**
1. Designed for ${animationFramingGuide}
2. Include: camera movement (direction/speed/arc), atmospheric motion, subject micro-motion, depth-of-field shifts, lighting transitions.
3. Match emotional arc. Each scene must have DIFFERENT camera movement.`;

    const narrationRules = `**NARRATION TEXT RULES — EXTREMELY IMPORTANT:**
- narration_text must contain ONLY the spoken voiceover words.
- ABSOLUTELY NO: [SCENE:], [CUT TO:], [MUSIC:], [SOUND:], VOICEOVER:, Narrator:, Sound:, V.O.:, or ANY direction/label/tag.
- ABSOLUTELY NO parenthetical directions like (pause), (dramatic), (whisper).
- PURE SPOKEN WORDS ONLY. Nothing else.
- Each scene = 15-40 words of narration (5-15 seconds of speech).
- Use the EXACT words from the script. Do not modify, paraphrase, or summarize.
- Cover the FULL segment — do not skip any words.
- Each sentence should appear in EXACTLY ONE scene — no duplicates.`;

    // ── LOAD CHARACTERS ──
    let characters = [];
    if (project.character_descriptions) {
      try { characters = JSON.parse(project.character_descriptions); } catch (_) {}
    }

    const characterBlock = characters.length > 0
      ? characters.map(c => `[${c.name}: ${c.description}]`).join("\n")
      : "";

    const batchShotSuggestions = [];
    for (let i = 0; i < scenesForBatch; i++) {
      batchShotSuggestions.push(shotTypes[(sceneOffset + i) % shotTypes.length]);
    }

    let prompt;

    if (currentBatch === 0) {
      prompt = `You are a world-class video production director. Break this narration into visual scenes.

**NARRATION SCRIPT (Part 1 of ${numBatches}):**
"""
${scriptChunks[0]}
"""

**Topic**: "${project.name}" in the "${project.niche}" niche
**VISUAL STYLE**: ${styleDirective}
**FORMAT**: ${orientationDirective}
**TARGET: ${scenesForBatch} scenes**

STEP 1: Identify all key characters and write detailed physical descriptions.
STEP 2: Split the narration into ${scenesForBatch} scenes. Each scene = one visual moment (15-40 words).
STEP 3: For each scene, write an image prompt showing what viewers SEE.
STEP 4: For each scene, write a cinematic animation prompt.

**SUGGESTED SHOT TYPES** (one per scene for variety):
${batchShotSuggestions.map((shot, i) => `Scene ${i + 1}: ${shot}`).join('\n')}

Return JSON:
{
  "characters": [
    {"name": "Name", "description": "Exact age, gender, ethnicity, hair color/style/length, facial hair, eye color, build, exact clothing, distinguishing features."}
  ],
  "scenes": [
    {
      "scene_number": 1,
      "narration_text": "Only the spoken words — no directions or labels",
      "image_prompt": "${promptPrefix}. [shot type]. [what is happening]. [character description if present]. [lighting and atmosphere]. absolutely no text or writing in the image, masterpiece, highly detailed, 8K, professional composition",
      "animation_prompt": "[camera movement], [atmospheric motion], [subject motion], [depth of field]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}

**SCENE VARIETY:**
- Each scene = a DIFFERENT visual moment with different action, angle, composition.
- Show what is HAPPENING in the story, not static portraits.
- If narration describes an event, SHOW that event.
- Alternate: establishing shots, action shots, emotional close-ups, environmental shots, symbolic imagery.
- NEVER two consecutive scenes with same character in same pose/setting.`;

    } else {
      prompt = `Continue breaking narration into visual scenes.

**ESTABLISHED CHARACTERS (copy-paste FULL descriptions when they appear):**
${characterBlock}

**NARRATION SCRIPT (Part ${currentBatch + 1} of ${numBatches}):**
"""
${scriptChunks[currentBatch]}
"""

**Topic**: "${project.name}" in the "${project.niche}" niche
**VISUAL STYLE**: ${styleDirective}
**FORMAT**: ${orientationDirective}
**TARGET: ${scenesForBatch} scenes, starting at scene ${sceneOffset + 1}**

**SUGGESTED SHOT TYPES** (one per scene for variety):
${batchShotSuggestions.map((shot, i) => `Scene ${sceneOffset + i + 1}: ${shot}`).join('\n')}

Return JSON:
{
  "scenes": [
    {
      "scene_number": ${sceneOffset + 1},
      "narration_text": "Only the spoken words — no directions or labels",
      "image_prompt": "${promptPrefix}. [shot type]. [what is happening]. [character descriptions]. [lighting]. absolutely no text or writing in the image, masterpiece, highly detailed, 8K, professional composition",
      "animation_prompt": "[camera movement], [atmospheric motion], [subject motion], [depth of field]",
      "duration_seconds": 8
    }
  ]
}

${imageRules}

${animationRules}

${narrationRules}

**SCENE VARIETY:**
- Each scene = a DIFFERENT visual moment. Different action, angle, composition.
- Show what is HAPPENING — not static portraits.
- Alternate: establishing shots, action, close-ups, environmental, symbolic imagery.
- NEVER two consecutive scenes with same character in same pose/setting.
- Continuing from scene ${sceneOffset} — maintain coherence but VARY compositions.`;
    }

    // ── CALL GEMINI ──
    console.log(`Batch ${currentBatch + 1}/${numBatches}: generating scenes ${sceneOffset + 1}+ (target: ${scenesForBatch})...`);
    const result = await callGemini(prompt, 0.6);

    // Save characters on first batch
    if (currentBatch === 0 && result.characters && result.characters.length > 0) {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        character_descriptions: JSON.stringify(result.characters),
      });
    }

    // Save scenes with cleaned narration
    let scenesCreated = 0;
    if (result.scenes) {
      for (const scene of result.scenes) {
        const sceneNum = sceneOffset + scenesCreated + 1;

        const cleanedNarration = cleanNarrationText(scene.narration_text);

        let imagePrompt = scene.image_prompt || "";
        if (!imagePrompt.toLowerCase().includes("no text")) {
          imagePrompt += ", absolutely no text or writing in the image";
        }

        await base44.asServiceRole.entities.Scenes.create({
          project_id,
          scene_number: sceneNum,
          narration_text: cleanedNarration,
          image_prompt: imagePrompt,
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
      success: true, done: isDone,
      batch_completed: currentBatch, scenes_created: scenesCreated,
      total_scenes: totalScenesNow, total_target: totalTargetScenes, total_batches: numBatches
    });
  } catch (error) {
    console.error("generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});