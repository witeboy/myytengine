import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scene_id, enhance_type } = await req.json();
    // enhance_type: "image", "animation", or "both"

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];

    // Get surrounding scenes for context continuity
    const allScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: scene.project_id });
    const sorted = allScenes.sort((a, b) => a.scene_number - b.scene_number);
    const idx = sorted.findIndex(s => s.id === scene_id);
    const prevScene = idx > 0 ? sorted[idx - 1] : null;
    const nextScene = idx < sorted.length - 1 ? sorted[idx + 1] : null;

    const styleMap = {
      cinematic_realistic: "Cinematic realistic film still, dramatic lighting, shallow depth of field",
      photorealistic_4k: "Ultra-photorealistic 4K photography, sharp detail, natural lighting",
      cinematic_anime: "Cinematic anime style, dramatic lighting, Makoto Shinkai inspired",
      anime: "Anime illustration, vibrant colors, clean linework, expressive characters",
      cartoon_2d: "2D cartoon, flat colors, bold outlines, playful animated series quality",
      picstory_cocomelon: "3D children's animation like Cocomelon, bright colors, soft rounded characters",
      cinematic_picstory: "Cinematic 3D animation like Pixar/DreamWorks, expressive 3D characters",
      oil_painting: "Classical oil painting, rich textures, visible brushstrokes, Renaissance-inspired",
      watercolor: "Soft watercolor illustration, gentle washes, dreamy ethereal atmosphere",
      comic_book: "Bold comic book style, strong ink outlines, halftone shading, dynamic composition",
    };
    const styleDirective = styleMap[project?.visual_style] || styleMap.cinematic_realistic;

    let charBlock = "";
    if (project?.character_descriptions) {
      try {
        const chars = JSON.parse(project.character_descriptions);
        charBlock = chars.map(c => `[${c.name}: ${c.description}]`).join("\n");
      } catch (_) {}
    }

    const updates = {};

    if (enhance_type === "image" || enhance_type === "both") {
      const imageResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a world-class AI image prompt engineer. Enhance and refine this image generation prompt to produce a more visually stunning, detailed, and evocative result.

CURRENT IMAGE PROMPT:
${scene.image_prompt}

NARRATION (what the viewer hears during this scene):
${scene.narration_text}

VISUAL STYLE: ${styleDirective}

${charBlock ? `CHARACTER REFERENCES (copy-paste FULL descriptions when characters appear):\n${charBlock}` : ""}

${prevScene ? `PREVIOUS SCENE IMAGE PROMPT (for visual continuity):\n${prevScene.image_prompt}` : ""}
${nextScene ? `NEXT SCENE IMAGE PROMPT (for visual continuity):\n${nextScene.image_prompt}` : ""}

ENHANCEMENT RULES:
- Start with the style directive: "${styleDirective}"
- Add specific details: lighting direction, color temperature, atmosphere, depth layers
- Add compositional guidance: rule of thirds, leading lines, focal point, foreground/background separation
- Add mood amplifiers: specific emotion words, texture details, weather/particle effects
- If characters appear, include their COMPLETE description verbatim from the character references
- Maintain visual continuity with adjacent scenes (similar color grading, time of day, location feel)
- Keep the prompt under 500 characters
- Do NOT change the core subject/narrative of the scene
- Ensure the prompt is content-policy safe (no graphic violence, suffering, or distressing imagery)

Return ONLY the enhanced prompt text as a string, nothing else.`,
        response_json_schema: {
          type: "object",
          properties: {
            enhanced_prompt: { type: "string" }
          },
          required: ["enhanced_prompt"]
        }
      });
      updates.image_prompt = imageResult.enhanced_prompt;
    }

    if (enhance_type === "animation" || enhance_type === "both") {
      const animResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a world-class cinematographer and motion director. Create a detailed, evocative animation prompt that describes exactly how this scene's image should be brought to life with motion.

CURRENT ANIMATION PROMPT:
${scene.animation_prompt || "Subtle cinematic motion"}

NARRATION (what the viewer hears):
${scene.narration_text}

IMAGE DESCRIPTION:
${updates.image_prompt || scene.image_prompt}

SCENE DURATION: ${scene.duration_seconds || 8} seconds
CURRENT CAMERA MOVEMENT SETTING: ${scene.camera_movement || "slow_pan"}
CURRENT ANIMATION SPEED: ${scene.animation_speed || "normal"}

${prevScene ? `PREVIOUS SCENE ANIMATION (for flow continuity): ${prevScene.animation_prompt}` : ""}
${nextScene ? `NEXT SCENE ANIMATION (for flow continuity): ${nextScene.animation_prompt}` : ""}

ENHANCEMENT RULES:
- Describe specific camera movement: direction, speed, arc, starting and ending framing
- Add atmospheric motion: particles, fog wisps, light rays, dust motes, rain, leaves
- Add subject micro-motion: subtle breathing, hair movement, fabric sway, eye movement
- Include depth-of-field shifts if appropriate (rack focus, bokeh transitions)
- Describe lighting changes: sun moving, shadows shifting, light flickering
- Match the emotional arc of the narration (tension = slow creeping zoom, revelation = dramatic pull-back)
- Ensure smooth transition feel from previous scene and into next scene
- Keep under 400 characters
- Be specific and cinematic, not generic

Also suggest the best camera_movement and animation_speed settings.

Camera movement options: static, slow_pan, slow_zoom_in, slow_zoom_out, dolly_zoom, crane_shot, tracking_shot, orbital, tilt_up, tilt_down
Animation speed options: very_slow, slow, normal, fast`,
        response_json_schema: {
          type: "object",
          properties: {
            enhanced_animation_prompt: { type: "string" },
            suggested_camera_movement: { type: "string" },
            suggested_animation_speed: { type: "string" }
          },
          required: ["enhanced_animation_prompt"]
        }
      });
      updates.animation_prompt = animResult.enhanced_animation_prompt;
      if (animResult.suggested_camera_movement) {
        updates.camera_movement = animResult.suggested_camera_movement;
      }
      if (animResult.suggested_animation_speed) {
        updates.animation_speed = animResult.suggested_animation_speed;
      }
    }

    await base44.asServiceRole.entities.Scenes.update(scene_id, updates);

    return Response.json({ success: true, updates });
  } catch (error) {
    console.error("enhanceScenePrompts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});