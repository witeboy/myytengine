import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// UNIFIED SCENE BREAKDOWN — Shorts + Explainer
// Routes by project.project_mode:
//   'explainer'      → Einstein educational breakdown (2 sections/call, resumable)
//   anything else    → Shorts rapid-cut breakdown
// ══════════════════════════════════════════════════════════════════

// ── JSON repair & extraction ──────────────────────────────────────
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
  try { return JSON.parse(repaired); } catch (_) {}
  const lastComplete = text.lastIndexOf('},');
  if (lastComplete > 0) {
    try { return JSON.parse(text.substring(0, lastComplete + 1) + ']}'); } catch (_) {}
  }
  return null;
}

// ── Gemini 2.5 Pro ────────────────────────────────────────────────
async function callGemini(prompt, systemText, temperature = 0.5) {
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
        generationConfig: { temperature, maxOutputTokens: 32768, responseMimeType: "application/json" },
      }),
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini ${response.status}: ${err.error?.message || JSON.stringify(err)}`);
  }
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const parsed = extractJSON(rawText);
  if (parsed) return parsed;
  throw new Error(`Gemini JSON parse failed. Length: ${rawText.length}`);
}

async function callAI(prompt, systemText, temperature = 0.5) {
  return await callGemini(prompt, systemText, temperature);
}

// ══════════════════════════════════════════════════════════════════
// EXPLAINER LOGIC
// ══════════════════════════════════════════════════════════════════
const SECTION_CADENCE = {
  hook:         { cuts_per_min: 30, min_scenes: 15, max_scenes: 35,  scene_dur: [1.5, 2.5] },
  core_concept: { cuts_per_min: 10, min_scenes: 12, max_scenes: 999, scene_dur: [2.0, 3.0] },
  mechanism:    { cuts_per_min: 11, min_scenes: 22, max_scenes: 999, scene_dur: [2.0, 3.0] },
  example:      { cuts_per_min: 10, min_scenes: 22, max_scenes: 999, scene_dur: [2.0, 3.0] },
  application:  { cuts_per_min: 13, min_scenes: 15, max_scenes: 999, scene_dur: [1.8, 2.8] },
  takeaway:     { cuts_per_min: 6,  min_scenes: 6,  max_scenes: 12,  scene_dur: [2.5, 4.0] },
};
const EXPLAINER_SECTION_TIME_PCT = {
  hook: 0.10, core_concept: 0.15, mechanism: 0.25,
  example: 0.25, application: 0.15, takeaway: 0.10,
};
const CANONICAL_TYPES = ['hook', 'core_concept', 'mechanism', 'example', 'application', 'takeaway'];
const SECTIONS_PER_CALL = 2;

function computeSceneTarget(sectionType, durationMinutes) {
  const cad = SECTION_CADENCE[sectionType] || SECTION_CADENCE.core_concept;
  const pct = EXPLAINER_SECTION_TIME_PCT[sectionType] ?? (1 / 6);
  const sectionMinutes = durationMinutes * pct;
  let target = Math.round(sectionMinutes * cad.cuts_per_min);
  target = Math.max(cad.min_scenes, Math.min(cad.max_scenes, target));
  return { target, cadence: cad, sectionMinutes };
}

function extractSectionType(focusArea, batchNumber) {
  const m = (focusArea || '').match(/^\[([a-z_]+)\|s\d+\]/);
  if (m && CANONICAL_TYPES.includes(m[1])) return m[1];
  return CANONICAL_TYPES[batchNumber - 1] || 'core_concept';
}

function clampDuration(seconds, sectionType) {
  const cad = SECTION_CADENCE[sectionType] || SECTION_CADENCE.core_concept;
  const [lo, hi] = cad.scene_dur;
  let d = parseFloat(seconds);
  if (!isFinite(d) || d <= 0) d = (lo + hi) / 2;
  if (d < lo) d = lo;
  if (d > hi) d = hi;
  return parseFloat(d.toFixed(2));
}

function getEinsteinArc(arcType) {
  const arcs = {
    science: {
      label: 'Mad Scientist',
      look: 'Pixar-style CGI cartoon Einstein with wild white hair, bushy mustache, kind animated eyes, rumpled white lab coat, safety goggles pushed up on forehead',
      props: 'bubbling test tube, floating 3D molecular structures, chalkboard with equations',
      environment: 'cluttered laboratory with glowing equipment, floating 3D molecular structures, holographic formula projections, chalkboards covered in equations',
      color_palette: 'Electric blue #0066FF, lab green #00CC88, white #FFFFFF, deep navy #0A1628',
    },
    professor: {
      label: 'Academic Lecturer',
      look: 'Pixar-style CGI cartoon Einstein with wild white hair side-parted, bushy mustache, warm grandfatherly expression, tweed jacket with elbow patches, reading glasses on nose',
      props: 'piece of chalk, oak desk with stacked books, holographic concept maps',
      environment: 'grand lecture hall with tiered seating, floor-to-ceiling chalkboard filled with clean diagrams and bullet lists, warm amber lighting, oak desk',
      color_palette: 'Warm amber #D4A574, chalk white #F5F5F0, oak brown #8B6914, deep blue #0A1628',
    },
    accountant: {
      label: 'Financial Guru',
      look: 'Pixar-style CGI cartoon Einstein with wild white hair slicked back, bushy mustache, intense focused expression, charcoal sweater-vest over crisp shirt, sleeves rolled up, reading glasses perched on nose',
      props: 'calculator, ledger, fountain pen, floating holographic spreadsheets and bar charts',
      environment: 'sleek modern boardroom with floor-to-ceiling glass, floating holographic spreadsheets and bar charts, marble surfaces, city skyline backdrop',
      color_palette: 'Money green #00AA55, gold #D4AF37, charcoal #2C2C2C, crisp white #FFFFFF',
    },
    tech: {
      label: 'IT Geek',
      look: 'Pixar-style CGI cartoon Einstein with wild white hair with one streak of neon blue, bushy mustache, graphic tee featuring a physics equation, over-ear RGB headset around neck, casual hoodie',
      props: 'glowing smartphone, floating holographic 3D app screens, floating UI components',
      environment: 'futuristic tech hub with neon-lit server racks, floating holographic code editors, dual curved monitors, RGB ambient lighting, floating UI and API diagrams',
      color_palette: 'Neon cyan #00FFFF, electric purple #7B00FF, dark charcoal #1A1A2E, white #FFFFFF',
    },
  };
  return arcs[arcType] || arcs.professor;
}

function buildResearchBlock(researchData, flatResearch, sectionIndex) {
  const sectioned = researchData?.sections?.[sectionIndex];
  if (sectioned) {
    return `\n**═══ VERIFIED RESEARCH FOR THIS SECTION ═══**\nCore facts: ${JSON.stringify(sectioned.core_facts || [])}\nBest analogy: ${sectioned.best_analogy || 'N/A'}\nFormulas/Code: ${JSON.stringify(sectioned.formulas_or_code || [])}\nMisconceptions: ${JSON.stringify(sectioned.misconceptions || [])}\n`;
  }
  if (flatResearch) {
    try {
      const r = typeof flatResearch === 'string' ? JSON.parse(flatResearch) : flatResearch;
      const facts = (r.facts || []).slice(0, 6).map((f, i) => `  [F${i + 1}] ${f.claim || f}`).join('\n');
      const numbers = (r.key_numbers || []).slice(0, 6).map((n, i) => {
        if (typeof n === 'string') return `  [N${i + 1}] ${n}`;
        return `  [N${i + 1}] ${n.number || n.value || ''} — ${n.context || ''}`;
      }).join('\n');
      return `\n**═══ GROUNDED RESEARCH ═══**\nFACTS:\n${facts || '  (none)'}\nKEY NUMBERS:\n${numbers || '  (none)'}\n`;
    } catch (_) { return `\n**RESEARCH NOTES**: ${flatResearch}\n`; }
  }
  return '';
}

function buildExplainerSectionPrompt({ section, sectionIndex, totalSections, arcDef, sectionType, targetSceneCount, durationSeconds, sceneDurRange, researchBlock, continuityNote, globalSceneStart, isFirst, isLast }) {
  const [durLo, durHi] = sceneDurRange;
  const pacingDirective = sectionType === 'hook'
    ? `HOOK CADENCE: 30 cuts/min. Each narration sentence is ITS OWN SCENE. Scenes ${durLo}-${durHi}s. Make ${targetSceneCount} scenes minimum.`
    : sectionType === 'takeaway'
    ? `TAKEAWAY CADENCE: 6 cuts/min. Scenes ${durLo}-${durHi}s. Make ~${targetSceneCount} scenes.`
    : `BODY CADENCE: ${SECTION_CADENCE[sectionType]?.cuts_per_min || 10} cuts/min. Scenes ${durLo}-${durHi}s. Make ~${targetSceneCount} scenes.`;

  return `You are an educational video director breaking down ONE section of an explainer video into scenes.

