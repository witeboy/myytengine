import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// VOICEOVER GENERATOR — Ultra-lean submit-only
// Submits TTS task to AI33, saves settings, returns task_id
// Frontend then polls via pollVoiceover
// ══════════════════════════════════════════════════════════════════

function cleanScript(text, isSleepMode = false) {
  let cleaned = text;
  if (isSleepMode) {
    cleaned = cleaned.replace(/\[(PAUSE\s+(\d+)\s*(?:SEC(?:ONDS?)?)?)\]/gi, (_, _c, seconds) => {
      const sec = parseInt(seconds) || 3;
      const groups = Math.ceil(sec / 3);
      return ' ' + Array(groups).fill('... ... ...').join(' ') + ' ';
    });
    cleaned = cleaned.replace(/\[BREATHE\]/gi, ' ... ... ... ... ');
  } else {
    cleaned = cleaned.replace(/\[[^\]]*\]/gi, '');
  }
  cleaned = cleaned
    .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE)\s*:\s*/gim, '')
    .replace(/\*\*[^*]+\*\*:?\s*/g, '')
    .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic)[^)]*\)/gi, '')
    .replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, voice_id } = await req.json();
    if (!project_id) return Response.json({ error: 'Missing project_id' }, { status: 400 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

    // Fetch project & script in parallel
    const [projects, allScripts] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scripts.filter({ project_id }),
    ]);
    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final_aggregated script found.' }, { status: 400 });
    }

    const isSleepMode = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    const cleanedText = cleanScript(script.full_script, isSleepMode);
    const wordCount = cleanedText.split(/\s+/).filter(w => w.length > 0).length;

    const defaultVoice = isSleepMode ? 'English_calm_female' : 'English_expressive_narrator';
    const selectedVoiceId = voice_id || defaultVoice;

    // Determine provider
    const isElevenlabs = /^[a-zA-Z0-9]{20,}$/.test(selectedVoiceId);
    const provider = isElevenlabs ? 'elevenlabs' : 'minimax';

    console.log(`🎙 Voiceover SUBMIT: ${wordCount} words, voice=${selectedVoiceId}, provider=${provider}`);

    // Submit TTS task to AI33
    let submitUrl, submitBody;
    if (provider === 'minimax') {
      submitUrl = 'https://api.ai33.pro/v1m/task/text-to-speech';
      submitBody = JSON.stringify({
        text: cleanedText,
        model: 'speech-2.6-hd',
        voice_setting: { voice_id: selectedVoiceId, vol: 1, pitch: 0, speed: 1 },
        language_boost: 'Auto',
      });
    } else {
      submitUrl = `https://api.ai33.pro/v1/text-to-speech/${selectedVoiceId}?output_format=mp3_44100_128`;
      submitBody = JSON.stringify({
        text: cleanedText,
        model_id: 'eleven_multilingual_v2',
      });
    }

    const submitRes = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
      body: submitBody,
    });

    const submitData = await submitRes.json();

    if (!submitData.success || !submitData.task_id) {
      throw new Error(`AI33 submit failed: ${JSON.stringify(submitData).substring(0, 300)}`);
    }

    const taskId = submitData.task_id;
    console.log(`✅ TTS task submitted: ${taskId}`);

    // Save settings — must await to ensure task_id is persisted before poll starts
    const settingsList = await base44.asServiceRole.entities.ProductionSettings.filter({ project_id });
    const settingsPayload = {
      project_id,
      selected_voice_id: selectedVoiceId,
      voiceover_status: 'generating',
      generation_task_id: taskId,
    };
    if (settingsList[0]) {
      await base44.asServiceRole.entities.ProductionSettings.update(settingsList[0].id, settingsPayload);
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create(settingsPayload);
    }

    return Response.json({
      success: true,
      task_id: taskId,
      provider,
      word_count: wordCount,
      status: 'generating',
    });

  } catch (error) {
    console.error(`❌ generateVoiceover error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});