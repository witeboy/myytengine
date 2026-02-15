import { useState, useRef, useCallback } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

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

export default function useVideoExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);
  const encoderRef = useRef(null);
  const wakeLockRef = useRef(null);

  // Acquire wake lock to prevent browser from throttling/sleeping
  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        // Re-acquire on visibility change
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
        const support = await VideoEncoder.isConfigSupported({
          codec, width: preset.width, height: preset.height, bitrate: preset.bitrate,
        });
        if (support.supported) return { supported: true, warning: false, codec };
      } catch {}
    }
    return { supported: true, warning: true, reason: `${quality} H.264 encoding may not be fully supported. Try a lower quality if export fails.`, codec: profiles[0] };
  }, []);

  const loadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });

  const loadVideoElement = (url) => new Promise((resolve, reject) => {
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
    if (mediaType === 'video') { sw = media.videoWidth || 1; sh = media.videoHeight || 1; }
    else { sw = media.naturalWidth || media.width || 1; sh = media.naturalHeight || media.height || 1; }
    const scale = Math.min(w / sw, h / sh);
    const dw = sw * scale, dh = sh * scale;
    ctx.drawImage(media, (w - dw) / 2, (h - dh) / 2, dw, dh);
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

    // Acquire wake lock to keep tab active
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

      // ----- PHASE 1: Pre-render all frames as ImageBitmaps -----
      // This avoids needing media elements during encoding (which causes codec reclaim)
      setPhase('loading');
      
      const canvas = new OffscreenCanvas(W, H);
      const ctx = canvas.getContext('2d');
      const allBitmaps = []; // store ImageBitmap per frame

      let bitmapIdx = 0;
      for (let si = 0; si < scenes.length; si++) {
        if (cancelledRef.current) throw new Error('cancelled');

        const scene = scenes[si];
        const dur = scene.duration_seconds || 8;
        const sceneFrames = Math.ceil(dur * fps);
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

        // Pre-render every frame for this scene
        if (media && mediaType === 'video') {
          await seekVideo(media, 0);
        }

        for (let f = 0; f < sceneFrames; f++) {
          if (cancelledRef.current) throw new Error('cancelled');

          if (media && mediaType === 'video') {
            await seekVideo(media, f / fps);
          }

          drawFrame(ctx, canvas, media, mediaType);
          // Capture as ImageBitmap (independent of source media)
          const bitmap = await createImageBitmap(canvas);
          allBitmaps.push(bitmap);
          bitmapIdx++;

          // Update progress (0-40% for pre-rendering)
          if (bitmapIdx % 15 === 0) {
            setProgress(Math.round((bitmapIdx / totalFrames) * 40));
            // Use MessageChannel for yielding - NOT setTimeout (which gets throttled in background tabs)
            await new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = r; ch.port2.postMessage(null); });
          }
        }
      }

      // ----- PHASE 2: Encode all pre-rendered bitmaps (no media dependency) -----
      setPhase('encoding');

      const muxCfg = {
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: W, height: H },
        fastStart: 'in-memory',
      };
      if (hasAudio) {
        muxCfg.audio = { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 };
      }
      const muxer = new Muxer(muxCfg);

      let encodeError = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { encodeError = e; },
      });
      encoderRef.current = videoEncoder;
      videoEncoder.configure({ codec: videoCodec, width: W, height: H, bitrate: BR, framerate: fps });

      let audioEncoder = null;
      if (hasAudio) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => { console.warn('Audio encode error:', e); },
        });
        audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 });
      }

      // Encode bitmaps in tight batches to keep encoder busy and prevent "inactivity" reclaim
      const BATCH_SIZE = 60; // encode 60 frames (2s @ 30fps) per batch before yielding
      for (let i = 0; i < allBitmaps.length; i++) {
        if (cancelledRef.current) throw new Error('cancelled');
        if (encodeError) throw encodeError;

        const timestamp = Math.round(i * (1_000_000 / fps));
        const frame = new VideoFrame(allBitmaps[i], { timestamp });
        videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
        frame.close();
        allBitmaps[i].close(); // free memory immediately

        // Yield every BATCH_SIZE frames using MessageChannel (background-safe)
        if ((i + 1) % BATCH_SIZE === 0) {
          setProgress(40 + Math.round((i / allBitmaps.length) * 35));
          await new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = r; ch.port2.postMessage(null); });
        }
      }

      if (cancelledRef.current) throw new Error('cancelled');

      // ----- PHASE 3: Audio -----
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

        const CHUNK = sampleRate;
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

      // ----- PHASE 4: Finalize -----
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