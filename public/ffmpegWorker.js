// ══════════════════════════════════════════════════════════════════
// ffmpegWorker.js — FFmpeg.wasm Web Worker
//
// Runs entirely off the main thread. Receives scene data + audio URLs,
// renders each scene to raw frames via OffscreenCanvas, encodes with
// ffmpeg.wasm, muxes to MP4, returns blob URL.
//
// Uses the single-threaded UMD core — works WITHOUT SharedArrayBuffer
// so no COOP/COEP headers are required. Works on any modern browser.
//
// Message protocol:
//   IN:  { type: 'start', payload: { scenes, captions, voiceoverUrl,
//           musicUrl, musicVolume, musicClips, quality, orientation,
//           fps, width, height } }
//   OUT: { type: 'progress', phase, message, percent }
//       { type: 'done', blobUrl, sizeBytes }
//       { type: 'error', message }
//       { type: 'log', message }
// ══════════════════════════════════════════════════════════════════

/* global OffscreenCanvas */

let ffmpeg = null;
let ffmpegReady = false;

const post = (type, data = {}) => self.postMessage({ type, ...data });
const log  = (msg) => post('log', { message: msg });

// ── Load ffmpeg.wasm (single-threaded UMD — no SAB needed) ────────
async function loadFFmpeg() {
  if (ffmpegReady && ffmpeg) return true;

  post('progress', { phase: 'loading', message: 'Loading FFmpeg engine…', percent: 0 });

  try {
    const { FFmpeg } = await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.10');
    const { toBlobURL, fetchFile } = await import('https://esm.sh/@ffmpeg/util@0.12.1');

    ffmpeg = new FFmpeg();
    ffmpeg._fetchFile = fetchFile;

    ffmpeg.on('log', ({ message }) => log(`[ffmpeg] ${message}`));
    ffmpeg.on('progress', ({ progress }) => {
      post('progress', {
        phase:   'encoding',
        message: `Encoding… ${Math.round(progress * 100)}%`,
        percent: Math.round(10 + progress * 70),
      });
    });

    // Use UMD (single-threaded) core — works without COOP/COEP headers
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    const workerUrl = await toBlobURL(
      'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/worker.js',
      'text/javascript',
    );

    await ffmpeg.load({
      coreURL:        await toBlobURL(`${base}/ffmpeg-core.js`,   'text/javascript'),
      wasmURL:        await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      classWorkerURL: workerUrl,
    });

    ffmpegReady = true;
    post('progress', { phase: 'ready', message: 'FFmpeg ready', percent: 5 });
    return true;
  } catch (err) {
    post('error', { message: `Failed to load FFmpeg: ${err.message}` });
    return false;
  }
}

// ── Cinematic motion transform ────────────────────────────────────
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

const easeOutSine = t => Math.sin((t * Math.PI) / 2);

function getMotionTransform(clip, elapsedInClip, W, H) {
  if (!clip?.cinematicMotion) return null;
  const motion = CINEMATIC_MOTIONS.find(m => m.id === clip.cinematicMotion);
  if (!motion) return null;
  const speed     = clip.motionSpeed     ?? 1.0;
  const intensity = clip.motionIntensity ?? 1.0;
  const window    = (clip.duration ?? 5) / speed;
  const p         = Math.min(1, Math.max(0, elapsedInClip / window));
  const eased     = easeOutSine(p);
  const scale     = motion.startScale + (motion.endScale - motion.startScale) * intensity * eased;
  const tx        = ((motion.startX + (motion.endX - motion.startX) * intensity * eased) / 100) * W;
  const ty        = ((motion.startY + (motion.endY - motion.startY) * intensity * eased) / 100) * H;
  return { scale, tx, ty };
}

// ── Draw a single media frame to an OffscreenCanvas ctx ──────────
function drawFrame(ctx, W, H, media, mediaType, mxform) {
  const sw = mediaType === 'video'
    ? (media.videoWidth  || media.width  || 1)
    : (media.naturalWidth  || media.width  || 1);
  const sh = mediaType === 'video'
    ? (media.videoHeight || media.height || 1)
    : (media.naturalHeight || media.height || 1);
  const fit  = Math.min(W / sw, H / sh);
  const dw   = sw * fit, dh = sh * fit;
  const dx   = (W - dw) / 2, dy = (H - dh) / 2;
  ctx.save();
  if (mxform) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(mxform.scale, mxform.scale);
    ctx.translate(-W / 2 + mxform.tx, -H / 2 + mxform.ty);
  }
  try { ctx.drawImage(media, dx, dy, dw, dh); } catch {}
  ctx.restore();
}

