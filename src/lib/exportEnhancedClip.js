// ══════════════════════════════════════════════════════════════════
// EXPORT ENHANCED CLIP — FFmpeg filter chains for FYP-ready output
//
// Builds complex FFmpeg commands to combine:
//   - 9:16 vertical crop with custom focus point
//   - Audio loudness normalization (-14 LUFS)
//   - Voice clarity EQ boost
//   - Progress bar burn-in (via drawbox filter)
//
// Captions and hooks are rendered via canvas at playback time
// and composited during export via the VideoExporter pattern.
//
// Usage:
//   import { buildEnhancedExportArgs } from './exportEnhancedClip';
//   const args = buildEnhancedExportArgs({ crop, audio, progressBar });
//   await ffmpeg.exec(args);
// ══════════════════════════════════════════════════════════════════

/**
 * Build FFmpeg arguments for enhanced clip export
 *
 * @param {Object} options
 * @param {number} options.startSec - Clip start time
 * @param {number} options.endSec - Clip end time
 * @param {Object} options.crop - { enabled, focusXPercent, mode, outputWidth, outputHeight }
 * @param {Object} options.audio - { normalizeLufs, voiceBoostDb, musicVolume }
 * @param {Object} options.progressBar - { enabled, color, style }
 * @returns {string[]} FFmpeg arguments array
 */
export function buildEnhancedExportArgs({
  startSec,
  endSec,
  crop = {},
  audio = {},
  progressBar = {},
  inputFile = 'input.mp4',
  outputFile = 'output.mp4',
}) {
  const duration = endSec - startSec;
  const filters = [];
  const audioFilters = [];

  // ── VIDEO FILTERS ─────────────────────────────────────────

  // 9:16 vertical crop
  if (crop.enabled !== false) {
    const outW = crop.outputWidth || 1080;
    const outH = crop.outputHeight || 1920;
    const focusX = crop.focusXPercent ?? 50;

    // Calculate crop from source
    // For 16:9 → 9:16: crop a vertical slice from the middle
    // crop=w:h:x:y where x is calculated from focusXPercent
    filters.push(
      `crop=ih*${outW}/${outH}:ih:(iw-ih*${outW}/${outH})*${focusX}/100:0`,
      `scale=${outW}:${outH}:flags=lanczos`
    );
  }

  // Progress bar (thin colored bar at top)
  if (progressBar.enabled) {
    const color = (progressBar.color || '#FF3B30').replace('#', '0x');
    // drawbox with time-based width expansion
    // Unfortunately drawbox can't animate, so we use a different approach:
    // We create a thin overlay that grows over time using the 'overlay' filter
    // For simplicity, we'll add it as a static bar at export — the animated
    // version runs live in the canvas preview
    filters.push(
      `drawbox=x=0:y=0:w=iw:h=4:color=0xFFFFFF@0.2:t=fill`,
    );
  }

  // ── AUDIO FILTERS ─────────────────────────────────────────

  // Voice clarity EQ boost (high-pass + presence boost)
  const boostDb = audio.voiceBoostDb ?? 3;
  if (boostDb > 0) {
    // Boost 2-4kHz range for voice clarity
    audioFilters.push(
      `highpass=f=80`,
      `equalizer=f=3000:t=q:w=1.5:g=${boostDb}`,
      `equalizer=f=150:t=q:w=1:g=${Math.round(boostDb * 0.5)}`,
    );
  }

  // Loudness normalization
  const lufs = audio.normalizeLufs ?? -14;
  audioFilters.push(
    `loudnorm=I=${lufs}:TP=-1:LRA=11`
  );

  // ── BUILD COMMAND ─────────────────────────────────────────
  const args = [
    '-ss', startSec.toFixed(3),
    '-i', inputFile,
    '-t', duration.toFixed(3),
  ];

  // Video filter chain
  if (filters.length > 0) {
    args.push('-vf', filters.join(','));
  }

  // Audio filter chain
  if (audioFilters.length > 0) {
    args.push('-af', audioFilters.join(','));
  }

  // Output settings
  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
    outputFile,
  );

  return args;
}

/**
 * Build a simple stream-copy clip (no re-encode, fastest)
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
 * Get the recommended output dimensions for a reframe mode
 */
export function getReframeDimensions(mode) {
  switch (mode) {
    case 'center_lock':
    case 'face_track':
    case 'rule_of_thirds_left':
    case 'rule_of_thirds_right':
      return { width: 1080, height: 1920, aspect: '9:16' };
    case 'split_screen_top':
      return { width: 1080, height: 1920, aspect: '9:16' };
    default:
      return { width: 1920, height: 1080, aspect: '16:9' };
  }
}

/**
 * Generate a safe filename for enhanced clip export
 */
export function enhancedClipFilename(clipTitle, index, format = 'mp4') {
  const safe = (clipTitle || `clip_${index + 1}`)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 35);
  return `${safe}_FYP.${format}`;
}
