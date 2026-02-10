import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { project_id, voice_id, script_text } = await req.json();

    if (!project_id || !voice_id || !script_text) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get project and script
    const projects = await base44.asServiceRole.entities.Projects.list();
    const project = projects.find(p => p.id === project_id);

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Call ElevenLabs API to generate voiceover
    const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (!elevenLabsKey) {
      return Response.json({ error: 'ElevenLabs API key not configured' }, { status: 500 });
    }

    const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: script_text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!ttsResponse.ok) {
      const error = await ttsResponse.text();
      return Response.json({ error: `ElevenLabs error: ${error}` }, { status: 500 });
    }

    const audioBuffer = await ttsResponse.arrayBuffer();

    // Upload audio file
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    const formData = new FormData();
    formData.append('file', audioBlob, 'voiceover.mp3');

    const uploadResponse = await base44.asServiceRole.integrations.Core.UploadFile({
      file: new File([audioBlob], 'voiceover.mp3', { type: 'audio/mpeg' }),
    });

    // Get audio duration
    const audioContext = new (typeof AudioContext !== 'undefined' ? AudioContext : null)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    
    let duration = 0;
    try {
      if (audioContext) {
        const decodedAudio = await audioContext.decodeAudioData(arrayBuffer);
        duration = decodedAudio.duration;
      }
    } catch (e) {
      // Fallback: estimate duration from file size (rough estimate)
      duration = (audioBlob.size / 16000) * 8; // Rough estimate
    }

    // Update production settings
    const existingSettings = await base44.asServiceRole.entities.ProductionSettings.list();
    const settings = existingSettings.find(s => s.project_id === project_id);

    if (settings) {
      await base44.asServiceRole.entities.ProductionSettings.update(settings.id, {
        selected_voice_id: voice_id,
        voiceover_status: 'completed',
        voiceover_url: uploadResponse.file_url,
        total_duration_seconds: Math.round(duration * 10) / 10,
      });
    } else {
      await base44.asServiceRole.entities.ProductionSettings.create({
        project_id,
        selected_voice_id: voice_id,
        voiceover_status: 'completed',
        voiceover_url: uploadResponse.file_url,
        total_duration_seconds: Math.round(duration * 10) / 10,
      });
    }

    return Response.json({
      success: true,
      audio_url: uploadResponse.file_url,
      duration: Math.round(duration * 10) / 10,
    });
  } catch (error) {
    console.error('Error generating voice audio:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});