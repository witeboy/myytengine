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

    // Get project for reference image
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];

    // Build reference context for the prompt
    let referenceContext = "";
    
    // If project has character descriptions, prepend them
    if (project?.character_descriptions) {
      try {
        const chars = JSON.parse(project.character_descriptions);
        if (chars.length > 0) {
          referenceContext = "CHARACTER REFERENCE (maintain exact appearance): " + 
            chars.map(c => `${c.name}: ${c.description}`).join(". ") + ". ";
        }
      } catch (_) {}
    }

    const fullPrompt = referenceContext + scene.image_prompt;

    // Check if we have a reference image from scene 1 to use as style reference
    const referenceImages = [];
    if (project?.reference_image_url) {
      referenceImages.push(project.reference_image_url);
    }

    // Try generating with full context first, then fallback to simpler prompt
    let result;
    try {
      const generateParams = { prompt: fullPrompt };
      if (referenceImages.length > 0) {
        generateParams.existing_image_urls = referenceImages;
      }
      result = await base44.asServiceRole.integrations.Core.GenerateImage(generateParams);
    } catch (firstErr) {
      console.log("First attempt failed, retrying with simpler prompt:", firstErr.message);
      try {
        // Retry without reference images
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt: fullPrompt });
      } catch (secondErr) {
        console.log("Second attempt failed, retrying with base prompt only:", secondErr.message);
        // Final retry with just the scene image prompt
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt: scene.image_prompt });
      }
    }

    // If this is scene 1 and project has no reference image yet, save it
    if (scene.scene_number === 1 && !project?.reference_image_url) {
      await base44.asServiceRole.entities.Projects.update(scene.project_id, {
        reference_image_url: result.url
      });
    }

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: result.url,
      status: "image_generated"
    });

    return Response.json({ success: true, image_url: result.url });
  } catch (error) {
    console.error("generateSceneImage error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});