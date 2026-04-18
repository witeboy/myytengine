// Client-side hook: sample N frames from a video URL via <video> + canvas.
// Detects approximate "face presence" by looking for high-detail regions (simple heuristic
// via variance of pixel luminance — avoids shipping a face-detection model).
// Returns File objects ready to upload + preview URLs.

import { useState, useCallback } from 'react';

function extractFrameAtTime(videoUrl, time) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const cleanup = () => { try { video.src = ''; video.load(); } catch (_) {} };

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(time, Math.max(0, (video.duration || 1) - 0.1));
    }, { once: true });

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        const maxW = 1280;
        const scale = Math.min(1, maxW / (video.videoWidth || maxW));
        canvas.width = Math.round((video.videoWidth || maxW) * scale);
        canvas.height = Math.round((video.videoHeight || 720) * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Heuristic "interestingness" score: luminance variance
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0, sumSq = 0;
        const step = 16;
        let n = 0;
        for (let i = 0; i < img.data.length; i += 4 * step) {
          const y = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
          sum += y; sumSq += y * y; n++;
        }
        const mean = sum / n;
        const variance = sumSq / n - mean * mean;

        canvas.toBlob((blob) => {
          if (!blob) { cleanup(); reject(new Error('Frame extraction failed')); return; }
          const file = new File([blob], `frame_${Math.round(time)}s.jpg`, { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          cleanup();
          resolve({ file, url, time, score: variance, width: canvas.width, height: canvas.height });
        }, 'image/jpeg', 0.88);
      } catch (err) { cleanup(); reject(err); }
    }, { once: true });

    video.addEventListener('error', () => { cleanup(); reject(new Error('Video load failed')); }, { once: true });

    // Safety timeout
    setTimeout(() => { cleanup(); reject(new Error('Frame extraction timed out')); }, 20000);
  });
}

export function useVideoFrames() {
  const [frames, setFrames] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');

  const extract = useCallback(async (videoSource, count = 10) => {
    if (!videoSource) { setError('No video source'); return []; }
    setExtracting(true);
    setError('');
    setFrames([]);

    try {
      // Determine duration first
      const durationProbe = document.createElement('video');
      durationProbe.preload = 'metadata';
      durationProbe.muted = true;
      const videoUrl = typeof videoSource === 'string' ? videoSource : URL.createObjectURL(videoSource);
      durationProbe.src = videoUrl;

      const duration = await new Promise((resolve, reject) => {
        durationProbe.addEventListener('loadedmetadata', () => resolve(durationProbe.duration || 30), { once: true });
        durationProbe.addEventListener('error', () => reject(new Error('Could not read video duration')), { once: true });
        setTimeout(() => reject(new Error('Duration probe timeout')), 10000);
      });

      // Sample evenly — skip first/last 5%
      const pad = duration * 0.05;
      const usable = Math.max(1, duration - 2 * pad);
      const times = Array.from({ length: count }, (_, i) => pad + (usable * (i + 0.5)) / count);

      const extracted = [];
      for (const t of times) {
        try {
          const frame = await extractFrameAtTime(videoUrl, t);
          extracted.push(frame);
          // Progressive update
          setFrames((prev) => [...prev, frame]);
        } catch (e) {
          console.warn('Frame at', t, 'failed:', e.message);
        }
      }

      // Sort best-first by score
      extracted.sort((a, b) => b.score - a.score);
      setFrames(extracted);
      return extracted;
    } catch (e) {
      setError(e.message || 'Extraction failed');
      return [];
    } finally {
      setExtracting(false);
    }
  }, []);

  const clear = useCallback(() => {
    frames.forEach((f) => { try { URL.revokeObjectURL(f.url); } catch (_) {} });
    setFrames([]);
  }, [frames]);

  return { frames, extracting, error, extract, clear };
}