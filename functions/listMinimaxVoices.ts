import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// LIST ALL VOICES — MiniMax Direct + AI33 Pro
//
// MiniMax Direct:
//   - System voices: hardcoded (no list API exists)
//   - Cloned voices: GET https://api.minimax.io/v1/voice/clone
//
// AI33 Pro:
//   - MiniMax voices: POST https://api.ai33.pro/v1m/voice/list
//   - ElevenLabs:     GET  https://api.ai33.pro/v1/voices
//   - Cloned voices:  GET  https://api.ai33.pro/v1m/voice/clone
// ══════════════════════════════════════════════════════════════════

// ── MiniMax System Voices — English (from platform.minimax.io/docs/faq/system-voice-id) ─
const MINIMAX_SYSTEM_VOICES = [
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

// ── Formatters ──────────────────────────────────────────────────
function formatSystemVoice(v) {
  return {
    voice_id: v.voice_id,
    name: v.name,
    provider: 'minimax_direct',
    category: 'minimax_direct',
    preview_url: null,
    description: [v.gender, v.age, v.accent, v.use_case].filter(Boolean).join(', '),
    labels: { gender: v.gender || '', age: v.age || '', accent: v.accent || '', use_case: v.use_case || '' },
  };
}

function parseAI33Voice(v, provider, category) {
  const tags = v.tag_list || [];
  return {
    voice_id: v.uniq_id || String(v.voice_id),
    name: v.voice_name || v.uniq_id || 'Unknown',
    provider,
    category,
    preview_url: v.sample_audio || null,
    description: tags.join(', '),
    labels: {
      gender: tags.find(t => /^(male|female)$/i.test(t))?.toLowerCase() || '',
      age: tags.find(t => /young|middle|old/i.test(t))?.toLowerCase() || '',
      accent: tags.find(t => /^EN-/i.test(t)) || '',
      use_case: category === 'cloned' ? 'cloned' : tags.filter(t => !/^(male|female|english|EN-|young|middle|old)/i.test(t)).join(', '),
    },
  };
}

// ── MiniMax Direct: Cloned voices from YOUR account ─────────────
async function fetchMinimaxDirectClones(minimaxKey) {
  const voices = [];
  const res = await fetch('https://api.minimax.io/v1/voice/clone', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${minimaxKey}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await res.json();

  // Handle multiple possible response shapes
  const list = data.data || data.voices || data.voice_list || [];
  if (Array.isArray(list)) {
    for (const v of list) {
      voices.push({
        voice_id: v.uniq_id || String(v.voice_id),
        name: v.voice_name || v.name || 'Cloned Voice',
        provider: 'minimax_direct',
        category: 'cloned',
        preview_url: v.sample_audio || null,
        description: 'Cloned voice (MiniMax Direct)',
        labels: {
          gender: (v.tag_list || []).find(t => /^(male|female)$/i.test(t))?.toLowerCase() || '',
          age: '',
          accent: '',
          use_case: 'cloned',
        },
      });
    }
  }
  return voices;
}

// ── AI33: MiniMax voices (paginated) ────────────────────────────
async function fetchAI33MinimaxVoices(ai33Key) {
  const voices = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 10) {
    const res = await fetch('https://api.ai33.pro/v1m/voice/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': ai33Key },
      body: JSON.stringify({ page, page_size: 100, tag_list: [] }),
    });
    const data = await res.json();
    if (data.success && data.data?.voice_list) {
      for (const v of data.data.voice_list) voices.push(parseAI33Voice(v, 'minimax', 'minimax'));
      hasMore = data.data.has_more === true;
      page++;
    } else { hasMore = false; }
  }
  return voices;
}

// ── AI33: ElevenLabs voices ─────────────────────────────────────
async function fetchAI33ElevenlabsVoices(ai33Key) {
  const voices = [];
  const headers = { 'Content-Type': 'application/json', 'xi-api-key': ai33Key };

  try {
    const [recRes, libRes] = await Promise.all([
      fetch('https://api.ai33.pro/v2/voices', { headers }),
      fetch('https://api.ai33.pro/v1/shared-voices?page_size=50&sort=usage_character_count_7d&page=0', { headers }),
    ]);

    if (recRes.ok) {
      const data = await recRes.json();
      for (const v of (data.voices || data || [])) {
        voices.push({
          voice_id: v.voice_id, name: v.name || 'Unknown',
          provider: 'elevenlabs', category: 'elevenlabs',
          preview_url: v.preview_url || null,
          description: (v.description || '').substring(0, 100),
          labels: v.labels || {},
        });
      }
      console.log(`✓ ElevenLabs recommended: ${voices.length}`);
    }

    if (libRes.ok) {
      const data = await libRes.json();
      const before = voices.length;
      for (const v of (data.voices || [])) {
        voices.push({
          voice_id: v.voice_id, name: v.name || 'Unknown',
          provider: 'elevenlabs', category: 'elevenlabs_library',
          preview_url: v.preview_url || null,
          description: (v.description || '').substring(0, 100),
          labels: { accent: v.accent, gender: v.gender, age: v.age, use_case: v.use_case },
        });
      }
      console.log(`✓ ElevenLabs library: ${voices.length - before}`);
    }
  } catch (e) {
    console.warn('ElevenLabs voice list error:', e.message);
  }

  return voices;
}

