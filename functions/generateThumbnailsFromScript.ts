import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// KIE AI IMAGE GENERATION (Ideogram V3 primary, Flux 2 Pro fallback)
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
  // Attempt 1: Ideogram V3 — best text rendering for thumbnails
  try {
    console.log(`[Ideogram V3] Generating...`);
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
    const short = imagePrompt.substring(0, 800);
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-generate", {
      prompt: `${short}. 1920x1080 Full HD, professional YouTube thumbnail.`,
      image_size: "landscape_16_9",
      style: "DESIGN",
      rendering_speed: "BALANCED",
      expand_prompt: false,
      negative_prompt: negativePrompt || "blurry, low quality, pixelated, watermark"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-generate (simplified)" };
  } catch (e) { console.warn(`Ideogram simplified failed: ${e.message}`); }

  // Attempt 3: Flux 2 Pro fallback
  try {
    console.log(`[Flux 2 Pro] Fallback...`);
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
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

async function safeGeminiCall(prompt, temperature = 0.8, maxTokens = 8192, retries = 3) {
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + geminiApiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (response.status === 429) {
      const waitMs = Math.pow(2, attempt + 1) * 5000;
      console.log(`Rate limited, waiting ${waitMs / 1000}s (retry ${attempt + 1}/${retries})...`);
      await new Promise(r => setTimeout(r, waitMs));
      continue;
    }

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
    }

    const data = await response.json();
    if (!data.candidates?.length) throw new Error("No candidates from Gemini");

    const text = data.candidates[0].content.parts[0].text;

    // 3-stage JSON parsing
    try { return JSON.parse(text); } catch (_) {}
    try { return JSON.parse(repairJSON(text)); } catch (_) {}

    let jsonStr = text;
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();

    try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}

    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]);

    throw new Error("Failed to parse Gemini JSON");
  }

  throw new Error("Gemini rate limit exceeded after retries");
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
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    const { project_id, reference_style, template_blueprint, niche_dna, niche_name, selected_title } = await req.json();

    // ══════════════════════════════════════════════════════════════
    // LOAD PROJECT, SCRIPT, TOPIC
    // ══════════════════════════════════════════════════════════════
    const [projects, allScripts, allTopics] = await Promise.all([
      base44.entities.Projects.filter({ id: project_id }),
      base44.entities.Scripts.filter({ project_id }),
      base44.entities.Topics.filter({ project_id })
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script) return Response.json({ error: 'No final script found' }, { status: 400 });

    const topic = allTopics.find(t => t.is_selected === true);
    if (!topic) return Response.json({ error: 'No selected topic found' }, { status: 400 });

    const scriptContent = script.full_script || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
    const truncatedScript = scriptContent.substring(0, 3000);

    // Load supporting context in parallel
    const [scenesResult, brandsResult] = await Promise.allSettled([
      base44.entities.Scenes.filter({ project_id }),
      base44.entities.BrandIdentities.filter({ project_id })
    ]);

    let sceneContext = '';
    if (scenesResult.status === 'fulfilled' && scenesResult.value.length > 0) {
      const sorted = scenesResult.value.sort((a, b) => a.scene_number - b.scene_number);
      sceneContext = `\nSCENE VISUAL PROMPTS:\n${sorted.slice(0, 5).map(s => `Scene ${s.scene_number}: ${(s.image_prompt || s.narration_text || '').substring(0, 150)}`).join('\n')}`;
    }

    let brandContext = '';
    if (brandsResult.status === 'fulfilled' && brandsResult.value.length > 0) {
      const b = brandsResult.value[0];
      brandContext = `\nBRAND: Tone=${b.thumbnail_tone || 'cinematic'}, Colors=${b.color_primary || ''} / ${b.color_secondary || ''} / ${b.color_accent || ''}`;
    }

    const rawStyle = project.visual_style || 'cinematic_realistic';
    const childStyles = ['picstory_cocomelon', 'cartoon_2d'];
    const visualStyle = childStyles.includes(rawStyle) ? 'cinematic_realistic' : rawStyle;

    // Build optional instruction blocks
    const styleInstruction = reference_style
      ? `\nREFERENCE STYLE: Replicate this exact visual style, layout, composition:\n${reference_style}`
      : '';

    const templateInstruction = template_blueprint
      ? `\nTEMPLATE BLUEPRINT (from proven viral thumbnail — follow EXACT composition):\nComposition: ${template_blueprint.composition_blueprint || ''}\nColors: ${template_blueprint.color_strategy || ''}\nText: ${template_blueprint.text_strategy || ''}\nAction: ${template_blueprint.character_action_notes || ''}\nType: ${template_blueprint.template_type || ''}\nTone: ${template_blueprint.emotional_tone || ''}\nPrompt: ${template_blueprint.recreate_prompt || ''}`
      : '';

    const selectedTitleInstruction = selected_title
      ? `\nMANDATORY TITLE: "${selected_title}" — derive text_overlay (2-4 curiosity-gap words) from this title. Text MUST appear as MASSIVE BOLD rendered text in the image.`
      : '';

    const nicheDnaInstruction = niche_dna
      ? `\nNICHE DNA (from ${niche_name || 'uploaded'} thumbnails — follow all patterns):\n${niche_dna.substring(0, 1500)}`
      : '';

    console.log('════════════════════════════════════════');
    console.log('THUMBNAILS FROM SCRIPT (2-phase + image gen)');
    console.log(`Video: ${script.title}`);
    console.log(`Style: ${visualStyle} | Model: Ideogram V3 → Flux 2`);
    console.log('════════════════════════════════════════');

    // ══════════════════════════════════════════════════════════════
    // PHASE 1: Forensic concept descriptions
    // ══════════════════════════════════════════════════════════════
    const phase1Prompt = `You are the world's #1 YouTube thumbnail conceptualizer.

=== SAFETY ===
ALL characters 100% FICTIONAL. No real people, celebrities, copyrighted characters. No graphic violence. Replace unsafe elements with symbolic drama (shadows, silhouettes, environmental tension).

VIDEO: "${topic.title}" | TITLE: "${script.title}" | NICHE: "${project.niche}" | STYLE: "${visualStyle}"
${brandContext}${sceneContext}${styleInstruction}${templateInstruction}${nicheDnaInstruction}${selectedTitleInstruction}

SCRIPT (find the most shocking, emotional, curiosity-inducing moments):
${truncatedScript}

=== MISSION ===
Produce 3 THUMBNAIL CONCEPT BLUEPRINTS — forensic-level visual descriptions.

IMAGE MODEL: Ideogram V3 (excellent at rendering text in images natively)
DIMENSIONS: 1920x1080 Full HD, 16:9 widescreen landscape

=== THUMBNAIL CHECKLIST ===
1. CHARACTERS = ACTION: holding, shielding, pointing, reacting — NEVER just standing. Micro-details (tear, clenched fist). Villains: looming, shadowy, larger. Characters INTERACT.
2. TEXT = CURIOSITY GAP: 2-4 words creating a question, NOT stating facts. In "quotation marks" so Ideogram renders them. MASSIVE, readable at phone size. Never covering faces.
3. COMPOSITION = "HEAVEN vs HELL": Extreme warm vs cold contrast. Jagged split lines. Heavy vignette. Heavy depth of field — blurred backgrounds, razor-sharp subjects.
4. SCROLL-STOP: One dominant emotion in 0.3 seconds. Visual vectors (pointing finger, gaze direction).

For EACH concept write a 300+ word "forensic_description" covering:
- Narrative hook & curiosity gap
- Exact layout (split-screen, centered hero, the reveal, etc.)
- Every subject: FICTIONAL archetype, age/build/skin/face, hair, expression (which muscles engaged), ACTION they're doing, clothing (specific color names), body angle, lighting, interaction with others
- Background: setting, blur level, atmosphere (smoke, embers, particles, God rays)
- Text: exact 2-4 words in "quotation marks", font style, color, position, container
- Color grading: extreme contrast, saturation strategy
- Must be WIDE 16:9 landscape — describe elements in LEFT/RIGHT/CENTER of wide frame

RESPOND IN EXACT JSON:
{
  "concepts": [
    {
      "rank": 1,
      "template_type": "Face-Off / The Reveal / The Contrast / The Reaction / Bold Statement / The Mystery / The Warning",
      "narrative_moment": "Which script moment and WHY most clickable",
      "curiosity_gap": "The question viewers must click to answer",
      "emotional_trigger": "Primary emotion in 0.3s",
      "scroll_stop_reason": "1 sentence",
      "text_overlay": "2-4 words",
      "forensic_description": "300+ word exhaustive visual description"
    }
  ]
}`;

    console.log("Phase 1: Forensic concepts...");
    const phase1Result = await safeGeminiCall(phase1Prompt, 0.95, 8192);

    await new Promise(r => setTimeout(r, 2000));

    // ══════════════════════════════════════════════════════════════
    // PHASE 2: Transform into Ideogram V3 image prompts
    // ══════════════════════════════════════════════════════════════
    const phase2TitleRule = selected_title
      ? `\nMANDATORY: text_overlay derived from "${selected_title}" MUST appear as MASSIVE BOLD text rendered in every image. Include exact words in "quotation marks" in every image_prompt.`
      : '';

    const phase2Prompt = `You are the #1 AI image prompt engineer for YouTube thumbnails.
TARGET MODEL: Ideogram V3 (excels at rendering text in images natively — put text in "quotation marks")
DIMENSIONS: 1920x1080 Full HD, 16:9 widescreen landscape
VISUAL STYLE: "${visualStyle}"

=== SAFETY ===
All characters 100% FICTIONAL. No real people. No graphic violence. Use symbolic drama. Focus on LIGHTING, COMPOSITION, COLOR CONTRAST, EMOTION, ATMOSPHERE.
${phase2TitleRule}

=== CONCEPTS TO TRANSFORM ===
${JSON.stringify(phase1Result.concepts, null, 2)}

=== PROMPT RULES ===
1. Every prompt STARTS with: "1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail, graphic design composition"
2. Put text overlays in "quotation marks" — Ideogram V3 renders these natively
3. Describe text as MASSIVE design unit: 'enormous bold white Impact text reading "EXACT WORDS" with thick black outline and drop shadow, at bottom center'
4. Use SPATIAL language (left third, upper half), PHOTOGRAPHY language (rim lighting, shallow DoF, heavy bokeh)
5. Use specific COLOR NAMES (deep crimson, electric blue) — NO hex codes, NO percentages
6. Characters in ACTION — never just standing. Describe expressions, clothing, interaction
7. Extreme warm vs cold contrast. Heavy vignette. Blurred backgrounds, sharp foreground.
8. End every prompt with: "Ultra high resolution, crisp sharp details, professional quality"
9. Each prompt 300+ words minimum.
10. NEVER use children's/educational/textbook styles — always cinematic/dramatic

RESPOND IN EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "template_type": "from Phase 1",
      "concept_description": "2-3 sentence summary",
      "emotional_hook": "What emotion + why it stops scrolling",
      "scroll_stop_reason": "1 sentence",
      "text_overlay": "exact text from Phase 1",
      "font_style": "heavy Impact / bold condensed sans-serif",
      "font_color": "white with thick black outline",
      "font_effects": "thick black outline, heavy drop shadow",
      "background_description": "blurred setting with atmospheric effects",
      "subject_description": "All subjects with physical details, expressions, actions",
      "accent_color": "eye-catching color name",
      "color_scheme": "warm saturated / cold moody / high contrast",
      "visual_effects": "rim lighting, bokeh, lens flare, vignette",
      "style_reference": "cinema / minimal / documentary",
      "ctr_score": 9,
      "negative_prompt": "blurry, low quality, pixelated, watermark, low resolution, compressed, ugly, distorted text, jpeg artifacts",
      "image_prompt": "300+ word Ideogram V3 prompt starting with '1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail' — full composition, subjects in action, text in quotation marks, lighting, atmosphere, ending with quality suffix"
    }
  ]
}`;

    console.log("Phase 2: Ideogram V3 image prompts...");
    const phase2Result = await safeGeminiCall(phase2Prompt, 0.85, 8192);

    // ══════════════════════════════════════════════════════════════
    // DELETE EXISTING THUMBNAILS (parallel)
    // ══════════════════════════════════════════════════════════════
    try {
      const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
      await Promise.all(existing.map(e => base44.entities.ThumbnailConcepts.delete(e.id)));
    } catch (delErr) {
      console.warn('Delete existing failed:', delErr.message);
    }

    // ══════════════════════════════════════════════════════════════
    // SAVE CONCEPTS (parallel)
    // ══════════════════════════════════════════════════════════════
    const savePromises = (phase2Result.thumbnails || []).map(async (t, i) => {
      const styleRef = (t.style_reference || 'cinema').split('/')[0].trim().toLowerCase();
      const validStyles = ['cinema', 'minimal', 'documentary'];

      // Ensure 1920x1080 in prompt
      let imagePrompt = t.image_prompt || '';
      if (!imagePrompt.includes('1920x1080') && !imagePrompt.includes('16:9')) {
        imagePrompt = `1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail. ${imagePrompt}`;
      }
      if (!imagePrompt.toLowerCase().includes('crisp sharp details')) {
        imagePrompt += '. Ultra high resolution, crisp sharp details, professional quality.';
      }

      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id,
          rank: t.rank || i + 1,
          concept_description: `[${t.template_type}] ${t.concept_description}\n\n🎯 Hook: ${t.emotional_hook}\n🛑 Scroll-stop: ${t.scroll_stop_reason}`,
          facial_expression: t.subject_description,
          visual_metaphor: t.template_type,
          color_scheme: `${t.color_scheme} | Accent: ${t.accent_color} | ${t.font_color} | Effects: ${t.visual_effects}`,
          text_overlay: t.text_overlay,
          style_reference: validStyles.includes(styleRef) ? styleRef : 'cinema',
          ctr_score: t.ctr_score,
          image_prompt: imagePrompt,
          is_selected: false
        });
        return { success: true, record, imagePrompt, negativePrompt: t.negative_prompt };
      } catch (err) {
        console.error(`Failed to save concept ${t.rank}:`, err.message);
        return { success: false };
      }
    });

    const savedResults = await Promise.all(savePromises);
    const saved = savedResults.filter(r => r.success);

    // ══════════════════════════════════════════════════════════════
    // GENERATE IMAGES FOR ALL CONCEPTS (parallel)
    // ══════════════════════════════════════════════════════════════
    console.log(`\n═══ Generating ${saved.length} thumbnail images ═══`);

    const imagePromises = saved.map(async ({ record, imagePrompt, negativePrompt }) => {
      try {
        const { url, model } = await generateThumbnailImage(KIE_API_KEY, imagePrompt, negativePrompt);
        if (url) {
          await base44.asServiceRole.entities.ThumbnailConcepts.update(record.id, { image_url: url });
          console.log(`✓ Rank ${record.rank} image via ${model}`);
          return { ...record, image_url: url, model_used: model };
        }
        console.warn(`✗ Rank ${record.rank} — no image generated`);
        return { ...record, image_url: null, model_used: 'failed' };
      } catch (err) {
        console.error(`✗ Rank ${record.rank} image error:`, err.message);
        return { ...record, image_url: null, model_used: 'error' };
      }
    });

    const thumbnails = await Promise.all(imagePromises);
    const imagesGenerated = thumbnails.filter(t => t.image_url).length;

    console.log('════════════════════════════════════════');
    console.log(`Concepts: ${saved.length} | Images: ${imagesGenerated}`);
    console.log(`Models: Ideogram V3 → Flux 2 Pro`);
    console.log('════════════════════════════════════════');

    return Response.json({
      success: true,
      thumbnails,
      meta: {
        total_concepts: saved.length,
        total_images: imagesGenerated,
        image_model_primary: "ideogram/v3-generate",
        image_model_fallback: "flux-2/pro-text-to-image",
        dimensions: "1920x1080"
      }
    });

  } catch (error) {
    console.error("generateThumbnailsFromScript error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});