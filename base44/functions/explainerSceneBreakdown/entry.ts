import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// EXPLAINER SCENE BREAKDOWN ENGINE v1
// Diagram-first scene breakdown for educational explainer videos.
//
// SCENE RULES (explainer-optimised):
// 1. Each concept beat = 1+ scenes depending on complexity
// 2. Diagrams, schemas, formulas, code blocks = dedicated scene panels
// 3. Einstein character appears in intro/transition/outro scenes
// 4. AI decides scene count per concept based on complexity
//
// CHARACTER: Einstein arc system
//   science    → Mad Scientist (lab coat, goggles, test tubes)
//   professor  → Academic Lecturer (tweed jacket, chalk, whiteboard)
//   accountant → Financial Guru (suit, calculator watch, glasses)
//   tech       → IT Geek (graphic tee, RGB headset, holographic screen)
//
// VISUAL STYLE: explainer_diagram (clean 3D, subject-matter-expert aura)
// ══════════════════════════════════════════════════════════════════

function repairJSON(str) {
  return str
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\r' || c === '\t' ? c : ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(["\w\d])\s*\n\s*"/g, '$1, "');
}

function extractJSON(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  try { return JSON.parse(rawText); } catch (_) {}
  try { return JSON.parse(repairJSON(rawText)); } catch (_) {}
  let jsonStr = rawText;
  if (rawText.includes("```json")) jsonStr = rawText.split("```json")[1].split("```")[0].trim();
  else if (rawText.includes("```")) jsonStr = rawText.split("```")[1].split("```")[0].trim();
  try { return JSON.parse(repairJSON(jsonStr)); } catch (_) {}
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
    try { return JSON.parse(repairJSON(match[0])); } catch (_) {}
  }
  const text = match ? match[0] : rawText;
  let repaired = text.replace(/,\s*\{[^}]*$/, '').replace(/,\s*$/, '');
  if (!repaired.endsWith(']}')) {
    if (!repaired.endsWith(']')) repaired += ']';
    if (!repaired.endsWith('}')) repaired += '}';
  }
  try {
    const result = JSON.parse(repaired);
    console.log(`🔧 JSON repair recovered ${result.scenes?.length || 0} scenes`);
    return result;
  } catch (_) {}
  const lastComplete = text.lastIndexOf('},');
  if (lastComplete > 0) {
    try {
      const result = JSON.parse(text.substring(0, lastComplete + 1) + ']}');
      console.log(`🔧 JSON deep repair recovered ${result.scenes?.length || 0} scenes`);
      return result;
    } catch (_) {}
  }
  return null;
}

async function callGemini(prompt, systemText, temperature = 0.4) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = extractJSON(rawText);
  if (parsed) return parsed;
  throw new Error(`Gemini JSON parse failed. Length: ${rawText.length}`);
}

async function callClaudeFallback(prompt, systemText, temperature = 0.4) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      temperature,
      system: systemText,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Claude error ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text || '';
  const parsed = extractJSON(rawText);
  if (parsed) return parsed;
  throw new Error(`Claude JSON parse failed. stop_reason: ${data.stop_reason}`);
}

async function callAI(prompt, temperature = 0.4) {
  const systemText = "You are an educational video director specialising in explainer content. Return ONLY raw valid JSON. No markdown, no backticks, no conversational text.";
  try {
    const result = await callGemini(prompt, systemText, temperature);
    console.log(`✅ Gemini succeeded`);
    return result;
  } catch (geminiErr) {
    console.warn(`⚠️ Gemini failed: ${geminiErr.message} — falling back to Claude`);
  }
  const result = await callClaudeFallback(prompt, systemText, temperature);
  console.log(`✅ Claude fallback succeeded`);
  return result;
}

