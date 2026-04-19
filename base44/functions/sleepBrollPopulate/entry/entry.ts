import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
// v2 — redeployed

// ══════════════════════════════════════════════════════════════════
// SLEEP B-ROLL POPULATE
// Purpose-built for sleep/meditation content.
// Uses dark nature + abstract ambient search queries instead of
// generic niche-based queries. Prioritizes moody, atmospheric footage.
// ══════════════════════════════════════════════════════════════════

const BATCH_SIZE = 8;

// ── SLEEP-SPECIFIC SEARCH QUERY POOLS ──
const SLEEP_QUERY_POOLS = {
  nature_dark: [
    'dark forest night', 'moonlit forest path', 'night forest mist',
    'dark pine trees fog', 'moonlight through trees', 'night woods peaceful',
    'dark woodland stream', 'forest floor moonlight', 'ancient forest night'
  ],
  nature_twilight: [
    'sunset ocean calm', 'twilight mountain lake', 'dusk meadow golden',
    'evening sky clouds', 'purple sunset horizon', 'golden hour nature',
    'twilight river peaceful', 'dusk forest silhouette', 'evening calm water'
  ],
  abstract_ambient: [
    'slow smoke dark background', 'abstract light particles dark',
    'gentle bokeh lights dark', 'floating particles slow motion',
    'soft light abstract dark', 'glowing orbs floating slow',
    'abstract water ripples dark', 'ink water slow motion', 'aurora lights slow'
  ],
  water: [
    'dark ocean waves night', 'rain on window night', 'calm lake moonlight',
    'underwater dark peaceful', 'rain puddle reflections night', 'ocean waves slow motion dark',
    'waterfall mist dark', 'stream gentle flow dark', 'rain drops slow motion'
  ],
  sky: [
    'starry night sky timelapse', 'milky way stars', 'aurora borealis slow',
    'night sky clouds moving', 'moon clouds night', 'stars twinkling dark sky',
    'nebula space dark', 'northern lights green', 'shooting star night'
  ],
  fire_warmth: [
    'candle flame dark room', 'fireplace fire slow', 'campfire embers night',
    'candle flickering dark', 'warm fire glow dark', 'lantern light dark',
    'fire sparks floating night', 'ember glow close up', 'candlelight meditation'
  ],
  mist_fog: [
    'fog rolling mountains', 'misty morning forest', 'fog dark landscape',
    'mist over water dawn', 'foggy path mysterious', 'low clouds valley',
    'steam rising dark', 'morning mist lake', 'fog light rays dark'
  ],
  cozy_interior: [
    'cozy room candlelight', 'dark bedroom rain window', 'fireplace cozy night',
    'reading nook dim light', 'cozy cabin interior night', 'warm blanket dim light',
    'tea steam dark background', 'cozy window rain night', 'dim library candles'
  ]
};

// Fallback queries for any type
const UNIVERSAL_SLEEP_QUERIES = [
  'peaceful nature dark', 'calm night scene', 'meditation background dark',
  'relaxing nature night', 'ambient dark atmosphere', 'serene landscape dark'
];

async function searchPexels(query, orientation) {
  const apiKey = Deno.env.get('PEXELS_API_KEY');
  if (!apiKey) return [];
  const params = new URLSearchParams({
    query, per_page: '6', page: '1',
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
        thumbnail: v.image,
        downloadUrl: best?.link,
        duration: v.duration,
        width: best?.width,
        height: best?.height,
      };
    });
  } catch (e) { console.warn('Pexels error:', e.message); return []; }
}

async function searchPixabay(query) {
  const apiKey = Deno.env.get('PIXABAY_API_KEY');
  if (!apiKey) return [];
  const params = new URLSearchParams({
    key: apiKey, q: query, video_type: 'film',
    per_page: '6', safesearch: 'true', order: 'popular',
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
        thumbnail: `https://i.vimeocdn.com/video/${v.picture_id}_295x166.jpg`,
        downloadUrl: best.url,
        duration: v.duration,
        width: best.width,
        height: best.height,
      };
    });
  } catch (e) { console.warn('Pixabay error:', e.message); return []; }
}

