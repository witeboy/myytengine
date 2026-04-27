// ══════════════════════════════════════════════════════════════════
// useFFmpegExport.js — FFmpeg.wasm export hook
//
// Runs ffmpeg.wasm directly using the same pattern as clipWithFFmpeg.js
// which is already proven to work in this app (esm.sh CDN, dynamic
// import, toBlobURL pattern). No Web Worker needed — ffmpeg.wasm
// has its own internal worker via classWorkerURL.
//
// The key: ffmpeg.wasm already runs its heavy work in its OWN
// internal worker thread. The main thread just submits the job.
// So we don't need an outer Web Worker wrapper at all.
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

// Module-level singleton — load once, reuse across exports
let ffmpegInstance  = null;
let ffmpegLoading   = null;
let fetchFileFn     = null;
let toBlobURLFn     = null;

async function getFFmpeg(onProgress) {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoading)  return ffmpegLoading;

  ffmpegLoading = (async () => {
    onProgress?.({ phase: 'loading', message: 'Loading FFmpeg engine…', percent: 0 });

    // Same pattern as clipWithFFmpeg.js — proven to work in this app
    const { FFmpeg }        = await import(/* webpackIgnore: true */ 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10');
    const { toBlobURL, fetchFile } = await import(/* webpackIgnore: true */ 'https://esm.sh/@ffmpeg/util@0.12.1');

    fetchFileFn = fetchFile;
    toBlobURLFn = toBlobURL;

    const ff = new FFmpeg();

    // Single-threaded UMD core — no SharedArrayBuffer needed
    const base      = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    const workerUrl = await toBlobURL(
      'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js',
      'text/javascript',
    );

    await ff.load({
      coreURL:        await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL:        await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      classWorkerURL: workerUrl,
    });

    ffmpegInstance = ff;
    ffmpegLoading  = null;
    onProgress?.({ phase: 'ready', message: 'FFmpeg ready', percent: 5 });
    return ff;
  })();

  return ffmpegLoading;
}

// ── Motion presets ────────────────────────────────────────────────
const MOTIONS = [
  { id: 'zoom_in_center',  s0:1.0,  s1:1.10, x0:0,    y0:0,    x1:0,    y1:0    },
  { id: 'zoom_out_center', s0:1.10, s1:1.0,  x0:0,    y0:0,    x1:0,    y1:0    },
  { id: 'pan_right_zoom',  s0:1.0,  s1:1.08, x0:-1.5, y0:0,    x1:1.5,  y1:0    },
  { id: 'pan_left_zoom',   s0:1.0,  s1:1.08, x0:1.5,  y0:0,    x1:-1.5, y1:0    },
  { id: 'push_in_top',     s0:1.0,  s1:1.08, x0:0,    y0:1.2,  x1:0,    y1:-1.2 },
  { id: 'push_in_bottom',  s0:1.0,  s1:1.08, x0:0,    y0:-1.2, x1:0,    y1:1.2  },
  { id: 'diagonal_tl_br',  s0:1.0,  s1:1.08, x0:1.5,  y0:1.0,  x1:-1.5, y1:-1.0 },
  { id: 'diagonal_tr_bl',  s0:1.0,  s1:1.08, x0:-1.5, y0:1.0,  x1:1.5,  y1:-1.0 },
];
const easeOut = t => Math.sin((t * Math.PI) / 2);

function motionAt(scene, elapsed, W, H) {
  const m = MOTIONS.find(m => m.id === scene.cinematicMotion);
  if (!m) return null;
  const intensity = scene.motionIntensity ?? 1.0;
  const p         = easeOut(Math.min(1, elapsed / ((scene.duration ?? 5) / (scene.motionSpeed ?? 1))));
  return {
    scale: m.s0 + (m.s1 - m.s0) * intensity * p,
    tx:    ((m.x0 + (m.x1 - m.x0) * intensity * p) / 100) * W,
    ty:    ((m.y0 + (m.y1 - m.y0) * intensity * p) / 100) * H,
  };
}

// ── Load an image → ImageBitmap (CORS-safe) ────────────────────
async function loadBitmap(url) {
  try {
    const res  = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    return createImageBitmap(blob);
  } catch {
    // Fallback: direct URL
    const res  = await fetch(url);
    const blob = await res.blob();
    return createImageBitmap(blob);
  }
}

