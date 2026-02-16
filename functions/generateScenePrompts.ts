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
        generationConfig: {
          temperature,
          maxOutputTokens: 16384,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini error: ${err.error?.message || response.status}`);
  }

  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");

  return JSON.parse(data.candidates[0].content.parts[0].text);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { project_id } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = scripts.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];
    if (!script?.full_script) return Response.json({ error: "No script found" }, { status: 400 });

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

    const styleDirective = styleMap[project.visual_style] || styleMap.cinematic_realistic;

    const orientationDirective =
      project.orientation === "portrait"
        ? "Vertical 9:16 composition optimized for mobile"
        : "Widescreen 16:9 cinematic composition";

    const sceneExtractionPrompt = `
You are a professional film director and cinematographer.

Break this documentary script into cinematic "Visual Scenes" that will be used to generate AI images and Sora video, based on emotional shifts and visual beats — NOT by sentence count.
Split the scenes based on visual beats—a new scene should happen every ~10-15 seconds of narration.


SCRIPT:
${script.full_script}

INSTRUCTIONS:

DIRECTOR'S REQUIREMENTS:
1. CONSISTENCY: Identify recurring characters and describe them identically every time.
2. SHOT VARIETY: Mix Close-ups, Wide shots, and Tracking shots.
3. STYLE: Every image_prompt MUST integrate these style rules: "${styleDirective}".
4. FORMAT: Every image_prompt MUST follow: "${orientationDirective}".
5. NO TEXT: Image prompts must NOT contain words like "Title", "Text", or "Subtitles".


1. Extract recurring characters and assign consistency_id.
2. SHOT VARIETY: Mix Close-ups, Wide shots, and Tracking shots.
3. Maintain identical physical descriptions across scenes.
4. Do not mutate wardrobe unless narratively required.
5. Each scene must have a clear emotional beat.
6. Use varied shot types (wide, medium, close-up, insert, tracking, over-the-shoulder).
7. Maintain visual continuity.
8.  STYLE: Every image_prompt MUST integrate these style rules: "${styleDirective}".
9. FORMAT: Every image_prompt MUST follow: "${orientationDirective}".
10. NO TEXT: Image prompts must NOT contain words like "Title", "Text", or "Subtitles".
11. Include full cinematic image_prompt combining:
   - ${styleDirective}
   - ${orientationDirective}
   - Camera
   - Lighting
   - Mood
   - Depth of field
   - Composition

RESPOND IN THIS EXACT JSON FORMAT:

{
  "characters": [
    {
      "name": "",
      "description": "",
      "consistency_id": ""
    }
  ],
  "scenes": [
    {
      "scene_number": 1,
      "scene_id": "SCN_001",
      "narration": "",
      "visual_beat": "",
      "primary_subject": "",
      "characters_present": [],
      "location": "",
      "time_of_day": "",
      "emotion": "",
      "shot_type": "",
      "camera_movement": "",
      "lens": "",
      "lighting": "",
      "color_grade": "",
      "composition_notes": "",
      "image_prompt": "",
      "animation_prompt": "",
      "continuity_notes": ""
    }
  ]
}
`;

    const result = await callGemini(sceneExtractionPrompt, 0.7);

    if (!result.scenes || !Array.isArray(result.scenes)) {
      return Response.json({ error: "Scene extraction failed" }, { status: 500 });
    }

    await base44.entities.Scenes.bulkCreate(
      result.scenes.map(scene => ({
        project_id,
        scene_number: scene.scene_number,
        narration: scene.narration,
        image_prompt: scene.image_prompt,
        animation_prompt: scene.animation_prompt,
        metadata: scene
      }))
    );

    return Response.json({
      success: true,
      total_scenes: result.scenes.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});