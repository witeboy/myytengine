import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const KIE_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_KEY) return Response.json({ error: 'KIE_API_KEY missing' }, { status: 500 });

    const { concept_id } = await req.json();
    if (!concept_id) return Response.json({ error: 'concept_id required' }, { status: 400 });

    const concepts = await base44.asServiceRole.entities.ThumbnailConcepts.filter({ id: concept_id });
    const concept = concepts[0];
    if (!concept) return Response.json({ error: 'Concept not found' }, { status: 404 });

    const prompt = concept.image_prompt;
    if (!prompt) return Response.json({ error: 'No image prompt on concept' }, { status: 400 });

    // Detect shorts from prompt content
    const isShorts = prompt.includes('9:16') || prompt.includes('1080x1920');
    const imageSize = isShorts ? "portrait_9_16" : "landscape_16_9";
    const aspectRatio = isShorts ? "9:16" : "16:9";

    console.log(`🖼️ Generating thumbnail image for concept ${concept_id}`);

    let url = null;
    let model = 'none';

    // Try Ideogram V3 Quality
    try {
      const tid = await kieCreate(KIE_KEY, "ideogram/v3-text-to-image", {
        prompt: prompt.substring(0, 2000) + ". Ultra high resolution, crisp sharp details, professional quality.",
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
          prompt: prompt.substring(0, 1200),
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
          prompt: prompt.substring(0, 1500), aspect_ratio: aspectRatio
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