// ── Draw caption text on canvas ───────────────────────────────────
function drawCaptions(ctx, W, H, captions, absTime) {
  if (!captions?.length) return;
  const active = captions.filter(c => absTime >= c.startTime && absTime < c.startTime + c.duration);
  for (const cap of active) {
    if (!cap.text?.trim()) continue;
    const baseScale = H / 1080;
    const fontSize  = Math.round((cap.fontSize || 20) * baseScale);
    ctx.save();
    ctx.font      = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = (cap.x || 50) / 100 * W;
    const y = (cap.y || 85) / 100 * H;
    const metrics = ctx.measureText(cap.text);
    const padX = fontSize * 0.6, padY = fontSize * 0.4;
    if (cap.bgColor) {
      ctx.fillStyle = cap.bgColor;
      ctx.beginPath();
      ctx.roundRect(x - metrics.width / 2 - padX, y - fontSize / 2 - padY,
        metrics.width + padX * 2, fontSize + padY * 2, 6);
      ctx.fill();
    }
    ctx.fillStyle = cap.color || '#FFFFFF';
    ctx.fillText(cap.text, x, y);
    ctx.restore();
  }
}

// ── Fetch a URL and return as blob URL (CORS-safe) ────────────────
async function toBlobUrlSafe(url) {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (r.ok) return URL.createObjectURL(await r.blob());
  } catch {}
  return url; // fallback to direct URL
}

// ── Load an ImageBitmap from a URL ────────────────────────────────
async function loadImageBitmap(url) {
  const blobUrl = await toBlobUrlSafe(url);
  const res = await fetch(blobUrl);
  return createImageBitmap(await res.blob());
}

