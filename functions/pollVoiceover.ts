import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER POLLER — Single poll check, no loops
// Called repeatedly from frontend every 6s until 'ready' or 'failed'
// When done: saves AI33 audio URL directly (no R2 re-upload)
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');

    // Get current settings
    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settings = settingsList[0];
    if (!settings) return Response.json({ status: 'no_settings' });

    // Already done?
    if ((settings.voiceover_status === 'ready' || settings.voiceover_status === 'completed') && settings.voiceover_url) {
      return Response.json({ status: 'ready', voiceover_url: settings.voiceover_url });
    }

    const taskId = settings.generation_task_id;
    if (!taskId) {
      return Response.json({ status: 'no_task', message: 'No generation task found' });
    }

    // Single poll to AI33 — no loops
    const pollRes = await fetch(`https://api.ai33.pro/v1/task/${taskId}`, {
      headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
    });

    if (!pollRes.ok) {
      console.log(`AI33 poll returned ${pollRes.status}`);
      return Response.json({ status: 'generating', message: `AI33 returned ${pollRes.status}` });
    }

    const pollData = await pollRes.json();
    console.log(`🎙 Poll task ${taskId}: status=${pollData.status}`);

    if (pollData.status === 'done') {
      const audioUrl = pollData.metadata?.audio_url;
      if (!audioUrl) {
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
        return Response.json({ status: 'failed', error: 'Task done but no audio_url returned' });
      }

      // Use the AI33 audio URL directly — no R2 re-upload needed
      // Estimate duration from word count (more reliable than byte-based guess)
      const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
      const script = scripts.find(s => s.version === 'final_aggregated');
      const wordCount = script?.word_count || (script?.full_script || '').split(/\s+/).length;
      const estimatedDuration = Math.round(wordCount / 2.5); // ~2.5 words/sec

      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        voiceover_status: 'ready',
        voiceover_url: audioUrl,
        total_duration_seconds: estimatedDuration,
      });

      await base44.asServiceRole.entities.Projects.update(project_id, { status: 'voiceover_ready' });

      console.log(`✅ Voiceover ready: ${audioUrl} (~${estimatedDuration}s)`);
      return Response.json({ status: 'ready', voiceover_url: audioUrl, duration: estimatedDuration });
    }

    if (pollData.status === 'error' || pollData.status === 'failed') {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
      return Response.json({ status: 'failed', error: pollData.error_message || 'TTS generation failed' });
    }

    // Still processing (status = 'doing' etc)
    return Response.json({ status: 'generating', message: 'TTS still processing...' });

  } catch (error) {
    console.error(`❌ pollVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});