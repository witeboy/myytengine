import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

async function kieCreateTask(apiKey, model, input) {
  const res = await fetch(`${KIE_BASE}/createTask`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input })
  });
  const result = await res.json();
  if (!res.ok || result.code !== 200) throw new Error(`Kie createTask (${model}): ${result.msg || JSON.stringify(result)}`);
  return result.data.taskId;
}

async function kiePollResult(apiKey, taskId, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${KIE_BASE}/recordInfo?taskId=${taskId}`, { headers: { "Authorization": `Bearer ${apiKey}` } });
    const poll = await res.json();
    if (poll.code !== 200) continue;
    if (poll.data?.state === "success") {
      const rj = JSON.parse(poll.data.resultJson || "{}");
      return rj.resultUrls?.[0] || rj.url || rj.imageUrl || null;
    }
    if (poll.data?.state === "fail") throw new Error(poll.data?.failMsg || "Task failed");
  }
  throw new Error(`Task ${taskId} timed out`);
}

async function generateThumbnailImage(apiKey, imagePrompt, negativePrompt) {
  const neg = negativePrompt || "blurry, low quality, pixelated, watermark, low resolution, compressed, artifacts";
  // Attempt 1: Ideogram V3 QUALITY
  try {
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-generate", {
      prompt: imagePrompt.substring(0, 1500) + ". Ultra high resolution 1920x1080 Full HD, crisp sharp details, professional quality.",
      image_size: "landscape_16_9", style: "DESIGN", rendering_speed: "QUALITY", expand_prompt: false, negative_prompt: neg
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-generate" };
  } catch (e) { console.warn("Ideogram V3 failed:", e.message); }
  // Attempt 2: Ideogram V3 BALANCED
  try {
    const taskId = await kieCreateTask(apiKey, "ideogram/v3-generate", {
      prompt: imagePrompt.substring(0, 800) + ". 1920x1080 Full HD, professional YouTube thumbnail.",
      image_size: "landscape_16_9", style: "DESIGN", rendering_speed: "BALANCED", expand_prompt: false, negative_prompt: neg
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "ideogram/v3-generate (simplified)" };
  } catch (e) { console.warn("Ideogram simplified failed:", e.message); }
  // Attempt 3: Flux 2 Pro
  try {
    const taskId = await kieCreateTask(apiKey, "flux-2/pro-text-to-image", {
      prompt: imagePrompt.substring(0, 1500) + ". Ultra high resolution 1920x1080 Full HD, crisp details.",
      aspect_ratio: "16:9", resolution: "2K"
    });
    const url = await kiePollResult(apiKey, taskId);
    if (url) return { url, model: "flux-2/pro-text-to-image" };
  } catch (e) { console.warn("Flux 2 failed:", e.message); }
  return { url: null, model: "none" };
}

function repairJSON(str) {
  return str.replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1').replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

async function callGemini(prompt, temperature = 0.8, maxTokens = 8192, retries = 3) {
  const key = Deno.env.get("GEMINI_API_KEY");
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + key,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: "application/json" } }) }
    );
    if (response.status === 429) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt + 1) * 5000));
      continue;
    }
    if (!response.ok) { const err = await response.json(); throw new Error("Gemini " + response.status + ": " + (err.error?.message || "Unknown")); }
    const data = await response.json();
    if (!data.candidates?.length) throw new Error("No candidates from Gemini");
    const text = data.candidates[0].content.parts[0].text;
    try { return JSON.parse(text); } catch (_) {}
    try { return JSON.parse(repairJSON(text)); } catch (_) {}
    let jsonStr = text;
    if (text.includes("```json")) jsonStr = text.split("```json")[1].split("```")[0].trim();
    else if (text.includes("```")) jsonStr = text.split("```")[1].split("```")[0].trim();
    try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}
    const m = jsonStr.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Failed to parse Gemini JSON");
  }
  throw new Error("Gemini rate limit exceeded after retries");
}

