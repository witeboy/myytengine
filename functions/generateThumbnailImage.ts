import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL IMAGE GENERATION
// Primary: AI33 SeedDream 4.5 (async submit → poll via pollThumbnailTask)
// Fallback: Ideogram V3 via KIE (sync poll in-function)
// ══════════════════════════════════════════════════════════════════

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";
const AI33_BASE = "https://api.ai33.pro";

// ── KIE helpers (for Ideogram fallback) ─────────────────────────

async function kieCreate(apiKey, model, input) {
  const r = await fetch(KIE_BASE + "/createTask", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input })
  });
  const d = await r.json();
  if (!r.ok || d.code !== 200) throw new Error("Kie " + model + ": " + (d.msg || JSON.stringify(d)));
  return d.data.taskId;
}

async function kiePoll(apiKey, taskId) {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    await new Promise(r => setTimeout(r, 4000));
    const r = await fetch(KIE_BASE + "/recordInfo?taskId=" + taskId, { headers: { Authorization: "Bearer " + apiKey } });
    const d = await r.json();
    if (d.code !== 200) continue;
    if (d.data?.state === "success") {
      const j = JSON.parse(d.data.resultJson || "{}");
      return j.resultUrls?.[0] || j.url || j.imageUrl || null;
    }
    if (d.data?.state === "fail") throw new Error(d.data?.failMsg || "failed");
  }
  throw new Error("timeout");
}

// ── AI33 SeedDream submit (async, returns task_id) ──────────────

async function submitAI33Thumbnail(apiKey, prompt, aspectRatio) {
  const ai33Aspect = aspectRatio === "9:16" ? "9:16" : "16:9";
  console.log(`🌱 AI33 Seedream thumbnail: submitting (${prompt.length} chars, ratio=${ai33Aspect})...`);

  const formData = new FormData();
  formData.append('prompt', prompt.substring(0, 4000));
  formData.append('model_id', 'bytedance-seedream-4.5');
  formData.append('generations_count', '1');
  formData.append('model_parameters', JSON.stringify({
    aspect_ratio: ai33Aspect,
    resolution: "2K"
  }));

  const submitRes = await fetch(`${AI33_BASE}/v1i/task/generate-image`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData
  });

  const submitData = await submitRes.json();

  if (!submitData.success || !submitData.task_id) {
    throw new Error(`AI33 submit failed: ${submitData.message || JSON.stringify(submitData)}`);
  }

  console.log(`📡 AI33 thumbnail task submitted: ${submitData.task_id}`);
  return submitData.task_id;
}

// ── Prompt prep for thumbnail ───────────────────────────────────

