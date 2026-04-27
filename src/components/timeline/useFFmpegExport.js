// ══════════════════════════════════════════════════════════════════
// useFFmpegExport.js — Web Worker FFmpeg export hook
//
// Spawns ffmpegWorker.js in a dedicated Web Worker so ffmpeg.wasm
// runs off the main thread — no UI freeze, no codec reclaim timeout.
// Uses the single-threaded UMD core (no SharedArrayBuffer needed).
//
// Usage:
//   const { exporting, progress, phase, error, exportVideo, cancel }
//     = useFFmpegExport();
//
//   const blobUrl = await exportVideo(scenes, opts);
// ══════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback } from 'react';

const QUALITY_PRESETS = {
  '1080p': { width: 1920, height: 1080 },
  '720p':  { width: 1280, height: 720  },
  '480p':  { width: 854,  height: 480  },
};

const PORTRAIT_PRESETS = {
  '1080p': { width: 1080, height: 1920 },
  '720p':  { width: 720,  height: 1280 },
  '480p':  { width: 480,  height: 854  },
};

export default function useFFmpegExport() {
  const [exporting,  setExporting]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [phase,      setPhase]      = useState('');
  const [error,      setError]      = useState(null);
  const workerRef    = useRef(null);
  const resolveRef   = useRef(null);
  const rejectRef    = useRef(null);

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setExporting(false);
    setProgress(0);
    setPhase('');
    setError(null);
    if (rejectRef.current) rejectRef.current(new Error('cancelled'));
    resolveRef.current = null;
    rejectRef.current  = null;
  }, []);

  const exportVideo = useCallback(async (scenes, opts = {}) => {
    const {
      quality      = '720p',
      orientation  = 'landscape',
      fps          = 30,
      voiceoverUrl,
      musicUrl,
      musicVolume  = 0.3,
      musicClips   = [],
      captions     = [],
    } = opts;

    const isPortrait = orientation === 'portrait';
    const presets    = isPortrait ? PORTRAIT_PRESETS : QUALITY_PRESETS;
    const { width, height } = presets[quality] || presets['720p'];

    // Terminate any existing worker
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setExporting(true);
    setProgress(0);
    setPhase('loading');
    setError(null);

    return new Promise((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current  = reject;

      // Spawn the worker — Vite serves files from /public directly
      // We use a URL import so Vite bundles it correctly
      const worker = new Worker(
        new URL('/ffmpegWorker.js', import.meta.url),
        { type: 'classic' }   // classic = can use importScripts + dynamic import
      );
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { type, phase: p, message, percent, blobUrl, sizeBytes } = e.data;

        if (type === 'progress') {
          setPhase(p || '');
          setProgress(percent || 0);
        }

        if (type === 'log') {
          console.log('[FFmpegWorker]', message);
        }

        if (type === 'done') {
          setExporting(false);
          setProgress(100);
          setPhase('done');
          workerRef.current = null;
          resolve({ blobUrl, sizeBytes });
        }

        if (type === 'error') {
          const err = new Error(message || 'FFmpeg export failed');
          setError(err.message);
          setExporting(false);
          setPhase('');
          workerRef.current = null;
          reject(err);
        }
      };

      worker.onerror = (e) => {
        const err = new Error(e.message || 'Worker crashed');
        setError(err.message);
        setExporting(false);
        setPhase('');
        workerRef.current = null;
        reject(err);
      };

      // Send start message with full payload
      worker.postMessage({
        type: 'start',
        payload: {
          scenes,
          captions,
          voiceoverUrl,
          musicUrl,
          musicVolume,
          musicClips,
          quality,
          orientation,
          fps,
          width,
          height,
        },
      });
    });
  }, []);

  return {
    exporting,
    progress,
    phase,
    error,
    exportVideo,
    cancel,
    QUALITY_PRESETS,
    PORTRAIT_PRESETS,
  };
}