function buildPhase1Prompt(topic, script, project, brandCtx, titleCtx, truncScript) {
  return `You are the world's #1 YouTube thumbnail text copywriter. 10+ year track record. 12%+ CTR.

MISSION: Analyze script. Extract visual anchors. Extract climax. Generate 10 scroll-stopping text options. Score each. Pick top 3.

VIDEO TOPIC: "${topic.title}"
VIDEO TITLE: "${script.title}"
NICHE: "${project.niche}"
${brandCtx}${titleCtx}

SCRIPT:
${truncScript}

STEP 0: SCRIPT ANCHOR EXTRACTION
Extract: 1) VILLAIN OBJECT (physical thing causing harm), 2) VICTIM OBJECT (thing being harmed), 3) TRAP SYMBOL (visual metaphor), 4) SHOCK DATA (specific number/percentage), 5) CONTRAST PAIR (illusion vs reality), 6) NICHE OBJECTS (3-5 recognizable items).

STEP 1: CLIMAX - Find the ONE highest-stakes sentence.

STEP 2: GENERATE 10 TEXT OPTIONS
Category A (4): ANCHOR-SPECIFIC CURIOSITY GAP - Reference villain/victim object. GOOD: "YOU OWN NOTHING", BAD: "THEY LIED"
Category B (3): ANCHOR-SPECIFIC FORBIDDEN KNOWLEDGE - Reference trap/shock data. GOOD: "30 YEAR TRAP", BAD: "STOP WATCHING"
Category C (3): ANCHOR-SPECIFIC SHOCK - Use contrast pair. GOOD: "DREAM HOME?", BAD: "IT'S FAKE"

Rules: MAX 3 WORDS, ALL CAPS, never reveal answer, BANNED: "AMAZING"/"INCREDIBLE"/"YOU WON'T BELIEVE". At least 6/10 must contain a topic-specific word.

STEP 3: For each, specify text_color (vivid crimson/neon yellow/white/amber orange/lime green), matching background_color (teal/purple/navy/indigo/magenta), position, size, container, font.

STEP 4: For each, specify subject_hook_type with anchor object visible.

STEP 5: Score 1-10 on stop_power, curiosity, topic_specificity, clarity, universality.

RESPOND IN JSON:
{"script_anchors":{"villain_object":"","victim_object":"","trap_symbol":"","shock_data":"","contrast_pair":{"illusion":"","reality":""},"niche_objects":[]},"script_climax":"","curiosity_gap_identified":"","text_options":[{"rank":1,"text":"","word_count":2,"category":"","topic_anchor_word":"","psychological_mechanism":"","script_connection":"","negative_framing_applied":true,"specificity_test":"","text_color_name":"","background_color_pair":"","outline_color":"","shadow":"","container":"","container_color":null,"position":"","size":"","font_style":"","subject_hook_type":"","subject_hook_description":"","anchor_object_in_subject":"","stop_power_score":9,"curiosity_score":9,"topic_specificity_score":9,"clarity_score":9,"universality_score":8,"total_ctr_score":9.0,"why_this_wins":""}],"top_3_winners":[1,2,3],"topic_anchor_count":7,"emotion_only_count":3}`;
}

function buildPhase2Prompt(topic, script, project, visualStyle, brandCtx, sceneCtx, styleInstr, templateInstr, nicheInstr, phase1, winningTexts, anchors) {
  return `You are the world's #1 thumbnail visual architect using the THREE-ELEMENT COMPOSITION RULE.

3 elements only: SUBJECT (with anchor object), TEXT, BACKGROUND. ALL characters fictional. No violence.

VIDEO: "${topic.title}" | TITLE: "${script.title}" | NICHE: "${project.niche}" | STYLE: "${visualStyle}"
${brandCtx}${sceneCtx}${styleInstr}${templateInstr}${nicheInstr}

CLIMAX: "${phase1.script_climax || ''}"
ANCHORS: ${JSON.stringify(anchors)}

WINNING TEXTS: ${JSON.stringify(winningTexts)}

For each concept: Element 1 (subject with anchor on left/right third), Element 2 (text from Phase 1), Element 3 (complementary background with anchor echo). Dead zone bottom-right clear. Write 300+ word forensic description.

RESPOND IN JSON:
{"concepts":[{"rank":1,"winning_text":"","winning_text_design":{"color":"","outline":"","shadow":"","container":"","container_color":null,"position":"","size":"","font_style":""},"element_1_subject":{"hook_type":"","description":"","anchor_object":"","anchor_placement":"","position_on_grid":"","eye_direction":"","crop":""},"element_3_background":{"dominant_color":"","color_pair_reason":"","blur_level":"","vignette":"","atmospheric_effects":"","anchor_echo":"","psychological_purpose":"","avoids_youtube_ui":true},"template_type":"","narrative_moment":"","text_visual_synergy":"","negative_space_strategy":"","dead_zone_clear":true,"three_element_check":true,"topic_identifiable_without_text":true,"emotional_trigger":"","scroll_stop_reason":"","forensic_description":""}]}`;
}

