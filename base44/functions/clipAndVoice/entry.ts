import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const API = 'https://api.ai33.pro';
const doneStates = new Set(['done', 'completed', 'success', 'succeeded']);
const failedStates = new Set(['failed', 'error', 'cancelled']);

function findAudioUrl(value) {
  if (!value || typeof value !== 'object') return null;
  for (const key of ['audio_url', 'output_url', 'file_url', 'url', 'stream_url']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(candidate)) return candidate;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) { const found = findAudioUrl(item); if (found) return found; }
    } else if (child && typeof child === 'object') {
      const found = findAudioUrl(child); if (found) return found;
    }
  }
  return null;
}

async function ai33(path, key, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'xi-api-key': key, ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok || data.error || data.success === false) throw new Error(data.error?.message || data.message || `AI33 request failed (${response.status})`);
  return data;
}

function chooseVoice(voices, preferences) {
  const terms = [preferences.gender, preferences.accent, preferences.age, preferences.style, preferences.use_case]
    .filter(Boolean).map(value => String(value).toLowerCase());
  return voices.map(voice => {
    const haystack = JSON.stringify(voice).toLowerCase();
    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 2 : 0), 0) + (voice.preview_url ? 1 : 0);
    return { voice, score };
  }).sort((a, b) => b.score - a.score)[0]?.voice;
}

async function start(base44, body, key) {
  const { clip, clip_transcript = '', context = '' } = body;
  if (!clip?.start && clip?.start !== 0) throw new Error('A valid clip is required');
  const targetWords = Math.max(45, Math.min(220, Math.round((clip.duration || clip.end - clip.start) * 2.15)));
  const plan = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt: `You are producing a narrated vertical social video from an existing clip. Write a compelling, fact-faithful voiceover that fits about ${targetWords} words and ends with a complete, satisfying final sentence. Do not invent names, scores, quotes, plot facts, or outcomes. For sports, narrate the setup, decisive play, and outcome with energetic commentary. For movie footage, summarize only what the supplied transcript/context supports and avoid copyrighted dialogue imitation. Design instrumental background music and at most two short sound effects that accent real beats without overpowering narration.\n\nTitle: ${clip.title || ''}\nContent type: ${clip.content_type || 'auto'}\nContext: ${context}\nTranscript: ${clip_transcript.slice(0, 6000)}`,
    response_json_schema: {
      type: 'object', properties: {
        script: { type: 'string' },
        voice_preferences: { type: 'object', properties: { gender: { type: 'string' }, accent: { type: 'string' }, age: { type: 'string' }, style: { type: 'string' }, use_case: { type: 'string' } } },
        music_prompt: { type: 'string' },
        sfx: { type: 'array', items: { type: 'object', properties: { prompt: { type: 'string' }, timestamp: { type: 'number' }, duration: { type: 'number' } } } }
      }, required: ['script', 'voice_preferences', 'music_prompt', 'sfx']
    }
  });

  const voicePayloads = await Promise.all(['elevenlabs', 'minimax'].map(provider => ai33(`/v3/voices?provider=${provider}&page=1&page_size=100`, key)));
  const voice = chooseVoice(voicePayloads.flatMap(payload => payload.data || []), plan.voice_preferences);
  if (!voice?.voice_id) throw new Error('AI33 returned no suitable voices');

  const voiceForm = new FormData();
  voiceForm.append('text', plan.script);
  voiceForm.append('voice_id', voice.voice_id);
  voiceForm.append('speed', '1');
  voiceForm.append('with_transcript', 'false');

  const [voiceTask, musicTask, ...sfxTasks] = await Promise.all([
    ai33('/v3/text-to-speech', key, { method: 'POST', body: voiceForm }),
    ai33('/v1s/task/music-generation', key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ create_mode: 'simple', gpt_description_prompt: String(plan.music_prompt).slice(0, 500), make_instrumental: true }) }),
    ...(plan.sfx || []).slice(0, 2).map(item => ai33('/v1/task/sound-effect', key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: String(item.prompt).slice(0, 200), duration_seconds: Math.max(1, Math.min(5, Number(item.duration) || 2)), prompt_influence: 0.3, loop: false, model_id: 'eleven_text_to_sound_v2' }) }))
  ]);

  return { success: true, status: 'generating', plan, voice: { voice_id: voice.voice_id, name: voice.name }, tasks: { voice: voiceTask.task_id, music: musicTask.task_id, sfx: sfxTasks.map((task, index) => ({ task_id: task.task_id, timestamp: Math.max(0, Number(plan.sfx[index]?.timestamp) || 0) })) } };
}

async function poll(body, key) {
  const entries = [
    { kind: 'voice', task_id: body.tasks?.voice },
    { kind: 'music', task_id: body.tasks?.music },
    ...(body.tasks?.sfx || []).map(item => ({ kind: 'sfx', ...item }))
  ].filter(item => item.task_id);
  const results = await Promise.all(entries.map(async item => ({ ...item, data: await ai33(`/v1/task/${item.task_id}`, key) })));
  const failed = results.find(item => failedStates.has(String(item.data.status).toLowerCase()));
  if (failed) throw new Error(`${failed.kind} generation failed`);
  const complete = results.every(item => doneStates.has(String(item.data.status).toLowerCase()) && findAudioUrl(item.data));
  if (!complete) return { success: true, status: 'generating', progress: Math.round(results.reduce((sum, item) => sum + (Number(item.data.progress) || 0), 0) / Math.max(1, results.length)) };
  return { success: true, status: 'ready', assets: { voice_url: findAudioUrl(results.find(item => item.kind === 'voice')?.data), music_url: findAudioUrl(results.find(item => item.kind === 'music')?.data), sfx: results.filter(item => item.kind === 'sfx').map(item => ({ url: findAudioUrl(item.data), timestamp: item.timestamp })) } };
}

Deno.serve(async req => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const key = Deno.env.get('AI33_API_KEY');
    if (!key) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    const body = await req.json();
    return Response.json(body.action === 'poll' ? await poll(body, key) : await start(base44, body, key));
  } catch (error) {
    console.error('clipAndVoice:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});