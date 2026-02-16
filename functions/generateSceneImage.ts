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

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];

    // Determine orientation
    const orientation = project?.orientation || 'landscape';
    
    let aspectBlock;
    if (orientation === 'portrait') {
      aspectBlock = 'PORTRAIT orientation, 9:16 vertical aspect ratio, 720x1280. Tall vertical composition.';
    } else {
      aspectBlock = 'LANDSCAPE orientation, 16:9 widescreen horizontal aspect ratio, 1280x720. Wide horizontal cinematic composition.';
    }

    // Sanitize the image prompt
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

    // Remove any text/title/caption related words from the prompt that could cause
    // the image model to render text in the image
    basePrompt = basePrompt.replace(/\b(title|headline|caption|subtitle|text overlay|text on screen|words|writing|lettering|typography|banner|sign reading|label|logo)\b/gi, '');
    // Remove quoted text that image models might try to render
    basePrompt = basePrompt.replace(/"[^"]{3,}"/g, '');
    basePrompt = basePrompt.replace(/'[^']{3,}'/g, '');
    
    // Build final prompt
    let fullPrompt = `${aspectBlock} ${basePrompt}`;
    
    // Strip conflicting orientation
    if (orientation === 'landscape') {
      fullPrompt = fullPrompt.replace(/portrait|vertical|9:16|720x1280/gi, '');
    } else {
      fullPrompt = fullPrompt.replace(/landscape|horizontal|16:9|1280x720/gi, '');
    }
    
    // Add strong no-text instruction at both start and end
    const noTextRule = "CRITICAL: Generate a purely visual image with absolutely NO text, NO words, NO letters, NO numbers, NO titles, NO captions, NO watermarks, NO logos, NO signs with writing, NO typography of any kind anywhere in the image.";
    
    fullPrompt = `${noTextRule} Artistic, dignified illustration. No graphic violence. ${fullPrompt}. ${noTextRule}`;
    
    // Prepend character descriptions if available
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
    
    // Truncate if needed, preserving no-text rule at the end
    if (fullPrompt.length > 2000) {
      const endBlock = ` ${aspectBlock} ${noTextRule}`;
      fullPrompt = fullPrompt.substring(0, 2000 - endBlock.length) + endBlock;
    }

    // Reference image from scene 1
    const referenceImages = [];
    if (project?.reference_image_url) {
      referenceImages.push(project.reference_image_url);
    }

    // Generate with fallback retries
    let result;
    try {
      const generateParams = { prompt: fullPrompt };
      if (referenceImages.length > 0) {
        generateParams.existing_image_urls = referenceImages;
      }
      result = await base44.asServiceRole.integrations.Core.GenerateImage(generateParams);
    } catch (firstErr) {
      console.log("First attempt failed, retrying without reference:", firstErr.message);
      try {
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt: fullPrompt });
      } catch (secondErr) {
        console.log("Second attempt failed, simplified prompt:", secondErr.message);
        const simplePrompt = `${aspectBlock} ${basePrompt}. ${noTextRule}`;
        result = await base44.asServiceRole.integrations.Core.GenerateImage({ prompt: simplePrompt });
      }
    }

    // Save scene 1 as reference
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