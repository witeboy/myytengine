import { base44 } from '@/api/base44Client';

// ══════════════════════════════════════════════════════════════════
// FACE TRACKER — Multi-frame face detection for smooth 9:16 reframing
//
// Samples N frames evenly across a clip, asks Claude Vision for the
// face center at each, then builds an interpolated keyframe track.
//
// Output: { getCropAt(t) => { x, y } } — call per render frame
// Values are percentages (0-100) of source video dimensions.
// ══════════════════════════════════════════════════════════════════

const SAMPLE_COUNT = 6;           // frames to probe
const Y_BIAS = 0.85;              // pull face up slightly (rule of thirds)
const SMOOTHING = 0.25;           // EMA factor (0 = jittery, 1 = frozen)
const MAX_JUMP_PCT = 15;          // reject keyframes that jump > this between neighbours (likely misdetection)

// Capture a single JPEG frame at `timeSeconds` and return base64
async function captureFrameBase64(videoEl, timeSeconds, quality = 0.7) {
  videoEl.currentTime = timeSeconds;
  await new Promise((resolve) => {
    const onSeeked = () => { videoEl.removeEventListener('seeked', onSeeked); resolve(); };
    videoEl.addEventListener('seeked', onSeeked);
    // Safety timeout
    setTimeout(resolve, 2000);
  });

  const c = document.createElement('canvas');
  // Downscale — face detection doesn't need full res, saves upload bytes
  const maxSide = 640;
  const scale = Math.min(1, maxSide / Math.max(videoEl.videoWidth, videoEl.videoHeight));
  c.width = Math.round(videoEl.videoWidth * scale);
  c.height = Math.round(videoEl.videoHeight * scale);
  c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality).split(',')[1];
}

/**
 * Build a face-position track by sampling the clip at multiple points.
 *
 * @param {HTMLVideoElement} videoEl — an offscreen video element loaded with the source
 * @param {{ start: number, end: number, duration: number }} clip
 * @param {(msg: string) => void} onProgress
 * @returns {Promise<{ keyframes: Array<{t:number,x:number,y:number}>, getCropAt: (t:number) => {x:number, y:number} }>}
 */
export async function buildFaceTrack(videoEl, clip, onProgress = () => {}) {
  const { start, end, duration } = clip;
  const sampleTimes = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    sampleTimes.push(start + (duration * i) / (SAMPLE_COUNT - 1));
  }

  onProgress(`Tracking face across ${SAMPLE_COUNT} frames...`);

  // Sample frames SEQUENTIALLY (seeking a video element in parallel doesn't work)
  // but fire Claude calls in parallel once we have all base64 frames
  const frames = [];
  for (let i = 0; i < sampleTimes.length; i++) {
    const b64 = await captureFrameBase64(videoEl, sampleTimes[i]);
    frames.push({ t: sampleTimes[i], b64 });
    onProgress(`Captured frame ${i + 1}/${SAMPLE_COUNT}...`);
  }

  // Parallel Claude Vision calls
  onProgress(`Analyzing faces with Claude Vision...`);
  const results = await Promise.allSettled(
    frames.map(f => base44.functions.invoke('detectFaceRegion', { image_base64: f.b64 }))
  );

  // Collect valid keyframes (where a primary face was detected)
  let keyframes = results
    .map((r, i) => {
      if (r.status !== 'fulfilled') return null;
      const data = r.value?.data || r.value;
      const face = data?.primary_face;
      if (!face) return null;
      return {
        t: frames[i].t,
        x: face.x_center_percent,
        y: face.y_center_percent,
      };
    })
    .filter(Boolean);

  // Reject outlier keyframes (e.g. Claude confused by a cutaway)
  // A keyframe is an outlier if it's > MAX_JUMP_PCT away from BOTH neighbours
  if (keyframes.length >= 3) {
    keyframes = keyframes.filter((kf, i) => {
      if (i === 0 || i === keyframes.length - 1) return true;
      const prev = keyframes[i - 1];
      const next = keyframes[i + 1];
      const jumpFromPrev = Math.abs(kf.x - prev.x);
      const jumpFromNext = Math.abs(kf.x - next.x);
      if (jumpFromPrev > MAX_JUMP_PCT && jumpFromNext > MAX_JUMP_PCT) {
        console.warn(`Face tracker: rejecting outlier at t=${kf.t.toFixed(1)}s x=${kf.x}%`);
        return false;
      }
      return true;
    });
  }

  // Apply Y bias — faces look better slightly above vertical center
  keyframes = keyframes.map(kf => ({
    ...kf,
    y: Math.max(0, Math.min(100, kf.y * Y_BIAS + (1 - Y_BIAS) * 50)),
  }));

  console.log(`🎯 Face track built: ${keyframes.length}/${SAMPLE_COUNT} valid keyframes`);
  keyframes.forEach((kf, i) => console.log(`   #${i} t=${kf.t.toFixed(1)}s x=${kf.x}% y=${kf.y}%`));

  // Fallback if nothing detected
  if (keyframes.length === 0) {
    console.warn('Face tracker: no faces detected, falling back to center crop');
    return {
      keyframes: [],
      getCropAt: () => ({ x: 50, y: 50 }),
    };
  }

  // Build interpolator with EMA smoothing
  let lastX = keyframes[0].x;
  let lastY = keyframes[0].y;

  return {
    keyframes,
    getCropAt(t) {
      // Find surrounding keyframes
      let target;
      if (t <= keyframes[0].t) {
        target = { x: keyframes[0].x, y: keyframes[0].y };
      } else if (t >= keyframes[keyframes.length - 1].t) {
        const last = keyframes[keyframes.length - 1];
        target = { x: last.x, y: last.y };
      } else {
        // Linear interpolate between adjacent keyframes
        for (let i = 0; i < keyframes.length - 1; i++) {
          const a = keyframes[i];
          const b = keyframes[i + 1];
          if (t >= a.t && t <= b.t) {
            const alpha = (t - a.t) / (b.t - a.t);
            target = { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
            break;
          }
        }
      }

      if (!target) target = { x: 50, y: 50 };

      // EMA smoothing to kill jitter
      lastX = lastX + (target.x - lastX) * (1 - SMOOTHING);
      lastY = lastY + (target.y - lastY) * (1 - SMOOTHING);
      return { x: lastX, y: lastY };
    },
  };
}