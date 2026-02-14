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

    // Use Core GenerateImage integration to create the scene image
    const result = await base44.asServiceRole.integrations.Core.GenerateImage({
      prompt: scene.image_prompt,
    });

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