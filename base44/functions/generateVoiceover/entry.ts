import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function cleanScript(text, isSleepMode) {
  let cleaned = text || '';
  if (isSleepMode) {
    cleaned = cleaned.replace(/\[PAUSE\s+(\d+)\s*(?:SEC(?:ONDS?)?)?\]/gi, (_, seconds) => ' ' + Array(Math.ceil((Number(seconds) || 3) / 3)).fill('... ... ...').join(' ') + ' ')
      .replace(/\[BREATHE\]/gi, ' ... ... ... ... ');
  } else {
    cleaned = cleaned.replace(/\[[^\]]*\]/gi, '');
  }
  return cleaned.replace(/^(VOICEOVER|NARRATOR|VO|SOUND|MUSIC|SFX|SCENE)\s*:\s*/gim, '')
    .replace(/\*\*[^*]+\**:?\s*/g, '').replace(/#{1,6}\s+/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

function toV3VoiceId(voiceId, category) {
  const prefixes = ['elevenlabs_', 'minimax_', 'clone_', 'edge_', 'kokoro_', 'vbee_', 'fishaudio_'];
  if (prefixes.some(prefix => voiceId.startsWith(prefix))) return voiceId;
  if (category === 'elevenlabs' || category === 'elevenlabs_library') return `elevenlabs_${voiceId}`;
  if (category === 'cloned' || category === 'minimax_cloned') return `clone_${voiceId}`;
  return `minimax_${voiceId}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { project_id, voice_id, voice_category } = await req.json();
    if (!project_id || !voice_id) return Response.json({ error: 'project_id and voice_id are required' }, { status: 400 });

    const key = Deno.env.get('AI33_API_KEY');
    if (!key) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    const [projects, scripts, settingsList] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scripts.filter({ project_id }),
      base44.asServiceRole.entities.ProductionSettings.filter({ project_id }),
    ]);
    const project = projects[0];
    const script = scripts.find(item => item.version === 'final_aggregated');
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });
    if (!script?.full_script) return Response.json({ error: 'No final script found' }, { status: 400 });

    const isSleepMode = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    const text = cleanScript(script.full_script, isSleepMode);
    const v3VoiceId = toV3VoiceId(voice_id, voice_category);
    const form = new FormData();
    form.append('text', text);
    form.append('voice_id', v3VoiceId);
    form.append('speed', '1');
    form.append('with_transcript', 'false');

    const response = await fetch('https://api.ai33.pro/v3/text-to-speech', {
      method: 'POST', headers: { 'xi-api-key': key }, body: form,
    });
    const data = await response.json();
    if (!response.ok || !data.task_id) {
      return Response.json({ error: data.error?.message || data.message || `AI33 v3 submission failed (${response.status})` }, { status: 502 });
    }

    const payload = {
      project_id,
      selected_voice_id: v3VoiceId,
      voiceover_status: 'generating',
      generation_task_id: `ai33:${data.task_id}`,
      voiceover_url: '',
      voiceover_chunks: '',
      voiceover_total_chunks: 0,
      voiceover_completed_chunks: 0,
    };
    if (settingsList[0]) await base44.asServiceRole.entities.ProductionSettings.update(settingsList[0].id, payload);
    else await base44.asServiceRole.entities.ProductionSettings.create(payload);

    return Response.json({ success: true, provider: 'ai33_v3', task_id: data.task_id, status: 'generating', instant: false, word_count: text.split(/\s+/).length });
  } catch (error) {
    console.error('generateVoiceover:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});