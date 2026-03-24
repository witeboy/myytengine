// ══════════════════════════════════════════════════════════════════
// EXPORT ENHANCED CLIP v2 — Full FYP-ready export pipeline
//
// FFmpeg filter chains for:
//   - 9:16 portrait crop with face-tracking focus
//   - Copyright prevention (speed shift, pitch alter, visual filter)
//   - Gameplay split-screen (speaker top, gameplay bottom)
//   - Audio: loudness norm, voice EQ, pitch shift
//   - Visual filters: vivid, hollywood, 4K upscale
//   - Progress bar burn-in
//
// Usage:
//   import { buildFullExportArgs } from './exportEnhancedClip';
//   const args = buildFullExportArgs(config);
//   await ffmpeg.exec(args);
// ══════════════════════════════════════════════════════════════════

// ── VISUAL FILTER PRESETS ───────────────────────────────────────
export const VISUAL_FILTERS = {
  none:      { label: 'None',      eq: '' },
  vivid:     { label: 'Vivid',     eq: 'eq=saturation=1.4:contrast=1.1:brightness=0.03' },
  hollywood: { label: 'Hollywood', eq: 'eq=saturation=0.85:contrast=1.15:brightness=-0.02,colorbalance=rs=0.05:gs=-0.02:bs=0.08' },
  warm:      { label: 'Warm Tone', eq: 'eq=saturation=1.1:contrast=1.05,colorbalance=rs=0.08:gs=0.02:bs=-0.06' },
  cool:      { label: 'Cool Tone', eq: 'eq=saturation=1.05:contrast=1.08,colorbalance=rs=-0.05:gs=0.02:bs=0.08' },
  cinematic: { label: 'Cinematic', eq: 'eq=saturation=0.9:contrast=1.2:brightness=-0.03,colorbalance=rs=0.03:gs=-0.01:bs=0.05' },
  '4k_sharp':{ label: '4K Sharp',  eq: 'unsharp=5:5:1.0:5:5:0.5' },
};

// ── COPYRIGHT PREVENTION PRESETS ────────────────────────────────
export const COPYRIGHT_PRESETS = {
  none:   { label: 'None',     speed: 1.0, pitchShift: 0, mirror: false },
  light:  { label: 'Light',    speed: 1.03, pitchShift: 0.5, mirror: false },
  medium: { label: 'Medium',   speed: 1.05, pitchShift: 1.0, mirror: true },
  heavy:  { label: 'Heavy',    speed: 1.08, pitchShift: 1.5, mirror: true },
};

/**
 * Build the full FFmpeg argument array for enhanced clip export.
 *
 * @param {Object} config
 * @param {number} config.startSec
 * @param {number} config.endSec
 *
 * — Portrait / Crop —
 * @param {boolean} config.portrait - Force 9:16 output (default true)
 * @param {number}  config.cropFocusX - 0-100, horizontal focus point for crop
 * @param {number}  config.cropFocusY - 0-100, vertical focus point
 * @param {number}  config.outputWidth - default 1080
 * @param {number}  config.outputHeight - default 1920
 *
 * — Copyright Shield —
 * @param {number}  config.speed - playback speed multiplier (e.g. 1.05)
 * @param {number}  config.pitchShift - semitones to shift audio pitch (e.g. 0.5)
 * @param {boolean} config.mirror - flip video horizontally
 *
 * — Visual Filter —
 * @param {string}  config.visualFilter - key from VISUAL_FILTERS
 *
 * — Gameplay Split —
 * @param {boolean} config.gameplaySplit - enable split-screen
 * @param {string}  config.gameplayFile - filename of gameplay video (pre-loaded into ffmpeg)
 * @param {number}  config.splitRatio - 0-100, % of frame for speaker (default 65)
 *
 * — Audio —
 * @param {number}  config.voiceBoostDb - EQ boost for voice clarity
 * @param {number}  config.normalizeLufs - loudness target (default -14)
 *
 * — Progress Bar —
 * @param {boolean} config.progressBar
 * @param {string}  config.progressBarColor - hex color
 *
 * @returns {string[]} FFmpeg arguments
 */
