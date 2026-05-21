import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// Phase C — Explainer Scene Breakdown
// Generates section-paced scenes (12+8+10+8+8+4 = 50 total) with mixed shot types
// (Einstein establishing + diagram inserts + B-roll cuts + text slams + close-ups)
// Locked to the 5 Einstein visual arcs (science, professor, accountant, tech, maker).

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY');

// ═══════════════════════════════════════════════════════════════════
// 5-ARC VISUAL DNA — every Einstein scene anchors to these blocks
// ═══════════════════════════════════════════════════════════════════
const ARC_VISUAL_DNA = {
  science: {
    label: 'Mad Scientist',
    outfit: 'Crisp white lab coat over olive sweater, glasses pushed up, safety goggles around neck',
    environment: 'Cluttered laboratory — glowing test tubes, bubbling beakers, chalkboards covered in equations, holographic 3D molecular structures, warm tungsten lamps mixed with electric blue glow',
    signature_props: 'Glowing test tubes in rack, bubbling beaker, holographic 3D molecular structure floating mid-air, chalkboard covered in equations',
    branded_mug: 'Coffee mug labeled "EUREKA"',
    diagram_style: 'Hand-drawn equations in white chalk, molecular structures, particle diagrams, data plots, glowing holographic 3D models',
    diagram_bg: 'Dark green or black chalkboard, OR floating holographic display with electric blue accents',
    color_palette: 'Deep teal #1A3A3F, electric blue #4FD1E0, warm amber lab light #D4A574, off-white lab coat #F5F5F0',
    catchphrase: 'Eureka!',
  },
  professor: {
    label: 'Academic Lecturer',
    outfit: 'Tweed jacket with elbow patches over white shirt, bow tie, glasses, holding white chalk',
    environment: 'Grand lecture hall — floor-to-ceiling green chalkboard, stacked books on oak desk, tall arched windows with warm afternoon light, leather wing chair',
    signature_props: 'Green chalkboard with handwritten concept map, classic books, oak desk, arched windows',
    branded_mug: 'Ceramic mug labeled "CURIOSITY IS MANDATORY"',
    diagram_style: 'Clean concept maps with arrows, flowcharts, timeline diagrams, comparison tables — all hand-drawn in white chalk',
    diagram_bg: 'Green chalkboard with subtle chalk dust texture',
    color_palette: 'Dark forest green #1B3A2A, warm amber #D4A574, cream paper #F5EFE0, deep brown #4A2E1A',
    catchphrase: 'Class is in session!',
  },
  accountant: {
    label: 'Financial Guru',
    outfit: 'Tailored grey vest over crisp white shirt and tie, glasses on',
    environment: 'Warm wood-paneled study or modern boardroom — green chalkboard headlined "MAKE MONEY / MANAGE MONEY / BUILD FREEDOM" with EARN/SAVE/INVEST/GROW icons, finance books spine-out (RICH DAD POOR DAD, THE INTELLIGENT INVESTOR, INVESTING 101, THE PSYCHOLOGY OF MONEY), warm amber lighting',
    signature_props: 'Calculator, stacked gold coins, cash bundles, "Financial Plan" notebook with checklist, stack of finance books',
    branded_mug: 'Coffee mug labeled "COMPOUND CONSISTENCY FREEDOM"',
    diagram_style: 'Bar charts, pie charts, compound interest curves, balance sheets, dollar amounts in bold typography, before/after comparison tables',
    diagram_bg: 'Green chalkboard with chalk-drawn financial diagrams, OR clean dark slate with gold/green chart accents',
    color_palette: 'Deep forest green #1B3A2A, warm gold #D4A574, cream #F5EFE0, money green #2D6B3F',
    catchphrase: 'The math doesn\'t lie!',
  },
  tech: {
    label: 'IT Geek',
    outfit: 'Navy "AI" hoodie, glasses, stylus/pen in hand',
    environment: 'Dark techy room — large monitor behind showing "AI EXPLAINED" headline with brain icon, MacBook open on glass desk showing OpenAI/Claude logos, small white robot mascot beside laptop',
    signature_props: 'Open MacBook with AI logos, small robot mascot, stack of AI books, "I ❤️ PROMPTS" mousepad, yellow sticky note "BE CURIOUS"',
    branded_mug: '"BE CURIOUS" yellow sticky note on desk',
    diagram_style: 'System architecture diagrams with rounded boxes and arrows, code blocks with syntax highlighting, API flow diagrams, bullet checklists on screen (Prompt → Process → Output → Improve)',
    diagram_bg: 'Dark monitor screen with neon syntax highlighting, OR holographic floating UI panels',
    color_palette: 'Deep navy #0A0F1E, electric cyan #4FD1E0, neon purple #B45CFF, off-white text #F5F5F0',
    catchphrase: 'Beautiful, right?',
  },
  maker: {
    label: 'DIY Workshop Maker',
    outfit: 'Red-and-black flannel shirt, denim overalls, sleeves rolled up, holding a cordless power drill',
    environment: 'Warm workshop — pegboard wall covered in hammers/wrenches/screwdrivers, sturdy wooden workbench with sawdust, wooden birdhouse project in progress, pendant lamp warm overhead light, black chalkboard with handwritten checklist "HOW TO: PLAN / PREPARE / STEP BY STEP / PRACTICE / IMPROVE"',
    signature_props: 'Cordless power drill, tape measure, wooden birdhouse mid-build, scattered sawdust, pegboard with tools, sketched plans notepad',
    branded_mug: 'Coffee mug labeled "MEASURE TWICE CUT ONCE"',
    diagram_style: 'Hand-drawn schematic diagrams, exploded views of mechanical parts, step-numbered checklists in chalk, measurement diagrams with arrows',
    diagram_bg: 'Black chalkboard with hand-drawn schematics, OR brown wooden plank with sketched diagrams',
    color_palette: 'Warm wood brown #6B4423, deep red flannel #8B2424, denim blue #2C4A6B, off-white chalk #F5F5F0',
    catchphrase: 'Measure twice, cut once!',
  },
};

