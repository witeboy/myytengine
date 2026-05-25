import { useState, useRef, useCallback } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { base44 } from '@/api/base44Client';

const QUALITY_PRESETS = {
  '1080p': { width: 1920, height: 1080, bitrate: 6000000 },
  '720p': { width: 1280, height: 720, bitrate: 3000000 },
  '480p': { width: 854, height: 480, bitrate: 1500000 }
};

const PORTRAIT_PRESETS = {
  '1080p': { width: 1080, height: 1920, bitrate: 6000000 },
  '720p': { width: 720, height: 1280, bitrate: 3000000 },
  '480p': { width: 480, height: 854, bitrate: 1500000 }
};

const DEFAULT_TRANSITION_DURATION = 0.6;
const SAMPLE_RATE = 48000;
const AUDIO_CHUNK_FRAMES = SAMPLE_RATE;
const PRELOAD_CONCURRENCY = 5;
const MAX_QUEUE_DEPTH = 8;
const SEEK_TIMEOUT_MS = 300;
const VIDEO_LOAD_TIMEOUT_MS = 20000;
const KEYFRAME_INTERVAL_FRAMES = 60;

const ease = {
  easeInOutQuad: function(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; },
  easeOutQuad: function(t) { return 1 - (1 - t) * (1 - t); },
  easeInOutCubic: function(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  easeOutSine: function(t) { return Math.sin((t * Math.PI) / 2); }
};

const CINEMATIC_MOTIONS = [
  { id: 'zoom_in_center', startScale: 1.0, endScale: 1.10, startX: 0, startY: 0, endX: 0, endY: 0 },
  { id: 'zoom_out_center', startScale: 1.10, endScale: 1.0, startX: 0, startY: 0, endX: 0, endY: 0 },
  { id: 'pan_right_zoom', startScale: 1.0, endScale: 1.08, startX: -1.5, startY: 0, endX: 1.5, endY: 0 },
  { id: 'pan_left_zoom', startScale: 1.0, endScale: 1.08, startX: 1.5, startY: 0, endX: -1.5, endY: 0 },
  { id: 'push_in_top', startScale: 1.0, endScale: 1.08, startX: 0, startY: 1.2, endX: 0, endY: -1.2 },
  { id: 'push_in_bottom', startScale: 1.0, endScale: 1.08, startX: 0, startY: -1.2, endX: 0, endY: 1.2 },
  { id: 'diagonal_tl_br', startScale: 1.0, endScale: 1.08, startX: 1.5, startY: 1.0, endX: -1.5, endY: -1.0 },
  { id: 'diagonal_tr_bl', startScale: 1.0, endScale: 1.08, startX: -1.5, startY: 1.0, endX: 1.5, endY: -1.0 }
];

var _blobCache = new Map();

function yieldToMain() {
  return new Promise(function(resolve) {
    var ch = new MessageChannel();
    ch.port1.onmessage = resolve;
    ch.port2.postMessage(null);
  });
}

async function waitForEncoderQueue(encoder, maxDepth) {
  while (encoder.encodeQueueSize > maxDepth) {
    await yieldToMain();
  }
}

function findClipIndex(clips, absTime) {
  var lo = 0;
  var hi = clips.length - 1;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (absTime < clips[mid].startTime + clips[mid].duration) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}

function getMotionTransform(clip, elapsed, W, H) {
  if (!clip || !clip.cinematicMotion) return null;
  var m = null;
  for (var i = 0; i < CINEMATIC_MOTIONS.length; i++) {
    if (CINEMATIC_MOTIONS[i].id === clip.cinematicMotion) {
      m = CINEMATIC_MOTIONS[i];
      break;
    }
  }
  if (!m) return null;
  var intensity = clip.motionIntensity !== undefined ? clip.motionIntensity : 1.0;
  var dur = clip.duration !== undefined ? clip.duration : 5;
  var speed = clip.motionSpeed !== undefined ? clip.motionSpeed : 1.0;
  var win = dur / speed;
  var p = ease.easeOutSine(Math.min(1, Math.max(0, elapsed / win)));
  return {
    scale: m.startScale + (m.endScale - m.startScale) * intensity * p,
    tx_px: ((m.startX + (m.endX - m.startX) * intensity * p) / 100) * W,
    ty_px: ((m.startY + (m.endY - m.startY) * intensity * p) / 100) * H
  };
}

function drawMediaFrame(ctx, W, H, media, isVideo, mxform) {
  var sw = isVideo ? (media.videoWidth || 1) : (media.width || media.naturalWidth || 1);
  var sh = isVideo ? (media.videoHeight || 1) : (media.height || media.naturalHeight || 1);
  var s = Math.min(W / sw, H / sh);
  var dx = (W - sw * s) / 2;
  var dy = (H - sh * s) / 2;
  ctx.save();
  if (mxform) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(mxform.scale, mxform.scale);
    ctx.translate(-W / 2 + mxform.tx_px, -H / 2 + mxform.ty_px);
  }
  try {
    ctx.drawImage(media, dx, dy, sw * s, sh * s);
  } catch (e) {}
  ctx.restore();
}

