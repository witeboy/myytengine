import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const API_KEY = Deno.env.get('AI33_API_KEY');
    if (!API_KEY) {
      return Response.json({ error: 'AI33_API_KEY not configured' }, { status: 500 });
    }

    const headers = {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
    };

    // Fetch default voices
    const voicesResponse = await fetch('https://api.ai33.pro/v2/voices', {
      method: 'GET',
      headers,
    });

    let defaultVoices = [];
    if (voicesResponse.ok) {
      const voicesData = await voicesResponse.json();
      defaultVoices = voicesData.voices || voicesData || [];
    }

    // Fetch shared/public voice library — paginate through pages using page= param
    let libraryVoices = [];
    try {
      let hasMore = true;
      let page = 0;
      const maxPages = 5; // Up to ~500 voices

      while (hasMore && page < maxPages) {
        const url = `https://api.ai33.pro/v1/shared-voices?page_size=100&sort=usage_character_count_7d&page=${page}`;
        const libResponse = await fetch(url, { method: 'GET', headers });
        if (!libResponse.ok) break;

        const libData = await libResponse.json();
        const voices = libData.voices || [];
        
        for (const v of voices) {
          libraryVoices.push({
            voice_id: v.voice_id,
            name: v.name,
            preview_url: v.preview_url,
            labels: {
              accent: v.accent,
              gender: v.gender,
              age: v.age,
              use_case: v.use_case,
              descriptive: v.descriptive,
            },
            description: v.description,
            category: 'library',
            usage_count: v.usage_character_count_7d || 0,
          });
        }

        page++;
        hasMore = libData.has_more === true && voices.length > 0;
      }
      
      console.log(`VOICE_COUNT: library=${libraryVoices.length} pages=${page}`);
    } catch (e) {
      console.log('Library fetch failed, using defaults only:', e.message);
    }

    // Mark default voices
    const taggedDefaults = defaultVoices.map(v => ({
      ...v,
      category: v.category || 'default',
    }));

    // Merge: defaults first, then library voices that aren't duplicates
    const defaultIds = new Set(taggedDefaults.map(v => v.voice_id));
    const combined = [
      ...taggedDefaults,
      ...libraryVoices.filter(v => !defaultIds.has(v.voice_id)),
    ];

    console.log(`VOICE_TOTAL: combined=${combined.length} defaults=${taggedDefaults.length} lib=${libraryVoices.length}`);

    return Response.json({
      success: true,
      voices: combined,
      total: combined.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});