function prepareThumbnailPrompt(rawPrompt) {
  let p = rawPrompt;
  // Strip resolution numbers (models render them as text)
  p = p
    .replace(/\b\d{3,4}\s*[x×]\s*\d{3,4}\s*(pixels?|px)?\b/gi, '')
    .replace(/\b(8K|4K|1080p|720p)\s*(resolution|quality|detail)?\b/gi, 'highly detailed');
  // Strip f-stop numbers
  p = p.replace(/\bf[/:]?\s*\d+\.?\d*\b/gi, 'shallow depth of field');
  // Markdown artifacts
  p = p.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*/g, '').replace(/#{1,3}\s*/g, '');
  // Clean punctuation
  p = p.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
  return p;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const KIE_KEY = Deno.env.get("KIE_API_KEY");
    const AI33_KEY = Deno.env.get("AI33_API_KEY");
    if (!KIE_KEY && !AI33_KEY) return Response.json({ error: 'No image API keys configured' }, { status: 500 });

    const { concept_id } = await req.json();
    if (!concept_id) return Response.json({ error: 'concept_id required' }, { status: 400 });

    const concepts = await base44.asServiceRole.entities.ThumbnailConcepts.filter({ id: concept_id });
    const concept = concepts[0];
    if (!concept) return Response.json({ error: 'Concept not found' }, { status: 404 });

    const prompt = concept.image_prompt;
    if (!prompt) return Response.json({ error: 'No image prompt on concept' }, { status: 400 });

    // Detect shorts from prompt content
    const isShorts = prompt.includes('9:16') || prompt.includes('1080x1920');
    const aspectRatio = isShorts ? "9:16" : "16:9";
    const imageSize = isShorts ? "portrait_9_16" : "landscape_16_9";

    const cleanPrompt = prepareThumbnailPrompt(prompt);

    console.log(`🖼️ Generating thumbnail for concept ${concept_id} (${cleanPrompt.length} chars)`);

    // ═══════════════════════════════════════════════════════════
    // PRIMARY: AI33 SeedDream (async submit → frontend polls)
    // ═══════════════════════════════════════════════════════════
    if (AI33_KEY) {
      try {
        const ai33Prompt = cleanPrompt + ". Ultra high resolution, crisp sharp details, professional YouTube thumbnail quality, cinematic lighting.";
        const taskId = await submitAI33Thumbnail(AI33_KEY, ai33Prompt, aspectRatio);

        // Return immediately — frontend will poll via pollThumbnailTask
        return Response.json({
          success: false,
          pending: true,
          task_id: taskId,
          task_type: 'ai33',
          concept_id,
          model: 'ai33-seedream-4.5',
        });
      } catch (e) {
        console.warn("AI33 SeedDream submit failed:", e.message, "→ falling back to Ideogram");
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FALLBACK: Ideogram V3 via KIE (sync poll in-function)
    // ═══════════════════════════════════════════════════════════
    if (!KIE_KEY) return Response.json({ error: 'AI33 failed and no KIE_API_KEY for fallback' }, { status: 500 });

    let url = null;
    let model = 'none';

    // Try Ideogram V3 Quality
    try {
      const tid = await kieCreate(KIE_KEY, "ideogram/v3-text-to-image", {
        prompt: cleanPrompt.substring(0, 2000) + ". Ultra high resolution, crisp sharp details, professional quality.",
        image_size: imageSize, style: "DESIGN", rendering_speed: "QUALITY",
        expand_prompt: false,
        negative_prompt: "no text, no words, no letters, no numbers, no typography, no titles, no labels, no captions, no watermark, no signature, " + (concept.negative_prompt || "blurry, low quality, pixelated, distorted")
      });
      url = await kiePoll(KIE_KEY, tid);
      if (url) model = "ideogram-v3-quality";
    } catch (e) { console.warn("ideogram-v3 failed:", e.message); }

    // Fallback: Ideogram V3 Balanced
    if (!url) {
      try {
        const tid = await kieCreate(KIE_KEY, "ideogram/v3-text-to-image", {
          prompt: cleanPrompt.substring(0, 1200),
          image_size: imageSize, style: "DESIGN", rendering_speed: "BALANCED",
          expand_prompt: false,
          negative_prompt: "blurry, low quality, pixelated, watermark"
        });
        url = await kiePoll(KIE_KEY, tid);
        if (url) model = "ideogram-v3-balanced";
      } catch (e) { console.warn("ideogram-balanced failed:", e.message); }
    }

    // Fallback: Grok Imagine
    if (!url) {
      try {
        const tid = await kieCreate(KIE_KEY, "grok-imagine/text-to-image", {
          prompt: cleanPrompt.substring(0, 1500), aspect_ratio: aspectRatio
        });
        url = await kiePoll(KIE_KEY, tid);
        if (url) model = "grok-imagine";
      } catch (e) { console.warn("grok-imagine failed:", e.message); }
    }

    if (url) {
      await base44.asServiceRole.entities.ThumbnailConcepts.update(concept_id, { image_url: url });
      console.log(`✓ Thumbnail generated: ${model} — ${url.substring(0, 60)}`);
    }

    return Response.json({
      success: !!url,
      image_url: url,
      model,
      concept_id,
    });

  } catch (error) {
    console.error("generateThumbnailImage error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});