// ── Render one frame to PNG bytes via OffscreenCanvas ─────────────
async function renderFramePng(bitmap, scene, elapsed, W, H) {
  const canvas = new OffscreenCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (bitmap) {
    const sw  = bitmap.width, sh = bitmap.height;
    const fit = Math.max(W / sw, H / sh); // cover
    const dw  = sw * fit, dh = sh * fit;
    const dx  = (W - dw) / 2, dy = (H - dh) / 2;
    const mot = motionAt(scene, elapsed, W, H);

    ctx.save();
    if (mot) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(mot.scale, mot.scale);
      ctx.translate(-W / 2 + mot.tx, -H / 2 + mot.ty);
    }
    ctx.drawImage(bitmap, dx, dy, dw, dh);
    ctx.restore();
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

// ── Build ffmpeg drawtext filter for captions ─────────────────────
function captionFilter(captions, W, H) {
  if (!captions?.length) return '';
  return captions
    .filter(c => c.text?.trim())
    .map(c => {
      const fs   = Math.round((c.fontSize || 20) * (H / 1080) * 1.4);
      const xPct = ((c.x ?? 50) / 100).toFixed(3);
      const yPct = ((c.y ?? 85) / 100).toFixed(3);
      const col  = (c.color || '#FFFFFF').replace('#', '0x');
      const safe = (c.text || '').replace(/[':]/g, ' ').replace(/\n/g, ' ');
      const t0   = (c.startTime || 0).toFixed(3);
      const t1   = ((c.startTime || 0) + (c.duration || 1)).toFixed(3);
      return `drawtext=text='${safe}':fontsize=${fs}:fontcolor=${col}:x=(w*${xPct})-tw/2:y=(h*${yPct})-th/2:box=1:boxcolor=black@0.55:boxborderw=6:enable='between(t\\,${t0}\\,${t1})'`;
    })
    .join(',');
}

// ── Main export function ──────────────────────────────────────────
async function doExport(ff, scenes, opts, onProgress, cancelledRef) {
  const {
    captions = [], voiceoverUrl, musicUrl,
    musicVolume = 0.3, musicClips = [],
    fps = 30, orientation = 'landscape', width, height,
  } = opts;

  const isPortrait = orientation === 'portrait';
  const W = width  || (isPortrait ? 720  : 1280);
  const H = height || (isPortrait ? 1280 : 720);

  // 1. Load all bitmaps
  onProgress?.({ phase: 'loading', message: 'Loading images…', percent: 6 });
  const bitmaps = [];
  for (let i = 0; i < scenes.length; i++) {
    if (cancelledRef.current) throw new Error('cancelled');
    const url = scenes[i].imageUrl || scenes[i].image_url || '';
    let bmp = null;
    if (url.startsWith('http')) {
      try { bmp = await loadBitmap(url); } catch (e) { console.warn(`Scene ${i} load failed:`, e.message); }
    }
    bitmaps.push(bmp);
    onProgress?.({
      phase: 'loading', message: `Loading scene ${i + 1}/${scenes.length}…`,
      percent: Math.round(6 + (i / scenes.length) * 13),
    });
  }

  // 2. Timeline
  let off = 0;
  const starts = scenes.map(s => { const t = off; off += (s.duration || 8); return t; });
  const totalDur    = off;
  const totalFrames = Math.ceil(totalDur * fps);
  console.log(`[FFmpegExport] ${scenes.length} scenes | ${totalFrames} frames | ${W}×${H} | ${fps}fps`);

  // 3. Render frames → ffmpeg FS
  onProgress?.({ phase: 'rendering', message: 'Rendering frames…', percent: 20 });
  for (let f = 0; f < totalFrames; f++) {
    if (cancelledRef.current) throw new Error('cancelled');
    const absTime = f / fps;
    let ci = scenes.length - 1;
    for (let i = 0; i < scenes.length; i++) {
      if (absTime < starts[i] + (scenes[i].duration || 8)) { ci = i; break; }
    }
    const png = await renderFramePng(bitmaps[ci], scenes[ci], absTime - starts[ci], W, H);
    await ff.writeFile(`f${String(f).padStart(6, '0')}.png`, png);

    if (f % 20 === 0) {
      onProgress?.({
        phase: 'rendering', message: `Rendering frame ${f + 1}/${totalFrames}…`,
        percent: Math.round(20 + (f / totalFrames) * 37),
      });
    }
  }
  // Free bitmaps
  for (const bmp of bitmaps) { try { bmp?.close(); } catch {} }

  // 4. Audio
  let hasVo = false, hasMu = false;
  if (voiceoverUrl) {
    onProgress?.({ phase: 'audio', message: 'Loading voiceover…', percent: 58 });
    try { await ff.writeFile('vo.mp3', await fetchFileFn(voiceoverUrl)); hasVo = true; }
    catch (e) { console.warn('VO failed:', e.message); }
  }
  if (musicUrl) {
    onProgress?.({ phase: 'audio', message: 'Loading music…', percent: 60 });
    try { await ff.writeFile('mu.mp3', await fetchFileFn(musicUrl)); hasMu = true; }
    catch (e) { console.warn('Music failed:', e.message); }
  }

  // 5. Build args
  onProgress?.({ phase: 'encoding', message: 'Encoding MP4…', percent: 62 });

  ff.on('progress', ({ progress }) => {
    onProgress?.({
      phase: 'encoding', message: `Encoding… ${Math.round(progress * 100)}%`,
      percent: Math.round(62 + progress * 28),
    });
  });

  const vol     = musicClips?.[0]?.volume ?? musicVolume ?? 0.3;
  const capVf   = captionFilter(captions, W, H);
  const hasAudio = hasVo || hasMu;
  const hasBoth  = hasVo && hasMu;

  const args = ['-framerate', String(fps), '-i', 'f%06d.png'];
  if (hasVo) args.push('-i', 'vo.mp3');
  if (hasMu) args.push('-i', 'mu.mp3');

  const voIdx = hasVo ? 1 : -1;
  const muIdx = hasVo ? (hasMu ? 2 : -1) : (hasMu ? 1 : -1);

  const fcParts = [];
  let vMap = '0:v', aMap = null;

  if (capVf) { fcParts.push(`[0:v]${capVf}[vout]`); vMap = '[vout]'; }
  if (hasVo) fcParts.push(`[${voIdx}:a]volume=1.0[vo]`);
  if (hasMu) fcParts.push(`[${muIdx}:a]volume=${vol.toFixed(2)},aloop=loop=-1:size=2e+09,atrim=duration=${totalDur.toFixed(3)}[mu]`);
  if (hasBoth) { fcParts.push('[vo][mu]amix=inputs=2:duration=longest:normalize=0[aout]'); aMap = '[aout]'; }
  else if (hasVo) aMap = '[vo]';
  else if (hasMu) aMap = '[mu]';

  if (fcParts.length) { args.push('-filter_complex', fcParts.join(';')); }
  args.push('-map', vMap);
  if (aMap) args.push('-map', aMap);

  args.push(
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100'] : []),
    'out.mp4',
  );

  if (cancelledRef.current) throw new Error('cancelled');
  console.log('[FFmpegExport] Running ffmpeg...');
  await ff.exec(args);

  // 6. Read output
  onProgress?.({ phase: 'finalizing', message: 'Finalizing…', percent: 95 });
  const data    = await ff.readFile('out.mp4');
  const blob    = new Blob([data.buffer], { type: 'video/mp4' });
  const blobUrl = URL.createObjectURL(blob);

  // Cleanup FS
  for (let f = 0; f < totalFrames; f++) {
    try { await ff.deleteFile(`f${String(f).padStart(6, '0')}.png`); } catch {}
  }
  for (const name of ['out.mp4', 'vo.mp3', 'mu.mp3']) {
    try { await ff.deleteFile(name); } catch {}
  }

  return { blobUrl, sizeBytes: blob.size };
}

// ── Hook ─────────────────────────────────────────────────────────
export default function useFFmpegExport() {
  const [exporting,  setExporting]  = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [phase,      setPhase]      = useState('');
  const [error,      setError]      = useState(null);
  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setExporting(false);
    setProgress(0);
    setPhase('');
    setError(null);
  }, []);

  const exportVideo = useCallback(async (scenes, opts = {}) => {
    cancelledRef.current = false;
    setExporting(true);
    setProgress(0);
    setPhase('loading');
    setError(null);

    const onProgress = ({ phase: p, message, percent }) => {
      setPhase(p || '');
      setProgress(percent || 0);
      console.log(`[FFmpegExport] ${p}: ${message} (${percent}%)`);
    };

    try {
      const ff     = await getFFmpeg(onProgress);
      const result = await doExport(ff, scenes, opts, onProgress, cancelledRef);
      setProgress(100);
      setPhase('done');
      setExporting(false);
      return result;
    } catch (err) {
      if (err.message === 'cancelled') {
        setExporting(false); setPhase(''); setProgress(0);
        return null;
      }
      console.error('[FFmpegExport] Failed:', err);
      setError(err.message || 'Export failed');
      setExporting(false);
      throw err;
    }
  }, []);

  return {
    exporting, progress, phase, error,
    exportVideo, cancel,
    QUALITY_PRESETS, PORTRAIT_PRESETS,
  };
}