// ═══════════════════════════════════════════════════════════════════
// SCENE DENSITY SPEC — must match initializeScriptBatches exactly
// ═══════════════════════════════════════════════════════════════════
const SCENE_DENSITY = [
  { section_type: 'hook',          scene_count: 12, pacing: 'staccato',   time_pct: 0.10 },
  { section_type: 'core_concept',  scene_count: 8,  pacing: 'measured',   time_pct: 0.15 },
  { section_type: 'mechanism',     scene_count: 10, pacing: 'breathable', time_pct: 0.25 },
  { section_type: 'example',       scene_count: 8,  pacing: 'breathable', time_pct: 0.25 },
  { section_type: 'application',   scene_count: 8,  pacing: 'measured',   time_pct: 0.15 },
  { section_type: 'takeaway',      scene_count: 4,  pacing: 'landing',    time_pct: 0.10 },
];

// ═══════════════════════════════════════════════════════════════════
// SHOT TYPES — drives downstream image generation
// ═══════════════════════════════════════════════════════════════════
const SHOT_TYPES = {
  establish_einstein: 'Wide shot of Einstein in his arc environment, mid-gesture, full body visible, branded mug + signature props in frame',
  closeup_einstein: 'Medium close-up of Einstein face/upper-body, expressive, pointing or gesturing, environment softly blurred behind',
  text_slam: 'BOLD BLACK BACKGROUND with huge white/colored text overlay (the key number or phrase), Einstein\'s eyes peeking from a corner OR pure typography slide',
  diagram_insert: 'CLEAN DIAGRAM — no Einstein in frame. Just the chart/formula/code on the arc-specific background (chalkboard or monitor). Crisp typography.',
  broll_cut: 'Real-world stock footage matching the topic (money counting, code scrolling, hands working, etc.) — NO Einstein, just the real-world action',
  contrast_slam: 'Split-screen showing MYTH vs TRUTH with X mark on the wrong side and ✓ on the right side, bold typography',
  montage_flash: 'Triple-cut quick preview — 3 fast images of upcoming sections combined into one frame',
};

