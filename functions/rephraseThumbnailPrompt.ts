import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// KIE AI IMAGE GENERATION (Ideogram V3 + Flux 2 fallback)
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
  const result = await res.json();
  if (!res.ok || result.code !== 200) {
    throw new Error(`Kie createTask (${model}): ${result.msg || JSON.stringify(result)}`);
  }
  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const poll = await res.json();
    if (poll.code !== 200) continue;
    const state = poll.data?.state;
    if (state === "success") {
      const rj = JSON.parse(poll.data.resultJson || "{}");
      return rj.resultUrls?.[0] || rj.url || rj.imageUrl || null;
    }
    if (state === "fail") throw new Error(poll.data?.failMsg || "Task failed");
  }
  throw new Error(`Task ${taskId} timed out`);
}

async function generateThumbnailImage(apiKey, imagePrompt, negativePrompt) {
  // Attempt 1: Ideogram V3
  try {
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-generate", {
      prompt: `${imagePrompt}. Ultra high resolution 1920x1080 Full HD, crisp sharp details, professional quality.`,
      image_size: "landscape_16_9",
      style: "DESIGN",
      rendering_speed: "QUALITY",
      expand_prompt: false,
      negative_prompt: negativePrompt || "blurry, low quality, pixelated, watermark, low resolution, compressed, artifacts"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-generate" };
  } catch (e) { console.warn(`Ideogram V3 failed: ${e.message}`); }

  // Attempt 2: Ideogram V3 simplified
  try {
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-generate", {
      prompt: `${imagePrompt.substring(0, 800)}. 1920x1080 Full HD, professional YouTube thumbnail.`,
      image_size: "landscape_16_9",
      style: "DESIGN",
      rendering_speed: "BALANCED",
      expand_prompt: false,
      negative_prompt: negativePrompt || "blurry, low quality, pixelated, watermark"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-generate (simplified)" };
  } catch (e) { console.warn(`Ideogram simplified failed: ${e.message}`); }

  // Attempt 3: Flux 2 Pro
  try {
    const taskId = await kieCreateTask(apiKey, "flux-2/pro-text-to-image", {
      prompt: `${imagePrompt}. Ultra high resolution 1920x1080 Full HD, crisp details.`,
      aspect_ratio: "16:9",
      resolution: "2K"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "flux-2/pro-text-to-image" };
  } catch (e) { console.warn(`Flux 2 failed: ${e.message}`); }

  return { url: null, model: "none" };
}

// ══════════════════════════════════════════════════════════════════
// GEMINI HELPER
// ══════════════════════════════════════════════════════════════════
function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1');
}

