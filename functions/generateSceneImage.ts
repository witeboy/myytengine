import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ─────────────────────────────────────────────
// KIE HELPERS (UNCHANGED)
// ─────────────────────────────────────────────

async function kieCreateTask(apiKey, model, input) {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, input })
  });

  const result = await res.json();
  if (!res.ok || result.code !== 200) {
    throw new Error(result.msg || "Kie createTask failed");
  }

  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId) {
  while (true) {
    await new Promise(r => setTimeout(r, 4000));

    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });

    const poll = await res.json();
    if (poll.code !== 200) continue;

    if (poll.data?.state === "success") {
      const resultJson = JSON.parse(poll.data.resultJson || "{}");
      return resultJson.resultUrls?.[0];
    }

    if (poll.data?.state === "fail") {
      throw new Error(poll.data?.failMsg || "Generation failed");
    }
  }
}

async function generateWithGrokImagine(apiKey, prompt, aspectRatio) {
  const taskId = await kieCreateTask(apiKey, "grok-imagine/text-to-image", {
    prompt: prompt,           // EXACT prompt
    aspect_ratio: aspectRatio // Only aspect ratio param
  });

  return await kiePollResult(apiKey, taskId);
}

// ─────────────────────────────────────────────
// SIMPLE PASSTHROUGH HANDLER
// ─────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { scene_id } = await req.json();
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return Response.json({ error: "KIE_API_KEY not configured" }, { status: 500 });
    }

    // Fetch scene
    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: "Scene not found" }, { status: 404 });

    // Fetch project
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

    if (!scene.image_prompt) {
      return Response.json({ error: "No image prompt found" }, { status: 400 });
    }

    // USE PROMPT EXACTLY AS STORED
    const finalPrompt = scene.image_prompt;

    // Orientation ONLY from project setting
    const aspectRatio = project.orientation === "portrait" ? "9:16" : "16:9";

    const imageUrl = await generateWithGrokImagine(
      KIE_API_KEY,
      finalPrompt,
      aspectRatio
    );

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: imageUrl,
      status: "image_generated"
    });

    return Response.json({
      success: true,
      image_url: imageUrl,
      aspect_ratio: aspectRatio,
      prompt_length: finalPrompt.length,
      prompt_mode: "true_passthrough"
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});