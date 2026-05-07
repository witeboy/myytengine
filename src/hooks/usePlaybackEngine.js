/**
 * usePlaybackEngine v3 — Unified RAF Loop
 * 
 * PROBLEM: v2 fixed clock drift but still pumps currentTime through
 * React state 60×/sec, causing full re-renders of the entire editor.
 * Every useMemo, useEffect, and child component re-evaluates each frame
 * even when nothing visible changed.
 *
 * SOLUTION: One RAF loop handles ALL time-dependent work:
 *   - Read master clock (audio element or wall-clock)
 *   - Binary-search for current clip (O(log n) not O(n))
 *   - Sync video element position
 *   - Sync music element position
 *   - Determine active captions + overlays
 *   - Only push to React state when something VISIBLE changed
 *
 * React re-renders only when:
 *   - The active clip changes (scene transition)
 *   - The active caption set changes
 *   - The timecode display needs updating (~4 fps is enough for display)
 *
 * Everything else stays in refs, never touching React.
 */
import { useRef, useCallback, useEffect, useState } from 'react';

// ── Binary search: find clip containing time t ────────────────────
// Clips must be sorted by startTime (they always are in this app).
// Returns the clip object or null.
function findClipAtTime(clips, t) {
  if (!clips || clips.length === 0) return null;
  let lo = 0, hi = clips.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = clips[mid];
    if (t < c.startTime) {
      hi = mid - 1;
    } else if (t >= c.startTime + c.duration) {
      lo = mid + 1;
    } else {
      return c;
    }
  }
  return null;
}

// ── Filter active items at time t ─────────────────────────────────
// Returns array of items where t is within [startTime, startTime+duration).
// Uses the fact that captions/overlays are roughly sorted by startTime
// to early-exit once we pass the window.
function findActiveAtTime(items, t) {
  if (!items || items.length === 0) return [];
  const active = [];
  for (let i = 0; i < items.length; i++) {
    const c = items[i];
    if (t >= c.startTime && t < c.startTime + c.duration) {
      active.push(c);
    }
  }
  return active;
}

// ── Compare two arrays of active items by ID ──────────────────────
function activeSetChanged(prev, next) {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id) return true;
  }
  return false;
}

