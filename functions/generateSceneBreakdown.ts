import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE — V2 (Speed + Quality)
// ══════════════════════════════════════════════════════════════════
// Single-call architecture: analysis + all phases in one invocation.
// Falls back to multi-call only if approaching timeout on long videos.
//
// Pipeline: Script → [THIS] → Scene Prompts → Image Gen → Animation
// ══════════════════════════════════════════════════════════════════

async function callGemini(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 16384, responseMimeType: "application/json" }
      })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini error: ${err.error?.message || response.status}`);
  }
  const data = await response.json();
  if (!data.candidates?.length) throw new Error("No candidates from Gemini");
  const rawText = data.candidates[0].content.parts[0].text;
  try { return JSON.parse(rawText); } catch (_) {}
  const lastBrace = rawText.lastIndexOf('}');
  if (lastBrace === -1) throw new Error("Cannot recover JSON");
  const trimmed = rawText.substring(0, lastBrace + 1);
  for (const suffix of [']}', '}]}', '']) {
    try {
      const parsed = JSON.parse(trimmed + suffix);
      if (parsed.scenes && Array.isArray(parsed.scenes)) return parsed;
      if (parsed.story_analysis) return parsed;
    } catch (_) {}
  }
  throw new Error("Failed to parse Gemini JSON after recovery");
}

function cleanScriptText(text) {
  return text
    .replace(/\[[^\]]*\]/gi, '')
    .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '')
    .replace(/^[A-Z\s]+\(V\.?O\.?\)\s*:?\s*/gim, '')
    .replace(/\*\*[^*]+\*\*:?\s*/g, '')
    .replace(/\*\*/g, '').replace(/\*/g, '')
    .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic|softly|urgent|compelling)[^)]*\)/gi, '')
    .replace(/\(?\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?\)?/g, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function cleanNarrationText(text) {
  if (!text) return text;
  return text
    .replace(/\[[^\]]*\]/gi, '')
    .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '')
    .replace(/^[A-Z\s]+\(V\.?O\.?\)\s*:?\s*/gim, '')
    .replace(/\*\*[^*]+\*\*:?\s*/g, '')
    .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic|softly|urgent|compelling)[^)]*\)/gi, '')
    .replace(/\(?\d{1,2}:\d{2}(?:\s*[-–—]\s*\d{1,2}:\d{2})?\)?/g, '')
    .replace(/\*\*/g, '').replace(/\*/g, '')
    .replace(/\n{2,}/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function normalizeStyleKey(raw) {
  if (!raw) return '';
  const normalized = raw.trim().toLowerCase().replace(/[\s\-]+/g, '_');
  const knownStyles = [
    'cinematic_realistic','photorealistic_4k','anime','cinematic_anime',
    'cartoon_2d','picstory_cocomelon','cinematic_picstory','oil_painting',
    'watercolor','comic_book','humpty_dumpty','harry_potter',
    '3d_whiteboard_cartoon','low_poly_3d_cartoon','skeleton_protagonist'
  ];
  if (knownStyles.includes(normalized)) return normalized;
  for (const key of knownStyles) {
    if (normalized.includes(key) || key.includes(normalized)) return key;
  }
  return normalized;
}

function getStyleCharacterDirective(visualStyle) {
  const directives = {
    skeleton_protagonist: `
