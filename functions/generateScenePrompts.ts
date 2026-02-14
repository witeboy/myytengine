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
    // Try to recover truncated JSON by finding the last complete scene object
    console.log("JSON parse failed, attempting recovery...");
    const lastBrace = rawText.lastIndexOf('}');
    if (lastBrace === -1) throw new Error("Cannot recover JSON from Gemini response");
    // Find the matching array close and root close
    const trimmed = rawText.substring(0, lastBrace + 1);
    // Try closing the array and root object
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

    // Visual style mapping
    const styleMap = {
      cinematic_realistic: "Cinematic realistic film still, dramatic lighting, shallow depth of field, Hollywood production quality, moody atmosphere",
      photorealistic_4k: "Ultra-photorealistic 4K photography, sharp detail, natural lighting, DSLR quality, editorial photo",
      cinematic_anime: "Cinematic anime style, dramatic lighting and composition, detailed anime illustration with film-like framing, Makoto Shinkai inspired",
      anime: "Anime illustration style, vibrant colors, clean linework, expressive characters, manga-influenced, detailed anime art",
      cartoon_2d: "2D cartoon style, flat colors, bold outlines, playful and colorful, animated series quality, clean vector-like illustration",
      picstory_cocomelon: "3D rendered children's animation style like Cocomelon/PicStory, bright colors, soft rounded characters, cheerful and cute, Pixar-like rendering for kids",
      cinematic_picstory: "Cinematic 3D animation style like Pixar/DreamWorks, high-quality 3D rendering, dramatic lighting, expressive 3D characters, movie-quality CGI",
      oil_painting: "Classical oil painting style, rich textures, visible brushstrokes, Renaissance-inspired composition, warm color palette, museum-quality artwork",
      watercolor: "Soft watercolor illustration, gentle color washes, delicate details, dreamy and ethereal atmosphere, artistic illustration",
      comic_book: "Bold comic book style, strong ink outlines, halftone dot shading, dynamic panel composition, vibrant saturated colors, graphic novel quality",
    };

    const visualStyle = project.visual_style || 'cinematic_realistic';
    const styleDirective = styleMap[visualStyle] || styleMap.cinematic_realistic;

    const prompt = `You are a world-class video production director. You are given a pure narration script (voiceover text only, no visual directions). Your job is to:

1. Break the narration into individual scenes (each scene = a segment of narration that corresponds to one visual)
2. For each scene, write a detailed AI image generation prompt describing what the viewer should SEE while this narration plays
3. For each scene, write an animation/action prompt describing how the generated image should be animated (camera movement, motion, effects)
4. FIRST, identify all KEY CHARACTERS in the story and write detailed character descriptions (appearance, clothing, features, age, build, etc.)

**Narration Script:**
"""
${script.full_script.substring(0, 12000)}
"""

**Topic context**: "${project.name}" in the "${project.niche}" niche

**MANDATORY VISUAL STYLE**: ${styleDirective}

Return JSON:
{
  "characters": [
    {"name": "Character Name", "description": "Detailed physical description: age, gender, ethnicity, hair color/style, facial features, body build, clothing, distinguishing features. Be VERY specific so the character looks identical in every scene."}
  ],
  "scenes": [{"scene_number": 1, "narration_text": "The exact narration text for this scene segment...", "image_prompt": "[STYLE INSTRUCTION]. [Detailed visual description]. [Character descriptions repeated inline when characters appear].", "animation_prompt": "Slow zoom in on subject, slight camera pan left to right, atmospheric particles floating...", "duration_seconds": 8}]
}

**CRITICAL RULES FOR VISUAL CONSISTENCY:**
- EVERY image prompt MUST start with the style instruction: "${styleDirective}"
- When ANY character appears in a scene, you MUST include their FULL physical description inline in the image prompt (hair color, clothing, facial features, build, etc.). NEVER just use their name — always re-describe them fully.
- Characters must wear the SAME clothing and have the SAME appearance across ALL scenes unless the story explicitly says otherwise.
- Maintain consistent environment details (time of day, weather, location aesthetics) across related scenes.
- Use the same color grading language across all prompts (e.g., "warm golden tones", "cool blue palette").

**Other Rules:**
- Split the narration into logical visual segments. Each scene = 5-15 seconds of narration.
- The narration_text must be the EXACT words from the script (do not modify, summarize, or paraphrase).
- Animation prompts describe camera movement (slow zoom, pan, dolly, tracking shot), subject motion, atmospheric effects.
- Aim for approximately ${Math.round(project.video_duration_minutes * 60 / 8)} scenes total.
- Ensure visual continuity — scenes should feel like a cohesive visual story.
- Match the emotional tone of each narration segment with appropriate visual mood.`;

    const result = await callGemini(prompt, 0.6);

    // Save character descriptions to project for future reference
    if (result.characters && result.characters.length > 0) {
      await base44.asServiceRole.entities.Projects.update(project_id, {
        character_descriptions: JSON.stringify(result.characters),
      });
    }

    const createdScenes = [];
    for (const scene of result.scenes) {
      const record = await base44.asServiceRole.entities.Scenes.create({
        project_id,
        scene_number: scene.scene_number,
        narration_text: scene.narration_text,
        image_prompt: scene.image_prompt,
        animation_prompt: scene.animation_prompt,
        duration_seconds: scene.duration_seconds || 8,
        status: "prompts_ready"
      });
      createdScenes.push(record);
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: "content_generation",
      current_step: 5
    });

    return Response.json({ success: true, scene_count: createdScenes.length });
  } catch (error) {
    console.error("generateScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});