// ═══════════════════════════════════════════════════════════════════
// SECTION-SPECIFIC SHOT CHOREOGRAPHY
// Each section has a fixed shot pattern — choreographs the visual cadence
// ═══════════════════════════════════════════════════════════════════
const SHOT_CHOREOGRAPHY = {
  hook: [
    // 12 staccato beats — viral hook psychology
    'establish_einstein',  // 1: "In this video..." wide
    'text_slam',           // 2: Shocking number BIG
    'closeup_einstein',    // 3: "Look at this" ECU pointing
    'diagram_insert',      // 4: Number/chart flash
    'broll_cut',           // 5: Real-world reaction footage
    'closeup_einstein',    // 6: "But wait..." gesture
    'contrast_slam',       // 7: Myth vs truth side-by-side
    'establish_einstein',  // 8: Pull back wide — promise
    'diagram_insert',      // 9: Tease the formula/chart
    'closeup_einstein',    // 10: "Stay with me" direct address
    'montage_flash',       // 11: Triple-cut preview
    'establish_einstein',  // 12: Points up — sets up next section
  ],
  core_concept: [
    'establish_einstein',  // 1: Opens the section in environment
    'closeup_einstein',    // 2: Introduces the simple definition
    'diagram_insert',      // 3: Concept diagram
    'closeup_einstein',    // 4: Expands with analogy
    'diagram_insert',      // 5: Analogy visualized
    'establish_einstein',  // 6: Brings it back to environment
    'diagram_insert',      // 7: Recap diagram
    'closeup_einstein',    // 8: Bridge to mechanism
  ],
  mechanism: [
    'establish_einstein',  // 1: Sets up the how
    'diagram_insert',      // 2: Step 1 of mechanism
    'closeup_einstein',    // 3: Explains step 1
    'diagram_insert',      // 4: Step 2
    'closeup_einstein',    // 5: Explains step 2
    'diagram_insert',      // 6: Step 3
    'closeup_einstein',    // 7: Explains step 3
    'diagram_insert',      // 8: Full system diagram
    'establish_einstein',  // 9: Steps back, full view
    'closeup_einstein',    // 10: Bridge to example
  ],
  example: [
    'establish_einstein',  // 1: Sets up the worked example
    'diagram_insert',      // 2: Initial numbers/setup
    'closeup_einstein',    // 3: Walks through step 1
    'diagram_insert',      // 4: Calculation 1
    'closeup_einstein',    // 5: Walks through step 2
    'diagram_insert',      // 6: Calculation 2
    'diagram_insert',      // 7: Final result big number
    'closeup_einstein',    // 8: Reaction to the result
  ],
  application: [
    'establish_einstein',  // 1: Opens real-world frame
    'broll_cut',           // 2: Real-world use case footage
    'closeup_einstein',    // 3: Why this matters
    'broll_cut',           // 4: Second use case footage
    'closeup_einstein',    // 5: Stakes elevation
    'diagram_insert',      // 6: Before/after impact
    'broll_cut',           // 7: Third use case
    'establish_einstein',  // 8: Bridge to takeaway
  ],
  takeaway: [
    'establish_einstein',  // 1: Wide settled shot
    'closeup_einstein',    // 2: Recap insight
    'text_slam',           // 3: The catchphrase as text overlay
    'establish_einstein',  // 4: Final wide — points up, freezes
  ],
};

