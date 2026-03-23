import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// FLOW/RE-MAKE — Sequential Image Generation with Reference Chain
// ══════════════════════════════════════════════════════════════════
// Each scene receives the PREVIOUS scene's generated image as
// reference, so the AI can see exactly what to build upon.
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

async function kieCreateTask(apiKey, model, input) {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, input })
  });
  const resText = await res.text();
  let result;
  try { result = JSON.parse(resText); } catch (e) {
    throw new Error("Kie non-JSON: " + resText.substring(0, 200));
  }
  if (!res.ok || result.code !== 200) {
    throw new Error(result.msg || result.message || `Kie error ${res.status}`);
  }
  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxPolls = 60) {
  for (let i = 0; i < maxPolls; i++) {
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
  throw new Error("Polling timed out");
}

function cleanPrompt(prompt) {
  let cleaned = prompt;
  // Strip numbers that Grok renders as text
  cleaned = cleaned
    .replace(/\b\d+\s*m\b/gi, '')
    .replace(/\b\d+\s*mm\b/gi, '')
    .replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, '')
    .replace(/\b\d+k\b/gi, '')
    .replace(/\b\d+p\b/gi, '')
    .replace(/\b\d+\s*meters?\b/gi, '')
    .replace(/\b\d+\s*degrees?\b/gi, '')
    .replace(/\b\d+\s*°\b/g, '')
    .replace(/\b\d+\s*x\s*\d+\b/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Smart cap at 1200 chars
  if (cleaned.length > 1200) {
    const cutZone = cleaned.substring(1100, 1200);
    const lastPeriod = cutZone.lastIndexOf('.');
    const lastComma = cutZone.lastIndexOf(',');
    const cutPoint = lastPeriod >= 0 ? 1100 + lastPeriod + 1
                   : lastComma >= 0 ? 1100 + lastComma + 1
                   : 1200;
    cleaned = cleaned.substring(0, cutPoint).trim();
  }

  return cleaned;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { scene_id, reference_image_url } = await req.json();
    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY missing' }, { status: 500 });

    // Fetch scene
    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    // Fetch project for orientation
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    if (!scene.image_prompt) return Response.json({ error: 'No image prompt' }, { status: 400 });

    const aspectRatio = project.orientation === "portrait" ? "9:16" : "16:9";
    const finalPrompt = cleanPrompt(scene.image_prompt);
    const hasReference = reference_image_url && reference_image_url.startsWith('http');

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🖼️ Progression Image: Scene ${scene.scene_number}`);
    console.log(`📐 Aspect: ${aspectRatio}`);
    console.log(`🔗 Reference: ${hasReference ? reference_image_url.substring(0, 60) + '...' : 'NONE (first scene)'}`);
    console.log(`📝 Prompt: ${finalPrompt.substring(0, 100)}...`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    let imageUrl = null;

    if (hasReference) {
      // ═══ TRY 1: Grok Imagine image-to-image (edit mode with reference) ═══
      try {
        const taskId = await kieCreateTask(KIE_API_KEY, "grok-imagine/image-to-image", {
          image_urls: [reference_image_url],
          prompt: finalPrompt,
          aspect_ratio: aspectRatio
        });
        console.log(`✓ Grok img2img task: ${taskId}`);
        imageUrl = await kiePollResult(KIE_API_KEY, taskId);
        console.log(`✓ Grok img2img complete: ${imageUrl?.substring(0, 60)}`);
      } catch (err) {
        console.warn(`⚠ Grok img2img failed: ${err.message}`);
      }

      // ═══ TRY 2: Grok Imagine text-to-image with image_urls as reference ═══
      if (!imageUrl) {
        try {
          const taskId = await kieCreateTask(KIE_API_KEY, "grok-imagine/text-to-image", {
            prompt: finalPrompt,
            aspect_ratio: aspectRatio,
            image_urls: [reference_image_url]
          });
          console.log(`✓ Grok text2img+ref task: ${taskId}`);
          imageUrl = await kiePollResult(KIE_API_KEY, taskId);
          console.log(`✓ Grok text2img+ref complete: ${imageUrl?.substring(0, 60)}`);
        } catch (err) {
          console.warn(`⚠ Grok text2img+ref failed: ${err.message}`);
        }
      }

      // ═══ TRY 3: Kling image-to-image with reference ═══
      if (!imageUrl) {
        try {
          const taskId = await kieCreateTask(KIE_API_KEY, "kling/v2.1/standard/image-to-image", {
            image_urls: [reference_image_url],
            prompt: finalPrompt,
            aspect_ratio: aspectRatio
          });
          console.log(`✓ Kling img2img task: ${taskId}`);
          imageUrl = await kiePollResult(KIE_API_KEY, taskId);
          console.log(`✓ Kling img2img complete: ${imageUrl?.substring(0, 60)}`);
        } catch (err) {
          console.warn(`⚠ Kling img2img failed: ${err.message}`);
        }
      }

      // ═══ TRY 4: Flux img2img with reference ═══
      if (!imageUrl) {
        try {
          const taskId = await kieCreateTask(KIE_API_KEY, "flux/image-to-image", {
            image_urls: [reference_image_url],
            prompt: finalPrompt,
            aspect_ratio: aspectRatio
          });
          console.log(`✓ Flux img2img task: ${taskId}`);
          imageUrl = await kiePollResult(KIE_API_KEY, taskId);
          console.log(`✓ Flux img2img complete: ${imageUrl?.substring(0, 60)}`);
        } catch (err) {
          console.warn(`⚠ Flux img2img failed: ${err.message}`);
        }
      }
    }

    // ═══ FALLBACK: Standard text-to-image (no reference) ═══
    if (!imageUrl) {
      if (hasReference) {
        console.log(`⚠ All reference methods failed — falling back to text-only`);
      }
      const taskId = await kieCreateTask(KIE_API_KEY, "grok-imagine/text-to-image", {
        prompt: finalPrompt,
        aspect_ratio: aspectRatio
      });
      console.log(`✓ Text-to-image task: ${taskId}`);
      imageUrl = await kiePollResult(KIE_API_KEY, taskId);
      console.log(`✓ Text-to-image complete: ${imageUrl?.substring(0, 60)}`);
    }

    // Save to scene
    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: imageUrl,
      status: "image_generated"
    });

    return Response.json({
      success: true,
      image_url: imageUrl,
      scene_number: scene.scene_number,
      used_reference: hasReference,
      prompt_length: finalPrompt.length,
    });

  } catch (error) {
    console.error("generateProgressionImage error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
