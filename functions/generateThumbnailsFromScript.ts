import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Workaround: Deno's Brotli decompressor sometimes fails on SDK responses.
// Override global fetch to disable Brotli and prefer identity/gzip only.
const _originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  init = init || {};
  init.headers = new Headers(init.headers || {});
  if (!init.headers.has('Accept-Encoding')) {
    init.headers.set('Accept-Encoding', 'gzip, deflate, identity');
  }
  return _originalFetch(input, init);
};

// ══════════════════════════════════════════════════════════════════
// THUMBNAIL ENGINE v3 — SCRIPT-ANCHORED 3-PHASE PIPELINE
// ══════════════════════════════════════════════════════════════════
// Phase 1: Script Anchor Extraction → Topic-Specific Text Engine
// Phase 2: Anchor-Driven Three-Element Visual Composition
// Phase 3: 5-Block Ideogram V3 Prompt Engineering
//
// UPGRADE: Every thumbnail is now VISUALLY ANCHORED to the script's
// actual content. No more generic "THEY LIED" on a shocked face.
// Instead: specific objects, symbols, and data from the script
// appear IN the image alongside emotional triggers.
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
  // Attempt 1: Ideogram V3 QUALITY
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

  // Attempt 2: Ideogram V3 BALANCED (shorter prompt)
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

    let scenesData = [];
    let brandsData = [];
    try { scenesData = await base44.entities.Scenes.filter({ project_id }); } catch (e) { console.warn('Scenes fetch failed:', e.message); }
    try { brandsData = await base44.entities.BrandIdentities.filter({ project_id }); } catch (e) { console.warn('Brands fetch failed:', e.message); }

    let sceneContext = '';
    if (Array.isArray(scenesData) && scenesData.length > 0) {
      const sorted = [...scenesData].sort((a, b) => a.scene_number - b.scene_number);
      sceneContext = `\nSCENE VISUALS:\n${sorted.slice(0, 5).map(s => `Scene ${s.scene_number}: ${(s.image_prompt || s.narration_text || '').substring(0, 150)}`).join('\n')}`;
    }

    let brandContext = '';
    if (Array.isArray(brandsData) && brandsData.length > 0) {
      const b = brandsData[0];
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
    console.log('THUMBNAILS v3: SCRIPT-ANCHORED 3-PHASE PIPELINE');
    console.log(`Video: ${script.title}`);
    console.log(`Style: ${visualStyle} | Ideogram V3 → Flux 2`);
    console.log('══════════════════════════════════════════════════════');

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  PHASE 1: SCRIPT ANCHOR EXTRACTION + TEXT ENGINE              ║
    // ║  Step 0: Extract visual anchors from script                   ║
    // ║  Step 1: Climax extraction                                    ║
    // ║  Step 2: 10 topic-specific text options (6+ must have anchor) ║
    // ║  Step 3: Design each with color blocking + subject hook       ║
    // ║  Step 4: Score → pick top 3                                   ║
    // ╚═══════════════════════════════════════════════════════════════╝

    const phase1Prompt = `You are the world's #1 YouTube thumbnail text copywriter AND visual psychologist. 10+ year track record. 12%+ CTR consistently.

=== MISSION ===
Analyze this script. Extract visual anchors. Extract emotional climax. Generate 10 SCRIPT-SPECIFIC scroll-stopping text options. Score each. Pick top 3.

VIDEO TOPIC: "${topic.title}"
VIDEO TITLE: "${script.title}"
NICHE: "${project.niche}"
${brandContext}${selectedTitleContext}

SCRIPT (extract visual anchors + find climax):
${truncatedScript}

=== STEP 0: SCRIPT ANCHOR EXTRACTION ===
BEFORE generating ANY text, extract these physical/visual anchors from the script:

1. VILLAIN OBJECT: The physical thing causing harm (mortgage contract, bank building, credit card, hospital bill, algorithm, corporation, foreclosure sign, insurance denial letter, tax form, etc.)
2. VICTIM OBJECT: The physical thing being harmed (family home, savings jar, paycheck, small business, retirement fund, health, neighborhood, childhood dream, etc.)
3. TRAP SYMBOL: A visual metaphor for the script's core trap (chains around house, cage around family, mousetrap with cheese-shaped-like-house, sinking ship, cracking foundation, puppet strings, ticking time bomb, etc.)
4. SHOCK DATA: Any specific number, percentage, or timeline from the script that creates visceral reaction ("30 years", "crashed 40%", "$0 equity", "2008", "$500,000 in interest", etc.)
5. CONTRAST PAIR: The before/after or illusion/reality from the script (happy family vs foreclosure, American dream vs nightmare, "your house" vs "bank's house", healthy vs sick, free vs trapped, etc.)
6. NICHE OBJECTS: 3-5 physical items viewers in this niche immediately recognize (for finance: house keys, mortgage papers, bank vault, "APPROVED/DENIED" stamps, dollar bills; for health: pills, hospital bed, test results, etc.)

These anchors MUST appear in your text options and subject descriptions. Generic emotional text without script anchors is BANNED.

=== STEP 1: CLIMAX EXTRACTION ===
Find the ONE sentence with: highest emotional stakes, biggest surprise/contradiction/turning point, would stop someone mid-scroll.

=== STEP 2: GENERATE 10 TEXT OPTIONS ===

CATEGORY A — ANCHOR-SPECIFIC CURIOSITY GAP (4 options)
Incomplete thought referencing the script's ACTUAL topic — not generic outrage.
- Technique: Reference the villain_object or victim_object without fully explaining
- GOOD examples for a mortgage script: "YOU OWN NOTHING", "BANK'S HOUSE", "NOT YOURS", "RENTING FOREVER"
- GOOD examples for a health script: "YOUR DOCTOR KNEW", "PILL TRAP", "WRONG DIAGNOSIS"
- BAD (too generic — works on ANY video): "THEY LIED", "THEY KNEW", "IT'S OVER", "BE CAREFUL"
- Power: Brain cannot rest AND the topic is clear from 2 words

CATEGORY B — ANCHOR-SPECIFIC FORBIDDEN KNOWLEDGE (3 options)
Loss aversion tied to THIS SPECIFIC threat, not generic fear.
- Technique: Reference the trap_symbol or shock_data from the script
- GOOD for mortgage: "30 YEAR TRAP", "FAKE EQUITY", "$0 YOURS"
- GOOD for diet: "POISON LABEL", "FDA LIED", "NOT FOOD"
- BAD (too generic): "STOP WATCHING", "I WAS WRONG", "THEY HID THIS"
- Power: Triggers fight-or-flight about THIS SPECIFIC THREAT the viewer faces

CATEGORY C — ANCHOR-SPECIFIC SHOCK / CONTRADICTION (3 options)
Cognitive dissonance using the contrast_pair from the script.
- Technique: State the illusion to create dissonance with the visual reality
- GOOD for mortgage: "DREAM HOME?", "SAFE INVESTMENT?", "GUARANTEED?"
- GOOD for career: "DREAM JOB?", "PROMOTION TRAP", "SUCCESS?"
- BAD (too generic): "IT'S FAKE", "HE SMILED", "THEY AGREED"
- Power: Viewer's belief system is challenged about a SPECIFIC thing they own/do/believe

TOPIC ANCHOR RULE: At least 6 of 10 text options MUST contain a word directly referencing the script's specific topic (house, mortgage, bank, debt, rent, own, equity, crash, trap, doctor, pill, algorithm, etc.). Pure emotion words without topic anchoring ("THEY LIED", "IT'S OVER") limited to MAX 4 of 10.

SPECIFICITY TEST: For each text option ask "Would this work on 50 different video topics?" If YES → too generic → rewrite with a topic word.

=== TEXT HARD RULES ===
1. MAX 3 WORDS (ideal: 2). Never exceed 4.
2. ALL CAPS always
3. Never reveal the full answer — tease, never tell
4. BANNED: "AMAZING", "INCREDIBLE", "YOU WON'T BELIEVE", "SHOCKING TRUTH"
5. Power verbs: STOP, HIDE, BROKE, LIED, KNEW, LEFT, GONE, CAUGHT, LEAKED, EXPOSED, TRAP, OWN, STOLE, FAKE
6. Pronouns > names EXCEPT when the specific entity IS the hook: "THE BANK LIED" > "THEY LIED" for finance
7. Positive topic? FLIP negative: "How to save" → "YOU'RE WASTING IT"
8. Must hint at specific topic even without context — "YOU OWN NOTHING" hints at ownership, "BANK'S HOUSE" hints at mortgage

=== STEP 3: DESIGN EACH TEXT OPTION ===

TEXT COLOR + COMPLEMENTARY BACKGROUND PAIR:
The text color determines the ENTIRE background color of the thumbnail.

| Text Color | Background Color Pair | Never Use As BG | Psychological Effect |
|---|---|---|---|
| Vivid crimson red | Deep teal / dark cyan | YouTube red, pure black | Danger pops against cool calm |
| Electric neon yellow | Deep purple / violet | White, grey | Forbidden glow against mystery |
| Pure white | Rich teal / deep navy | YouTube white/grey | Clean authority against depth |
| Hot amber orange | Deep indigo / cobalt | Red (too close), grey | Urgency against the abyss |
| Neon lime green | Deep magenta / dark berry | Black (too generic) | Toxic shock against drama |

TEXT POSITION:
- UPPER-LEFT: Best default. Left-to-right reading. Avoids all YouTube UI.
- UPPER-CENTER: Maximum dominance. Subject below.
- BOTTOM-CENTER: Only if upper area has key visual. NEVER bottom-right (timestamp death zone).
- ACROSS-CENTER: Text IS the thumbnail. Maximum disruption.

TEXT SIZE: MASSIVE (one-third of frame) for 1-2 words. LARGE (one-quarter) for 3 words.

CONTAINER: RAW (outline+shadow), BANNER (full-width strip), STAMP (tilted, rough), BADGE (rounded rect), GLOW (colored halo).

FONT: Impact, Bebas Neue, or bold condensed sans-serif. Never decorative.

=== STEP 4: ANCHOR-BASED SUBJECT HOOK ===
For EACH text option, specify the visual subject. CRITICAL: The subject MUST include a SCRIPT ANCHOR OBJECT.
A shocked face ALONE is generic. A shocked face HOLDING a foreclosure notice = script-specific.

- exaggerated_emotion_WITH_ANCHOR: Extreme close-up face with a script-relevant object visible — holding it, reflected in eyes, looming behind, being crushed by it. Face provides EMOTION, anchor provides TOPIC CONTEXT. "Shocked face" = REJECTED. "Shocked face gripping crumbling house deed" = APPROVED.
- scale_shock_WITH_ANCHOR: The villain_object or trap_symbol at unnatural scale next to victim_object. Giant bank stamp crushing tiny house. Massive chain around small family. Enormous "DENIED" over house deed.
- anchor_object_spotlight: The villain_object or trap_symbol as dramatic hero object, lit like evidence. Mortgage contract with glowing clause, house keys in mousetrap, sinking house.
- environmental_anchor: The contrast_pair as split environment. Left: dream/illusion. Right: nightmare/reality. Beautiful house exterior / rotting interior.

EVERY subject description must name at least ONE specific object from the script anchors.

=== STEP 5: SCORE 1-10 ===
- STOP_POWER (30%): Stops scrolling in 0.3 seconds?
- CURIOSITY (25%): Unbearable need to click?
- TOPIC_SPECIFICITY (25%): Can viewer identify the video's topic from thumbnail alone?
- CLARITY (10%): Readable at phone thumbnail size?
- UNIVERSALITY (10%): Works across the niche audience?

RESPOND IN EXACT JSON:
{
  "script_anchors": {
    "villain_object": "The physical thing causing harm — be specific",
    "victim_object": "The physical thing being harmed — be specific",
    "trap_symbol": "Visual metaphor for the core trap — describe it visually",
    "shock_data": "Specific number/percentage/timeline from the script",
    "contrast_pair": { "illusion": "What people believe", "reality": "What's actually true" },
    "niche_objects": ["object1", "object2", "object3", "object4", "object5"]
  },
  "script_climax": "The single highest-stakes sentence from the script",
  "curiosity_gap_identified": "The core unanswered question",
  "text_options": [
    {
      "rank": 1,
      "text": "EXACT WORDS IN CAPS",
      "word_count": 2,
      "category": "curiosity_gap / forbidden_knowledge / shock_contradiction",
      "topic_anchor_word": "The specific topic word in this text (house/bank/mortgage/etc) or 'emotion_only' if none",
      "psychological_mechanism": "Which bias + WHY it stops scrolling for THIS topic",
      "script_connection": "Which sentence/concept from the script this text references",
      "negative_framing_applied": true,
      "specificity_test": "Would this work on 50 different videos? YES=too generic / NO=good",
      "text_color_name": "Vivid color name",
      "background_color_pair": "Complementary background color from table",
      "outline_color": "very thick black / thick dark navy / thick deep red",
      "shadow": "heavy black drop shadow / colored glow / none",
      "container": "raw / banner / stamp / badge / glow",
      "container_color": "color if applicable, null if raw",
      "position": "upper-left / upper-center / bottom-center / across-center",
      "size": "massive / large",
      "font_style": "Impact / Bebas Neue / bold condensed sans-serif",
      "subject_hook_type": "exaggerated_emotion_WITH_ANCHOR / scale_shock_WITH_ANCHOR / anchor_object_spotlight / environmental_anchor",
      "subject_hook_description": "What specific subject + what script anchor object is visible — BOTH required",
      "anchor_object_in_subject": "Name the specific anchor object that appears in this subject",
      "stop_power_score": 9,
      "curiosity_score": 9,
      "topic_specificity_score": 9,
      "clarity_score": 9,
      "universality_score": 8,
      "total_ctr_score": 9.0,
      "why_this_wins": "1 sentence connecting text + anchor + emotion"
    }
  ],
  "top_3_winners": [1, 2, 3],
  "topic_anchor_count": 7,
  "emotion_only_count": 3
}`;

    console.log("Phase 1: Script anchors + topic-specific text engine...");
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

    const anchors = phase1Result.script_anchors || {};
    console.log(`✓ Phase 1: ${allTextOptions.length} texts → ${winningTexts.length} winners`);
    console.log(`  Anchors: villain=${anchors.villain_object} | victim=${anchors.victim_object} | trap=${anchors.trap_symbol}`);
    console.log(`  Topic words: ${phase1Result.topic_anchor_count || '?'}/10 | Emotion-only: ${phase1Result.emotion_only_count || '?'}/10`);
    winningTexts.forEach(w => console.log(`  "${w.text}" [${w.category}] anchor:${w.anchor_object_in_subject || 'none'} | ${w.text_color_name} on ${w.background_color_pair} | CTR:${w.total_ctr_score}`));

    await new Promise(r => setTimeout(r, 2000));

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  PHASE 2: ANCHOR-DRIVEN THREE-ELEMENT VISUAL COMPOSITION     ║
    // ║  Each concept = Subject (with anchor) + Text + Background     ║
    // ║  The anchor object makes the thumbnail TOPIC-SPECIFIC         ║
    // ╚═══════════════════════════════════════════════════════════════╝

    const phase2Prompt = `You are the world's #1 thumbnail visual architect. You design thumbnails using the THREE-ELEMENT COMPOSITION RULE used by MrBeast, Veritasium, and top creators.

=== THE THREE-ELEMENT RULE ===
High-CTR thumbnails NEVER exceed 3 distinct visual elements. More = cognitive overload = scroll past.
- ELEMENT 1 — SUBJECT: The image hook — MUST contain a script anchor object
- ELEMENT 2 — TEXT: The cognitive itch (from Phase 1 winners — already designed)
- ELEMENT 3 — BACKGROUND: The visual separation layer (psychologically designed)

Each element serves: Contrast, Context, or Constraint. If it doesn't — delete it.

=== SAFETY ===
ALL characters 100% FICTIONAL. No real people. No violence. Symbolic drama only.

VIDEO: "${topic.title}" | TITLE: "${script.title}" | NICHE: "${project.niche}" | STYLE: "${visualStyle}"
${brandContext}${sceneContext}${styleInstruction}${templateInstruction}${nicheDnaInstruction}

CLIMAX: "${phase1Result.script_climax || ''}"
CURIOSITY GAP: "${phase1Result.curiosity_gap_identified || ''}"

=== SCRIPT VISUAL ANCHORS (from Phase 1) ===
${JSON.stringify(anchors, null, 2)}

CRITICAL RULE: Every concept MUST include at least ONE script anchor object visible in the thumbnail.
The viewer must identify WHAT TOPIC this video is about within 0.3 seconds from the visual alone — BEFORE reading text.
"Shocked face + THEY LIED" = generic outrage = 6% CTR.
"Shocked face gripping crumbling house deed + YOU OWN NOTHING" = specific financial fear = 12% CTR.

=== THE 3 WINNING TEXTS (each concept built around ONE) ===
${JSON.stringify(winningTexts, null, 2)}

=== ELEMENT 1 — SUBJECT DESIGN (WITH ANCHOR) ===

Design rules by subject_hook_type:

IF exaggerated_emotion_WITH_ANCHOR:
- EXTREME close-up face (head fills 40-50% of frame)
- Specific muscles: wide eyes, raised brows, open mouth, furrowed brow, flared nostrils
- Eye direction: at camera (confrontational) OR at the anchor object (guides gaze to topic)
- MUST include a script anchor: hands gripping the villain_object, anchor object visible over shoulder, trap_symbol looming behind face, anchor reflected in eyes, face pressed against victim_object
- The face provides EMOTION. The anchor provides TOPIC CONTEXT. Both required.
- Positioned on LEFT or RIGHT third line — anchor on opposing side or overlapping face
- Warm rim light one side, cool fill other side

IF scale_shock_WITH_ANCHOR:
- The villain_object or trap_symbol at unnatural scale next to victim_object
- Size difference IMMEDIATELY obvious — exaggerated beyond reality
- Object on one third line, reference on the other
- Dramatic spotlight / volumetric light on the anchor

IF anchor_object_spotlight:
- Single anchor object (villain_object or trap_symbol) as dramatic hero
- LIT differently from surroundings (spotlight, glow, rim light)
- Razor-sharp focus, everything else blurred
- Viewer must think "what IS that?" in 0.3 seconds AND identify the topic

IF environmental_anchor:
- The contrast_pair shown as split environment
- Left: dream/illusion | Right: nightmare/reality
- OR above: pristine exterior | Below: rotting interior
- Extreme depth (foreground sharp, background blurred)

SUBJECT POSITIONING — RULE OF THIRDS:
- LEFT or RIGHT vertical gridline — NEVER dead center
- Subject and text in OPPOSING quadrants

=== ELEMENT 2 — TEXT (from Phase 1 — carry forward exactly) ===
- Exact words, color, outline, shadow, container, position, size, font
- Text and subject in DIFFERENT quadrants
- Clear negative space behind text

=== ELEMENT 3 — BACKGROUND (psychological layer) ===
5 MANDATORY QUESTIONS:
1. COLOR: Dominant = background_color_pair from Phase 1 (complementary opposite of text)
2. BLUR: Heavy Gaussian / cinematic bokeh — 3D depth
3. VIGNETTE: Heavy dark edges ALL four sides
4. PSYCHOLOGY: What it communicates (danger=embers/smoke, mystery=fog, wealth=gold, isolation=emptiness)
5. ANCHOR ECHO: Can a SUBTLE anchor element appear in the background? (faint house silhouette in fog, chain texture in vignette, faint dollar signs in bokeh) — this reinforces topic WITHOUT adding a 4th element
6. AVOIDANCE: No pure RED, WHITE, or dark GREY backgrounds (YouTube UI conflict)

COLOR BLOCKING TABLE:
| Text Color | Background MUST Be |
|---|---|
| Vivid crimson red | Deep teal / dark cyan gradient |
| Electric neon yellow | Deep purple / violet gradient |
| Pure white | Rich teal / deep navy gradient |
| Hot amber orange | Deep indigo / cobalt gradient |
| Neon lime green | Deep magenta / dark berry gradient |

=== DEAD ZONE ENFORCEMENT ===
BOTTOM-RIGHT QUADRANT: Completely clear. No text, no faces, no key objects.
All critical elements in UPPER TWO-THIRDS and LEFT TWO-THIRDS.

=== THREE-ELEMENT VALIDATION ===
After designing each concept, count elements. MORE than 3 = FAILED. Remove extras.
The background anchor echo counts as part of element 3 (background), NOT a 4th element.

For EACH concept write a 300+ word forensic description structured as:
ELEMENT 1 — SUBJECT + ANCHOR: [full description with anchor object, positioning, expression, lighting]
ELEMENT 2 — TEXT: [exact words, color, position — carried from Phase 1]
ELEMENT 3 — BACKGROUND + ANCHOR ECHO: [dominant color, blur, vignette, atmosphere, subtle anchor element]
DEAD ZONE CHECK: [confirm bottom-right clear]
THREE-ELEMENT CHECK: [confirm only 3 elements]

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
        "hook_type": "exaggerated_emotion_WITH_ANCHOR / scale_shock_WITH_ANCHOR / anchor_object_spotlight / environmental_anchor",
        "description": "Full subject + anchor object description",
        "anchor_object": "The specific script anchor visible in this subject",
        "anchor_placement": "held by subject / reflected in eyes / looming behind / over shoulder / hero object / split environment",
        "position_on_grid": "left-third / right-third",
        "eye_direction": "at camera / at anchor object / at text",
        "crop": "extreme close-up / chest-up / wide"
      },
      "element_3_background": {
        "dominant_color": "Complementary color from pair table",
        "color_pair_reason": "Why this maximizes contrast",
        "blur_level": "heavy Gaussian / cinematic bokeh",
        "vignette": "heavy dark edges all sides",
        "atmospheric_effects": "smoke / embers / fog / particles / god rays / none",
        "anchor_echo": "Subtle anchor element in background (faint silhouette / texture / pattern) or none",
        "psychological_purpose": "danger / mystery / wealth / isolation / revelation / urgency",
        "avoids_youtube_ui": true
      },
      "template_type": "Face-Off / Reveal / Contrast / Warning / Bold Statement / Mystery",
      "narrative_moment": "Script moment + WHY clickable",
      "text_visual_synergy": "How text + subject (with anchor) + background create ONE topic-specific message",
      "negative_space_strategy": "Where text sits + what's behind it",
      "dead_zone_clear": true,
      "three_element_check": true,
      "topic_identifiable_without_text": true,
      "emotional_trigger": "Primary emotion in 0.3s",
      "scroll_stop_reason": "1 sentence",
      "forensic_description": "300+ words: Element 1 (subject+anchor) → Element 2 (text) → Element 3 (background+echo) → Dead Zone → Validation"
    }
  ]
}`;

    console.log("Phase 2: Anchor-driven 3-element visual composition...");
    const phase2Result = await safeGeminiCall(phase2Prompt, 0.9, 8192);

    await new Promise(r => setTimeout(r, 2000));

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  PHASE 3: IDEOGRAM V3 PROMPT ENGINEERING                     ║
    // ║  5-block structure with anchor objects embedded               ║
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

=== SCRIPT ANCHORS (must appear in prompts) ===
${JSON.stringify(anchors, null, 2)}

=== THREE-ELEMENT CONCEPTS FROM PHASE 2 ===
${JSON.stringify(phase2Result.concepts, null, 2)}

=== MANDATORY 5-BLOCK PROMPT STRUCTURE ===

BLOCK 1 — OPENING:
"1920x1080 Full HD 16:9 widescreen landscape YouTube thumbnail with exactly three visual elements — one dominant subject containing a [anchor_object type] anchor, one bold text overlay, and one psychologically designed background. Graphic design composition with bold typography."

BLOCK 2 — TEXT (the STAR):
"Dominant text element: massive bold [font_style] text reading "[EXACT WORDS IN CAPS]" in [text_color_name] with [outline_color] outline and [shadow], [container + color if not raw], positioned at [position] of the frame, filling approximately [one-third for 2 words / one-quarter for 3 words] of the frame width. The area directly behind the text is [background_color_pair] ensuring crystal-clear readability. No visual elements compete with or overlap the text."

BLOCK 3 — SUBJECT WITH ANCHOR (positioned OPPOSITE to text):
"Primary subject on the [left-third / right-third] vertical gridline: [FULL DESCRIPTION based on hook_type]:
- If exaggerated_emotion_WITH_ANCHOR: extreme close-up of a [fictional archetype] with [specific facial muscles], [eye direction], head filling 40-50% of frame. CRITICALLY: [describe the anchor object and how it's integrated — gripped in hands, visible over shoulder, reflected in eyes, looming behind]. The [anchor object] identifies THIS as a [topic] video, not generic outrage. Lit with [warm/cool rim lighting].
- If scale_shock_WITH_ANCHOR: [anchor object at unnatural scale] next to [human-scale reference], immediately jarring, lit with [dramatic light]. The anchor connects viewer to the specific topic.
- If anchor_object_spotlight: [anchor object as hero] in razor-sharp focus, surrounded by blur, lit with [spotlight/glow]. This single object tells the entire video's story.
- If environmental_anchor: [contrast_pair as split environment] with extreme depth. The environment itself IS the script's story."

BLOCK 4 — BACKGROUND WITH ANCHOR ECHO:
"Background: dominant color is [background_color_pair] as [gradient/wash]. Heavy Gaussian blur creating cinematic bokeh depth. [Atmospheric elements: smoke/embers/fog/particles based on psychological_purpose]. [If anchor_echo exists: subtle [anchor silhouette/texture/pattern] barely visible through the atmosphere, reinforcing the topic subconsciously]. Heavy vignette darkening ALL four edges. Avoids YouTube UI colors."

BLOCK 5 — STYLE + QUALITY + DEAD ZONE:
"${styleBlock} Heavy vignette on all edges. Bottom-right quadrant deliberately clear of all elements. All critical visuals in upper two-thirds and left two-thirds. Ultra high resolution, crisp sharp details, professional thumbnail quality."

=== HARD RULES ===
- Text in "QUOTATION MARKS" for Ideogram rendering
- NO hex codes, NO pixel values, NO percentages — named colors and spatial language only
- THREE ELEMENTS ONLY — subject (with anchor) + text + background (with echo)
- Subject and text in OPPOSING quadrants
- Anchor object MUST be described in Block 3 — this is what makes the thumbnail topic-specific
- Background color from complementary pair table
- Dead zone (bottom-right) always clear
- Each prompt 300+ words following all 5 blocks

RESPOND IN EXACT JSON:
{
  "thumbnails": [
    {
      "rank": 1,
      "template_type": "from Phase 2",
      "concept_description": "Three elements + anchor working together",
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
        "hook_type": "type",
        "grid_position": "left-third / right-third",
        "anchor_object": "The specific anchor object visible",
        "anchor_placement": "How anchor is integrated into subject",
        "eye_direction": "at camera / at anchor / at text",
        "crop": "extreme close-up / chest-up / wide"
      },
      "background_design": {
        "dominant_color": "complementary color",
        "blur": "heavy Gaussian bokeh",
        "vignette": "heavy all edges",
        "atmosphere": "smoke / embers / fog / particles / clean",
        "anchor_echo": "subtle anchor element or none",
        "psychological_purpose": "danger / mystery / wealth / isolation"
      },
      "script_anchor_used": "Which anchor appears (villain_object / victim_object / trap_symbol / shock_data / contrast_pair)",
      "topic_identifiable": "Can viewer identify video topic from image alone before reading text? YES/NO + why",
      "text_visual_synergy": "How all 3 elements + anchor create one topic-specific message",
      "emotional_hook": "Emotion + why it stops scrolling",
      "scroll_stop_reason": "1 sentence",
      "accent_color": "eye-catching accent",
      "color_scheme": "text color on background color with subject lighting",
      "visual_effects": "rim lighting, bokeh, vignette, atmosphere",
      "style_reference": "cinema / minimal / documentary",
      "ctr_score": 9,
      "dead_zone_clear": true,
      "three_element_count": 3,
      "negative_prompt": "blurry, low quality, pixelated, watermark, distorted text, misspelled text, illegible text, small text, text overlap on face, more than three visual elements, cluttered, pure red background, pure white background, dark grey background, jpeg artifacts, text in bottom right, generic expression without context object",
      "image_prompt": "300+ words following BLOCK 1→2→3→4→5. Anchor object described in Block 3. Text in quotes."
    }
  ]
}`;

    console.log("Phase 3: Ideogram V3 prompts (anchor-embedded 5-block)...");
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

      const designSummary = `TEXT: ${td.color || 'white'} ${td.container || 'raw'} @ ${td.position || 'upper-left'} ${td.size || 'massive'} | SUBJECT: ${sd.hook_type || 'emotion'} @ ${sd.grid_position || 'right-third'} anchor:${sd.anchor_object || 'none'} | BG: ${bd.dominant_color || 'dark'} ${bd.atmosphere || 'clean'} echo:${bd.anchor_echo || 'none'} [${bd.psychological_purpose || 'drama'}]`;

      try {
        const record = await base44.entities.ThumbnailConcepts.create({
          project_id,
          rank: t.rank || i + 1,
          concept_description: `[${t.template_type}] ${t.concept_description}\n\n🎯 ${t.emotional_hook}\n🛑 ${t.scroll_stop_reason}\n🔗 ${t.text_visual_synergy || ''}\n🏷️ Anchor: ${t.script_anchor_used || 'none'} | Topic ID: ${t.topic_identifiable || 'unknown'}\n📐 3-Element: ${designSummary}`,
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
    console.log(`Anchors: villain=${anchors.villain_object} | victim=${anchors.victim_object}`);
    console.log(`Phase 1: ${allTextOptions.length} texts → ${winningTexts.length} winners (${phase1Result.topic_anchor_count || '?'} topic-specific)`);
    console.log(`Phase 2: ${phase2Result.concepts?.length || 0} anchor-driven compositions`);
    console.log(`Phase 3: ${phase3Result.thumbnails?.length || 0} Ideogram prompts`);
    console.log(`Images: ${imagesGenerated}/${saved.length}`);
    console.log('══════════════════════════════════════════════════════');

    return Response.json({
      success: true,
      thumbnails,
      script_anchors: anchors,
      text_engine: {
        script_climax: phase1Result.script_climax,
        curiosity_gap: phase1Result.curiosity_gap_identified,
        all_text_options: allTextOptions,
        winning_texts: winningTexts,
        topic_anchor_count: phase1Result.topic_anchor_count,
        emotion_only_count: phase1Result.emotion_only_count
      },
      meta: {
        total_concepts: saved.length,
        total_images: imagesGenerated,
        phases: 3,
        architecture: "script-anchored → topic-specific text → anchor-driven 3-element → 5-block Ideogram",
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