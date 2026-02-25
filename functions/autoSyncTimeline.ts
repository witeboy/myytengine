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

    // Analyze narration texts for word counts
    const narrationTexts = scenes.map(s => ({
      scene_number: s.scene_number,
      narration: s.narration_text || '',
      word_count: (s.narration_text || '').split(/\s+/).filter(Boolean).length,
    }));

    const totalWords = narrationTexts.reduce((sum, s) => sum + s.word_count, 0);
    let sceneDurations;

    if (totalWords > 0 && scenes.length <= 40) {
      // For smaller projects, use LLM for intelligent distribution
      const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are a professional video editor analyzing narration timing.

Total voiceover duration: ${totalVoDuration} seconds
Total scenes: ${scenes.length}

Scenes:
${narrationTexts.map(s => `S${s.scene_number} (${s.word_count} words): "${s.narration.substring(0, 150)}"`).join('\n')}

Distribute ${totalVoDuration}s across ${scenes.length} scenes. Rules:
- Min 3s per scene
- More words = longer duration
- Sum must equal ${totalVoDuration}s (rounded to 0.1)`,
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
                }
              }
            }
          }
        }
      });

      if (result?.scenes && result.scenes.length === scenes.length) {
        sceneDurations = result.scenes;
      } else {
        sceneDurations = null; // fall through to proportional
      }
    }

    // Proportional word-count distribution (for large projects or LLM fallback)
    if (!sceneDurations) {
      if (totalWords > 0) {
        const minDuration = 3;
        const reservedTime = minDuration * scenes.length;
        const distributableTime = Math.max(0, totalVoDuration - reservedTime);

        sceneDurations = narrationTexts.map(s => ({
          scene_number: s.scene_number,
          duration_seconds: Math.round((minDuration + (s.word_count / totalWords) * distributableTime) * 10) / 10,
        }));
      } else {
        const perScene = Math.round((totalVoDuration / scenes.length) * 10) / 10;
        sceneDurations = scenes.map(s => ({
          scene_number: s.scene_number,
          duration_seconds: perScene,
        }));
      }
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

    // Update scenes sequentially to avoid rate limits
    let updated = 0;
    for (let i = 0; i < sceneDurations.length; i++) {
      const sd = sceneDurations[i];
      const scene = scenes.find(s => s.scene_number === sd.scene_number);
      if (!scene) continue;
      
      // Retry with exponential backoff on rate limit
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await base44.asServiceRole.entities.Scenes.update(scene.id, { 
            duration_seconds: sd.duration_seconds 
          });
          updated++;
          break;
        } catch (err) {
          if ((err.message?.includes('Rate limit') || err.message?.includes('429')) && attempt < 4) {
            const wait = 3000 * Math.pow(2, attempt); // 3s, 6s, 12s, 24s
            console.log(`Rate limited on scene ${sd.scene_number}, waiting ${wait}ms (attempt ${attempt + 1})`);
            await new Promise(r => setTimeout(r, wait));
          } else {
            throw err;
          }
        }
      }
      
      // Throttle: pause after every single update to stay well under rate limits
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log(`Updated ${updated} scenes`);

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