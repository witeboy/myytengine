// ══════════════════════════════════════════════════════════════════
// CONCAT TIMELAPSE — Stitches Flow/Re-make transition videos into
// one final MP4 using ffmpeg.wasm (already loaded by ClipExtractor).
//
// Input: array of video URLs (ordered)
// Output: single MP4 Blob
// ══════════════════════════════════════════════════════════════════

import { initFFmpeg, isFFmpegSupported } from './clipWithFFmpeg';

/**
 * Concat multiple MP4 videos into one using ffmpeg concat demuxer.
 * @param {string[]} videoUrls - ordered list of MP4 URLs
 * @param {function} onProgress - ({ phase, message, percent }) callback
 * @returns {Blob} single MP4 blob
 */
export async function concatTimelapseVideos(videoUrls, onProgress) {
  if (!isFFmpegSupported()) {
    throw new Error('FFmpeg not supported in this browser (SharedArrayBuffer unavailable). Try Chrome/Edge.');
  }

  const ffmpeg = await initFFmpeg(onProgress);
  if (!ffmpeg) throw new Error('FFmpeg failed to load');

  const { fetchFile } = await import(
    /* webpackIgnore: true */
    'https://esm.sh/@ffmpeg/util@0.12.1'
  );

  onProgress?.({ phase: 'downloading', message: `Downloading ${videoUrls.length} clips…`, percent: 0 });

  // Download all clips and write to ffmpeg virtual FS
  const inputFiles = [];
  for (let i = 0; i < videoUrls.length; i++) {
    const url = videoUrls[i];
    onProgress?.({
      phase: 'downloading',
      message: `Downloading clip ${i + 1}/${videoUrls.length}…`,
      percent: Math.round(((i + 1) / videoUrls.length) * 40),
    });
    const data = await fetchFile(url);
    const name = `clip${i}.mp4`;
    await ffmpeg.writeFile(name, data);
    inputFiles.push(name);
  }

  // Re-encode each clip to a common format first — Kling outputs vary,
  // concat demuxer requires identical codecs/timebase, so we normalize.
  onProgress?.({ phase: 'normalizing', message: 'Normalizing clips for seamless stitching…', percent: 45 });

  const normalizedFiles = [];
  for (let i = 0; i < inputFiles.length; i++) {
    const out = `norm${i}.ts`;
    // MPEG-TS is the cleanest intermediate for concat
    await ffmpeg.exec([
      '-i', inputFiles[i],
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-r', '30',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-bsf:v', 'h264_mp4toannexb',
      '-f', 'mpegts',
      out,
    ]);
    normalizedFiles.push(out);
    onProgress?.({
      phase: 'normalizing',
      message: `Normalized ${i + 1}/${inputFiles.length}`,
      percent: 45 + Math.round(((i + 1) / inputFiles.length) * 35),
    });
  }

  // Concat via pipe
  onProgress?.({ phase: 'concat', message: 'Stitching into final time-lapse…', percent: 85 });

  const concatInput = `concat:${normalizedFiles.join('|')}`;
  await ffmpeg.exec([
    '-i', concatInput,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', '+faststart',
    'final.mp4',
  ]);

  onProgress?.({ phase: 'reading', message: 'Preparing download…', percent: 95 });

  const outputData = await ffmpeg.readFile('final.mp4');
  const blob = new Blob([outputData.buffer], { type: 'video/mp4' });

  // Cleanup
  for (const f of inputFiles) { try { await ffmpeg.deleteFile(f); } catch (_) {} }
  for (const f of normalizedFiles) { try { await ffmpeg.deleteFile(f); } catch (_) {} }
  try { await ffmpeg.deleteFile('final.mp4'); } catch (_) {}

  onProgress?.({
    phase: 'done',
    message: `Final time-lapse ready (${(blob.size / 1048576).toFixed(1)} MB)`,
    percent: 100,
  });

  return blob;
}