export default function usePlaybackEngine({
  totalDuration,
  audioRef = null,
  musicRef = null,
  // Clip arrays — passed as refs or stable arrays
  videoClipsRef,      // { current: videoClips[] }
  captionClipsRef,    // { current: captionClips[] }
  overlayClipsRef,    // { current: overlayClips[] }
  musicClipsRef,      // { current: musicClips[] }
  // Video element in CanvasPreview
  previewVideoRef,    // { current: <video> element }
  // Callbacks — called only when visible state changes
  onTimeDisplay,      // (formattedTime: number) => void — throttled for UI
  onClipChange,       // (clip, prevClip, scene) => void — scene transition
  onCaptionsChange,   // (activeCaptions[]) => void
  onOverlaysChange,   // (activeOverlays[]) => void
  onPlaybackEnd,
}) {
  const playheadRef = useRef(0);
  const isPlayingRef = useRef(false);
  const rafIdRef = useRef(null);
  // Wall-clock fallback
  const startWallRef = useRef(0);
  const startOffsetRef = useRef(0);
  // Cached state to detect changes
  const lastClipIdRef = useRef(null);
  const lastCaptionIdsRef = useRef([]);
  const lastOverlayIdsRef = useRef([]);
  const lastDisplayFrameRef = useRef(0);
  // Throttle: update React time display at ~10fps (every 100ms), not 60fps
  const DISPLAY_INTERVAL = 0.1; // seconds

  const useAudioClock = useCallback(() => {
    const el = audioRef?.current;
    return !!(el && el.src && el.duration && isFinite(el.duration) && el.duration > 0);
  }, [audioRef]);

  const tick = useCallback(() => {
    if (!isPlayingRef.current) return;

    // ── 1. Read master clock ──────────────────────────────────────
    let t;
    if (useAudioClock()) {
      t = audioRef.current.currentTime;
    } else {
      const elapsed = (performance.now() - startWallRef.current) / 1000;
      t = startOffsetRef.current + elapsed;
    }

    if (t >= totalDuration) {
      playheadRef.current = 0;
      isPlayingRef.current = false;
      if (audioRef?.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
      if (musicRef?.current) { musicRef.current.pause(); }
      onTimeDisplay?.(0);
      onPlaybackEnd?.();
      return;
    }

    playheadRef.current = t;

    // ── 2. Find current video clip (binary search) ────────────────
    const clips = videoClipsRef?.current;
    const currentClip = clips ? findClipAtTime(clips, t) : null;
    const clipChanged = (currentClip?.id ?? null) !== lastClipIdRef.current;

    if (clipChanged) {
      lastClipIdRef.current = currentClip?.id ?? null;
      // Find previous clip for transitions
      let prevClip = null;
      if (currentClip && clips) {
        const idx = clips.findIndex(c => c.id === currentClip.id);
        if (idx > 0) prevClip = clips[idx - 1];
      }
      onClipChange?.(currentClip, prevClip);
    }

    // ── 3. Sync preview video element ─────────────────────────────
    const vidEl = previewVideoRef?.current;
    if (vidEl && currentClip?.videoUrl) {
      const rate = currentClip.playbackRate ?? 1.0;
      if (Math.abs(vidEl.playbackRate - rate) > 0.005) vidEl.playbackRate = rate;
      const elapsed = Math.max(0, t - (currentClip.startTime ?? 0));
      const vidPos = Math.min(
        elapsed * rate,
        (vidEl.duration && vidEl.duration < Infinity ? vidEl.duration : 99) - 0.05
      );
      // Force-seek on clip change, 30ms threshold otherwise
      if (clipChanged) {
        vidEl.currentTime = vidPos;
      } else if (Math.abs(vidEl.currentTime - vidPos) > 0.03) {
        vidEl.currentTime = vidPos;
      }
    }

    // ── 4. Sync music element ─────────────────────────────────────
    const mClips = musicClipsRef?.current;
    const mEl = musicRef?.current;
    if (mEl && mClips && mClips.length > 0) {
      const activeMusic = findClipAtTime(mClips, t);
      if (activeMusic) {
        const elapsed = t - activeMusic.startTime;
        const srcTime = (activeMusic.sourceOffset || 0) + elapsed;
        if (Math.abs(mEl.currentTime - srcTime) > 0.03) {
          mEl.currentTime = srcTime;
        }
        if (mEl.paused) mEl.play().catch(() => {});
      } else {
        if (!mEl.paused) mEl.pause();
      }
    }

    // ── 5. Active captions — only notify on change ────────────────
    const caps = captionClipsRef?.current;
    if (caps) {
      const activeCaps = findActiveAtTime(caps, t);
      if (activeSetChanged(lastCaptionIdsRef.current, activeCaps)) {
        lastCaptionIdsRef.current = activeCaps;
        onCaptionsChange?.(activeCaps);
      }
    }

    // ── 6. Active overlays — only notify on change ────────────────
    const ovs = overlayClipsRef?.current;
    if (ovs) {
      const activeOvs = findActiveAtTime(ovs, t);
      if (activeSetChanged(lastOverlayIdsRef.current, activeOvs)) {
        lastOverlayIdsRef.current = activeOvs;
        onOverlaysChange?.(activeOvs);
      }
    }

    // ── 7. Update time display (throttled — ~10fps) ───────────────
    if (Math.abs(t - lastDisplayFrameRef.current) >= DISPLAY_INTERVAL) {
      lastDisplayFrameRef.current = t;
      onTimeDisplay?.(t);
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, [
    totalDuration, useAudioClock, audioRef, musicRef,
    videoClipsRef, captionClipsRef, overlayClipsRef, musicClipsRef,
    previewVideoRef,
    onTimeDisplay, onClipChange, onCaptionsChange, onOverlaysChange, onPlaybackEnd,
  ]);

  const play = useCallback(() => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    if (useAudioClock()) {
      const audioEl = audioRef.current;
      audioEl.currentTime = playheadRef.current;
      audioEl.play().catch(() => {});
    } else {
      startWallRef.current = performance.now();
      startOffsetRef.current = playheadRef.current;
    }

    // Start music if there's an active clip at current position
    const mClips = musicClipsRef?.current;
    const mEl = musicRef?.current;
    if (mEl && mClips) {
      const activeMusic = findClipAtTime(mClips, playheadRef.current);
      if (activeMusic) {
        mEl.currentTime = (activeMusic.sourceOffset || 0) + (playheadRef.current - activeMusic.startTime);
        mEl.play().catch(() => {});
      }
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, [tick, useAudioClock, audioRef, musicRef, musicClipsRef]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (audioRef?.current) audioRef.current.pause();
    if (musicRef?.current) musicRef.current.pause();
  }, [audioRef, musicRef]);

  const seek = useCallback((time) => {
    const t = Math.max(0, Math.min(totalDuration, time));
    playheadRef.current = t;

    if (useAudioClock()) {
      audioRef.current.currentTime = t;
    }

    // Music seek with clip-relative offset
    const mClips = musicClipsRef?.current;
    if (musicRef?.current && mClips) {
      const activeMusic = findClipAtTime(mClips, t);
      if (activeMusic) {
        musicRef.current.currentTime = (activeMusic.sourceOffset || 0) + (t - activeMusic.startTime);
      }
    }

    if (isPlayingRef.current) {
      startWallRef.current = performance.now();
      startOffsetRef.current = t;
    }

    // Force immediate state update on seek (user expects instant feedback)
    onTimeDisplay?.(t);

    // Re-evaluate all active items immediately
    const clips = videoClipsRef?.current;
    const currentClip = clips ? findClipAtTime(clips, t) : null;
    if ((currentClip?.id ?? null) !== lastClipIdRef.current) {
      lastClipIdRef.current = currentClip?.id ?? null;
      let prevClip = null;
      if (currentClip && clips) {
        const idx = clips.findIndex(c => c.id === currentClip.id);
        if (idx > 0) prevClip = clips[idx - 1];
      }
      onClipChange?.(currentClip, prevClip);
    }

    const caps = captionClipsRef?.current;
    if (caps) {
      const activeCaps = findActiveAtTime(caps, t);
      lastCaptionIdsRef.current = activeCaps;
      onCaptionsChange?.(activeCaps);
    }

    const ovs = overlayClipsRef?.current;
    if (ovs) {
      const activeOvs = findActiveAtTime(ovs, t);
      lastOverlayIdsRef.current = activeOvs;
      onOverlaysChange?.(activeOvs);
    }
  }, [
    totalDuration, useAudioClock, audioRef, musicRef, musicClipsRef,
    videoClipsRef, captionClipsRef, overlayClipsRef,
    onTimeDisplay, onClipChange, onCaptionsChange, onOverlaysChange,
  ]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [play, pause]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return { play, pause, seek, toggle, getTime: () => playheadRef.current, isPlaying: () => isPlayingRef.current };
}