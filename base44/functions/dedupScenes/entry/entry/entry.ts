import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// v2 — redeployed
// ══════════════════════════════════════════════════════════════════
// DEDUP SCENES — Fast duplicate removal
// ══════════════════════════════════════════════════════════════════

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, dry_run = false, threshold = 0.80 } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // Fetch scenes in batches to avoid timeout on large projects
    let allScenes = [];
    let offset = 0;
    const PAGE = 200;
    while (true) {
      const batch = await base44.asServiceRole.entities.Scenes.filter({ project_id }, 'scene_number', PAGE, offset);
      allScenes = allScenes.concat(batch);
      if (batch.length < PAGE) break;
      offset += PAGE;
    }

    const sorted = allScenes.sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
    console.log(`🔍 Dedup: ${sorted.length} scenes`);

    // Find duplicates using normalized text hash (O(n))
    const keep = [];
    const duplicates = [];
    const seenHashes = new Map();

    for (const scene of sorted) {
      const narration = (scene.narration_text || '').trim();
      if (!narration) { keep.push(scene); continue; }

      const normalized = normalizeText(narration);

      if (seenHashes.has(normalized)) {
        const matched = seenHashes.get(normalized);
        duplicates.push({
          scene_id: scene.id, scene_number: scene.scene_number, 
          narration_preview: narration.substring(0, 60) + '...',
          matched_scene_number: matched.scene_number,
          matched_preview: (matched.narration_text || '').substring(0, 60) + '...',
        });
        continue;
      }

      // Near-match: only check scenes with similar word count (within 50%)
      let isDuplicate = false;
      let matchedScene = null;
      const words = normalized.split(' ').filter(w => w.length > 2);
      const wc = words.length;

      if (wc >= 4) {
        const wordSet = new Set(words);
        for (const kept of keep) {
          const kn = (kept.narration_text || '').trim();
          if (!kn) continue;
          const kWords = normalizeText(kn).split(' ').filter(w => w.length > 2);
          if (kWords.length < wc * 0.5 || kWords.length > wc * 2) continue;
          const overlap = kWords.filter(w => wordSet.has(w)).length;
          if (overlap / Math.max(wc, kWords.length) >= threshold) {
            isDuplicate = true;
            matchedScene = kept;
            break;
          }
        }
      }

      if (isDuplicate) {
        duplicates.push({
          scene_id: scene.id, scene_number: scene.scene_number,
          narration_preview: narration.substring(0, 60) + '...',
          matched_scene_number: matchedScene.scene_number,
          matched_preview: (matchedScene.narration_text || '').substring(0, 60) + '...',
        });
      } else {
        keep.push(scene);
        seenHashes.set(normalized, scene);
      }
    }

    console.log(`  ${duplicates.length} duplicates, ${keep.length} unique`);

    if (dry_run) {
      return Response.json({
        success: true, dry_run: true,
        total_scenes: sorted.length,
        duplicates_found: duplicates.length,
        unique_scenes: keep.length,
        duplicates: duplicates.slice(0, 30),
      });
    }

    // Delete duplicates in parallel batches
    let deleted = 0;
    const BATCH = 10;
    for (let i = 0; i < duplicates.length; i += BATCH) {
      const batch = duplicates.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(d => base44.asServiceRole.entities.Scenes.delete(d.scene_id))
      );
      deleted += results.filter(r => r.status === 'fulfilled').length;
    }
    console.log(`✓ Deleted ${deleted}/${duplicates.length}`);

    // Renumber in parallel batches
    const remaining = keep.sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
    let renumbered = 0;
    const renumberOps = remaining
      .map((s, i) => ({ id: s.id, oldNum: s.scene_number, newNum: i + 1 }))
      .filter(op => op.oldNum !== op.newNum);

    for (let i = 0; i < renumberOps.length; i += BATCH) {
      const batch = renumberOps.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(op => base44.asServiceRole.entities.Scenes.update(op.id, { scene_number: op.newNum }))
      );
      renumbered += results.filter(r => r.status === 'fulfilled').length;
    }
    console.log(`✓ Renumbered ${renumbered}`);

    const stats = {
      original_scenes: sorted.length,
      duplicates_found: duplicates.length,
      deleted,
      delete_failed: duplicates.length - deleted,
      remaining_scenes: remaining.length,
      renumbered,
      reduction_percent: sorted.length > 0 ? Math.round((duplicates.length / sorted.length) * 100) : 0,
    };

    return Response.json({ success: true, stats, sample_duplicates: duplicates.slice(0, 10) });

  } catch (error) {
    console.error('dedupScenes error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});