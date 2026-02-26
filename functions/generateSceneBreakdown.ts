import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// CINEMATIC SCENE BREAKDOWN ENGINE (PRO VERSION)
// ══════════════════════════════════════════════════════════════════

/**
 * Communicates with Gemini with built-in JSON recovery.
 */
async function callGemini(prompt, temperature = 0.7) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  
  // Implementation of exponential backoff for reliability
  let retries = 0;
  const maxRetries = 5;
  
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
        throw new Error(`Gemini status: ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      return JSON.parse(rawText);
    } catch (e) {
      retries++;
      if (retries === maxRetries) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, retries) * 1000));
    }
  }
}

// ── Text Cleaning Helpers ──────────────────────────────────────────

function cleanScriptText(text) {
  if (!text) return "";
  return text
    .replace(/\[[^\]]*\]/gi, '') // Remove brackets
    .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE|V\.?O\.?)\s*:\s*/gim, '')
    .replace(/\([^)]*\)/gi, '') // Remove parentheses (directorial notes)
    .replace(/\*/g, '') // Remove markdown bold/italic
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanNarrationText(text) {
  if (!text) return "";
  return text
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

// ── Visual Style Overrides ────────────────────────────────────────

function getStyleCharacterDirective(visualStyle) {
  const directives = {
    skeleton_protagonist: `
**🦴 MANDATORY CHARACTER OVERRIDE — SKELETON PROTAGONIST STYLE:**
The MAIN CHARACTER in EVERY scene is a photorealistic transparent skeleton with:
- A clear glass-like semi-transparent humanoid body shell.
- Glossy ivory bones visible through the torso.
- Big round expressive amber eyes in the skull sockets.
- The skeleton is the RELATABLE HERO, not scary or horror.
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

    // Fetch project and script
    const [project] = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) return Response.json({ error: 'No script found' }, { status: 400 });

    const finalScript = selected_hook ? `${selected_hook}. ${cleanScriptText(script.full_script).replace(selected_hook, "")}` : cleanScriptText(script.full_script);
    
    // Setup calculations
    const totalTargetScenes = Math.max(8, Math.round(((project.video_duration_minutes || 1) * 60) / 8));
    const phases = calculatePhaseAllocation(totalTargetScenes);
    const scriptChunks = splitScriptByPhase(finalScript, phases);

    // ── BATCH 0: STORY ANALYSIS (The Brain) ───────────────────────
    if (currentBatch === 0) {
      console.log("🎬 STARTING: Analyzing Story...");
      
      // Cleanup old scenes
      const oldScenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
      for (const s of oldScenes) await base44.asServiceRole.entities.Scenes.delete(s.id);

      const nicheProfile = getNicheDirectorProfile(project.niche);
      const styleDirective = getStyleCharacterDirective(project.visual_style);

      const analysisPrompt = `Analyze this script for a film director: ${finalScript}. Niche: ${project.niche}. 
      Respond with JSON: { "story_analysis": { "central_theme": "...", "characters": [{"name": "...", "visual_description": "..."}], "visual_world": "...", "recurring_visual_motifs": [], "color_arc": "..." } }`;

      const analysis = await callGemini(analysisPrompt, 0.6);
      const storyAnalysis = analysis.story_analysis || analysis;

      const blueprint = {
        story_analysis: storyAnalysis,
        phases: phases,
        total_target_scenes: totalTargetScenes,
        niche_profile: nicheProfile,
        scenes: []
      };

      await base44.asServiceRole.entities.Projects.update(project_id, {
        status: "scene_breakdown",
        scene_blueprint: JSON.stringify(blueprint),
        character_descriptions: JSON.stringify(storyAnalysis.characters || [])
      });

      return Response.json({ success: true, next_batch: 1, total_batches: scriptChunks.length });
    }

    // ── BATCH 1+: SCENE BUILDING (The Execution) ──────────────────
    
    // FIX: Retry logic to handle the "Blueprint not found" error
    let blueprint;
    let retries = 0;
    while (retries < 3) {
      const [latestProject] = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
      if (latestProject?.scene_blueprint) {
        blueprint = JSON.parse(latestProject.scene_blueprint);
        break;
      }
      console.log("⏳ Blueprint not ready, waiting 1 second...");
      await new Promise(r => setTimeout(r, 1000));
      retries++;
    }

    if (!blueprint) throw new Error("Scene blueprint still missing after retries. Try waiting a moment.");

    const currentChunk = scriptChunks[currentBatch];
    if (!currentChunk) return Response.json({ success: true, done: true });

    const sceneOffset = (await base44.asServiceRole.entities.Scenes.filter({ project_id })).length;
    
    const breakdownPrompt = `Create exactly ${currentChunk.scenes} cinematic scenes for: "${currentChunk.text}". 
    Theme: ${blueprint.story_analysis.central_theme}. World: ${blueprint.story_analysis.visual_world}. 
    Respond with JSON: { "scenes": [{ "scene_number": ${sceneOffset + 1}, "narration_text": "...", "visual_concept": "...", "shot_type": "...", "mood": "..." }] }`;

    const result = await callGemini(breakdownPrompt, 0.7);

    if (result.scenes) {
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

    // Save progress back to blueprint
    const isDone = currentBatch >= scriptChunks.length - 1;
    await base44.asServiceRole.entities.Projects.update(project_id, {
      scene_blueprint: JSON.stringify(blueprint),
      status: isDone ? "breakdown_complete" : "scene_breakdown"
    });

    return Response.json({ success: true, done: isDone, current_batch: currentBatch });

  } catch (error) {
    console.error("❌ Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});