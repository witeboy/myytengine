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

    // Clean prompt — strip technical metadata that Grok renders as visible text
    let finalPrompt = scene.image_prompt;

    // 1. Strip orientation/format directives (handled by aspect_ratio param)
    finalPrompt = finalPrompt
      .replace(/\b(LANDSCAPE|PORTRAIT)\s+(HORIZONTAL|VERTICAL)\b/gi, '')
      .replace(/\b(widescreen|wide\s*screen)\b/gi, '')
      .replace(/\b\d{1,2}\s*:\s*\d{1,2}\s*(frame|format|ratio|widescreen|vertical|horizontal)?\s*,?\s*/gi, '')
      .replace(/\b(wide|tall)\s+(cinematic|vertical|horizontal)\s+(framing|composition)\b/gi, '')
      .replace(/\bvertical\s+\d+:\d+\b/gi, '')
      .replace(/\bhorizontal\s+\d+:\d+\b/gi, '');

    // 2. Strip the long anti-text instruction (Grok renders it as text)
    finalPrompt = finalPrompt
      .replace(/,?\s*ABSOLUTELY\s+NO\s+text[\s\S]{0,120}?(in the image|of any kind)[.\s]*/gi, '')
      .replace(/,?\s*NO\s+text,?\s*words,?\s*letters[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '')
      .replace(/,?\s*FORBIDDEN:?\s*text[\s\S]{0,80}?(in the image|of any kind)[.\s]*/gi, '');

    // 3. Strip resolution/quality metadata that leaks as text
    finalPrompt = finalPrompt
      .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
      .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');

    // 4. Clean up artifacts (double commas, double spaces, leading commas)
    finalPrompt = finalPrompt
      .replace(/,\s*,/g, ',')
      .replace(/\.\s*\./g, '.')
      .replace(/,\s*\./g, '.')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s,.]+/, '')
      .trim();

    // 5. Cap at 900 chars (Grok limit — longer prompts cause artifacts)
    if (finalPrompt.length > 900) {
      finalPrompt = finalPrompt.substring(0, 897) + '...';
    }

    // Orientation ONLY from project setting (not in prompt text)
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