async function safeGeminiCall(prompt, temperature = 0.7) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 4096,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
  }

  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");

  const text = data.candidates[0].content.parts[0].text;

  try { return JSON.parse(text); } catch (_) {}
  try { return JSON.parse(repairJSON(text)); } catch (_) {}

  let jsonStr = text;
  if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
  else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

  return JSON.parse(repairJSON(jsonStr));
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    const { thumbnail_id, regenerate_image } = await req.json();

    if (!thumbnail_id) {
      return Response.json({ error: 'Missing thumbnail_id' }, { status: 400 });
    }

    // Load thumbnail + project in parallel
    const thumbs = await base44.asServiceRole.entities.ThumbnailConcepts.filter({ id: thumbnail_id });
    const thumb = thumbs[0];
    if (!thumb) return Response.json({ error: 'Thumbnail not found' }, { status: 404 });

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: thumb.project_id });
    const project = projects[0];

    const visualStyle = project?.visual_style || 'cinematic_realistic';

    console.log('════════════════════════════════════════');
    console.log('REPHRASE THUMBNAIL PROMPT (safety rewrite)');
    console.log(`Thumbnail: ${thumbnail_id} | Text: "${thumb.text_overlay}"`);
    console.log(`Style: ${visualStyle} | Regenerate: ${regenerate_image ? 'yes' : 'no'}`);
    console.log('════════════════════════════════════════');

    // ══════════════════════════════════════════════════════════════
    // GEMINI: Rewrite prompt to be policy-safe
    // ══════════════════════════════════════════════════════════════
    const result = await safeGeminiCall(`You are an expert AI image prompt rewriter. Your job: rewrite a REJECTED prompt to be 100% content-policy-safe while keeping the same EMOTIONAL IMPACT and COMPOSITION.

TARGET IMAGE MODEL: Ideogram V3 (renders text natively — put text in "quotation marks")
DIMENSIONS: 1920x1080 Full HD, 16:9 widescreen landscape

=== WHAT CAUSES REJECTIONS (avoid ALL) ===
- Any resemblance to real people (even indirect — "a man who looks presidential" triggers filters)
- Graphic violence, blood, gore, visible injuries, weapons pointed at people
- Minors in distressing or dangerous situations
- Copyrighted characters, logos, brand names
- Threatening scenarios (someone looming menacingly over another)
- Military/war imagery with casualties

=== SAFE REPLACEMENTS ===
- Real people → completely generic fictional archetypes with UNIQUE features (specific hair, clothing, build)
- Violence/threat → dramatic SHADOWS, SILHOUETTES, environmental danger (storm, fire glow, crumbling walls)
- Confrontation → opposing COLOR TEMPERATURE (warm vs cold), characters on opposite sides
- Fear/danger → atmospheric effects (fog, embers, dramatic backlighting, heavy shadows)
- Weapons → symbolic objects (a key, a document, a photograph, a broken chain)

=== KEEP UNCHANGED ===
- Exact composition layout, camera angles, framing
- Color palette and lighting approach
- Text overlays: preserve EXACT words "${thumb.text_overlay || 'none'}" in "quotation marks" so Ideogram V3 renders them
- 1920x1080 Full HD 16:9 widescreen landscape format
- Visual style: ${visualStyle}
- 200+ words, highly detailed
- Must start with "1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail"
- Must end with "Ultra high resolution, crisp sharp details, professional quality"

=== IDEOGRAM V3 PROMPT RULES ===
- Put text to render in "quotation marks" within the prompt
- Describe text styling: font weight, color, position, container
- Use spatial language: "anchored at left third", "filling upper half"
- Use photography language: "extreme close-up", "shallow depth of field", "rim lighting"
- NEVER use hex codes, pixel coordinates, or percentages
- Use named colors only (deep crimson, electric blue, pure white)

REJECTED PROMPT:
${thumb.image_prompt}

CONTEXT:
${thumb.concept_description || ''}

RESPOND IN EXACT JSON:
{
  "image_prompt": "The complete rewritten 200+ word safe prompt for Ideogram V3",
  "negative_prompt": "Comma-separated exclusions including original unsafe elements",
  "changes_summary": "Brief summary of what was changed to make it safe"
}`, 0.7);

    // Ensure 1920x1080 in rewritten prompt
    let newPrompt = result.image_prompt || '';
    if (!newPrompt.includes('1920x1080') && !newPrompt.includes('16:9')) {
      newPrompt = `1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail. ${newPrompt}`;
    }
    if (!newPrompt.toLowerCase().includes('crisp sharp details')) {
      newPrompt += '. Ultra high resolution, crisp sharp details, professional quality.';
    }

    // ══════════════════════════════════════════════════════════════
    // UPDATE DB + OPTIONALLY REGENERATE IMAGE
    // ══════════════════════════════════════════════════════════════
    const updateData = { image_prompt: newPrompt };

    // If requested and KIE_API_KEY available, regenerate the image too
    if (regenerate_image && KIE_API_KEY) {
      console.log('Regenerating image with safe prompt...');
      const { url, model } = await generateThumbnailImage(
        KIE_API_KEY,
        newPrompt,
        result.negative_prompt || "blurry, low quality, pixelated, watermark, low resolution, compressed, artifacts"
      );

      if (url) {
        updateData.image_url = url;
        console.log(`✓ Image regenerated via ${model}`);
      } else {
        console.warn('✗ Image regeneration failed — prompt saved without new image');
      }
    }

    await base44.asServiceRole.entities.ThumbnailConcepts.update(thumbnail_id, updateData);

    console.log('════════════════════════════════════════');
    console.log(`✓ Prompt rephrased | Image: ${updateData.image_url ? 'regenerated' : 'unchanged'}`);
    console.log(`Changes: ${result.changes_summary}`);
    console.log('════════════════════════════════════════');

    return Response.json({
      success: true,
      image_prompt: newPrompt,
      negative_prompt: result.negative_prompt,
      changes_summary: result.changes_summary,
      image_url: updateData.image_url || thumb.image_url || null,
      image_regenerated: !!updateData.image_url
    });

  } catch (error) {
    console.error("rephraseThumbnailPrompt error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});