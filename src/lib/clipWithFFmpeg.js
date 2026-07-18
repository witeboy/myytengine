// ══════════════════════════════════════════════════════════════════
// CLIP WITH FFMPEG — Browser-based video clipping via ffmpeg.wasm
//
// Loads @ffmpeg/ffmpeg 0.12 from CDN with the single-threaded
// @ffmpeg/core (no SharedArrayBuffer / COOP+COEP needed).
//
// Two critical fixes for CDN loading:
//  1. worker.js contains relative imports ("./const.js" etc.) which
//     break inside a blob URL — we fetch the source and rewrite them
//     to absolute CDN URLs before creating the blob worker.
//  2. Dynamic imports use /* @vite-ignore */ so Vite doesn't try to
//     resolve/bundle the CDN URLs at build time.
//
// Usage:
//   import { initFFmpeg, clipVideo } from './clipWithFFmpeg';
//   const blob = await clipVideo(videoUrl, startSec, endSec, onProgress, { portrait: true });
// ══════════════════════════════════════════════════════════════════

const FFMPEG_VERSION = '0.12.10';
const UTIL_VERSION = '0.12.1';
const CORE_VERSION = '0.12.6';

const FFMPEG_ESM_BASE = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm`;
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpeg = null;
let ffmpegLoaded = false;
let loadPromise = null; // dedupe concurrent init calls

export function isFFmpegSupported() {
  return typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined';
}

// Fetch a JS file and return a same-origin blob URL, rewriting any
// relative ESM imports to absolute CDN URLs so they still resolve
// when the code runs from a blob:// context.
async function toPatchedBlobURL(url, base) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url} (${resp.status})`);
  let code = await resp.text();
  // import ... from "./x.js"  |  import("./x.js")  |  export ... from "./x.js"
  code = code.replace(/((?:from|import)\s*\(?\s*)(['"])\.\//g, `$1$2${base}/`);
  return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}

/**
 * Load ffmpeg.wasm from CDN (one-time, ~31MB download).
 * Throws with a clear message on failure — callers surface it to the user.
 */
export async function initFFmpeg(onProgress) {
  if (ffmpegLoaded && ffmpeg) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onProgress?.({ phase: 'loading', message: 'Loading FFmpeg engine…', percent: 0 });

    try {
      const { FFmpeg } = await import(/* @vite-ignore */ `https://esm.sh/@ffmpeg/ffmpeg@${FFMPEG_VERSION}`);
      const { toBlobURL } = await import(/* @vite-ignore */ `https://esm.sh/@ffmpeg/util@${UTIL_VERSION}`);

      const inst = new FFmpeg();

      inst.on('progress', ({ progress }) => {
        const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
        onProgress?.({ phase: 'processing', message: `Clipping… ${pct}%`, percent: pct });
      });
      inst.on('log', ({ message }) => console.log('[FFmpeg]', message));

      onProgress?.({ phase: 'loading', message: 'Downloading FFmpeg core…', percent: 20 });

      // Worker must be same-origin (blob) AND have its relative imports patched.
      const workerURL = await toPatchedBlobURL(`${FFMPEG_ESM_BASE}/worker.js`, FFMPEG_ESM_BASE);

      const [coreURL, wasmURL] = await Promise.all([
        toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      ]);

      onProgress?.({ phase: 'loading', message: 'Starting FFmpeg engine…', percent: 60 });
      console.log('[FFmpeg] Loading single-threaded core (0.12, no SharedArrayBuffer needed)');

      // Hard timeout so a silent worker failure never leaves the UI stuck.
      await Promise.race([
        inst.load({ coreURL, wasmURL, classWorkerURL: workerURL }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('FFmpeg engine timed out while starting — check the browser console for worker errors')), 60000)
        ),
      ]);

      ffmpeg = inst;
      ffmpegLoaded = true;
      onProgress?.({ phase: 'ready', message: 'FFmpeg ready', percent: 100 });
      console.log('[FFmpeg] Loaded successfully');
      return ffmpeg;
    } catch (err) {
      console.error('[FFmpeg] Failed to load:', err);
      onProgress?.({ phase: 'error', message: `FFmpeg load failed: ${err.message}`, percent: 0 });
      throw err;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

// ── Face-aware cropping ─────────────────────────────────────────────
// Samples frames across the clip, detects the speaker's face (Claude
// Vision via detectFaceRegion), and builds an FFmpeg crop x-expression
// that pans the 9:16 window to follow the face over time.

async function buildFaceCropXExpr(videoUrl, startSec, endSec, onProgress) {
  const video = document.createElement('video');
  video.src = videoUrl.split('#')[0];
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;';
  document.body.appendChild(video);

  try {
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error('load failed'));
      setTimeout(() => rej(new Error('load timeout')), 15000);
    });

    const { buildFaceTrack } = await import('@/lib/faceTracker');
    const track = await buildFaceTrack(
      video,
      { start: startSec, end: endSec, duration: endSec - startSec },
      (msg) => onProgress?.({ phase: 'tracking', message: msg, percent: 2 })
    );

    if (!track.keyframes.length) return null;

    // Keyframes relative to clip start (output timestamps begin at 0),
    // face x as a 0-1 fraction of source width. Drop zero-length segments.
    const kfs = [];
    for (const k of track.keyframes) {
      const t = Math.max(0, k.t - startSec);
      if (kfs.length && t - kfs[kfs.length - 1].t < 0.05) continue;
      kfs.push({ t, fx: Math.max(0, Math.min(1, k.x / 100)) });
    }
    if (!kfs.length) return null;

    // Piecewise-linear FX(t): nested if()s, commas escaped for lavfi.
    let fxExpr = kfs[kfs.length - 1].fx.toFixed(4);
    for (let i = kfs.length - 2; i >= 0; i--) {
      const a = kfs[i], b = kfs[i + 1];
      const seg = `${a.fx.toFixed(4)}+(${(b.fx - a.fx).toFixed(4)})*(t-${a.t.toFixed(2)})/${(b.t - a.t).toFixed(2)}`;
      fxExpr = `if(lt(t\\,${b.t.toFixed(2)})\\,${seg}\\,${fxExpr})`;
    }
    fxExpr = `if(lt(t\\,${kfs[0].t.toFixed(2)})\\,${kfs[0].fx.toFixed(4)}\\,${fxExpr})`;

    // Crop x = face center minus half window, clamped to frame bounds
    return `max(0\\,min(in_w-out_w\\,(${fxExpr})*in_w-out_w/2))`;
  } catch (err) {
    console.warn('[FaceCrop] Tracking failed, using center crop:', err.message);
    return null;
  } finally {
    if (document.body.contains(video)) document.body.removeChild(video);
  }
}

