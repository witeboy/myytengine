import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { thumbnail_id } = await req.json();

    const thumbs = await base44.asServiceRole.entities.ThumbnailConcepts.filter({ id: thumbnail_id });
    const thumb = thumbs[0];
    if (!thumb) return Response.json({ error: 'Thumbnail not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: thumb.project_id });
    const project = projects[0];

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are an AI image prompt rewriter. The following thumbnail image generation prompt was REJECTED by an AI image generator due to content policy violations (real people's likenesses, copyrighted imagery, violence, etc).

Your job: Rewrite the image prompt so it conveys the SAME visual concept, composition, mood, and emotional impact, but using ONLY safe, generic, fictional characters that will NOT trigger content policy filters.

Rules:
- NEVER reference real people by name or likeness
- Replace real people with generic archetypes (e.g. "a middle-aged man with a confident expression" instead of a specific celebrity)
- Keep the SAME composition, layout, camera angles, lighting, and color palette
- Keep the SAME text overlays, badges, and graphic elements
- Maintain the visual style: ${project?.visual_style || 'cinematic'}
- Keep the 16:9 aspect ratio, 1280x720 format
- The prompt should be 200+ words, detailed and descriptive

ORIGINAL PROMPT THAT WAS REJECTED:
${thumb.image_prompt}

CONCEPT DESCRIPTION (for context):
${thumb.concept_description}`,
      response_json_schema: {
        type: "object",
        properties: {
          image_prompt: { type: "string", description: "The rewritten safe image prompt" },
          changes_summary: { type: "string", description: "Brief summary of what was changed to make it safe" }
        },
        required: ["image_prompt", "changes_summary"]
      }
    });

    await base44.asServiceRole.entities.ThumbnailConcepts.update(thumbnail_id, {
      image_prompt: result.image_prompt,
    });

    return Response.json({ 
      success: true, 
      image_prompt: result.image_prompt,
      changes_summary: result.changes_summary
    });
  } catch (error) {
    console.error("rephraseThumbnailPrompt error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});