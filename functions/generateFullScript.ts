import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// This function MERGES already-generated batch content into a full script.
// It does NOT call Gemini. No tokens consumed.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    // Fetch project
    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    // Fetch topic
    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    // Fetch completed batches
    const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const batches = allBatches
      .sort((a, b) => a.batch_number - b.batch_number)
      .filter(b => b.status === 'completed' && b.content);

    if (!batches.length) {
      return Response.json({ error: 'No completed batches found to merge.' }, { status: 400 });
    }

    // Merge all batch content and aggressively strip any non-narration content
    let fullScript = batches.map(b => b.content).join("\n\n");
    // Remove all bracketed tags
    fullScript = fullScript.replace(/\[[^\]]*\]/gi, '');
    // Remove **VISUAL:** / **AUDIO:** / **MUSIC:** etc. lines
    fullScript = fullScript.replace(/\*\*(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|NOTE|DIRECTION|CAMERA|IMAGE)[:\s]?\*\*[^\n]*/gi, '');
    // Remove standalone direction lines without bold markers
    fullScript = fullScript.replace(/^(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|CAMERA)\s*:.*$/gim, '');
    // Remove timestamp patterns like (0:00-2:00)
    fullScript = fullScript.replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '');
    // Remove "Narrator:", "VO:" labels
    fullScript = fullScript.replace(/^(Narrator|VO|Voiceover)\s*:\s*/gim, '');
    // Remove bold markdown headers like **Act 1:** or **Opening:**
    fullScript = fullScript.replace(/^\*\*[^*]+\*\*:?\s*$/gim, '');
    // Clean up extra blank lines
    fullScript = fullScript.replace(/\n{3,}/g, '\n\n').trim();

    // ── DEDUPLICATION: Remove repeated sentences ──
    const sentences = fullScript.match(/[^.!?]+[.!?]+/g) || [];
    const seen = new Set();
    const uniqueSentences = [];
    for (const sentence of sentences) {
      const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
      if (normalized.length < 15) { // keep very short sentences even if "duplicated"
        uniqueSentences.push(sentence);
        continue;
      }
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueSentences.push(sentence);
      } else {
        console.log('Removed duplicate sentence:', normalized.substring(0, 60) + '...');
      }
    }
    fullScript = uniqueSentences.join(' ').replace(/\n{3,}/g, '\n\n').trim();
    const totalWords = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedDuration = Math.round((totalWords / 150) * 60);

        // 1. Find if we already made a "Final" version before (to avoid duplicates)
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const existingFinal = oldScripts.find(s => s.version === 'final_aggregated');

    let script;
    if (existingFinal) {
      // 2. If it exists, update it with the new merged content
      await base44.asServiceRole.entities.Scripts.update(existingFinal.id, {
        full_script: fullScript.trim(),
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration,
        title: topic?.title || project.name,
      });
      script = { ...existingFinal, id: existingFinal.id };
    } else {
      // 3. If it doesn't exist, create it for the first time
      script = await base44.asServiceRole.entities.Scripts.create({
        project_id,
        topic_id: project.selected_topic_id,
        version: "final_aggregated", // <--- THE SECRET CODE FOR THE FRONTEND
        title: topic?.title || project.name,
        full_script: fullScript.trim(),
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration
      });
    }

    // 4. Tell the project it is officially ready
    await base44.asServiceRole.entities.Projects.update(project_id, {
      script_id: script.id,
      status: "script_complete",
      current_step: 4
    });


    return Response.json({
      success: true,
      script_id: script.id,
      total_words: totalWords,
      estimated_duration_sec: estimatedDuration
    });
  } catch (error) {
    console.error("generateFullScript (merge) error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});