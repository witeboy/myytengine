import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// ══════════════════════════════════════════════════════════════════
// DEDUP SCENES — Remove duplicate scenes from batch overlap
// ══════════════════════════════════════════════════════════════════
//
// Problem: generateSceneBreakdown batches can produce overlapping
// scenes where batch N+1 re-generates scenes already in batch N.
// This causes: 200 unique scenes → 400 total → double video length.
//
// Solution:
//   1. Sort scenes by scene_number
//   2. For each scene, check if narration matches any earlier scene
//      - Exact match: identical text
//      - Near match: >80% word overlap (catches minor rewording)
//   3. Delete duplicates (keep first occurrence)
//   4. Renumber remaining scenes 1, 2, 3... sequentially
//
// Run this BEFORE beat sync to get accurate durations.
// ══════════════════════════════════════════════════════════════════

function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet(text) {
  return new Set(normalizeText(text).split(' ').filter(w => w.length > 2));
}

function similarity(textA, textB) {
  const setA = wordSet(textA);
  const setB = wordSet(textB);
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  return intersection / Math.max(setA.size, setB.size);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { project_id, dry_run = false, threshold = 0.80 } = await req.json();
    if (!project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

    // Fetch all scenes
    const scenes = await base44.asServiceRole.entities.Scenes.filter({ project_id });
    const sorted = scenes.sort((a, b) => a.scene_number - b.scene_number);

    console.log(`🔍 Dedup: scanning ${sorted.length} scenes (threshold: ${threshold})`);

    // Phase 1: Find duplicates
    const keep = [];       // scenes to keep
    const duplicates = [];  // scenes to delete

    for (let i = 0; i < sorted.length; i++) {
      const scene = sorted[i];
      const narration = (scene.narration_text || '').trim();

      // Skip empty narration scenes — always keep them
      if (!narration) {
        keep.push(scene);
        continue;
      }

      const normalizedCurrent = normalizeText(narration);

      // Check if this scene's narration matches any KEPT scene
      let isDuplicate = false;
      let matchedScene = null;

      for (const kept of keep) {
        const keptNarration = (kept.narration_text || '').trim();
        if (!keptNarration) continue;

        const normalizedKept = normalizeText(keptNarration);

        // Exact match (after normalization)
        if (normalizedCurrent === normalizedKept) {
          isDuplicate = true;
          matchedScene = kept;
          break;
        }

        // Near match
        const sim = similarity(narration, keptNarration);
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
      }
    }

    console.log(`  Found ${duplicates.length} duplicates out of ${sorted.length} scenes`);
    console.log(`  Keeping ${keep.length} unique scenes`);

    if (dry_run) {
      return Response.json({
        success: true,
        dry_run: true,
        total_scenes: sorted.length,
        duplicates_found: duplicates.length,
        unique_scenes: keep.length,
        duplicates: duplicates.slice(0, 30), // show first 30
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

      // Log progress
      if ((deleted + deleteFailed) % 25 === 0) {
        console.log(`  Deleted ${deleted} / ${duplicates.length}...`);
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
          await base44.asServiceRole.entities.Scenes.update(remaining[i].id, {
            scene_number: newNumber,
          });
          renumbered++;
        } catch (err) {
          console.warn(`  Failed to renumber scene ${remaining[i].scene_number} → ${newNumber}`);
        }
      }

      if ((i + 1) % 50 === 0 || i === remaining.length - 1) {
        console.log(`  Renumbered ${i + 1}/${remaining.length}...`);
      }
    }

    console.log(`✓ Renumbered ${renumbered} scenes`);

    const stats = {
      original_scenes: sorted.length,
      duplicates_found: duplicates.length,
      deleted: deleted,
      delete_failed: deleteFailed,
      remaining_scenes: remaining.length,
      renumbered: renumbered,
      reduction_percent: Math.round((duplicates.length / sorted.length) * 100),
    };

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✓ Dedup complete: ${sorted.length} → ${remaining.length} scenes (${stats.reduction_percent}% reduction)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    return Response.json({
      success: true,
      stats,
      sample_duplicates: duplicates.slice(0, 10),
    });

  } catch (error) {
    console.error('dedupScenes error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});