**EINSTEIN ARC**: ${arcDef.label}
Character look (USE EXACTLY THIS, every scene): ${arcDef.look}
Props: ${arcDef.props}
Environment: ${arcDef.environment}
Color palette: ${arcDef.color_palette}

**SECTION ${sectionIndex + 1} of ${totalSections} — TYPE: ${sectionType.toUpperCase()}**
Title: "${section.title}"
Allocated duration: ${durationSeconds.toFixed(1)}s
TARGET SCENE COUNT: ${targetSceneCount} scenes

**SECTION SCRIPT**:
${section.content}

${researchBlock}

**CONTINUITY FROM PREVIOUS SECTION**: ${continuityNote}

**═══ CADENCE RULE ═══**
${pacingDirective}

**RULES**:
1. ONE SENTENCE = ONE SCENE.
2. Each scene duration MUST be between ${durLo} and ${durHi} seconds.
3. Every scene shows Einstein OR a clean diagram OR a worked example panel.
4. If section mentions specific numbers/formulas, that EXACT text must appear on a chalkboard/panel.
${isFirst ? '5. FIRST section — opening scene shows Einstein entering with personality.' : ''}
${isLast ? '5. LAST section — final scene shows Einstein delivering takeaway with warm satisfaction.' : ''}

Return ONLY valid JSON:
{
  "section_title": "${section.title}",
  "scenes": [
    {
      "scene_number": ${globalSceneStart},
      "narration_text": "single sentence verbatim",
      "visual_concept": "30+ word description",
      "chalkboard_text": "EXACT text/numbers/formula or empty",
      "einstein_present": true,
      "einstein_action": "pointing at chalkboard / writing formula",
      "shot_type": "ECU/CU/MCU/MS/WS",
      "camera_movement": "static / slow push-in / pan left / pan right",
      "camera_direction": "zoom_in or zoom_out or pan_left or pan_right or static or push_in",
      "duration_seconds": ${((durLo + durHi) / 2).toFixed(1)},
      "lighting": "lighting style",
      "color_palette": "from arc palette",
      "mood": "2-3 words",
      "text_overlay": "bold label or empty",
      "continuity_bridge": "visual element linking to next scene"
    }
  ]
}