**🦴 SKELETON PROTAGONIST STYLE:**
CHARACTER: Photorealistic transparent glass-like body shell with glossy ivory skeleton visible inside, big round expressive brown/amber EYEBALLS in skull sockets (NOT empty). Adult male, context-appropriate clothing. NOT scary — relatable HERO.
RULES: FULL BODY most scenes. Environment FIRST. Character DOING something. Include other humans. CONTINUITY ELEMENT per scene. Varied angles. Blurred backgrounds BANNED.`
  };
  return directives[visualStyle] || '';
}

function calculateBeatDurations(phases, durationMinutes) {
  const anchors = [{m:1,s:0.70},{m:3,s:0.85},{m:5,s:1.00},{m:10,s:1.20},{m:15,s:1.40},{m:30,s:1.70},{m:60,s:2.00}];
  function getScale(mins) {
    if (mins<=anchors[0].m) return anchors[0].s;
    if (mins>=anchors[anchors.length-1].m) return anchors[anchors.length-1].s;
    for (let i=0;i<anchors.length-1;i++) {
      if (mins>=anchors[i].m && mins<=anchors[i+1].m) {
        const t=(mins-anchors[i].m)/(anchors[i+1].m-anchors[i].m);
        return anchors[i].s+t*(anchors[i+1].s-anchors[i].s);
      }
    }
    return 1.0;
  }
  const scale = getScale(durationMinutes);
  const basePacing = {
    cold_open:{base:3.5,v:0.5}, rising_tension:{base:4.5,v:0.8},
    emotional_core:{base:5.5,v:1.0}, resolution:{base:4.5,v:0.5}
  };
  const durations = [];
  const floor = Math.max(2.5, 2.0*scale);
  for (const phase of phases) {
    const p = basePacing[phase.name] || {base:5*scale,v:0.5*scale};
    const base=p.base*scale, vari=p.v*scale;
    for (let i=0;i<phase.scenes;i++) {
      const ratio = phase.scenes>1 ? i/(phase.scenes-1) : 0.5;
      const d = Math.round((base+(ratio-0.5)*vari)*10)/10;
      durations.push(Math.max(floor, d));
    }
  }
  return durations;
}

function calculateStartTimes(durations) {
  const s=[]; let o=0;
  for (const d of durations) { s.push(o); o+=d; }
  return s;
}

function getNicheDirectorProfile(niche) {
  const profiles = {
    finance: { visual_world:"Corporate glass towers vs kitchen tables, institutional coldness vs human warmth", signature_shots:"Overhead desk chaos, CU hands gripping objects, empty rooms, silhouettes against windows", metaphor_language:"Weight/lightness, overflowing/empty containers, bridges and chasms", emotional_palette:"Cool blues/grays → warm ambers/golds", pacing_style:"Documentary gravitas with emotional swells", avoid:"Cash flying, stock offices, calculator close-ups" },
    retirement: { visual_world:"Golden-hour suburbs, family homes, nature trails, generational gatherings", signature_shots:"Photo-filled mantles, weathered hands, homes at different times of day", metaphor_language:"Seasons, paths and horizons, light through windows, roots and branches", emotional_palette:"Warm amber/honey, golden hour, earth tones", pacing_style:"Meaningful conversation over coffee", avoid:"Lonely elderly stereotypes, clinical settings" },
    motivation: { visual_world:"Mountain peaks, training spaces, pre-dawn cities, determination made beautiful", signature_shots:"Low-angle hero shots, tracking forward motion, silhouettes against epic backdrops", metaphor_language:"Elevation, fire and forge, dawn breaking, chains breaking", emotional_palette:"Dark blues/blacks → fiery oranges/golds", pacing_style:"Steady climb with explosive peaks", avoid:"Cheesy flexing, generic mountain-top arms" },
    horror: { visual_world:"Liminal spaces, barely-lit corridors, familiar places made wrong", signature_shots:"Dutch angles, long corridors, POV approaches, static wide shots with something wrong", metaphor_language:"Decay, doors that shouldn't be open, reflections that don't match", emotional_palette:"Sickly greens, desaturated blues, crimson accents", pacing_style:"Slow dread with sharp punctuation", avoid:"Over-the-top gore, cheap jump scare framing" },
    technology: { visual_world:"Clean labs and messy maker spaces, human hand meeting digital interface", signature_shots:"Macro components, rack focus human/machine, clean architectural frames", metaphor_language:"Networks, light through fiber, emergence, the spark of creation", emotional_palette:"Electric blues/whites, warm ambers for human moments, neon for innovation", pacing_style:"Precise and rhythmic with wonder at discovery", avoid:"Matrix code rain, cliché robots, hologram interfaces" },
    health: { visual_world:"Body as landscape, kitchens as labs, nature as pharmacy, self-care rituals", signature_shots:"Macro food shots, mindful human moments, nature parallels", metaphor_language:"Growth, water/nourishment, dawn as renewal, body as garden", emotional_palette:"Fresh greens, clean whites, sunrise golds, cool blues", pacing_style:"Breathing rhythm — expansion and contraction", avoid:"Clinical imagery, shame shots, pill focus" },
    crime: { visual_world:"Rain-slicked streets, interrogation rooms, evidence boards, moral gray zones", signature_shots:"Noir low-key lighting, over-shoulder reveals, bird's-eye evidence", metaphor_language:"Masks/mirrors, threads/webs, predator/prey", emotional_palette:"Noir blues/blacks, sodium oranges, forensic whites", pacing_style:"Each scene tightens the screw", avoid:"Gratuitous violence, sensationalized victims" },
    history: { visual_world:"Weathered textures, vast landscapes, artifacts as time portals", signature_shots:"Epic wides, slow zooms to period details, then/now juxtaposition", metaphor_language:"Layers, rivers of time, monuments rising/crumbling", emotional_palette:"Sepia warmth, stone grays, jewel tones for power", pacing_style:"Epic sweep with intimate punctuation", avoid:"Cartoonish stereotypes, anachronisms" },
    education: { visual_world:"Light-filled spaces, moment of understanding, abstract→tangible", signature_shots:"Revealing wides, diagram-like compositions, POV discovery", metaphor_language:"Illumination, puzzle pieces connecting, seeds growing", emotional_palette:"Bright clear colors, warm yellows for aha-moments", pacing_style:"Each scene adds a layer", avoid:"Boring classrooms, lecturing framing" },
    travel: { visual_world:"Golden hour landscapes, local markets, contrast between tourist gaze and authentic life", signature_shots:"Drone establishing shots, street-level handheld, food macros", metaphor_language:"Horizons, bridges between cultures, paths less traveled", emotional_palette:"Rich saturated palettes, golden light, azure skies", pacing_style:"Wandering but purposeful", avoid:"Tourist brochure clichés, Instagram filters" },
    relationship: { visual_world:"Intimate shared spaces, geometry of two people, environment reflecting emotions", signature_shots:"Two-shots with negative space, OTS perspectives, hand details", metaphor_language:"Bridges/walls, weather reflecting mood, growing/wilting", emotional_palette:"Warm amber for connection, cool blues for distance", pacing_style:"Ebbs and flows like real conversation", avoid:"Cheesy romance clichés, toxic glorification" },
  };
  return profiles[niche?.toLowerCase()] || {
    visual_world:"Environments reflecting emotional state, open vs enclosed spaces",
    signature_shots:"Establishing wides, medium shots, close-up emotion, macro details",
    metaphor_language:"Light/shadow, open/closed doors, rising/falling, seeds→trees",
    emotional_palette:"Cooler for tension, warmer for resolution, high contrast for conflict",
    pacing_style:"Natural emotional rhythm", avoid:"Generic stock aesthetics, repetitive compositions"
  };
}

function calculatePhaseAllocation(total) {
  const weights = [
    {name:"cold_open",weight:0.10,purpose:"Hook — visceral, immediate, intriguing."},
    {name:"rising_tension",weight:0.25,purpose:"Build the world and problem — escalate stakes."},
    {name:"emotional_core",weight:0.40,purpose:"Heart of the story — maximum emotional impact."},
    {name:"resolution",weight:0.25,purpose:"Deliver the payoff — resolution, transformation."}
  ];
  let remaining = total;
  return weights.map((p,i) => {
    if (i===weights.length-1) return {...p, scenes:Math.max(1,remaining)};
    const scenes = Math.max(1, Math.round(total*p.weight));
    remaining -= scenes;
    return {...p, scenes};
  });
}

function splitScriptByPhase(script, phases) {
  const sentences = script.match(/[^.!?]+[.!?]+[\s]*/g) || [script];
  const total = sentences.length;
  const phaseTotal = phases.reduce((a,b)=>a+b.scenes,0);
  let cursor=0;
  return phases.map((phase,i) => {
    const count = Math.max(1, Math.round(total*(phase.scenes/phaseTotal)));
    const end = i===phases.length-1 ? total : Math.min(cursor+count, total);
    const text = sentences.slice(cursor, end).join("").trim();
    cursor = end;
    return { phase:phase.name, purpose:phase.purpose, scenes:phase.scenes, text };
  }).filter(c => c.text.length > 0);
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const callStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, batch_index, selected_hook } = await req.json();
    const startBatch = batch_index || 0;

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script. Generate script first.' }, { status: 400 });
    }

    const cleanedScript = cleanScriptText(script.full_script);
    let finalScript = cleanedScript;
    if (selected_hook) {
      finalScript = `${selected_hook}. ${cleanedScript.replace(selected_hook, "").trim()}`;
    }

    const wordCount = finalScript.split(/\s+/).filter(w=>w.length>0).length;
    const durationMinutes = project.video_duration_minutes || Math.ceil(wordCount/150);
    const niche = project.niche || 'general';
    const rawStyle = project.visual_style || '';
    const visualStyle = normalizeStyleKey(rawStyle);
    const styleDirective = getStyleCharacterDirective(visualStyle);

    // Scene density scales with video length
    const avgScene = (() => {
      const a=[{m:1,d:4.2},{m:3,d:5.0},{m:5,d:5.5},{m:8,d:6.0},{m:10,d:6.2},{m:15,d:7.0},{m:30,d:8.0},{m:60,d:9.0}];
      if(durationMinutes<=a[0].m) return a[0].d;
      if(durationMinutes>=a[a.length-1].m) return a[a.length-1].d;
      for(let i=0;i<a.length-1;i++){
        if(durationMinutes>=a[i].m&&durationMinutes<=a[i+1].m){
          return a[i].d+(durationMinutes-a[i].m)/(a[i+1].m-a[i].m)*(a[i+1].d-a[i].d);
        }
      }
      return 4.7;
    })();
    const totalTargetScenes = Math.max(8, Math.round((durationMinutes*60)/avgScene));
    const phases = calculatePhaseAllocation(totalTargetScenes);
    const scriptChunks = splitScriptByPhase(finalScript, phases);
    const nicheProfile = getNicheDirectorProfile(niche);

    console.log(`🎯 ${durationMinutes}min → ${totalTargetScenes} scenes (avg ${avgScene.toFixed(1)}s) | ${scriptChunks.length} phases | Style: ${visualStyle||'default'}`);

    // ══════════════════════════════════════════════════════════════
    // BATCH 0: Analysis + ALL phases (single call)
    // BATCH 1+: Resume from specific phase (timeout recovery only)
    // ══════════════════════════════════════════════════════════════

    let storyAnalysis, beatDurations, beatStartTimes;
    let phaseStart = 0;

    if (startBatch === 0) {
      // ── Delete old scenes (parallel batches of 10) ──
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      if (oldScenes.length > 0) {
        for (let i=0; i<oldScenes.length; i+=10) {
          await Promise.all(oldScenes.slice(i,i+10).map(s =>
            base44.asServiceRole.entities.Scenes.delete(s.id).catch(_=>{})
          ));
        }
        console.log(`🗑️ Deleted ${oldScenes.length} old scenes`);
      }

      // ── Story Analysis (1 Gemini call) ──
      const analysisPrompt = `You are a world-class film director. Study this script and respond with JSON.
