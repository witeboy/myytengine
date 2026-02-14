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

    // Get the script
    const script = await base44.entities.Scripts.get(script_id);
    if (!script) {
      return Response.json({ error: 'Script not found' }, { status: 404 });
    }

    const rawText = script.full_script || [script.cold_open, script.act_1, script.act_2, script.act_3, script.outro].filter(Boolean).join('\n\n');

    // Strip scene directions [SCENE: ...] and "Narrator:" tags to get pure narration
    const textToSpeak = rawText
      .replace(/\[SCENE:[^\]]*\]/gi, '')   // Remove [SCENE: ...] blocks
      .replace(/\[.*?\]/g, '')              // Remove any other bracketed directions
      .replace(/Narrator:\s*/gi, '')        // Remove "Narrator:" labels
      .replace(/Sound:\s*[^\.\n]*/gi, '')   // Remove "Sound:" descriptions
      .replace(/\n{3,}/g, '\n\n')           // Collapse excessive newlines
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

    // Store task_id in project for polling
    await base44.entities.Projects.update(project_id, {
      voiceover_task_id: ttsData.task_id,
      voiceover_status: 'generating',
    });

    return Response.json({
      success: true,
      task_id: ttsData.task_id,
      credits_remaining: ttsData.ec_remain_credits,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});