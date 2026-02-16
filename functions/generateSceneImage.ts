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

    // Get project for orientation and reference image
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];

    // Determine orientation and build aspect ratio instructions
    const orientation = project?.orientation || 'landscape';
    
    let aspectBlock;
    if (orientation === 'portrait') {
      aspectBlock = 'CRITICAL: PORTRAIT orientation, 9:16 vertical aspect ratio, 720x1280 resolution. Tall vertical composition.';
    } else {
      aspectBlock = 'CRITICAL: LANDSCAPE orientation, 16:9 widescreen horizontal aspect ratio, 1280x720 resolution. Wide horizontal cinematic composition.';
    }

    // Sanitize the image prompt to avoid content policy violations
    let basePrompt = scene.image_prompt || "";
    
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
    
    // Build the final prompt with orientation enforced at BOTH start and end
    // (some image gen models pay more attention to beginning/end)
    let fullPrompt = `${aspectBlock} ${basePrompt}`;
    
    // Ensure the prompt doesn't already have conflicting orientation instructions
    if (orientation === 'landscape') {
      // Remove any portrait instructions that might have slipped in
      fullPrompt = fullPrompt.replace(/portrait|vertical|9:16|720x1280/gi, '');
    } else {
      // Remove any landscape instructions that might have slipped in
      fullPrompt = fullPrompt.replace(/landscape|horizontal|16:9|1280x720/gi, '');
    }
    
    // Re-append orientation at end as a reinforcement
    fullPrompt += `. ${aspectBlock}`;

    // Add safety wrapper
    fullPrompt = `Artistic, dignified, historically respectful illustration. No graphic violence, gore, or suffering. No text, watermarks, or signatures. ${fullPrompt}`;
    
    // If project has character descriptions, prepend them
    if (project?.character_descriptions) {
      try {
        const chars = JSON.parse(project.character_descriptions);
        if (chars.length > 0) {
          const charBlock = chars.map(c => 
            `[CHARACTER: ${c.name} — ${c.description}]`
          ).join(" ");
          fullPrompt = `MAINTAIN EXACT character appearances: ${charBlock}. ${fullPrompt}`;
        }
      } catch (_) {}
    }
    
    // Truncate if too long (image gen APIs have limits)
    if (fullPrompt.length > 2000) {
      // Keep the orientation block at the end even after truncation
      const endBlock = ` ${aspectBlock} masterpiece, highly detailed, 8K, professional composition`;
      fullPrompt = fullPrompt.substring(0, 2000 - endBlock.length) + endBlock;
    }

    // Check for reference image from scene 1
    const referenceImages = [];
    if (project?.reference_image_url) {
      referenceImages.push(project.reference_image_url);
    }

    // Try generating with full context first, then fallback
    let result;
    try {
      const generateParams = { prompt: fullPrompt };
      if (referenceImages.length > 0) {
        generateParams.existing_image_urls = referenceImages;
      }
      result = await base44.asServiceRole.integrations.Core.GenerateImage(generateParams);
    } catch (firstErr) {
      console.log("First attempt failed, retrying without reference images:", firstErr.message);
      try {
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt: fullPrompt });
      } catch (secondErr) {
        console.log("Second attempt failed, retrying with simplified prompt:", secondErr.message);
        // Final retry: just the base prompt + strong orientation instruction
        const simplePrompt = `${aspectBlock} ${scene.image_prompt || basePrompt}. ${aspectBlock}`;
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt: simplePrompt });
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
    try {
      if (scene_id) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
      }
    } catch (_) {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});