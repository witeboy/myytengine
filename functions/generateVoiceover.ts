import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { project_id, script_id, voice_id = '21m00Tcm4TlvDq8ikWAM' } = body;

    const API_KEY = Deno.env.get('AI33_API_KEY');
    if (!API_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    // Get the final aggregated script only
    const allScripts = await base44.asServiceRole.entities.Scripts.filter({ project_id });
    const script = allScripts.find(s => s.version === 'final_aggregated');
    if (!script?.full_script) {
      return Response.json({ error: 'No final script found. Please generate the full script first.' }, { status: 404 });
    }

    console.log(`Voiceover using final_aggregated script, words: ${script.full_script.split(/\s+/).length}`);

    // Clean the script text — remove any non-narration content
    const textToSpeak = script.full_script
      .replace(/\[[^\]]*\]/gi, '')                    // Remove all [bracketed] directions
      .replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE)\s*:\s*/gim, '')  // Remove labels
      .replace(/\*\*[^*]+\*\*:?\s*/g, '')             // Remove **bold headers**
      .replace(/\([^)]*(?:voiceover|pause|beat|whisper|dramatic)[^)]*\)/gi, '')  // Remove (parenthetical directions)
      .replace(/\(?\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\)?/g, '')            // Remove timestamps
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // Call ai33.pro text-to-speech API
    const ttsResponse = await fetch(`https://api.ai33.pro/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
      },
      body: JSON.stringify({
        text: textToSpeak,
        model_id: 'eleven_multilingual_v2',
        with_transcript: true,
      }),
    });

    if (!ttsResponse.ok) {
      const error = await ttsResponse.text();
      return Response.json({ error: `TTS API error: ${error}` }, { status: 500 });
    }

    const ttsData = await ttsResponse.json();

    // Update or create ProductionSettings with task info
    const existingSettings = await base44.asServiceRole.entities.ProductionSettings.list();
    const settings = existingSettings.find(s => s.project_id === project_id);

    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        selected_voice_id: voice_id,
        voiceover_status: 'generating',
        generation_task_id: ttsData.task_id,
      });
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({
        project_id,
        selected_voice_id: voice_id,
        voiceover_status: 'generating',
        generation_task_id: ttsData.task_id,
      });
    }

    return Response.json({
      success: true,
      task_id: ttsData.task_id,
      credits_remaining: ttsData.ec_remain_credits,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});