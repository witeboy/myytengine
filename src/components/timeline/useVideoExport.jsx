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

const DEFAULT_TRANSITION_DURATION = 0.6;

// ── Easing functions — mirrors timeline preview exactly ───────────────────
const ease = {
  easeInOutQuad:  t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
  easeInQuad:     t => t*t,
  easeOutQuad:    t => 1-(1-t)*(1-t),
  easeInOutCubic: t => t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2,
  easeOutSine:    t => Math.sin((t*Math.PI)/2),
};

// ── Cinematic motion definitions — mirrors CINEMATIC_MOTIONS in timeline ──
const CINEMATIC_MOTIONS = [
  { id: 'zoom_in_center',  startScale:1.0,  endScale:1.10, startX:0,    startY:0,    endX:0,    endY:0    },
  { id: 'zoom_out_center', startScale:1.10, endScale:1.0,  startX:0,    startY:0,    endX:0,    endY:0    },
  { id: 'pan_right_zoom',  startScale:1.0,  endScale:1.08, startX:-1.5, startY:0,    endX:1.5,  endY:0    },
  { id: 'pan_left_zoom',   startScale:1.0,  endScale:1.08, startX:1.5,  startY:0,    endX:-1.5, endY:0    },
  { id: 'push_in_top',     startScale:1.0,  endScale:1.08, startX:0,    startY:1.2,  endX:0,    endY:-1.2 },
  { id: 'push_in_bottom',  startScale:1.0,  endScale:1.08, startX:0,    startY:-1.2, endX:0,    endY:1.2  },
  { id: 'diagonal_tl_br',  startScale:1.0,  endScale:1.08, startX:1.5,  startY:1.0,  endX:-1.5, endY:-1.0 },
  { id: 'diagonal_tr_bl',  startScale:1.0,  endScale:1.08, startX:-1.5, startY:1.0,  endX:1.5,  endY:-1.0 },
];

const yieldToMain = () => new Promise(r => {
  const ch = new MessageChannel();
  ch.port1.onmessage = r;
  ch.port2.postMessage(null);
});

