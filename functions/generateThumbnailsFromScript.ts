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
    // Clean control chars and trailing commas
    const clean = s => s.replace(/[\x00-\x1F\x7F]/g, c => "\n\r\t".includes(c) ? c : ' ').replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(clean(t)); } catch (_) {}
    let j = t;
    if (t.includes("```json")) j = t.split("```json")[1].split("```")[0].trim();
    else if (t.includes("```")) j = t.split("```")[1].split("```")[0].trim();
    try { return JSON.parse(clean(j)); } catch (_) {}
    // Try to find outermost JSON object
    const objM = j.match(/\{[\s\S]*\}/);
    if (objM) try { return JSON.parse(clean(objM[0])); } catch (_) {}
    // Try to find outermost array
    const arrM = j.match(/\[[\s\S]*\]/);
    if (arrM) try { return JSON.parse(clean(arrM[0])); } catch (_) {}
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

    // ===== PHASE 0: SCRIPT ESSENCE EXTRACTION =====
    console.log("Phase 0: Script essence extraction for " + script.title);
    const essenceScript = fullScript.substring(0, 6000);
    const script_essence = await gemini(`You are a LEGENDARY YouTube thumbnail creator for channels with 10M+ views. You have created thumbnails for MrBeast, Veritasium, Kurzgesagt, and every top creator. Your thumbnails consistently achieve 15%+ CTR. Your expertise lies in distilling complex video scripts into ONE viral-worthy thumbnail concept that stops the scroll.

Analyze this video script and extract the CORE ELEMENTS that will drive the highest possible CTR thumbnail.

VIDEO: "${topic.title}" TITLE: "${script.title}" NICHE: "${project.niche}"${titleCtx}

SCRIPT:
${essenceScript}

Extract these elements with EXTREME precision — every field drives the thumbnail:

JSON: {
  "emotional_hook": "The ONE dominant emotion viewers will feel (Shock, Curiosity, FOMO, Disbelief, Outrage, Wonder). Be specific — not just 'curiosity' but 'morbid curiosity about hidden danger'.",
  "thumbnail_message_concept": "The scroll-stopping headline concept. MAX 5 words. Must use power words and psychological triggers. Must spark curiosity, FOMO, surprise, urgency, or exclusivity. NO generic phrases. NO emojis. Example: 'THEY HID THIS' not 'Interesting Discovery'.",
  "impactful_visual_element": "The SINGLE most powerful visual from the script. Be hyper-specific: exact object, exact state, exact framing. Example: 'A glowing red button behind shattered glass' not 'a button'.",
  "human_emotion_description": "If a human face is relevant: describe the EXACT exaggerated expression needed (wide eyes + dropped jaw + raised eyebrows = pure shock). Must be readable at 120px thumbnail size. If no face needed: 'N/A'.",
  "key_characters_objects": ["List the 2-3 most visually distinctive characters or objects from the script's climax"],
  "contrast_description": "The strongest before/after or illusion-vs-reality contrast in the script. This drives the visual tension.",
  "narrative_summary": "2 sentences: What happens and why viewers MUST click to find out.",
  "forbidden_knowledge": "What secret or hidden truth does this video reveal that viewers don't know yet?",
  "stakes": "What is at risk? What could go wrong? Why should the viewer care RIGHT NOW?"
}`, 0.9, 4096);

    console.log("Phase 0 done. Hook: " + (script_essence.emotional_hook || 'unknown'));
    await new Promise(r => setTimeout(r, 2000));

    // ===== PHASE 1: TEXT ENGINE =====
    console.log("Phase 1: Text engine for " + script.title);
    const p1 = await gemini(`You are an elite YouTube thumbnail copywriter. You create overlay text that achieves extremely high CTR. Every word you choose is a psychological trigger.

=== STRICT TEXT RULES ===
- MAX 5 WORDS per line, MAX 2 lines, ALL CAPS
- Use POWER WORDS: secret, hidden, banned, exposed, deadly, shocking, impossible, never, always, truth
- Each text must spark: curiosity, FOMO, surprise, urgency, or exclusivity
- NO generic phrases ("You Won't Believe", "Watch This")
- NO emojis ever
- Text must COMPLEMENT the video title, NOT duplicate it
- Text must reference THIS script's specific topic

=== COLOR & CONTRAST RULES (CRITICAL FOR MOBILE) ===
MANDATORY high-contrast pairings (pick from these ONLY):
- Yellow (#FFD700) text + Black background → maximum attention
- White text + Navy/Dark background → clean professional
- Blue text + Orange background → strong professional contrast  
- Red text + Cyan/Teal background → energetic bright
- Green text + White/Light background → fresh energetic
- Orange text + Indigo/Dark background → warm bold

AVOID: Pure red alone (blends with YouTube UI), similar-temperature colors side-by-side (red on orange), muted/low-contrast schemes.
Stick to 2-3 colors TOTAL to avoid visual noise.

=== TEXT STYLING RULES ===
- Font: Big thick sans-serif ONLY (Impact, Montserrat Black, Bebas Neue)
- White text MUST have thick dark outline OR black drop shadow
- Black text MUST sit on light block/container
- Add subtle shadow or behind-text box if background is busy
- Text size: MASSIVE — must be readable at 120px thumbnail width (mobile)

=== PLACEMENT RULES ===
- NEVER place text in bottom-right (YouTube duration badge)
- NEVER place text at bottom edges (UI overlaps)
- Best positions: upper-left, upper-center, center-left
- Leave negative space around text — don't crowd it

VIDEO: "${topic.title}" TITLE: "${script.title}" NICHE: "${project.niche}"${titleCtx}
SCRIPT ESSENCE: ${JSON.stringify(script_essence)}

Extract: villain_object, victim_object, trap_symbol, shock_data (specific number from script), contrast_pair (illusion vs reality), niche_objects (3-5 items).

Generate 10 text options: 4 curiosity gap, 3 forbidden knowledge, 3 shock/contradiction. For each specify all fields below. Pick top 3 with highest CTR potential.

JSON: {"script_anchors":{"villain_object":"","victim_object":"","trap_symbol":"","shock_data":"","contrast_pair":{"illusion":"","reality":""},"niche_objects":[]},"script_climax":"","curiosity_gap_identified":"","text_options":[{"rank":1,"text":"","category":"","text_color_name":"","text_hex":"","background_color_name":"","background_hex":"","contrast_pair_name":"e.g. Yellow & Black","outline":"thick black outline","shadow":"heavy drop shadow","container":"raw or box","position":"upper-left","size":"massive","font_style":"Impact","subject_hook_type":"","subject_hook_description":"","anchor_object_in_subject":"","mobile_readable":true,"total_ctr_score":9}],"top_3_winners":[1,2,3]}`, 0.95, 4096);

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

    // ===== PHASE 2: VISUAL COMPOSITION =====
    console.log("Phase 2: Visual composition...");
    const p2 = await gemini(`You are a world-class thumbnail visual architect. Design 3 thumbnail concepts using THREE-ELEMENT COMPOSITION: Subject, Text, Background.

=== LAYOUT & COMPOSITION RULES ===
RULE OF THIRDS: Place key elements at intersection points of the 3x3 grid — never dead center.
CLEAR FOCAL POINT: Limit to 1 dominant subject + 1 headline text block. Too many items confuse viewers.
NEGATIVE SPACE: Leave breathing room. Empty space prevents clutter and draws eye to focal point.
SUBJECT SEPARATION: Subject MUST pop — use light/dark separation, drop shadows, edge glow, or rim lighting so subject never blends into background.

=== TEXT PLACEMENT (CRITICAL) ===
- NEVER bottom-right (YouTube duration badge covers it)
- NEVER bottom edge (YouTube UI overlaps)
- Text in upper-left or upper-center for maximum visibility
- White text needs thick dark outline; dark text needs light container/box behind it
- Must be readable at 120px width (mobile suggested videos)

=== BACKGROUND RULES ===
- Background must be DIRECTLY tied to video topic — no generic/random filler
- Slightly blur OR desaturate background to make subject + text pop
- Use heavy bokeh or atmospheric effects for depth separation

=== COLOR STRATEGY ===
- Use ONLY high-contrast pairings from Phase 1 winners
- 2-3 colors total maximum
- Avoid pure red alone, avoid similar-temperature adjacent colors

VIDEO: "${topic.title}" TITLE: "${script.title}" STYLE: "${style}"${nicheCtx}
ANCHORS: ${JSON.stringify(anchors)}
WINNING TEXTS: ${JSON.stringify(winners)}
SCRIPT ESSENCE: ${JSON.stringify(script_essence)}

For each concept: subject with script anchor visible (incorporating "${script_essence.impactful_visual_element}" and facial expression "${script_essence.human_emotion_description}"), winning text from Phase 1, complementary background echoing "${script_essence.contrast_description}". 300+ word forensic description. All FICTIONAL characters. Bottom-right ALWAYS clear.

JSON: {"concepts":[{"rank":1,"winning_text":"","winning_text_design":{"color":"","color_hex":"","outline":"thick dark outline","shadow":"heavy drop shadow","container":"raw or semi-transparent box","position":"upper-left","size":"massive","font_style":"Impact","mobile_readable":true},"element_1_subject":{"hook_type":"","description":"","anchor_object":"","position_on_grid":"rule-of-thirds intersection","crop":"chest-up or medium","separation_method":"rim light + drop shadow","facial_expression":""},"element_3_background":{"dominant_color":"","blur_level":"heavy bokeh","vignette":"heavy","desaturation":"slight","atmospheric_effects":"","anchor_echo":"","psychological_purpose":""},"negative_space_zones":"where empty space exists","template_type":"","emotional_trigger":"","scroll_stop_reason":"","forensic_description":""}]}`, 0.9, 6144);

    await new Promise(r => setTimeout(r, 2000));

    // ===== PHASE 3: IMAGE PROMPTS =====
    console.log("Phase 2 concepts: " + (p2.concepts?.length || 0));
    console.log("Phase 3: Image prompts...");
    const styleDesc = style.includes('anime') ? 'anime style' : style.includes('oil') ? 'oil painting' : style.includes('comic') ? 'comic book' : 'cinematic photography 4K HDR';
    const p3 = await gemini(`You are an elite Ideogram V3 prompt engineer specializing in viral YouTube thumbnails.

=== IDEOGRAM TEXT RENDERING ===
Ideogram renders text natively — ALL overlay text MUST be in "QUOTATION MARKS" in the prompt.
Text must be MASSIVE, BOLD, thick sans-serif font.
Text MUST have high-contrast outline: white text → thick black outline, dark text → white/bright outline.

=== IMAGE COMPOSITION RULES ===
Resolution: 1920x1080 Full HD 16:9 landscape YouTube thumbnail.
RULE OF THIRDS: Subject at grid intersection, never dead center.
FOCAL POINT: ONE dominant subject + ONE text block only.
NEGATIVE SPACE: Include breathing room — do not fill every pixel.
SUBJECT SEPARATION: Subject must have rim lighting, drop shadow, or edge glow — must pop from background even at tiny sizes.
BACKGROUND: Directly related to topic, slightly blurred/desaturated behind subject. Heavy bokeh or atmospheric depth.

=== TEXT IN IMAGE RULES ===
- Text position: upper-left or upper-center ONLY
- NEVER place text in bottom-right (duration badge) or bottom edge (UI overlap)
- Text color must be HIGH CONTRAST against background (Yellow on Black, White on Navy, etc.)
- Include "thick black outline" or "dark drop shadow" on ALL text in prompt
- Text must be readable at thumbnail size — MASSIVE scale

=== STYLE & QUALITY ===
STYLE: ${styleDesc}. All characters FICTIONAL. No violence. No real people.
Quality: 4K detail, professional lighting, cinematic color grading.

ANCHORS: ${JSON.stringify(anchors)}
CONCEPTS: ${JSON.stringify(p2.concepts || [])}
SCRIPT ESSENCE: ${JSON.stringify(script_essence)}

For each concept write a 300+ word prompt that includes:
1. Opening declaration: "1920x1080 Full HD 16:9 landscape YouTube thumbnail"
2. Text element: the EXACT overlay text in "QUOTATION MARKS", massive bold, with specific color + outline + shadow + position
3. Subject: with anchor object, specific facial expression "${script_essence.human_emotion_description}", rule-of-thirds placement, subject separation technique
4. Background: topic-relevant, blurred/desaturated, atmospheric depth, anchor echo
5. Style/quality markers: ${styleDesc}, 4K, professional lighting
6. No hex codes — use color names only

JSON: {"thumbnails":[{"rank":1,"template_type":"","concept_description":"","text_overlay":"","text_design":{"color":"","outline":"thick black outline","shadow":"heavy drop shadow","container":"","position":"upper-left","size":"massive","font_style":"Impact","mobile_readable":true},"subject_design":{"hook_type":"","grid_position":"rule-of-thirds","anchor_object":"","crop":"","separation":"rim light + shadow","facial_expression":""},"background_design":{"dominant_color":"","atmosphere":"","blur":"heavy bokeh","desaturation":"slight","anchor_echo":""},"emotional_hook":"","scroll_stop_reason":"","color_scheme":"","visual_effects":"","style_reference":"cinema","ctr_score":9,"negative_prompt":"blurry, low quality, pixelated, watermark, distorted text, small text, cluttered, text in bottom-right, text at bottom edge, low contrast text, muted colors, too many elements","image_prompt":""}]}`, 0.85, 6144);

    // Delete existing
    try {
      const ex = await base44.entities.ThumbnailConcepts.filter({ project_id });
      await Promise.all(ex.map(e => base44.entities.ThumbnailConcepts.delete(e.id)));
    } catch (_) {}

    // Save + generate images — handle both {thumbnails:[...]} and direct array
    let thumbs = [];
    if (Array.isArray(p3)) {
      thumbs = p3;
    } else if (Array.isArray(p3.thumbnails)) {
      thumbs = p3.thumbnails;
    } else if (Array.isArray(p3.concepts)) {
      thumbs = p3.concepts;
    } else {
      // Try to find any array value in the response
      for (const val of Object.values(p3 || {})) {
        if (Array.isArray(val) && val.length > 0) { thumbs = val; break; }
      }
    }
    console.log("Phase 3 returned " + thumbs.length + " thumbnails");
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
    const bad = saved.filter(s => !s.ok);
    console.log("Saved: " + good.length + " ok, " + bad.length + " failed");
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