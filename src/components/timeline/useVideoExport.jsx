import { useState, useRef, useCallback } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const QUALITY_PRESETS = {
  '1080p': { width: 1920, height: 1080, bitrate: 5_000_000 },
  '720p': { width: 1280, height: 720, bitrate: 3_000_000 },
  '480p': { width: 854, height: 480, bitrate: 1_500_000 },
};

const PORTRAIT_PRESETS = {
  '1080p': { width: 1080, height: 1920, bitrate: 5_000_000 },
  '720p': { width: 720, height: 1280, bitrate: 3_000_000 },
  '480p': { width: 480, height: 854, bitrate: 1_500_000 },
};

export default function useVideoExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState(''); // 'checking', 'loading', 'encoding', 'audio', 'finalizing'
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);
  const videoEncoderRef = useRef(null);
  const audioEncoderRef = useRef(null);

  const checkSupport = useCallback(async (quality, orientation) => {
    if (!('VideoEncoder' in window)) {
      return { supported: false, warning: false, reason: 'Your browser does not support WebCodecs. Please use Chrome 94+ or Edge 94+.' };
    }
    const presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
    const preset = presets[quality];

    // Try multiple AVC profiles from most to least common
    const profiles = ['avc1.42001e', 'avc1.4d001e', 'avc1.640028', 'avc1.42001f'];
    let bestCodec = null;
    for (const codec of profiles) {
      try {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width: preset.width,
          height: preset.height,
          bitrate: preset.bitrate,
        });
        if (support.supported) {
          bestCodec = codec;
          break;
        }
      } catch {}
    }

    if (!bestCodec) {
      // Return warning but still allow proceeding
      return { supported: true, warning: true, reason: `${quality} H.264 encoding may not be fully supported by your browser/hardware. Export might fail — try a lower quality if it does.`, codec: profiles[0] };
    }
    return { supported: true, warning: false, codec: bestCodec };
  }, []);

  const loadImage = (url) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  };

  const loadVideo = (url) => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onloadeddata = () => resolve(video);
      video.onerror = () => reject(new Error(`Failed to load video: ${url}`));
      video.src = url;
    });
  };

  const drawSceneFrame = (ctx, canvas, media, mediaType, timeInScene, sceneDuration) => {
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    if (!media) return;

    let sw, sh;
    if (mediaType === 'video') {
      sw = media.videoWidth;
      sh = media.videoHeight;
    } else {
      sw = media.naturalWidth || media.width;
      sh = media.naturalHeight || media.height;
    }

    // Fit media into canvas maintaining aspect ratio
    const scale = Math.min(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.drawImage(media, dx, dy, dw, dh);
  };

  const decodeAudio = async (url) => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 48000 });
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();
    return audioBuffer;
  };

  const exportVideo = useCallback(async (scenes, { quality = '720p', orientation = 'landscape', fps = 30, voiceoverUrl, musicUrl, musicVolume = 0.3, codec: overrideCodec }) => {
    cancelledRef.current = false;
    setExporting(true);
    setProgress(0);
    setPhase('checking');
    setError(null);

    const presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
    const preset = presets[quality];
    const WIDTH = preset.width;
    const HEIGHT = preset.height;
    const BITRATE = preset.bitrate;
    const FPS = fps;

    // Calculate total frames
    const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_seconds || 8), 0);
    const totalFrames = Math.ceil(totalDuration * FPS);

    // Set up muxer config
    const muxerConfig = {
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: WIDTH,
        height: HEIGHT,
      },
      fastStart: 'in-memory',
    };

    // Check if we have audio
    const hasAudio = !!(voiceoverUrl || musicUrl);
    if (hasAudio) {
      muxerConfig.audio = {
        codec: 'aac',
        sampleRate: 48000,
        numberOfChannels: 2,
      };
    }

    const muxer = new Muxer(muxerConfig);

    // Video encoder
    const videoCodec = overrideCodec || 'avc1.42001e';
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { setError(`Video encoding error: ${e.message}`); },
    });
    videoEncoderRef.current = videoEncoder;

    videoEncoder.configure({
      codec: videoCodec,
      width: WIDTH,
      height: HEIGHT,
      bitrate: BITRATE,
      framerate: FPS,
    });

    // Audio encoder (if needed)
    let audioEncoder = null;
    if (hasAudio) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => { console.error('Audio encoding error:', e); },
      });
      audioEncoderRef.current = audioEncoder;
      audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 128_000,
      });
    }

    // Create offscreen canvas
    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Preload all scene media
    setPhase('loading');
    const sceneMedia = [];
    for (let i = 0; i < scenes.length; i++) {
      if (cancelledRef.current) { setExporting(false); return null; }
      setProgress(Math.round((i / scenes.length) * 20));
      const scene = scenes[i];
      let media = null;
      let mediaType = 'image';
      const vidUrl = scene.video_url || '';
      const imgUrl = scene.image_url || '';
      const hasVid = vidUrl && !vidUrl.startsWith('{') && !vidUrl.startsWith('freepik_task:') && !vidUrl.startsWith('runway_task:') && vidUrl.startsWith('http');
      const hasImg = imgUrl && imgUrl.startsWith('http');

      if (hasVid) {
        try {
          media = await loadVideo(vidUrl);
          mediaType = 'video';
        } catch (e) {
          console.warn(`Failed to load video for scene ${scene.scene_number}:`, e);
          if (hasImg) {
            try { media = await loadImage(imgUrl); } catch { /* no media */ }
          }
          mediaType = 'image';
        }
      } else if (hasImg) {
        try { media = await loadImage(imgUrl); } catch (e) {
          console.warn(`Failed to load image for scene ${scene.scene_number}:`, e);
        }
      }
      sceneMedia.push({ media, mediaType });
    }

    // Encode video frames
    setPhase('encoding');
    let globalFrame = 0;
    for (let si = 0; si < scenes.length; si++) {
      if (cancelledRef.current) break;
      const scene = scenes[si];
      const dur = scene.duration_seconds || 8;
      const sceneFrames = Math.ceil(dur * FPS);
      const { media, mediaType } = sceneMedia[si];

      // If video media, seek and capture frames
      if (media && mediaType === 'video') {
        media.currentTime = 0;
        await new Promise(r => { media.onseeked = r; media.currentTime = 0; });
      }

      for (let f = 0; f < sceneFrames; f++) {
        if (cancelledRef.current) break;

        const timeInScene = f / FPS;

        if (media && mediaType === 'video') {
          // Seek video to correct time
          const targetTime = Math.min(timeInScene, media.duration - 0.01);
          if (Math.abs(media.currentTime - targetTime) > 0.05) {
            media.currentTime = targetTime;
            await new Promise(r => { media.onseeked = r; });
          }
        }

        drawSceneFrame(ctx, canvas, media, mediaType, timeInScene, dur);

        const timestamp = Math.round(globalFrame * (1_000_000 / FPS));
        const frame = new VideoFrame(canvas, { timestamp });
        videoEncoder.encode(frame, { keyFrame: globalFrame % (FPS * 2) === 0 });
        frame.close();

        globalFrame++;

        // Update progress (20-80% range for encoding)
        if (globalFrame % 10 === 0) {
          setProgress(20 + Math.round((globalFrame / totalFrames) * 60));
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    if (cancelledRef.current) {
      try { videoEncoder.close(); } catch {}
      try { audioEncoder?.close(); } catch {}
      videoEncoderRef.current = null;
      audioEncoderRef.current = null;
      setExporting(false);
      setPhase('');
      setProgress(0);
      return null;
    }

    // Encode audio
    if (hasAudio && audioEncoder) {
      setPhase('audio');
      setProgress(80);

      const audioBuffers = [];

      if (voiceoverUrl) {
        try {
          const buf = await decodeAudio(voiceoverUrl);
          audioBuffers.push({ buffer: buf, volume: 1.0 });
        } catch (e) {
          console.warn('Could not decode voiceover:', e);
        }
      }

      if (musicUrl) {
        try {
          const buf = await decodeAudio(musicUrl);
          audioBuffers.push({ buffer: buf, volume: musicVolume, loop: true });
        } catch (e) {
          console.warn('Could not decode music:', e);
        }
      }

      if (audioBuffers.length > 0) {
        const sampleRate = 48000;
        const totalSamples = Math.ceil(totalDuration * sampleRate);
        const mixedData = new Float32Array(totalSamples * 2); // stereo interleaved

        for (const { buffer, volume, loop } of audioBuffers) {
          const channels = Math.min(buffer.numberOfChannels, 2);
          const channelData = [];
          for (let c = 0; c < channels; c++) {
            channelData.push(buffer.getChannelData(c));
          }

          for (let i = 0; i < totalSamples; i++) {
            const srcIdx = loop ? (i % buffer.length) : i;
            if (srcIdx >= buffer.length) break;

            for (let c = 0; c < 2; c++) {
              const chIdx = Math.min(c, channels - 1);
              mixedData[i * 2 + c] += channelData[chIdx][srcIdx] * volume;
            }
          }
        }

        // Clamp
        for (let i = 0; i < mixedData.length; i++) {
          mixedData[i] = Math.max(-1, Math.min(1, mixedData[i]));
        }

        // Send audio in chunks to avoid memory issues
        const CHUNK_SIZE = sampleRate; // 1 second chunks
        for (let offset = 0; offset < totalSamples; offset += CHUNK_SIZE) {
          const chunkSamples = Math.min(CHUNK_SIZE, totalSamples - offset);
          const chunkData = new Float32Array(chunkSamples * 2);
          chunkData.set(mixedData.subarray(offset * 2, (offset + chunkSamples) * 2));

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: sampleRate,
            numberOfFrames: chunkSamples,
            numberOfChannels: 2,
            timestamp: Math.round((offset / sampleRate) * 1_000_000),
            data: (() => {
              // Deinterleave for f32-planar format
              const planar = new Float32Array(chunkSamples * 2);
              for (let i = 0; i < chunkSamples; i++) {
                planar[i] = chunkData[i * 2]; // left
                planar[chunkSamples + i] = chunkData[i * 2 + 1]; // right
              }
              return planar;
            })(),
          });

          audioEncoder.encode(audioData);
          audioData.close();
        }

        setProgress(90);
      }
    }

    // Finalize
    setPhase('finalizing');
    setProgress(95);

    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    muxer.finalize();

    videoEncoder.close();
    audioEncoder?.close();
    videoEncoderRef.current = null;
    audioEncoderRef.current = null;

    const { buffer } = muxer.target;
    const blob = new Blob([buffer], { type: 'video/mp4' });

    setProgress(100);
    setPhase('done');
    setExporting(false);

    return blob;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    try { videoEncoderRef.current?.close(); } catch {}
    try { audioEncoderRef.current?.close(); } catch {}
    videoEncoderRef.current = null;
    audioEncoderRef.current = null;
    setExporting(false);
    setPhase('');
    setProgress(0);
    setError(null);
  }, []);

  return {
    exporting,
    progress,
    phase,
    error,
    exportVideo,
    checkSupport,
    cancel,
    QUALITY_PRESETS,
    PORTRAIT_PRESETS,
  };
}