export function buildFullExportArgs({
  startSec,
  endSec,
  // Portrait
  portrait = true,
  cropFocusX = 50,
  cropFocusY = 35,
  outputWidth = 1080,
  outputHeight = 1920,
  // Copyright shield
  speed = 1.0,
  pitchShift = 0,
  mirror = false,
  // Visual filter
  visualFilter = 'none',
  // Gameplay split
  gameplaySplit = false,
  gameplayFile = 'gameplay.mp4',
  splitRatio = 65,
  // Audio
  voiceBoostDb = 3,
  normalizeLufs = -14,
  // Progress bar
  progressBar = false,
  progressBarColor = '#FF3B30',
  // Files
  inputFile = 'input.mp4',
  outputFile = 'output.mp4',
} = {}) {

  const duration = endSec - startSec;
  const videoFilters = [];
  const audioFilters = [];

  // ══════════════════════════════════════════════════════════
  // VIDEO FILTER CHAIN
  // ══════════════════════════════════════════════════════════

  // 1. Speed adjustment (copyright prevention)
  if (speed !== 1.0) {
    videoFilters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);
  }

  // 2. Mirror flip (copyright prevention)
  if (mirror) {
    videoFilters.push('hflip');
  }

  // 3. Portrait crop (9:16 from 16:9)
  if (portrait) {
    const focusX = cropFocusX / 100;
    // Crop: take a vertical slice from 16:9
    // width = height * 9/16, centered at focusX
    videoFilters.push(
      `crop=ih*9/16:ih:max(0\\,min(iw-ih*9/16\\,(iw-ih*9/16)*${focusX.toFixed(2)})):0`
    );
    videoFilters.push(`scale=${outputWidth}:${outputHeight}:flags=lanczos`);
  }

  // 4. Visual filter
  const filterPreset = VISUAL_FILTERS[visualFilter];
  if (filterPreset?.eq) {
    videoFilters.push(filterPreset.eq);
  }

  // 5. Progress bar (thin bar at top)
  if (progressBar) {
    const hexColor = (progressBarColor || '#FF3B30').replace('#', '0x');
    videoFilters.push(`drawbox=x=0:y=0:w=iw:h=4:color=${hexColor}@0.3:t=fill`);
  }

  // ══════════════════════════════════════════════════════════
  // AUDIO FILTER CHAIN
  // ══════════════════════════════════════════════════════════

  // 1. Speed adjustment (must match video)
  if (speed !== 1.0) {
    audioFilters.push(`atempo=${speed.toFixed(4)}`);
  }

  // 2. Pitch shift (copyright prevention)
  if (pitchShift !== 0) {
    // Use asetrate to shift pitch, then aresample to restore sample rate
    // pitchShift is in semitones, convert to ratio
    const ratio = Math.pow(2, pitchShift / 12);
    audioFilters.push(
      `asetrate=44100*${ratio.toFixed(4)}`,
      `aresample=44100`
    );
  }

  // 3. Voice clarity EQ boost
  if (voiceBoostDb > 0) {
    audioFilters.push(
      `highpass=f=80`,
      `equalizer=f=3000:t=q:w=1.5:g=${voiceBoostDb}`,
      `equalizer=f=150:t=q:w=1:g=${Math.round(voiceBoostDb * 0.5)}`
    );
  }

  // 4. Loudness normalization
  audioFilters.push(`loudnorm=I=${normalizeLufs}:TP=-1:LRA=11`);

  // ══════════════════════════════════════════════════════════
  // BUILD COMMAND
  // ══════════════════════════════════════════════════════════

  const args = ['-ss', startSec.toFixed(3)];

  // Input files
  args.push('-i', inputFile);
  if (gameplaySplit) {
    args.push('-i', gameplayFile);
  }
  args.push('-t', duration.toFixed(3));

  // ── Handle gameplay split-screen composition ──
  if (gameplaySplit) {
    const topH = Math.round((splitRatio / 100) * outputHeight);
    const botH = outputHeight - topH;

    // Complex filter: scale both inputs, stack vertically
    const vfChain = videoFilters.join(',');
    const mainScale = vfChain
      ? `[0:v]${vfChain},scale=${outputWidth}:${topH}:flags=lanczos[top]`
      : `[0:v]scale=${outputWidth}:${topH}:flags=lanczos[top]`;

    const complexFilter = [
      mainScale,
      `[1:v]scale=${outputWidth}:${botH}:flags=lanczos,setpts=PTS-STARTPTS[bot]`,
      `[top][bot]vstack=inputs=2[outv]`,
    ].join(';');

    args.push('-filter_complex', complexFilter);
    args.push('-map', '[outv]');
    args.push('-map', '0:a');

    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }
  } else {
    // Simple single-input pipeline
    if (videoFilters.length > 0) {
      args.push('-vf', videoFilters.join(','));
    }
    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }
  }

  // Output encoding
  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
    outputFile,
  );

  return args;
}

/**
 * Quick stream-copy clip (no re-encode, instant)
 */
export function buildQuickClipArgs(startSec, endSec, inputFile = 'input.mp4', outputFile = 'output.mp4') {
  return [
    '-ss', startSec.toFixed(3),
    '-i', inputFile,
    '-t', (endSec - startSec).toFixed(3),
    '-c', 'copy',
    '-avoid_negative_ts', 'make_zero',
    '-movflags', '+faststart',
    outputFile,
  ];
}

/**
 * Get output dimensions
 */
export function getOutputDimensions(portrait = true, gameplaySplit = false) {
  if (portrait) return { width: 1080, height: 1920, aspect: '9:16' };
  return { width: 1920, height: 1080, aspect: '16:9' };
}

/**
 * Filename generator
 */
export function enhancedClipFilename(title, index, format = 'mp4') {
  const safe = (title || `clip_${index + 1}`)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 35);
  return `${safe}_FYP_9x16.${format}`;
}
