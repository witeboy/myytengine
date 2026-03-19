/**
 * Phase 1: Canvas-based Preview Engine + rAF Playhead Loop
 * 
 * High-performance playback engine that bypasses React's render cycle.
 * Uses requestAnimationFrame for 60fps playhead updates and Canvas API
 * for compositing video frames + captions + effects.
 */
import { useRef, useCallback, useEffect } from 'react';

export default function usePlaybackEngine({ totalDuration, onTimeUpdate, onPlaybackEnd }) {
  const playheadRef = useRef(0);       // Current time in seconds (float)
  const isPlayingRef = useRef(false);
  const rafIdRef = useRef(null);
  const startWallRef = useRef(0);      // Wall-clock ms when play started
  const startOffsetRef = useRef(0);    // Playhead position when play started

  const tick = useCallback(() => {
    if (!isPlayingRef.current) return;
    const elapsed = (performance.now() - startWallRef.current) / 1000;
    const newTime = startOffsetRef.current + elapsed;

    if (newTime >= totalDuration) {
      playheadRef.current = 0;
      isPlayingRef.current = false;
      onTimeUpdate?.(0);
      onPlaybackEnd?.();
      return;
    }

    playheadRef.current = newTime;
    onTimeUpdate?.(newTime);
    rafIdRef.current = requestAnimationFrame(tick);
  }, [totalDuration, onTimeUpdate, onPlaybackEnd]);

  const play = useCallback(() => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;
    startWallRef.current = performance.now();
    startOffsetRef.current = playheadRef.current;
    rafIdRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const seek = useCallback((time) => {
    const t = Math.max(0, Math.min(totalDuration, time));
    playheadRef.current = t;
    if (isPlayingRef.current) {
      startWallRef.current = performance.now();
      startOffsetRef.current = t;
    }
    onTimeUpdate?.(t);
  }, [totalDuration, onTimeUpdate]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) pause();
    else play();
  }, [play, pause]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  return {
    play,
    pause,
    seek,
    toggle,
    getTime: () => playheadRef.current,
    isPlaying: () => isPlayingRef.current,
  };
}