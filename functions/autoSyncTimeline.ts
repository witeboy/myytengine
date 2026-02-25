import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // Fetch project, scenes, production settings
    const [projects, allScenes, prodSettings] = await Promise.all([
      base44.entities.Projects.filter({ id: project_id }),
      base44.entities.Scenes.filter({ project_id }),
      base44.entities.ProductionSettings.filter({ project_id }),
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const scenes = allScenes.sort((a, b) => a.scene_number - b.scene_number);
    if (scenes.length === 0) return Response.json({ error: 'No scenes found' }, { status: 400 });

    const voiceoverUrl = prodSettings[0]?.voiceover_url;
    const totalVoDuration = prodSettings[0]?.total_duration_seconds || 0;

    if (!voiceoverUrl || totalVoDuration <= 0) {
      return Response.json({ error: 'No voiceover audio found. Generate voiceover first.' }, { status: 400 });
    }

    console.log(`Auto-sync: ${scenes.length} scenes, VO duration: ${totalVoDuration}s`);

    // Use LLM to analyze narration texts and estimate relative durations
    const narrationTexts = scenes.map(s => ({
      scene_number: s.scene_number,
      narration: s.narration_text || '',
      word_count: (s.narration_text || '').split(/\s+/).filter(Boolean).length,
    }));

    const totalWords = narrationTexts.reduce((sum, s) => sum + s.word_count, 0);

    // If we have narration texts, use word count proportional distribution
    // with LLM refinement for pauses and emphasis
    let sceneDurations;

    if (totalWords > 0) {
      // Use LLM to intelligently distribute timing based on narration content
      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a professional video editor analyzing narration timing for a video.

Total voiceover duration: ${totalVoDuration} seconds
Total scenes: ${scenes.length}

Here are the scenes with their narration text:
${narrationTexts.map(s => `Scene ${s.scene_number} (${s.word_count} words): "${s.narration.substring(0, 200)}"`).join('\n')}

Distribute the total ${totalVoDuration} seconds across these ${scenes.length} scenes.

Rules:
- Each scene must be at least 3 seconds
- Scenes with more words should generally be longer
- Dramatic/emotional scenes need slightly more time for pauses
- Opening hooks and closing scenes may need extra beat time
- All durations must add up to exactly ${totalVoDuration} seconds (rounded to 1 decimal)
- Consider natural speech pauses between scenes (~0.5-1s buffer per scene transition)

Return JSON with the durations.`,
        response_json_schema: {
          type: "object",
          properties: {
            scenes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  scene_number: { type: "number" },
                  duration_seconds: { type: "number" },
                  reason: { type: "string" },
                }
              }
            }
          }
        }
      });

      if (result?.scenes && result.scenes.length === scenes.length) {
        sceneDurations = result.scenes;
      } else {
        // Fallback: proportional word count distribution
        sceneDurations = narrationTexts.map(s => ({
          scene_number: s.scene_number,
          duration_seconds: totalWords > 0 
            ? Math.max(3, Math.round((s.word_count / totalWords) * totalVoDuration * 10) / 10)
            : totalVoDuration / scenes.length,
        }));
      }
    } else {
      // No narration — distribute evenly
      const perScene = Math.round((totalVoDuration / scenes.length) * 10) / 10;
      sceneDurations = scenes.map(s => ({
        scene_number: s.scene_number,
        duration_seconds: perScene,
      }));
    }

    // Normalize durations to match total VO duration exactly
    const rawTotal = sceneDurations.reduce((sum, s) => sum + s.duration_seconds, 0);
    const scale = totalVoDuration / rawTotal;
    sceneDurations = sceneDurations.map(s => ({
      ...s,
      duration_seconds: Math.max(3, Math.round(s.duration_seconds * scale * 10) / 10),
    }));

    // Final adjustment to match exactly
    const adjustedTotal = sceneDurations.reduce((sum, s) => sum + s.duration_seconds, 0);
    const diff = totalVoDuration - adjustedTotal;
    if (Math.abs(diff) > 0.05) {
      // Add/subtract the difference from the longest scene
      const longestIdx = sceneDurations.reduce((mi, s, i, arr) => s.duration_seconds > arr[mi].duration_seconds ? i : mi, 0);
      sceneDurations[longestIdx].duration_seconds = Math.round((sceneDurations[longestIdx].duration_seconds + diff) * 10) / 10;
    }

    // Update scenes in database
    const updates = [];
    for (const sd of sceneDurations) {
      const scene = scenes.find(s => s.scene_number === sd.scene_number);
      if (scene) {
        updates.push(
          base44.asServiceRole.entities.Scenes.update(scene.id, { 
            duration_seconds: sd.duration_seconds 
          })
        );
      }
    }
    await Promise.all(updates);

    console.log('Auto-sync complete. Durations:', sceneDurations.map(s => `S${s.scene_number}:${s.duration_seconds}s`).join(', '));

    return Response.json({
      success: true,
      total_duration: totalVoDuration,
      scene_durations: sceneDurations,
    });

  } catch (error) {
    console.error('autoSyncTimeline error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});