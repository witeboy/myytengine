// ══════════════════════════════════════════════════════════════════
// CLIP WITH WEBCODECS — Fast hardware-accelerated browser clipping
//
// Plays the source at 3x speed while encoding frames via VideoEncoder
// + mp4-muxer (no CDN downloads, no wasm). Audio is decoded from the
// source and sliced precisely. Typically 3-4x faster than realtime.
// Chrome/Edge only — callers should fall back elsewhere if unsupported.
// ══════════════════════════════════════════════════════════════════
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export function isWebCodecsSupported() {
  return typeof VideoEncoder !== 'undefined'
    && typeof AudioEncoder !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof HTMLVideoElement !== 'undefined'
    && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}

export async function clipWithWebCodecs(videoUrl, startSec, endSec, onProgress, { portrait = true } = {}) {
  const clipDur = endSec - startSec;
  const BITRATE = 4_000_000;

  onProgress?.({ phase: 'loading', message: 'Preparing fast encoder…', percent: 2 });

  const video = document.createElement('video');
  video.src = videoUrl.split('#')[0];
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
  document.body.appendChild(video);

  try {
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error('Video failed to load'));
      setTimeout(() => rej(new Error('Video load timed out')), 20000);
    });

    const srcW = video.videoWidth || 1920;
    const srcH = video.videoHeight || 1080;

    // Output dimensions + crop window
    let outW, outH, cropX, cropY, cropW, cropH;
    if (portrait) {
      outW = 720; outH = 1280;
      cropW = Math.min(srcW, Math.round(srcH * 9 / 16));
      cropH = srcH;
      cropX = Math.round((srcW - cropW) / 2);
      cropY = 0;
    } else {
      outW = srcW % 2 ? srcW - 1 : srcW;
      outH = srcH % 2 ? srcH - 1 : srcH;
      cropX = 0; cropY = 0; cropW = srcW; cropH = srcH;
    }

    // Pick a supported H.264 profile
    let videoCodec = 'avc1.42001e';
    for (const c of ['avc1.640028', 'avc1.4d001e', 'avc1.42001e']) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec: c, width: outW, height: outH, bitrate: BITRATE });
        if (s.supported) { videoCodec = c; break; }
      } catch (_) { /* try next */ }
    }

    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: outW, height: outH },
      audio: { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 },
      fastStart: 'in-memory',
    });

    let encodeError = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encodeError = e; },
    });
    videoEncoder.configure({ codec: videoCodec, width: outW, height: outH, bitrate: BITRATE, framerate: 30 });

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.warn('[WebCodecs] audio encode error:', e),
    });
    audioEncoder.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 });

    const offscreen = new OffscreenCanvas(outW, outH);
    const ctx = offscreen.getContext('2d');

    // ── Encode video: play at 3x, grab frames via requestVideoFrameCallback ──
    onProgress?.({ phase: 'encoding', message: 'Fast encoding… 0%', percent: 5 });

    await new Promise((resolve, reject) => {
      let lastKeyframeUs = -2_000_001;
      let stopped = false;

      const finish = () => {
        if (stopped) return;
        stopped = true;
        video.pause();
        resolve();
      };

      const onFrame = (_now, meta) => {
        if (stopped) return;
        if (encodeError) { stopped = true; video.pause(); reject(encodeError); return; }

        const mediaTime = meta.mediaTime;
        if (mediaTime >= endSec || video.ended) { finish(); return; }

        if (mediaTime >= startSec) {
          ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
          const timestamp = Math.round((mediaTime - startSec) * 1_000_000);
          const keyFrame = timestamp - lastKeyframeUs >= 2_000_000;
          if (keyFrame) lastKeyframeUs = timestamp;
          const vf = new VideoFrame(offscreen, { timestamp });
          videoEncoder.encode(vf, { keyFrame });
          vf.close();

          const pct = Math.min(99, ((mediaTime - startSec) / clipDur) * 100);
          onProgress?.({ phase: 'encoding', message: `Fast encoding… ${Math.round(pct)}%`, percent: 5 + pct * 0.6 });
        }

        video.requestVideoFrameCallback(onFrame);
      };

      video.currentTime = Math.max(0, startSec - 0.05);
      video.onseeked = () => {
        video.onseeked = null;
        video.playbackRate = 3;
        video.requestVideoFrameCallback(onFrame);
        video.play().catch(reject);
      };
      video.onerror = () => reject(new Error('Video playback error during encode'));

      // Safety: never hang beyond clip duration at 1x + slack
      setTimeout(finish, (clipDur + 15) * 1000);
    });

    await videoEncoder.flush();
    videoEncoder.close();
    onProgress?.({ phase: 'audio', message: 'Adding audio…', percent: 72 });

    // ── Audio: decode source, slice the clip window ──
    try {
      const resp = await fetch(videoUrl.split('#')[0], { mode: 'cors' });
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const actx = new AudioContext({ sampleRate: 48000 });
        const decoded = await actx.decodeAudioData(buf);
        await actx.close();

        const sr = decoded.sampleRate;
        const startSamp = Math.round(startSec * sr);
        const clipSamps = Math.round(clipDur * sr);
        const chCount = Math.min(decoded.numberOfChannels, 2);

        const planar = new Float32Array(clipSamps * 2);
        for (let ch = 0; ch < 2; ch++) {
          const srcCh = decoded.getChannelData(Math.min(ch, chCount - 1));
          for (let i = 0; i < clipSamps; i++) {
            const idx = startSamp + i;
            planar[ch * clipSamps + i] = idx < srcCh.length ? srcCh[idx] : 0;
          }
        }

        const CHUNK = sr;
        for (let o = 0; o < clipSamps; o += CHUNK) {
          const len = Math.min(CHUNK, clipSamps - o);
          const chunk = new Float32Array(len * 2);
          chunk.set(planar.subarray(o, o + len), 0);
          chunk.set(planar.subarray(clipSamps + o, clipSamps + o + len), len);
          const ad = new AudioData({
            format: 'f32-planar',
            sampleRate: 48000,
            numberOfFrames: len,
            numberOfChannels: 2,
            timestamp: Math.round((o / sr) * 1_000_000),
            data: chunk,
          });
          audioEncoder.encode(ad);
          ad.close();
        }
      }
    } catch (audioErr) {
      console.warn('[WebCodecs] Audio decode failed, exporting video-only:', audioErr.message);
    }

    await audioEncoder.flush();
    audioEncoder.close();

    onProgress?.({ phase: 'finalizing', message: 'Saving…', percent: 95 });
    muxer.finalize();
    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    onProgress?.({ phase: 'done', message: `Clip ready (${(blob.size / 1048576).toFixed(1)}MB)`, percent: 100 });
    return blob;

  } finally {
    if (document.body.contains(video)) document.body.removeChild(video);
  }
}