// ── Einstein arc definitions ─────────────────────────────────────
function getEinsteinArc(arcType) {
  const arcs = {
    science: {
      label: 'Mad Scientist',
      look: 'Rumpled white lab coat, safety goggles pushed up on forehead, Einstein wild white hair, holding bubbling test tube in one hand while wildly gesturing with the other, bushy mustache, animated wide eyes',
      behavior: 'Erratic high-energy pacing, speaks rapidly while wildly gesturing at 3D formulas floating in mid-air, bursts of sudden excitement, occasional maniacal laughter at elegant solutions',
      catchphrase: 'Eureka! The data does not lie — it evolves!',
      environment: 'Cluttered laboratory with glowing equipment, floating 3D molecular structures, holographic formula projections, bubbling beakers on shelves, chalkboards covered in equations',
      color_palette: 'Electric blue #0066FF, lab green #00CC88, white #FFFFFF, deep navy #0A1628',
    },
    professor: {
      label: 'Academic Lecturer',
      look: 'Tweed jacket with elbow patches, mismatched socks visible above brogues, holding a piece of chalk, Einstein wild white hair neatly side-parted, reading glasses on nose, warm grandfatherly expression',
      behavior: 'Warm theatrical and deeply passionate, treats the whiteboard like a grand canvas, dramatic pauses for emphasis, beckons the viewer closer to share a secret insight, paces with chalk behind back',
      catchphrase: 'Class is in session, and curiosity is mandatory!',
      environment: 'Grand lecture hall with tiered seating, floor-to-ceiling whiteboard filled with clean diagrams, warm amber lighting, oak desk with stacked books, floating holographic concept maps',
      color_palette: 'Warm amber #D4A574, chalk white #F5F5F0, oak brown #8B6914, deep blue #0A1628',
    },
    accountant: {
      label: 'Financial Guru',
      look: 'Sharp charcoal corporate suit, retro calculator watch on wrist, sleeves rolled up, reading glasses perched on nose, Einstein white hair slicked back, animated expression of intense focus on numbers',
      behavior: 'Laser-focused intensely energetic about margins, aggressively circles budget numbers on the whiteboard with absolute glee, jabs at floating spreadsheet cells, counts on fingers rapidly',
      catchphrase: 'It is mathematically relative — your savings are about to multiply!',
      environment: 'Sleek modern boardroom with floor-to-ceiling glass, floating holographic spreadsheets and bar charts, digital tickers, marble surfaces, city skyline backdrop',
      color_palette: 'Money green #00AA55, gold #D4AF37, charcoal #2C2C2C, crisp white #FFFFFF',
    },
    tech: {
      label: 'IT Geek',
      look: 'Graphic tee featuring a physics equation joke, over-ear RGB headset around neck, glowing smartphone in hand, Einstein wild white hair with one streak of neon blue, casual jeans, sneakers, multiple screens reflected in glasses',
      behavior: 'Fast-talking tech-savvy and effortlessly cool, swipes through holographic 3D app screens like a sci-fi conductor, types in mid-air on floating keyboard, snaps fingers to spin up diagrams',
      catchphrase: 'Simple geometry my friends — let us optimise your workflow!',
      environment: 'Futuristic tech hub with neon-lit server racks, floating holographic code editors, dual curved monitors, RGB ambient lighting, floating UI components and API diagrams',
      color_palette: 'Neon cyan #00FFFF, electric purple #7B00FF, dark charcoal #1A1A2E, white #FFFFFF',
    },
  };
  return arcs[arcType] || arcs.professor;
}

