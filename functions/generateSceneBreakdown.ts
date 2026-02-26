import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE (PRO VERSION)
// ══════════════════════════════════════════════════════════════════

/**
 * Communicates with Gemini with built-in JSON recovery.
 */
async function callGemini(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  let retries = 0;
  const maxRetries = 3; // Reduced for faster failure feedback
  
  while (retries < maxRetries) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
              temperature, 
              maxOutputTokens: 16384, 
              responseMimeType: "application/json" 
            }
          })
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini status: ${response.status} - ${errBody}`);
      }

      const data = await response.json();
      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error("Gemini returned an empty response.");
      }

      let rawText = data.candidates[0].content.parts[0].text;
      
      // JSON RECOVERY: Remove markdown code blocks if present
      rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

      try {
        return JSON.parse(rawText);
      } catch (parseErr) {
        console.error("JSON Parse failed. Raw text snippet:", rawText.substring(0, 100));
        throw new Error("AI returned invalid JSON format.");
      }
    } catch (e) {
      retries++;
      console.warn(`⚠️ Gemini attempt ${retries} failed: ${e.message}`);
      if (retries === maxRetries) throw e;
      await new Promise(r => setTimeout(r, 2000)); // Fixed 2s wait for retries
    }
  }
}

// ── Text Cleaning Helpers ──────────────────────────────────────────

function cleanScriptText(text) {
  if (!text) return "";
  return text
    .replace(/\[[^\]]*\]/gi, '') 
    .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '')
    .replace(/\([^)]*\)/gi, '') 
    .replace(/\*/g, '') 
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanNarrationText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, ' ').trim();
}

// ── Visual Style Overrides ────────────────────────────────────────

function getStyleCharacterDirective(visualStyle) {
  const directives = {
    skeleton_protagonist: `
