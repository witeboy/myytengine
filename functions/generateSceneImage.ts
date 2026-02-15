import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  let base44;
  let scene_id;
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    scene_id = body.scene_id;

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    // Get project for reference image
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];

    // Determine orientation and enforce aspect ratio in prompt
    const orientation = project?.orientation || 'landscape';
    const aspectRatioInstruction = orientation === 'portrait'
      ? 'IMPORTANT: Generate this image in PORTRAIT orientation (9:16 aspect ratio, vertical format, 720x1280).'
      : 'IMPORTANT: Generate this image in LANDSCAPE orientation (16:9 aspect ratio, horizontal format, 1280x720).';

    // Sanitize the image prompt to avoid content policy violations
    // Replace direct depictions of suffering/violence with tasteful artistic alternatives
    let basePrompt = scene.image_prompt || "";
    
    // Remove problematic content patterns and replace with safer alternatives
    const sanitizations = [
      [/child('s)?\s+(face|eyes|body).*?(hunger|sick|starv|suffer|dying|dead|gaunt|tattered)/gi, "a solemn historical scene with dignified figures in period clothing"],
      [/bodies?\s+(lying|in the street|dead|piled)/gi, "a somber empty street scene"],
      [/begging\s+for\s+food/gi, "people waiting in line"],
      [/squalor|deprivation|overcrowded/gi, "crowded historical urban setting"],
      [/crying\s+and\s+suffering/gi, "quiet somber atmosphere"],
    ];
    
    for (const [pattern, replacement] of sanitizations) {
      basePrompt = basePrompt.replace(pattern, replacement);
    }
    
    // Add safety wrapper + orientation
    let fullPrompt = `${aspectRatioInstruction} Artistic, dignified, historically respectful illustration. No graphic violence or suffering. ${basePrompt}`;
    
    // If project has character descriptions, prepend them
    if (project?.character_descriptions) {
      try {
        const chars = JSON.parse(project.character_descriptions);
        if (chars.length > 0) {
          const charBlock = chars.map(c => 
            `[CHARACTER: ${c.name} — ${c.description}]`
          ).join(" ");
          fullPrompt = `IMPORTANT — Maintain EXACT character appearance. ${charBlock}. ${fullPrompt}`;
        }
      } catch (_) {}
    }
    
    // Truncate if too long (image gen APIs have limits)
    if (fullPrompt.length > 2000) {
      fullPrompt = fullPrompt.substring(0, 2000);
    }

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
    // Mark scene as failed so user can rephrase the prompt
    try {
      if (scene_id) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
      }
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});