// ── Scene type definitions ───────────────────────────────────────
function getSceneTypeDirective(sceneType, arcDef) {
  const directives = {
    einstein_intro: `Einstein character FULL BODY in his ${arcDef.label} look, entering the frame with energy and personality. Environment: ${arcDef.environment}. He opens with his catchphrase gesture. Camera: LOW ANGLE push-in, dramatic. Duration: 4-6 seconds.`,
    einstein_transition: `Einstein character MID SHOT reacting to the previous concept with excitement or curiosity, gesturing toward the next diagram that's about to appear. Bridges two concept blocks. Duration: 2-3 seconds.`,
    einstein_outro: `Einstein character FULL BODY, satisfied expression, arms wide, catchphrase moment. Environment wraps up warmly. Camera pulls back slowly. Duration: 4-5 seconds.`,
    concept_diagram: `Clean educational diagram showing the concept. NO character. Pure diagram: boxes, arrows, labels, hierarchy. 2D flat design on clean background. Camera: STATIC or SLOW ZOOM IN on key element. Duration: 3-6 seconds depending on complexity.`,
    formula_panel: `Mathematical formula or equation beautifully typeset and floating in 3D space. Step-by-step if multiple steps. Clean dark background with glowing formula text. Camera: SLOW ZOOM IN left to right following the equation. Duration: 3-5 seconds.`,
    code_block: `Code snippet displayed in a floating terminal or IDE panel, syntax highlighted, clean font. Relevant lines highlighted one at a time. Camera: STATIC, slight push-in on highlighted section. Duration: 3-5 seconds.`,
    analogy_scene: `Visual metaphor or real-world analogy scene. Einstein character OPTIONAL (MCU). Analogy rendered as vivid 3D illustration. Camera: WIDE establishing then PUSH IN to detail. Duration: 3-4 seconds.`,
    example_walkthrough: `Step-by-step example with numbered panels or callouts. Can include Einstein character pointing at panels. Clean diagram layout. Camera: PAN LEFT TO RIGHT following the steps. Duration: 4-8 seconds.`,
    comparison_table: `Side-by-side comparison table or Venn diagram. Clean, readable, color-coded. NO character. Camera: STATIC wide then zoom to each column. Duration: 4-6 seconds.`,
    summary_card: `Clean recap card with key bullet points or a single memorable visual. Einstein character OPTIONAL (SMALL, corner). Bold readable typography. Camera: STATIC. Duration: 3-4 seconds.`,
  };
  return directives[sceneType] || directives.concept_diagram;
}