${styleDirective}

**SCRIPT:**
${finalScript}

**NICHE:** ${niche} | **TOPIC:** ${project.name} | **DURATION:** ~${durationMinutes}min | **SCENES:** ${totalTargetScenes}

Respond with this JSON:
{
  "story_analysis": {
    "central_theme": "The deeper human truth (NOT the topic)",
    "narrative_arc_summary": "2-3 sentence emotional journey",
    "emotional_trajectory": ["curiosity","concern","empathy","hope"],
    "key_turning_points": ["Moment 1","Moment 2","Moment 3"],
    "visual_world": "Specific sensory description of this story's visual universe",
    "recurring_visual_motifs": ["Motif 1","Motif 2","Motif 3"],
    "color_arc": "e.g. cool blues → warm amber → vibrant gold",
    "characters": [{
      "name": "Name/archetype",
      "identity_core": "Casting-sheet: exact age, gender, skin tone shade, face shape, eye color+shape, nose, lips, hair (color/length/style), build+height, 2-3 distinguishing marks",
      "default_clothing": "Typical outfit (can change per scene)",
      "emotional_arc": "How they change emotionally"
    }]
  }
}

NICHE: ${nicheProfile.visual_world} | ${nicheProfile.emotional_palette} | AVOID: ${nicheProfile.avoid}`;

      console.log(`🎬 Story analysis...`);
      const analysis = await callGemini(analysisPrompt, 0.6);
      storyAnalysis = analysis.story_analysis || analysis;

      // ── Beat durations ──
      beatDurations = calculateBeatDurations(phases, durationMinutes);
      beatStartTimes = calculateStartTimes(beatDurations);

      // ── Save to ProductionSettings (no size limit issues) ──
      const saForSave = { ...storyAnalysis };
      delete saForSave.characters;
      const psPayload = {
        beat_durations: JSON.stringify(beatDurations),
        beat_start_times: JSON.stringify(beatStartTimes),
        story_analysis: JSON.stringify(saForSave)
      };
      const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
      if (psList[0]) {
        await base44.asServiceRole.entities.ProductionSettings.update(psList[0].id, psPayload);
      } else {
        await base44.asServiceRole.entities.ProductionSettings.create({ project_id, ...psPayload });
      }

      // ── Tiny flag on scene_blueprint + save characters ──
      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown", current_step: 5,
        scene_blueprint: `{"ready":true,"niche":"${niche}","ts":${totalTargetScenes}}`,
        character_descriptions: storyAnalysis.characters ? JSON.stringify(storyAnalysis.characters) : project.character_descriptions
      });

      console.log(`✓ Analysis: "${(storyAnalysis.central_theme||'').substring(0,60)}" | ${storyAnalysis.characters?.length||0} chars | ${beatDurations.length} beats`);
      phaseStart = 0;

    } else {
      // ── Resume (timeout recovery only) ──
      phaseStart = startBatch - 1;
      if (phaseStart < 0) phaseStart = 0;

      const psList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
      if (!psList[0]?.story_analysis) {
        return Response.json({ error: 'Story analysis not found. Run batch 0 first.' }, { status: 400 });
      }
      storyAnalysis = JSON.parse(psList[0].story_analysis);
      beatDurations = JSON.parse(psList[0].beat_durations || '[]');
      beatStartTimes = JSON.parse(psList[0].beat_start_times || '[]');

      const fp = (await base44.asServiceRole.entities.Projects.filter({ id: project_id }))[0];
      if (fp?.character_descriptions) {
        try { storyAnalysis.characters = JSON.parse(fp.character_descriptions); } catch(_){}
      }
      console.log(`⏩ Resuming from phase ${phaseStart}`);
    }

    // ── Character block for prompts ──
    const characters = storyAnalysis.characters || [];
    const characterBlock = characters.length > 0
      ? `**CHARACTERS:**\n${characters.map(c => `  • ${c.name}: ${c.identity_core||c.visual_description||c.description||''}`).join('\n')}`
      : '';

    // ══════════════════════════════════════════════════════════════
    // PHASE LOOP — all phases in one call (like the original)
    // ══════════════════════════════════════════════════════════════

    let grandTotal = 0;
    const MAX_WALL_MS = 55000; // 55s wall clock limit (leave 5s buffer)

    for (let pi = phaseStart; pi < scriptChunks.length; pi++) {
      // ── Timeout safety valve ──
      const elapsed = Date.now() - callStart;
      if (elapsed > MAX_WALL_MS && pi > phaseStart) {
        console.log(`⏱️ ${(elapsed/1000).toFixed(1)}s elapsed — saving progress`);
        await base44.asServiceRole.entities.Projects.update(project_id, {
          scene_blueprint: `{"ready":true,"niche":"${niche}","ts":${totalTargetScenes},"sc":${grandTotal}}`
        });
        return Response.json({
          success: true, done: false,
          next_batch: pi + 1,
          scenes_created: grandTotal,
          total_target: totalTargetScenes,
          total_batches: scriptChunks.length + 1
        });
      }

      const chunk = scriptChunks[pi];
      const existingScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      const offset = existingScenes.length;

      // ── Continuity from last 3 scenes ──
      const recent = existingScenes.sort((a,b)=>b.scene_number-a.scene_number).slice(0,3).reverse();
      let continuity = '**This is the OPENING — establish the visual world.**';
      if (recent.length > 0) {
        const lines = recent.map(s => {
          let d=null;
          if (s.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
            try{d=JSON.parse(s.image_prompt.substring(15));}catch(_){}
          }
          return `  S${s.scene_number}: [${d?.shot_type||'MS'}] ${(d?.visual_concept||s.narration_text||'').substring(0,80)} | ${d?.mood||''}`;
        });
        continuity = `**LAST ${recent.length} SCENES:**\n${lines.join('\n')}`;
      }

      const phaseBeatDurations = beatDurations.slice(offset, offset+chunk.scenes);

      const prompt = `You are a film director. Break this script segment into exactly ${chunk.scenes} cinematic scenes.
