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

    const prompt = `You are a video production expert. Break this script into individual visual scenes. For each scene:
1. Extract the narration text
2. Write an AI image generation prompt (photorealistic, cinematic, detailed)
3. Write an animation direction prompt describing camera movement and action

Script:
"""
${script.full_script.substring(0, 12000)}
"""

Return JSON:
{"scenes": [{"scene_number": 1, "narration_text": "...", "image_prompt": "Cinematic photograph of...", "animation_prompt": "Slow zoom in, camera pans left...", "duration_seconds": 8}]}

Rules:
- Each scene should be 5-15 seconds
- Image prompts must be detailed, cinematic, photorealistic descriptions
- Animation prompts describe camera movement (pan, zoom, dolly) and any motion
- Keep narration text as-is from the script
- Aim for ${Math.round(project.video_duration_minutes * 60 / 8)} scenes total`;

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