Scene numbers start at ${globalSceneStart}, increment by 1.`;
}

async function runExplainerBreakdown(req, base44, project, projectId, body) {
  const callStart = Date.now();
  const { start_section = 0 } = body;

  const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id: projectId });
  const sortedBatches = allBatches.sort((a, b) => a.batch_number - b.batch_number);

  let outlineSections = [];
  if (sortedBatches.length > 0 && sortedBatches.every(b => b.content)) {
    outlineSections = sortedBatches.map(b => ({
      title: b.story_segment || `Section ${b.batch_number}`,
      content: b.content,
      section_type: extractSectionType(b.focus_area, b.batch_number),
    }));
  } else {
    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id: projectId });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) return Response.json({ error: 'No ScriptBatches with content and no final script found.' }, { status: 400 });
    const parts = script.full_script.split(/\n(?=#{1,3}\s|\*\*[A-Z]|\d\.\s[A-Z])/g);
    outlineSections = parts.map((p, i) => ({
      title: `Section ${i + 1}`,
      content: p.trim(),
      section_type: CANONICAL_TYPES[i] || 'core_concept',
    }));
  }

  const totalSections = outlineSections.length;
  const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id: projectId });
  let sectionedResearch = null;
  if (psList[0]?.research_notes) {
    try { sectionedResearch = JSON.parse(psList[0].research_notes); } catch (_) {}
  }
  const flatResearch = project.research_notes || null;
  const arcType = project.explainer_arc || 'professor';
  const arcDef = getEinsteinArc(arcType);
  const durationMinutes = project.video_duration_minutes || 10;

  console.log(`🎓 Explainer: "${project.name}" | arc:${arcType} | sections:${totalSections} | start:${start_section}`);

  let globalSceneNumber = 1;
  let continuityNote = 'This is the opening — Einstein enters with maximum personality and energy.';

  if (start_section === 0) {
    const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: projectId });
    if (oldScenes.length > 0) {
      await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));
      console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
    }
  } else {
    const existing = await base44.asServiceRole.entities.Scenes.filter({ project_id: projectId });
    if (existing.length > 0) {
      globalSceneNumber = Math.max(...existing.map(s => s.scene_number || 0)) + 1;
      const lastScene = existing.sort((a, b) => (b.scene_number || 0) - (a.scene_number || 0))[0];
      if (lastScene?.notes) continuityNote = `Continuing from scene ${globalSceneNumber - 1}: ${lastScene.notes}`;
    }
  }

  const endSection = Math.min(start_section + SECTIONS_PER_CALL, totalSections);
  const allScenesThisCall = [];
  const systemText = "You are an educational video director specialising in explainer content. Return ONLY raw valid JSON. No markdown, no backticks, no conversational text.";

  for (let si = start_section; si < endSection; si++) {
    const section = outlineSections[si];
    const sectionType = section.section_type || CANONICAL_TYPES[si] || 'core_concept';
    const { target, cadence, sectionMinutes } = computeSceneTarget(sectionType, durationMinutes);
    const researchBlock = buildResearchBlock(sectionedResearch, flatResearch, si);

    const prompt = buildExplainerSectionPrompt({
      section, sectionIndex: si, totalSections, arcDef, sectionType,
      targetSceneCount: target, durationSeconds: sectionMinutes * 60,
      sceneDurRange: cadence.scene_dur, researchBlock, continuityNote,
      globalSceneStart: globalSceneNumber, isFirst: si === 0, isLast: si === totalSections - 1,
    });

    const temp = sectionType === 'hook' ? 0.75 : (sectionType === 'mechanism' || sectionType === 'example') ? 0.35 : 0.5;

    let sectionResult;
    try {
      sectionResult = await callAI(prompt, systemText, temp);
    } catch (err) {
      console.error(`❌ Section ${si + 1} failed: ${err.message} — fallback`);
      const sentences = (section.content || section.title || '').match(/[^.!?]+[.!?]+/g) || [section.content || section.title];
      sectionResult = {
        scenes: sentences.slice(0, target).map((sent, idx) => ({
          scene_number: globalSceneNumber + idx,
          narration_text: sent.trim(),
          visual_concept: `${arcDef.label} Einstein in ${arcDef.environment}, gesturing toward chalkboard. Pixar CGI cartoon style.`,
          chalkboard_text: '', einstein_present: true, einstein_action: 'gesturing toward chalkboard',
          shot_type: 'MS', camera_movement: 'static', camera_direction: 'static',
          duration_seconds: (cadence.scene_dur[0] + cadence.scene_dur[1]) / 2,
          lighting: 'Bright even studio lighting', color_palette: arcDef.color_palette,
          mood: 'educational, clear', text_overlay: '', continuity_bridge: 'chalkboard transition',
        }))
      };
    }

    // ── TOP-UP LOOP: if AI returned < 85% of target, re-prompt for missing scenes ──
    let sectionScenes = (sectionResult?.scenes || []).slice(0, cadence.max_scenes);
    const TOP_UP_MAX = 2;
    let topUpAttempt = 0;
    while (sectionScenes.length < Math.floor(target * 0.85) && topUpAttempt < TOP_UP_MAX) {
      topUpAttempt++;
      const have = sectionScenes.length;
      const need = target - have;
      const usedNarrations = sectionScenes.map(s => s.narration_text?.trim()).filter(Boolean);
      const nextSceneNum = globalSceneNumber + have;
      console.log(`🔁 Top-up ${topUpAttempt}: section ${si + 1} (${sectionType}) has ${have}/${target} — requesting ${need} more from scene ${nextSceneNum}`);

      const topUpPrompt = `You are an educational video director. The previous AI call only generated ${have} of the required ${target} scenes for this section. Generate the REMAINING ${need} scenes continuing from scene ${nextSceneNum}.

