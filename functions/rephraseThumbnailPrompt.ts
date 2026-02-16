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
      prompt: `You are an expert AI image prompt rewriter specializing in making prompts PASS content policy filters while maintaining maximum visual impact.

The following prompt was REJECTED. Your job: completely rewrite it to be 100% policy-safe while keeping the same EMOTIONAL IMPACT and COMPOSITION.

=== WHAT CAUSES REJECTIONS (avoid ALL of these) ===
- Any resemblance to real people (even indirect — "a man who looks presidential" can trigger filters)
- Graphic violence, blood, gore, visible injuries, weapons pointed at people
- Minors in distressing or dangerous situations
- Copyrighted characters, logos, brand names
- Threatening scenarios (someone looming menacingly over another person)
- Military/war imagery with casualties

=== HOW TO REPLACE UNSAFE ELEMENTS ===
- Real people → completely generic fictional archetypes with UNIQUE features (specific hair color, clothing, build)
- Violence/threat → dramatic SHADOWS, SILHOUETTES, environmental danger (storm, fire glow, crumbling walls)
- Confrontation → opposing COLOR TEMPERATURE (warm vs cold), characters on opposite sides with contrasting lighting
- Fear/danger → atmospheric effects (fog, embers, dramatic backlighting, heavy shadows)
- Weapons → symbolic objects (a key, a document, a photograph, a broken chain)

=== KEEP THESE UNCHANGED ===
- Exact composition layout, camera angles, framing
- Color palette and lighting approach
- All text overlays (exact words, font style, position)
- 16:9 aspect ratio, 1280x720 widescreen format
- Visual style: ${project?.visual_style || 'cinematic'}
- 200+ words, highly detailed

REJECTED PROMPT:
${thumb.image_prompt}

CONTEXT:
${thumb.concept_description}

TEXT OVERLAY TO PRESERVE: "${thumb.text_overlay || 'none'}"`,
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