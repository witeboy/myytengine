import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// LIST ALL VOICES — Both MiniMax Direct + AI33 Pro
//
// Fetches voices from BOTH services simultaneously:
// - MiniMax Direct (api.minimax.io) → tagged provider: 'minimax_direct'
// - AI33 MiniMax (api.ai33.pro)     → tagged provider: 'minimax'
// - AI33 ElevenLabs (api.ai33.pro)  → tagged provider: 'elevenlabs'
// - Cloned voices from both sources
//
// Frontend can filter by provider to let user choose which to use.
// ══════════════════════════════════════════════════════════════════

function parseVoice(v, provider, category) {
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
      use_case: category === 'cloned'
        ? 'cloned'
        : tags.filter(t => !/^(male|female|english|EN-|young|middle|old)/i.test(t)).join(', '),
    },
  };
}

// ── MiniMax Direct API ──────────────────────────────────────────
async function fetchMinimaxDirectVoices(minimaxKey) {
  const voices = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 10) {
    const res = await fetch('https://api.minimax.io/v1/voice/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${minimaxKey}`,
      },
      body: JSON.stringify({ page, page_size: 100, tag_list: [] }),
    });

    const data = await res.json();
    const list = data.data?.voice_list || data.voice_list || [];

    if (list.length > 0) {
      for (const v of list) voices.push(parseVoice(v, 'minimax_direct', 'minimax_direct'));
      hasMore = data.data?.has_more === true || list.length >= 100;
      page++;
    } else {
      hasMore = false;
    }
  }

  return voices;
}

async function fetchMinimaxDirectClones(minimaxKey) {
  const voices = [];
  const res = await fetch('https://api.minimax.io/v1/voice/clone/list', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${minimaxKey}` },
  });

  const data = await res.json();
  const list = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);

  for (const v of list) {
    voices.push(parseVoice(v, 'minimax_direct', 'cloned'));
  }

  return voices;
}

// ── AI33 Pro API ────────────────────────────────────────────────
async function fetchAI33MinimaxVoices(ai33Key) {
  const voices = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 10) {
    const res = await fetch('https://api.ai33.pro/v1m/voice/list', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ai33Key,
      },
      body: JSON.stringify({ page, page_size: 100, tag_list: [] }),
    });

    const data = await res.json();

    if (data.success && data.data?.voice_list) {
      for (const v of data.data.voice_list) voices.push(parseVoice(v, 'minimax', 'minimax'));
      hasMore = data.data.has_more === true;
      page++;
    } else {
      hasMore = false;
    }
  }

  return voices;
}

async function fetchAI33ElevenlabsVoices(ai33Key) {
  const voices = [];

  try {
    const res = await fetch('https://api.ai33.pro/v1/voices', {
      method: 'GET',
      headers: { 'xi-api-key': ai33Key },
    });

    const data = await res.json();
    const list = data.voices || [];

    for (const v of list) {
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
  } catch (err) {
    console.warn('AI33 ElevenLabs voices failed:', err.message);
  }

  return voices;
}

async function fetchAI33Clones(ai33Key) {
  const voices = [];
  const res = await fetch('https://api.ai33.pro/v1m/voice/clone', {
    method: 'GET',
    headers: { 'xi-api-key': ai33Key },
  });

  const data = await res.json();

  if (data.success && Array.isArray(data.data)) {
    for (const v of data.data) voices.push(parseVoice(v, 'minimax', 'cloned'));
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

    // ── Fetch from ALL sources in parallel ──────────────────────
    const promises = [];

    if (MINIMAX_KEY) {
      promises.push(
        fetchMinimaxDirectVoices(MINIMAX_KEY).catch(err => { console.warn('MiniMax direct voices:', err.message); return []; }),
        fetchMinimaxDirectClones(MINIMAX_KEY).catch(err => { console.warn('MiniMax direct clones:', err.message); return []; }),
      );
    }

    if (AI33_KEY) {
      promises.push(
        fetchAI33MinimaxVoices(AI33_KEY).catch(err => { console.warn('AI33 MiniMax voices:', err.message); return []; }),
        fetchAI33ElevenlabsVoices(AI33_KEY).catch(err => { console.warn('AI33 ElevenLabs voices:', err.message); return []; }),
        fetchAI33Clones(AI33_KEY).catch(err => { console.warn('AI33 clones:', err.message); return []; }),
      );
    }

    const results = await Promise.all(promises);
    const all = results.flat();

    // ── Count by source before dedup ────────────────────────────
    const counts = {
      minimax_direct: all.filter(v => v.provider === 'minimax_direct' && v.category !== 'cloned').length,
      ai33_minimax: all.filter(v => v.provider === 'minimax' && v.category !== 'cloned').length,
      ai33_elevenlabs: all.filter(v => v.provider === 'elevenlabs').length,
      cloned: all.filter(v => v.category === 'cloned').length,
    };

    console.log(`📋 Fetched: ${counts.minimax_direct} MiniMax Direct, ${counts.ai33_minimax} AI33 MiniMax, ${counts.ai33_elevenlabs} AI33 ElevenLabs, ${counts.cloned} Cloned`);

    return Response.json({
      success: true,
      voices: all,
      count: all.length,
      sources: counts,
    });

  } catch (error) {
    console.error(`❌ listMinimaxVoices: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
