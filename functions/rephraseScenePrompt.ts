import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scene_id } = await req.json();

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    // Get project for visual style context
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are an AI image prompt rewriter. The following image generation prompt was REJECTED by an AI image generator due to content policy violations (violence, suffering, graphic content, depictions of children in distress, etc).

Your job: Rewrite BOTH the image prompt and the animation prompt so they convey the SAME narrative meaning and emotional tone, but using ONLY safe, artistic, symbolic, or metaphorical imagery that will NOT trigger content policy filters.

Rules:
- Never depict children suffering, violence, death, gore, or graphic distress
- Use symbolic representations: empty shoes instead of victims, shadows instead of people in pain, wilting flowers instead of death
- Use environmental storytelling: dark skies, abandoned buildings, empty streets, rain, fog
- Keep the same camera angles, lighting mood, and composition style
- Maintain the visual style: ${project?.visual_style || 'cinematic'}
- Keep prompts concise (under 300 characters each)

ORIGINAL IMAGE PROMPT:
${scene.image_prompt}

ORIGINAL ANIMATION PROMPT:
${scene.animation_prompt || 'Subtle cinematic motion'}

NARRATION CONTEXT (what the scene is about):
${scene.narration_text}`,
      response_json_schema: {
        type: "object",
        properties: {
          image_prompt: { type: "string", description: "The rewritten safe image prompt" },
          animation_prompt: { type: "string", description: "The rewritten safe animation prompt" }
        },
        required: ["image_prompt", "animation_prompt"]
      }
    });

    // Update the scene with new prompts
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_prompt: result.image_prompt,
      animation_prompt: result.animation_prompt,
      status: "prompts_ready"
    });

    return Response.json({ 
      success: true, 
      image_prompt: result.image_prompt,
      animation_prompt: result.animation_prompt
    });
  } catch (error) {
    console.error("rephraseScenePrompt error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});