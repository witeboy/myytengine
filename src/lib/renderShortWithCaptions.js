// ══════════════════════════════════════════════════════════════════════
// RENDER SHORT — 9:16 vertical + Hormozi captions + silence trim + SFX
//
// Pipeline (single FFmpeg pass):
//   1. Fetch source video + SFX files into FFmpeg FS
//   2. Analyze clip for silence gaps + filler words (client-side, from words)
//   3. Compute keep-ranges, time-shifts, SFX placements
//   4. Build ASS subtitle file aligned to POST-TRIM timeline
//   5. FFmpeg single pass:
//       • Video: select keep-ranges → crop 9:16 → burn subtitles
//       • Audio: aselect keep-ranges → amix with SFX at their trimmed times
//   6. Output MP4 blob
//
// Depends on:
//   lib/clipWithFFmpeg     — FFmpeg loader
//   lib/viralCaptionStyler — ASS builder + keyword classifier
//   lib/silenceTrimmer     — silence/filler analyzer
//   lib/viralSFXLibrary    — SFX placement planner + fetcher
// ══════════════════════════════════════════════════════════════════════

import { initFFmpeg, isFFmpegSupported } from './clipWithFFmpeg';
import { buildViralAssFile, classifyWord } from './viralCaptionStyler';
import { analyzeClipForTrim, buildSelectExpr } from './silenceTrimmer';
import { planSfxPlacements, fetchAndWriteSfx } from './viralSFXLibrary';

