// ══════════════════════════════════════════════════════════════════
// CLIP WITH FFMPEG — Browser-based video clipping via ffmpeg.wasm
//
// Uses @ffmpeg/ffmpeg loaded from CDN. Falls back to MediaRecorder
// canvas capture if SharedArrayBuffer is unavailable.
//
// Usage:
//   import { initFFmpeg, clipVideo, isFFmpegSupported } from './clipWithFFmpeg';
//   await initFFmpeg(onProgress);
//   const blob = await clipVideo(videoUrl, startSec, endSec, onProgress);
// ══════════════════════════════════════════════════════════════════

let ffmpeg = null;
let ffmpegLoaded = false;

/**
 * Check if the browser supports ffmpeg.wasm.
 * We now use the single-threaded v0.11 UMD build which works WITHOUT
 * SharedArrayBuffer / COOP+COEP headers — so this is basically always true
 * in modern browsers. Kept as a function for API compatibility.
 */
export function isFFmpegSupported() {
  return typeof WebAssembly !== 'undefined';
}

/**
 * Load ffmpeg.wasm from CDN (one-time, ~30MB download)
 * @param {function} onProgress - ({ phase, message, percent }) callback
 */
export async function initFFmpeg(onProgress) {
  if (ffmpegLoaded && ffmpeg) return ffmpeg;

  onProgress?.({ phase: 'loading', message: 'Loading FFmpeg engine…', percent: 0 });

  const hasSAB = typeof SharedArrayBuffer !== 'undefined';

  try {
    // Dynamic import from CDN
    const { FFmpeg } = await import(
      /* webpackIgnore: true */
      'https://esm.sh/@ffmpeg/ffmpeg@0.12.10'
    );
    const { toBlobURL } = await import(
      /* webpackIgnore: true */
      'https://esm.sh/@ffmpeg/util@0.12.1'
    );

    ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.({
        phase: 'processing',
        message: `Clipping… ${Math.round(progress * 100)}%`,
        percent: Math.round(progress * 100),
      });
    });

    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    // Use single-threaded core when SharedArrayBuffer isn't available (no COOP/COEP headers).
    // The MT build at /dist/esm requires SAB; the UMD build at /dist/umd is single-threaded.
    const baseURL = hasSAB
      ? 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      : 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    console.log(`[FFmpeg] Loading ${hasSAB ? 'multi-threaded' : 'single-threaded'} core from ${baseURL}`);

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegLoaded = true;
    onProgress?.({ phase: 'ready', message: 'FFmpeg ready', percent: 100 });
    console.log('[FFmpeg] Loaded successfully');
    return ffmpeg;

  } catch (err) {
    console.error('[FFmpeg] Failed to load:', err);
    onProgress?.({ phase: 'error', message: `FFmpeg load failed: ${err.message}`, percent: 0 });
    return null;
  }
}

/**
 * Clip a video segment using ffmpeg.wasm
 * @param {string} videoUrl - URL of the source video
 * @param {number} startSec - Start time in seconds
 * @param {number} endSec - End time in seconds
 * @param {function} onProgress - Progress callback
 * @returns {Blob} - MP4 blob of the clipped segment
 */
export async function clipVideo(videoUrl, startSec, endSec, onProgress) {
  // Try FFmpeg first
  if (ffmpegLoaded && ffmpeg) {
    return clipWithFFmpeg(videoUrl, startSec, endSec, onProgress);
  }

  // Fallback: canvas-based clipping
  return clipWithCanvas(videoUrl, startSec, endSec, onProgress);
}

async function clipWithFFmpeg(videoUrl, startSec, endSec, onProgress) {
  const { fetchFile } = await import(
    /* webpackIgnore: true */
    'https://esm.sh/@ffmpeg/util@0.12.1'
  );

  onProgress?.({ phase: 'downloading', message: 'Downloading video segment…', percent: 0 });

  // Fetch the video file
  const videoData = await fetchFile(videoUrl);
  await ffmpeg.writeFile('input.mp4', videoData);

  const duration = endSec - startSec;

  onProgress?.({ phase: 'clipping', message: `Clipping ${duration.toFixed(1)}s segment…`, percent: 10 });

  // FFmpeg clip command: seek to start, copy codecs (fast), limit duration
  await ffmpeg.exec([
    '-ss', startSec.toFixed(3),
    '-i', 'input.mp4',
    '-t', duration.toFixed(3),
    '-c', 'copy',          // Stream copy = instant, no re-encode
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    'output.mp4',
  ]);

  // Read the output
  const outputData = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([outputData.buffer], { type: 'video/mp4' });

  // Cleanup
  await ffmpeg.deleteFile('input.mp4');
  await ffmpeg.deleteFile('output.mp4');

  onProgress?.({ phase: 'done', message: `Clip ready (${(blob.size / 1048576).toFixed(1)}MB)`, percent: 100 });

  return blob;
}

/**
 * Fallback: clip video using Canvas + MediaRecorder
 * Works without SharedArrayBuffer but quality/sync may vary
 */
async function clipWithCanvas(videoUrl, startSec, endSec, onProgress) {
  return new Promise((resolve, reject) => {
    onProgress?.({ phase: 'fallback', message: 'Using browser capture mode…', percent: 0 });

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = false;
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const duration = endSec - startSec;
    const chunks = [];

    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      video.currentTime = startSec;
    };

    video.onseeked = () => {
      // Capture canvas stream + audio
      const canvasStream = canvas.captureStream(30);

      // Try to capture audio from the video
      let combinedStream;
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        source.connect(audioCtx.destination);

        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ]);
      } catch {
        combinedStream = canvasStream;
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: MediaRecorder.isTypeSupported('video/mp4')
          ? 'video/mp4'
          : 'video/webm;codecs=vp8,opus',
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        onProgress?.({ phase: 'done', message: `Clip ready (${(blob.size / 1048576).toFixed(1)}MB)`, percent: 100 });
        resolve(blob);
      };

      recorder.start(100);
      video.play();

      // Draw frames to canvas
      const drawFrame = () => {
        if (video.currentTime >= endSec || video.ended) {
          recorder.stop();
          video.pause();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pct = Math.round(((video.currentTime - startSec) / duration) * 100);
        onProgress?.({ phase: 'capturing', message: `Recording… ${pct}%`, percent: pct });
        requestAnimationFrame(drawFrame);
      };
      drawFrame();

      // Safety timeout
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
          video.pause();
        }
      }, (duration + 5) * 1000);
    };

    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = videoUrl;
  });
}

/**
 * Format seconds to MM:SS display
 */
export function formatTimestamp(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generate a download filename for a clip
 */
export function clipFilename(clipTitle, index) {
  const safe = (clipTitle || `clip_${index + 1}`)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 40);
  return `${safe}.mp4`;
}