${styleDirective}

**STORY:** ${storyAnalysis.central_theme} | Visual: ${storyAnalysis.visual_world} | Color: ${storyAnalysis.color_arc} | Motifs: ${(storyAnalysis.recurring_visual_motifs||[]).join(', ')}
${characterBlock}
${continuity}

**PHASE: ${chunk.phase.toUpperCase()}** — ${chunk.purpose}
Scenes ${offset+1} to ${offset+chunk.scenes}
${phaseBeatDurations.length>0 ? `Duration targets: [${phaseBeatDurations.map(d=>d.toFixed(1)).join(',')}]s` : ''}

**SCRIPT:**
${chunk.text}

**RULES:**
1. Scenes are VISUAL BEATS, not sentences. Change scene when the visual changes.
2. visual_concept: 2-4 sentences. Environment FIRST, then character ACTION, then atmosphere. NEVER describe text/screens/documents/dollar amounts on any surface.
3. Shot variety: NEVER same shot type consecutively. Cycle WS/EWS/MWS/MS/LOW/HIGH/OTS/MCU/CU/POV/DUTCH.
4. ALWAYS name specific objects from the narration (cellphone, laptop, bill, receipt, letter, etc.) as PROPS in the scene — "clutching her cellphone", "staring at the overdue bill". But NEVER describe what's ON the screen/paper/document — no text, no UI, no dollar amounts, no app names.
5. Abstract concepts → PHYSICAL METAPHORS. Use the EXACT nouns from the script (not vague substitutes).
6. Characters must be IN a detailed environment doing an ACTION — never isolated against blank/blurred background.
7. Adjacent scenes share a CONTINUITY element (shared prop, color shift, gesture echo).
8. NICHE: ${nicheProfile.visual_world} | ${nicheProfile.emotional_palette} | AVOID: ${nicheProfile.avoid}

