import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// DEDUP SCENES — Remove duplicate scenes from batch overlap
// ══════════════════════════════════════════════════════════════════
//
// Optimized: Uses normalized-text hash for exact duplicates (O(n)),
// then only checks similarity for scenes with similar word counts.
// ══════════════════════════════════════════════════════════════════

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordOverlap(textA, textB) {
  const wordsA = normalizeText(textA).split(' ').filter(w => w.length > 2);
  const wordsB = normalizeText(textB).split(' ').filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const setB = new Set(wordsB);
  const intersection = wordsA.filter(w => setB.has(w)).length;
  return intersection / Math.max(wordsA.length, wordsB.length);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, dry_run = false, threshold = 0.80 } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    const scenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    const sorted = scenes.sort((a, b) => a.scene_number - b.scene_number);

    console.log(`🔍 Dedup: scanning ${sorted.length} scenes (threshold: ${threshold})`);

    // Phase 1: Find duplicates — hash-first, then similarity
    const keep = [];
    const duplicates = [];
    const seenHashes = new Map(); // normalizedText → kept scene

    for (const scene of sorted) {
      const narration = (scene.narration_text || '').trim();

      if (!narration) {
        keep.push(scene);
        continue;
      }

      const normalized = normalizeText(narration);

      // Fast path: exact match via hash
      if (seenHashes.has(normalized)) {
        const matchedScene = seenHashes.get(normalized);
        duplicates.push({
          scene_id: scene.id,
          scene_number: scene.scene_number,
          narration_preview: narration.substring(0, 60) + '...',
          matched_scene_number: matchedScene.scene_number,
          matched_preview: (matchedScene.narration_text || '').substring(0, 60) + '...',
        });
        continue;
      }

      // Slow path: similarity check only against scenes with similar length
      const wordCount = normalized.split(' ').length;
      let isDuplicate = false;
      let matchedScene = null;

      for (const kept of keep) {
        const keptNarration = (kept.narration_text || '').trim();
        if (!keptNarration) continue;

        // Skip similarity check if word counts are too different (>2x)
        const keptWordCount = normalizeText(keptNarration).split(' ').length;
        if (wordCount > keptWordCount * 2 || keptWordCount > wordCount * 2) continue;

        const sim = wordOverlap(narration, keptNarration);
        if (sim >= threshold) {
          isDuplicate = true;
          matchedScene = kept;
          break;
        }
      }

      if (isDuplicate) {
        duplicates.push({
          scene_id: scene.id,
          scene_number: scene.scene_number,
          narration_preview: narration.substring(0, 60) + '...',
          matched_scene_number: matchedScene.scene_number,
          matched_preview: (matchedScene.narration_text || '').substring(0, 60) + '...',
        });
      } else {
        keep.push(scene);
        seenHashes.set(normalized, scene);
      }
    }

    console.log(`  Found ${duplicates.length} duplicates, keeping ${keep.length} unique scenes`);

    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        total_scenes: sorted.length,
        duplicates_found: duplicates.length,
        unique_scenes: keep.length,
        duplicates: duplicates.slice(0, 30),
      });
    }

    // Phase 2: Delete duplicates
    let deleted = 0;
    let deleteFailed = 0;

    for (const dup of duplicates) {
      try {
        await base44.asServiceRole.entities.Scenes.delete(dup.scene_id);
        deleted++;
      } catch (err) {
        deleteFailed++;
        console.warn(`  Failed to delete scene ${dup.scene_number}: ${err.message}`);
      }
    }

    console.log(`✓ Deleted ${deleted} duplicate scenes (${deleteFailed} failed)`);

    // Phase 3: Renumber remaining scenes sequentially
    const remaining = keep.sort((a, b) => a.scene_number - b.scene_number);
    let renumbered = 0;

    for (let i = 0; i < remaining.length; i++) {
      const newNumber = i + 1;
      if (remaining[i].scene_number !== newNumber) {
        try {
          await base44.asServiceRole.entities.Scenes.update(remaining[i].id, { scene_number: newNumber });
          renumbered++;
        } catch (err) {
          console.warn(`  Failed to renumber scene ${remaining[i].scene_number} → ${newNumber}`);
        }
      }
    }

    console.log(`✓ Renumbered ${renumbered} scenes`);

    const stats = {
      original_scenes: sorted.length,
      duplicates_found: duplicates.length,
      deleted,
      delete_failed: deleteFailed,
      remaining_scenes: remaining.length,
      renumbered,
      reduction_percent: Math.round((duplicates.length / sorted.length) * 100),
    };

    console.log(`✓ Dedup complete: ${sorted.length} → ${remaining.length} scenes (${stats.reduction_percent}% reduction)`);

    return Response.json({ success: true, stats, sample_duplicates: duplicates.slice(0, 10) });

  } catch (error) {
    console.error('dedupScenes error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});