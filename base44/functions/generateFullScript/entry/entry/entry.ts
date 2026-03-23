import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Merges completed script batches into a single final script record.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();

    const projects = await base44.asServiceRole.entities.Projects.filter({ id: project_id });
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    let topic = null;
    if (project.selected_topic_id) {
      const topics = await base44.asServiceRole.entities.Topics.filter({ id: project.selected_topic_id });
      topic = topics[0];
    }

    const allBatches = await base44.asServiceRole.entities.ScriptBatches.filter({ project_id });
    const batches = allBatches
      .sort((a, b) => a.batch_number - b.batch_number)
      .filter(b => b.status === 'completed' && b.content);

    if (!batches.length) {
      return Response.json({ error: 'No completed batches found to merge.' }, { status: 400 });
    }

    const isSleep = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';

    let fullScript = batches.map(b => b.content).join("\n\n");

    if (isSleep) {
      fullScript = fullScript.replace(/\[(VISUAL|SCENE|CUT TO|CAMERA|B-ROLL|MONTAGE|SHOT|EFFECT|SFX|MUSIC|AUDIO|TRANSITION)[^\]]*\]/gi, '');
      fullScript = fullScript.replace(/^(Narrator|VO|Voiceover)\s*:\s*/gim, '');
      fullScript = fullScript.replace(/^\*\*[^*]+\*\*:?\s*$/gim, '');
      fullScript = fullScript.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
      fullScript = fullScript.replace(/  +/g, ' ');
      fullScript = fullScript.replace(/\n{3,}/g, '\n\n').trim();
      console.log('[generateFullScript] Sleep mode — preserving pause markers, no dedup');
    } else {
      fullScript = fullScript.replace(/\[[^\]]*\]/gi, '');
      fullScript = fullScript.replace(/\([^)]*\)/g, '');
      fullScript = fullScript.replace(/\*\*(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|NOTE|DIRECTION|CAMERA|IMAGE|B-ROLL|MONTAGE|SCENE|SHOT|EFFECT)[:\s]?\*\*[^\n]*/gi, '');
      fullScript = fullScript.replace(/^(VISUAL|AUDIO|MUSIC|SOUND|SFX|TRANSITION|CUT TO|FADE|CAMERA|B-ROLL|MONTAGE|SCENE|SHOT|EFFECT)\s*:.*$/gim, '');
      fullScript = fullScript.replace(/^(Cut to|Fade to|Fade in|Fade out|Dissolve to|Smash cut|Jump cut|Transition to|Pan to|Zoom in|Zoom out|Close[- ]up|Wide shot|Medium shot)\b.*$/gim, '');
      fullScript = fullScript.replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '');
      fullScript = fullScript.replace(/^(Narrator|VO|Voiceover)\s*:\s*/gim, '');
      fullScript = fullScript.replace(/^\*\*[^*]+\*\*:?\s*$/gim, '');
      fullScript = fullScript.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
      fullScript = fullScript.replace(/  +/g, ' ');
      fullScript = fullScript.replace(/\n{3,}/g, '\n\n').trim();

      const sentences = fullScript.match(/[^.!?]+[.!?]+/g) || [];
      const seen = new Set();
      const uniqueSentences = [];
      for (const sentence of sentences) {
        const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
        if (normalized.length < 15) {
          uniqueSentences.push(sentence);
          continue;
        }
        if (!seen.has(normalized)) {
          seen.add(normalized);
          uniqueSentences.push(sentence);
        }
      }
      fullScript = uniqueSentences.join(' ').replace(/\n{3,}/g, '\n\n').trim();
    }

    const totalWords = fullScript.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedDuration = Math.round((totalWords / 150) * 60);

    const oldScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const existingFinal = oldScripts.find(s => s.version === 'final_aggregated');

    let script;
    if (existingFinal) {
      await base44.asServiceRole.entities.Scripts.update(existingFinal.id, {
        full_script: fullScript.trim(),
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration,
        title: topic?.title || project.name,
      });
      script = { ...existingFinal, id: existingFinal.id };
    } else {
      script = await base44.asServiceRole.entities.Scripts.create({
        project_id,
        topic_id: project.selected_topic_id,
        version: "final_aggregated",
        title: topic?.title || project.name,
        full_script: fullScript.trim(),
        word_count: totalWords,
        estimated_duration_sec: estimatedDuration,
      });
    }

    await base44.asServiceRole.entities.Projects.update(project_id, {
      script_id: script.id,
      status: "script_complete",
      current_step: 4,
    });

    console.log(`[generateFullScript] Merged ${batches.length} batches → ${totalWords} words`);

    return Response.json({
      success: true,
      script_id: script.id,
      total_words: totalWords,
      estimated_duration_sec: estimatedDuration,
    });
  } catch (error) {
    console.error("generateFullScript error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});