// ═══════════════════════════════════════════════════════════════════
// Detect arc from project
// ═══════════════════════════════════════════════════════════════════
function detectArc(project, channel) {
  if (project?.explainer_arc && ARC_VISUAL_DNA[project.explainer_arc]) return project.explainer_arc;
  const niche = `${project?.niche || ''} ${channel?.niche || ''} ${project?.name || ''}`.toLowerCase();
  const triggers = {
    science: /physics|chemistry|biology|neuroscience|space|mathematics|science|research/,
    professor: /history|economics|philosophy|psychology|literature|education/,
    accountant: /finance|investing|money|wealth|business|tax|crypto|stocks/,
    tech: /software|ai|machine learning|coding|programming|tech|cyber/,
    maker: /diy|woodworking|crafts|workshop|tools|building|repair/,
  };
  for (const [arc, re] of Object.entries(triggers)) {
    if (re.test(niche)) return arc;
  }
  return 'professor';
}

// ═══════════════════════════════════════════════════════════════════
// Extract section_type from focus_area prefix
// ═══════════════════════════════════════════════════════════════════
function extractSectionType(focusArea, fallbackIdx) {
  const m = (focusArea || '').match(/^\[(\w+)\|scenes:\d+\]/);
  if (m && SCENE_DENSITY.find(d => d.section_type === m[1])) return m[1];
  return SCENE_DENSITY[fallbackIdx]?.section_type || null;
}

