import { useState, useRef, useCallback } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { base44 } from '@/api/base44Client';

const QUALITY_PRESETS = {
  '1080p': { width: 1920, height: 1080, bitrate: 5_000_000 },
  '720p':  { width: 1280, height: 720,  bitrate: 3_000_000 },
  '480p':  { width: 854,  height: 480,  bitrate: 1_500_000 },
};

const PORTRAIT_PRESETS = {
  '1080p': { width: 1080, height: 1920, bitrate: 5_000_000 },
  '720p':  { width: 720,  height: 1280, bitrate: 3_000_000 },
  '480p':  { width: 480,  height: 854,  bitrate: 1_500_000 },
};

// MessageChannel yield — not throttled in background tabs unlike setTimeout
const yieldToMain = () => new Promise(r => {
  const ch = new MessageChannel();
  ch.port1.onmessage = r;
  ch.port2.postMessage(null);
});

export default function useVideoExport() {
  const [exporting,  setExporting]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [phase,      setPhase]      = useState('');
  const [error,      setError]      = useState(null);
  const cancelledRef  = useRef(false);
  const encoderRef    = useRef(null);
  const wakeLockRef   = useRef(null);

  // ── Wake lock ──────────────────────────────────────────────────
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

  // ── Codec check ────────────────────────────────────────────────
  const checkSupport = useCallback(async (quality, orientation) => {
    if (!('VideoEncoder' in window)) {
      return { supported: false, warning: false, reason: 'Your browser does not support WebCodecs. Please use Chrome 94+ or Edge 94+.' };
    }
    const presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
    const preset  = presets[quality];
    const profiles = ['avc1.42001e', 'avc1.4d001e', 'avc1.640028', 'avc1.42001f'];
    for (const codec of profiles) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec, width: preset.width, height: preset.height, bitrate: preset.bitrate });
        if (s.supported) return { supported: true, warning: false, codec };
      } catch {}
    }
    return { supported: true, warning: true, reason: `${quality} H.264 encoding may not be fully supported. Try a lower quality if export fails.`, codec: profiles[0] };
  }, []);

  // ── CORS-safe image loader ─────────────────────────────────────
  const loadImage = async (url) => {
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (resp.ok) return await createImageBitmap(await resp.blob());
    } catch {}
    try {
      const proxyRes = await base44.functions.invoke('proxyFetchAsset', { url });
      const data = proxyRes.data || proxyRes;
      if (data.success && data.data) {
        const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
        return await createImageBitmap(new Blob([bytes], { type: data.content_type || 'image/png' }));
      }
    } catch (e) { console.warn(`Proxy image failed: ${url.substring(0, 60)} — ${e.message}`); }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error('All image load methods failed'));
      img.src = url;
    });
  };

  // ── CORS-safe video loader ─────────────────────────────────────
  const loadVideoElement = async (url) => {
    let blobUrl = null;
    try {
      const resp = await fetch(url, { mode: 'cors' });
      if (resp.ok) blobUrl = URL.createObjectURL(await resp.blob());
    } catch {}

    if (!blobUrl) {
      return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.muted = true; video.playsInline = true; video.preload = 'auto';
        const timer = setTimeout(() => reject(new Error('Video load timeout')), 30000);
        video.onloadeddata = () => { clearTimeout(timer); resolve(video); };
        video.onerror      = () => { clearTimeout(timer); reject(new Error('Failed to load video')); };
        video.src = url;
      });
    }

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.preload = 'auto';
      const timer = setTimeout(() => { URL.revokeObjectURL(blobUrl); reject(new Error('timeout')); }, 30000);
      video.onloadeddata = () => { clearTimeout(timer); video._blobUrl = blobUrl; resolve(video); };
      video.onerror      = () => { clearTimeout(timer); URL.revokeObjectURL(blobUrl); reject(new Error('load failed')); };
      video.src = blobUrl;
    });
  };

  // ── Precise video seek ─────────────────────────────────────────
  const seekVideo = (video, time) => new Promise((resolve) => {
    const dur    = video.duration || 0;
    const target = Math.max(0, Math.min(time, dur > 0 ? dur - 0.01 : 0));
    if (Math.abs(video.currentTime - target) < 0.04) { resolve(); return; }
    const timer = setTimeout(resolve, 500);
    video.onseeked = () => { clearTimeout(timer); resolve(); };
    video.currentTime = target;
  });

  // ── Canvas draw helper ─────────────────────────────────────────
  const drawFrame = (ctx, canvas, media, mediaType) => {
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!media) return;
    const sw = mediaType === 'video'
      ? (media.videoWidth  || media.width  || 1)
      : (media.naturalWidth || media.width || 1);
    const sh = mediaType === 'video'
      ? (media.videoHeight || media.height || 1)
      : (media.naturalHeight || media.height || 1);
    const scale = Math.min(w / sw, h / sh);
    const dw = sw * scale, dh = sh * scale;
    try { ctx.drawImage(media, (w - dw) / 2, (h - dh) / 2, dw, dh); }
    catch (e) { console.warn('drawFrame failed (CORS tainted?):', e.message); }
  };

  // ── Audio decode ───────────────────────────────────────────────
  const decodeAudio = async (url) => {
    const resp = await fetch(url);
    const buf  = await resp.arrayBuffer();
    const actx = new AudioContext({ sampleRate: 48000 });
    const decoded = await actx.decodeAudioData(buf);
    await actx.close();
    return decoded;
  };

  // ══════════════════════════════════════════════════════════════
  // MAIN EXPORT FUNCTION
  // ══════════════════════════════════════════════════════════════
  //
  // Each `scene` object is a merged clip+scene record with these fields:
  //
  //   scene.duration         — clip duration in the timeline (real-time seconds)
  //   scene.duration_seconds — same (fallback)
  //   scene.mediaType        — 'video' | 'image'  (set by user or AutoSync)
  //   scene.videoUrl / scene.video_url — URL of generated video clip
  //   scene.imageUrl / scene.image_url — URL of scene image
  //   scene.playbackRate     — speed factor (0.25–2.0, default 1.0)
  //                            < 1.0 = slow-mo (video stretched to fill beat)
  //                            > 1.0 = fast forward (video ends early)
  //   scene.videoDuration    — actual file duration in seconds (measured by AutoSync)
  //
  // HOW PLAYBACK RATE AFFECTS ENCODING:
  //
  //   At rate R, frame F of the OUTPUT maps to position (F * R / fps) in the
  //   SOURCE video file.
  //
  //   Examples:
  //     R=1.0: output frame 30 → source position 1.00s  (normal)
  //     R=0.7: output frame 30 → source position 0.70s  (slow-mo, video stretched)
  //     R=2.0: output frame 30 → source position 2.00s  (fast forward)
  //
  //   If the source position exceeds the video's actual duration, we hold the
  //   last frame for the remainder of the clip (freeze-frame at end).
  //
  // ══════════════════════════════════════════════════════════════
  const exportVideo = useCallback(async (scenes, opts) => {
    const {
      quality      = '720p',
      orientation  = 'landscape',
      fps          = 30,
      voiceoverUrl,
      musicUrl,
      musicVolume  = 0.3,
    } = opts || {};

    cancelledRef.current = false;
    setExporting(true);
    setProgress(0);
    setPhase('checking');
    setError(null);

    await acquireWakeLock();

    try {
      const presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
      const preset  = presets[quality];
      const W = preset.width, H = preset.height, BR = preset.bitrate;

      // ── Normalise scene fields ─────────────────────────────────
      // Accept both clip-style (duration, videoUrl, imageUrl, mediaType)
      // and scene-style (duration_seconds, video_url, image_url) keys.
      const normalisedScenes = scenes.map(s => ({
        duration:      s.duration      || s.duration_seconds || 8,
        mediaType:     s.mediaType     || (s.video_url?.startsWith('http') ? 'video' : 'image'),
        videoUrl:      s.videoUrl      || s.video_url  || '',
        imageUrl:      s.imageUrl      || s.image_url  || '',
        playbackRate:  s.playbackRate  ?? 1.0,
        videoDuration: s.videoDuration ?? null,  // null = not yet measured
      }));

      const totalDuration = normalisedScenes.reduce((sum, s) => sum + s.duration, 0);
      const totalFrames   = Math.ceil(totalDuration * fps);
      const hasAudio      = !!(voiceoverUrl || musicUrl);

      // ── Find working H.264 codec ───────────────────────────────
      let videoCodec = 'avc1.42001e';
      for (const c of ['avc1.42001e', 'avc1.4d001e', 'avc1.640028']) {
        try {
          const s = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: BR });
          if (s.supported) { videoCodec = c; break; }
        } catch {}
      }

      // ── Setup muxer ────────────────────────────────────────────
      const muxCfg = {
        target:     new ArrayBufferTarget(),
        video:      { codec: 'avc', width: W, height: H },
        fastStart:  'in-memory',
      };
      if (hasAudio) {
        muxCfg.audio = { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 };
      }
      const muxer = new Muxer(muxCfg);

      // ── Video encoder ──────────────────────────────────────────
      let encodeError = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error:  (e) => { encodeError = e; },
      });
      encoderRef.current = videoEncoder;
      videoEncoder.configure({ codec: videoCodec, width: W, height: H, bitrate: BR, framerate: fps });

      // ── Audio encoder ──────────────────────────────────────────
      let audioEncoder = null;
      if (hasAudio) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error:  (e) => { console.warn('Audio encode error:', e); },
        });
        audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 });
      }

      const canvas = new OffscreenCanvas(W, H);
      const ctx    = canvas.getContext('2d');

      // ═══════════════════════════════════════════════════════════
      // PHASE 1 — Load all media
      // For each scene:
      //   • If mediaType === 'video' → load video element
      //   • Else → load image bitmap
      //   • Also measure actual video duration for playbackRate clamping
      // ═══════════════════════════════════════════════════════════
      setPhase('loading');
      const sceneMedia = [];

      for (let i = 0; i < normalisedScenes.length; i++) {
        if (cancelledRef.current) throw new Error('cancelled');
        setProgress(Math.round((i / normalisedScenes.length) * 15));

        const scene = normalisedScenes[i];
        let media = null, mediaType = 'image', measuredVideoDur = null;

        const wantsVideo = scene.mediaType === 'video' && scene.videoUrl?.startsWith('http');
        const hasImg     = scene.imageUrl?.startsWith('http');

        if (wantsVideo) {
          try {
            media = await loadVideoElement(scene.videoUrl);
            mediaType = 'video';
            // Measure actual duration now (needed for clamp calculation)
            measuredVideoDur = (media.duration && isFinite(media.duration))
              ? media.duration
              : (scene.videoDuration ?? 6);
          } catch (e) {
            console.warn(`Scene ${i} video load failed, falling back to image:`, e.message);
            if (hasImg) try { media = await loadImage(scene.imageUrl); } catch {}
          }
        } else if (hasImg) {
          try { media = await loadImage(scene.imageUrl); } catch {}
        }

        sceneMedia.push({ media, mediaType, measuredVideoDur });
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 2 — Pre-render image bitmaps for image-only scenes
      // (one bitmap per image scene, reused for every frame)
      // ═══════════════════════════════════════════════════════════
      setPhase('encoding');
      const imageBitmapCache = new Map(); // sceneIndex → ImageBitmap

      for (let si = 0; si < normalisedScenes.length; si++) {
        const { media, mediaType } = sceneMedia[si];
        if (media && mediaType === 'image') {
          drawFrame(ctx, canvas, media, 'image');
          imageBitmapCache.set(si, await createImageBitmap(canvas));
        }
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 3 — Encode frames
      //
      // For VIDEO scenes:
      //   rate     = scene.playbackRate  (e.g. 0.7 for slow-mo)
      //   srcTime  = frameInClip * rate / fps
      //              → the position in the SOURCE video file
      //   Clamp srcTime to measuredVideoDur so we freeze on last
      //   frame rather than looping when rate < 1 fills past the
      //   video's actual end.
      //
      // For IMAGE scenes:
      //   Draw the cached bitmap every frame (no seeking needed).
      // ═══════════════════════════════════════════════════════════
      let globalFrame      = 0;
      const FLUSH_EVERY    = fps * 3; // flush encoder every ~3s of video
      let framesSinceFlush = 0;
      let lastVideoFrame   = new Map(); // si → last good bitmap (freeze-frame)

      for (let si = 0; si < normalisedScenes.length; si++) {
        if (cancelledRef.current) throw new Error('cancelled');
        if (encodeError)           throw encodeError;

        const scene           = normalisedScenes[si];
        const clipDuration    = scene.duration;              // real-time seconds
        const rate            = scene.playbackRate;          // speed multiplier
        const sceneFrames     = Math.ceil(clipDuration * fps);
        const { media, mediaType, measuredVideoDur } = sceneMedia[si];
        const cachedBitmap    = imageBitmapCache.get(si);
        const maxSrcTime      = measuredVideoDur ?? (scene.videoDuration ?? 999);

        for (let f = 0; f < sceneFrames; f++) {
          if (cancelledRef.current) throw new Error('cancelled');
          if (encodeError)           throw encodeError;

          if (cachedBitmap) {
            // ── Image clip — draw cached bitmap ─────────────────
            ctx.drawImage(cachedBitmap, 0, 0);

          } else if (media && mediaType === 'video') {
            // ── Video clip — seek to scaled position ─────────────
            // srcTime = position in the original video file
            //   • At rate=0.7: frame 21 → srcTime = 21 * 0.7 / 30 = 0.49s
            //   • At rate=1.0: frame 21 → srcTime = 21 * 1.0 / 30 = 0.70s
            //   • At rate=1.5: frame 21 → srcTime = 21 * 1.5 / 30 = 1.05s
            const srcTime = Math.min((f * rate) / fps, maxSrcTime - 0.02);

            if (srcTime >= maxSrcTime - 0.02) {
              // Past the end of the source video → freeze on last frame
              const frozen = lastVideoFrame.get(si);
              if (frozen) ctx.drawImage(frozen, 0, 0);
              else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
            } else {
              await seekVideo(media, srcTime);
              drawFrame(ctx, canvas, media, 'video');
              // Cache the bitmap for freeze-frame fallback
              const bm = await createImageBitmap(canvas);
              lastVideoFrame.get(si)?.close();
              lastVideoFrame.set(si, bm);
            }

          } else {
            // ── No media — black frame ────────────────────────────
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
          }

          // ── Encode the frame ───────────────────────────────────
          const timestamp = Math.round(globalFrame * (1_000_000 / fps));
          const vframe    = new VideoFrame(canvas, { timestamp });
          videoEncoder.encode(vframe, { keyFrame: globalFrame % (fps * 2) === 0 });
          vframe.close();
          globalFrame++;
          framesSinceFlush++;

          // Periodic encoder flush to keep codec alive
          if (framesSinceFlush >= FLUSH_EVERY) {
            await videoEncoder.flush();
            framesSinceFlush = 0;
          }

          // Yield every 8 frames to keep UI responsive
          if (globalFrame % 8 === 0) {
            setProgress(15 + Math.round((globalFrame / totalFrames) * 60));
            await yieldToMain();
          }
        }
      }

      // Free caches
      for (const bm of imageBitmapCache.values()) bm.close();
      imageBitmapCache.clear();
      for (const bm of lastVideoFrame.values()) bm.close();
      lastVideoFrame.clear();

      // Free video blob URLs
      for (const { media } of sceneMedia) {
        if (media?._blobUrl) URL.revokeObjectURL(media._blobUrl);
      }

      if (cancelledRef.current) throw new Error('cancelled');

      // ═══════════════════════════════════════════════════════════
      // PHASE 4 — Audio mix
      // Mix voiceover + music into a single stereo AAC track.
      // Audio is NOT affected by video playbackRate — the voiceover
      // is the master timeline (it was already synced by AutoSync).
      // ═══════════════════════════════════════════════════════════
      if (hasAudio && audioEncoder) {
        setPhase('audio');
        setProgress(78);

        const sampleRate   = 48000;
        const totalSamples = Math.ceil(totalDuration * sampleRate);
        const mixedL       = new Float32Array(totalSamples);
        const mixedR       = new Float32Array(totalSamples);

        const audioSources = [];
        if (voiceoverUrl) try { audioSources.push({ buf: await decodeAudio(voiceoverUrl), vol: 1.0,          loop: false }); } catch (e) { console.warn('Voiceover decode failed:', e); }
        if (musicUrl)     try { audioSources.push({ buf: await decodeAudio(musicUrl),     vol: musicVolume,  loop: true  }); } catch (e) { console.warn('Music decode failed:', e); }

        for (const { buf, vol, loop } of audioSources) {
          const chCount = Math.min(buf.numberOfChannels, 2);
          const chData  = [];
          for (let c = 0; c < chCount; c++) chData.push(buf.getChannelData(c));
          for (let i = 0; i < totalSamples; i++) {
            const srcIdx = loop ? (i % buf.length) : i;
            if (srcIdx >= buf.length) break;
            mixedL[i] += chData[0][srcIdx] * vol;
            mixedR[i] += chData[Math.min(1, chCount - 1)][srcIdx] * vol;
          }
        }

        // Clamp to [-1, 1] (prevent clipping)
        for (let i = 0; i < totalSamples; i++) {
          mixedL[i] = Math.max(-1, Math.min(1, mixedL[i]));
          mixedR[i] = Math.max(-1, Math.min(1, mixedR[i]));
        }

        // Encode in 1-second chunks
        const CHUNK = sampleRate;
        for (let offset = 0; offset < totalSamples; offset += CHUNK) {
          if (cancelledRef.current) throw new Error('cancelled');
          const len    = Math.min(CHUNK, totalSamples - offset);
          const planar = new Float32Array(len * 2);
          planar.set(mixedL.subarray(offset, offset + len), 0);
          planar.set(mixedR.subarray(offset, offset + len), len);
          const audioData = new AudioData({
            format: 'f32-planar', sampleRate,
            numberOfFrames: len, numberOfChannels: 2,
            timestamp: Math.round((offset / sampleRate) * 1_000_000),
            data: planar,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
        setProgress(90);
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 5 — Finalise
      // ═══════════════════════════════════════════════════════════
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