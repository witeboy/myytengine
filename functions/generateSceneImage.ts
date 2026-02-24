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

    // 1️⃣ Generate the image
    let imageUrl = await generateWithGrokImagine(
      KIE_API_KEY,
      finalPrompt,
      aspectRatio
    );

    // 🔒 GUARANTEE PUBLIC URL
    if (!imageUrl) {
      throw new Error("No image returned from generator.");
    }

    // Detect base64 or suspicious inline string
    const isBase64 =
      typeof imageUrl === "string" &&
      (imageUrl.startsWith("data:") || imageUrl.length > 5000);

    if (isBase64) {
      console.log("⚠️ Base64 or inline image detected. Uploading to storage...");

      try { // ✅ One { closing try
        // Extract base64 portion
        const base64Data = imageUrl.includes(",")
          ? imageUrl.split(",")[1]
          : imageUrl;

        if (!base64Data) {
          throw new Error("Invalid base64 image format.");
        }

        // Decode base64 to binary
        const binaryData = Uint8Array.from(
          atob(base64Data),
          (c) => c.charCodeAt(0)
        );

        const blob = new Blob([binaryData], { type: "image/png" });
        const filename = `scene_${scene_id}_${Date.now()}.png`;

        // Upload to Base44 assets to get a public URL
        const uploadResult = await base44.asServiceRole.assets.upload(
          filename,
          blob
        );

        if (!uploadResult?.url) {
          throw new Error("Failed to upload image to public storage.");
        }

        imageUrl = uploadResult.url;

        console.log("✅ Converted to public URL:", imageUrl);
      } catch (uploadError) { // ✅ Closing catch for base64 upload
        console.error("Base64 conversion failed:", uploadError);
        throw new Error("Failed to convert base64 image to public URL.");
      }
    }

    // 🔥 FINAL SAFETY CHECK
    if (typeof imageUrl !== "string" || !imageUrl.startsWith("http")) {
      throw new Error("Image is not a valid public URL.");
    }

    // 3️⃣ Update the scene in the database
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: imageUrl,
      status: "image_generated",
    });

    return Response.json({
      success: true,
      image_url: imageUrl,
      scene_id,
    });

  } catch (error) { // ✅ Closing try/catch
    console.error(`❌ generateSceneImage error: ${error.message}`);
    if (scene_id && base44) {
      await base44.asServiceRole.entities.Scenes.update(scene_id, {
        status: "failed",
      });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}); // ✅ final }); closing Deno.serve