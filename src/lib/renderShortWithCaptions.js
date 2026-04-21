// ══════════════════════════════════════════════════════════════════════
// RENDER SHORT WITH CAPTIONS — 9:16 vertical Shorts + Hormozi captions
//
// Pipeline:
//   1. Clip source video with FFmpeg (stream-copy, fast)
//   2. Build ASS subtitle file from AssemblyAI word timings
//      (Hormozi style: bold white, yellow highlight on active word)
//   3. Re-encode with vf crop/pad to 9:16 + subtitles burn-in
//   4. Fallback to canvas+MediaRecorder if FFmpeg unavailable
//
// Depends on: lib/clipWithFFmpeg.js (reuses loaded FFmpeg instance)
// ══════════════════════════════════════════════════════════════════════

import { initFFmpeg, isFFmpegSupported } from './clipWithFFmpeg';

// ── Time formatting for ASS (H:MM:SS.cs) ────────────────────────────
function assTime(sec) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec - Math.floor(sec)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ── Escape ASS-reserved characters in spoken text ──────────────────
function assEscape(text) {
  return String(text).replace(/[{}\\]/g, '').replace(/\n/g, ' ');
}

// ── Group words into short caption chunks (Hormozi style: 2-4 words) ─
function chunkWords(words, maxWordsPerChunk = 3, maxChunkDuration = 1.8) {
  const chunks = [];
  let current = [];
  let chunkStart = null;

  for (const w of words) {
    if (current.length === 0) chunkStart = w.start;
    current.push(w);
    const chunkDur = w.end - chunkStart;

    // Break on natural punctuation, max word count, or max duration
    const hasEndPunct = /[.!?,]$/.test(w.word);
    if (
      current.length >= maxWordsPerChunk ||
      chunkDur >= maxChunkDuration ||
      hasEndPunct
    ) {
      chunks.push({
        start: current[0].start,
        end: current[current.length - 1].end,
        words: current,
      });
      current = [];
    }
  }
  if (current.length) {
    chunks.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      words: current,
    });
  }
  return chunks;
}

