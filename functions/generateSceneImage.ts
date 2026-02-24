import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE IMAGE GENERATOR v3.1 — URL GUARANTEE EDITION
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

// ══════════════════════════════════════════════════════════════════
// KIE API HELPERS
// ══════════════════════════════════════════════════════════════════

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
    throw new Error(`Kie createTask (${model}): ${result.msg || JSON.stringify(result)}`);
  }
  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxWaitMs = 120000) {
  const pollInterval = 4000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval));

    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });

    const poll = await res.json();
    if (poll.code !== 200) { console.warn(`Poll error: ${poll.message}`); continue; }

    const state = poll.data?.state;
    if (state === "success") {
      const resultJson = JSON.parse(poll.data.resultJson || "{}");
      // Prioritize public URLs from the result metadata
      const url = resultJson.resultUrls?.[0] || resultJson.url || resultJson.imageUrl;
      if (!url) throw new Error("Task completed but no image URL found");
      return url;
    }

    if (state === "fail") {
      throw new Error(`Kie task failed: ${poll.data?.failMsg || "Unknown"}`);
    }
  }

  throw new Error(`Kie task ${taskId} timed out after ${maxWaitMs / 1000}s`);
}

async function generateWithGrokImagine(apiKey, prompt, aspectRatio) {
  console.log(`[Grok Imagine] aspect: ${aspectRatio}`);
  const taskId = await kieCreateTask(apiKey, "grok-imagine", {
    prompt,
    aspect_ratio: aspectRatio,
    output_format: "png"
  });
  return await kiePollResult(apiKey, taskId);
}

// ══════════════════════════════════════════════════════════════════
// ORIENTATION & SAFETY HELPERS
// ══════════════════════════════════════════════════════════════════

function detectOrientation(prompt, projectOrientation) {
  const p = (prompt || '').toLowerCase();
  if (/portrait|vertical|9:16/i.test(p)) return 'portrait';
  if (/landscape|horizontal|16:9/i.test(p)) return 'landscape';
  return projectOrientation || 'landscape';
}

function safetySanitize(prompt) {
  // Simple safety replacements to avoid model rejection
  return prompt
    .replace(/bodies\s+lying/gi, "a somber empty street")
    .replace(/squalor|starvation/gi, "historical hardship");
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  let base44;
  let scene_id;

  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    scene_id = body.scene_id;

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];

    const finalPrompt = safetySanitize(scene.image_prompt || "");
    const orientation = detectOrientation(finalPrompt, project?.orientation);
    const aspectRatio = orientation === 'portrait' ? '9:16' : '16:9';

    // 1. Generate the image
    let imageUrl = await generateWithGrokImagine(KIE_API_KEY, finalPrompt, aspectRatio);

    // 2. GUARANTEE PUBLIC URL: Convert Base64 if necessary
    if (imageUrl.startsWith('data:')) {
      console.log("⚠️ Base64 detected. Uploading to public storage for Veo compatibility...");
      
      const base64Data = imageUrl.split(',')[1];
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const blob = new Blob([binaryData], { type: 'image/png' });
      
      const filename = `scene_${scene_id}_${Date.now()}.png`;
      // Use the Base44 SDK assets upload to get a public URL
      const uploadResult = await base44.asServiceRole.assets.upload(filename, blob);
      
      if (!uploadResult?.url) {
        throw new Error("Failed to upload base64 image to public storage.");
      }
      
      imageUrl = uploadResult.url;
      console.log(`✓ Successfully converted to public URL: ${imageUrl}`);
    }

    // 3. Update the database
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: imageUrl,
      status: "image_generated"
    });

    return Response.json({
      success: true,
      image_url: imageUrl,
      scene_number: scene.scene_number
    });

  } catch (error) {
    console.error(`❌ generateSceneImage error: ${error.message}`);
    if (scene_id && base44) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
});