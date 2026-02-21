import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// SCENE IMAGE GENERATOR v3 — PROMPT PASSTHROUGH ARCHITECTURE
// ══════════════════════════════════════════════════════════════════
//
// PHILOSOPHY: The prompt from generateScenePrompts is ALREADY complete.
// It contains style directive, style reinforcement, anti-style,
// character descriptions, composition hints, and no-text rules.
// This function is a THIN PASS-THROUGH — it takes the prompt as-is
// and sends it to the best available image model.
//
// MODEL CHAIN:
//   1. Grok Imagine (imageGrok 4.0) via Kie — $0.02/6 images, great quality
//   2. Gemini Direct API (gemini-2.0-flash-exp-image-generation) — fallback
//
// WHAT THIS FUNCTION DOES NOT DO (by design):
//   ✗ No style sandwich wrapping
//   ✗ No character block injection
//   ✗ No director enrichment
//   ✗ No style conflict stripping
//   ✗ No prompt rewriting
//   All of that is handled upstream by generateScenePrompts.
//
// WHAT THIS FUNCTION DOES:
//   ✓ DIRECTOR_NOTES safety check (rejects unconverted notes)
//   ✓ Safety sanitization (child safety, violence)
//   ✓ Orientation detection → aspect ratio for model params
//   ✓ Model cascade with graceful fallback
//   ✓ Scene status updates
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
      const url = resultJson.resultUrls?.[0] || resultJson.url || resultJson.imageUrl;
      if (!url) throw new Error("Task completed but no image URL in resultJson");
      return url;
    }

    if (state === "fail") {
      throw new Error(`Kie task failed: ${poll.data?.failMsg || "Unknown"}`);
    }
  }

  throw new Error(`Kie task ${taskId} timed out after ${maxWaitMs / 1000}s`);
}

// ══════════════════════════════════════════════════════════════════
// IMAGE GENERATION MODELS
// ══════════════════════════════════════════════════════════════════

// PRIMARY: Grok Imagine via Kie — $0.02/6 images, great quality
async function generateWithGrokImagine(apiKey, prompt, aspectRatio) {
  console.log(`[Grok Imagine] imageGrok 4.0 | aspect: ${aspectRatio}`);
  const taskId = await kieCreateTask(apiKey, "grok-imagine", {
    prompt,
    aspect_ratio: aspectRatio,
    output_format: "png"
  });
  return await kiePollResult(apiKey, taskId);
}

// FALLBACK: Gemini Direct API — uses GEMINI_API_KEY, returns base64 → data URI
async function generateWithGeminiDirect(prompt) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) throw new Error("GEMINI_API_KEY not configured");

  console.log(`[Gemini Direct] gemini-2.0-flash-exp-image-generation`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": geminiApiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"]
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
  }

  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini image gen");

  // Extract image from response parts
  const parts = data.candidates[0].content?.parts || [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || "image/png";
      // Return as data URI — works in browsers, storable in DB
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Gemini returned no image data in response parts");
}

// ══════════════════════════════════════════════════════════════════
// ORIENTATION DETECTION
// ══════════════════════════════════════════════════════════════════

function detectOrientation(prompt, projectOrientation) {
  // Check if the prompt explicitly states orientation
  const promptLower = (prompt || '').toLowerCase();

  if (/portrait\s+(vertical|9:16|9x16)|vertical\s+9:16|tall\s+vertical/i.test(promptLower)) {
    return 'portrait';
  }
  if (/landscape\s+(horizontal|16:9|16x9)|widescreen\s+16:9|wide\s+horizontal/i.test(promptLower)) {
    return 'landscape';
  }

  // Fall back to project setting
  return projectOrientation || 'landscape';
}

function getAspectRatio(orientation) {
  return orientation === 'portrait' ? '9:16' : '16:9';
}

function getDimensions(orientation) {
  return orientation === 'portrait' ? '1080x1920' : '1920x1080';
}

// ══════════════════════════════════════════════════════════════════
// MINIMAL SAFETY SANITIZATION
// ══════════════════════════════════════════════════════════════════
// Only safety-critical replacements. NO style changes, NO prompt rewriting.

