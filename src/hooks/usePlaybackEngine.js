/**
 * usePlaybackEngine v2 — Audio-Master Clock
 * 
 * PROBLEM SOLVED: v1 used performance.now() as the time source, which
 * drifts from the <audio> element's internal clock. Over 30-60s of
 * playback, the visual playhead (driven by RAF) diverges from the
 * audible voiceover by 50-150ms — enough to make scene transitions
 * visually land on the wrong beat.
 *
 * SOLUTION: When an audioRef is provided, the <audio> element IS the
 * clock. The RAF loop simply reads audio.currentTime each frame and
 * propagates it. No dual-clock drift is possible because there's only
 * one clock.
 *
 * Falls back to performance.now() wall-clock when no audio is present
 * (image-only timelines with no voiceover).
 */
import { useRef, useCallback, useEffect } from 'react';

export default function usePlaybackEngine({
  totalDuration,
  onTimeUpdate,
  onPlaybackEnd,
  audioRef = null,       // NEW: ref to the <audio> element (voiceover)
  musicRef = null,       // NEW: ref to the <audio> element (music)
}) {
  const playheadRef = useRef(0);
  const isPlayingRef = useRef(false);
  const rafIdRef = useRef(null);
  // Wall-clock fallback (only used when no audioRef)
  const startWallRef = useRef(0);
  const startOffsetRef = useRef(0);

  /**
   * Determine if we should use the audio element as master clock.
   * Requirements: audioRef exists, has a src, and duration is valid.
   */
  const useAudioClock = useCallback(() => {
    const el = audioRef?.current;
    return !!(el && el.src && el.duration && isFinite(el.duration) && el.duration > 0);
  }, [audioRef]);

  const tick = useCallback(() => {
    if (!isPlayingRef.current) return;

    let newTime;

    if (useAudioClock()) {
      // ══ AUDIO-MASTER MODE ══
      // Read directly from the audio element — zero drift by definition.
      // The audio element's internal clock is the single source of truth.
      const audioEl = audioRef.current;
      newTime = audioEl.currentTime;

      // If audio has stalled/buffering, we stall too — this is correct
      // behavior because the voiceover IS the timeline.
    } else {
      // ══ WALL-CLOCK FALLBACK ══
      // No voiceover audio — use performance.now() like v1.
      const elapsed = (performance.now() - startWallRef.current) / 1000;
      newTime = startOffsetRef.current + elapsed;
    }

    if (newTime >= totalDuration) {
      playheadRef.current = 0;
      isPlayingRef.current = false;
      // Pause audio elements
      if (audioRef?.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (musicRef?.current) {
        musicRef.current.pause();
      }
      onTimeUpdate?.(0);
      onPlaybackEnd?.();
      return;
    }

    playheadRef.current = newTime;
    onTimeUpdate?.(newTime);
    rafIdRef.current = requestAnimationFrame(tick);
  }, [totalDuration, onTimeUpdate, onPlaybackEnd, useAudioClock, audioRef, musicRef]);

  const play = useCallback(() => {
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    if (useAudioClock()) {
      // Audio-master: start the audio, RAF reads from it
      const audioEl = audioRef.current;
      audioEl.currentTime = playheadRef.current;
      audioEl.play().catch(() => {});
    } else {
      // Wall-clock fallback
      startWallRef.current = performance.now();
      startOffsetRef.current = playheadRef.current;
    }

    rafIdRef.current = requestAnimationFrame(tick);
  }, [tick, useAudioClock, audioRef]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Pause audio elements — they no longer free-run
    if (audioRef?.current) {
      audioRef.current.pause();
    }
    if (musicRef?.current) {
      musicRef.current.pause();
    }
  }, [audioRef, musicRef]);

  const seek = useCallback((time) => {
    const t = Math.max(0, Math.min(totalDuration, time));
    playheadRef.current = t;

    if (useAudioClock()) {
      // Seek the audio element — it's the master
      audioRef.current.currentTime = t;
    }

    if (isPlayingRef.current) {
      // Reset wall-clock offset for fallback mode
      startWallRef.current = performance.now();
      startOffsetRef.current = t;
    }

    onTimeUpdate?.(t);
  }, [totalDuration, onTimeUpdate, useAudioClock, audioRef]);

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