function pickQueryForScene(sleepVisualType, sceneIndex) {
  const pool = SLEEP_QUERY_POOLS[sleepVisualType] || SLEEP_QUERY_POOLS.nature_dark;
  // Rotate through pool to avoid duplicate searches
  const primary = pool[sceneIndex % pool.length];
  // Pick an alternative from a different pool for variety
  const altPools = Object.keys(SLEEP_QUERY_POOLS).filter(k => k !== sleepVisualType);
  const altPool = SLEEP_QUERY_POOLS[altPools[sceneIndex % altPools.length]];
  const alternative = altPool[sceneIndex % altPool.length];
  return { primary, alternative };
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
      return Response.json({ success: true, populated: 0, message: 'No scenes found' });
    }

    const orientation = project.orientation || 'landscape';
    console.log(`🌙 Sleep B-Roll: ${scenes.length} scenes | orientation: ${orientation}`);

    let totalPopulated = 0;
    const results = [];

    for (let batchStart = 0; batchStart < scenes.length; batchStart += BATCH_SIZE) {
      const batch = scenes.slice(batchStart, batchStart + BATCH_SIZE);

      const searchPromises = batch.map(async (scene, batchIdx) => {
        const globalIdx = batchStart + batchIdx;

        // Extract sleep_visual_type from director notes
        let sleepType = 'nature_dark';
        if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
          try {
            const notes = JSON.parse(scene.image_prompt.substring(15));
            sleepType = notes.sleep_visual_type || 'nature_dark';
          } catch (_) {}
        }

        const { primary, alternative } = pickQueryForScene(sleepType, globalIdx);

        // Search both queries across both sources
        const [pexP, pixP, pexA, pixA] = await Promise.all([
          searchPexels(primary, orientation),
          searchPixabay(primary),
          searchPexels(alternative, orientation),
          searchPixabay(alternative),
        ]);

        const allVideos = [...pexP, ...pixP, ...pexA, ...pixA];
        const seen = new Set();
        const unique = allVideos.filter(v => {
          if (!v.downloadUrl || seen.has(v.downloadUrl)) return false;
          seen.add(v.downloadUrl);
          return true;
        });

        // Rank: prefer longer clips (sleep content needs longer b-roll), HD
        const ranked = unique.sort((a, b) => {
          if (a.downloadUrl && !b.downloadUrl) return -1;
          if (!a.downloadUrl && b.downloadUrl) return 1;
          // Strongly prefer longer clips for sleep content
          const durDiff = (b.duration || 0) - (a.duration || 0);
          if (Math.abs(durDiff) > 3) return durDiff;
          const aRes = (a.width || 0) * (a.height || 0);
          const bRes = (b.width || 0) * (b.height || 0);
          return bRes - aRes;
        });

        return { scene, videos: ranked.slice(0, 3), query: primary, sleepType };
      });

      const batchResults = await Promise.all(searchPromises);

      for (const { scene, videos, query, sleepType } of batchResults) {
        const best = videos[0];
        if (!best || !best.downloadUrl) {
          // Try universal fallback
          const fallbackQuery = UNIVERSAL_SLEEP_QUERIES[totalPopulated % UNIVERSAL_SLEEP_QUERIES.length];
          const [fbPex, fbPix] = await Promise.all([
            searchPexels(fallbackQuery, orientation),
            searchPixabay(fallbackQuery),
          ]);
          const fbBest = [...fbPex, ...fbPix].find(v => v.downloadUrl);
          if (fbBest) {
            await base44.asServiceRole.entities.Scenes.update(scene.id, {
              broll_url: fbBest.downloadUrl,
              broll_source: fbBest.source,
              broll_id: fbBest.id,
              broll_thumbnail: fbBest.thumbnail || '',
              broll_query: fallbackQuery,
            });
            totalPopulated++;
            results.push({ scene_number: scene.scene_number, status: 'populated_fallback', query: fallbackQuery });
          } else {
            results.push({ scene_number: scene.scene_number, status: 'no_match', query });
          }
          continue;
        }

        await base44.asServiceRole.entities.Scenes.update(scene.id, {
          broll_url: best.downloadUrl,
          broll_source: best.source,
          broll_id: best.id,
          broll_thumbnail: best.thumbnail || '',
          broll_query: query,
        });
        totalPopulated++;
        results.push({ scene_number: scene.scene_number, status: 'populated', source: best.source, sleepType });
      }

      console.log(`✓ Batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: ${batchResults.filter(r => r.videos.length > 0).length}/${batch.length} scenes matched`);

      if (batchStart + BATCH_SIZE < scenes.length) {
        await new Promise(r => setTimeout(r, 1000)); 
      }
    }

    console.log(`🌙 Sleep B-Roll complete: ${totalPopulated}/${scenes.length} scenes populated`);

    return Response.json({
      success: true,
      populated: totalPopulated,
      total: scenes.length,
      results,
    });
  } catch (error) {
    console.error('sleepBrollPopulate error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});