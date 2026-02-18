import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// KIE AI UNIFIED IMAGE GENERATION (Ideogram V3 + Flux 2 fallback)
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
    throw new Error(`Kie createTask failed (${model}): ${result.msg || JSON.stringify(result)}`);
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

// Ideogram V3: Best text rendering, perfect for thumbnails with text overlays
// image_size: square | square_hd | portrait_4_3 | portrait_16_9 | landscape_4_3 | landscape_16_9
// style: AUTO | GENERAL | REALISTIC | DESIGN
// rendering_speed: TURBO | BALANCED | QUALITY
async function generateWithIdeogram(apiKey, prompt, negativePrompt) {
  console.log(`[Ideogram V3] Generating 1920x1080 thumbnail...`);
  const taskId = await kieCreateTask(apiKey, "ideogram/v3-generate", {
    prompt: `${prompt}. Ultra high resolution 1920x1080 Full HD output, crisp sharp details, professional YouTube thumbnail quality.`,
    image_size: "landscape_16_9",
    style: "DESIGN",
    rendering_speed: "QUALITY",
    expand_prompt: false,
    negative_prompt: negativePrompt || "blurry, low quality, pixelated, watermark, signature, low resolution, compressed, artifacts"
  });
  return await kiePollResult(apiKey, taskId);
}

// Flux 2 Pro fallback: High quality, good aspect ratio control
// aspect_ratio: "1:1" | "16:9" | "9:16" etc.
async function generateWithFlux2(apiKey, prompt) {
  console.log(`[Flux 2 Pro] Generating 1920x1080 thumbnail (fallback)...`);
  const taskId = await kieCreateTask(apiKey, "flux-2/pro-text-to-image", {
    prompt: `${prompt}. Ultra high resolution 1920x1080 Full HD, crisp details, professional thumbnail.`,
    aspect_ratio: "16:9",
    resolution: "2K"
  });
  return await kiePollResult(apiKey, taskId);
}