// ── Build breakdown prompt for one outline section ───────────────
function buildSectionBreakdownPrompt({
  section,
  sectionIndex,
  totalSections,
  arcDef,
  researchData,
  continuityNote,
  globalSceneStart,
  targetScenesForSection,
}) {
  const researchSection = researchData?.sections?.[sectionIndex] || null;
  const researchBlock = researchSection ? `
VERIFIED RESEARCH FOR THIS SECTION:
Core facts: ${JSON.stringify(researchSection.core_facts)}
Best analogy: ${researchSection.best_analogy}
Formulas/Code: ${JSON.stringify(researchSection.formulas_or_code)}
Misconceptions to address: ${JSON.stringify(researchSection.misconceptions)}
Accuracy notes: ${researchSection.accuracy_notes}
` : '';

  const isFirst = sectionIndex === 0;
  const isLast = sectionIndex === totalSections - 1;

  return `You are an educational video director breaking down one section of an explainer video into scenes.

EINSTEIN CHARACTER ARC: ${arcDef.label}
Character look: ${arcDef.look}
Character behavior: ${arcDef.behavior}
Environment: ${arcDef.environment}
Color palette: ${arcDef.color_palette}

SECTION ${sectionIndex + 1} of ${totalSections}: "${section.title}"
Section script content:
${section.content}

${researchBlock}

CONTINUITY FROM PREVIOUS SECTION: ${continuityNote}

SCENE TYPE OPTIONS (pick the right type for each beat):
- einstein_intro: Character enters and welcomes (use ONLY for section 1 opening)
- einstein_transition: Character bridges concepts (use between major concept shifts)
- einstein_outro: Character wraps up (use ONLY for last section closing)
- concept_diagram: Pure diagram — boxes, arrows, labels, flowcharts
- formula_panel: Mathematical formula or equation display
- code_block: Code snippet with syntax highlighting
- analogy_scene: Visual metaphor or real-world example
- example_walkthrough: Step-by-step numbered example
- comparison_table: Side-by-side comparison or Venn diagram
- summary_card: Recap bullet points or key takeaway

SCENE COUNT RULES:
- 🎯 TARGET FOR THIS SECTION: ~${targetScenesForSection} scenes (HARD FLOOR — generate AT LEAST this many)
- Average scene duration: 5–7 seconds (NEVER longer than 8s for explainer pacing)
- Break long narration into MULTIPLE scenes — every 1–2 sentences = a new scene
- Each distinct diagram, formula, code block, example, or statistic gets its OWN scene
- Each Einstein beat (intro/transition/outro) is its OWN scene
- Do NOT cram multiple visual ideas into one scene
- Over-delivering scenes is FAR better than under-delivering
${isFirst ? '- MUST start with an einstein_intro scene' : ''}
${isLast ? '- MUST end with an einstein_outro scene' : ''}

DIAGRAM RULES (for concept_diagram, formula_panel, example_walkthrough):
- Describe the EXACT layout: what boxes exist, what the arrows connect, what labels say
- For formulas: write the actual formula text exactly as it should appear
- For code: write the actual code snippet that should be displayed
- Be specific enough that an image generator can render it accurately

ACCURACY MANDATE: Every fact, formula, and code snippet in visual_concept MUST match the verified research above. Do not invent numbers or examples.

Return ONLY valid JSON:
{
  "section_title": "${section.title}",
  "scenes": [
    {
      "scene_number": ${globalSceneStart},
      "scene_type": "one of the types above",
      "narration_text": "exact words the narrator says during this scene",
      "visual_concept": "detailed director description of what appears on screen — layout, content, labels, positions",
      "diagram_content": "if scene_type is concept_diagram/formula_panel/code_block: the EXACT text/formula/code to display, else null",
      "einstein_present": true or false,
      "einstein_action": "what Einstein is doing if present, else null",
      "shot_type": "ECU/CU/MCU/MS/WS/STATIC",
      "camera_movement": "e.g. slow push-in or static or pan left to right",
      "camera_direction": "zoom_in or zoom_out or pan_left or pan_right or static or push_in",
      "duration_seconds": 4.0,
      "lighting": "e.g. warm key light from left, clean shadows",
      "color_palette": "dominant colors with hex codes matching arc palette",
      "mood": "2-3 words",
      "text_overlay": "bold on-screen label or title or empty string",
      "continuity_bridge": "specific visual element linking to next scene"
    }
  ]
}

Scene numbers start at ${globalSceneStart}. Number them sequentially.`;
}