// Old function removed — replaced above
function __removed() {
  const data = null;
  for (const v of (data.voices || [])) {
    voices.push({
      voice_id: v.voice_id,
      name: v.name || 'Unknown',
      provider: 'elevenlabs',
      category: 'elevenlabs',
      preview_url: v.preview_url || null,
      description: v.description || '',
      labels: {
        gender: v.labels?.gender || '',
        age: v.labels?.age || '',
        accent: v.labels?.accent || '',
        use_case: v.labels?.use_case || '',
      },
    });
  }
  return voices;
}

// ── AI33: Cloned voices ─────────────────────────────────────────
async function fetchAI33Clones(ai33Key) {
  const voices = [];
  const res = await fetch('https://api.ai33.pro/v1m/voice/clone', {
    method: 'GET',
    headers: { 'xi-api-key': ai33Key },
  });
  const data = await res.json();
  if (data.success && Array.isArray(data.data)) {
    for (const v of data.data) voices.push(parseAI33Voice(v, 'minimax', 'cloned'));
  }
  return voices;
}

// ── Main Handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const MINIMAX_KEY = Deno.env.get('MINIMAX_API_KEY');
    const AI33_KEY = Deno.env.get('AI33_API_KEY');

    if (!MINIMAX_KEY && !AI33_KEY) {
      return Response.json({ error: 'No API keys configured' }, { status: 500 });
    }

    const allVoices = [];

    // ════════════════════════════════════════════════════════════
    // MINIMAX DIRECT — system voices (hardcoded) + clones (API)
    // ════════════════════════════════════════════════════════════
    if (MINIMAX_KEY) {
      // System voices — instant, no API call
      const systemVoices = MINIMAX_SYSTEM_VOICES.map(formatSystemVoice);
      allVoices.push(...systemVoices);
      console.log(`📋 MiniMax Direct: ${systemVoices.length} system voices`);

      // Cloned voices — fetch from your MiniMax account
      let directCloneCount = 0;
      try {
        const directClones = await fetchMinimaxDirectClones(MINIMAX_KEY);
        allVoices.push(...directClones);
        directCloneCount = directClones.length;
        console.log(`📋 MiniMax Direct: ${directClones.length} cloned voices`);
      } catch (err) {
        console.warn(`MiniMax Direct clones failed: ${err.message}`);
      }

      // Hardcoded clones (always available even if API fails)
      const manualClones = [
        { voice_id: 'moss_audio_1f15f1bf-25a4-11f1-87f8-9ea92b5874a5', name: 'Baba Suwe' },
        { voice_id: 'moss_audio_f2cf397e-0e8c-11f1-bfa6-763108879732', name: 'DPO' }, 
      ];
      for (const c of manualClones) {
        if (!allVoices.find(v => v.voice_id === c.voice_id)) {
          allVoices.push({
            voice_id: c.voice_id, name: c.name,
            description: 'Cloned voice (MiniMax Direct)',
            preview_url: null,
            labels: { gender: '', age: '', accent: '', use_case: 'cloned' },
            category: 'cloned', provider: 'minimax_direct',
          });
          directCloneCount++;
        }
      }
      console.log(`📋 MiniMax Direct total clones: ${directCloneCount}`);
    }

    // ════════════════════════════════════════════════════════════
    // AI33 PRO — MiniMax + ElevenLabs + Clones (all fetched)
    // ════════════════════════════════════════════════════════════
    if (AI33_KEY) {
      const ai33Results = await Promise.all([
        fetchAI33MinimaxVoices(AI33_KEY).catch(err => { console.warn('AI33 MM:', err.message); return []; }),
        fetchAI33ElevenlabsVoices(AI33_KEY).catch(err => { console.warn('AI33 EL:', err.message); return []; }),
        fetchAI33Clones(AI33_KEY).catch(err => { console.warn('AI33 clones:', err.message); return []; }),
      ]);

      const ai33Voices = ai33Results.flat();
      allVoices.push(...ai33Voices);

      const ai33MM = ai33Voices.filter(v => v.provider === 'minimax' && v.category !== 'cloned').length;
      const ai33EL = ai33Voices.filter(v => v.provider === 'elevenlabs').length;
      const ai33Clones = ai33Voices.filter(v => v.category === 'cloned').length;
      console.log(`📋 AI33: ${ai33MM} MiniMax, ${ai33EL} ElevenLabs, ${ai33Clones} cloned`);
    }

    // ── Counts ──────────────────────────────────────────────────
    const counts = {
      minimax_direct: allVoices.filter(v => v.provider === 'minimax_direct' && v.category !== 'cloned').length,
      minimax_direct_cloned: allVoices.filter(v => v.provider === 'minimax_direct' && v.category === 'cloned').length,
      ai33_minimax: allVoices.filter(v => v.provider === 'minimax' && v.category !== 'cloned').length,
      ai33_elevenlabs: allVoices.filter(v => v.provider === 'elevenlabs').length,
      ai33_cloned: allVoices.filter(v => v.provider === 'minimax' && v.category === 'cloned').length,
    };

    console.log(`📋 Total: ${allVoices.length} voices — ⚡${counts.minimax_direct} system + ⚡${counts.minimax_direct_cloned} direct clones + ${counts.ai33_minimax} AI33 MM + ${counts.ai33_elevenlabs} AI33 EL + ${counts.ai33_cloned} AI33 clones`);

    return Response.json({
      success: true,
      voices: allVoices,
      count: allVoices.length,
      sources: counts,
    });

  } catch (error) {
    console.error(`❌ listMinimaxVoices: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});