import { initFFmpeg } from '@/lib/clipWithFFmpeg';

export async function renderClipAndVoice({ videoUrl, clip, assets, onProgress }) {
  const ffmpeg = await initFFmpeg(onProgress);
  const { fetchFile } = await import(/* @vite-ignore */ 'https://esm.sh/@ffmpeg/util@0.12.1');
  const duration = Math.max(1, clip.end - clip.start);
  onProgress?.({ message: 'Loading generated audio…', percent: 10 });
  const downloads = [fetchFile(videoUrl.split('#')[0]), fetchFile(assets.voice_url), fetchFile(assets.music_url), ...(assets.sfx || []).map(item => fetchFile(item.url))];
  const files = await Promise.all(downloads);
  await Promise.all(files.map((file, index) => ffmpeg.writeFile(index === 0 ? 'source.mp4' : index === 1 ? 'voice.mp3' : index === 2 ? 'music.mp3' : `sfx${index - 3}.mp3`, file)));

  const filters = [
    '[0:v]split=2[bg][fg]',
    '[bg]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,boxblur=20:10[blur]',
    '[fg]scale=720:1280:force_original_aspect_ratio=decrease[front]',
    '[blur][front]overlay=(W-w)/2:(H-h)/2,setsar=1[vout]',
    '[1:a]volume=1.15[voice]',
    '[2:a]volume=0.13,aloop=loop=-1:size=2147483647[music]'
  ];
  const audioLabels = ['[voice]', '[music]'];
  (assets.sfx || []).forEach((item, index) => {
    const delay = Math.max(0, Math.round((item.timestamp || 0) * 1000));
    filters.push(`[${index + 3}:a]volume=0.35,adelay=${delay}|${delay},apad[sfx${index}]`);
    audioLabels.push(`[sfx${index}]`);
  });
  filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,alimiter=limit=0.95[aout]`);

  onProgress?.({ message: 'Stitching video, voice, music and SFX…', percent: 30 });
  const args = ['-ss', clip.start.toFixed(3), '-i', 'source.mp4', '-i', 'voice.mp3', '-stream_loop', '-1', '-i', 'music.mp3'];
  (assets.sfx || []).forEach((_, index) => args.push('-i', `sfx${index}.mp3`));
  args.push('-t', duration.toFixed(3), '-filter_complex', filters.join(';'), '-map', '[vout]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-c:a', 'aac', '-b:a', '160k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'clip_and_voice.mp4');
  const code = await ffmpeg.exec(args);
  if (code !== 0) throw new Error(`FFmpeg exited with code ${code}`);
  const output = await ffmpeg.readFile('clip_and_voice.mp4');
  const blob = new Blob([output.buffer], { type: 'video/mp4' });
  for (const name of ['source.mp4', 'voice.mp3', 'music.mp3', 'clip_and_voice.mp4', ...(assets.sfx || []).map((_, index) => `sfx${index}.mp3`)]) await ffmpeg.deleteFile(name).catch(() => {});
  onProgress?.({ message: 'Clip and Voice ready', percent: 100 });
  return blob;
}