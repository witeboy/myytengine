/**
 * Phase 3: Magnetic Snapping Engine
 * 
 * Provides snap-to-edge logic for clips being dragged on the timeline.
 * Scans all tracks for snap targets (clip edges + playhead).
 */

const SNAP_THRESHOLD_PX = 12; // pixels

/**
 * Find the nearest snap point within threshold.
 * @param {number} positionPx - Current position in pixels
 * @param {number} widthPx - Width of the dragged clip in pixels
 * @param {Array} allClips - All clips across all tracks
 * @param {string} draggedId - ID of the clip being dragged (excluded from targets)
 * @param {number} playheadPx - Playhead position in pixels
 * @param {number} pps - Pixels per second
 * @returns {{ snappedPx: number, snapLinePx: number|null, edge: string|null }}
 */
export function findSnapPoint(positionPx, widthPx, allClips, draggedId, playheadPx, pps) {
  // Gather all snap targets
  const targets = [playheadPx];
  for (const clip of allClips) {
    if (clip.id === draggedId) continue;
    targets.push(clip.startTime * pps);
    targets.push((clip.startTime + clip.duration) * pps);
  }

  const startPx = positionPx;
  const endPx = positionPx + widthPx;

  let bestDist = Infinity;
  let bestSnap = null;
  let bestEdge = null;

  for (const target of targets) {
    // Check start edge
    const distStart = Math.abs(startPx - target);
    if (distStart < SNAP_THRESHOLD_PX && distStart < bestDist) {
      bestDist = distStart;
      bestSnap = target;
      bestEdge = 'start';
    }
    // Check end edge
    const distEnd = Math.abs(endPx - target);
    if (distEnd < SNAP_THRESHOLD_PX && distEnd < bestDist) {
      bestDist = distEnd;
      bestSnap = target - widthPx;
      bestEdge = 'end';
    }
  }

  if (bestSnap !== null) {
    return {
      snappedPx: bestSnap,
      snapLinePx: bestEdge === 'start' ? bestSnap : bestSnap + widthPx,
      edge: bestEdge,
    };
  }

  return { snappedPx: positionPx, snapLinePx: null, edge: null };
}

/**
 * Magnetic gap-closing: reorder clips on a track so there are no gaps.
 * Only for the main video track.
 * @param {Array} clips - Clips on the track
 * @returns {Array} - Clips with recalculated start times
 */
export function closeGaps(clips) {
  const sorted = [...clips].sort((a, b) => a.startTime - b.startTime);
  let cursor = 0;
  return sorted.map(clip => {
    const updated = { ...clip, startTime: cursor };
    cursor += clip.duration;
    return updated;
  });
}

/**
 * Link audio/caption clips to their parent video clip.
 * When a video clip moves, linked clips move by the same delta.
 * @param {Array} linkedClips - Clips that may be anchored
 * @param {string} parentId - The video clip that moved
 * @param {number} delta - Time delta in seconds
 * @returns {Array} - Updated linked clips
 */
export function moveLinkedClips(linkedClips, parentId, delta) {
  return linkedClips.map(clip => {
    if (clip.anchorId === parentId) {
      return { ...clip, startTime: Math.max(0, clip.startTime + delta) };
    }
    return clip;
  });
}