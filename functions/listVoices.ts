import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';


// ══════════════════════════════════════════════════════════════════
// LIST VOICES — All via AI33 proxy
// ElevenLabs voices: /v2/voices + /v1/shared-voices
// MiniMax voices: /v1m/voice/list (standard) + /v1m/voice/clone (cloned)
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (!AI33_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    const headers = { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY };
    const allVoices = [];

    // ── ELEVENLABS VOICES via AI33 ─────────────────────────────────
    try {
      const [recRes, libRes] = await Promise.all([
        fetch('https://api.ai33.pro/v2/voices', { headers }),
        fetch('https://api.ai33.pro/v1/shared-voices?page_size=50&sort=usage_character_count_7d&page=0', { headers }),
      ]);

      if (recRes.ok) {
        const data = await recRes.json();
        const voices = data.voices || data || [];
        for (const v of voices) {
          allVoices.push({
            voice_id: v.voice_id,
            name: v.name,
            description: (v.description || '').substring(0, 100),
            preview_url: v.preview_url,
            labels: v.labels || {},
            category: 'elevenlabs',
            provider: 'elevenlabs',
          });
        }
        console.log(`✓ ElevenLabs recommended: ${voices.length}`);
      }

      if (libRes.ok) {
        const data = await libRes.json();
        const voices = data.voices || [];
        for (const v of voices) {
          allVoices.push({
            voice_id: v.voice_id,
            name: v.name,
            description: (v.description || '').substring(0, 100),
            preview_url: v.preview_url,
            labels: { accent: v.accent, gender: v.gender, age: v.age, use_case: v.use_case },
            category: 'elevenlabs_library',
            provider: 'elevenlabs',
          });
        }
        console.log(`✓ ElevenLabs library: ${voices.length}`);
      }
    } catch (e) {
      console.warn('ElevenLabs voice list error:', e.message);
    }

    // ── MINIMAX VOICES via AI33 ────────────────────────────────────
    try {
      const [mmRes, cloneRes] = await Promise.all([
        fetch('https://api.ai33.pro/v1m/voice/list', {
          method: 'POST',
          headers,
          body: JSON.stringify({ page: 1, page_size: 100, tag_list: [] }),
        }),
        fetch('https://api.ai33.pro/v1m/voice/clone', { headers }),
      ]);

      if (mmRes.ok) {
        const data = await mmRes.json();
        const voices = data.data?.voice_list || [];
        for (const v of voices) {
          allVoices.push({
            voice_id: v.voice_id,
            name: v.voice_name || v.voice_id,
            description: (v.tag_list || []).join(', '),
            preview_url: v.sample_audio || null,
            labels: {
              accent: (v.tag_list || []).find(t => t.includes('EN-') || t === 'English') || '',
              gender: (v.tag_list || []).find(t => t === 'Male' || t === 'Female')?.toLowerCase() || '',
              age: (v.tag_list || []).find(t => t.includes('Age') || t === 'Young' || t === 'Middle Age') || '',
              use_case: 'narration',
            },
            category: 'minimax',
            provider: 'minimax',
          });
        }
        console.log(`✓ MiniMax standard: ${voices.length}`);
      }

      if (cloneRes.ok) {
        const data = await cloneRes.json();
        const voices = data.data || [];
        for (const v of voices) {
          allVoices.push({
            voice_id: v.voice_id,
            name: v.voice_name || v.voice_id,
            description: 'Cloned voice',
            preview_url: v.sample_audio || null,
            labels: { accent: '', gender: '', age: '', use_case: 'cloned' },
            category: 'minimax_cloned',
            provider: 'minimax',
          });
        }
        console.log(`✓ MiniMax cloned: ${voices.length}`);
      }
    } catch (e) {
      console.warn('MiniMax voice list error:', e.message);
    }

    // Deduplicate
    const seen = new Set();
    const unique = allVoices.filter(v => {
      if (seen.has(v.voice_id)) return false;
      seen.add(v.voice_id);
      return true;
    });

    const categoryCounts = {};
    for (const v of unique) categoryCounts[v.category] = (categoryCounts[v.category] || 0) + 1;
    console.log(`VOICE_TOTAL: ${unique.length}, categories: ${JSON.stringify(categoryCounts)}`);

    return Response.json({ success: true, voices: unique, total: unique.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});