function safetySanitize(prompt) {
  let p = prompt;

  // Child safety
  p = p.replace(/child('s)?\s+(face|eyes|body).*?(hunger|sick|starv|suffer|dying|dead|gaunt|tattered)/gi,
    "a solemn historical scene with dignified figures in period clothing");
  p = p.replace(/bodies?\s+(lying|in the street|dead|piled)/gi,
    "a somber empty street scene");
  p = p.replace(/begging\s+for\s+food/gi, "people waiting in line");
  p = p.replace(/squalor|deprivation|overcrowded/gi, "crowded historical urban setting");
  p = p.replace(/crying\s+and\s+suffering/gi, "quiet somber atmosphere");

  return p;
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

    // ── Fetch scene + project ───────────────────────────────────────
    const scenes = await base44.asServiceRole.entities.Scenes.filter({ id: scene_id });
    const scene = scenes[0];
    if (!scene) return Response.json({ error: 'Scene not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: scene.project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // ══════════════════════════════════════════════════════════════
    // SAFETY CHECK: Reject raw director notes
    // ══════════════════════════════════════════════════════════════
    if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
      console.error(`❌ Scene ${scene.scene_number} has raw DIRECTOR_NOTES — run generateScenePrompts first`);
      return Response.json({
        error: 'Scene has raw director notes. Run generateScenePrompts first to convert them to image prompts.',
        scene_number: scene.scene_number,
        status: scene.status
      }, { status: 400 });
    }

    if (!scene.image_prompt || scene.image_prompt.trim().length < 50) {
      console.error(`❌ Scene ${scene.scene_number} has no valid image prompt (${scene.image_prompt?.length || 0} chars)`);
      return Response.json({
        error: 'Scene has no image prompt. Run generateScenePrompts first.',
        scene_number: scene.scene_number
      }, { status: 400 });
    }

    // ══════════════════════════════════════════════════════════════
    // PROMPT: Pass through as-is (safety sanitize only)
    // ══════════════════════════════════════════════════════════════
    const rawPrompt = scene.image_prompt;
    const finalPrompt = safetySanitize(rawPrompt);

    // Detect orientation from prompt content or project setting
    const orientation = detectOrientation(finalPrompt, project.orientation);
    const aspectRatio = getAspectRatio(orientation);
    const dimensions = getDimensions(orientation);

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🖼️ Scene ${scene.scene_number} | ${dimensions} (${aspectRatio})`);
    console.log(`📐 Prompt: ${finalPrompt.length} chars | Passthrough mode`);
    console.log(`🔗 Chain: Grok Imagine → Gemini Direct`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // ══════════════════════════════════════════════════════════════
    // IMAGE GENERATION CASCADE
    // ══════════════════════════════════════════════════════════════
    let imageUrl;
    let usedModel = '';
    const errors = [];

    // ── Attempt 1: Grok Imagine via Kie ──────────────────────────
    try {
      imageUrl = await generateWithGrokImagine(KIE_API_KEY, finalPrompt, aspectRatio);
      usedModel = 'grok-imagine';
      console.log(`✓ Scene ${scene.scene_number} generated with Grok Imagine`);
    } catch (err1) {
      errors.push(`GrokImagine: ${err1.message}`);
      console.warn(`✗ Grok Imagine failed: ${err1.message}`);

      // ── Attempt 2: Gemini Direct API ────────────────────────────
      try {
        imageUrl = await generateWithGeminiDirect(finalPrompt);
        usedModel = 'gemini-direct';
        console.log(`✓ Scene ${scene.scene_number} generated with Gemini Direct API`);
      } catch (err2) {
        errors.push(`GeminiDirect: ${err2.message}`);
        throw new Error(`All generation attempts failed:\n  ${errors.join('\n  ')}`);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // SAVE RESULTS
    // ══════════════════════════════════════════════════════════════

    // Save scene 1 as reference image for style consistency
    if (scene.scene_number === 1 && !project.reference_image_url) {
      try {
        await base44.asServiceRole.entities.Projects.update(scene.project_id, {
          reference_image_url: imageUrl
        });
        console.log(`✓ Scene 1 saved as reference image`);
      } catch (refErr) {
        console.warn(`Failed to save reference image: ${refErr.message}`);
      }
    }

    await base44.asServiceRole.entities.Scenes.update(scene_id, {
      image_url: imageUrl,
      status: "image_generated"
    });

    console.log(`✓ Scene ${scene.scene_number} complete: ${usedModel} | ${imageUrl.substring(0, 80)}...`);

    return Response.json({
      success: true,
      image_url: imageUrl,
      orientation,
      dimensions,
      aspect_ratio: aspectRatio,
      scene_number: scene.scene_number,
      model_used: usedModel,
      prompt_length: finalPrompt.length,
      prompt_mode: 'passthrough'
    });

  } catch (error) {
    console.error(`❌ generateSceneImage error: ${error.message}`);

    try {
      if (scene_id && base44) {
        await base44.asServiceRole.entities.Scenes.update(scene_id, { status: "failed" });
      }
    } catch (updateErr) {
      console.error(`Failed to update scene status: ${updateErr.message}`);
    }

    return Response.json({ error: error.message }, { status: 500 });
  }
});