// ══════════════════════════════════════════════════════════════════════
// Build Hormozi-style ASS subtitle file
//
// Each chunk is emitted as ONE Dialogue line where the active word is
// animated via ASS override tags {\c&HFFFF&} (yellow BGR) + {\b1} bold.
// We rebuild the text per word transition using karaoke-like timing.
//
// Coordinates are in the target 1080×1920 (9:16) frame.
// ══════════════════════════════════════════════════════════════════════
function buildHormoziAssFile({
  words,
  clipStart,      // seconds — where in SOURCE video the clip begins
  clipDuration,   // seconds — total clip length
  style = 'hormozi', // 'hormozi' | 'mrbeast' | 'minimal'
  videoWidth = 1080,
  videoHeight = 1920,
}) {
  // Filter + shift words into clip timeline (0 .. clipDuration)
  const shifted = (words || [])
    .filter(w =>
      typeof w.start === 'number' &&
      typeof w.end === 'number' &&
      w.end > clipStart &&
      w.start < clipStart + clipDuration
    )
    .map(w => ({
      word: (w.word || w.text || '').trim(),
      start: Math.max(0, w.start - clipStart),
      end: Math.min(clipDuration, w.end - clipStart),
    }))
    .filter(w => w.word && w.end > w.start);

  // Style presets — colors are ASS &HBBGGRR& (reverse byte order!)
  const PRESETS = {
    hormozi: {
      fontName: 'Arial Black',
      fontSize: 96,
      primary:    '&H00FFFFFF',  // white fill
      highlight:  '&H0000FFFF',  // yellow highlight (BGR: FF FF 00)
      outline:    '&H00000000',  // black outline
      back:       '&H80000000',  // translucent black shadow
      outlineW:   6,
      shadowW:    3,
      bold:       -1,
      marginV:    340,           // push up from bottom (1920h frame)
    },
    mrbeast: {
      fontName: 'Impact',
      fontSize: 110,
      primary:    '&H00FFFFFF',
      highlight:  '&H000000FF',  // red highlight
      outline:    '&H00000000',
      back:       '&H80000000',
      outlineW:   8,
      shadowW:    4,
      bold:       -1,
      marginV:    300,
    },
    minimal: {
      fontName: 'Arial',
      fontSize: 72,
      primary:    '&H00FFFFFF',
      highlight:  '&H00FFFF00',  // cyan highlight
      outline:    '&H00000000',
      back:       '&H00000000',
      outlineW:   3,
      shadowW:    1,
      bold:       0,
      marginV:    200,
    },
  };
  const p = PRESETS[style] || PRESETS.hormozi;

  const chunks = chunkWords(shifted, 3, 1.8);

  // ── ASS header ─────────────────────────────────────────────────
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${p.fontName},${p.fontSize},${p.primary},${p.primary},${p.outline},${p.back},${p.bold},0,0,0,100,100,0,0,1,${p.outlineW},${p.shadowW},2,80,80,${p.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // ── Per-chunk dialogue lines (karaoke-style with \t transform) ──
  // ONE Dialogue line per chunk, spanning the full chunk duration.
  // Inside, we use \t(start_ms, end_ms, \c&color&\fscx&size&) to animate
  // each word's highlight at the exact moment it's spoken. This avoids
  // the flicker caused by emitting multiple overlapping lines per chunk.
  //
  // Times inside \t(...) are milliseconds RELATIVE to the Dialogue start.
  const lines = [];
  for (const chunk of chunks) {
    const chunkStart = chunk.start;
    const chunkEnd = chunk.end;
    // Start every word in primary (white) — animate to highlight on its turn
    const parts = chunk.words.map((w) => {
      const t = assEscape(w.word.toUpperCase());
      const relStartMs = Math.max(0, Math.round((w.start - chunkStart) * 1000));
      const relEndMs = Math.max(relStartMs + 30, Math.round((w.end - chunkStart) * 1000));
      // \t(ms1, ms2, tags) — animate tags from ms1 to ms2
      // Pop in: scale 100→115, white→highlight during word
      // Pop out: scale back to 100, color back to primary after word
      const popOutMs = relEndMs + 40;
      return (
        `{\\c${p.primary}\\fscx100\\fscy100}` +
        `{\\t(${relStartMs},${relStartMs + 80},\\c${p.highlight}\\fscx115\\fscy115)}` +
        `{\\t(${relEndMs},${popOutMs},\\c${p.primary}\\fscx100\\fscy100)}` +
        t
      );
    });
    const text = parts.join(' ');
    lines.push(
      `Dialogue: 0,${assTime(chunkStart)},${assTime(chunkEnd)},Default,,0,0,0,,${text}`
    );
  }

  return header + lines.join('\n') + '\n';
}

// ══════════════════════════════════════════════════════════════════════
// MAIN: render a 9:16 Short with burned-in captions
//
// @param {Object} opts
//   videoUrl       — source video URL
//   startSec       — clip start in source (sec)
//   endSec         — clip end in source (sec)
//   words          — AssemblyAI word timings [{word, start, end}] — SOURCE timeline
//   captionStyle   — 'hormozi' | 'mrbeast' | 'minimal' | 'none'
//   targetWidth    — output width  (default 1080)
//   targetHeight   — output height (default 1920)
//   onProgress     — ({phase, message, percent}) callback
//
// @returns {Blob} MP4 blob
// ══════════════════════════════════════════════════════════════════════
export async function renderShortWithCaptions({
  videoUrl,
  startSec,
  endSec,
  words = [],
  captionStyle = 'hormozi',
  targetWidth = 1080,
  targetHeight = 1920,
  onProgress,
}) {
  if (!isFFmpegSupported()) {
    throw new Error('Shorts rendering requires FFmpeg (SharedArrayBuffer not available in this browser). Try Chrome/Edge latest.');
  }

  const ffmpeg = await initFFmpeg(onProgress);
  if (!ffmpeg) throw new Error('FFmpeg failed to load');

  const { fetchFile } = await import(
    /* webpackIgnore: true */
    'https://esm.sh/@ffmpeg/util@0.12.1'
  );

  const duration = endSec - startSec;
  if (duration <= 0) throw new Error('Invalid clip range');

  onProgress?.({ phase: 'downloading', message: 'Fetching source video…', percent: 5 });
  const videoData = await fetchFile(videoUrl);
  await ffmpeg.writeFile('input.mp4', videoData);

  // ── Write ASS subtitle file (only if captions requested) ────────
  const wantsCaptions = captionStyle !== 'none' && words.length > 0;
  if (wantsCaptions) {
    const assContent = buildHormoziAssFile({
      words,
      clipStart: startSec,
      clipDuration: duration,
      style: captionStyle,
      videoWidth: targetWidth,
      videoHeight: targetHeight,
    });
    await ffmpeg.writeFile('subs.ass', new TextEncoder().encode(assContent));
  }

  // ── Build video filter chain ─────────────────────────────────────
  // Use force_original_aspect_ratio=increase to scale so the source covers the
  // full 1080x1920 frame (may overflow in one dimension), then center-crop the
  // overflow. Works identically for landscape AND portrait sources, no escaping
  // issues, no edge cases. Finally normalize SAR.
  const cropScale =
    `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,` +
    `crop=${targetWidth}:${targetHeight},` +
    `setsar=1`;

  const vf = wantsCaptions
    ? `${cropScale},ass=subs.ass`
    : cropScale;

  onProgress?.({ phase: 'rendering', message: 'Rendering 9:16 Short with captions…', percent: 20 });

  // Re-encode (captions require it). Use fast preset for browser perf.
  await ffmpeg.exec([
    '-ss', startSec.toFixed(3),
    '-i', 'input.mp4',
    '-t', duration.toFixed(3),
    '-vf', vf,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'output.mp4',
  ]);

  const outputData = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([outputData.buffer], { type: 'video/mp4' });

  // Cleanup
  try { await ffmpeg.deleteFile('input.mp4'); } catch (_) {}
  try { await ffmpeg.deleteFile('output.mp4'); } catch (_) {}
  if (wantsCaptions) { try { await ffmpeg.deleteFile('subs.ass'); } catch (_) {} }

  onProgress?.({
    phase: 'done',
    message: `Short ready (${(blob.size / 1048576).toFixed(1)}MB, ${duration.toFixed(1)}s)`,
    percent: 100,
  });
  return blob;
}

// ── Download helper ─────────────────────────────────────────────────
export function downloadShortBlob(blob, title, index) {
  const safe = (title || `short_${index + 1}`)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 40);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}_9x16.mp4`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}