// ═══════════════════════════════════════════════════════════════════
// LLM caller — OpenAI primary, Gemini fallback
// ═══════════════════════════════════════════════════════════════════
async function callLLM(prompt, temperature = 0.6) {
  // Try OpenAI first
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature,
        max_tokens: 8000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a film director and visual designer. Always respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(`OpenAI ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  } catch (oaiErr) {
    console.warn(`[scene] OpenAI failed: ${oaiErr.message.substring(0, 120)} — trying Gemini`);
    if (!GEMINI_KEY) throw oaiErr;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 8192, responseMimeType: 'application/json' },
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Gemini ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
    }
    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return JSON.parse(raw);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Build the scene breakdown prompt for ONE section
// ═══════════════════════════════════════════════════════════════════
function buildSectionPrompt({ batch, arc, sectionType, sceneCount, sceneStartNumber, durationSeconds, choreography, characterRefImageUrl }) {
  const arcDna = ARC_VISUAL_DNA[arc];
  const avgSec = (durationSeconds / sceneCount).toFixed(1);
  const isHook = sectionType === 'hook';
  const isTakeaway = sectionType === 'takeaway';

  const choreographyTable = choreography.map((shot, i) => {
    const sceneNum = sceneStartNumber + i;
    const dur = isHook ? '2-3s' : `${avgSec}s`;
    return `  Scene ${sceneNum} (${dur}): ${shot} — ${SHOT_TYPES[shot]}`;
  }).join('\n');

  return `You are a world-class film director planning the visual breakdown for ONE section of an Einstein explainer video.

**EINSTEIN ARC — ${arcDna.label}** (locked visual DNA — every Einstein scene MUST match):
- Outfit: ${arcDna.outfit}
- Environment: ${arcDna.environment}
- Signature props in frame: ${arcDna.signature_props}
- Branded mug/sticky note: ${arcDna.branded_mug}
- Color palette: ${arcDna.color_palette}
- Diagram style (for diagram_insert shots): ${arcDna.diagram_style}
- Diagram background: ${arcDna.diagram_bg}
${characterRefImageUrl ? `- Character reference image (use as exact face/style anchor): ${characterRefImageUrl}` : ''}

**SECTION: ${sectionType.toUpperCase()}** (${sceneCount} scenes, ${durationSeconds}s total, avg ${avgSec}s per scene)

**SCRIPT CONTENT FOR THIS SECTION** (Einstein's actual spoken words — slice these into ${sceneCount} narration beats):
${batch.content}

**FIXED SHOT CHOREOGRAPHY** (you MUST follow this exact order — DO NOT change shot types):
${choreographyTable}

${isHook ? `**═══ HOOK PACING — VIRAL STACCATO (CRITICAL) ═══**
- This is the 30-second hook. Each scene is 2-3 seconds MAX.
- Match each scene's narration to ONE short punchy sentence from the script — NEVER more than one sentence per scene.
- text_slam scenes: pick the SHOCKING NUMBER or KEY PHRASE from the script as the on-screen text overlay (e.g. "$139,243" or "70% WRONG")
- contrast_slam: identify the MYTH vs TRUTH in the script for split-screen text
- montage_flash: list 3 quick previews of upcoming sections (Problem → Mechanism → Payoff)
- The cuts are FAST and PURPOSEFUL — every scene must justify its 2-3 second slot` : ''}

${isTakeaway ? `**═══ TAKEAWAY PACING — SETTLING ═══**
- Slow the pace, let the catchphrase land
- text_slam: the catchphrase "${arcDna.catchphrase}" as the full-screen text overlay
- Final establish_einstein: Einstein freezes pointing up, the iconic teaching pose` : ''}

**YOUR TASK**: Generate EXACTLY ${sceneCount} scene objects matching the choreography above. For each scene specify:

For **einstein scenes** (establish_einstein, closeup_einstein):
- visual_concept: Detailed shot description rooted in the arc's ${arcDna.label} environment. Include the outfit, environment, signature props, branded mug, and Einstein's specific gesture. Be cinematic.
- narration_text: The EXACT short slice of script Einstein speaks in this scene (from the script content above, in order)
- diagram_visible_in_background: A short description of any chalkboard text/monitor display visible behind Einstein (matches the topic — e.g. "MAKE MONEY / MANAGE MONEY / BUILD FREEDOM" headline)

For **diagram_insert scenes** (no Einstein):
- visual_concept: Clean diagram description ONLY — no Einstein. Specify exactly what chart, formula, code, or chalkboard text appears. Use the arc's diagram_style and diagram_bg.
- narration_text: The script slice Einstein is speaking over this diagram
- text_overlay: The headline/title text on the diagram (e.g. "COMPOUND INTEREST" or "STEP 2: SAVE")
- key_numbers_or_labels: Specific labeled values on the diagram (e.g. ["$100/mo", "10%", "30 years", "= $197,392"])

For **text_slam scenes**:
- text_overlay: The HUGE bold text that fills the screen (the shocking number, the key phrase, the catchphrase)
- visual_concept: Black background with massive bold text, the color of accent from the arc palette, optional Einstein eyes peeking from corner
- narration_text: The script slice spoken during this slam

For **broll_cut scenes** (real-world stock):
- broll_query: Short search query for stock footage (e.g. "person counting money close up", "hands typing on laptop")
- visual_concept: What the real-world footage shows
- narration_text: The script slice spoken over the b-roll

For **contrast_slam scenes**:
- text_overlay: Left side text (myth) | Right side text (truth)
- visual_concept: Split screen with X on left, ✓ on right, bold typography
- narration_text: The script slice

For **montage_flash scenes**:
- visual_concept: 3 quick preview frames combined (Problem → Mechanism → Payoff each as a small thumbnail)
- preview_frames: Array of 3 short descriptions of each preview tile
- narration_text: The script slice

**UNIVERSAL FIELDS for EVERY scene**:
- scene_number: ${sceneStartNumber}, ${sceneStartNumber + 1}, ${sceneStartNumber + 2}, ...
- shot_type: EXACT match from choreography (establish_einstein, closeup_einstein, text_slam, diagram_insert, broll_cut, contrast_slam, montage_flash)
- duration_seconds: ${isHook ? '2 or 3' : `roughly ${avgSec}`}
- camera_movement: For Einstein scenes — slow_zoom_in / static / slow_pan. For diagram/text_slam — static or slow_zoom_in. For broll — match natural footage motion.
- audio_note: Voice energy (urgent / conversational / commanding / warm) + sound effect cue (whoosh / ding / impact / silence)

Return JSON:
{
  "scenes": [
    { /* scene 1 with all relevant fields per shot_type */ },
    ...
  ]
}

GENERATE EXACTLY ${sceneCount} SCENES IN ORDER. Use the EXACT script text for narration_text — never paraphrase.`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  const callStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, batch_index } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const startBatch = batch_index || 0;

    // ── Load project + verify explainer mode ──
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
    if (project.project_mode !== 'explainer') {
      return Response.json({ error: 'This function is only for explainer projects' }, { status: 400 });
    }

    let channel = null;
    if (project.channel_id) {
      const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
      channel = channels[0];
    }

    const arc = detectArc(project, channel);
    const arcDna = ARC_VISUAL_DNA[arc];
    console.log(`[explainerScene] Project ${project_id} arc=${arc} (${arcDna.label})`);

    // ── Load all 6 batches with their generated script content ──
    const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const sortedBatches = allBatches.sort((a, b) => a.batch_number - b.batch_number);
    if (sortedBatches.length < 6) {
      return Response.json({ error: `Expected 6 script batches, found ${sortedBatches.length}` }, { status: 400 });
    }
    if (sortedBatches.some(b => !b.content || b.status !== 'completed')) {
      return Response.json({ error: 'Not all script batches are completed yet' }, { status: 400 });
    }

    // ── Clear old scenes on first batch ──
    if (startBatch === 0) {
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      if (oldScenes.length > 0) {
        for (let i = 0; i < oldScenes.length; i += 10) {
          await Promise.all(oldScenes.slice(i, i + 10).map(s =>
            base44.asServiceRole.entities.Scenes.delete(s.id).catch(_ => {})
          ));
        }
        console.log(`[explainerScene] Deleted ${oldScenes.length} old scenes`);
      }
    }

    // ── Optional character reference image (Phase C visual lock) ──
    // If the project or channel has a reference image saved (e.g. via ChannelThumbnailDNA), pass it through.
    const characterRefImageUrl = project.reference_image_url || null;

    const durationMinutes = project.video_duration_minutes || 10;
    const totalDurationSec = durationMinutes * 60;

    // ── Compute scene number offset (sum of scene_counts of prior sections) ──
    const sceneOffsets = [];
    let cumulative = 0;
    for (const sec of SCENE_DENSITY) {
      sceneOffsets.push(cumulative);
      cumulative += sec.scene_count;
    }
    const totalTargetScenes = cumulative; // 50

    // ── Process sections starting from startBatch ──
    const MAX_WALL_MS = 55000;
    let totalCreated = 0;

    for (let batchIdx = startBatch; batchIdx < sortedBatches.length; batchIdx++) {
      const elapsed = Date.now() - callStart;
      if (elapsed > MAX_WALL_MS && batchIdx > startBatch) {
        console.log(`[explainerScene] ⏱️ ${(elapsed/1000).toFixed(1)}s — pausing, will resume from batch ${batchIdx}`);
        return Response.json({
          success: true,
          done: false,
          next_batch: batchIdx,
          scenes_created_so_far: totalCreated,
          total_target_scenes: totalTargetScenes,
        });
      }

      const batch = sortedBatches[batchIdx];
      const sectionType = extractSectionType(batch.focus_area, batchIdx);
      if (!sectionType) {
        console.warn(`[explainerScene] Batch ${batchIdx + 1} has no section_type — skipping`);
        continue;
      }

      const sectionSpec = SCENE_DENSITY.find(d => d.section_type === sectionType);
      const choreography = SHOT_CHOREOGRAPHY[sectionType];
      if (!sectionSpec || !choreography) {
        console.warn(`[explainerScene] No spec for section ${sectionType} — skipping`);
        continue;
      }

      const sceneStartNumber = sceneOffsets[batchIdx] + 1;
      const sectionDurationSec = Math.round(totalDurationSec * sectionSpec.time_pct);

      console.log(`[explainerScene] Section ${batchIdx + 1}/${sortedBatches.length}: ${sectionType} → ${sectionSpec.scene_count} scenes (${sectionDurationSec}s)`);

      const prompt = buildSectionPrompt({
        batch,
        arc,
        sectionType,
        sceneCount: sectionSpec.scene_count,
        sceneStartNumber,
        durationSeconds: sectionDurationSec,
        choreography,
        characterRefImageUrl,
      });

      const temp = sectionType === 'hook' ? 0.75 : 0.55;
      let result;
      try {
        result = await callLLM(prompt, temp);
      } catch (err) {
        console.error(`[explainerScene] Section ${sectionType} FAILED: ${err.message}`);
        return Response.json({
          success: false,
          error: `Section ${sectionType} failed: ${err.message}`,
          next_batch: batchIdx,
          scenes_created_so_far: totalCreated,
        }, { status: 500 });
      }

      const scenesArr = Array.isArray(result?.scenes) ? result.scenes : [];
      if (scenesArr.length === 0) {
        console.warn(`[explainerScene] Section ${sectionType} returned 0 scenes`);
        continue;
      }

      // ── Persist scenes ──
      for (let i = 0; i < scenesArr.length && i < sectionSpec.scene_count; i++) {
        const s = scenesArr[i];
        const sceneNum = sceneStartNumber + i;
        const shotType = choreography[i]; // enforce choreography
        const sceneDuration = sectionType === 'hook'
          ? (s.duration_seconds || 2.5)
          : (s.duration_seconds || sectionDurationSec / sectionSpec.scene_count);

        // Pack the arc visual DNA + shot metadata into image_prompt as DIRECTOR_NOTES
        const directorNotes = {
          arc,
          arc_label: arcDna.label,
          section_type: sectionType,
          shot_type: shotType,
          visual_concept: s.visual_concept || '',
          diagram_visible_in_background: s.diagram_visible_in_background || '',
          text_overlay: s.text_overlay || '',
          key_numbers_or_labels: s.key_numbers_or_labels || [],
          broll_query: s.broll_query || '',
          preview_frames: s.preview_frames || [],
          camera_movement: s.camera_movement || 'static',
          audio_note: s.audio_note || '',
          arc_outfit: arcDna.outfit,
          arc_environment: arcDna.environment,
          arc_signature_props: arcDna.signature_props,
          arc_branded_mug: arcDna.branded_mug,
          arc_color_palette: arcDna.color_palette,
          arc_diagram_style: arcDna.diagram_style,
          arc_diagram_bg: arcDna.diagram_bg,
          character_ref_image_url: characterRefImageUrl || '',
        };

        const cameraMap = {
          slow_zoom_in: 'slow_zoom_in',
          slow_zoom_out: 'slow_zoom_out',
          static: 'static',
          slow_pan: 'slow_pan',
          push_in: 'slow_zoom_in',
        };

        await base44.asServiceRole.entities.Scenes.create({
          project_id,
          scene_number: sceneNum,
          narration_text: s.narration_text || '',
          image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
          animation_prompt: shotType === 'broll_cut' ? 'natural' : 'push_in',
          duration_seconds: sceneDuration,
          camera_movement: cameraMap[s.camera_movement] || 'slow_zoom_in',
          animation_speed: sectionType === 'hook' ? 'fast' : 'normal',
          status: 'breakdown_ready',
          notes: s.text_overlay || '',
          broll_query: s.broll_query || null,
        });

        totalCreated++;
      }

      console.log(`[explainerScene] ✓ ${sectionType}: ${scenesArr.length} scenes [${((Date.now()-callStart)/1000).toFixed(1)}s]`);
    }

    // ── Mark project complete ──
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'breakdown_complete',
      current_step: 5,
    });

    console.log(`[explainerScene] 🎉 COMPLETE — ${totalCreated} scenes`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: totalCreated,
      total_target_scenes: totalTargetScenes,
      arc,
      arc_label: arcDna.label,
    });

  } catch (error) {
    console.error('[explainerScene] error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});