// ══════════════════════════════════════════════════════════════════════
// MAIN: render a 9:16 Short
//
// @param {Object} opts
//   videoUrl        — source video URL
//   startSec/endSec — clip range in source
//   words           — word timestamps on SOURCE timeline
//   captionStyle    — 'hormozi_pro' | 'beast' | 'tiktok' | 'minimal' | 'none'
//   trimSilence     — bool, auto-remove silences + fillers (default true)
//   addSfx          — bool, infuse viral SFX (default true)
//   targetWidth     — output width (1080)
//   targetHeight    — output height (1920)
//   onProgress      — ({phase, message, percent}) callback
//
// @returns {blob, stats} — MP4 blob + trim/sfx stats
// ══════════════════════════════════════════════════════════════════════
export async function renderShortWithCaptions({
  videoUrl,
  startSec,
  endSec,
  words = [],
  captionStyle = 'hormozi_pro',
  trimSilence = true,
  addSfx = true,
  targetWidth = 1080,
  targetHeight = 1920,
  onProgress,
}) {
  if (!isFFmpegSupported()) {
    throw new Error('Shorts rendering requires SharedArrayBuffer. Use Chrome/Edge latest.');
  }

  const ffmpeg = await initFFmpeg(onProgress);
  if (!ffmpeg) throw new Error('FFmpeg failed to load');

  const { fetchFile } = await import(
    /* webpackIgnore: true */
    'https://esm.sh/@ffmpeg/util@0.12.1'
  );

  const originalDuration = endSec - startSec;
  if (originalDuration <= 0) throw new Error('Invalid clip range');

  // ── STEP 1: Analyze for silence/filler trim ─────────────────────
  onProgress?.({ phase: 'analyzing', message: 'Analyzing silences & fillers…', percent: 3 });
  const trim = trimSilence
    ? analyzeClipForTrim({ words, clipStart: startSec, clipEnd: endSec })
    : {
        keepRanges: [{ start: startSec, end: endSec }],
        removeRanges: [],
        timeShifts: [],
        stats: { originalDur: originalDuration, trimmedDur: originalDuration, removedDur: 0, removedPercent: 0, cutCount: 0, fillersRemoved: 0, silencesRemoved: 0 },
      };

  // ── STEP 2: Fetch source video ──────────────────────────────────
  onProgress?.({ phase: 'downloading', message: 'Fetching source video…', percent: 8 });
  const videoData = await fetchFile(videoUrl);
  await ffmpeg.writeFile('input.mp4', videoData);

  // ── STEP 3: Plan + fetch SFX ────────────────────────────────────
  let sfxFiles = [];
  if (addSfx) {
    onProgress?.({ phase: 'sfx', message: 'Planning viral sound effects…', percent: 15 });
    const placements = planSfxPlacements({
      words,
      clipStart: startSec,
      clipEnd: endSec,
      removeRanges: trim.removeRanges,
      classifyFn: classifyWord,
      maxPlacements: 4,
    });
    onProgress?.({ phase: 'sfx', message: `Loading ${placements.length} SFX files…`, percent: 20 });
    sfxFiles = await fetchAndWriteSfx(ffmpeg, fetchFile, placements);
  }

  // ── STEP 4: Build caption .ass file ─────────────────────────────
  const wantsCaptions = captionStyle !== 'none' && words.length > 0;
  if (wantsCaptions) {
    const trimmedDuration = trim.stats.trimmedDur;
    const assContent = buildViralAssFile({
      words,
      clipStart: startSec,
      clipDuration: trimmedDuration,
      style: captionStyle,
      videoWidth: targetWidth,
      videoHeight: targetHeight,
      timeShifts: trim.timeShifts,
    });
    await ffmpeg.writeFile('subs.ass', new TextEncoder().encode(assContent));
  }

  // ── STEP 5: Build FFmpeg command ────────────────────────────────
  const cmd = [];

  // Inputs — first is source, then SFX tracks
  cmd.push('-ss', startSec.toFixed(3));
  cmd.push('-i', 'input.mp4');
  cmd.push('-t', originalDuration.toFixed(3));

  for (const sfx of sfxFiles) {
    // Each SFX is delayed to its trimmed time via adelay in filter_complex below
    cmd.push('-i', sfx.filename);
  }

  // ── Filter graph construction ───────────────────────────────────
  // Video chain:
  //   [0:v] → [maybe select keep-ranges] → crop 9:16 → [maybe subtitles]
  //
  // Audio chain:
  //   [0:a] → [maybe aselect keep-ranges] → [mix with SFX]
  //
  // We use -filter_complex to support both chains + SFX mixing.

  const filters = [];

  // -- VIDEO --
  let vLabel = '[0:v]';
  if (trimSilence && trim.removeRanges.length > 0) {
    // Build select expression (clip-relative times, since we used -ss to seek)
    const selExpr = buildSelectExpr(trim.keepRanges, startSec);
    filters.push(`${vLabel}select='${selExpr}',setpts=N/FRAME_RATE/TB[vt]`);
    vLabel = '[vt]';
  }
  // 9:16 crop/scale — use force_original_aspect_ratio=increase for safety
  const cropChain =
    `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,` +
    `crop=${targetWidth}:${targetHeight},setsar=1`;
  if (wantsCaptions) {
    filters.push(`${vLabel}${cropChain},ass=subs.ass[vout]`);
  } else {
    filters.push(`${vLabel}${cropChain}[vout]`);
  }

  // -- AUDIO --
  let aLabel = '[0:a]';
  if (trimSilence && trim.removeRanges.length > 0) {
    const selExpr = buildSelectExpr(trim.keepRanges, startSec);
    filters.push(`${aLabel}aselect='${selExpr}',asetpts=N/SR/TB[at]`);
    aLabel = '[at]';
  }

  if (sfxFiles.length > 0) {
    // Delay each SFX input to its trimmed time, apply volume, then amix.
    // SFX input indices start at 1 (0 is the source).
    const sfxLabels = [];
    sfxFiles.forEach((sfx, i) => {
      const inputIdx = i + 1;
      const delayMs = Math.round(sfx.timeInTrimmed * 1000);
      // adelay applies to ALL channels: `adelay=X|X` for stereo
      filters.push(
        `[${inputIdx}:a]volume=${sfx.volume.toFixed(2)},adelay=${delayMs}|${delayMs},apad[sfx${i}]`
      );
      sfxLabels.push(`[sfx${i}]`);
    });
    // Mix voice + all SFX. Duck voice slightly to keep SFX punchy.
    // amix with duration=first caps to the voice track length.
    const mixInputs = [aLabel, ...sfxLabels].join('');
    filters.push(
      `${mixInputs}amix=inputs=${1 + sfxLabels.length}:duration=first:dropout_transition=0:normalize=0[aout]`
    );
  } else {
    // No SFX — just label the (possibly-trimmed) audio as final
    filters.push(`${aLabel}acopy[aout]`);
  }

  cmd.push('-filter_complex', filters.join(';'));
  cmd.push('-map', '[vout]');
  cmd.push('-map', '[aout]');
  cmd.push('-c:v', 'libx264');
  cmd.push('-preset', 'ultrafast');
  cmd.push('-crf', '23');
  cmd.push('-c:a', 'aac');
  cmd.push('-b:a', '160k');
  cmd.push('-pix_fmt', 'yuv420p');
  cmd.push('-movflags', '+faststart');
  cmd.push('output.mp4');

  onProgress?.({
    phase: 'rendering',
    message: `Rendering 9:16 Short${trim.removeRanges.length ? ` (${trim.stats.cutCount} cuts)` : ''}${sfxFiles.length ? ` + ${sfxFiles.length} SFX` : ''}…`,
    percent: 25,
  });

  await ffmpeg.exec(cmd);

  const outputData = await ffmpeg.readFile('output.mp4');
  const blob = new Blob([outputData.buffer], { type: 'video/mp4' });

  // Cleanup
  try { await ffmpeg.deleteFile('input.mp4'); } catch (_) {}
  try { await ffmpeg.deleteFile('output.mp4'); } catch (_) {}
  if (wantsCaptions) { try { await ffmpeg.deleteFile('subs.ass'); } catch (_) {} }
  for (const sfx of sfxFiles) {
    try { await ffmpeg.deleteFile(sfx.filename); } catch (_) {}
  }

  onProgress?.({
    phase: 'done',
    message: `Short ready (${(blob.size / 1048576).toFixed(1)}MB, ${trim.stats.trimmedDur.toFixed(1)}s)`,
    percent: 100,
  });

  return {
    blob,
    stats: {
      ...trim.stats,
      sfxCount: sfxFiles.length,
    },
  };
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