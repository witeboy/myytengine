import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import { S3Client, PutObjectCommand } from 'npm:@aws-sdk/client-s3@3.600.0';

// ══════════════════════════════════════════════════════════════════
// EXPORT VIDEO FFMPEG — Server-side full video composition
//
// Accepts the complete timeline scene list from the Timeline Editor
// and composes a full MP4 on the server using native ffmpeg.
//
// Handles everything the WebCodecs browser export handles:
//   ✓ Multiple scenes (image or video clips)
//   ✓ Ken Burns / cinematic zoom (zoompan filter)
//   ✓ Video playback rate adjustment (setpts)
//   ✓ Scene transitions (xfade filter)
//   ✓ Voiceover audio track
//   ✓ Background music with per-clip volume + trim
//   ✓ Caption / subtitle burning (ASS format)
//   ✓ Resolution: 480p / 720p / 1080p / 4K
//   ✓ Orientation: landscape or portrait
//   ✓ FPS: 24 or 30
//   ✓ Output uploaded to Cloudflare R2 → permanent download URL
//
// Called from VideoExporter.jsx "Export MP4 — FFmpeg Server" button.
//
// Env vars required (same as other R2 functions):
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_R2_ACCESS_KEY_ID
//   CLOUDFLARE_R2_SECRET_ACCESS_KEY
//   CLOUDFLARE_R2_BUCKET_NAME
//   CLOUDFLARE_R2_PUBLIC_URL
// ══════════════════════════════════════════════════════════════════

// ── Ken Burns motion presets → ffmpeg zoompan expression ─────────
const MOTION_ZOOMPAN = {
  zoom_in_center:  (fps, dur) => `zoompan=z='min(zoom+0.0015,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(fps * dur)}:s=iw×ih:fps=${fps}`,
  zoom_out_center: (fps, dur) => `zoompan=z='if(eq(on\\,1)\\,1.10\\,max(zoom-0.0015\\,1.0))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${Math.round(fps * dur)}:s=iw×ih:fps=${fps}`,
  pan_right_zoom:  (fps, dur) => `zoompan=z='min(zoom+0.0010\\,1.08)':x='if(eq(on\\,1)\\,0\\,x+1)':y='ih/2-(ih/zoom/2)':d=${Math.round(fps * dur)}:s=iw×ih:fps=${fps}`,
  pan_left_zoom:   (fps, dur) => `zoompan=z='min(zoom+0.0010\\,1.08)':x='if(eq(on\\,1)\\,iw\\,max(x-1\\,0))':y='ih/2-(ih/zoom/2)':d=${Math.round(fps * dur)}:s=iw×ih:fps=${fps}`,
  push_in_top:     (fps, dur) => `zoompan=z='min(zoom+0.0010\\,1.08)':x='iw/2-(iw/zoom/2)':y='if(eq(on\\,1)\\,0\\,min(y+0.5\\,ih/2-(ih/zoom/2)))':d=${Math.round(fps * dur)}:s=iw×ih:fps=${fps}`,
  push_in_bottom:  (fps, dur) => `zoompan=z='min(zoom+0.0010\\,1.08)':x='iw/2-(iw/zoom/2)':y='if(eq(on\\,1)\\,ih\\,max(y-0.5\\,ih/2-(ih/zoom/2)))':d=${Math.round(fps * dur)}:s=iw×ih:fps=${fps}`,
  diagonal_tl_br:  (fps, dur) => `zoompan=z='min(zoom+0.0010\\,1.08)':x='if(eq(on\\,1)\\,0\\,x+0.8)':y='if(eq(on\\,1)\\,0\\,y+0.5)':d=${Math.round(fps * dur)}:s=iw×ih:fps=${fps}`,
  diagonal_tr_bl:  (fps, dur) => `zoompan=z='min(zoom+0.0010\\,1.08)':x='if(eq(on\\,1)\\,iw\\,max(x-0.8\\,0))':y='if(eq(on\\,1)\\,0\\,y+0.5)':d=${Math.round(fps * dur)}:s=iw×ih:fps=${fps}`,
};