/**
 * Clip a video segment using ffmpeg.wasm — the ONLY clipping path.
 * @param {string} videoUrl - URL of the source video (must allow CORS)
 * @param {number} startSec - Start time in seconds
 * @param {number} endSec - End time in seconds
 * @param {function} onProgress - ({ phase, message, percent }) callback
 * @returns {Blob} - MP4 blob of the clipped segment
 */
export async function clipVideo(videoUrl, startSec, endSec, onProgress, { portrait = false } = {}) {
  const engine = await initFFmpeg(onProgress); // throws with a clear message on failure

  // Face tracking (portrait only) — pans the crop window to keep the speaker centered
  let faceXExpr = null;
  if (portrait) {
    onProgress?.({ phase: 'tracking', message: 'Tracking speaker face…', percent: 1 });
    faceXExpr = await buildFaceCropXExpr(videoUrl, startSec, endSec, onProgress);
  }

  const { fetchFile } = await import(/* @vite-ignore */ `https://esm.sh/@ffmpeg/util@${UTIL_VERSION}`);

  onProgress?.({ phase: 'downloading', message: 'Downloading video…', percent: 0 });

  const videoData = await fetchFile(videoUrl.split('#')[0]);
  await engine.writeFile('input.mp4', videoData);

  const duration = endSec - startSec;
  onProgress?.({ phase: 'clipping', message: `Clipping ${duration.toFixed(1)}s segment…`, percent: 5 });

  // portrait=true → center-crop to 9:16 + scale 720x1280 (re-encode, Reels-ready)
  // portrait=false → stream copy (instant, original aspect)
  const args = ['-ss', startSec.toFixed(3), '-i', 'input.mp4', '-t', duration.toFixed(3)];
  if (portrait) {
    const xExpr = faceXExpr || '(in_w-out_w)/2';
    args.push(
      '-vf', `crop=min(iw\\,ih*9/16):ih:'${xExpr}':0,scale=720:1280`,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
      '-c:a', 'aac', '-b:a', '128k',
    );
  } else {
    args.push('-c', 'copy');
  }
  args.push('-avoid_negative_ts', 'make_zero', '-movflags', '+faststart', 'output.mp4');

  const rc = await engine.exec(args);
  if (rc !== 0) throw new Error(`FFmpeg exited with code ${rc} — see console logs`);

  const outputData = await engine.readFile('output.mp4');
  const blob = new Blob([outputData.buffer], { type: 'video/mp4' });

  await engine.deleteFile('input.mp4').catch(() => {});
  await engine.deleteFile('output.mp4').catch(() => {});

  if (!blob.size) throw new Error('FFmpeg produced an empty file');

  onProgress?.({ phase: 'done', message: `Clip ready (${(blob.size / 1048576).toFixed(1)}MB)`, percent: 100 });
  return blob;
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