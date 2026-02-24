import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// ══════════════════════════════════════════════════════════════════
// LIST VOICES — MiniMax primary, AI33 (ElevenLabs) fallback
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allVoices = [];
    let primaryProvider = 'none';

    // ── TRY MINIMAX FIRST ──────────────────────────────────────────
    const MINIMAX_KEY = Deno.env.get('MINIMAX_API_KEY');
    if (MINIMAX_KEY) {
      try {
        const mmRes = await fetch('https://api.minimax.io/v1/get_voice', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${MINIMAX_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ voice_type: 'all' }),
        });

        if (mmRes.ok) {
          const mmData = await mmRes.json();
          if (mmData.base_resp?.status_code === 0) {
            primaryProvider = 'minimax';

            // System voices
            const systemVoices = mmData.system_voice || [];
            for (const v of systemVoices) {
              // Only include English voices for now
              const id = v.voice_id || '';
              const name = v.voice_name || id;
              const desc = Array.isArray(v.description) ? v.description.join('. ') : (v.description || '');

              allVoices.push({
                voice_id: id,
                name: name,
                description: desc,
                preview_url: null, // MiniMax doesn't provide previews
                labels: {
                  accent: id.startsWith('English') ? 'English' : id.split('_')[0],
                  gender: desc.toLowerCase().includes('female') ? 'female' : desc.toLowerCase().includes('male') ? 'male' : '',
                  age: '',
                  use_case: 'narration',
                },
                category: 'minimax_system',
                provider: 'minimax',
              });
            }

            // Cloned voices
            const clonedVoices = mmData.voice_cloning || [];
            for (const v of clonedVoices) {
              allVoices.push({
                voice_id: v.voice_id,
                name: v.voice_id,
                description: Array.isArray(v.description) ? v.description.join('. ') : '',
                preview_url: null,
                labels: { accent: '', gender: '', age: '', use_case: 'cloned' },
                category: 'minimax_cloned',
                provider: 'minimax',
              });
            }

            // Generated voices
            const genVoices = mmData.voice_generation || [];
            for (const v of genVoices) {
              allVoices.push({
                voice_id: v.voice_id,
                name: v.voice_id,
                description: Array.isArray(v.description) ? v.description.join('. ') : '',
                preview_url: null,
                labels: { accent: '', gender: '', age: '', use_case: 'generated' },
                category: 'minimax_generated',
                provider: 'minimax',
              });
            }

            console.log(`✓ MiniMax voices loaded: ${allVoices.length} (system=${systemVoices.length}, cloned=${clonedVoices.length}, generated=${genVoices.length})`);
          }
        } else {
          console.warn(`MiniMax voice list failed: ${mmRes.status}`);
        }
      } catch (e) {
        console.warn('MiniMax voice list error:', e.message);
      }
    }

    // ── FALLBACK: AI33 (ElevenLabs) ────────────────────────────────
    const AI33_KEY = Deno.env.get('AI33_API_KEY');
    if (AI33_KEY) {
      try {
        const ai33Res = await fetch('https://api.ai33.pro/v2/voices', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': AI33_KEY,
          },
        });

        if (ai33Res.ok) {
          const ai33Data = await ai33Res.json();
          const defaultVoices = ai33Data.voices || ai33Data || [];

          for (const v of defaultVoices) {
            allVoices.push({
              voice_id: v.voice_id,
              name: v.name,
              description: v.description || '',
              preview_url: v.preview_url,
              labels: v.labels || {},
              category: 'ai33',
              provider: 'ai33',
            });
          }

          if (primaryProvider === 'none') primaryProvider = 'ai33';
          console.log(`✓ AI33 voices loaded: ${defaultVoices.length}`);
        }

        // Also fetch library voices from AI33
        let page = 0;
        let hasMore = true;
        while (hasMore && page < 3) {
          const libRes = await fetch(`https://api.ai33.pro/v1/shared-voices?page_size=100&sort=usage_character_count_7d&page=${page}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': AI33_KEY },
          });
          if (!libRes.ok) break;
          const libData = await libRes.json();
          const voices = libData.voices || [];
          for (const v of voices) {
            allVoices.push({
              voice_id: v.voice_id,
              name: v.name,
              description: v.description || '',
              preview_url: v.preview_url,
              labels: {
                accent: v.accent,
                gender: v.gender,
                age: v.age,
                use_case: v.use_case,
              },
              category: 'ai33_library',
              provider: 'ai33',
            });
          }
          page++;
          hasMore = libData.has_more === true && voices.length > 0;
        }
      } catch (e) {
        console.warn('AI33 voice list error:', e.message);
      }
    }

    // Deduplicate by voice_id
    const seen = new Set();
    const unique = allVoices.filter(v => {
      if (seen.has(v.voice_id)) return false;
      seen.add(v.voice_id);
      return true;
    });

    console.log(`VOICE_TOTAL: ${unique.length} (primary=${primaryProvider})`);

    return Response.json({
      success: true,
      voices: unique,
      total: unique.length,
      primary_provider: primaryProvider,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});