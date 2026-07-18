import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const categories = { elevenlabs: 'elevenlabs', minimax: 'minimax', clone: 'cloned' };

function normalize(voice, provider) {
  return {
    voice_id: voice.voice_id,
    name: voice.name || voice.voice_name || voice.voice_id,
    description: voice.description || '',
    preview_url: voice.preview_url || voice.sample_audio || null,
    labels: {
      accent: voice.accent || voice.labels?.accent || '',
      gender: String(voice.gender || voice.labels?.gender || '').toLowerCase(),
      age: String(voice.age || voice.labels?.age || '').toLowerCase().replace(/\s+/g, '_'),
      use_case: voice.use_case || voice.labels?.use_case || '',
    },
    category: categories[provider] || provider,
  };
}

async function ai33Voices(key, providers) {
  const lists = await Promise.all(providers.map(async provider => {
    const response = await fetch(`https://api.ai33.pro/v3/voices?provider=${provider}&page=1&page_size=100`, { headers: { 'xi-api-key': key } });
    if (!response.ok) throw new Error(`AI33 v3 ${provider} voices failed (${response.status})`);
    const data = await response.json();
    return (data.data || []).map(voice => normalize(voice, provider));
  }));
  const seen = new Set();
  return lists.flat().filter(voice => voice.voice_id && !seen.has(voice.voice_id) && seen.add(voice.voice_id));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { source } = await req.json();

    if (source === 'ai33' || source === 'minimax_direct') {
      const key = Deno.env.get('AI33_API_KEY');
      if (!key) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
      const providers = source === 'ai33' ? ['elevenlabs', 'minimax', 'clone'] : ['minimax', 'clone'];
      const voices = await ai33Voices(key, providers);
      if (source === 'minimax_direct') {
        voices.forEach(voice => { voice.category = voice.category === 'cloned' ? 'cloned' : 'system'; });
      }
      return Response.json({ success: true, voices, count: voices.length, api_version: 'v3' });
    }

    if (source === 'inworld') {
      const key = Deno.env.get('INWORLD_API_KEY');
      if (!key) return Response.json({ error: 'INWORLD_API_KEY not configured' }, { status: 500 });
      const response = await fetch('https://api.inworld.ai/tts/v1/voices?filter=language%3Den', { headers: { Authorization: `Basic ${key}` } });
      if (!response.ok) return Response.json({ error: `Inworld voices failed (${response.status})` }, { status: 502 });
      const data = await response.json();
      const voices = (data.voices || []).map(voice => ({
        voice_id: voice.voiceId, name: voice.displayName || voice.voiceId, description: voice.description || '', preview_url: null,
        labels: { gender: (voice.tags || []).find(tag => tag === 'male' || tag === 'female') || '', age: '', accent: '', use_case: (voice.tags || []).join(', ') },
        category: voice.isCustom ? 'cloned' : 'inworld',
      }));
      return Response.json({ success: true, voices, count: voices.length });
    }

    return Response.json({ error: 'Invalid source' }, { status: 400 });
  } catch (error) {
    console.error('listVoicesByProvider:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});