// ═══════════════════════════════════════════════════════════════════════════
// CINEMATIC MOTION TRANSFORM
// Returns { scale, tx_px, ty_px } to apply via ctx.setTransform().
// Mirrors getMotionStyle() in VideoPreview exactly.
// ═══════════════════════════════════════════════════════════════════════════
function getMotionTransform(clip, elapsedInClip, W, H) {
  if (!clip?.cinematicMotion) return null;
  const motion = CINEMATIC_MOTIONS.find(m => m.id === clip.cinematicMotion);
  if (!motion) return null;
  const speed        = clip.motionSpeed     ?? 1.0;
  const intensity    = clip.motionIntensity ?? 1.0;
  const activeWindow = (clip.duration ?? 5) / speed;
  const p            = Math.min(1, Math.max(0, elapsedInClip / activeWindow));
  const eased        = ease.easeOutSine(p);
  const scale   = motion.startScale + (motion.endScale - motion.startScale) * intensity * eased;
  const tx_px   = ((motion.startX + (motion.endX - motion.startX) * intensity * eased) / 100) * W;
  const ty_px   = ((motion.startY + (motion.endY - motion.startY) * intensity * eased) / 100) * H;
  return { scale, tx_px, ty_px };
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAW MEDIA FRAME WITH OPTIONAL CINEMATIC MOTION
// Bakes scale+translate into canvas pixels via ctx.save/setTransform/restore.
// ═══════════════════════════════════════════════════════════════════════════
function drawMediaFrame(ctx, W, H, media, mediaType, mxform) {
  const sw = mediaType === 'video' ? (media.videoWidth  || media.width  || 1) : (media.naturalWidth  || media.width  || 1);
  const sh = mediaType === 'video' ? (media.videoHeight || media.height || 1) : (media.naturalHeight || media.height || 1);
  const fitScale = Math.min(W/sw, H/sh);
  const dw = sw*fitScale, dh = sh*fitScale;
  const dx = (W-dw)/2,   dy = (H-dh)/2;
  ctx.save();
  if (mxform) {
    ctx.translate(W/2, H/2);
    ctx.scale(mxform.scale, mxform.scale);
    ctx.translate(-W/2 + mxform.tx_px, -H/2 + mxform.ty_px);
  }
  try { ctx.drawImage(media, dx, dy, dw, dh); } catch(e) { /* CORS tainted */ }
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE TRANSITION FRAME
// Draws outgoing + incoming bitmaps composited at `progress` (0..1).
// Mirrors getTransitionStyle() in VideoPreview exactly.
// ═══════════════════════════════════════════════════════════════════════════
function compositeTransitionFrame(ctx, W, H, outBitmap, inBitmap, type, progress) {
  ctx.clearRect(0, 0, W, H);

  let easeFn = ease.easeInOutQuad;
  if (type === 'Black Fade')   easeFn = ease.easeInOutCubic;
  if (type === 'Expand Fade')  easeFn = ease.easeOutQuad;
  if (type === 'Overlap Fade') easeFn = ease.easeInOutQuad;
  const e2 = easeFn(progress);

  if (type === 'Gradual Fade') {
    ctx.globalAlpha = 1 - e2;
    ctx.drawImage(outBitmap, 0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = e2;
    ctx.filter = `brightness(${0.9 + e2*0.1})`;
    ctx.drawImage(inBitmap, 0, 0, W, H);

  } else if (type === 'Black Fade') {
    const dp = Math.sin(e2 * Math.PI);
    ctx.globalAlpha = 1 - e2*0.4;
    ctx.filter = `brightness(${1-dp*0.65}) contrast(${1+dp*0.15}) saturate(${1-dp*0.3})`;
    ctx.drawImage(outBitmap, 0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = e2*0.4;
    ctx.filter = `brightness(${1-dp*0.65})`;
    ctx.drawImage(inBitmap, 0, 0, W, H);

  } else if (type === 'Expand Fade') {
    const blur = e2*e2*5;
    ctx.globalAlpha = 1 - e2*0.8;
    ctx.filter = `blur(${blur}px) brightness(${1-e2*0.1})`;
    ctx.save(); ctx.translate(W/2,H/2); ctx.scale(1-e2*0.18,1-e2*0.18); ctx.translate(-W/2,-H/2);
    ctx.drawImage(outBitmap, 0, 0, W, H); ctx.restore();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = e2*0.8;
    ctx.filter = `blur(${(1-e2)*3}px) brightness(${0.9+e2*0.1})`;
    ctx.save(); ctx.translate(W/2,H/2); ctx.scale(0.82+e2*0.18,0.82+e2*0.18); ctx.translate(-W/2,-H/2);
    ctx.drawImage(inBitmap, 0, 0, W, H); ctx.restore();

  } else if (type === 'Overlap Fade') {
    const slide = e2*e2*60;
    ctx.globalAlpha = 1 - e2*0.7;
    ctx.filter = `blur(${e2*6}px)`;
    ctx.drawImage(outBitmap, slide, 0, W, H);
    ctx.globalCompositeOperation = 'lighten';
    ctx.globalAlpha = e2*0.9;
    ctx.filter = `blur(${(1-e2)*4}px)`;
    ctx.drawImage(inBitmap, -slide, 0, W, H);

  } else {
    // Simple cross-fade fallback for unknown types
    ctx.globalAlpha = 1 - e2;
    ctx.drawImage(outBitmap, 0, 0, W, H);
    ctx.globalAlpha = e2;
    ctx.drawImage(inBitmap, 0, 0, W, H);
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}

export default function useVideoExport() {
  const [exporting,  setExporting]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [phase,      setPhase]      = useState('');
  const [error,      setError]      = useState(null);
  const cancelledRef = useRef(false);
  const encoderRef   = useRef(null);
  const wakeLockRef  = useRef(null);

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
    const preset  = presets[quality];
    const profiles = ['avc1.42001e','avc1.4d001e','avc1.640028','avc1.42001f'];
    for (const codec of profiles) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec, width: preset.width, height: preset.height, bitrate: preset.bitrate });
        if (s.supported) return { supported: true, warning: false, codec };
      } catch {}
    }
    return { supported: true, warning: true, reason: `${quality} H.264 encoding may not be fully supported.`, codec: profiles[0] };
  }, []);

  // Resolve a URL through the proxy if needed, returns a CORS-safe URL
  const resolveUrl = async (url) => {
    // Try direct fetch first
    try {
      const resp = await fetch(url, { method: 'HEAD', mode: 'cors' });
      if (resp.ok) return url;
    } catch {}
    // Use proxy to re-upload to Base44 storage
    try {
      const proxyRes = await base44.functions.invoke('proxyFetchAsset', { url });
      const data = proxyRes.data || proxyRes;
      if (data.success && data.file_url) return data.file_url;
      // Legacy base64 fallback
      if (data.success && data.data) {
        const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
        return URL.createObjectURL(new Blob([bytes], { type: data.content_type || 'application/octet-stream' }));
      }
    } catch (e) { console.warn(`Proxy resolve failed: ${url.substring(0,60)} — ${e.message}`); }
    return url; // return original as last resort
  };

  const loadImage = async (url) => {
    const safeUrl = await resolveUrl(url);
    try {
      const resp = await fetch(safeUrl, { mode: 'cors' });
      if (resp.ok) return await createImageBitmap(await resp.blob());
    } catch {}
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed: ' + url.substring(0, 60)));
      img.src = safeUrl;
    });
  };

  const loadVideoElement = async (url) => {
    const safeUrl = await resolveUrl(url);
    let blobUrl = null;
    try {
      const resp = await fetch(safeUrl, { mode: 'cors' });
      if (resp.ok) blobUrl = URL.createObjectURL(await resp.blob());
    } catch {}
    if (!blobUrl) {
      return new Promise((resolve, reject) => {
        const v = document.createElement('video');
        v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto';
        const t = setTimeout(() => reject(new Error('timeout')), 30000);
        v.onloadeddata = () => { clearTimeout(t); resolve(v); };
        v.onerror      = () => { clearTimeout(t); reject(new Error('failed')); };
        v.src = safeUrl;
      });
    }
    return new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      const t = setTimeout(() => { URL.revokeObjectURL(blobUrl); reject(new Error('timeout')); }, 60000);
      v.onloadeddata = () => { clearTimeout(t); v._blobUrl = blobUrl; resolve(v); };
      v.onerror      = () => { clearTimeout(t); URL.revokeObjectURL(blobUrl); reject(new Error('failed')); };
      v.src = blobUrl;
    });
  };

  const seekVideo = (video, time) => new Promise(resolve => {
    const target = Math.max(0, Math.min(time, (video.duration||0) > 0 ? video.duration-0.01 : 0));
    if (Math.abs(video.currentTime - target) < 0.04) { resolve(); return; }
    const t = setTimeout(resolve, 500);
    video.onseeked = () => { clearTimeout(t); resolve(); };
    video.currentTime = target;
  });

  const decodeAudio = async (url) => {
    const resp = await fetch(url);
    const buf  = await resp.arrayBuffer();
    const actx = new AudioContext({ sampleRate: 48000 });
    const dec  = await actx.decodeAudioData(buf);
    await actx.close();
    return dec;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MAIN EXPORT
  // ═══════════════════════════════════════════════════════════════════════
  const exportVideo = useCallback(async (scenes, opts) => {
    const { quality='720p', orientation='landscape', fps=30, voiceoverUrl, musicUrl, musicVolume=0.3 } = opts||{};

    cancelledRef.current = false;
    setExporting(true); setProgress(0); setPhase('checking'); setError(null);
    await acquireWakeLock();

    try {
      const presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
      const { width: W, height: H, bitrate: BR } = presets[quality];

      // Normalise clip fields
      const clips = scenes.map((s, i) => ({
        index:              i,
        duration:           s.duration           || s.duration_seconds || 8,
        mediaType:          s.mediaType          || (s.video_url?.startsWith('http') ? 'video' : 'image'),
        videoUrl:           s.videoUrl           || s.video_url  || '',
        imageUrl:           s.imageUrl           || s.image_url  || '',
        playbackRate:       s.playbackRate        ?? 1.0,
        videoDuration:      s.videoDuration       ?? null,
        cinematicMotion:    s.cinematicMotion     || null,
        motionSpeed:        s.motionSpeed         ?? 1.0,
        motionIntensity:    s.motionIntensity     ?? 1.0,
        // Transition stored on OUTGOING clip, plays at START of next clip
        transition:         s.transition          || null,
        transitionDuration: s.transitionDuration  ?? DEFAULT_TRANSITION_DURATION,
        startTime:          0, // filled below
      }));

      // Compute absolute start times
      let off = 0;
      clips.forEach(c => { c.startTime = off; off += c.duration; });

      const totalDuration = off;
      const totalFrames   = Math.ceil(totalDuration * fps);
      const hasAudio      = !!(voiceoverUrl || musicUrl);

      // Find H.264 codec
      let videoCodec = 'avc1.42001e';
      for (const c of ['avc1.42001e','avc1.4d001e','avc1.640028']) {
        try {
          const s = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: BR });
          if (s.supported) { videoCodec = c; break; }
        } catch {}
      }

      // Muxer
      const muxCfg = { target: new ArrayBufferTarget(), video: { codec:'avc', width:W, height:H }, fastStart:'in-memory' };
      if (hasAudio) muxCfg.audio = { codec:'aac', sampleRate:48000, numberOfChannels:2 };
      const muxer = new Muxer(muxCfg);

      let encodeError = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error:  e => { encodeError = e; },
      });
      encoderRef.current = videoEncoder;
      videoEncoder.configure({ codec: videoCodec, width: W, height: H, bitrate: BR, framerate: fps });

      let audioEncoder = null;
      if (hasAudio) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error:  e => console.warn('Audio encode error:', e),
        });
        audioEncoder.configure({ codec:'mp4a.40.2', sampleRate:48000, numberOfChannels:2, bitrate:128_000 });
      }

      const canvas = new OffscreenCanvas(W, H);
      const ctx    = canvas.getContext('2d');

      // ─── PHASE 1: Load all media ──────────────────────────────────
      setPhase('loading');
      const clipMedia = [];

      for (let i = 0; i < clips.length; i++) {
        if (cancelledRef.current) throw new Error('cancelled');
        setProgress(Math.round((i / clips.length) * 15));
        const clip = clips[i];
        let media = null, mediaType = 'image', measuredVideoDur = null;
        const wantsVideo = clip.mediaType === 'video' && clip.videoUrl?.startsWith('http');
        const hasImg     = clip.imageUrl?.startsWith('http');
        if (wantsVideo) {
          try {
            media = await loadVideoElement(clip.videoUrl);
            mediaType = 'video';
            measuredVideoDur = (media.duration && isFinite(media.duration)) ? media.duration : (clip.videoDuration ?? 6);
          } catch(e) {
            console.warn(`Clip ${i} video failed, using image:`, e.message);
            if (hasImg) try { media = await loadImage(clip.imageUrl); } catch {}
          }
        } else if (hasImg) {
          try { media = await loadImage(clip.imageUrl); } catch {}
        }
        clipMedia.push({ media, mediaType, measuredVideoDur });
      }

      setPhase('encoding');

      // ─── Helper: draw one clip's frame into canvas ────────────────
      // elapsedInClip = real seconds elapsed since the clip's startTime
      // Applies cinematic motion transform + handles video seek/freeze
      const lastVideoFrame = new Map(); // clipIndex → ImageBitmap (freeze-frame)

      const drawClipFrame = async (ci, elapsedInClip) => {
        const clip   = clips[ci];
        const { media, mediaType, measuredVideoDur } = clipMedia[ci];
        const mxform = getMotionTransform(clip, elapsedInClip, W, H);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        if (!media) return;

        if (mediaType === 'image') {
          drawMediaFrame(ctx, W, H, media, 'image', mxform);
        } else if (mediaType === 'video') {
          const rate    = clip.playbackRate ?? 1.0;
          const maxSrc  = (measuredVideoDur ?? clip.videoDuration ?? 999) - 0.02;
          const srcTime = Math.min((elapsedInClip * rate), maxSrc);

          if (srcTime >= maxSrc) {
            // Past video end → freeze on last frame
            const frozen = lastVideoFrame.get(ci);
            if (frozen) drawMediaFrame(ctx, W, H, frozen, 'image', mxform);
          } else {
            await seekVideo(media, srcTime);
            drawMediaFrame(ctx, W, H, media, 'video', mxform);
            // Cache last good frame for freeze-frame
            const bm = await createImageBitmap(canvas);
            lastVideoFrame.get(ci)?.close();
            lastVideoFrame.set(ci, bm);
          }
        }
      };

      // ─── PHASE 3: Encode frame by frame ───────────────────────────
      let framesSinceFlush = 0;
      const FLUSH_EVERY    = fps * 3;

      for (let f = 0; f < totalFrames; f++) {
        if (cancelledRef.current) throw new Error('cancelled');
        if (encodeError)           throw encodeError;

        const absTime = f / fps;

        // Find which clip this frame belongs to
        let ci = clips.length - 1;
        for (let i = 0; i < clips.length; i++) {
          if (absTime < clips[i].startTime + clips[i].duration) { ci = i; break; }
        }
        const clip        = clips[ci];
        const elapsed     = absTime - clip.startTime;
        const prevClip    = ci > 0 ? clips[ci-1] : null;

        // Check transition: previous clip's transition plays at start of this clip
        const tType    = prevClip?.transition || null;
        const tDur     = prevClip?.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
        const tProg    = tType ? Math.min(1, elapsed / tDur) : 0;
        const inTrans  = tType && elapsed < tDur;

        if (inTrans) {
          // ── Transition: composite outgoing + incoming ─────────────
          // Draw incoming (current clip at its current elapsed position)
          await drawClipFrame(ci, elapsed);
          const inBitmap = await createImageBitmap(canvas);

          // Draw outgoing (prev clip frozen at its very last moment)
          await drawClipFrame(ci-1, prevClip.duration);
          const outBitmap = await createImageBitmap(canvas);

          // Composite into final canvas
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
          compositeTransitionFrame(ctx, W, H, outBitmap, inBitmap, tType, tProg);
          inBitmap.close();
          outBitmap.close();
        } else {
          // ── Normal frame ──────────────────────────────────────────
          await drawClipFrame(ci, elapsed);
        }

        // Encode
        const timestamp = Math.round(f * (1_000_000 / fps));
        const vframe    = new VideoFrame(canvas, { timestamp });
        videoEncoder.encode(vframe, { keyFrame: f % (fps*2) === 0 });
        vframe.close();
        framesSinceFlush++;

        if (framesSinceFlush >= FLUSH_EVERY) {
          await videoEncoder.flush();
          framesSinceFlush = 0;
        }
        if (f % 8 === 0) {
          setProgress(15 + Math.round((f / totalFrames) * 60));
          await yieldToMain();
        }
      }

      // Cleanup
      for (const bm of lastVideoFrame.values()) bm.close();
      lastVideoFrame.clear();
      for (const { media } of clipMedia) {
        if (media?._blobUrl) URL.revokeObjectURL(media._blobUrl);
      }

      if (cancelledRef.current) throw new Error('cancelled');

      // ─── PHASE 4: Audio ───────────────────────────────────────────
      if (hasAudio && audioEncoder) {
        setPhase('audio'); setProgress(78);
        const sampleRate   = 48000;
        const totalSamples = Math.ceil(totalDuration * sampleRate);
        const mixedL = new Float32Array(totalSamples);
        const mixedR = new Float32Array(totalSamples);

        const sources = [];
        if (voiceoverUrl) try { sources.push({ buf: await decodeAudio(voiceoverUrl), vol:1.0,         loop:false }); } catch(e) { console.warn('Voiceover failed:', e); }
        if (musicUrl)     try { sources.push({ buf: await decodeAudio(musicUrl),     vol:musicVolume, loop:true  }); } catch(e) { console.warn('Music failed:', e); }

        for (const { buf, vol, loop } of sources) {
          const chN = Math.min(buf.numberOfChannels, 2);
          const ch  = Array.from({length:chN}, (_,i) => buf.getChannelData(i));
          for (let i = 0; i < totalSamples; i++) {
            const si = loop ? (i % buf.length) : i;
            if (si >= buf.length) break;
            mixedL[i] += ch[0][si] * vol;
            mixedR[i] += ch[Math.min(1,chN-1)][si] * vol;
          }
        }
        for (let i = 0; i < totalSamples; i++) {
          mixedL[i] = Math.max(-1, Math.min(1, mixedL[i]));
          mixedR[i] = Math.max(-1, Math.min(1, mixedR[i]));
        }

        const CHUNK = sampleRate;
        for (let o = 0; o < totalSamples; o += CHUNK) {
          if (cancelledRef.current) throw new Error('cancelled');
          const len    = Math.min(CHUNK, totalSamples - o);
          const planar = new Float32Array(len * 2);
          planar.set(mixedL.subarray(o, o+len), 0);
          planar.set(mixedR.subarray(o, o+len), len);
          const ad = new AudioData({ format:'f32-planar', sampleRate, numberOfFrames:len, numberOfChannels:2, timestamp:Math.round((o/sampleRate)*1_000_000), data:planar });
          audioEncoder.encode(ad);
          ad.close();
        }
        setProgress(90);
      }

      // ─── PHASE 5: Finalise ────────────────────────────────────────
      setPhase('finalizing'); setProgress(95);
      await videoEncoder.flush();
      if (audioEncoder) await audioEncoder.flush();
      muxer.finalize();
      videoEncoder.close();
      audioEncoder?.close();
      encoderRef.current = null;

      const blob = new Blob([muxer.target.buffer], { type:'video/mp4' });
      setProgress(100); setPhase('done'); setExporting(false);
      releaseWakeLock();
      return blob;

    } catch (e) {
      try { encoderRef.current?.close(); } catch {}
      encoderRef.current = null;
      releaseWakeLock();
      if (e.message === 'cancelled') {
        setExporting(false); setPhase(''); setProgress(0);
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
    setExporting(false); setPhase(''); setProgress(0); setError(null);
  }, []);

  return { exporting, progress, phase, error, exportVideo, checkSupport, cancel, QUALITY_PRESETS, PORTRAIT_PRESETS };
}