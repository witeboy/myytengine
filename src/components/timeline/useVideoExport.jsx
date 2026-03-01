import { useState, useRef, useCallback } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { base44 } from '@/api/base44Client';

const QUALITY_PRESETS = {
  '1080p': { width: 1920, height: 1080, bitrate: 5_000_000 },
  '720p': { width: 1280, height: 720, bitrate: 3_000_000 },
  '480p': { width: 854, height: 480, bitrate: 1_500_000 },
};

const PORTRAIT_PRESETS = {
  '1080p': { width: 1080, height: 1920, bitrate: 5_000_000 },
  '720p': { width: 720, height: 1280, bitrate: 3_000_000 },
  '480p': { width: 480, height: 854, bitrate: 1_500_000 },
};

// Yield via MessageChannel (not throttled in background tabs unlike setTimeout)
const yieldToMain = () => new Promise(r => {
  const ch = new MessageChannel();
  ch.port1.onmessage = r;
  ch.port2.postMessage(null);
});

export default function useVideoExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);
  const encoderRef = useRef(null);
  const wakeLockRef = useRef(null);

  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', reacquireWakeLock);
      }
    } catch {}
  };
  const reacquireWakeLock = async () => {
    if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
      try { wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch {}
    }
  };
  const releaseWakeLock = () => {
    document.removeEventListener('visibilitychange', reacquireWakeLock);
    try { wakeLockRef.current?.release(); } catch {}
    wakeLockRef.current = null;
  };

  const checkSupport = useCallback(async (quality, orientation) => {
    if (!('VideoEncoder' in window)) {
      return { supported: false, warning: false, reason: 'Your browser does not support WebCodecs. Please use Chrome 94+ or Edge 94+.' };
    }
    const presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
    const preset = presets[quality];
    const profiles = ['avc1.42001e', 'avc1.4d001e', 'avc1.640028', 'avc1.42001f'];
    for (const codec of profiles) {
      try {
        const support = await VideoEncoder.isConfigSupported({ codec, width: preset.width, height: preset.height, bitrate: preset.bitrate });
        if (support.supported) return { supported: true, warning: false, codec };
      } catch {}
    }
    return { supported: true, warning: true, reason: `${quality} H.264 encoding may not be fully supported. Try a lower quality if export fails.`, codec: profiles[0] };
  }, []);

  // ═══ CORS-safe image loading ═══
  // Images from tempfile.aiquickdraw.com etc. block CORS, so <img crossOrigin>
  // fails and canvas frames become black. Fix: fetch as blob → createImageBitmap.
  // Fallback: backend proxy for CORS-blocked domains.
  const loadImage = async (url) => {
    // Method 1: Direct fetch as blob (works if server sends CORS headers)
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        return await createImageBitmap(blob);
      }
    } catch {}

    // Method 2: Backend proxy (for CORS-blocked domains)
    try {
      console.log(`📥 Export proxy: ${url.substring(0, 60)}`);
      const proxyRes = await base44.functions.invoke('proxyFetchAsset', { url });
      const data = proxyRes.data || proxyRes;
      if (data.success && data.data) {
        const binary = atob(data.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: data.content_type || 'image/png' });
        return await createImageBitmap(blob);
      }
    } catch (e) {
      console.warn(`Proxy image failed: ${url.substring(0, 60)} — ${e.message}`);
    }

    // Method 3: Last resort — try without crossOrigin (tainted canvas, VideoFrame may throw)
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('All image load methods failed'));
      img.src = url;
    });
  };

  // ═══ CORS-safe video loading ═══
  // Fetch video as blob → create blob URL → load video element from same-origin blob.
  const loadVideoElement = async (url) => {
    let blobUrl = null;

    // Method 1: Direct fetch as blob
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        blobUrl = URL.createObjectURL(blob);
      }
    } catch {}

    // Method 2: Load with crossOrigin (some CDNs support it)
    if (!blobUrl) {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        const timer = setTimeout(() => reject(new Error('Video load timeout')), 30000);
        video.onloadeddata = () => { clearTimeout(timer); resolve(video); };
        video.onerror = () => { clearTimeout(timer); reject(new Error('Failed to load video')); };
        video.src = url;
      });
    }

    // Load from blob URL (same-origin, always CORS-safe)
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      const timer = setTimeout(() => { URL.revokeObjectURL(blobUrl); reject(new Error('timeout')); }, 30000);
      video.onloadeddata = () => { clearTimeout(timer); video._blobUrl = blobUrl; resolve(video); };
      video.onerror = () => { clearTimeout(timer); URL.revokeObjectURL(blobUrl); reject(new Error('load failed')); };
      video.src = blobUrl;
    });
  };

  const seekVideo = (video, time) => new Promise((resolve) => {
    const target = Math.max(0, Math.min(time, (video.duration || 0) - 0.01));
    if (Math.abs(video.currentTime - target) < 0.05) { resolve(); return; }
    const timer = setTimeout(resolve, 500);
    video.onseeked = () => { clearTimeout(timer); resolve(); };
    video.currentTime = target;
  });

  const drawFrame = (ctx, canvas, media, mediaType) => {
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!media) return;
    let sw, sh;
    if (mediaType === 'video') {
      sw = media.videoWidth || media.width || 1;
      sh = media.videoHeight || media.height || 1;
    } else {
      // Works for Image, ImageBitmap, and HTMLImageElement
      sw = media.naturalWidth || media.width || 1;
      sh = media.naturalHeight || media.height || 1;
    }
    const scale = Math.min(w / sw, h / sh);
    const dw = sw * scale, dh = sh * scale;
    try {
      ctx.drawImage(media, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } catch (e) {
      console.warn('drawFrame failed (CORS tainted?):', e.message);
      // Black frame fallback
    }
  };

  const decodeAudio = async (url) => {
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    const actx = new AudioContext({ sampleRate: 48000 });
    const decoded = await actx.decodeAudioData(buf);
    await actx.close();
    return decoded;
  };

  const exportVideo = useCallback(async (scenes, opts) => {
    const { quality = '720p', orientation = 'landscape', fps = 30, voiceoverUrl, musicUrl, musicVolume = 0.3 } = opts || {};

    cancelledRef.current = false;
    setExporting(true);
    setProgress(0);
    setPhase('checking');
    setError(null);

    await acquireWakeLock();

    try {
      const presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
      const preset = presets[quality];
      const W = preset.width, H = preset.height, BR = preset.bitrate;
      const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_seconds || 8), 0);
      const totalFrames = Math.ceil(totalDuration * fps);
      const hasAudio = !!(voiceoverUrl || musicUrl);

      // Find working codec
      let videoCodec = 'avc1.42001e';
      for (const c of ['avc1.42001e', 'avc1.4d001e', 'avc1.640028']) {
        try {
          const s = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: BR });
          if (s.supported) { videoCodec = c; break; }
        } catch {}
      }

      // Setup muxer
      const muxCfg = {
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: W, height: H },
        fastStart: 'in-memory',
      };
      if (hasAudio) {
        muxCfg.audio = { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 };
      }
      const muxer = new Muxer(muxCfg);

      // Video encoder
      let encodeError = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { encodeError = e; },
      });
      encoderRef.current = videoEncoder;
      videoEncoder.configure({ codec: videoCodec, width: W, height: H, bitrate: BR, framerate: fps });

      // Audio encoder
      let audioEncoder = null;
      if (hasAudio) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => { console.warn('Audio encode error:', e); },
        });
        audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 });
      }

      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d');

      // ===== PHASE 1: Load all scene media first =====
      setPhase('loading');
      const sceneMedia = [];
      for (let i = 0; i < scenes.length; i++) {
        if (cancelledRef.current) throw new Error('cancelled');
        setProgress(Math.round((i / scenes.length) * 15));
        const scene = scenes[i];
        const vidUrl = scene.video_url || '';
        const imgUrl = scene.image_url || '';
        const validVid = vidUrl.startsWith('http');
        const validImg = imgUrl.startsWith('http');
        let media = null, mediaType = 'image';

        if (validVid) {
          try { media = await loadVideoElement(vidUrl); mediaType = 'video'; }
          catch { if (validImg) try { media = await loadImage(imgUrl); } catch {} }
        } else if (validImg) {
          try { media = await loadImage(imgUrl); } catch {}
        }
        sceneMedia.push({ media, mediaType });
      }

      // ===== PHASE 2: For IMAGE-only scenes, pre-render a single bitmap =====
      // (Much cheaper than storing all frames — one bitmap per image scene)
      // For video scenes we'll still seek frame-by-frame but with small batches
      setPhase('encoding');
      const imageBitmapCache = new Map(); // sceneIndex -> ImageBitmap

      for (let si = 0; si < scenes.length; si++) {
        const { media, mediaType } = sceneMedia[si];
        if (media && mediaType === 'image') {
          drawFrame(ctx, canvas, media, mediaType);
          imageBitmapCache.set(si, await createImageBitmap(canvas));
        }
      }

      // ===== PHASE 3: Encode frames — scene by scene, streaming =====
      // Key strategy: flush encoder frequently to prevent queue buildup & keep codec active
      let globalFrame = 0;
      const FLUSH_EVERY = fps * 3; // flush every ~3 seconds of video to keep codec alive
      let framesSinceFlush = 0;

      for (let si = 0; si < scenes.length; si++) {
        if (cancelledRef.current) throw new Error('cancelled');
        if (encodeError) throw encodeError;

        const dur = scenes[si].duration_seconds || 8;
        const sceneFrames = Math.ceil(dur * fps);
        const { media, mediaType } = sceneMedia[si];
        const cachedBitmap = imageBitmapCache.get(si);

        // For video, seek to start
        if (media && mediaType === 'video') {
          await seekVideo(media, 0);
        }

        for (let f = 0; f < sceneFrames; f++) {
          if (cancelledRef.current) throw new Error('cancelled');
          if (encodeError) throw encodeError;

          // Draw frame
          if (cachedBitmap) {
            // Image scene: draw cached bitmap (very fast, no media dependency)
            ctx.drawImage(cachedBitmap, 0, 0);
          } else if (media && mediaType === 'video') {
            await seekVideo(media, f / fps);
            drawFrame(ctx, canvas, media, mediaType);
          } else {
            // No media — black frame
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
          }

          const timestamp = Math.round(globalFrame * (1_000_000 / fps));
          const frame = new VideoFrame(canvas, { timestamp });
          videoEncoder.encode(frame, { keyFrame: globalFrame % (fps * 2) === 0 });
          frame.close();
          globalFrame++;
          framesSinceFlush++;

          // Flush periodically to keep codec active and prevent reclaim
          if (framesSinceFlush >= FLUSH_EVERY) {
            await videoEncoder.flush();
            framesSinceFlush = 0;
          }

          // Yield every 8 frames via MessageChannel (not throttled in background)
          if (globalFrame % 8 === 0) {
            setProgress(15 + Math.round((globalFrame / totalFrames) * 60));
            await yieldToMain();
          }
        }
      }

      // Free image bitmap cache
      for (const bm of imageBitmapCache.values()) bm.close();
      imageBitmapCache.clear();

      if (cancelledRef.current) throw new Error('cancelled');

      // ===== PHASE 4: Audio =====
      if (hasAudio && audioEncoder) {
        setPhase('audio');
        setProgress(78);

        const sampleRate = 48000;
        const totalSamples = Math.ceil(totalDuration * sampleRate);
        const mixedL = new Float32Array(totalSamples);
        const mixedR = new Float32Array(totalSamples);

        const audioSources = [];
        if (voiceoverUrl) try { audioSources.push({ buf: await decodeAudio(voiceoverUrl), vol: 1.0, loop: false }); } catch (e) { console.warn('Voiceover decode failed:', e); }
        if (musicUrl) try { audioSources.push({ buf: await decodeAudio(musicUrl), vol: musicVolume, loop: true }); } catch (e) { console.warn('Music decode failed:', e); }

        for (const { buf, vol, loop } of audioSources) {
          const chCount = Math.min(buf.numberOfChannels, 2);
          const chData = [];
          for (let c = 0; c < chCount; c++) chData.push(buf.getChannelData(c));
          for (let i = 0; i < totalSamples; i++) {
            const srcIdx = loop ? (i % buf.length) : i;
            if (srcIdx >= buf.length) break;
            mixedL[i] += chData[0][srcIdx] * vol;
            mixedR[i] += chData[Math.min(1, chCount - 1)][srcIdx] * vol;
          }
        }

        for (let i = 0; i < totalSamples; i++) {
          mixedL[i] = Math.max(-1, Math.min(1, mixedL[i]));
          mixedR[i] = Math.max(-1, Math.min(1, mixedR[i]));
        }

        const CHUNK = sampleRate; // 1s chunks
        for (let offset = 0; offset < totalSamples; offset += CHUNK) {
          if (cancelledRef.current) throw new Error('cancelled');
          const len = Math.min(CHUNK, totalSamples - offset);
          const planar = new Float32Array(len * 2);
          planar.set(mixedL.subarray(offset, offset + len), 0);
          planar.set(mixedR.subarray(offset, offset + len), len);

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames: len,
            numberOfChannels: 2,
            timestamp: Math.round((offset / sampleRate) * 1_000_000),
            data: planar,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
        setProgress(90);
      }

      // ===== PHASE 5: Finalize =====
      setPhase('finalizing');
      setProgress(95);

      await videoEncoder.flush();
      if (audioEncoder) await audioEncoder.flush();
      muxer.finalize();
      videoEncoder.close();
      audioEncoder?.close();
      encoderRef.current = null;

      const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      setProgress(100);
      setPhase('done');
      setExporting(false);
      releaseWakeLock();
      return blob;

    } catch (e) {
      try { encoderRef.current?.close(); } catch {}
      encoderRef.current = null;
      releaseWakeLock();

      if (e.message === 'cancelled') {
        setExporting(false);
        setPhase('');
        setProgress(0);
        return null;
      }
      console.error('Export failed:', e);
      setError(e.message || 'Export failed unexpectedly');
      setExporting(false);
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    try { encoderRef.current?.close(); } catch {}
    encoderRef.current = null;
    releaseWakeLock();
    setExporting(false);
    setPhase('');
    setProgress(0);
    setError(null);
  }, []);

  return { exporting, progress, phase, error, exportVideo, checkSupport, cancel, QUALITY_PRESETS, PORTRAIT_PRESETS };
}