// ── xfade transition names ────────────────────────────────────────
const XFADE_MAP = {
  'Black Fade':   'fade',
  'Gradual Fade': 'dissolve',
  'Expand Fade':  'zoomin',
  'Overlap Fade': 'wipeleft',
};

// ── Build ASS subtitle file content from captions array ──────────
function buildASSSubtitles(captions, W, H) {
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const toASSTime = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.round((sec % 1) * 100);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  };

  for (const cap of (captions || [])) {
    if (!cap.text?.trim()) continue;
    const start = toASSTime(cap.startTime || 0);
    const end   = toASSTime((cap.startTime || 0) + (cap.duration || 1));
    // Escape special ASS chars
    const text = cap.text.replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
    lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
  }

  return lines.join('\n');
}

// ── Download a URL to a temp file, return the path ───────────────
async function downloadToTemp(url, ext) {
  const tmpPath = `/tmp/ffmpeg_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Failed to download ${url.substring(0,80)}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  await Deno.writeFile(tmpPath, buf);
  return tmpPath;
}

// ── Safely delete a temp file ────────────────────────────────────
async function cleanupFile(path) {
  try { await Deno.remove(path); } catch {}
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const tmpFiles = []; // track all temp files for cleanup

  try {
    // ── Auth ──────────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── Parse body ────────────────────────────────────────────────
    const body = await req.json();
    const {
      scenes       = [],
      captions     = [],
      voiceover_url,
      music_url,
      music_clips  = [],
      music_volume = 0.3,
      quality      = '1080p',
      width        = 1920,
      height       = 1080,
      fps          = 30,
      orientation  = 'landscape',
      aspect_ratio = '16:9',
      project_id   = 'timeline',
      project_name = 'Untitled',
    } = body;

    if (!scenes || scenes.length === 0) {
      return Response.json({ error: 'scenes array is required and must not be empty' }, { status: 400 });
    }

    console.log(`[exportVideoFFmpeg] User: ${user.email} | ${scenes.length} scenes | ${quality} | ${orientation} | ${Math.round(scenes.reduce((s, c) => s + (c.duration || 8), 0))}s total`);

    // ── R2 client ─────────────────────────────────────────────────
    const accountId  = (Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim();
    const accessKey  = (Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID') || '').trim();
    const secretKey  = (Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '').trim();
    const bucket     = (Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '').trim();
    const publicBase = (Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL') || '').trim().replace(/\/$/, '');

    if (!accountId || !accessKey || !secretKey || !bucket || !publicBase) {
      return Response.json({ error: 'R2 environment variables not configured' }, { status: 500 });
    }

    const r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    // ── Step 1: Download all scene media to temp files ────────────
    console.log('[exportVideoFFmpeg] Downloading scene media...');
    const sceneFiles = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const wantsVideo = scene.mediaType === 'video' && scene.videoUrl?.startsWith('http');
      const url    = wantsVideo ? scene.videoUrl : scene.imageUrl;
      const ext    = wantsVideo ? 'mp4' : 'jpg';

      if (!url) {
        sceneFiles.push({ path: null, isVideo: false, duration: scene.duration || 8 });
        console.warn(`[exportVideoFFmpeg] Scene ${i}: no media URL, will use black frame`);
        continue;
      }

      try {
        const path = await downloadToTemp(url, ext);
        tmpFiles.push(path);
        sceneFiles.push({ path, isVideo: wantsVideo, duration: scene.duration || 8, scene });
        console.log(`[exportVideoFFmpeg] Scene ${i} downloaded (${ext}): ${(await Deno.stat(path)).size / 1024 | 0}KB`);
      } catch (e) {
        console.warn(`[exportVideoFFmpeg] Scene ${i} download failed: ${e.message} — using black frame`);
        sceneFiles.push({ path: null, isVideo: false, duration: scene.duration || 8 });
      }
    }

    // ── Step 2: Download audio files ──────────────────────────────
    let voiceoverPath = null;
    let musicPath     = null;

    if (voiceover_url) {
      try {
        voiceoverPath = await downloadToTemp(voiceover_url, 'mp3');
        tmpFiles.push(voiceoverPath);
        console.log('[exportVideoFFmpeg] Voiceover downloaded');
      } catch (e) {
        console.warn('[exportVideoFFmpeg] Voiceover download failed:', e.message);
      }
    }

    if (music_url) {
      try {
        musicPath = await downloadToTemp(music_url, 'mp3');
        tmpFiles.push(musicPath);
        console.log('[exportVideoFFmpeg] Music downloaded');
      } catch (e) {
        console.warn('[exportVideoFFmpeg] Music download failed:', e.message);
      }
    }

    // ── Step 3: Write ASS subtitle file ──────────────────────────
    let assPath = null;
    if (captions && captions.length > 0) {
      assPath = `/tmp/subs_${Date.now()}.ass`;
      tmpFiles.push(assPath);
      await Deno.writeTextFile(assPath, buildASSSubtitles(captions, width, height));
      console.log(`[exportVideoFFmpeg] ASS subtitles written (${captions.length} captions)`);
    }

    // ── Step 4: Build FFmpeg filter graph ─────────────────────────
    //
    // Strategy:
    //   1. For each scene: scale to output size, apply zoompan if needed
    //   2. Chain scenes together with xfade transitions
    //   3. Build audio mix: voiceover + music clips
    //   4. Burn ASS subtitles on final video
    //   5. Encode to H.264 + AAC MP4

    const inputArgs = [];
    const filterParts = [];
    let inputIndex = 0;

    // ── Build per-scene video filters ────────────────────────────
    const sceneLabels = []; // final label after each scene's filter chain

    for (let i = 0; i < sceneFiles.length; i++) {
      const { path, isVideo, duration, scene } = sceneFiles[i];
      const sceneDur = duration || 8;
      const motion   = scene?.cinematicMotion || null;
      const rate     = scene?.playbackRate    ?? 1.0;

      if (!path) {
        // Black frame fallback — use lavfi color source
        inputArgs.push('-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:d=${sceneDur.toFixed(3)}:r=${fps}`);
      } else if (isVideo) {
        // Video clip: adjust playback rate if needed
        if (rate !== 1.0) {
          inputArgs.push('-itsscale', (1.0 / rate).toFixed(4), '-i', path);
        } else {
          inputArgs.push('-i', path);
        }
      } else {
        // Image: loop for the scene duration
        inputArgs.push('-loop', '1', '-framerate', String(fps), '-t', sceneDur.toFixed(3), '-i', path);
      }

      const inLabel  = `[${inputIndex}:v]`;
      inputIndex++;
      const outLabel = `[sv${i}]`;

      // Scale to output size, pad to exact dimensions, set fps and duration
      let vf = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},trim=duration=${sceneDur.toFixed(3)},setpts=PTS-STARTPTS`;

      // Apply Ken Burns zoompan motion
      if (motion && MOTION_ZOOMPAN[motion]) {
        // Replace iw×ih placeholder (used to avoid shell escaping) with actual dimensions
        const zoompanExpr = MOTION_ZOOMPAN[motion](fps, sceneDur)
          .replace(/iw×ih/g, `${width}x${height}`)
          .replace(/iw/g, String(width))
          .replace(/ih/g, String(height));
        vf += `,${zoompanExpr}`;
      }

      filterParts.push(`${inLabel}${vf}${outLabel}`);
      sceneLabels.push(outLabel);
    }

    // ── Chain scenes with xfade transitions ───────────────────────
    let videoChain = sceneLabels[0]; // current video label flowing through chain

    if (sceneLabels.length > 1) {
      let timeOffset = 0;

      for (let i = 0; i < sceneFiles.length - 1; i++) {
        const scene      = scenes[i] || {};
        const nextScene  = scenes[i + 1] || {};
        const curDur     = sceneFiles[i].duration || 8;
        const transition = scene.transition || null;
        const transDur   = scene.transitionDuration ?? 0.6;
        const xfadeName  = XFADE_MAP[transition] || null;

        timeOffset += curDur;

        const inA    = videoChain;
        const inB    = sceneLabels[i + 1];
        const outLbl = `[xf${i}]`;

        if (xfadeName) {
          // xfade starts (transDur) seconds before the scene end
          const offset = Math.max(0, timeOffset - transDur);
          filterParts.push(`${inA}${inB}xfade=transition=${xfadeName}:duration=${transDur.toFixed(3)}:offset=${offset.toFixed(3)}${outLbl}`);
          timeOffset -= transDur; // xfade overlaps, so total duration shrinks
        } else {
          // No transition — just concat
          filterParts.push(`${inA}${inB}concat=n=2:v=1:a=0${outLbl}`);
        }

        videoChain = outLbl;
      }
    }

    // ── Burn ASS subtitles ────────────────────────────────────────
    const finalVideoLabel = '[finalv]';
    if (assPath) {
      // Escape path for ffmpeg filter string
      const safePath = assPath.replace(/'/g, "\\'").replace(/:/g, '\\:');
      filterParts.push(`${videoChain}ass='${safePath}'${finalVideoLabel}`);
      videoChain = finalVideoLabel;
    }

    // ── Audio filter graph ────────────────────────────────────────
    //
    // Inputs so far used inputIndex for video. Audio inputs follow.
    let hasAudio = false;
    const audioMixParts  = [];
    const audioMixLabels = [];

    // Voiceover — full timeline, no loop
    if (voiceoverPath) {
      inputArgs.push('-i', voiceoverPath);
      audioMixLabels.push(`[${inputIndex}:a]`);
      inputIndex++;
      hasAudio = true;
    }

    // Music — respect music_clips positions if provided, else loop full timeline
    if (musicPath) {
      inputArgs.push('-i', musicPath);
      const musicIdx = inputIndex++;
      hasAudio = true;

      if (music_clips && music_clips.length > 0) {
        // Use atrim+adelay per clip to place them at their exact positions
        for (let mi = 0; mi < music_clips.length; mi++) {
          const mc     = music_clips[mi];
          const vol    = mc.volume ?? music_volume;
          const srcOff = mc.sourceOffset || 0;
          const delay  = Math.round((mc.startTime || 0) * 1000); // ms
          const mLabel = `[music${mi}]`;
          audioMixParts.push(
            `[${musicIdx}:a]atrim=start=${srcOff.toFixed(3)}:duration=${(mc.duration || 10).toFixed(3)},volume=${vol.toFixed(3)},adelay=${delay}|${delay}${mLabel}`
          );
          audioMixLabels.push(mLabel);
        }
      } else {
        // Simple: loop full timeline at music_volume
        const totalDur = scenes.reduce((s, c) => s + (c.duration || 8), 0);
        audioMixParts.push(
          `[${musicIdx}:a]aloop=loop=-1:size=2e+09,atrim=duration=${totalDur.toFixed(3)},volume=${music_volume.toFixed(3)}[musicloop]`
        );
        audioMixLabels.push('[musicloop]');
      }
    }

    // Push music filter parts into main filter list
    filterParts.push(...audioMixParts);

    // Mix all audio streams if more than one
    let finalAudioLabel = audioMixLabels[0] || null;
    if (audioMixLabels.length > 1) {
      finalAudioLabel = '[amix]';
      filterParts.push(`${audioMixLabels.join('')}amix=inputs=${audioMixLabels.length}:duration=longest:normalize=0${finalAudioLabel}`);
    }

    // ── Step 5: Assemble final ffmpeg command ─────────────────────
    const outputPath = `/tmp/export_${Date.now()}.mp4`;
    tmpFiles.push(outputPath);

    const ffmpegArgs = [
      '-y',            // overwrite output
      ...inputArgs,    // all -i inputs
    ];

    // Attach filter graph if we have anything
    const filterGraph = filterParts.join(';');
    if (filterGraph) {
      ffmpegArgs.push('-filter_complex', filterGraph);
    }

    // Map final video and audio
    if (filterGraph && (videoChain !== sceneLabels[0] || assPath)) {
      ffmpegArgs.push('-map', videoChain.replace(/[\[\]]/g, match => match)); // already labelled
    } else if (sceneLabels.length === 1 && !assPath) {
      ffmpegArgs.push('-map', '0:v');
    } else {
      ffmpegArgs.push('-map', videoChain);
    }

    if (hasAudio && finalAudioLabel) {
      ffmpegArgs.push('-map', finalAudioLabel);
    }

    // Video codec — H.264 fast preset
    ffmpegArgs.push(
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-r', String(fps),
      '-pix_fmt', 'yuv420p',
    );

    // Audio codec
    if (hasAudio) {
      ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100');
    }

    ffmpegArgs.push(
      '-movflags', '+faststart',
      '-f', 'mp4',
      outputPath,
    );

    console.log('[exportVideoFFmpeg] Running ffmpeg...');
    console.log('[exportVideoFFmpeg] Filter graph:', filterGraph.substring(0, 500));

    const cmd    = new Deno.Command('ffmpeg', { args: ffmpegArgs, stdout: 'piped', stderr: 'piped' });
    const proc   = cmd.spawn();

    // Collect stderr for error reporting
    const stderrLines = [];
    const stderrDec   = new TextDecoder();
    const stderrReader = proc.stderr.getReader();
    const collectStderr = async () => {
      while (true) {
        const { done, value } = await stderrReader.read();
        if (done) break;
        const line = stderrDec.decode(value);
        stderrLines.push(line);
        if (line.includes('time=') || line.includes('Error') || line.includes('error')) {
          console.log('[ffmpeg]', line.trim().substring(0, 200));
        }
      }
    };
    collectStderr();

    // Drain stdout (we don't use pipe output here — output goes to file)
    const stdoutReader = proc.stdout.getReader();
    while (true) {
      const { done } = await stdoutReader.read();
      if (done) break;
    }

    const status = await proc.status;

    if (!status.success) {
      const stderrText = stderrLines.join('').substring(0, 1000);
      console.error('[exportVideoFFmpeg] ffmpeg failed. Exit:', status.code);
      console.error('[exportVideoFFmpeg] stderr:', stderrText);
      return Response.json({
        error: 'ffmpeg composition failed',
        detail: stderrText,
        exit_code: status.code,
      }, { status: 500 });
    }

    // ── Step 6: Read output and upload to R2 ─────────────────────
    const outputBytes = await Deno.readFile(outputPath);
    const sizeBytes   = outputBytes.length;
    console.log(`[exportVideoFFmpeg] ffmpeg done. Output: ${(sizeBytes / 1024 / 1024).toFixed(1)}MB`);

    const safeEmail   = (user.email || 'unknown').replace(/[^a-zA-Z0-9@._-]/g, '_');
    const safeProjId  = (project_id || 'timeline').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
    const safeName    = (project_name || 'Untitled').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').substring(0, 35);
    const fileName    = `${Date.now()}_${safeName}_${quality}.mp4`;
    const r2Key       = `exports/${safeEmail}/${safeProjId}/${fileName}`;

    console.log(`[exportVideoFFmpeg] Uploading to R2: ${r2Key}`);
    await r2.send(new PutObjectCommand({
      Bucket:             bucket,
      Key:                r2Key,
      Body:               outputBytes,
      ContentType:        'video/mp4',
      ContentDisposition: `attachment; filename="${safeName}_${quality}.mp4"`,
      Metadata: {
        user_email:   user.email || '',
        project_id:   project_id || '',
        quality,
        fps:          String(fps),
        orientation,
        scenes_count: String(scenes.length),
      },
    }));

    const downloadUrl = `${publicBase}/${r2Key}`;
    console.log(`[exportVideoFFmpeg] Done! URL: ${downloadUrl}`);

    return Response.json({
      success:      true,
      download_url: downloadUrl,
      r2_key:       r2Key,
      size_bytes:   sizeBytes,
      size_mb:      (sizeBytes / 1024 / 1024).toFixed(1),
      filename:     fileName,
      scenes_count: scenes.length,
      quality,
      fps,
      orientation,
    });

  } catch (error) {
    console.error('[exportVideoFFmpeg] Unhandled error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  } finally {
    // ── Always clean up temp files ────────────────────────────────
    for (const f of tmpFiles) {
      await cleanupFile(f);
    }
  }
});