**EINSTEIN ARC**: ${arcDef.label}
Character look: ${arcDef.look}
Environment: ${arcDef.environment}
Color palette: ${arcDef.color_palette}

**SECTION TYPE**: ${sectionType.toUpperCase()}
**SECTION SCRIPT** (full — pick sentences not yet used):
${section.content}

**ALREADY USED NARRATIONS** (do NOT repeat these):
${usedNarrations.map((n, i) => `${i + 1}. "${n}"`).join('\n')}

Generate exactly ${need} NEW scenes using sentences from the script NOT in the already-used list above.
Each scene duration: ${cadence.scene_dur[0]}-${cadence.scene_dur[1]}s.
Scene numbers start at ${nextSceneNum}.

Return ONLY valid JSON:
{"scenes": [{"scene_number": ${nextSceneNum}, "narration_text": "...", "visual_concept": "...", "chalkboard_text": "...", "einstein_present": true, "einstein_action": "...", "shot_type": "MS", "camera_movement": "static", "camera_direction": "static", "duration_seconds": ${((cadence.scene_dur[0] + cadence.scene_dur[1]) / 2).toFixed(1)}, "lighting": "...", "color_palette": "...", "mood": "...", "text_overlay": "", "continuity_bridge": "..."}]}`;

      try {
        const topUpResult = await callAI(topUpPrompt, systemText, temp);
        const topUpScenes = topUpResult?.scenes || [];
        if (topUpScenes.length > 0) {
          sectionScenes = [...sectionScenes, ...topUpScenes].slice(0, cadence.max_scenes);
          console.log(`✅ Top-up ${topUpAttempt}: added ${topUpScenes.length} scenes → total ${sectionScenes.length}/${target}`);
        } else {
          console.warn(`⚠️ Top-up ${topUpAttempt}: returned 0 scenes — stopping`);
          break;
        }
      } catch (topUpErr) {
        console.warn(`⚠️ Top-up ${topUpAttempt} failed: ${topUpErr.message} — stopping`);
        break;
      }
    }

    if (sectionScenes.length < target * 0.7) {
      console.warn(`⚠️ Section ${si + 1} (${sectionType}): ${sectionScenes.length}/${target} scenes after top-up (under target)`);
    } else {
      console.log(`✅ Section ${si + 1} (${sectionType}): ${sectionScenes.length}/${target} scenes`);
    }
    sectionScenes.forEach((scene, idx) => {
      scene.scene_number = globalSceneNumber + idx;
      scene.section_title = section.title;
      scene.section_type = sectionType;
      scene.section_index = si;
      scene.arc_type = arcType;
      scene.duration_seconds = clampDuration(scene.duration_seconds, sectionType);
      allScenesThisCall.push(scene);
    });
    globalSceneNumber += sectionScenes.length;

    const lastScene = sectionScenes[sectionScenes.length - 1];
    if (lastScene) continuityNote = `Last section: "${section.title}" (${sectionType}) | Last visual: ${(lastScene.visual_concept || '').substring(0, 120)} | Bridge: ${lastScene.continuity_bridge || 'none'}`;
  }

  const cameraMap = { zoom_in: 'slow_zoom_in', zoom_out: 'slow_zoom_out', pan_left: 'slow_pan', pan_right: 'slow_pan', push_in: 'slow_zoom_in', static: 'static' };

  const sceneRecords = allScenesThisCall.map(scene => {
    const directorNotes = {
      visual_concept: scene.visual_concept || '',
      chalkboard_text: scene.chalkboard_text || '',
      einstein_present: scene.einstein_present !== false,
      einstein_action: scene.einstein_action || null,
      einstein_arc: arcType, arc_label: arcDef.label,
      einstein_look: arcDef.look, einstein_environment: arcDef.environment, einstein_props: arcDef.props,
      shot_type: scene.shot_type || 'MS', camera_movement: scene.camera_movement || 'static',
      camera_direction: scene.camera_direction || 'static',
      lighting: scene.lighting || 'Bright even studio lighting, no harsh shadows',
      color_palette: scene.color_palette || arcDef.color_palette,
      mood: scene.mood || 'educational, clear',
      section_title: scene.section_title || '', section_type: scene.section_type || 'core_concept',
      section_index: scene.section_index ?? 0, text_overlay: scene.text_overlay || '',
      characters_present: scene.einstein_present !== false ? ['Einstein'] : [],
      explainer_mode: true, forced_visual_style: 'cinematic_picstory',
      explainer_render_note: `Pixar/Illumination CGI cartoon Einstein, warm and expressive, ${arcDef.label} arc. Chalkboard MUST show: ${scene.chalkboard_text || 'clean educational diagram'}. NO photorealism.`,
    };
    return {
      project_id: projectId,
      scene_number: scene.scene_number,
      narration_text: scene.narration_text || '',
      image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
      animation_prompt: scene.camera_direction || 'static',
      duration_seconds: scene.duration_seconds,
      camera_movement: cameraMap[scene.camera_direction] || 'static',
      animation_speed: 'normal', status: 'breakdown_ready',
      act: scene.section_title || '', notes: scene.text_overlay || '',
    };
  });

  if (sceneRecords.length > 0) {
    await base44.asServiceRole.entities.Scenes.bulkCreate(sceneRecords);
    console.log(`💾 Saved ${sceneRecords.length} scenes (sections ${start_section + 1}-${endSection})`);
  }

  const isDone = endSection >= totalSections;

  if (isDone) {
    const allScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: projectId });
    const sorted = allScenes.sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
    const beatDurations = sorted.map(s => parseFloat((s.duration_seconds || 2.5).toFixed(2)));
    const beatStartTimes = [];
    let offset = 0;
    beatDurations.forEach(d => { beatStartTimes.push(parseFloat(offset.toFixed(2))); offset += d; });

    const psPayload = {
      beat_durations: JSON.stringify(beatDurations),
      beat_start_times: JSON.stringify(beatStartTimes),
      story_analysis: JSON.stringify({
        central_theme: project.name,
        narrative_arc_summary: `Explainer: ${outlineSections.map(s => s.title).join(' → ')}`,
        visual_world: `Explainer | ${arcDef.label} Einstein | ${sorted.length} scenes | ${arcType} arc`,
        visual_format: 'explainer_diagram', einstein_arc: arcType, arc_label: arcDef.label,
        total_duration_sec: parseFloat(offset.toFixed(1)),
      }),
    };
    if (psList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({ project_id: projectId, ...psPayload });
    }
    await base44.asServiceRole.entities.Projects.update(projectId, { status: 'breakdown_complete', current_step: 5 });

    const elapsed = ((Date.now() - callStart) / 1000).toFixed(1);
    console.log(`🎓 DONE: ${sorted.length} scenes in ${elapsed}s`);
    return Response.json({ success: true, done: true, scenes_created: sorted.length, sections_processed: totalSections, arc_type: arcType, arc_label: arcDef.label, total_duration_seconds: parseFloat(offset.toFixed(1)) });
  }

  return Response.json({ success: true, done: false, next_section: endSection, sections_processed_this_call: endSection - start_section, total_sections: totalSections, scenes_so_far: globalSceneNumber - 1 });
}

// ══════════════════════════════════════════════════════════════════
// SHORTS LOGIC
// ══════════════════════════════════════════════════════════════════
function splitIntoSentences(text) {
  const raw = text.match(/[^.!?…]+[.!?…]+["']?[\s]*/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}
function wordCount(text) { return text.trim().split(/\s+/).filter(w => w.length > 0).length; }
function buildSceneBeats(sentences) {
  const beats = [];
  let i = 0;
  while (i < sentences.length) {
    const sentence = sentences[i];
    const wc = wordCount(sentence);
    if (wc < 3 && i + 1 < sentences.length && wordCount(sentences[i + 1]) < 3) {
      beats.push({ narration_text: `${sentence} ${sentences[i + 1]}`, word_count: wordCount(`${sentence} ${sentences[i + 1]}`), angle_index: 0, total_angles: 1, is_multi_angle: false });
      i += 2; continue;
    }
    if (wc > 5) {
      const totalAngles = Math.ceil(wc / 5);
      for (let a = 0; a < totalAngles; a++) beats.push({ narration_text: sentence, word_count: wc, angle_index: a, total_angles: totalAngles, is_multi_angle: true });
      i++; continue;
    }
    beats.push({ narration_text: sentence, word_count: wc, angle_index: 0, total_angles: 1, is_multi_angle: false });
    i++;
  }
  return beats;
}
function getSectionLabel(pct) {
  if (pct < 0.10) return 'hook'; if (pct < 0.25) return 'tension'; if (pct < 0.35) return 'pivot';
  if (pct < 0.55) return 'value_1'; if (pct < 0.72) return 'value_2'; if (pct < 0.85) return 'value_3';
  if (pct < 0.95) return 'cta'; return 'deadzone';
}
function getSectionHint(section) {
  const hints = {
    hook: 'ECU/LOW ANGLE, kinetic, emotional_intensity=0.9', tension: 'MCU→CU, urgency, emotional_intensity=0.8',
    pivot: 'HARD CUT, dutch angle, emotional_intensity=0.7', value_1: 'MS to MCU, emotional_intensity=0.6',
    value_2: 'MS to MCU, emotional_intensity=0.6', value_3: 'MCU to CU, emotional_intensity=0.65',
    cta: 'ECU/LOW ANGLE, bold action text, emotional_intensity=0.85', deadzone: 'WIDE, static, emotional_intensity=0.1',
  };
  return hints[section] || 'MS, emotional_intensity=0.5';
}
const BEATS_PER_SUBBATCH = 12;

async function runShortsBreakdown(base44, project, projectId) {
  const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id: projectId });
  const script = allScripts.find(s => s.version === 'final_aggregated');
  if (!script?.full_script) return Response.json({ error: 'No final script found.' }, { status: 400 });

  const fullScript = script.full_script;
  let shortsNiche = 'finance';
  if (project.channel_id) {
    const channels = await base44.asServiceRole.entities.Channels.filter({ id: project.channel_id });
    shortsNiche = channels[0]?.shorts_niche || 'finance';
  }

  const sentences = splitIntoSentences(fullScript);
  const allBeats = buildSceneBeats(sentences);
  const totalScenes = allBeats.length;
  console.log(`📱 Shorts: ${sentences.length} sentences → ${totalScenes} beats`);

  const beatChunks = [];
  for (let i = 0; i < allBeats.length; i += BEATS_PER_SUBBATCH) beatChunks.push(allBeats.slice(i, i + BEATS_PER_SUBBATCH));

  const allAiScenes = [];
  let globalSceneNumber = 1;
  let continuityNote = 'Opening — maximum energy from frame one.';
  const systemText = "You are a YouTube Shorts video editor. Return ONLY raw valid JSON. No markdown, no backticks, no conversational text.";

  for (let bi = 0; bi < beatChunks.length; bi++) {
    const chunk = beatChunks[bi];
    const beatList = chunk.map((beat, idx) => {
      const sceneNum = globalSceneNumber + idx;
      const pct = sceneNum / totalScenes;
      const section = getSectionLabel(pct);
      const angleNote = beat.is_multi_angle ? `[MULTI-ANGLE ${beat.angle_index + 1}/${beat.total_angles}]` : '[SINGLE SCENE]';
      return `Scene ${sceneNum} | ${section} | ${angleNote}\nNarration: "${beat.narration_text}"`;
    }).join('\n\n');
    const sectionsInChunk = [...new Set(chunk.map((beat, idx) => getSectionLabel((globalSceneNumber + idx) / totalScenes)))];
    const sectionHints = sectionsInChunk.map(s => `- ${s}: ${getSectionHint(s)}`).join('\n');

    const prompt = `You are a YouTube Shorts video editor directing stock footage for a ${shortsNiche} channel.
