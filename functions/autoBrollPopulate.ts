import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ══════════════════════════════════════════════════════════════════
// AUTO B-ROLL POPULATE
// AI-driven service that:
//  1. Reads all scenes from a project
//  2. Uses Gemini to extract optimal search queries per scene
//  3. Searches Pexels + Pixabay in parallel for each query
//  4. Ranks results by relevance and populates scene records
// ══════════════════════════════════════════════════════════════════

const BATCH_SIZE = 10; // Scenes per Gemini call

async function callGemini(prompt, temperature = 0.3) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: 4096, responseMimeType: "application/json" }
      })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Gemini ${response.status}: ${err.error?.message || "Unknown"}`);
  }
  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try { return JSON.parse(rawText); } catch (_) {
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    return JSON.parse(cleaned);
  }
}

async function searchPexels(query, orientation) {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) return [];
  const params = new URLSearchParams({
    query, per_page: '5', page: '1',
    orientation: orientation === 'portrait' ? 'portrait' : 'landscape',
  });
  try {
    const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
      headers: { 'Authorization': apiKey }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.videos || []).map(v => {
      const files = v.video_files || [];
      const hd = files.find(f => f.quality === 'hd' && f.width >= 1280);
      const sd = files.find(f => f.quality === 'sd');
      const best = hd || sd || files[0];
      return {
        id: `pexels-${v.id}`,
        source: 'pexels',
        name: v.url?.split('/').pop()?.replace(/-/g, ' ') || '',
        thumbnail: v.image,
        downloadUrl: best?.link,
        duration: v.duration,
        width: best?.width,
        height: best?.height,
        author: v.user?.name,
      };
    });
  } catch (e) { console.warn('Pexels error:', e.message); return []; }
}

async function searchPixabay(query) {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey) return [];
  const params = new URLSearchParams({
    key: apiKey, q: query, video_type: 'film',
    per_page: '5', safesearch: 'true', order: 'popular',
  });
  try {
    const res = await fetch(`https://pixabay.com/api/videos/?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.hits || []).map(v => {
      const vids = v.videos || {};
      const best = vids.large || vids.medium || vids.small || {};
      return {
        id: `pixabay-${v.id}`,
        source: 'pixabay',
        name: v.tags || '',
        thumbnail: `https://i.vimeocdn.com/video/${v.picture_id}_295x166.jpg`,
        downloadUrl: best.url,
        duration: v.duration,
        width: best.width,
        height: best.height,
        author: v.user,
      };
    });
  } catch (e) { console.warn('Pixabay error:', e.message); return []; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const [projects, allScenes] = await Promise.all([
      base44.asServiceRole.entities.Projects.filter({ id: project_id }),
      base44.asServiceRole.entities.Scenes.filter({ project_id }),
    ]);

    const project = projects[0];
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const scenes = allScenes
      .filter(s => s.narration_text?.trim())
      .sort((a, b) => a.scene_number - b.scene_number);

    if (scenes.length === 0) {
      return Response.json({ success: true, populated: 0, message: 'No scenes with narration found' });
    }

    const orientation = project.orientation || 'landscape';
    const niche = project.niche || 'general';

    console.log(`🎬 Auto B-Roll: ${scenes.length} scenes | niche: ${niche} | orientation: ${orientation}`);

    // Process scenes in batches through Gemini
    let totalPopulated = 0;
    const results = [];

    for (let batchStart = 0; batchStart < scenes.length; batchStart += BATCH_SIZE) {
      const batch = scenes.slice(batchStart, batchStart + BATCH_SIZE);

      // Step 1: Ask Gemini to generate optimal search queries
      const sceneSummaries = batch.map(s => ({
        scene_number: s.scene_number,
        narration: (s.narration_text || '').substring(0, 300),
        mood: s.emotional_tone || '',
        environment: s.scene_environment || '',
      }));

      const geminiPrompt = `You are a B-roll video researcher for a ${niche} YouTube channel.

For each scene below, generate 2 search queries optimized for stock video sites (Pexels, Pixabay).
The queries should find GENERIC, ATMOSPHERIC footage — NOT specific people or branded content.
Focus on: environments, moods, textures, nature, abstract visuals, establishing shots.

RULES:
- Queries must be 2-5 words each (stock sites work best with short queries)
- First query: the PRIMARY visual concept (e.g. "city skyline night", "ocean waves sunset")
- Second query: an ALTERNATIVE angle or metaphor (e.g. "lonely street rain", "golden light window")
- Avoid: character names, specific brands, complex scenes that stock footage won't have
- Think about what would LOOK GOOD as background footage while someone narrates

SCENES:
${sceneSummaries.map(s => `Scene ${s.scene_number}: "${s.narration}"`).join('\n')}

Return JSON:
{
  "queries": [
    {"scene_number": 1, "primary": "ocean waves sunset", "alternative": "golden horizon calm"},
    ...
  ]
}`;

      let queries;
      try {
        const geminiResult = await callGemini(geminiPrompt);
        queries = geminiResult.queries || [];
      } catch (err) {
        console.warn(`Gemini batch error: ${err.message} — falling back to narration keywords`);
        // Fallback: extract first 4 words from narration
        queries = batch.map(s => ({
          scene_number: s.scene_number,
          primary: (s.narration_text || '').split(/\s+/).slice(0, 4).join(' '),
          alternative: niche + ' background',
        }));
      }

      // Step 2: Search Pexels + Pixabay for each scene
      const searchPromises = batch.map(async (scene) => {
        const q = queries.find(q => q.scene_number === scene.scene_number);
        if (!q) return { scene, videos: [] };

        // Search both queries across both sources in parallel
        const [pexPrimary, pixPrimary, pexAlt, pixAlt] = await Promise.all([
          searchPexels(q.primary, orientation),
          searchPixabay(q.primary),
          searchPexels(q.alternative, orientation),
          searchPixabay(q.alternative),
        ]);

        // Merge and deduplicate
        const allVideos = [...pexPrimary, ...pixPrimary, ...pexAlt, ...pixAlt];
        const seen = new Set();
        const unique = allVideos.filter(v => {
          if (!v.downloadUrl || seen.has(v.downloadUrl)) return false;
          seen.add(v.downloadUrl);
          return true;
        });

        // Rank: prefer longer clips, HD, and primary query results
        const ranked = unique.sort((a, b) => {
          // Prefer videos with actual download URLs
          if (a.downloadUrl && !b.downloadUrl) return -1;
          if (!a.downloadUrl && b.downloadUrl) return 1;
          // Prefer HD/larger resolution
          const aRes = (a.width || 0) * (a.height || 0);
          const bRes = (b.width || 0) * (b.height || 0);
          if (aRes !== bRes) return bRes - aRes;
          // Prefer longer clips (more usable)
          return (b.duration || 0) - (a.duration || 0);
        });

        return {
          scene,
          videos: ranked.slice(0, 3), // Top 3 candidates
          query: q,
        };
      });

      const batchResults = await Promise.all(searchPromises);

      // Step 3: Update scene records with best B-roll match
      for (const { scene, videos, query } of batchResults) {
        const best = videos[0];
        if (!best || !best.downloadUrl) {
          results.push({
            scene_number: scene.scene_number,
            status: 'no_match',
            query: query?.primary,
          });
          continue;
        }

        // Store B-roll data in dedicated scene fields
        try {
          await base44.asServiceRole.entities.Scenes.update(scene.id, {
            broll_url: best.downloadUrl,
            broll_source: best.source,
            broll_id: best.id,
            broll_thumbnail: best.thumbnail || '',
            broll_query: query?.primary || '',
          });
          totalPopulated++;
          results.push({
            scene_number: scene.scene_number,
            status: 'populated',
            source: best.source,
            query: query?.primary,
            url: best.downloadUrl?.substring(0, 80),
          });
        } catch (err) {
          console.warn(`Failed to update scene ${scene.scene_number}:`, err.message);
          results.push({
            scene_number: scene.scene_number,
            status: 'error',
            error: err.message,
          });
        }
      }

      console.log(`✓ Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ${batchResults.filter(r => r.videos.length > 0).length}/${batch.length} scenes matched`);

      // Rate limit courtesy
      if (batchStart + BATCH_SIZE < scenes.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`🎉 Auto B-Roll complete: ${totalPopulated}/${scenes.length} scenes populated`);

    return Response.json({
      success: true,
      populated: totalPopulated,
      total: scenes.length,
      results,
    });
  } catch (error) {
    console.error('autoBrollPopulate error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});