// ── Main handler ─────────────────────────────────────────────────
Deno.serve(async (req) => {
  const callStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Get final aggregated script
    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found.' }, { status: 400 });
    }

    // Get research notes from ProductionSettings
    const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    let researchData = null;
    if (psList[0]?.research_notes) {
      try { researchData = JSON.parse(psList[0].research_notes); } catch (_) {}
    }

    // Get outline sections — priority:
    //   1. project.outline (JSON array)
    //   2. ScriptBatches (the real outline used to generate this script)
    //   3. Regex split as last resort
    let outlineSections = [];
    if (project.outline) {
      try { outlineSections = JSON.parse(project.outline); } catch (_) {}
    }

    if (!outlineSections.length) {
      const batches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
      const sortedBatches = batches.sort((a, b) => (a.batch_number || 0) - (b.batch_number || 0));
      if (sortedBatches.length) {
        outlineSections = sortedBatches.map((b, i) => ({
          title: b.story_segment || b.focus_area || `Section ${i + 1}`,
          content: b.content || b.synopsis || '',
          description: (b.focus_area || b.synopsis || '').substring(0, 200),
        }));
        console.log(`📋 Outline reconstructed from ${sortedBatches.length} script batches`);
      }
    }

    if (!outlineSections.length) {
      const scriptText = script.full_script;
      const parts = scriptText.split(/\n(?=#{1,3}\s|\*\*[A-Z]|\d\.\s[A-Z])/g);
      outlineSections = parts.map((p, i) => ({
        title: `Section ${i + 1}`,
        content: p.trim(),
        description: p.substring(0, 100),
      }));
    }

    // Calculate target scene count from video duration (1 scene per ~6 seconds)
    const targetDurationSec = (project.video_duration_minutes || 10) * 60;
    const targetTotalScenes = Math.max(20, Math.round(targetDurationSec / 6));
    const targetScenesPerSection = Math.max(3, Math.round(targetTotalScenes / outlineSections.length));
    console.log(`🎯 Target: ${targetTotalScenes} total scenes (~${targetScenesPerSection} per section) for ${targetDurationSec}s video`);

    // Detect arc type from project
    const arcType = project.explainer_arc || 'professor';
    const arcDef = getEinsteinArc(arcType);

    console.log(`🎓 Explainer breakdown: "${project.name}" | arc: ${arcType} (${arcDef.label}) | sections: ${outlineSections.length}`);
    if (researchData) {
      console.log(`🔬 Research loaded | confidence: ${researchData.overall_accuracy_confidence} | provider: ${psList[0]?.research_provider}`);
    } else {
      console.warn(`⚠️ No research data found — proceeding without verified facts`);
    }

    // Delete old scenes
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    if (oldScenes.length > 0) {
      await Promise.all(
        oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {}))
      );
      console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
    }

    // Process each section sequentially for continuity
    const allScenes = [];
    let globalSceneNumber = 1;
    let continuityNote = 'This is the opening of the video — Einstein enters with maximum personality and energy.';

    for (let si = 0; si < outlineSections.length; si++) {
      const section = outlineSections[si];

      const prompt = buildSectionBreakdownPrompt({
        section,
        sectionIndex: si,
        totalSections: outlineSections.length,
        arcDef,
        researchData,
        continuityNote,
        globalSceneStart: globalSceneNumber,
        targetScenesForSection: targetScenesPerSection,
      });

      console.log(`🎬 Section ${si + 1}/${outlineSections.length}: "${section.title}" (starting at scene ${globalSceneNumber})`);

      let sectionResult;
      try {
        sectionResult = await callAI(prompt, 0.4);
      } catch (err) {
        console.error(`❌ Section ${si + 1} breakdown failed: ${err.message} — applying fallback`);
        // Minimal fallback: one concept diagram per section
        sectionResult = {
          scenes: [{
            scene_number: globalSceneNumber,
            scene_type: 'concept_diagram',
            narration_text: section.content?.substring(0, 200) || section.title,
            visual_concept: `Clean educational diagram for: ${section.title}`,
            diagram_content: section.title,
            einstein_present: false,
            einstein_action: null,
            shot_type: 'WS',
            camera_movement: 'static',
            camera_direction: 'static',
            duration_seconds: 5.0,
            lighting: 'Bright even studio lighting',
            color_palette: arcDef.color_palette,
            mood: 'educational, clear',
            text_overlay: section.title,
            continuity_bridge: 'diagram panel',
          }]
        };
      }

      const sectionScenes = sectionResult?.scenes || [];

      // Enforce scene numbers, attach metadata
      sectionScenes.forEach((scene, idx) => {
        scene.scene_number = globalSceneNumber + idx;
        scene.section_title = section.title;
        scene.section_index = si;
        scene.arc_type = arcType;
        allScenes.push(scene);
      });

      globalSceneNumber += sectionScenes.length;

      // Update continuity for next section
      const lastScene = sectionScenes[sectionScenes.length - 1];
      if (lastScene) {
        continuityNote = [
          `Last section: "${section.title}"`,
          `Last scene type: ${lastScene.scene_type}`,
          `Last visual: ${(lastScene.visual_concept || '').substring(0, 120)}`,
          `Continuity bridge: ${lastScene.continuity_bridge || 'none'}`,
          `Color palette carried: ${lastScene.color_palette || arcDef.color_palette}`,
        ].join(' | ');
      }

      console.log(`✅ Section ${si + 1}: ${sectionScenes.length} scenes (total so far: ${allScenes.length})`);
    }

    // Build beat durations — scale to match script narration if AI undershoots
    let beatDurations = allScenes.map(s => parseFloat((s.duration_seconds || 5.0).toFixed(2)));
    const rawTotal = beatDurations.reduce((a, b) => a + b, 0);
    const scriptDurationSec = script.estimated_duration_sec || (script.word_count ? script.word_count / 2.5 : targetDurationSec);

    if (rawTotal > 0 && Math.abs(rawTotal - scriptDurationSec) / scriptDurationSec > 0.15) {
      const scale = scriptDurationSec / rawTotal;
      beatDurations = beatDurations.map(d => parseFloat((d * scale).toFixed(2)));
      console.log(`⚖️ Scaled durations ${scale.toFixed(2)}x (raw: ${rawTotal.toFixed(1)}s → target: ${scriptDurationSec.toFixed(1)}s)`);
    }

    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => {
      beatStartTimes.push(parseFloat(offset.toFixed(2)));
      offset += d;
    });

    // Save production settings
    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: project.name,
        narrative_arc_summary: `Explainer: ${outlineSections.map(s => s.title).join(' → ')}`,
        visual_world: `Educational explainer | ${arcDef.label} Einstein | ${allScenes.length} scenes | ${arcType} arc`,
        visual_format: 'explainer_diagram',
        einstein_arc: arcType,
        arc_label: arcDef.label,
      }),
    };

    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
    }

    // Camera direction map matching existing pipeline
    const cameraMap = {
      zoom_in: 'slow_zoom_in', zoom_out: 'slow_zoom_out',
      pan_left: 'slow_pan', pan_right: 'slow_pan',
      push_in: 'slow_zoom_in', static: 'static',
    };

    // Build scene records
    const sceneRecords = allScenes.map((scene, i) => {
      const directorNotes = {
        visual_concept: scene.visual_concept || '',
        diagram_content: scene.diagram_content || null,
        scene_type: scene.scene_type || 'concept_diagram',
        einstein_present: scene.einstein_present || false,
        einstein_action: scene.einstein_action || null,
        einstein_arc: arcType,
        arc_label: arcDef.label,
        einstein_look: arcDef.look,
        einstein_environment: arcDef.environment,
        shot_type: scene.shot_type || 'WS',
        camera_angle: 'Eye-level, locked',
        camera_movement: scene.camera_movement || 'static',
        camera_direction: scene.camera_direction || 'static',
        lighting: scene.lighting || 'Bright even studio lighting, no harsh shadows',
        color_palette: scene.color_palette || arcDef.color_palette,
        mood: scene.mood || 'educational, clear',
        depth_of_field: 'Medium f/4 — diagram sharp, background soft',
        continuity_bridge: scene.continuity_bridge || '',
        emotional_intensity: 0.6,
        viewer_emotion: 'curious, engaged',
        section_title: scene.section_title || '',
        section_index: scene.section_index ?? 0,
        text_overlay: scene.text_overlay || '',
        audio_note: 'clear educational narration, subtle ambient background music',
        characters_present: scene.einstein_present ? ['Einstein'] : [],
        explainer_mode: true,
      };

      return {
        project_id,
        scene_number: scene.scene_number,
        narration_text: scene.narration_text || '',
        image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
        animation_prompt: scene.camera_direction || 'static',
        duration_seconds: beatDurations[i],
        camera_movement: cameraMap[scene.camera_direction] || 'static',
        animation_speed: 'normal',
        status: 'breakdown_ready',
        act: scene.section_title || '',
        notes: scene.text_overlay || '',
      };
    });

    await base44.asServiceRole.entities.Scenes.bulkCreate(sceneRecords);

    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: 'breakdown_complete',
      current_step: 5,
    });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`🎓 Created ${sceneRecords.length} explainer scenes in ${elapsed}s | total duration: ${offset.toFixed(1)}s`);

    return Response.json({
      success: true,
      done: true,
      scenes_created: sceneRecords.length,
      sections_processed: outlineSections.length,
      arc_type: arcType,
      arc_label: arcDef.label,
      total_duration_seconds: parseFloat(offset.toFixed(1)),
      research_used: !!researchData,
    });

  } catch (error) {
    console.error('❌ explainerSceneBreakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});