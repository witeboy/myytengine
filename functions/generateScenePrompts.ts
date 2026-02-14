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
        generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: "application/json" }
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

    const prompt = `You are a world-class video production director. You are given a pure narration script (voiceover text only, no visual directions). Your job is to:

1. Break the narration into individual scenes (each scene = a segment of narration that corresponds to one visual)
2. For each scene, write a detailed AI image generation prompt describing what the viewer should SEE while this narration plays
3. For each scene, write an animation/action prompt describing how the generated image should be animated (camera movement, motion, effects)

**Narration Script:**
"""
${script.full_script.substring(0, 12000)}
"""

**Topic context**: "${project.name}" in the "${project.niche}" niche

Return JSON:
{"scenes": [{"scene_number": 1, "narration_text": "The exact narration text for this scene segment...", "image_prompt": "Cinematic, photorealistic photograph of [detailed visual description matching the narration content]. Dramatic lighting, high detail, 8K quality, cinematic composition.", "animation_prompt": "Slow zoom in on subject, slight camera pan left to right, atmospheric particles floating...", "duration_seconds": 8}]}

**Rules:**
- Split the narration into logical visual segments. Each scene = 5-15 seconds of narration.
- The narration_text must be the EXACT words from the script (do not modify, summarize, or paraphrase).
- Image prompts must be highly detailed, cinematic, photorealistic descriptions that visually represent what the narration is describing. Include mood, lighting, setting, subjects, composition.
- Animation prompts describe camera movement (slow zoom, pan, dolly, tracking shot), subject motion, atmospheric effects (particles, fog, light rays), and transitions.
- Aim for approximately ${Math.round(project.video_duration_minutes * 60 / 8)} scenes total.
- Ensure visual continuity — scenes should feel like a cohesive visual story.
- Match the emotional tone of each narration segment with appropriate visual mood.`;

    const result = await callGemini(prompt, 0.6);

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