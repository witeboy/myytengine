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

    // Check if task has been stuck too long (>5 min = likely dead at AI33)
    const taskAge = Date.now() - new Date(settings.updated_date).getTime();
    if (taskAge > 5 * 60 * 1000 && settings.voiceover_status === 'generating') {
      console.log(`⏰ Task ${taskId} has been generating for ${Math.round(taskAge / 1000)}s — marking as failed (stuck)`);
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
      return Response.json({ status: 'failed', error: 'Voiceover generation timed out. Please try again.' });
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
    // Log full response so we can debug field names
    console.log(`🎙 Poll task ${taskId}: status=${pollData.status}, keys=${Object.keys(pollData).join(',')}`);
    if (pollData.metadata) {
      console.log(`   metadata keys: ${Object.keys(pollData.metadata).join(',')}`);
    }

    if (pollData.status === 'done') {
      // Check multiple possible audio URL fields
      const audioUrl = pollData.metadata?.audio_url 
        || pollData.metadata?.url 
        || pollData.audio_url 
        || pollData.url 
        || pollData.result?.url
        || pollData.output?.url;
      
      if (!audioUrl) {
        console.error(`Task done but no audio URL found. Full response: ${JSON.stringify(pollData).substring(0, 500)}`);
        await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
        return Response.json({ status: 'failed', error: 'Task done but no audio URL returned' });
      }

      // Estimate duration from word count
      const scripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
      const script = scripts.find(s => s.version === 'final_aggregated');
      const wordCount = script?.word_count || (script?.full_script || '').split(/\s+/).length;
      const estimatedDuration = Math.round(wordCount / 2.5);

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
      const errMsg = pollData.error_message || pollData.error || pollData.message || 'TTS generation failed';
      console.log(`❌ Task failed: ${errMsg}`);
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, { voiceover_status: 'failed' });
      return Response.json({ status: 'failed', error: errMsg });
    }

    // Still processing (status = 'doing' etc)
    return Response.json({ status: 'generating', message: 'TTS still processing...' });

  } catch (error) {
    console.error(`❌ pollVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});