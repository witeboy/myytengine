import { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';

// ══════════════════════════════════════════════════════════════════
// useAudioSync — Hook for Audio-Based Timeline Synchronization
// ══════════════════════════════════════════════════════════════════
// Manages:
// - Loading audio durations
// - Calculating scene timings
// - Real-time playback position
// - Caption synchronization
// ══════════════════════════════════════════════════════════════════

export function useAudioSync(scenes = [], projectId) {
  const [syncedScenes, setSyncedScenes] = useState([]);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const audioRefs = useRef({});
  const audioCache = useRef({});

  // ═══ GET AUDIO DURATION ═══
  const getAudioDuration = useCallback(async (audioUrl) => {
    if (!audioUrl) return null;
    
    // Check cache
    if (audioCache.current[audioUrl]) {
      return audioCache.current[audioUrl];
    }

    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      
      const timeout = setTimeout(() => {
        resolve(null);
      }, 5000);

      audio.addEventListener('loadedmetadata', () => {
        clearTimeout(timeout);
        const duration = audio.duration;
        audioCache.current[audioUrl] = duration;
        resolve(duration);
      });

      audio.addEventListener('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });

      audio.src = audioUrl;
    });
  }, []);

  // ═══ ESTIMATE DURATION FROM TEXT ═══
  const estimateDurationFromText = useCallback((text) => {
    if (!text) return 5;
    
    const wordCount = text.split(/\s+/).length;
    // Average speaking rate: ~150 words per minute = 2.5 words per second
    const duration = wordCount / 2.5;
    
    // Add small buffer, min 2s, max 60s
    return Math.max(2, Math.min(60, Math.round(duration * 10) / 10 + 0.5));
  }, []);

  // ═══ SYNC SCENES TO AUDIO ═══
  const syncToAudio = useCallback(async () => {
    if (!scenes || scenes.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const sortedScenes = [...scenes].sort((a, b) => 
        (a.scene_number || 0) - (b.scene_number || 0)
      );

      let currentOffset = 0;
      const synced = [];

      for (const scene of sortedScenes) {
        let duration;

        // Priority 1: Get actual audio duration
        if (scene.audio_url) {
          duration = await getAudioDuration(scene.audio_url);
        }

        // Priority 2: Use existing audio_duration
        if (!duration && scene.audio_duration > 0) {
          duration = scene.audio_duration;
        }

        // Priority 3: Estimate from voiceover text
        if (!duration && scene.voiceover_text) {
          duration = estimateDurationFromText(scene.voiceover_text);
        }

        // Fallback
        if (!duration) {
          duration = 5;
        }

        synced.push({
          ...scene,
          start_time: currentOffset,
          end_time: currentOffset + duration,
          duration: duration,
          beat_synced: true,
          // Generate caption segments
          captions: generateCaptions(scene.voiceover_text, currentOffset, duration)
        });

        currentOffset += duration;
      }

      setSyncedScenes(synced);
      setTotalDuration(currentOffset);

      // Optionally save to backend
      if (projectId) {
        try {
          await base44.functions.invoke('syncMediaToAudio', { project_id: projectId });
        } catch (e) {
          console.log('Backend sync optional:', e);
        }
      }

    } catch (e) {
      setError(e.message);
    }

    setIsLoading(false);
  }, [scenes, projectId, getAudioDuration, estimateDurationFromText]);

  // ═══ GENERATE CAPTIONS FROM TEXT ═══
  const generateCaptions = (text, startTime, duration) => {
    if (!text) return [];

    // Split into sentences or chunks of ~8 words
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const captions = [];
    const timePerSentence = duration / sentences.length;

    sentences.forEach((sentence, idx) => {
      const words = sentence.trim().split(/\s+/);
      const captionStart = startTime + (idx * timePerSentence);
      const wordDuration = timePerSentence / words.length;

      captions.push({
        id: `cap-${startTime}-${idx}`,
        text: sentence.trim(),
        startTime: captionStart,
        endTime: captionStart + timePerSentence,
        duration: timePerSentence,
        words: words.map((word, wIdx) => ({
          word,
          startTime: captionStart + (wIdx * wordDuration),
          endTime: captionStart + ((wIdx + 1) * wordDuration)
        }))
      });
    });

    return captions;
  };

  // ═══ GET CURRENT SCENE AT TIME ═══
  const getSceneAtTime = useCallback((time) => {
    return syncedScenes.find(
      s => time >= s.start_time && time < s.end_time
    );
  }, [syncedScenes]);

  // ═══ GET CURRENT CAPTION AT TIME ═══
  const getCaptionAtTime = useCallback((time) => {
    for (const scene of syncedScenes) {
      if (!scene.captions) continue;
      const caption = scene.captions.find(
        c => time >= c.startTime && time < c.endTime
      );
      if (caption) {
        // Calculate which word is currently active
        const activeWord = caption.words.findIndex(
          w => time >= w.startTime && time < w.endTime
        );
        return { ...caption, activeWordIndex: activeWord };
      }
    }
    return null;
  }, [syncedScenes]);

  // ═══ AUTO-SYNC ON MOUNT ═══
  useEffect(() => {
    if (scenes.length > 0) {
      syncToAudio();
    }
  }, [scenes]);

  return {
    syncedScenes,
    totalDuration,
    isLoading,
    error,
    syncToAudio,
    getSceneAtTime,
    getCaptionAtTime,
    generateCaptions
  };
}

// ══════════════════════════════════════════════════════════════════
// usePlayback — Hook for Timeline Playback Control
// ══════════════════════════════════════════════════════════════════

export function usePlayback(totalDuration) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  
  const animationRef = useRef(null);
  const lastTimeRef = useRef(null);

  const play = useCallback(() => {
    setIsPlaying(true);
    lastTimeRef.current = Date.now();
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, play, pause]);

  const seek = useCallback((time) => {
    setCurrentTime(Math.max(0, Math.min(totalDuration, time)));
    lastTimeRef.current = Date.now();
  }, [totalDuration]);

  const skipForward = useCallback((seconds = 5) => {
    seek(currentTime + seconds);
  }, [currentTime, seek]);

  const skipBackward = useCallback((seconds = 5) => {
    seek(currentTime - seconds);
  }, [currentTime, seek]);

  const restart = useCallback(() => {
    seek(0);
  }, [seek]);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;

    const tick = () => {
      const now = Date.now();
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentTime(prev => {
        const next = prev + (delta * playbackRate);
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, totalDuration, playbackRate]);

  return {
    isPlaying,
    currentTime,
    playbackRate,
    play,
    pause,
    toggle,
    seek,
    skipForward,
    skipBackward,
    restart,
    setPlaybackRate
  };
}

export default useAudioSync;
