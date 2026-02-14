import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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

    // Merge all batch content
    const fullScript = batches.map(b => b.content).join("\n\n");
    const totalWords = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedDuration = Math.round((totalWords / 150) * 60);

    // Delete old scripts for this project
    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    for (const s of oldScripts) {
      await base44.asServiceRole.entities.Scripts.delete(s.id);
    }

    // Create merged script record
    const script = await base44.asServiceRole.entities.Scripts.create({
      project_id,
      topic_id: project.selected_topic_id,
      version: "draft",
      title: topic?.title || project.name,
      full_script: fullScript.trim(),
      word_count: totalWords,
      estimated_duration_sec: estimatedDuration
    });

    // Update project
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