function buildPhase3Prompt(visualStyle, anchors, concepts) {
  const sb = visualStyle === 'anime' || visualStyle === 'cinematic_anime' ? 'Dramatic anime style with cel-shading, vibrant coloring.'
    : visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic' ? 'Hyper-real cinematic photography, 4K HDR, DSLR shallow depth of field.'
    : visualStyle === 'oil_painting' ? 'Painterly oil painting with brushstrokes, chiaroscuro lighting.'
    : visualStyle === 'comic_book' ? 'Comic book style with halftone dots, bold ink outlines.' : 'Cinematic dramatic lighting, professional quality.';

  return `You are the #1 Ideogram V3 prompt engineer for YouTube thumbnails.

MODEL: Ideogram V3 (text in "QUOTATION MARKS"). 1920x1080 Full HD 16:9 landscape. STYLE: "${visualStyle}"
All characters FICTIONAL. No violence.

ANCHORS: ${JSON.stringify(anchors)}
CONCEPTS: ${JSON.stringify(concepts)}

For each concept write a 300+ word prompt with 5 BLOCKS:
Block 1: Opening (1920x1080 thumbnail with 3 elements)
Block 2: Text (massive bold text in quotes with color/outline/shadow/position)
Block 3: Subject with anchor (on opposing third to text)
Block 4: Background with anchor echo (complementary color, blur, vignette, atmosphere)
Block 5: ${sb} Heavy vignette. Bottom-right clear. Ultra high resolution.

No hex codes. Named colors only. Text in quotes. 3 elements only.

RESPOND IN JSON:
{"thumbnails":[{"rank":1,"template_type":"","concept_description":"","text_overlay":"","text_design":{"color":"","outline":"","shadow":"","container":"","container_color":null,"position":"","size":"","font_style":""},"subject_design":{"hook_type":"","grid_position":"","anchor_object":"","anchor_placement":"","eye_direction":"","crop":""},"background_design":{"dominant_color":"","blur":"","vignette":"","atmosphere":"","anchor_echo":"","psychological_purpose":""},"script_anchor_used":"","topic_identifiable":"","text_visual_synergy":"","emotional_hook":"","scroll_stop_reason":"","accent_color":"","color_scheme":"","visual_effects":"","style_reference":"cinema","ctr_score":9,"dead_zone_clear":true,"three_element_count":3,"negative_prompt":"blurry, low quality, pixelated, watermark, distorted text, misspelled text, small text, cluttered, pure red background, pure white background, dark grey background","image_prompt":""}]}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const KIE_API_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_API_KEY) return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });

    const { project_id, reference_style, template_blueprint, niche_dna, niche_name, selected_title } = await req.json();

    // Load data
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

    let scenesData = [], brandsData = [];
    try { scenesData = await base44.entities.Scenes.filter({ project_id }); } catch (e) { console.warn('Scenes fetch failed:', e.message); }
    try { brandsData = await base44.entities.BrandIdentities.filter({ project_id }); } catch (e) { console.warn('Brands fetch failed:', e.message); }

    let sceneCtx = '';
    if (Array.isArray(scenesData) && scenesData.length > 0) {
      const sorted = [...scenesData].sort((a, b) => a.scene_number - b.scene_number);
      sceneCtx = "\nSCENES:\n" + sorted.slice(0, 5).map(s => `S${s.scene_number}: ${(s.image_prompt || s.narration_text || '').substring(0, 150)}`).join('\n');
    }
    let brandCtx = '';
    if (Array.isArray(brandsData) && brandsData.length > 0) {
      const b = brandsData[0];
      brandCtx = "\nBRAND: Tone=" + (b.thumbnail_tone || 'cinematic') + ", Colors=" + (b.color_primary || '') + "/" + (b.color_secondary || '') + "/" + (b.color_accent || '');
    }

    const rawStyle = project.visual_style || 'cinematic_realistic';
    const visualStyle = ['picstory_cocomelon', 'cartoon_2d'].includes(rawStyle) ? 'cinematic_realistic' : rawStyle;
    const styleInstr = reference_style ? "\nREF STYLE: " + reference_style : '';
    const templateInstr = template_blueprint ? "\nTEMPLATE: " + JSON.stringify(template_blueprint).substring(0, 400) : '';
    const nicheInstr = niche_dna ? "\nNICHE DNA (" + (niche_name || '') + "):\n" + niche_dna.substring(0, 800) : '';
    const titleCtx = selected_title ? '\nSEO TITLE: "' + selected_title + '"' : '';

    console.log("THUMBNAILS v3: " + script.title + " | Style: " + visualStyle);

    // Phase 1
    console.log("Phase 1: Script anchors + text engine...");
    const phase1 = await callGemini(buildPhase1Prompt(topic, script, project, brandCtx, titleCtx, truncatedScript), 0.95, 4096);

    const top3 = phase1.top_3_winners || [1, 2, 3];
    const allTexts = phase1.text_options || [];
    const winners = top3.map(r => allTexts.find(t => t.rank === r) || allTexts[r - 1]).filter(Boolean).slice(0, 3);
    while (winners.length < 3 && allTexts.length > winners.length) {
      const next = allTexts.find(t => !winners.includes(t));
      if (next) winners.push(next); else break;
    }
    const anchors = phase1.script_anchors || {};
    console.log("Phase 1 done: " + allTexts.length + " texts, " + winners.length + " winners");

    await new Promise(r => setTimeout(r, 2000));

    // Phase 2
    console.log("Phase 2: 3-element composition...");
    const phase2 = await callGemini(buildPhase2Prompt(topic, script, project, visualStyle, brandCtx, sceneCtx, styleInstr, templateInstr, nicheInstr, phase1, winners, anchors), 0.9, 8192);

    await new Promise(r => setTimeout(r, 2000));

    // Phase 3
    console.log("Phase 3: Ideogram prompts...");
    const phase3 = await callGemini(buildPhase3Prompt(visualStyle, anchors, phase2.concepts), 0.85, 8192);

    // Delete existing
    try {
      const existing = await base44.entities.ThumbnailConcepts.filter({ project_id });
      await Promise.all(existing.map(e => base44.entities.ThumbnailConcepts.delete(e.id)));
    } catch (e) { console.warn('Delete existing failed:', e.message); }

    // Save concepts
    const saveResults = await Promise.all((phase3.thumbnails || []).map(async (t, i) => {
      const styleRef = (t.style_reference || 'cinema').split('/')[0].trim().toLowerCase();
      const validStyles = ['cinema', 'minimal', 'documentary'];
      let imgPrompt = t.image_prompt || '';
      if (!imgPrompt.includes('1920x1080')) imgPrompt = "1920x1080 Full HD 16:9 landscape YouTube thumbnail. " + imgPrompt;
      if (!imgPrompt.toLowerCase().includes('crisp sharp')) imgPrompt += '. Ultra high resolution, crisp sharp details, professional quality.';

      const td = t.text_design || {}, sd = t.subject_design || {}, bd = t.background_design || {};
      const desc = "[" + t.template_type + "] " + t.concept_description + "\n" + (t.emotional_hook || '') + "\n" + (t.scroll_stop_reason || '');
      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id, rank: t.rank || i + 1, concept_description: desc,
          facial_expression: typeof sd === 'object' ? JSON.stringify(sd) : '',
          visual_metaphor: t.template_type,
          color_scheme: (t.color_scheme || '') + " | " + (t.accent_color || '') + " | " + (t.visual_effects || ''),
          text_overlay: t.text_overlay,
          style_reference: validStyles.includes(styleRef) ? styleRef : 'cinema',
          ctr_score: t.ctr_score, image_prompt: imgPrompt, is_selected: false
        });
        return { success: true, record, imgPrompt, negPrompt: t.negative_prompt };
      } catch (err) { console.error("Save failed:", err.message); return { success: false }; }
    }));

    const saved = saveResults.filter(r => r.success);

    // Generate images
    console.log("Generating " + saved.length + " thumbnail images...");
    const thumbnails = await Promise.all(saved.map(async ({ record, imgPrompt, negPrompt }) => {
      try {
        const { url, model } = await generateThumbnailImage(KIE_API_KEY, imgPrompt, negPrompt);
        if (url) {
          await base44.asServiceRole.entities.ThumbnailConcepts.update(record.id, { image_url: url });
          console.log("Rank " + record.rank + " via " + model);
          return { ...record, image_url: url, model_used: model };
        }
        return { ...record, image_url: null, model_used: 'failed' };
      } catch (err) { console.error("Image error:", err.message); return { ...record, image_url: null, model_used: 'error' }; }
    }));

    const imgCount = thumbnails.filter(t => t.image_url).length;
    console.log("Done: " + imgCount + "/" + saved.length + " images generated");

    return Response.json({
      success: true, thumbnails, script_anchors: anchors,
      text_engine: { script_climax: phase1.script_climax, curiosity_gap: phase1.curiosity_gap_identified, all_text_options: allTexts, winning_texts: winners },
      meta: { total_concepts: saved.length, total_images: imgCount, phases: 3, image_model_primary: "ideogram/v3-generate", dimensions: "1920x1080" }
    });
  } catch (error) {
    console.error("generateThumbnailsFromScript error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});