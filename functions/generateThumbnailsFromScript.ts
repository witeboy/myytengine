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
    // LOAD DATA (parallel)
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

    const [scenesResult, brandsResult] = await Promise.allSettled([
      base44.entities.Scenes.filter({ project_id }),
      base44.entities.BrandIdentities.filter({ project_id })
    ]);

    let sceneContext = '';
    if (scenesResult.status === 'fulfilled' && scenesResult.value.length > 0) {
      const sorted = scenesResult.value.sort((a, b) => a.scene_number - b.scene_number);
      sceneContext = `\nSCENE VISUALS:\n${sorted.slice(0, 5).map(s => `Scene ${s.scene_number}: ${(s.image_prompt || s.narration_text || '').substring(0, 150)}`).join('\n')}`;
    }

    let brandContext = '';
    if (brandsResult.status === 'fulfilled' && brandsResult.value.length > 0) {
      const b = brandsResult.value[0];
      brandContext = `\nBRAND: Tone=${b.thumbnail_tone || 'cinematic'}, Colors=${b.color_primary || ''} / ${b.color_secondary || ''} / ${b.color_accent || ''}`;
    }

    const rawStyle = project.visual_style || 'cinematic_realistic';
    const childStyles = ['picstory_cocomelon', 'cartoon_2d'];
    const visualStyle = childStyles.includes(rawStyle) ? 'cinematic_realistic' : rawStyle;

    const styleInstruction = reference_style
      ? `\nREFERENCE STYLE: ${reference_style}` : '';
    const templateInstruction = template_blueprint
      ? `\nTEMPLATE: Comp=${template_blueprint.composition_blueprint || ''} | Colors=${template_blueprint.color_strategy || ''} | Text=${template_blueprint.text_strategy || ''} | Action=${template_blueprint.character_action_notes || ''} | Tone=${template_blueprint.emotional_tone || ''}` : '';
    const nicheDnaInstruction = niche_dna
      ? `\nNICHE DNA (${niche_name || 'uploaded'}):\n${niche_dna.substring(0, 1200)}` : '';
    const selectedTitleContext = selected_title
      ? `\nSEO TITLE: "${selected_title}" — derive text from this title. AMPLIFY the curiosity gap, don't repeat verbatim.` : '';

    console.log('══════════════════════════════════════════════════════');
    console.log('THUMBNAILS: 3-PHASE (TEXT → 3-ELEMENT VISUAL → PROMPT)');
    console.log(`Video: ${script.title}`);
    console.log(`Style: ${visualStyle} | Ideogram V3 → Flux 2`);
    console.log('══════════════════════════════════════════════════════');

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  PHASE 1: SCROLL-STOPPING TEXT ENGINE                        ║
    // ║  Extract climax → 10 text options across 3 psych categories  ║
    // ║  → score → pick top 3 → assign background color pair +       ║
    // ║  subject hook type for each winner                           ║
    // ╚═══════════════════════════════════════════════════════════════╝

    const phase1Prompt = `You are the world's #1 YouTube thumbnail text copywriter. 10+ year track record. 12%+ CTR consistently.

=== MISSION ===
Analyze this script. Extract the emotional climax. Generate 10 SCROLL-STOPPING text options. Score each. Pick the top 3.

VIDEO TOPIC: "${topic.title}"
VIDEO TITLE: "${script.title}"
NICHE: "${project.niche}"
${brandContext}${selectedTitleContext}

SCRIPT (find the ONE sentence with highest emotional/logical stakes):
${truncatedScript}

=== STEP 1: CLIMAX EXTRACTION ===
Find the ONE sentence with: highest emotional stakes, biggest surprise/contradiction/turning point, would stop someone mid-scroll.

=== STEP 2: GENERATE 10 TEXT OPTIONS ===

CATEGORY A — CURIOSITY GAP (4 options)
Incomplete thought that DEMANDS resolution.
- Technique: Incomplete sentences, ellipsis, pronouns without naming who
- Examples: "THEY KNEW...", "HE DIDN'T LEAVE", "SHE LIED"
- Power: Brain cannot rest until gap is closed

CATEGORY B — FORBIDDEN KNOWLEDGE / NEGATIVE FRAMING (3 options)
Loss aversion — 2x more motivating than gain.
- Technique: Frame as warning/prohibition/reversal. "How to succeed" → "STOP DOING THIS"
- Examples: "STOP WATCHING", "I WAS WRONG", "THEY HID THIS"
- Power: Triggers fight-or-flight

CATEGORY C — SHOCK / CONTRADICTION (3 options)
Cognitive dissonance — text clashes with expected visual.
- Examples: "IT'S FAKE", "HE SMILED", "ONLY $1", "THEY AGREED"
- Power: Mismatch detection → must resolve → click

=== TEXT HARD RULES ===
1. MAX 3 WORDS (ideal: 2). Never exceed 4.
2. ALL CAPS always
3. Never reveal the answer
4. BANNED: "AMAZING", "INCREDIBLE", "YOU WON'T BELIEVE", "SHOCKING TRUTH"
5. Power verbs: STOP, HIDE, BROKE, LIED, KNEW, LEFT, GONE, CAUGHT, LEAKED, EXPOSED
6. Pronouns over names: "THEY KNEW" > "THE CEO KNEW"
7. Positive topic? FLIP negative: "How to save" → "YOU'RE WASTING IT"
8. Must work WITHOUT any context

=== STEP 3: DESIGN EACH TEXT OPTION ===

TEXT COLOR + COMPLEMENTARY BACKGROUND PAIR:
This is critical — the text color determines the ENTIRE background color of the thumbnail.

| Text Color | Background Color Pair | Never Use As BG | Psychological Effect |
|---|---|---|---|
| Vivid crimson red | Deep teal / dark cyan | YouTube red, pure black | Danger pops against cool calm |
| Electric neon yellow | Deep purple / violet | White, grey | Forbidden glow against mystery |
| Pure white | Rich teal / deep navy | YouTube white/grey | Clean authority against depth |
| Hot amber orange | Deep indigo / cobalt | Red (too close), grey | Urgency against the abyss |
| Neon lime green | Deep magenta / dark berry | Black (too generic) | Toxic shock against drama |

IMPORTANT: The "background_color_pair" you choose here will become the DOMINANT background color of the entire thumbnail. Choose based on maximum contrast with text.

TEXT POSITION:
- UPPER-LEFT: Best default. Left-to-right reading. Avoids all YouTube UI.
- UPPER-CENTER: Maximum dominance. Subject below.
- BOTTOM-CENTER: Only if upper area has key visual. NEVER bottom-right (timestamp death zone).
- ACROSS-CENTER: Text IS the thumbnail. Maximum disruption.

TEXT SIZE:
- MASSIVE (one-third of frame width): 1-2 word options
- LARGE (one-quarter of frame width): 3 word options

CONTAINER:
- RAW: No container. Outline + shadow only. Most versatile.
- BANNER: Full-width colored strip. Breaking news feel.
- STAMP: Tilted, rough edges. Classified/leaked feel.
- BADGE: Rounded rectangle. Clean, professional.
- GLOW: Colored halo/aura. Ethereal, mysterious.

FONT: Impact, Bebas Neue, or bold condensed sans-serif. Never decorative or script fonts.

=== STEP 4: SUBJECT HOOK TYPE ===
For each text option, specify what TYPE of visual subject creates maximum tension with this text:

- exaggerated_emotion: Extreme close-up face (shock, fear, defiance). Eyes wide, mouth open, brow furrowed. Boosts CTR 35%.
- scale_shock: Something unnaturally large/small next to reference object (giant stack of cash, tiny person next to massive door)
- mystery_object: Single unexplained object that text references but doesn't explain (glowing key, sealed envelope, cracked vault)
- environmental_stakes: Location that tells the story (empty boardroom, burning building, abandoned room, dark alley)

=== STEP 5: SCORE ===
Score 1-10:
- STOP_POWER (40%): Stops scrolling in 0.3 seconds?
- CURIOSITY (30%): Unbearable need to click?
- CLARITY (20%): Readable at phone thumbnail size?
- UNIVERSALITY (10%): Works without any context?

RESPOND IN EXACT JSON:
{
  "script_climax": "The single highest-stakes sentence",
  "curiosity_gap_identified": "The core unanswered question",
  "text_options": [
    {
      "rank": 1,
      "text": "EXACT WORDS IN CAPS",
      "word_count": 2,
      "category": "curiosity_gap / forbidden_knowledge / shock_contradiction",
      "psychological_mechanism": "Which bias + WHY it stops scrolling",
      "negative_framing_applied": true,
      "text_color_name": "Vivid color name for Ideogram",
      "background_color_pair": "The complementary background color name from the table above",
      "outline_color": "very thick black / thick dark navy / thick deep red",
      "shadow": "heavy black drop shadow / colored glow / none",
      "container": "raw / banner / stamp / badge / glow",
      "container_color": "color if applicable, null if raw",
      "position": "upper-left / upper-center / bottom-center / across-center",
      "size": "massive / large",
      "font_style": "Impact / Bebas Neue / bold condensed sans-serif",
      "subject_hook_type": "exaggerated_emotion / scale_shock / mystery_object / environmental_stakes",
      "subject_hook_description": "1 sentence: what specific subject creates maximum tension with this text",
      "stop_power_score": 9,
      "curiosity_score": 10,
      "clarity_score": 9,
      "universality_score": 8,
      "total_ctr_score": 9.2,
      "why_this_wins": "1 sentence"
    }
  ],
  "top_3_winners": [1, 2, 3]
}`;

    console.log("Phase 1: Text engine (10 options + scoring)...");
    const phase1Result = await safeGeminiCall(phase1Prompt, 0.95, 4096);

    const top3Indices = phase1Result.top_3_winners || [1, 2, 3];
    const allTextOptions = phase1Result.text_options || [];
    const winningTexts = top3Indices.map(rank =>
      allTextOptions.find(t => t.rank === rank) || allTextOptions[rank - 1]
    ).filter(Boolean).slice(0, 3);

    while (winningTexts.length < 3 && allTextOptions.length > winningTexts.length) {
      const next = allTextOptions.find(t => !winningTexts.includes(t));
      if (next) winningTexts.push(next); else break;
    }

    console.log(`✓ Phase 1: ${allTextOptions.length} texts → ${winningTexts.length} winners`);
    winningTexts.forEach(w => console.log(`  "${w.text}" [${w.category}] CTR:${w.total_ctr_score} | ${w.text_color_name} on ${w.background_color_pair} | subject: ${w.subject_hook_type}`));

    await new Promise(r => setTimeout(r, 2000));

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  PHASE 2: THREE-ELEMENT VISUAL COMPOSITION                   ║
    // ║  Each concept = exactly 3 elements: Subject + Text + BG      ║
    // ║  Built AROUND winning text. Background is a designed          ║
    // ║  psychological element, not filler.                          ║
    // ╚═══════════════════════════════════════════════════════════════╝

    const phase2Prompt = `You are the world's #1 thumbnail visual architect. You design thumbnails using the THREE-ELEMENT COMPOSITION RULE used by MrBeast, Veritasium, and top creators.

=== THE THREE-ELEMENT RULE ===
High-CTR thumbnails NEVER exceed 3 distinct visual elements. More = cognitive overload = scroll past.
- ELEMENT 1 — SUBJECT: The image hook (face, object, environment)
- ELEMENT 2 — TEXT: The cognitive itch (from Phase 1 winners — already designed)
- ELEMENT 3 — BACKGROUND: The visual separation layer (psychologically designed, not filler)

Each element has ONE job. If any element doesn't serve Contrast, Context, or Constraint — delete it.

=== SAFETY ===
ALL characters 100% FICTIONAL. No real people. No violence. Symbolic drama only.

VIDEO: "${topic.title}" | TITLE: "${script.title}" | NICHE: "${project.niche}" | STYLE: "${visualStyle}"
${brandContext}${sceneContext}${styleInstruction}${templateInstruction}${nicheDnaInstruction}

CLIMAX: "${phase1Result.script_climax || ''}"
CURIOSITY GAP: "${phase1Result.curiosity_gap_identified || ''}"

=== THE 3 WINNING TEXTS (each concept built around ONE) ===
${JSON.stringify(winningTexts, null, 2)}

=== DESIGN EACH CONCEPT AS EXACTLY 3 ELEMENTS ===

ELEMENT 1 — SUBJECT (The Image Hook):
The subject provides the VISUAL STAKES that the text references.

Design rules per subject_hook_type from Phase 1:

IF exaggerated_emotion:
- EXTREME close-up face (head fills 40-50% of frame)
- Specific muscles: wide eyes (orbicularis oculi fully retracted), raised brows (frontalis engaged), open mouth (masseter dropped), flared nostrils
- Eye direction: DIRECTLY at camera (confrontational, breaks 4th wall) OR looking at the mystery element (guides viewer gaze)
- Positioned on LEFT or RIGHT vertical third line (rule of thirds) — NEVER dead center
- Warm rim light on one side, cool fill on other side for dimension

IF scale_shock:
- Unnaturally large or small object next to a human-scale reference
- The size difference must be IMMEDIATELY obvious — exaggerated beyond reality
- Object positioned on one third line, reference on the other

IF mystery_object:
- Single unexplained object in sharp focus, everything else blurred
- Object should be LIT differently from surroundings (spotlight, glow, rim light)
- Viewer must think "what IS that?" in 0.3 seconds

IF environmental_stakes:
- Location that tells the entire story in one frame
- Use EXTREME depth (foreground element sharp, background heavily blurred)
- Environmental mood must match the text's psychological category

SUBJECT POSITIONING — RULE OF THIRDS:
- Place subject on LEFT or RIGHT vertical gridline (one-third or two-thirds mark)
- NEVER centered — centered = amateur, off-center = professional tension
- Subject and text must be in OPPOSING quadrants (subject right → text left, etc.)

ELEMENT 2 — TEXT (from Phase 1 — already fully designed):
- Carry forward: exact words, color, outline, shadow, container, position, size, font
- Position validated: text and subject occupy DIFFERENT quadrants
- Text has clear negative space behind it

ELEMENT 3 — BACKGROUND (The Visual Separation Layer):
THIS IS NOT FILLER. The background is a designed psychological element.

Background MUST answer these 5 questions:
1. COLOR: What is the dominant background color? (MUST be the background_color_pair from Phase 1 — the complementary opposite of the text color)
2. BLUR: Heavy Gaussian blur / cinematic bokeh — creates 3D depth, forces eye to subject + text
3. VIGNETTE: Heavy dark edges on ALL four sides — tunnels vision to center
4. PSYCHOLOGY: What does this background COMMUNICATE? (danger = embers/smoke, mystery = fog/darkness, wealth = gold shimmer, isolation = empty vastness)
5. AVOIDANCE: Background MUST NOT use YouTube UI colors as dominant tone:
   - No pure RED backgrounds (conflicts with YouTube subscribe/like buttons)
   - No pure WHITE backgrounds (conflicts with YouTube light mode)
   - No dark GREY backgrounds (conflicts with YouTube dark mode)
   Use the complementary color pair instead.

COLOR BLOCKING TABLE (mandatory):
| If text is... | Background MUST be... |
|---|---|
| Vivid crimson red | Deep teal / dark cyan gradient |
| Electric neon yellow | Deep purple / violet gradient |
| Pure white | Rich teal / deep navy gradient |
| Hot amber orange | Deep indigo / cobalt gradient |
| Neon lime green | Deep magenta / dark berry gradient |

=== DEAD ZONE ENFORCEMENT ===
- BOTTOM-RIGHT QUADRANT: Completely clear. No text, no faces, no key objects. YouTube places timestamp here.
- All critical elements in UPPER TWO-THIRDS and LEFT TWO-THIRDS of frame.
- If any element falls in bottom-right → move it. No exceptions.

=== THREE-ELEMENT VALIDATION ===
After designing each concept, count the distinct visual elements. If there are MORE than 3 (subject, text, background), you have FAILED. Remove the extra elements. Simplicity = clarity = clicks.

For EACH concept write a 300+ word forensic description structured as:

ELEMENT 1 — SUBJECT: [full description with hook type, positioning on third line, expression/scale/object details, lighting, eye direction, crop]
ELEMENT 2 — TEXT: [exact words, color, outline, shadow, container, position, size — carried from Phase 1. What's directly behind the text zone — must be dark/contrasting/empty]
ELEMENT 3 — BACKGROUND: [dominant color from pair table, blur level, vignette, atmospheric effects, psychological purpose. NOT YouTube UI colors.]
DEAD ZONE CHECK: [confirm bottom-right is clear]
THREE-ELEMENT CHECK: [confirm only 3 elements, nothing extra]

RESPOND IN EXACT JSON:
{
  "concepts": [
    {
      "rank": 1,
      "winning_text": "EXACT TEXT",
      "winning_text_design": {
        "color": "from Phase 1",
        "outline": "from Phase 1",
        "shadow": "from Phase 1",
        "container": "from Phase 1",
        "container_color": "from Phase 1 or null",
        "position": "from Phase 1",
        "size": "from Phase 1",
        "font_style": "from Phase 1"
      },
      "element_1_subject": {
        "hook_type": "exaggerated_emotion / scale_shock / mystery_object / environmental_stakes",
        "description": "Full subject description with positioning, expression, action, lighting",
        "position_on_grid": "left-third / right-third",
        "eye_direction": "at camera / at mystery element / at text",
        "crop": "extreme close-up / chest-up / wide"
      },
      "element_3_background": {
        "dominant_color": "The complementary color from the pair table",
        "color_pair_reason": "Why this color maximizes contrast with text",
        "blur_level": "heavy Gaussian / cinematic bokeh",
        "vignette": "heavy dark edges on all sides",
        "atmospheric_effects": "smoke / embers / fog / particles / God rays / none",
        "psychological_purpose": "danger / mystery / wealth / isolation / revelation / urgency",
        "avoids_youtube_ui": true
      },
      "template_type": "Face-Off / Reveal / Contrast / Warning / Bold Statement / Mystery",
      "narrative_moment": "Script moment + WHY clickable",
      "text_visual_synergy": "How text + subject + background create ONE message",
      "negative_space_strategy": "Where text sits + what's behind it",
      "dead_zone_clear": true,
      "three_element_check": true,
      "emotional_trigger": "Primary emotion in 0.3s",
      "scroll_stop_reason": "1 sentence",
      "forensic_description": "300+ words structured as Element 1 → Element 2 → Element 3 → Dead Zone → Validation"
    }
  ]
}`;

    console.log("Phase 2: Three-element visual composition...");
    const phase2Result = await safeGeminiCall(phase2Prompt, 0.9, 8192);

    await new Promise(r => setTimeout(r, 2000));

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  PHASE 3: IDEOGRAM V3 PROMPT ENGINEERING                     ║
    // ║  5-block structure: Opening → Text → Subject → Background    ║
    // ║  → Style. Each block is a designed psychological element.    ║
    // ╚═══════════════════════════════════════════════════════════════╝

    const styleBlock = visualStyle === 'anime' || visualStyle === 'cinematic_anime'
      ? 'Dramatic anime style with cel-shading, vibrant coloring, bold linework, dynamic poses.'
      : visualStyle === 'photorealistic_4k' || visualStyle === 'cinematic_realistic'
      ? 'Hyper-real cinematic photography, 4K HDR, DSLR shallow depth of field, movie-poster lighting.'
      : visualStyle === 'oil_painting'
      ? 'Painterly oil painting with visible brushstrokes, chiaroscuro lighting, museum-quality realism.'
      : visualStyle === 'comic_book'
      ? 'Comic book style with halftone dots, bold ink outlines, dynamic action poses, pop art colors.'
      : 'Cinematic dramatic lighting, professional photography quality.';

    const phase3Prompt = `You are the #1 Ideogram V3 prompt engineer for YouTube thumbnails.

MODEL: Ideogram V3 (renders text natively — put text in "QUOTATION MARKS")
DIMENSIONS: 1920x1080 Full HD, 16:9 widescreen landscape
STYLE: "${visualStyle}"

=== SAFETY ===
All characters 100% FICTIONAL. No real people. No violence. Symbolic drama only.

=== THREE-ELEMENT CONCEPTS FROM PHASE 2 ===
${JSON.stringify(phase2Result.concepts, null, 2)}

=== MANDATORY 5-BLOCK PROMPT STRUCTURE ===
Every prompt follows this EXACT order. No exceptions. Each block is a designed element.

BLOCK 1 — OPENING (sets the canvas):
"1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail with exactly three visual elements — one dominant subject, one bold text overlay, and one psychologically designed background. Graphic design composition with bold typography."

BLOCK 2 — TEXT (the STAR — write this FIRST after opening):
"Dominant text element: massive bold [font_style] text reading "[EXACT WORDS IN CAPS]" in [text_color_name] with [outline_color] outline and [shadow], [container + container_color if not raw], positioned at [position] of the frame, filling approximately [one-third for 2 words / one-quarter for 3 words] of the frame width. The area directly behind the text is [the background_color_pair — deep teal / deep purple / rich navy / deep indigo / deep magenta] ensuring crystal-clear readability. No visual elements compete with or overlap the text."

BLOCK 3 — SUBJECT (the image hook — positioned OPPOSITE to text):
"Primary subject positioned on the [left-third / right-third] vertical gridline using rule of thirds: [FULL DESCRIPTION based on hook_type]:
- If exaggerated_emotion: extreme close-up of a [fictional archetype] with [specific facial muscles engaged — wide eyes, raised brows, open mouth, furrowed brow, flared nostrils], [eye direction — staring directly at camera / looking toward the text / gazing at mystery element], head filling approximately [40-50%] of the frame, lit with [warm amber rim light on one profile, cool blue fill from opposite side], wearing [specific clothing with color names]. The expression conveys [specific emotion] that creates tension with the text.
- If scale_shock: [unnaturally large/small object] positioned next to [human-scale reference], the size difference immediately jarring, lit with [dramatic spotlight / volumetric light], creating visual intrigue that the text references but doesn't explain.
- If mystery_object: [single unexplained object in razor-sharp focus] surrounded by heavy blur, lit with [eerie glow / spotlight / rim light] that makes it the focal anchor, positioned on the [third line] with everything else soft and atmospheric.
- If environmental_stakes: [dramatic location/setting] with extreme depth — sharp foreground element, heavily blurred background, environmental mood matching the text's psychological trigger."

BLOCK 4 — BACKGROUND (psychological separation layer — NOT filler):
"Background designed as visual separation: dominant color is [background_color_pair from Phase 1 — the complementary opposite of text color] as a [gradient / solid / atmospheric wash]. Heavy Gaussian blur creating cinematic bokeh depth effect that makes subject and text float in 3D space. [Atmospheric elements based on psychological_purpose: thin wisps of smoke for danger, rolling fog for mystery, floating golden particles for wealth, vast emptiness for isolation, scattered embers for destruction, subtle light rays for revelation]. Heavy vignette darkening ALL FOUR edges, creating a visual tunnel that forces the viewer's eye to the subject and text in the center. The background avoids YouTube UI colors — no pure red, no white, no dark grey as dominant tones. The [background color] creates maximum chromatic contrast against the [text color], making the typography impossible to miss."

BLOCK 5 — STYLE + QUALITY + DEAD ZONE:
"${styleBlock} Heavy vignette on all edges. The bottom-right quadrant of the frame is deliberately kept clear of all text, faces, and key visual elements to avoid conflict with YouTube's timestamp overlay. All critical visual information occupies the upper two-thirds and left two-thirds of the frame. Ultra high resolution, crisp sharp details, professional thumbnail quality."

=== HARD RULES ===
- Text in "QUOTATION MARKS" — Ideogram renders these
- NO hex codes, NO pixel values, NO percentages — named colors and spatial language only
- THREE ELEMENTS ONLY — if the prompt describes more than subject + text + background, delete the extras
- Subject and text in OPPOSING quadrants — never same side
- Background color from the complementary pair table — never generic "dark background"
- Dead zone (bottom-right) always clear
- Each prompt 300+ words following all 5 blocks

RESPOND IN EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "template_type": "from Phase 2",
      "concept_description": "2-3 sentence summary of the three elements working together",
      "text_overlay": "EXACT TEXT IN CAPS",
      "text_design": {
        "color": "vivid color name",
        "outline": "outline spec",
        "shadow": "shadow spec",
        "container": "raw / banner / stamp / badge / glow",
        "container_color": "color or null",
        "position": "position zone",
        "size": "massive / large",
        "font_style": "font name"
      },
      "subject_design": {
        "hook_type": "type from Phase 2",
        "grid_position": "left-third / right-third",
        "eye_direction": "at camera / at text / at mystery",
        "crop": "extreme close-up / chest-up / wide"
      },
      "background_design": {
        "dominant_color": "complementary color name",
        "blur": "heavy Gaussian bokeh",
        "vignette": "heavy all edges",
        "atmosphere": "smoke / embers / fog / particles / clean",
        "psychological_purpose": "danger / mystery / wealth / isolation"
      },
      "text_visual_synergy": "How all 3 elements create one message",
      "emotional_hook": "Emotion + why it stops scrolling",
      "scroll_stop_reason": "1 sentence",
      "accent_color": "eye-catching accent",
      "color_scheme": "text color on background color with subject lighting",
      "visual_effects": "rim lighting, bokeh, vignette, atmosphere",
      "style_reference": "cinema / minimal / documentary",
      "ctr_score": 9,
      "dead_zone_clear": true,
      "three_element_count": 3,
      "negative_prompt": "blurry, low quality, pixelated, watermark, low resolution, compressed, distorted text, misspelled text, illegible text, small text, text overlap on face, more than three visual elements, cluttered composition, pure red background, pure white background, dark grey background, jpeg artifacts, text in bottom right",
      "image_prompt": "300+ word prompt following BLOCK 1→2→3→4→5 structure exactly. Text in quotation marks. Three elements only."
    }
  ]
}`;

    console.log("Phase 3: Ideogram V3 prompts (5-block, 3-element)...");
    const phase3Result = await safeGeminiCall(phase3Prompt, 0.85, 8192);

    // ══════════════════════════════════════════════════════════════
    // DELETE EXISTING (parallel)
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
    const savePromises = (phase3Result.thumbnails || []).map(async (t, i) => {
      const styleRef = (t.style_reference || 'cinema').split('/')[0].trim().toLowerCase();
      const validStyles = ['cinema', 'minimal', 'documentary'];

      let imagePrompt = t.image_prompt || '';
      if (!imagePrompt.includes('1920x1080') && !imagePrompt.includes('16:9')) {
        imagePrompt = `1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail. ${imagePrompt}`;
      }
      if (!imagePrompt.toLowerCase().includes('crisp sharp details')) {
        imagePrompt += '. Ultra high resolution, crisp sharp details, professional quality.';
      }

      const td = t.text_design || {};
      const sd = t.subject_design || {};
      const bd = t.background_design || {};

      const designSummary = `TEXT: ${td.color || 'white'} ${td.container || 'raw'} @ ${td.position || 'upper-left'} ${td.size || 'massive'} | SUBJECT: ${sd.hook_type || 'emotion'} @ ${sd.grid_position || 'right-third'} | BG: ${bd.dominant_color || 'dark'} ${bd.atmosphere || 'clean'} ${bd.psychological_purpose || 'drama'}`;

      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id,
          rank: t.rank || i + 1,
          concept_description: `[${t.template_type}] ${t.concept_description}\n\n🎯 ${t.emotional_hook}\n🛑 ${t.scroll_stop_reason}\n🔗 ${t.text_visual_synergy || ''}\n📐 3-Element: ${designSummary}`,
          facial_expression: typeof t.subject_design === 'object' ? JSON.stringify(t.subject_design) : (t.subject_description || ''),
          visual_metaphor: t.template_type,
          color_scheme: `${t.color_scheme} | Accent: ${t.accent_color} | FX: ${t.visual_effects}`,
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
    // GENERATE IMAGES (parallel)
    // ══════════════════════════════════════════════════════════════
    console.log(`\n═══ Generating ${saved.length} thumbnail images ═══`);

    const imagePromises = saved.map(async ({ record, imagePrompt, negativePrompt }) => {
      try {
        const { url, model } = await generateThumbnailImage(KIE_API_KEY, imagePrompt, negativePrompt);
        if (url) {
          await base44.asServiceRole.entities.ThumbnailConcepts.update(record.id, { image_url: url });
          console.log(`✓ Rank ${record.rank} via ${model}`);
          return { ...record, image_url: url, model_used: model };
        }
        console.warn(`✗ Rank ${record.rank} — no image`);
        return { ...record, image_url: null, model_used: 'failed' };
      } catch (err) {
        console.error(`✗ Rank ${record.rank} error:`, err.message);
        return { ...record, image_url: null, model_used: 'error' };
      }
    });

    const thumbnails = await Promise.all(imagePromises);
    const imagesGenerated = thumbnails.filter(t => t.image_url).length;

    console.log('══════════════════════════════════════════════════════');
    console.log(`Phase 1: ${allTextOptions.length} texts → ${winningTexts.length} winners`);
    console.log(`Phase 2: ${phase2Result.concepts?.length || 0} 3-element compositions`);
    console.log(`Phase 3: ${phase3Result.thumbnails?.length || 0} Ideogram prompts`);
    console.log(`Images: ${imagesGenerated}/${saved.length}`);
    console.log('══════════════════════════════════════════════════════');

    return Response.json({
      success: true,
      thumbnails,
      text_engine: {
        script_climax: phase1Result.script_climax,
        curiosity_gap: phase1Result.curiosity_gap_identified,
        all_text_options: allTextOptions,
        winning_texts: winningTexts
      },
      meta: {
        total_concepts: saved.length,
        total_images: imagesGenerated,
        phases: 3,
        architecture: "text-first → 3-element visual → 5-block Ideogram prompt",
        text_options_generated: allTextOptions.length,
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