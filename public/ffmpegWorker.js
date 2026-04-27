// ══════════════════════════════════════════════════════════════════
// ffmpegWorker.js — FFmpeg.wasm Web Worker (Classic Worker, Fixed)
//
// KEY FIXES over v1:
//  - Uses importScripts() not dynamic import() — classic workers
//    cannot use import(), importScripts is the correct API
//  - OffscreenCanvas used properly (available in all modern browsers)
//  - Caption text burned via ffmpeg drawtext filter (not canvas text)
//  - fetchFile loaded from UMD globals, not dynamic import
//  - Proper RGBA→PNG pipeline using OffscreenCanvas.convertToBlob
// ══════════════════════════════════════════════════════════════════

const post = (type, data = {}) => self.postMessage({ type, ...data });
const log  = (msg) => post('log', { message: msg });

let ffmpeg      = null;
let fetchFileFn = null;
let toBlobURLFn = null;
let ffmpegReady = false;
let cancelled   = false;

// ── Step 0: Load ffmpeg via importScripts (UMD, no dynamic import) ─
async function loadFFmpeg() {
  if (ffmpegReady && ffmpeg) return true;
  post('progress', { phase: 'loading', message: 'Loading FFmpeg engine…', percent: 0 });
  try {
    importScripts('https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js');
    importScripts('https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/util.js');

    const { FFmpeg }     = self.FFmpegWASM;
    fetchFileFn           = self.FFmpegUtil.fetchFile;
    toBlobURLFn           = self.FFmpegUtil.toBlobURL;

    ffmpeg = new FFmpeg();
    ffmpeg.on('log',      ({ message }) => log(message));
    ffmpeg.on('progress', ({ progress }) => {
      post('progress', {
        phase: 'encoding', percent: Math.round(60 + progress * 30),
        message: `Encoding… ${Math.round(progress * 100)}%`,
      });
    });

    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL:        await toBlobURLFn(`${base}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL:        await toBlobURLFn(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      classWorkerURL: await toBlobURLFn(
        'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js', 'text/javascript'
      ),
    });

    ffmpegReady = true;
    post('progress', { phase: 'ready', message: 'FFmpeg ready', percent: 5 });
    return true;
  } catch (err) {
    post('error', { message: `FFmpeg load failed: ${err.message}` });
    return false;
  }
}

// ── Motion presets (same as useVideoExport) ───────────────────────
const MOTIONS = [
  { id: 'zoom_in_center',  s0: 1.0,  s1: 1.10, x0: 0,    y0: 0,    x1: 0,    y1: 0    },
  { id: 'zoom_out_center', s0: 1.10, s1: 1.0,  x0: 0,    y0: 0,    x1: 0,    y1: 0    },
  { id: 'pan_right_zoom',  s0: 1.0,  s1: 1.08, x0: -1.5, y0: 0,    x1: 1.5,  y1: 0    },
  { id: 'pan_left_zoom',   s0: 1.0,  s1: 1.08, x0: 1.5,  y0: 0,    x1: -1.5, y1: 0    },
  { id: 'push_in_top',     s0: 1.0,  s1: 1.08, x0: 0,    y0: 1.2,  x1: 0,    y1: -1.2 },
  { id: 'push_in_bottom',  s0: 1.0,  s1: 1.08, x0: 0,    y0: -1.2, x1: 0,    y1: 1.2  },
  { id: 'diagonal_tl_br',  s0: 1.0,  s1: 1.08, x0: 1.5,  y0: 1.0,  x1: -1.5, y1: -1.0 },
  { id: 'diagonal_tr_bl',  s0: 1.0,  s1: 1.08, x0: -1.5, y0: 1.0,  x1: 1.5,  y1: -1.0 },
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

// ── Decode image URL → OffscreenCanvas (cached) ───────────────────
async function loadBitmap(url) {
  const res  = await fetch(url, { mode: 'cors' }).catch(() => fetch(url));
  const blob = await res.blob();
  return createImageBitmap(blob);
}

// ── Render one frame to PNG Uint8Array ────────────────────────────
async function renderFramePng(bitmap, scene, elapsed, W, H) {
  const canvas = new OffscreenCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  if (bitmap) {
    const sw = bitmap.width, sh = bitmap.height;
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

// ── Build drawtext filter string for all captions ─────────────────
function captionFilter(captions, W, H) {
  if (!captions?.length) return '';
  return captions
    .filter(c => c.text?.trim())
    .map(c => {
      const fs    = Math.round((c.fontSize || 20) * (H / 1080) * 1.4);
      const xPct  = (c.x ?? 50) / 100;
      const yPct  = (c.y ?? 85) / 100;
      const color = (c.color || '#FFFFFF').replace('#', '0x');
      const safe  = (c.text || '').replace(/[':]/g, ' ').replace(/\n/g, ' ');
      const t0    = (c.startTime || 0).toFixed(3);
      const t1    = ((c.startTime || 0) + (c.duration || 1)).toFixed(3);
      return `drawtext=text='${safe}':fontsize=${fs}:fontcolor=${color}:x=(w*${xPct.toFixed(3)})-tw/2:y=(h*${yPct.toFixed(3)})-th/2:box=1:boxcolor=black@0.55:boxborderw=6:enable='between(t\\,${t0}\\,${t1})'`;
    })
    .join(',');
}

// ── Main export pipeline ──────────────────────────────────────────
async function runExport(payload) {
  const {
    scenes = [], captions = [],
    voiceoverUrl, musicUrl, musicVolume = 0.3, musicClips = [],
    fps = 30, orientation = 'landscape', width, height,
  } = payload;

  cancelled = false;
  const W = width  || (orientation === 'portrait' ? 720  : 1280);
  const H = height || (orientation === 'portrait' ? 1280 : 720);

  // 1. Pre-load all bitmaps
  post('progress', { phase: 'loading', message: 'Loading images…', percent: 6 });
  const bitmaps = [];
  for (let i = 0; i < scenes.length; i++) {
    if (cancelled) return;
    const url = scenes[i].imageUrl || scenes[i].image_url || '';
    let bmp = null;
    if (url.startsWith('http')) {
      try { bmp = await loadBitmap(url); } catch (e) { log(`Scene ${i}: ${e.message}`); }
    }
    bitmaps.push(bmp);
    post('progress', {
      phase: 'loading', message: `Loading ${i + 1}/${scenes.length}…`,
      percent: Math.round(6 + (i / scenes.length) * 13),
    });
  }

  // 2. Timeline math
  let off = 0;
  const starts = scenes.map(s => { const t = off; off += (s.duration || 8); return t; });
  const totalDur    = off;
  const totalFrames = Math.ceil(totalDur * fps);
  log(`${scenes.length} scenes | ${totalFrames} frames | ${W}×${H} | ${fps}fps | ${totalDur.toFixed(1)}s`);

  // 3. Render frames → ffmpeg FS
  post('progress', { phase: 'rendering', message: 'Rendering frames…', percent: 20 });
  for (let f = 0; f < totalFrames; f++) {
    if (cancelled) return;
    const absTime = f / fps;
    let ci = scenes.length - 1;
    for (let i = 0; i < scenes.length; i++) {
      if (absTime < starts[i] + (scenes[i].duration || 8)) { ci = i; break; }
    }
    const elapsed = absTime - starts[ci];
    const png     = await renderFramePng(bitmaps[ci], scenes[ci], elapsed, W, H);
    await ffmpeg.writeFile(`f${String(f).padStart(6, '0')}.png`, png);
    if (f % 20 === 0) {
      post('progress', {
        phase: 'rendering', message: `Frame ${f + 1}/${totalFrames}…`,
        percent: Math.round(20 + (f / totalFrames) * 38),
      });
    }
  }

  // Free bitmaps
  for (const bmp of bitmaps) { try { bmp?.close(); } catch {} }

  // 4. Load audio
  let hasVo = false, hasMu = false;
  if (voiceoverUrl) {
    post('progress', { phase: 'audio', message: 'Loading voiceover…', percent: 59 });
    try {
      await ffmpeg.writeFile('vo.mp3', await fetchFileFn(voiceoverUrl));
      hasVo = true;
    } catch (e) { log(`VO failed: ${e.message}`); }
  }
  if (musicUrl) {
    post('progress', { phase: 'audio', message: 'Loading music…', percent: 61 });
    try {
      await ffmpeg.writeFile('mu.mp3', await fetchFileFn(musicUrl));
      hasMu = true;
    } catch (e) { log(`Music failed: ${e.message}`); }
  }

  // 5. Build ffmpeg args
  post('progress', { phase: 'encoding', message: 'Encoding MP4…', percent: 63 });

  const vol   = musicClips?.[0]?.volume ?? musicVolume ?? 0.3;
  const capVf = captionFilter(captions, W, H);

  // Input: frames + optional audio files
  const args = ['-framerate', String(fps), '-i', 'f%06d.png'];
  if (hasVo) args.push('-i', 'vo.mp3');
  if (hasMu) args.push('-i', 'mu.mp3');

  // Decide filter_complex vs simple vf
  const audioIdx  = { vo: hasVo ? 1 : -1, mu: hasVo ? (hasMu ? 2 : -1) : (hasMu ? 1 : -1) };
  const hasBoth   = hasVo && hasMu;
  const hasAudio  = hasVo || hasMu;

  if (hasAudio || capVf) {
    const fcParts = [];
    let   vMap    = '0:v';

    if (capVf) {
      fcParts.push(`[0:v]${capVf}[vout]`);
      vMap = '[vout]';
    }
    if (hasVo) fcParts.push(`[${audioIdx.vo}:a]volume=1.0[vo]`);
    if (hasMu) fcParts.push(`[${audioIdx.mu}:a]volume=${vol.toFixed(2)},aloop=loop=-1:size=2e+09,atrim=duration=${totalDur.toFixed(3)}[mu]`);

    let aMap = null;
    if (hasBoth) {
      fcParts.push('[vo][mu]amix=inputs=2:duration=longest:normalize=0[aout]');
      aMap = '[aout]';
    } else if (hasVo) { aMap = '[vo]'; }
    else if (hasMu)   { aMap = '[mu]'; }

    if (fcParts.length) args.push('-filter_complex', fcParts.join(';'));
    args.push('-map', vMap);
    if (aMap) args.push('-map', aMap);
  } else {
    args.push('-map', '0:v');
  }

  args.push(
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ar', '44100'] : []),
    'out.mp4',
  );

  log(`Running: ffmpeg ${args.join(' ')}`);
  if (cancelled) return;
  await ffmpeg.exec(args);

  // 6. Read & return
  post('progress', { phase: 'finalizing', message: 'Finalizing…', percent: 95 });
  const data    = await ffmpeg.readFile('out.mp4');
  const blob    = new Blob([data.buffer], { type: 'video/mp4' });
  const blobUrl = URL.createObjectURL(blob);

  // Cleanup FS
  for (let f = 0; f < totalFrames; f++) {
    try { await ffmpeg.deleteFile(`f${String(f).padStart(6, '0')}.png`); } catch {}
  }
  for (const name of ['out.mp4', 'vo.mp3', 'mu.mp3']) {
    try { await ffmpeg.deleteFile(name); } catch {}
  }

  post('progress', { phase: 'done', message: 'Done!', percent: 100 });
  post('done', { blobUrl, sizeBytes: blob.size });
}

// ── Message handler ───────────────────────────────────────────────
self.onmessage = async ({ data: { type, payload } }) => {
  if (type === 'start') {
    const ok = await loadFFmpeg();
    if (!ok) return;
    try { await runExport(payload); }
    catch (err) { if (!cancelled) post('error', { message: err.message || 'Export failed' }); }
  }
  if (type === 'cancel') {
    cancelled = true;
    post('error', { message: 'cancelled' });
  }
};