function compositeTransition(ctx, W, H, outBm, inBm, type, progress) {
  ctx.clearRect(0, 0, W, H);
  var easeFn = ease.easeInOutQuad;
  if (type === 'Black Fade') easeFn = ease.easeInOutCubic;
  if (type === 'Expand Fade') easeFn = ease.easeOutQuad;
  var e2 = easeFn(progress);
  if (type === 'Gradual Fade') {
    ctx.globalAlpha = 1 - e2;
    ctx.drawImage(outBm, 0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = e2;
    ctx.filter = 'brightness(' + (0.9 + e2 * 0.1) + ')';
    ctx.drawImage(inBm, 0, 0, W, H);
  } else if (type === 'Black Fade') {
    var dp = Math.sin(e2 * Math.PI);
    ctx.globalAlpha = 1 - e2 * 0.4;
    ctx.filter = 'brightness(' + (1 - dp * 0.65) + ') contrast(' + (1 + dp * 0.15) + ') saturate(' + (1 - dp * 0.3) + ')';
    ctx.drawImage(outBm, 0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = e2 * 0.4;
    ctx.filter = 'brightness(' + (1 - dp * 0.65) + ')';
    ctx.drawImage(inBm, 0, 0, W, H);
  } else if (type === 'Expand Fade') {
    ctx.globalAlpha = 1 - e2 * 0.8;
    ctx.filter = 'blur(' + (e2 * e2 * 5) + 'px) brightness(' + (1 - e2 * 0.1) + ')';
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(1 - e2 * 0.18, 1 - e2 * 0.18);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(outBm, 0, 0, W, H);
    ctx.restore();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = e2 * 0.8;
    ctx.filter = 'blur(' + ((1 - e2) * 3) + 'px) brightness(' + (0.9 + e2 * 0.1) + ')';
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(0.82 + e2 * 0.18, 0.82 + e2 * 0.18);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(inBm, 0, 0, W, H);
    ctx.restore();
  } else if (type === 'Overlap Fade') {
    var slide = e2 * e2 * 60;
    ctx.globalAlpha = 1 - e2 * 0.7;
    ctx.filter = 'blur(' + (e2 * 6) + 'px)';
    ctx.drawImage(outBm, slide, 0, W, H);
    ctx.globalCompositeOperation = 'lighten';
    ctx.globalAlpha = e2 * 0.9;
    ctx.filter = 'blur(' + ((1 - e2) * 4) + 'px)';
    ctx.drawImage(inBm, -slide, 0, W, H);
  } else {
    ctx.globalAlpha = 1 - e2;
    ctx.drawImage(outBm, 0, 0, W, H);
    ctx.globalAlpha = e2;
    ctx.drawImage(inBm, 0, 0, W, H);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}

function drawCaptions(ctx, W, H, captions, absTime) {
  if (!captions || !captions.length) return;
  for (var i = 0; i < captions.length; i++) {
    var cap = captions[i];
    if (absTime < cap.startTime || absTime >= cap.startTime + cap.duration) continue;
    var text = (cap.text || '').trim();
    if (!text) continue;
    var bs = H / 1080;
    var fs = Math.round((cap.fontSize || 20) * bs);
    ctx.save();
    var x = (cap.x || 50) / 100 * W;
    var y = (cap.y || 85) / 100 * H;
    ctx.font = (cap.fontWeight || 'bold') + ' ' + fs + 'px ' + (cap.fontFamily || 'Arial, sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var mw = W * 0.85;
    var lines = [];
    var cur = '';
    var words = text.split(' ');
    for (var wi = 0; wi < words.length; wi++) {
      var word = words[wi];
      var test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width > mw && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    var lh = fs * 1.3;
    var th = lines.length * lh;
    var px = fs * 0.6;
    var py = fs * 0.4;
    var lmw = 0;
    for (var li = 0; li < lines.length; li++) {
      var lw = ctx.measureText(lines[li]).width;
      if (lw > lmw) lmw = lw;
    }
    var capElapsed = absTime - cap.startTime;
    var rem = (cap.startTime + cap.duration) - absTime;
    var FD = 0.15;
    var alpha = 1;
    if (cap.animation === 'pop' && capElapsed < FD) {
      var tt = capElapsed / FD;
      alpha = tt;
      ctx.translate(x, y);
      ctx.scale(1 + (1 - tt) * 0.15, 1 + (1 - tt) * 0.15);
      ctx.translate(-x, -y);
    } else {
      if (capElapsed < FD) alpha = capElapsed / FD;
    }
    if (rem < FD) alpha = Math.min(alpha, rem / FD);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (cap.bgColor) {
      ctx.fillStyle = cap.bgColor;
      ctx.beginPath();
      ctx.roundRect(x - lmw / 2 - px, y - th / 2 - py, lmw + px * 2, th + py * 2, fs * 0.25);
      ctx.fill();
    }
    if (cap.strokeColor && (cap.strokeWidth || 0) > 0) {
      ctx.strokeStyle = cap.strokeColor;
      ctx.lineWidth = (cap.strokeWidth || 2) * bs;
      ctx.lineJoin = 'round';
      for (var si = 0; si < lines.length; si++) {
        ctx.strokeText(lines[si], x, y - th / 2 + lh * (si + 0.5));
      }
    }
    ctx.fillStyle = cap.color || '#FFFFFF';
    for (var fi = 0; fi < lines.length; fi++) {
      ctx.fillText(lines[fi], x, y - th / 2 + lh * (fi + 0.5));
    }
    ctx.restore();
  }
}

function isKnownCorsBlocked(hostname) {
  var blocked = [
    'tempfile.aiquickdraw.com',
    'file.aiquickdraw.com',
    'api.kie.ai',
    'ideogram.ai',
    '.r2.dev',
    'r2.cloudflarestorage.com',
    'storage.googleapis.com',
    'cdn.aiquickdraw.com',
    'pub-',
    'oaidalleapiprodscus.blob.core.windows.net',
    'replicate.delivery',
    'pbxt.replicate.delivery',
    'media.myvoicify.app',
    'myvoicify.app',
  ];
  for (var i = 0; i < blocked.length; i++) {
    if (hostname.indexOf(blocked[i]) !== -1) return true;
  }
  return false;
}

async function fetchAsBlob(url) {
  if (!url || url.indexOf('http') !== 0) throw new Error('Invalid URL');
  if (_blobCache.has(url)) return _blobCache.get(url);

  var hostname;
  try {
    hostname = new URL(url).hostname;
  } catch (e) {
    throw new Error('Malformed URL');
  }

  if (!isKnownCorsBlocked(hostname)) {
    try {
      var r = await fetch(url, { mode: 'cors' });
      if (r.ok) {
        var bu = URL.createObjectURL(await r.blob());
        _blobCache.set(url, bu);
        return bu;
      }
    } catch (e) {
      console.log('[Export] Direct fetch failed for ' + hostname + ', trying proxy...');
    }
  }

  console.log('[Export] Proxying ' + url.substring(0, 70) + '...');
  try {
    var res = await base44.functions.invoke('proxyFetchAsset', { url: url });
    var pd = res && res.data ? res.data : res;

    if (pd && pd.success && pd.data) {
      var binary = atob(pd.data);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      var blob = new Blob([bytes], { type: pd.content_type || 'application/octet-stream' });
      var blobUrl = URL.createObjectURL(blob);
      _blobCache.set(url, blobUrl);
      return blobUrl;
    }

   if (pd && pd.success && pd.file_url) {
      // file_url may itself be CORS-blocked (e.g. media.myvoicify.app has no CORS headers).
      // Re-proxy it server-side rather than fetching from the browser.
      console.log('[Export] file_url returned — re-proxying server-side: ' + pd.file_url.substring(0, 60));
      try {
        var res2 = await base44.functions.invoke('selectHook', { action: 'proxyAsset', url: pd.file_url });
        var pd2 = res2 && res2.data ? res2.data : res2;
        if (pd2 && pd2.success && pd2.data) {
          var binary2 = atob(pd2.data);
          var bytes2 = new Uint8Array(binary2.length);
          for (var j = 0; j < binary2.length; j++) bytes2[j] = binary2.charCodeAt(j);
          var blob2 = new Blob([bytes2], { type: pd2.content_type || pd.content_type || 'image/jpeg' });
          var bu2 = URL.createObjectURL(blob2);
          _blobCache.set(url, bu2);
          return bu2;
        }
      } catch (e2) {
        console.warn('[Export] Re-proxy of file_url also failed:', e2.message);
      }
    }

    throw new Error('Proxy returned: ' + JSON.stringify(pd).substring(0, 100));
  } catch (e) {
    console.error('[Export] Proxy failed for ' + url.substring(0, 60) + ': ' + e.message);
    throw new Error('CORS_BLOCKED: ' + url.substring(0, 70));
  }
}

async function loadImageBitmap(url) {
  var blobUrl = await fetchAsBlob(url);
  try {
    var response = await fetch(blobUrl);
    var blob = await response.blob();
    return await createImageBitmap(blob);
  } catch (e) {
    console.warn('[Export] createImageBitmap failed, trying img element:', e.message);
  }

  return new Promise(function(resolve, reject) {
    var img = new Image();
    img.onload = function() {
      createImageBitmap(img).then(resolve).catch(function() { resolve(img); });
    };
    img.onerror = function() { reject(new Error('Image load failed')); };
    img.src = blobUrl;
  });
}

async function loadVideoElement(url) {
  var bu = null;
  try {
    bu = await fetchAsBlob(url);
  } catch (e) {}
  var src = bu || url;

  return new Promise(function(resolve, reject) {
    var v = document.createElement('video');
    if (src.indexOf('blob:') !== 0) v.crossOrigin = 'anonymous';
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    var t = setTimeout(function() {
      if (bu) URL.revokeObjectURL(bu);
      reject(new Error('Video load timeout'));
    }, VIDEO_LOAD_TIMEOUT_MS);
    v.onloadeddata = function() {
      clearTimeout(t);
      v._blobUrl = bu;
      resolve(v);
    };
    v.onerror = function() {
      clearTimeout(t);
      if (bu) URL.revokeObjectURL(bu);
      reject(new Error('Video load failed'));
    };
    v.src = src;
  });
}

function seekVideo(video, time) {
  return new Promise(function(resolve) {
    var maxTime = video.duration > 0 && isFinite(video.duration) ? video.duration - 0.02 : 0;
    var target = Math.max(0, Math.min(time, maxTime));
    if (Math.abs(video.currentTime - target) < 0.033) {
      resolve(true);
      return;
    }
    var t = setTimeout(function() { resolve(false); }, SEEK_TIMEOUT_MS);
    video.onseeked = function() {
      clearTimeout(t);
      resolve(true);
    };
    video.currentTime = target;
  });
}

async function decodeAudio(url) {
  var blobUrl = await fetchAsBlob(url);
  var resp = await fetch(blobUrl);
  var buf = await resp.arrayBuffer();
  var actx = new AudioContext({ sampleRate: SAMPLE_RATE });
  var dec = await actx.decodeAudioData(buf);
  await actx.close();
  return dec;
}

async function parallelBatch(tasks, concurrency, onProgress) {
  var results = new Array(tasks.length);
  var next = 0;
  var done = 0;

  async function worker() {
    while (next < tasks.length) {
      var i = next++;
      try {
        results[i] = await tasks[i]();
      } catch (e) {
        results[i] = null;
        console.warn('[Export] Preload[' + i + '] failed:', e.message);
      }
      done++;
      if (onProgress) onProgress(done, tasks.length);
    }
  }

  var workers = [];
  var workerCount = Math.min(concurrency, tasks.length);
  for (var i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export default function useVideoExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);
  const encoderRef = useRef(null);
  const wakeLockRef = useRef(null);

  var acquireWakeLock = async function() {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', reacquireWakeLock);
      }
    } catch (e) {}
  };

  var reacquireWakeLock = async function() {
    if (wakeLockRef.current !== null && document.visibilityState === 'visible') {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (e) {}
    }
  };

  var releaseWakeLock = function() {
    document.removeEventListener('visibilitychange', reacquireWakeLock);
    try {
      if (wakeLockRef.current) wakeLockRef.current.release();
    } catch (e) {}
    wakeLockRef.current = null;
  };

  const checkSupport = useCallback(async function(quality, orientation) {
    if (!('VideoEncoder' in window)) {
      return { supported: false, reason: 'WebCodecs not available. Use Chrome 94+ or Edge 94+.' };
    }
    var presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
    var preset = presets[quality];
    var codecs = ['avc1.42001e', 'avc1.4d001e', 'avc1.640028', 'avc1.42001f'];
    for (var i = 0; i < codecs.length; i++) {
      try {
        var s = await VideoEncoder.isConfigSupported({
          codec: codecs[i],
          width: preset.width,
          height: preset.height,
          bitrate: preset.bitrate
        });
        if (s.supported) {
          return { supported: true, warning: false, codec: codecs[i] };
        }
      } catch (e) {}
    }
    return { supported: true, warning: true, reason: quality + ' H.264 may not be hardware-accelerated.', codec: 'avc1.42001e' };
  }, []);

  const exportVideo = useCallback(async function(scenes, opts) {
    var options = opts || {};
    var quality = options.quality || '720p';
    var orientation = options.orientation || 'landscape';
    var fps = options.fps || 30;
    var voiceoverUrl = options.voiceoverUrl;
    var musicUrl = options.musicUrl;
    var musicVolume = options.musicVolume !== undefined ? options.musicVolume : 0.3;
    var editedMusicClips = options.musicClips || [];
    var captions = options.captions || [];

    _blobCache.clear();
    cancelledRef.current = false;
    setExporting(true);
    setProgress(0);
    setPhase('checking');
    setError(null);
    await acquireWakeLock();

    try {
      var presets = orientation === 'portrait' ? PORTRAIT_PRESETS : QUALITY_PRESETS;
      var preset = presets[quality];
      var W = preset.width;
      var H = preset.height;
      var BR = preset.bitrate;

        var clips = scenes.map(function(s) {
        var dur = Math.max(0.1, s.duration || s.duration_seconds || 8);
        var hasExplicitStart = s.startTime !== undefined && s.startTime !== null && s.startTime >= 0;
        return {
          duration: dur,
          startTime: hasExplicitStart ? s.startTime : -1,
          mediaType: s.mediaType || (s.video_url && s.video_url.indexOf('http') === 0 ? 'video' : 'image'),
          videoUrl: s.videoUrl || s.video_url || '',
          imageUrl: s.imageUrl || s.image_url || '',
          playbackRate: s.playbackRate !== undefined ? s.playbackRate : 1.0,
          videoDuration: s.videoDuration !== undefined ? s.videoDuration : null,
          videoStartOffset: s.videoStartOffset !== undefined ? s.videoStartOffset : 0,
          cinematicMotion: s.cinematicMotion || null,
          motionSpeed: s.motionSpeed !== undefined ? s.motionSpeed : 1.0,
          motionIntensity: s.motionIntensity !== undefined ? s.motionIntensity : 1.0,
          transition: s.transition || null,
          transitionDuration: s.transitionDuration !== undefined ? s.transitionDuration : DEFAULT_TRANSITION_DURATION
        };
      });

      var off = 0;
      for (var i = 0; i < clips.length; i++) {
        if (clips[i].startTime < 0) {
          clips[i].startTime = off;
        }
        off = clips[i].startTime + clips[i].duration;
      }

      var clipsDuration = off;

      var runningOffset = 0;
      for (var i = 0; i < clips.length; i++) {
        if (clips[i].startTime < 0) {
          clips[i].startTime = runningOffset;
        }
        runningOffset = clips[i].startTime + clips[i].duration;
      }

      var clipsDuration = runningOffset;
      var hasAudio = !!(voiceoverUrl || musicUrl);
      var totalDuration = clipsDuration;
      var voiceBuf = null;

      if (voiceoverUrl) {
        setPhase('measuring');
        try {
          voiceBuf = await decodeAudio(voiceoverUrl);
          var measuredDur = voiceBuf.duration;
          if (measuredDur > 0 && isFinite(measuredDur)) {
            totalDuration = measuredDur;
            console.log('[Export] Voiceover measured: ' + measuredDur.toFixed(3) + 's (clips sum: ' + clipsDuration.toFixed(3) + 's)');
            var hasTimelineSync = clips.some(function(c) { return c.startTime !== undefined && c.startTime >= 0; });
            if (!hasTimelineSync) {
              var scale = measuredDur / clipsDuration;
              var newOff = 0;
              for (var ci = 0; ci < clips.length; ci++) {
                clips[ci].startTime = newOff;
                clips[ci].duration = parseFloat((clips[ci].duration * scale).toFixed(6));
                newOff += clips[ci].duration;
              }
            } else {
              console.log('[Export] Using timeline-synced clip positions (ASR aligned)');
            }
          }
        } catch (e) {
          console.warn('[Export] Could not measure voiceover, using clip sum:', e.message);
        }
      }

      var totalFrames = Math.ceil(totalDuration * fps);
      var totalSamples = Math.round((totalFrames / fps) * SAMPLE_RATE);

      console.log('[Export] ' + clips.length + ' clips | ' + totalFrames + 'fr | ' + totalDuration.toFixed(3) + 's | ' + fps + 'fps | ' + quality + ' | ' + totalSamples + ' audio samples');

      var videoCodec = 'avc1.42001e';
      var codecList = ['avc1.42001e', 'avc1.4d001e', 'avc1.640028'];
      for (var cdi = 0; cdi < codecList.length; cdi++) {
        try {
          var s = await VideoEncoder.isConfigSupported({
            codec: codecList[cdi],
            width: W,
            height: H,
            bitrate: BR
          });
          if (s.supported) {
            videoCodec = codecList[cdi];
            break;
          }
        } catch (e) {}
      }

      var muxCfg = {
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: W, height: H },
        fastStart: 'in-memory'
      };
      if (hasAudio) {
        muxCfg.audio = { codec: 'aac', sampleRate: SAMPLE_RATE, numberOfChannels: 2 };
      }
      var muxer = new Muxer(muxCfg);

      var encodeError = null;
      var videoEncoder = new VideoEncoder({
        output: function(chunk, meta) { muxer.addVideoChunk(chunk, meta); },
        error: function(e) { encodeError = e; console.error('[Export] VideoEncoder error:', e); }
      });
      encoderRef.current = videoEncoder;
      videoEncoder.configure({
        codec: videoCodec,
        width: W,
        height: H,
        bitrate: BR,
        framerate: fps,
        latencyMode: 'quality',
        avc: { format: 'annexb' }
      });

      var audioEncoder = null;
      if (hasAudio) {
        audioEncoder = new AudioEncoder({
          output: function(chunk, meta) { muxer.addAudioChunk(chunk, meta); },
          error: function(e) { console.warn('[Export] AudioEncoder error:', e); }
        });
        audioEncoder.configure({
          codec: 'mp4a.40.2',
          sampleRate: SAMPLE_RATE,
          numberOfChannels: 2,
          bitrate: 128000
        });
      }

      var canvas = new OffscreenCanvas(W, H);
      var ctx = canvas.getContext('2d');

      setPhase('loading');

      var preloadTasks = clips.map(function(clip, idx) {
        return async function() {
          if (cancelledRef.current) return { media: null, mediaType: 'image', measuredVideoDur: null };
          var wantsVideo = clip.mediaType === 'video' && clip.videoUrl && clip.videoUrl.indexOf('http') === 0;
          var hasImg = clip.imageUrl && clip.imageUrl.indexOf('http') === 0;

          if (wantsVideo) {
            try {
              var el = await loadVideoElement(clip.videoUrl);
              var dur = (el.duration && isFinite(el.duration)) ? el.duration : (clip.videoDuration || 6);
              return { media: el, mediaType: 'video', measuredVideoDur: dur };
            } catch (e) {
              console.warn('[Export] Clip ' + idx + ' video failed (' + e.message + ')' + (hasImg ? ' - falling back to image' : ''));
              if (hasImg) {
                try {
                  var bm = await loadImageBitmap(clip.imageUrl);
                  console.log('[Export] Clip ' + idx + ' using image fallback');
                  return { media: bm, mediaType: 'image', measuredVideoDur: null };
                } catch (imgErr) {
                  console.warn('[Export] Clip ' + idx + ' image fallback also failed:', imgErr.message);
                }
              }
            }
          } else if (hasImg) {
            try {
              return { media: await loadImageBitmap(clip.imageUrl), mediaType: 'image', measuredVideoDur: null };
            } catch (e) {
              console.warn('[Export] Clip ' + idx + ' image failed:', e.message);
            }
          }

          var anyUrl = clip.imageUrl || clip.videoUrl;
          if (anyUrl && anyUrl.indexOf('http') === 0) {
            try {
              var bmLast = await loadImageBitmap(anyUrl);
              console.log('[Export] Clip ' + idx + ' rescued via last-resort URL');
              return { media: bmLast, mediaType: 'image', measuredVideoDur: null };
            } catch (e) {}
          }

          console.warn('[Export] Clip ' + idx + ' - no media at all, will render black');
          return { media: null, mediaType: 'image', measuredVideoDur: null };
        };
      });

      var clipMedia = await parallelBatch(preloadTasks, PRELOAD_CONCURRENCY, function(done, total) {
        setProgress(Math.round((done / total) * 15));
      });

      if (cancelledRef.current) throw new Error('cancelled');
      console.log('[Export] Preload done - starting CFR encode...');
      setPhase('encoding');

      var lastFrame = new Map();

      var drawClipFrame = async function(ci, elapsedInClip) {
        var clip = clips[ci];
        var mediaInfo = clipMedia[ci] || {};
        var media = mediaInfo.media;
        var mediaType = mediaInfo.mediaType;
        var measuredVideoDur = mediaInfo.measuredVideoDur;
        var mxform = getMotionTransform(clip, elapsedInClip, W, H);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        if (!media) return;

        if (mediaType === 'image') {
          drawMediaFrame(ctx, W, H, media, false, mxform);
          if (!lastFrame.has(ci)) lastFrame.set(ci, media);
         } else {
          var maxSrc = (measuredVideoDur || clip.videoDuration || 999) - 0.02;
          var playbackRate = clip.playbackRate || 1.0;
          var videoStartOffset = clip.videoStartOffset || 0;
          var srcTime = Math.min(videoStartOffset + (elapsedInClip * playbackRate), maxSrc);
          if (srcTime >= maxSrc) {
            var frozen = lastFrame.get(ci);
            if (frozen) drawMediaFrame(ctx, W, H, frozen, false, mxform);
          } else {
            var ok = await seekVideo(media, srcTime);
            if (ok) {
              drawMediaFrame(ctx, W, H, media, true, mxform);
              var bmNew = await createImageBitmap(canvas);
              var prev = lastFrame.get(ci);
              if (prev && prev !== media) {
                try { prev.close(); } catch (e) {}
              }
              lastFrame.set(ci, bmNew);
            } else {
              var frozenFrame = lastFrame.get(ci);
              if (frozenFrame) drawMediaFrame(ctx, W, H, frozenFrame, false, mxform);
            }
          }
        }
      };

      var framesSinceFlush = 0;

      for (var f = 0; f < totalFrames; f++) {
        if (cancelledRef.current) throw new Error('cancelled');
        if (encodeError) throw encodeError;

        await waitForEncoderQueue(videoEncoder, MAX_QUEUE_DEPTH);

        var timestamp_us = Math.round(f * (1000000 / fps));
        var absTime = f / fps;

        var ci = findClipIndex(clips, absTime);
        var clip = clips[ci];
        var elapsed = absTime - clip.startTime;
        var prev = ci > 0 ? clips[ci - 1] : null;

        var tType = prev ? prev.transition : null;
        var tDur = prev && prev.transitionDuration !== undefined ? prev.transitionDuration : DEFAULT_TRANSITION_DURATION;
        var inTrans = tType && elapsed < tDur;

        if (inTrans) {
          await drawClipFrame(ci, elapsed);
          var inBm = await createImageBitmap(canvas);
          var outBm = lastFrame.get(ci - 1) || inBm;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, W, H);
          compositeTransition(ctx, W, H, outBm, inBm, tType, Math.min(1, elapsed / tDur));
          try { inBm.close(); } catch (e) {}
        } else {
          await drawClipFrame(ci, elapsed);
        }

        drawCaptions(ctx, W, H, captions, absTime);

        var vf = new VideoFrame(canvas, { timestamp: timestamp_us });
        videoEncoder.encode(vf, { keyFrame: f % KEYFRAME_INTERVAL_FRAMES === 0 });
        vf.close();
        framesSinceFlush++;

        if (framesSinceFlush >= fps) {
          await videoEncoder.flush();
          framesSinceFlush = 0;
        }

        if (f % 5 === 0) {
          setProgress(15 + Math.round((f / totalFrames) * 65));
          await yieldToMain();
        }
      }

      lastFrame.forEach(function(bm, key) {
        var mediaInfo = clipMedia[key];
        if (mediaInfo && mediaInfo.mediaType === 'video') {
          try { bm.close(); } catch (e) {}
        }
      });
      lastFrame.clear();

      for (var mi = 0; mi < clipMedia.length; mi++) {
        var info = clipMedia[mi];
        if (info && info.media && info.media.tagName === 'VIDEO' && info.media._blobUrl) {
          URL.revokeObjectURL(info.media._blobUrl);
        }
      }

      if (cancelledRef.current) throw new Error('cancelled');

      if (hasAudio && audioEncoder) {
        setPhase('audio');
        setProgress(82);
        var L = new Float32Array(totalSamples);
        var R = new Float32Array(totalSamples);

        if (voiceoverUrl) {
          try {
            var voBuf = voiceBuf || await decodeAudio(voiceoverUrl);
            var voChN = Math.min(voBuf.numberOfChannels, 2);
            var voCh = [];
            for (var vci = 0; vci < voChN; vci++) {
              voCh.push(voBuf.getChannelData(vci));
            }
            var voLen = Math.min(totalSamples, voBuf.length);
            for (var vi = 0; vi < voLen; vi++) {
              L[vi] = voCh[0][vi];
              R[vi] = voCh[Math.min(1, voChN - 1)][vi];
            }
          } catch (e) {
            console.warn('[Export] VO mix failed:', e);
          }
        }

        if (musicUrl) {
          try {
            var muBuf = await decodeAudio(musicUrl);
            var muChN = Math.min(muBuf.numberOfChannels, 2);
            var muCh = [];
            for (var mci = 0; mci < muChN; mci++) {
              muCh.push(muBuf.getChannelData(mci));
            }
            if (editedMusicClips.length > 0) {
              for (var eci = 0; eci < editedMusicClips.length; eci++) {
                var mc = editedMusicClips[eci];
                var vol = mc.volume !== undefined ? mc.volume : musicVolume;
                var so = Math.round((mc.sourceOffset || 0) * SAMPLE_RATE);
                var ds = Math.round(mc.startTime * SAMPLE_RATE);
                var cl = Math.round(mc.duration * SAMPLE_RATE);
                for (var msi = 0; msi < cl; msi++) {
                  var di = ds + msi;
                  if (di >= totalSamples) break;
                  var si = (so + msi) < muBuf.length ? (so + msi) : (so + msi) % muBuf.length;
                  L[di] += muCh[0][si] * vol;
                  R[di] += muCh[Math.min(1, muChN - 1)][si] * vol;
                }
              }
            } else {
              for (var mxi = 0; mxi < totalSamples; mxi++) {
                var sxi = mxi % muBuf.length;
                L[mxi] += muCh[0][sxi] * musicVolume;
                R[mxi] += muCh[Math.min(1, muChN - 1)][sxi] * musicVolume;
              }
            }
          } catch (e) {
            console.warn('[Export] Music decode failed:', e);
          }
        }

        for (var li = 0; li < totalSamples; li++) {
          L[li] = L[li] / (1 + Math.abs(L[li]));
          R[li] = R[li] / (1 + Math.abs(R[li]));
        }

        for (var ao = 0; ao < totalSamples; ao += AUDIO_CHUNK_FRAMES) {
          if (cancelledRef.current) throw new Error('cancelled');
          var aLen = Math.min(AUDIO_CHUNK_FRAMES, totalSamples - ao);
          var p = new Float32Array(aLen * 2);
          p.set(L.subarray(ao, ao + aLen), 0);
          p.set(R.subarray(ao, ao + aLen), aLen);
          var ad = new AudioData({
            format: 'f32-planar',
            sampleRate: SAMPLE_RATE,
            numberOfFrames: aLen,
            numberOfChannels: 2,
            timestamp: Math.round((ao / SAMPLE_RATE) * 1000000),
            data: p
          });
          audioEncoder.encode(ad);
          ad.close();
        }
        setProgress(93);
      }

      setPhase('finalizing');
      setProgress(96);
      await videoEncoder.flush();
      if (audioEncoder) await audioEncoder.flush();
      muxer.finalize();
      videoEncoder.close();
      if (audioEncoder) audioEncoder.close();
      encoderRef.current = null;
      _blobCache.clear();

      var blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      console.log('[Export] Done: ' + (blob.size / 1024 / 1024).toFixed(1) + ' MB');
      setProgress(100);
      setPhase('done');
      setExporting(false);
      releaseWakeLock();
      return blob;

    } catch (e) {
      try {
        if (encoderRef.current) encoderRef.current.close();
      } catch (ex) {}
      encoderRef.current = null;
      _blobCache.clear();
      releaseWakeLock();
      if (e.message === 'cancelled') {
        setExporting(false);
        setPhase('');
        setProgress(0);
        return null;
      }
      console.error('[Export] Failed:', e);
      setError(e.message || 'Export failed unexpectedly');
      setExporting(false);
      return null;
    }
  }, []);

  const cancel = useCallback(function() {
    cancelledRef.current = true;
    try {
      if (encoderRef.current) encoderRef.current.close();
    } catch (e) {}
    encoderRef.current = null;
    _blobCache.clear();
    releaseWakeLock();
    setExporting(false);
    setPhase('');
    setProgress(0);
    setError(null);
  }, []);

  return {
    exporting: exporting,
    progress: progress,
    phase: phase,
    error: error,
    exportVideo: exportVideo,
    checkSupport: checkSupport,
    cancel: cancel,
    QUALITY_PRESETS: QUALITY_PRESETS,
    PORTRAIT_PRESETS: PORTRAIT_PRESETS
  };
}