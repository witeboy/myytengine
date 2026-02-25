import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { track_id, prompt, genre, mood } = await req.json();

    const apiKey = Deno.env.get('KIE_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'KIE_API_KEY not configured' }, { status: 500 });
    }

    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'generating' });
    }

    // Build a rich prompt for Suno via KIE
    let musicPrompt = prompt || 'Cinematic background music for storytelling narration';
    if (musicPrompt.length > 400) musicPrompt = musicPrompt.substring(0, 397) + '...';

    const title = (prompt || 'Background Track').substring(0, 80);

    // Map genre to a Suno style tag
    const style = genre || mood || 'Cinematic';

    // Build negative tags to ensure no vocals
    const negativeTags = 'Vocals, Singing, Rap, Voice, Spoken Word, Choir';

    console.log(`Generating instrumental music via KIE Suno API: style=${style}`);
    console.log('Prompt:', musicPrompt);

    const response = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: musicPrompt,
        customMode: true,
        instrumental: true,
        model: 'V4',
        style: style,
        title: title,
        negativeTags: negativeTags,
        callBackUrl: 'https://example.com/noop-callback',
      }),
    });

    const data = await response.json();
    console.log('KIE Suno response:', JSON.stringify(data));

    if (data.code === 200 && data.data?.taskId) {
      return Response.json({ success: true, status: 'pending', task_id: data.data.taskId });
    }

    // If KIE failed, report the error
    const errMsg = data.msg || data.errorMessage || 'Unknown KIE error';
    console.error('KIE Suno generation failed:', errMsg);
    if (track_id) {
      await base44.asServiceRole.entities.MusicTracks.update(track_id, { status: 'failed' });
    }
    return Response.json({ error: `Music generation failed: ${errMsg}` }, { status: 500 });

  } catch (error) {
    console.error('generateMusic error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});