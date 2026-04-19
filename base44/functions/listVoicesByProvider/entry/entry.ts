import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v3 — redeployed

// ══════════════════════════════════════════════════════════════════
// LIST VOICES BY PROVIDER — Single function, routes by source param
//
// { source: 'minimax_direct' } → hardcoded system + your clones
// { source: 'ai33' }           → ElevenLabs + MiniMax + Clones via AI33
// ══════════════════════════════════════════════════════════════════

// ── MiniMax system voices (from platform.minimax.io/docs/faq/system-voice-id) ─
const SYSTEM_VOICES = [
  { voice_id: 'English_expressive_narrator', name: 'Expressive Narrator', gender: 'male', age: 'middle_aged', use_case: 'narration' },
  { voice_id: 'English_radiant_girl', name: 'Radiant Girl', gender: 'female', age: 'young' },
  { voice_id: 'English_magnetic_voiced_man', name: 'Magnetic-voiced Male', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_compelling_lady1', name: 'Compelling Lady', gender: 'female', age: 'middle_aged' },
  { voice_id: 'English_Aussie_Bloke', name: 'Aussie Bloke', gender: 'male', age: 'middle_aged', accent: 'EN-Australian' },
  { voice_id: 'English_captivating_female1', name: 'Captivating Female', gender: 'female', age: 'middle_aged' },
  { voice_id: 'English_Upbeat_Woman', name: 'Upbeat Woman', gender: 'female', age: 'young' },
  { voice_id: 'English_Trustworth_Man', name: 'Trustworthy Man', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_CalmWoman', name: 'Calm Woman', gender: 'female', age: 'middle_aged', use_case: 'calm' },
  { voice_id: 'English_UpsetGirl', name: 'Upset Girl', gender: 'female', age: 'young' },
  { voice_id: 'English_Gentle-voiced_man', name: 'Gentle-voiced Man', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_Whispering_girl', name: 'Whispering Girl', gender: 'female', age: 'young', use_case: 'whisper' },
  { voice_id: 'English_Diligent_Man', name: 'Diligent Man', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_Graceful_Lady', name: 'Graceful Lady', gender: 'female', age: 'middle_aged', accent: 'EN-British' },
  { voice_id: 'English_ReservedYoungMan', name: 'Reserved Young Man', gender: 'male', age: 'young' },
  { voice_id: 'English_PlayfulGirl', name: 'Playful Girl', gender: 'female', age: 'young' },
  { voice_id: 'English_ManWithDeepVoice', name: 'Man With Deep Voice', gender: 'male', age: 'middle_aged', use_case: 'deep' },
  { voice_id: 'English_MaturePartner', name: 'Mature Partner', gender: 'male', age: 'old' },
  { voice_id: 'English_FriendlyPerson', name: 'Friendly Guy', gender: 'male', age: 'young' },
  { voice_id: 'English_MatureBoss', name: 'Bossy Lady', gender: 'female', age: 'middle_aged' },
  { voice_id: 'English_Debator', name: 'Male Debater', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_LovelyGirl', name: 'Lovely Girl', gender: 'female', age: 'young' },
  { voice_id: 'English_Steadymentor', name: 'Reliable Man', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_Deep-VoicedGentleman', name: 'Deep-voiced Gentleman', gender: 'male', age: 'old', use_case: 'deep' },
  { voice_id: 'English_Wiselady', name: 'Wise Lady', gender: 'female', age: 'old' },
  { voice_id: 'English_CaptivatingStoryteller', name: 'Captivating Storyteller', gender: 'male', age: 'middle_aged', use_case: 'narration' },
  { voice_id: 'English_DecentYoungMan', name: 'Decent Young Man', gender: 'male', age: 'young' },
  { voice_id: 'English_SentimentalLady', name: 'Sentimental Lady', gender: 'female', age: 'middle_aged' },
  { voice_id: 'English_ImposingManner', name: 'Imposing Queen', gender: 'female', age: 'middle_aged' },
  { voice_id: 'English_SadTeen', name: 'Teen Boy', gender: 'male', age: 'young' },
  { voice_id: 'English_PassionateWarrior', name: 'Passionate Warrior', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_WiseScholar', name: 'Wise Scholar', gender: 'male', age: 'old', use_case: 'narration' },
  { voice_id: 'English_Soft-spokenGirl', name: 'Soft-Spoken Girl', gender: 'female', age: 'young', use_case: 'calm' },
  { voice_id: 'English_SereneWoman', name: 'Serene Woman', gender: 'female', age: 'middle_aged', use_case: 'calm' },
  { voice_id: 'English_ConfidentWoman', name: 'Confident Woman', gender: 'female', age: 'middle_aged' },
  { voice_id: 'English_PatientMan', name: 'Patient Man', gender: 'male', age: 'middle_aged', use_case: 'calm' },
  { voice_id: 'English_Comedian', name: 'Comedian', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_BossyLeader', name: 'Bossy Leader', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_Strong-WilledBoy', name: 'Strong-Willed Boy', gender: 'male', age: 'young' },
  { voice_id: 'English_StressedLady', name: 'Stressed Lady', gender: 'female', age: 'middle_aged' },
  { voice_id: 'English_AssertiveQueen', name: 'Assertive Queen', gender: 'female', age: 'middle_aged' },
  { voice_id: 'English_AnimeCharacter', name: 'Female Narrator', gender: 'female', age: 'young', use_case: 'narration' },
  { voice_id: 'English_Jovialman', name: 'Jovial Man', gender: 'male', age: 'middle_aged' },
  { voice_id: 'English_WhimsicalGirl', name: 'Whimsical Girl', gender: 'female', age: 'young' },
  { voice_id: 'English_Kind-heartedGirl', name: 'Kind-Hearted Girl', gender: 'female', age: 'young' },
];

// Your MiniMax Direct clones — add more here as needed
const MY_CLONES = [
  { voice_id: 'moss_audio_1f15f1bf-25a4-11f1-87f8-9ea92b5874a5', name: 'Baba Suwe' },
  { voice_id: 'moss_audio_f2cf397e-0e8c-11f1-bfa6-763108879732', name: 'DPO' },
];

// AI33 cache
let ai33Cache = null;
let ai33CacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;
let ai33Inflight = null;

async function fetchAI33Voices() {
  const AI33_KEY = Deno.env.get('AI33_API_KEY');
  const headers = { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY };
  const allVoices = [];

  // ElevenLabs — exact endpoints from working listVoices
  try {
    const [recRes, libRes] = await Promise.all([
      fetch('https://api.ai33.pro/v2/voices', { headers }),
      fetch('https://api.ai33.pro/v1/shared-voices?page_size=50&sort=usage_character_count_7d&page=0', { headers }),
    ]);

    if (recRes.ok) {
      const data = await recRes.json();
      for (const v of (data.voices || data || [])) {
        allVoices.push({
          voice_id: v.voice_id, name: v.name,
          description: (v.description || '').substring(0, 100),
          preview_url: v.preview_url, labels: v.labels || {},
          category: 'elevenlabs',
        });
      }
    }
    if (libRes.ok) {
      const data = await libRes.json();
      for (const v of (data.voices || [])) {
        allVoices.push({
          voice_id: v.voice_id, name: v.name,
          description: (v.description || '').substring(0, 100),
          preview_url: v.preview_url,
          labels: { accent: v.accent, gender: v.gender, age: v.age, use_case: v.use_case },
          category: 'elevenlabs_library',
        });
      }
    }
  } catch (e) { console.warn('ElevenLabs error:', e.message); }

  // MiniMax + Clones via AI33 — exact endpoints from working listVoices
  try {
    const [mmRes, cloneRes] = await Promise.all([
      fetch('https://api.ai33.pro/v1m/voice/list', {
        method: 'POST', headers,
        body: JSON.stringify({ page: 1, page_size: 100, tag_list: [] }),
      }),
      fetch('https://api.ai33.pro/v1m/voice/clone', { headers }),
    ]);

    if (mmRes.ok) {
      const data = await mmRes.json();
      for (const v of (data.data?.voice_list || [])) {
        allVoices.push({
          voice_id: v.voice_id, name: v.voice_name || v.voice_id,
          description: (v.tag_list || []).join(', '),
          preview_url: v.sample_audio || null,
          labels: {
            accent: (v.tag_list || []).find(t => t.includes('EN-') || t === 'English') || '',
            gender: (v.tag_list || []).find(t => t === 'Male' || t === 'Female')?.toLowerCase() || '',
            age: (v.tag_list || []).find(t => t.includes('Age') || t === 'Young' || t === 'Middle Age') || '',
            use_case: 'narration',
          },
          category: 'minimax',
        });
      }
    }
    if (cloneRes.ok) {
      const data = await cloneRes.json();
      for (const v of (data.data || [])) {
        allVoices.push({
          voice_id: v.voice_id, name: v.voice_name || v.voice_id,
          description: 'Cloned voice', preview_url: v.sample_audio || null,
          labels: { accent: '', gender: '', age: '', use_case: 'cloned' },
          category: 'cloned',
        });
      }
    }
  } catch (e) { console.warn('MiniMax AI33 error:', e.message); }

  // Deduplicate
  const seen = new Set();
  return allVoices.filter(v => { if (seen.has(v.voice_id)) return false; seen.add(v.voice_id); return true; });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { source } = await req.json();

    // ════════════════════════════════════════════════════════════
    // MINIMAX DIRECT — instant, no API calls
    // ════════════════════════════════════════════════════════════
    if (source === 'minimax_direct') {
      const voices = [];
      for (const v of SYSTEM_VOICES) {
        voices.push({
          voice_id: v.voice_id, name: v.name, preview_url: null,
          description: [v.gender, v.age, v.accent, v.use_case].filter(Boolean).join(', '),
          labels: { gender: v.gender || '', age: v.age || '', accent: v.accent || '', use_case: v.use_case || '' },
          category: 'system',
        });
      }
      for (const c of MY_CLONES) {
        voices.push({
          voice_id: c.voice_id, name: c.name, preview_url: null,
          description: 'Cloned voice',
          labels: { gender: '', age: '', accent: '', use_case: 'cloned' },
          category: 'cloned',
        });
      }
      return Response.json({ success: true, voices, count: voices.length });
    }

    // ════════════════════════════════════════════════════════════
    // AI33 — cached, fetched from AI33 proxy
    // ════════════════════════════════════════════════════════════
    if (source === 'ai33') {
      const AI33_KEY = Deno.env.get('AI33_API_KEY');
      if (!AI33_KEY) return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });

      if (ai33Cache && (Date.now() - ai33CacheTime) < CACHE_TTL) {
        return Response.json({ success: true, voices: ai33Cache, count: ai33Cache.length });
      }

      if (!ai33Inflight) {
        ai33Inflight = fetchAI33Voices().then(result => {
          ai33Cache = result;
          ai33CacheTime = Date.now();
          ai33Inflight = null;
          return result;
        }).catch(err => { ai33Inflight = null; throw err; });
      }

      const voices = await ai33Inflight;
      return Response.json({ success: true, voices, count: voices.length });
    }

    // ════════════════════════════════════════════════════════════
    // INWORLD AI — fetched from Inworld API
    // ════════════════════════════════════════════════════════════
    if (source === 'inworld') {
      const INWORLD_KEY = Deno.env.get('INWORLD_API_KEY');
      if (!INWORLD_KEY) return Response.json({ error: 'INWORLD_API_KEY not configured' }, { status: 500 });

      const voices = [];
      try {
        const res = await fetch('https://api.inworld.ai/tts/v1/voices?filter=language%3Den', {
          headers: { 'Authorization': `Basic ${INWORLD_KEY}` },
        });
        if (res.ok) {
          const data = await res.json();
          for (const v of (data.voices || [])) {
            voices.push({
              voice_id: v.voiceId,
              name: v.displayName || v.voiceId,
              preview_url: null,
              description: v.description || '',
              labels: {
                gender: (v.tags || []).find(t => t === 'male' || t === 'female') || '',
                age: (v.tags || []).find(t => /young|middle|old|aged/i.test(t)) || '',
                accent: '',
                use_case: (v.tags || []).filter(t => t !== 'male' && t !== 'female').join(', '),
              },
              category: v.isCustom ? 'cloned' : 'inworld',
            });
          }
        }
      } catch (e) {
        console.warn('Inworld voice list error:', e.message);
      }
      // Your Inworld cloned voices
      const myInworldClones = [
        { voice_id: 'default-ab8r3bdxqxx-61-kw2c-jg__suwe2', name: 'My Inworld Clone' },
      ];
      for (const c of myInworldClones) {
        if (!voices.find(v => v.voice_id === c.voice_id)) {
          voices.push({
            voice_id: c.voice_id, name: c.name, preview_url: null,
            description: 'Cloned voice (Inworld)',
            labels: { gender: '', age: '', accent: '', use_case: 'cloned' },
            category: 'cloned',
          });
        }
      }
      
      return Response.json({ success: true, voices, count: voices.length });
    }

    return Response.json({ error: 'Invalid source. Use "minimax_direct", "ai33", or "inworld".' }, { status: 400 });

  } catch (error) {
    console.error(`❌ listVoicesByProvider: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});