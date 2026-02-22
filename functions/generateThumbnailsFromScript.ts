import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const KIE_BASE = "https://api.kie.ai/api/v1/jobs";

async function kieCreate(apiKey, model, input) {
  const r = await fetch(KIE_BASE + "/createTask", {
    method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
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

async function genImage(apiKey, prompt, neg) {
  const n = neg || "blurry, low quality, pixelated, watermark";
  try {
    const tid = await kieCreate(apiKey, "ideogram/v3-generate", {
      prompt: prompt.substring(0, 1500), image_size: "landscape_16_9", style: "DESIGN", rendering_speed: "QUALITY", expand_prompt: false, negative_prompt: n
    });
    const u = await kiePoll(apiKey, tid);
    if (u) return { url: u, model: "ideogram-v3" };
  } catch (e) { console.warn("ideogram failed:", e.message); }
  try {
    const tid = await kieCreate(apiKey, "flux-2/pro-text-to-image", {
      prompt: prompt.substring(0, 1500), aspect_ratio: "16:9", resolution: "2K"
    });
    const u = await kiePoll(apiKey, tid);
    if (u) return { url: u, model: "flux-2" };
  } catch (e) { console.warn("flux failed:", e.message); }
  return { url: null, model: "none" };
}

async function gemini(prompt, temp, maxTok) {
  const key = Deno.env.get("GEMINI_API_KEY");
  for (let i = 0; i < 3; i++) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + key, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: temp, maxOutputTokens: maxTok, responseMimeType: "application/json" } })
    });
    if (r.status === 429) { await new Promise(w => setTimeout(w, (i + 1) * 10000)); continue; }
    if (!r.ok) { const e = await r.json(); throw new Error("Gemini " + r.status + ": " + (e.error?.message || "")); }
    const d = await r.json();
    if (!d.candidates?.length) throw new Error("No candidates");
    const t = d.candidates[0].content.parts[0].text;
    try { return JSON.parse(t); } catch (_) {}
    const fixed = t.replace(/[\x00-\x1F\x7F]/g, c => "\n\r\t".includes(c) ? c : ' ').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(fixed); } catch (_) {}
    let j = t;
    if (t.includes("```json")) j = t.split("```json")[1].split("```")[0].trim();
    else if (t.includes("```")) j = t.split("```")[1].split("```")[0].trim();
    try { return JSON.parse(j.replace(/[\x00-\x1F\x7F]/g, c => "\n\r\t".includes(c) ? c : ' ').replace(/,\s*([}\]])/g, '$1')); } catch (_) {}
    const m = j.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Parse failed");
  }
  throw new Error("Rate limited");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const KIE_KEY = Deno.env.get("KIE_API_KEY");
    if (!KIE_KEY) return Response.json({ error: 'KIE_API_KEY missing' }, { status: 500 });

    const { project_id, reference_style, template_blueprint, niche_dna, niche_name, selected_title } = await req.json();

    const [projects, scripts, topics] = await Promise.all([
      base44.entities.Projects.filter({ id: project_id }),
      base44.entities.Scripts.filter({ project_id }),
      base44.entities.Topics.filter({ project_id })
    ]);
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
    const script = scripts.find(s => s.version === 'final_aggregated');
    if (!script) return Response.json({ error: 'No final script' }, { status: 400 });
    const topic = topics.find(t => t.is_selected);
    if (!topic) return Response.json({ error: 'No topic' }, { status: 400 });

    const fullScript = script.full_script || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');
    const trunc = fullScript.substring(0, 3000);
    const style = ['picstory_cocomelon', 'cartoon_2d'].includes(project.visual_style || '') ? 'cinematic_realistic' : (project.visual_style || 'cinematic_realistic');
    const titleCtx = selected_title ? ' SEO TITLE: "' + selected_title + '"' : '';
    const nicheCtx = niche_dna ? ' NICHE DNA: ' + niche_dna.substring(0, 600) : '';

    console.log("Phase 1: Text engine for " + script.title);

    // PHASE 1: Text generation
    const p1 = await gemini(`You are a top YouTube thumbnail copywriter. Analyze this script and generate thumbnail text options.

VIDEO: "${topic.title}" TITLE: "${script.title}" NICHE: "${project.niche}"${titleCtx}

SCRIPT: ${trunc}

Extract: villain_object (thing causing harm), victim_object (thing harmed), trap_symbol (visual metaphor), shock_data (specific number), contrast_pair (illusion vs reality), niche_objects (3-5 items).

Generate 10 text options (MAX 3 WORDS, ALL CAPS): 4 curiosity gap, 3 forbidden knowledge, 3 shock/contradiction. Each must reference the script's specific topic. For each specify: text, category, text_color_name, background_color_pair, position, subject_hook_type, subject_hook_description, anchor_object_in_subject, total_ctr_score. Pick top 3.

Color pairs: red text→teal bg, yellow→purple bg, white→navy bg, orange→indigo bg, green→magenta bg.

JSON: {"script_anchors":{"villain_object":"","victim_object":"","trap_symbol":"","shock_data":"","contrast_pair":{"illusion":"","reality":""},"niche_objects":[]},"script_climax":"","curiosity_gap_identified":"","text_options":[{"rank":1,"text":"","category":"","text_color_name":"","background_color_pair":"","outline_color":"thick black","shadow":"heavy drop shadow","container":"raw","position":"upper-left","size":"massive","font_style":"Impact","subject_hook_type":"","subject_hook_description":"","anchor_object_in_subject":"","total_ctr_score":9}],"top_3_winners":[1,2,3]}`, 0.95, 4096);

    const allTexts = p1.text_options || [];
    const top3 = (p1.top_3_winners || [1, 2, 3]);
    const winners = top3.map(r => allTexts.find(t => t.rank === r) || allTexts[r - 1]).filter(Boolean).slice(0, 3);
    while (winners.length < 3 && allTexts.length > winners.length) {
      const n = allTexts.find(t => !winners.includes(t));
      if (n) winners.push(n); else break;
    }
    const anchors = p1.script_anchors || {};
    console.log("Phase 1 done: " + winners.length + " winners");

    await new Promise(r => setTimeout(r, 2000));

    // PHASE 2: Visual composition
    console.log("Phase 2: Visual composition...");
    const p2 = await gemini(`You are a thumbnail visual architect. Design 3 thumbnail concepts using THREE-ELEMENT COMPOSITION: Subject (with anchor object), Text, Background.

VIDEO: "${topic.title}" TITLE: "${script.title}" STYLE: "${style}"${nicheCtx}
ANCHORS: ${JSON.stringify(anchors)}
WINNING TEXTS: ${JSON.stringify(winners)}

For each: subject with script anchor visible, text from winners, complementary background. 300+ word forensic description. All fictional characters. Bottom-right clear.

JSON: {"concepts":[{"rank":1,"winning_text":"","winning_text_design":{"color":"","outline":"","shadow":"","container":"","position":"","size":"","font_style":""},"element_1_subject":{"hook_type":"","description":"","anchor_object":"","position_on_grid":"","crop":""},"element_3_background":{"dominant_color":"","blur_level":"heavy bokeh","vignette":"heavy","atmospheric_effects":"","anchor_echo":"","psychological_purpose":""},"template_type":"","emotional_trigger":"","scroll_stop_reason":"","forensic_description":""}]}`, 0.9, 6144);

    await new Promise(r => setTimeout(r, 2000));

    // PHASE 3: Image prompts
    console.log("Phase 3: Image prompts...");
    const styleDesc = style.includes('anime') ? 'anime style' : style.includes('oil') ? 'oil painting' : style.includes('comic') ? 'comic book' : 'cinematic photography 4K HDR';
    const p3 = await gemini(`You are an Ideogram V3 prompt engineer. Write image generation prompts for these thumbnail concepts.

Ideogram renders text natively — put text in "QUOTATION MARKS". 1920x1080 16:9 landscape.
STYLE: ${styleDesc}. All characters FICTIONAL. No violence.

ANCHORS: ${JSON.stringify(anchors)}
CONCEPTS: ${JSON.stringify(p2.concepts || [])}

For each write 300+ word prompt with: opening (1920x1080 thumbnail), text element (massive bold in quotes), subject with anchor, background with anchor echo, style/quality. No hex codes.

JSON: {"thumbnails":[{"rank":1,"template_type":"","concept_description":"","text_overlay":"","text_design":{"color":"","outline":"","shadow":"","container":"","position":"","size":"","font_style":""},"subject_design":{"hook_type":"","grid_position":"","anchor_object":"","crop":""},"background_design":{"dominant_color":"","atmosphere":"","anchor_echo":""},"emotional_hook":"","scroll_stop_reason":"","color_scheme":"","visual_effects":"","style_reference":"cinema","ctr_score":9,"negative_prompt":"blurry, low quality, pixelated, watermark, distorted text, small text, cluttered","image_prompt":""}]}`, 0.85, 6144);

    // Delete existing
    try {
      const ex = await base44.entities.ThumbnailConcepts.filter({ project_id });
      await Promise.all(ex.map(e => base44.entities.ThumbnailConcepts.delete(e.id)));
    } catch (_) {}

    // Save + generate images
    const thumbs = p3.thumbnails || [];
    const saved = await Promise.all(thumbs.map(async (t, i) => {
      let ip = t.image_prompt || '';
      if (!ip.includes('1920x1080')) ip = "1920x1080 Full HD 16:9 landscape YouTube thumbnail. " + ip;
      const sr = (t.style_reference || 'cinema').split('/')[0].trim().toLowerCase();
      const vs = ['cinema', 'minimal', 'documentary'].includes(sr) ? sr : 'cinema';
      try {
        console.log("Saving concept rank " + (t.rank || i + 1) + ", text: " + (t.text_overlay || ''));
        const createData = {
          project_id, rank: t.rank || i + 1,
          concept_description: ("[" + (t.template_type || '') + "] " + (t.concept_description || '')).substring(0, 2000),
          visual_metaphor: t.template_type || '',
          color_scheme: ((t.color_scheme || '') + " | " + (t.visual_effects || '')).substring(0, 500),
          text_overlay: (t.text_overlay || '').substring(0, 200),
          style_reference: vs,
          ctr_score: t.ctr_score || 8,
          image_prompt: ip,
          is_selected: false
        };
        const rec = await base44.entities.ThumbnailConcepts.create(createData);
        console.log("Saved concept " + rec.id);
        return { ok: true, rec, ip, neg: t.negative_prompt };
      } catch (e) { console.error("Save err:", e.message, JSON.stringify(e)); return { ok: false }; }
    }));

    const good = saved.filter(s => s.ok);
    console.log("Generating " + good.length + " images...");

    const results = await Promise.all(good.map(async ({ rec, ip, neg }) => {
      try {
        const { url, model } = await genImage(KIE_KEY, ip, neg);
        if (url) { await base44.asServiceRole.entities.ThumbnailConcepts.update(rec.id, { image_url: url }); return { ...rec, image_url: url, model }; }
        return { ...rec, image_url: null, model: 'failed' };
      } catch (e) { return { ...rec, image_url: null, model: 'error' }; }
    }));

    const imgCount = results.filter(r => r.image_url).length;
    console.log("Done: " + imgCount + "/" + good.length + " images");

    return Response.json({
      success: true, thumbnails: results, script_anchors: anchors,
      text_engine: { script_climax: p1.script_climax, all_text_options: allTexts, winning_texts: winners },
      meta: { total_concepts: good.length, total_images: imgCount, phases: 3 }
    });
  } catch (error) {
    console.error("Error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});