**MANDATORY STYLE OVERRIDE:**
The protagonist is a photorealistic transparent skeleton with glossy ivory bones inside a glass-like humanoid shell and expressive amber eyes.
`
  };
  return directives[visualStyle] || '';
}

// ── Niche Profiles ────────────────────────────────────────────────

function getNicheDirectorProfile(niche) {
  const profiles = {
    finance: { visual_world: "Corporate glass towers vs intimate tables", signature_shots: "Overhead views, tight hands", metaphor_language: "Weight, lightness, bridges", emotional_palette: "Blues to ambers", avoid: "Cliché flying money" },
    retirement: { visual_world: "Golden-hour suburbs, family homes", signature_shots: "Slow pans across photos", metaphor_language: "Seasons, paths", emotional_palette: "Warm honey tones", avoid: "Clinical settings" },
    motivation: { visual_world: "Mountain peaks, pre-dawn cities", signature_shots: "Hero low-angles, tracking shots", metaphor_language: "Ascent, chains breaking", emotional_palette: "Fiery oranges", avoid: "Cheesy posing" },
    horror: { visual_world: "Liminal spaces, lit corridors", signature_shots: "Dutch angles, POV approach", metaphor_language: "Decay, reflections", emotional_palette: "Sickly greens", avoid: "Cheap jump scares" },
    technology: { visual_world: "Labs, circuit patterns", signature_shots: "Macro lens details", metaphor_language: "Networks, light through fiber", emotional_palette: "Electric blues", avoid: "Matrix code rain" },
    health: { visual_world: "Body as landscape, nature as pharmacy", signature_shots: "Macro beauty shots", metaphor_language: "Growth, nourishment", emotional_palette: "Fresh greens", avoid: "Clinical imagery" },
    crime: { visual_world: "Rain-slicked streets", signature_shots: "Noir lighting, over-shoulder", metaphor_language: "Masks, threads", emotional_palette: "Deep blues, reds", avoid: "Gratuitous violence" }
  };
  return profiles[niche?.toLowerCase()] || { visual_world: "General cinematic environments", signature_shots: "Variety of angles", metaphor_language: "Universal symbols", emotional_palette: "Story-driven colors", avoid: "Generic stock looks" };
}

// ── Phase Management ──────────────────────────────────────────────

function calculatePhaseAllocation(totalTargetScenes) {
  const weights = [
    { name: "cold_open", weight: 0.10, purpose: "Hook the viewer immediately." },
    { name: "rising_tension", weight: 0.25, purpose: "Build the problem and stakes." },
    { name: "emotional_core", weight: 0.40, purpose: "Maximum emotional impact." },
    { name: "resolution", weight: 0.25, purpose: "The payoff and call to action." }
  ];
  let remaining = totalTargetScenes;
  return weights.map((p, i) => {
    const scenes = i === weights.length - 1 ? remaining : Math.max(1, Math.round(totalTargetScenes * p.weight));
    remaining -= scenes;
    return { ...p, scenes };
  });
}

function splitScriptByPhase(script, phases) {
  const sentences = script.match(/[^.!?]+[.!?]+[\s]*/g) || [script];
  const totalPhaseScenes = phases.reduce((a, b) => a + b.scenes, 0);
  let cursor = 0;
  const chunks = [];

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const sentenceCount = Math.max(1, Math.round(sentences.length * (phase.scenes / totalPhaseScenes)));
    const segment = sentences.slice(cursor, i === phases.length - 1 ? sentences.length : cursor + sentenceCount).join("").trim();
    chunks.push({ phase: phase.name, purpose: phase.purpose, scenes: phase.scenes, text: segment });
    cursor += sentenceCount;
  }
  return chunks;
}

// ══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, batch_index, selected_hook } = await req.json();
    const currentBatch = batch_index || 0;

    const [project] = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) return Response.json({ error: 'No script found' }, { status: 400 });

    const cleanedScript = cleanScriptText(script.full_script);
    const finalScript = selected_hook ? `${selected_hook}. ${cleanedScript.replace(selected_hook, "")}` : cleanedScript;
    
    const totalTargetScenes = Math.max(8, Math.round(((project.video_duration_minutes || 1) * 60) / 8));
    const phases = calculatePhaseAllocation(totalTargetScenes);
    const scriptChunks = splitScriptByPhase(finalScript, phases);

    // ── BATCH 0: STORY ANALYSIS (The Brain) ───────────────────────
    if (currentBatch === 0) {
      console.log("🎬 STEP 1: Cleaning up previous scenes...");
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      if (oldScenes.length > 0) {
        console.log(`🗑️ Deleting ${oldScenes.length} existing scenes...`);
        for (const s of oldScenes) await base44.asServiceRole.entities.Scenes.delete(s.id);
      }

      console.log("🎬 STEP 2: Requesting Story Analysis from Gemini...");
      const nicheProfile = getNicheDirectorProfile(project.niche);
      const styleDirective = getStyleCharacterDirective(project.visual_style);

      const analysisPrompt = `
        You are a film director. Analyze this script: "${finalScript}".
        Niche: ${project.niche}. 
        Niche Style: ${nicheProfile.visual_world}.
        ${styleDirective}

        Respond ONLY with a JSON object:
        { 
          "story_analysis": { 
            "central_theme": "The core truth", 
            "characters": [{"name": "name", "visual_description": "detailed look"}], 
            "visual_world": "textures and lighting", 
            "recurring_visual_motifs": ["motif1"], 
            "color_arc": "how colors change" 
          } 
        }
      `;

      const analysis = await callGemini(analysisPrompt, 0.6);
      console.log("🎬 STEP 3: Analysis received, saving blueprint...");

      const blueprint = {
        story_analysis: analysis.story_analysis || analysis,
        phases: phases,
        total_target_scenes: totalTargetScenes,
        niche_profile: nicheProfile,
        scenes: []
      };

      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown",
        scene_blueprint: JSON.stringify(blueprint),
        character_descriptions: JSON.stringify(blueprint.story_analysis.characters || [])
      });

      console.log("✅ Batch 0 complete.");
      return Response.json({ success: true, next_batch: 1, total_batches: scriptChunks.length });
    }

    // ── BATCH 1+: SCENE BUILDING (The Execution) ──────────────────
    console.log(`🎬 BATCH ${currentBatch}: Loading blueprint...`);
    
    let blueprint;
    let fetchRetries = 0;
    while (fetchRetries < 5) {
      const [latest] = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
      if (latest?.scene_blueprint) {
        blueprint = JSON.parse(latest.scene_blueprint);
        break;
      }
      console.log(`⏳ Blueprint not ready (attempt ${fetchRetries + 1}), waiting...`);
      await new Promise(r => setTimeout(r, 1500));
      fetchRetries++;
    }

    if (!blueprint) throw new Error("Database sync error: Scene blueprint not found.");

    const currentChunk = scriptChunks[currentBatch];
    const sceneOffset = (await base44.asServiceRole.entities.Scenes.filter({ project_id })).length;
    
    console.log(`🎬 BATCH ${currentBatch}: Generating ${currentChunk.scenes} scenes...`);

    const breakdownPrompt = `
      Create exactly ${currentChunk.scenes} cinematic scenes for this script segment: "${currentChunk.text}".
      Director Analysis: ${blueprint.story_analysis.central_theme}.
      Visual World: ${blueprint.story_analysis.visual_world}.
      
      Return JSON: { "scenes": [{ "scene_number": ${sceneOffset + 1}, "narration_text": "text from segment", "visual_concept": "detailed cinematic view", "shot_type": "CU/MCU/WS", "mood": "feeling" }] }
    `;

    const result = await callGemini(breakdownPrompt, 0.7);

    if (result.scenes) {
      console.log(`🎬 BATCH ${currentBatch}: Saving ${result.scenes.length} scenes to database...`);
      for (const scene of result.scenes) {
        await base44.asServiceRole.entities.Scenes.create({
          project_id,
          scene_number: scene.scene_number,
          narration_text: cleanNarrationText(scene.narration_text),
          status: "breakdown_ready",
          duration_seconds: 8
        });
        blueprint.scenes.push(scene);
      }
    }

    const isDone = currentBatch >= scriptChunks.length - 1;
    await base44.asServiceRole.entities.Projects.update(project_id, {
      scene_blueprint: JSON.stringify(blueprint),
      status: isDone ? "breakdown_complete" : "scene_breakdown"
    });

    console.log(`✅ Batch ${currentBatch} complete.`);
    return Response.json({ success: true, done: isDone, current_batch: currentBatch });

  } catch (error) {
    console.error("❌ Fatal Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});