// ── Main export function ──────────────────────────────────────────
async function runExport(payload) {
  const {
    scenes      = [],
    captions    = [],
    voiceoverUrl,
    musicUrl,
    musicVolume = 0.3,
    musicClips  = [],
    quality     = '720p',
    orientation = 'landscape',
    fps         = 30,
    width,
    height,
  } = payload;

  const W = width  || (orientation === 'portrait' ? 720  : 1280);
  const H = height || (orientation === 'portrait' ? 1280 : 720);

  post('progress', { phase: 'loading', message: 'Loading scene media…', percent: 5 });

  // ── Step 1: Pre-load all media ───────────────────────────────────
  const mediaCache = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const wantsVideo = scene.mediaType === 'video' && scene.videoUrl?.startsWith('http');
    let media = null, mediaType = 'image';

    try {
      if (wantsVideo) {
        // Video: we'll seek frame by frame — load as ImageBitmap per frame below
        mediaType = 'video';
        media = null; // handled per-frame
      } else if (scene.imageUrl?.startsWith('http')) {
        media = await loadImageBitmap(scene.imageUrl);
        mediaType = 'image';
      }
    } catch (e) {
      log(`Scene ${i} media load failed: ${e.message}`);
    }

    mediaCache.push({ media, mediaType, scene });
    post('progress', {
      phase:   'loading',
      message: `Loading media ${i + 1}/${scenes.length}…`,
      percent: Math.round(5 + (i / scenes.length) * 10),
    });
  }

  // ── Step 2: Render all frames to PNG files in ffmpeg FS ──────────
  post('progress', { phase: 'rendering', message: 'Rendering video frames…', percent: 15 });

  const canvas = new OffscreenCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Calculate total frames
  let timeOffset = 0;
  const clipStartTimes = scenes.map(s => {
    const t = timeOffset;
    timeOffset += s.duration || 8;
    return t;
  });
  const totalDuration = timeOffset;
  const totalFrames   = Math.ceil(totalDuration * fps);

  log(`Rendering ${totalFrames} frames @ ${fps}fps, ${W}x${H}`);

  // Write frames as PNG sequence into ffmpeg virtual FS
  const frameFiles = [];

  for (let f = 0; f < totalFrames; f++) {
    const absTime = f / fps;

    // Find current scene
    let ci = scenes.length - 1;
    for (let i = 0; i < scenes.length; i++) {
      if (absTime < clipStartTimes[i] + (scenes[i].duration || 8)) { ci = i; break; }
    }

    const scene   = scenes[ci];
    const elapsed = absTime - clipStartTimes[ci];
    const { media, mediaType } = mediaCache[ci];
    const mxform  = getMotionTransform(scene, elapsed, W, H);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (media && mediaType === 'image') {
      drawFrame(ctx, W, H, media, 'image', mxform);
    }
    // Video frames: for worker context we use ImageBitmap per seek
    // (video element not available in worker — use image fallback)
    else if (mediaType === 'video' && scene.imageUrl?.startsWith('http')) {
      // Use the scene image as fallback for video in worker context
      // (full video seek requires main thread VideoElement)
      if (!mediaCache[ci]._fallback) {
        try {
          mediaCache[ci]._fallback = await loadImageBitmap(scene.imageUrl);
        } catch {}
      }
      if (mediaCache[ci]._fallback) {
        drawFrame(ctx, W, H, mediaCache[ci]._fallback, 'image', mxform);
      }
    }

    // Draw captions on top
    drawCaptions(ctx, W, H, captions, absTime);

    // Transition: simple fade in/out at clip boundaries
    const prevScene = ci > 0 ? scenes[ci - 1] : null;
    const transDur  = prevScene?.transitionDuration ?? 0.6;
    if (prevScene?.transition && elapsed < transDur) {
      ctx.globalAlpha = elapsed / transDur;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Convert canvas to PNG bytes and write to ffmpeg FS
    const blob  = await canvas.convertToBlob({ type: 'image/png' });
    const buf   = await blob.arrayBuffer();
    const fname = `frame${String(f).padStart(6, '0')}.png`;
    await ffmpeg.writeFile(fname, new Uint8Array(buf));
    frameFiles.push(fname);

    if (f % 10 === 0) {
      post('progress', {
        phase:   'rendering',
        message: `Rendering frame ${f + 1}/${totalFrames}…`,
        percent: Math.round(15 + (f / totalFrames) * 40),
      });
    }
  }

  // ── Step 3: Download audio files into ffmpeg FS ──────────────────
  const audioInputArgs = [];
  const audioFilterParts = [];
  let audioInputIndex = 0;

  if (voiceoverUrl) {
    post('progress', { phase: 'audio', message: 'Loading voiceover…', percent: 56 });
    try {
      const { fetchFile } = await import('https://esm.sh/@ffmpeg/util@0.12.1');
      const voData = await fetchFile(voiceoverUrl);
      await ffmpeg.writeFile('voiceover.mp3', voData);
      audioInputArgs.push('-i', 'voiceover.mp3');
      audioFilterParts.push(`[${audioInputIndex}:a]volume=1.0[vo]`);
      audioInputIndex++;
    } catch (e) {
      log(`Voiceover load failed: ${e.message}`);
    }
  }

  if (musicUrl) {
    post('progress', { phase: 'audio', message: 'Loading music…', percent: 58 });
    try {
      const { fetchFile } = await import('https://esm.sh/@ffmpeg/util@0.12.1');
      const muData = await fetchFile(musicUrl);
      await ffmpeg.writeFile('music.mp3', muData);
      const vol = musicClips?.[0]?.volume ?? musicVolume ?? 0.3;
      audioInputArgs.push('-i', 'music.mp3');
      audioFilterParts.push(`[${audioInputIndex}:a]volume=${vol.toFixed(2)},aloop=loop=-1:size=2e+09,atrim=duration=${totalDuration.toFixed(3)}[mu]`);
      audioInputIndex++;
    } catch (e) {
      log(`Music load failed: ${e.message}`);
    }
  }

  // ── Step 4: Build and run ffmpeg command ─────────────────────────
  post('progress', { phase: 'encoding', message: 'Encoding MP4…', percent: 60 });

  const ffmpegArgs = [
    '-framerate', String(fps),
    '-i',         'frame%06d.png',
    ...audioInputArgs,
  ];

  // Audio filter graph
  const hasVo    = voiceoverUrl && audioInputIndex > 0;
  const hasMu    = musicUrl && audioInputIndex > (voiceoverUrl ? 1 : 0);
  const hasBoth  = hasVo && hasMu;

  if (hasBoth) {
    ffmpegArgs.push(
      '-filter_complex',
      `${audioFilterParts.join(';')};[vo][mu]amix=inputs=2:duration=longest:normalize=0[aout]`,
      '-map', '0:v',
      '-map', '[aout]',
    );
  } else if (hasVo) {
    ffmpegArgs.push(
      '-filter_complex', audioFilterParts[0],
      '-map', '0:v',
      '-map', '[vo]',
    );
  } else if (hasMu) {
    ffmpegArgs.push(
      '-filter_complex', audioFilterParts[0],
      '-map', '0:v',
      '-map', '[mu]',
    );
  } else {
    ffmpegArgs.push('-map', '0:v');
  }

  ffmpegArgs.push(
    '-c:v',       'libx264',
    '-preset',    'ultrafast',   // fastest encode — good enough for export
    '-crf',       '23',
    '-pix_fmt',   'yuv420p',
    '-movflags',  '+faststart',
    ...(hasVo || hasMu ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    'output.mp4',
  );

  log(`Running ffmpeg with ${ffmpegArgs.length} args`);
  await ffmpeg.exec(ffmpegArgs);

  // ── Step 5: Read output and return ───────────────────────────────
  post('progress', { phase: 'finalizing', message: 'Finalizing…', percent: 95 });

  const outputData = await ffmpeg.readFile('output.mp4');
  const blob       = new Blob([outputData.buffer], { type: 'video/mp4' });
  const blobUrl    = URL.createObjectURL(blob);

  // Clean up FS
  for (const f of frameFiles) {
    try { await ffmpeg.deleteFile(f); } catch {}
  }
  try { await ffmpeg.deleteFile('output.mp4'); } catch {}
  if (voiceoverUrl) try { await ffmpeg.deleteFile('voiceover.mp3'); } catch {}
  if (musicUrl)     try { await ffmpeg.deleteFile('music.mp3'); } catch {}

  post('progress', { phase: 'done', message: 'Export complete!', percent: 100 });
  post('done', { blobUrl, sizeBytes: blob.size });
}

// ── Message handler ───────────────────────────────────────────────
self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'start') {
    const ok = await loadFFmpeg();
    if (!ok) return;
    try {
      await runExport(payload);
    } catch (err) {
      post('error', { message: err.message || 'Export failed' });
    }
  }

  if (type === 'cancel') {
    // ffmpeg.wasm doesn't have a clean cancel — terminate worker from outside
    post('error', { message: 'cancelled' });
  }
};