// Generate single thumbnail image with retry chain
async function generateThumbnailImage(apiKey, imagePrompt, negativePrompt) {
  // Attempt 1: Ideogram V3 (best for text in thumbnails)
  try {
    const url = await generateWithIdeogram(apiKey, imagePrompt, negativePrompt);
    return { url, model: "ideogram/v3-generate" };
  } catch (err1) {
    console.warn(`Ideogram V3 failed: ${err1.message}`);

    // Attempt 2: Ideogram V3 with simplified prompt
    try {
      const simplePrompt = imagePrompt.substring(0, 800);
      const url = await generateWithIdeogram(apiKey, simplePrompt, negativePrompt);
      return { url, model: "ideogram/v3-generate (simplified)" };
    } catch (err2) {
      console.warn(`Ideogram V3 simplified failed: ${err2.message}`);

      // Attempt 3: Flux 2 Pro fallback
      try {
        const url = await generateWithFlux2(apiKey, imagePrompt);
        return { url, model: "flux-2/pro-text-to-image" };
      } catch (err3) {
        console.error(`All image gen failed: ${err3.message}`);
        return { url: null, model: "none", error: err3.message };
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════
// GEMINI HELPER
// ══════════════════════════════════════════════════════════════════

function repairJSON(str) {
  let s = str;
  s = s.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  s = s.replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : '');
  return s;
}

async function safeGeminiCall(prompt, temperature = 0.8) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  try {
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
      throw new Error(`Gemini API Error ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error("Gemini returned no candidates.");
    }

    const text = data.candidates[0].content.parts[0].text;

    // 3-stage JSON parsing
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e1) {
      try {
        parsed = JSON.parse(repairJSON(text));
      } catch (e2) {
        let jsonStr = text;
        if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
        else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();
        parsed = JSON.parse(repairJSON(jsonStr));
      }
    }

    return { success: true, data: parsed, raw: text };
  } catch (error) {
    console.error("Gemini call failed:", error.message);
    return { success: false, error: error.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// VALIDATION
// ══════════════════════════════════════════════════════════════════

function validateThumbnail(thumbnail) {
  const issues = [];
  if (!thumbnail.image_prompt || thumbnail.image_prompt.length < 100) {
    issues.push('Image prompt too short (minimum 100 chars)');
  }
  if (!thumbnail.text_overlay || thumbnail.text_overlay.trim().length === 0) {
    issues.push('Missing text overlay');
  }
  if (thumbnail.text_overlay && thumbnail.text_overlay.split(' ').length > 5) {
    issues.push('Text overlay too long (max 5 words)');
  }
  if (!thumbnail.ctr_score || thumbnail.ctr_score < 1 || thumbnail.ctr_score > 10) {
    issues.push('Invalid CTR score');
  }
  return { valid: issues.length === 0, issues };
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id, video_title } = body;

    if (!project_id || !video_title) {
      return Response.json({ error: 'Missing required fields: project_id, video_title' }, { status: 400 });
    }

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) {
      return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });
    }

    // Load brand identity
    let thumbTone = 'cinematic documentary';
    let brandColors = '';
    let brandStyle = '';
    try {
      const brand_list = await base44.entities.BrandIdentities.list();
      const brand = brand_list.find(b => b.project_id === project_id);
      if (brand) {
        thumbTone = brand.thumbnail_tone || thumbTone;
        brandColors = brand.color_palette || '';
        brandStyle = brand.visual_style || '';
      }
    } catch (brandErr) {
      console.warn('Could not load brand identity:', brandErr.message);
    }

    // Load topic for context
    let topicContext = '';
    try {
      const allTopics = await base44.entities.Topics.filter({ project_id });
      const topic = allTopics.find(t => t.is_selected === true);
      topicContext = topic?.description || '';
    } catch (topicErr) {
      console.warn('Could not load topic context:', topicErr.message);
    }

    console.log('================================================');
    console.log('GENERATING THUMBNAIL CONCEPTS + IMAGES');
    console.log(`Video: ${video_title}`);
    console.log(`Brand tone: ${thumbTone}`);
    console.log(`Image gen: Ideogram V3 → Flux 2 Pro fallback`);
    console.log('================================================');

    // ══════════════════════════════════════════════════════════════
    // GEMINI PROMPT — Optimized for Ideogram V3
    // ══════════════════════════════════════════════════════════════
    // KEY CHANGE: Ideogram V3 excels at TEXT IN IMAGES, so we
    // instruct Gemini to include text overlay instructions directly
    // in the image_prompt (Ideogram will render them natively).
    // Removed all Fal.ai specific references.

    const prompt = `You are the world's #1 YouTube thumbnail psychologist and visual designer.

VIDEO TITLE: "${video_title}"
BRAND THUMBNAIL TONE: ${thumbTone}
${brandColors ? `BRAND COLORS: ${brandColors}` : ''}
${brandStyle ? `BRAND VISUAL STYLE: ${brandStyle}` : ''}
${topicContext ? `VIDEO CONTEXT: ${topicContext}` : ''}

CHANNEL TYPE: Faceless documentary/educational (no on-camera presenter)

IMAGE GENERATION MODEL: Ideogram V3 (excels at rendering text inside images)

================================================
THUMBNAIL PSYCHOLOGY TRIGGERS
================================================

1. CURIOSITY GAP: Incomplete/contradictory visuals creating unanswered questions
2. FEAR/WARNING: Danger, loss, mistakes — red dominance, warning symbols
3. FORBIDDEN KNOWLEDGE: Classified/suppressed info being revealed
4. SOCIAL PROOF/STATUS: Insider knowledge, winners vs losers contrast
5. EMOTIONAL CONTRAST: Visceral dissonance between opposing elements

================================================
DESIGN RULES
================================================

FORMAT: Always 1920x1080 (Full HD) 16:9 widescreen landscape
COLORS: Max 3 dominant colors, named only (no hex). High contrast for thumbnail size readability.
TEXT: Maximum 4 words (3 ideal). BOLD weight. Upper or lower third. Use quotation marks around text in the prompt so Ideogram renders it.
FACELESS: No presenter face. Use dramatic objects, data visualizations, environmental storytelling, symbolic compositions, split comparisons, close-up textures.

IDEOGRAM V3 PROMPT RULES:
- Put text to render in "quotation marks" within the prompt
- Describe text styling: font weight, color, position, container (badge, stamp, banner)
- Use spatial language: "anchored at left third", "filling upper half"
- Use photography language: "extreme close-up", "shallow depth of field", "rim lighting"
- Specify atmosphere: "ominous", "dramatic", "urgent", "mysterious"
- NEVER use hex codes or percentages
- Always specify "1920x1080 Full HD 16:9 widescreen landscape format"
- Always end prompt with "Ultra high resolution, crisp sharp details, professional quality"

================================================
CONCEPT TYPES (use variety across 10)
================================================

A=REVELATION, B=WARNING, C=COMPARISON, D=EMOTION CLOSE-UP, E=DATA SHOCK,
F=FORBIDDEN, G=TRANSFORMATION, H=SYMBOL, I=ENVIRONMENT, J=ABSTRACT METAPHOR

================================================
OUTPUT FORMAT (EXACT JSON)
================================================

{
  "ctr_strategy": "Overall psychological approach",
  "thumbnails": [
    {
      "rank": 1,
      "concept_type": "revelation/warning/comparison/emotion_closeup/data_shock/forbidden/transformation/symbol/environment/abstract",
      "psychological_trigger": "curiosity_gap/fear/forbidden_knowledge/social_proof/emotional_contrast",
      "concept_description": "Why this stops scrolls",
      "focal_point": "Primary visual element",
      "visual_metaphor": "Symbolic meaning",
      "color_scheme": "3 named colors with roles",
      "text_overlay": "Max 4 words",
      "text_style": "Font weight, container, position, color",
      "style_reference": "cinematic/minimal/documentary/dramatic/corporate/gritty",
      "ctr_score": 9,
      "why_it_stops_scrolling": "Psychological reason",
      "faceless_adaptation": "How it works without a face",
      "ab_test_alternative": "Which concept to A/B test against",
      "image_prompt": "1920x1080 Full HD 16:9 widescreen landscape format. [200+ word natural language prompt for Ideogram V3 with: spatial layout, foreground/midground/background, lighting, color palette with named colors, text in quotation marks as design elements with containers, atmosphere, render quality]. End with: Ultra high resolution, crisp sharp details, professional quality. NO hex codes.",
      "negative_prompt": "Comma-separated list of things to exclude from the image"
    }
  ]
}

REQUIREMENTS:
- Generate ALL 10 concepts using different concept types
- Every image_prompt must be 200+ words
- Every image_prompt must start with "1920x1080 Full HD 16:9 widescreen landscape format"
- Every image_prompt must end with "Ultra high resolution, crisp sharp details, professional quality"
- Every concept must score 8+ CTR (Tier 1 only)
- Rank by CTR potential
- Faceless channel only
- Include "negative_prompt" for each (things to exclude)
- Text overlays in quotation marks within image_prompt so Ideogram V3 renders them

Generate 10 premium viral thumbnail concepts now.`;

    const result = await safeGeminiCall(prompt, 0.9);

    if (!result.success) {
      console.error('Gemini failed:', result.error);
      return Response.json({ error: result.error }, { status: 500 });
    }

    if (!result.data.thumbnails || !Array.isArray(result.data.thumbnails)) {
      return Response.json({ error: 'Invalid response format from Gemini' }, { status: 500 });
    }

    // ══════════════════════════════════════════════════════════════
    // DELETE EXISTING THUMBNAILS
    // ══════════════════════════════════════════════════════════════
    try {
      const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
      const deletePromises = existing.map(e => base44.entities.ThumbnailConcepts.delete(e.id));
      await Promise.all(deletePromises);
    } catch (deleteErr) {
      console.warn('Failed to delete existing thumbnails:', deleteErr.message);
    }

    // ══════════════════════════════════════════════════════════════
    // SAVE CONCEPTS + GENERATE IMAGES IN PARALLEL
    // ══════════════════════════════════════════════════════════════

    const thumbnails = [];
    const skipped = [];
    let qualityWarnings = 0;

    // Step 1: Save all concepts first (parallel)
    const savePromises = result.data.thumbnails.map(async (t, i) => {
      const validation = validateThumbnail(t);
      if (!validation.valid) {
        qualityWarnings++;
        console.warn(`Thumbnail ${t.rank} issues: ${validation.issues.join(', ')}`);
      }

      let imagePrompt = t.image_prompt || '';
      // Ensure 1920x1080 / 16:9 specification
      if (!imagePrompt.toLowerCase().includes('1920x1080') && !imagePrompt.toLowerCase().includes('16:9')) {
        imagePrompt = `1920x1080 Full HD 16:9 widescreen landscape format, graphic design composition. ${imagePrompt}`;
      }
      // Ensure quality suffix
      if (!imagePrompt.toLowerCase().includes('crisp sharp details')) {
        imagePrompt += '. Ultra high resolution, crisp sharp details, professional quality.';
      }

      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id,
          rank: t.rank || i + 1,
          concept_type: t.concept_type || 'revelation',
          psychological_trigger: t.psychological_trigger || 'curiosity_gap',
          concept_description: t.concept_description || '',
          focal_point: t.focal_point || '',
          visual_metaphor: t.visual_metaphor || '',
          color_scheme: t.color_scheme || '',
          text_overlay: t.text_overlay || '',
          text_style: t.text_style || '',
          style_reference: t.style_reference || 'cinematic',
          ctr_score: t.ctr_score || 7,
          why_it_stops_scrolling: t.why_it_stops_scrolling || '',
          faceless_adaptation: t.faceless_adaptation || '',
          ab_test_alternative: t.ab_test_alternative || '',
          image_prompt: imagePrompt,
          quality_valid: validation.valid,
          is_selected: false
        });

        console.log(`✓ Saved concept ${t.rank}: [${t.concept_type}] "${t.text_overlay}" CTR: ${t.ctr_score}/10`);
        return {
          success: true,
          record,
          imagePrompt,
          negativePrompt: t.negative_prompt || "blurry, low quality, pixelated, watermark, ugly, distorted text, low resolution, compressed, jpeg artifacts, grainy, out of focus"
        };
      } catch (saveErr) {
        console.error(`✗ Failed to save concept ${t.rank}:`, saveErr.message);
        skipped.push({ rank: t.rank, error: saveErr.message });
        return { success: false };
      }
    });

    const savedResults = await Promise.all(savePromises);
    const successfullySaved = savedResults.filter(r => r.success);

    // Step 2: Generate images for ALL saved concepts in parallel
    console.log(`\n═══ Generating ${successfullySaved.length} thumbnail images ═══`);

    const imagePromises = successfullySaved.map(async (saved) => {
      const { record, imagePrompt, negativePrompt } = saved;
      try {
        const { url, model, error } = await generateThumbnailImage(
          KIE_API_KEY,
          imagePrompt,
          negativePrompt
        );

        if (url) {
          // Update the thumbnail record with the generated image URL
          await base44.asServiceRole.entities.ThumbnailConcepts.update(record.id, {
            image_url: url
          });
          console.log(`✓ Image generated for rank ${record.rank} via ${model}`);
          thumbnails.push({ ...record, image_url: url, model_used: model });
        } else {
          console.warn(`✗ No image for rank ${record.rank}: ${error}`);
          thumbnails.push({ ...record, image_url: null, model_used: 'failed' });
        }
      } catch (imgErr) {
        console.error(`✗ Image gen error rank ${record.rank}:`, imgErr.message);
        thumbnails.push({ ...record, image_url: null, model_used: 'error' });
      }
    });

    await Promise.all(imagePromises);

    // Step 3: Update project step
    try {
      await base44.entities.Projects.update(project_id, { current_step: 12 });
    } catch (updateErr) {
      console.warn('Failed to update project step:', updateErr.message);
    }

    const imagesGenerated = thumbnails.filter(t => t.image_url).length;

    console.log('================================================');
    console.log(`Concepts saved: ${successfullySaved.length}`);
    console.log(`Images generated: ${imagesGenerated}`);
    console.log(`Skipped: ${skipped.length}`);
    console.log(`Quality warnings: ${qualityWarnings}`);
    console.log(`CTR strategy: ${result.data.ctr_strategy}`);
    console.log('================================================');

    return Response.json({
      success: true,
      thumbnails,
      meta: {
        ctr_strategy: result.data.ctr_strategy,
        total_generated: result.data.thumbnails.length,
        total_saved: successfullySaved.length,
        total_images: imagesGenerated,
        total_skipped: skipped.length,
        quality_warnings: qualityWarnings,
        image_model_primary: "ideogram/v3-generate",
        image_model_fallback: "flux-2/pro-text-to-image",
        skipped_details: skipped
      }
    });

  } catch (error) {
    console.error('generateThumbnailConcepts error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});