**RESPONSE:** {"scenes":[{"scene_number":${offset+1},"narration_text":"EXACT script words","visual_concept":"Rich cinematic description","shot_type":"e.g. WS — Wide Shot","camera_angle":"","camera_movement":"","lighting":"","color_palette":"","mood":"2-3 words","depth_of_field":"","continuity_bridge":"visual thread to next scene","emotional_intensity":0.5,"duration_seconds":5}]}`;

      console.log(`🎬 Phase ${pi+1}/${scriptChunks.length}: ${chunk.phase} — scenes ${offset+1}-${offset+chunk.scenes}`);
      const result = await callGemini(prompt, 0.7);

      let created = 0;
      if (result.scenes && Array.isArray(result.scenes)) {
        for (const scene of result.scenes) {
          const num = offset + created + 1;
          const dur = beatDurations[num-1] || scene.duration_seconds || 5;

          const notes = {
            visual_concept: scene.visual_concept, shot_type: scene.shot_type,
            camera_angle: scene.camera_angle, camera_movement: scene.camera_movement,
            lighting: scene.lighting, color_palette: scene.color_palette,
            mood: scene.mood, depth_of_field: scene.depth_of_field,
            continuity_bridge: scene.continuity_bridge,
            emotional_intensity: scene.emotional_intensity || 0.5,
            phase: chunk.phase
          };

          await base44.asServiceRole.entities.Scenes.create({
            project_id, scene_number: num,
            narration_text: cleanNarrationText(scene.narration_text),
            image_prompt: `DIRECTOR_NOTES:${JSON.stringify(notes)}`,
            animation_prompt: "",
            duration_seconds: dur,
            status: "breakdown_ready"
          });
          created++;
        }
      }

      grandTotal += created;
      console.log(`✓ ${chunk.phase}: ${created} scenes (total: ${grandTotal}/${totalTargetScenes}) [${((Date.now()-callStart)/1000).toFixed(1)}s]`);
    }

    // ── All phases done ──
    await base44.asServiceRole.entities.Projects.update(project_id, {
      status: "breakdown_complete", current_step: 5,
      scene_blueprint: `{"ready":true,"niche":"${niche}","ts":${totalTargetScenes},"sc":${grandTotal}}`
    });

    console.log(`🎉 COMPLETE — ${grandTotal} scenes in ${((Date.now()-callStart)/1000).toFixed(1)}s`);

    return Response.json({
      success: true, done: true,
      scenes_created: grandTotal,
      total_scenes: grandTotal,
      total_target: totalTargetScenes,
      total_batches: scriptChunks.length + 1,
      beat_durations: beatDurations,
      beat_start_times: beatStartTimes
    });

  } catch (error) {
    console.error("❌ generateSceneBreakdown error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});