FULL SCRIPT: ${fullScript}
CONTINUITY: ${continuityNote}
SECTIONS: ${sectionHints}
SCENES (${chunk.length} scenes):
${beatList}
Return ONLY valid JSON — {"scenes": [...]} — each scene with: scene_number, narration_text (EXACT as given), duration_seconds (2.0-2.5), visual_concept, shot_type, camera_angle, camera_movement, lighting, color_palette, depth_of_field, mood, continuity_bridge, emotional_intensity, viewer_emotion, text_overlay, audio_note, characters_present, camera_direction (zoom_in/zoom_out/pan_left/pan_right/static/push_in).`;

    let subResult;
    try {
      subResult = await callAI(prompt, systemText, 0.5);
    } catch (err) {
      console.error(`❌ Shorts sub-batch ${bi + 1} failed: ${err.message}`);
      chunk.forEach((beat, idx) => {
        allAiScenes.push({ scene_number: globalSceneNumber + idx, section: getSectionLabel((globalSceneNumber + idx) / totalScenes), narration_text: beat.narration_text, duration_seconds: 2.25, visual_concept: `Stock footage: "${beat.narration_text.substring(0, 80)}"`, shot_type: 'MS', camera_angle: 'Eye-level', camera_movement: 'Static locked', lighting: 'Natural', color_palette: 'High contrast', depth_of_field: 'Shallow f/1.8', mood: 'engaged', continuity_bridge: 'neutral', emotional_intensity: 0.6, viewer_emotion: 'engaged', text_overlay: '', audio_note: 'conversational', characters_present: [], camera_direction: 'push_in', _beat: beat });
      });
      globalSceneNumber += chunk.length; continue;
    }

    const subScenes = subResult?.scenes || [];
    subScenes.forEach((scene, idx) => {
      const beat = chunk[idx] || chunk[chunk.length - 1];
      scene.scene_number = globalSceneNumber + idx;
      scene._beat = beat;
      if (beat) scene.narration_text = beat.narration_text;
      allAiScenes.push(scene);
    });
    globalSceneNumber += subScenes.length;
    const lastScene = subScenes[subScenes.length - 1];
    if (lastScene) continuityNote = `Last narration: "${(lastScene.narration_text || '').slice(-80)}" | Shot: ${lastScene.shot_type || 'MS'} | Bridge: ${lastScene.continuity_bridge || 'none'}`;
  }

  const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id: projectId });
  if (oldScenes.length > 0) await Promise.all(oldScenes.map(s => base44.asServiceRole.entities.Scenes.delete(s.id).catch(() => {})));

  const beatDurations = allAiScenes.map(s => {
    const beat = s._beat;
    if (beat?.is_multi_angle) { const t = beat.word_count / 2.5; return parseFloat(Math.min(2.5, Math.max(2.0, t / beat.total_angles)).toFixed(2)); }
    return parseFloat((s.duration_seconds || 2.25).toFixed(2));
  });
  const beatStartTimes = [];
  let offset = 0;
  beatDurations.forEach(d => { beatStartTimes.push(parseFloat(offset.toFixed(2))); offset += d; });

  const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id: projectId });
  const psPayload = {
    beat_durations: JSON.stringify(beatDurations), beat_start_times: JSON.stringify(beatStartTimes),
    story_analysis: JSON.stringify({ central_theme: `YouTube Short: ${project.name}`, narrative_arc_summary: 'Hook → Tension → Pivot → Value 1-3 → CTA', visual_world: `Fast-paced ${shortsNiche} | ${allAiScenes.length} scenes`, visual_format: 'shorts_rapid_cut' }),
  };
  if (psList[0]) { await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload); }
  else { await base44.asServiceRole.entities.ProductionSettings.create({ project_id: projectId, ...psPayload }); }

  const cameraMap = { zoom_in: 'slow_zoom_in', zoom_out: 'slow_zoom_out', pan_left: 'slow_pan', pan_right: 'slow_pan', push_in: 'slow_zoom_in', static: 'static' };

  const sceneRecords = allAiScenes.map((aiScene, i) => {
    const beat = aiScene._beat || {};
    const directorNotes = {
      visual_concept: aiScene.visual_concept || '', shot_type: aiScene.shot_type || 'MS',
      camera_angle: aiScene.camera_angle || 'Eye-level', camera_movement: aiScene.camera_movement || 'Static locked',
      lighting: aiScene.lighting || 'Motivated practical', color_palette: aiScene.color_palette || 'High contrast',
      depth_of_field: aiScene.depth_of_field || 'Shallow f/1.8', mood: aiScene.mood || '',
      continuity_bridge: aiScene.continuity_bridge || '', emotional_intensity: aiScene.emotional_intensity || 0.7,
      viewer_emotion: aiScene.viewer_emotion || '', section: aiScene.section || '',
      text_overlay: aiScene.text_overlay || '', audio_note: aiScene.audio_note || '',
      characters_present: aiScene.characters_present || [], camera_direction: aiScene.camera_direction || 'push_in',
      shorts_format: true, is_multi_angle: beat.is_multi_angle || false,
      angle_index: beat.angle_index ?? 0, total_angles: beat.total_angles ?? 1,
    };
    return {
      project_id: projectId, scene_number: aiScene.scene_number, narration_text: aiScene.narration_text || '',
      image_prompt: `DIRECTOR_NOTES:${JSON.stringify(directorNotes)}`,
      animation_prompt: aiScene.camera_direction || 'push_in', duration_seconds: beatDurations[i],
      camera_movement: cameraMap[aiScene.camera_direction] || 'slow_zoom_in',
      animation_speed: 'normal', status: 'breakdown_ready', act: aiScene.section || '', notes: aiScene.text_overlay || '',
    };
  });

  await base44.asServiceRole.entities.Scenes.bulkCreate(sceneRecords);
  await base44.asServiceRole.entities.Projects.update(projectId, { status: 'breakdown_complete', current_step: 5, orientation: 'portrait' });
  console.log(`📱 Created ${sceneRecords.length} Shorts scenes | total: ${offset.toFixed(1)}s`);
  return Response.json({ success: true, done: true, scenes_created: sceneRecords.length, total_duration: offset.toFixed(1) });
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER — routes by project_mode
// ══════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { project_id } = body;

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    console.log(`[unified] project_mode: ${project.project_mode} | project: ${project.name}`);

    if (project.project_mode === 'explainer') {
      return await runExplainerBreakdown(req, base44, project, project_id, body);
    } else {
      return await runShortsBreakdown(base44, project, project_id);
    }

  } catch (error) {
    console.error('❌ unified breakdown error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});