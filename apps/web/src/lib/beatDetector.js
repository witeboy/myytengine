// ═══════════════════════════════════════════════════════════════════
// FIX 4 — Beat Detector
// FILE: src/lib/beatDetector.js  (NEW FILE — create it)
//
// Client-side music beat detection using Web Audio API.
// Uses onset detection (energy flux across frequency bands) to find
// beat timestamps in a music track URL.
// No external dependencies — pure Web Audio API.
// ═══════════════════════════════════════════════════════════════════

/**
 * Detects beat timestamps in an audio file.
 *
 * @param {string} audioUrl  - URL of the music track
 * @param {function} onProgress - optional (phase, pct) => void callback
 * @returns {Promise<{ beats: number[], bpm: number, confidence: number }>}
 *   beats: array of beat timestamps in seconds
 *   bpm: detected tempo
 *   confidence: 0–1 quality score
 */
export async function detectBeats(audioUrl, onProgress = () => {}) {
  // ── 1. Fetch + decode audio ──────────────────────────────────────
  onProgress('fetching', 0);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  let audioBuffer;
  try {
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    onProgress('decoding', 20);
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } catch (err) {
    ctx.close();
    throw new Error(`Beat detector: could not load audio — ${err.message}`);
  }

  onProgress('analyzing', 40);

  // ── 2. Extract raw PCM from first channel ───────────────────────
  const rawData   = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const duration   = audioBuffer.duration;

  // ── 3. Compute energy in overlapping windows ─────────────────────
  // Window size ~23ms @ 44100Hz — small enough for transient detection
  const WINDOW_SIZE    = Math.round(sampleRate * 0.023);
  const HOP_SIZE       = Math.round(sampleRate * 0.01);  // 10ms hop
  const numWindows     = Math.floor((rawData.length - WINDOW_SIZE) / HOP_SIZE);

  const energyCurve = new Float32Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    const offset = w * HOP_SIZE;
    let energy = 0;
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const sample = rawData[offset + i];
      energy += sample * sample;
    }
    energyCurve[w] = energy / WINDOW_SIZE;
  }

  // ── 4. Onset detection — spectral flux ───────────────────────────
  // Positive differences in energy = onset (beat hit)
  const flux = new Float32Array(numWindows);
  for (let w = 1; w < numWindows; w++) {
    const diff = energyCurve[w] - energyCurve[w - 1];
    flux[w] = diff > 0 ? diff : 0; // half-wave rectify
  }

  // ── 5. Adaptive threshold — median of local window ───────────────
  const THRESHOLD_WINDOW = 80; // windows (~800ms)
  const THRESHOLD_MULT   = 1.5;
  const onsets = [];

  for (let w = THRESHOLD_WINDOW; w < numWindows - THRESHOLD_WINDOW; w++) {
    const local = [];
    for (let j = w - THRESHOLD_WINDOW; j < w + THRESHOLD_WINDOW; j++) {
      local.push(flux[j]);
    }
    local.sort((a, b) => a - b);
    const median = local[Math.floor(local.length / 2)];
    const threshold = median * THRESHOLD_MULT;
    if (flux[w] > threshold) onsets.push(w);
  }

  // ── 6. Peak-pick onsets (suppress duplicates within 100ms) ───────
  const MIN_ONSET_GAP = Math.round(0.1 / (HOP_SIZE / sampleRate)); // 100ms
  const peaks = [];
  let lastPeak = -MIN_ONSET_GAP;
  for (const w of onsets) {
    if (w - lastPeak >= MIN_ONSET_GAP) {
      peaks.push(w);
      lastPeak = w;
    }
  }

  // ── 7. Convert windows → seconds ─────────────────────────────────
  const beatTimestamps = peaks.map(w => parseFloat(((w * HOP_SIZE) / sampleRate).toFixed(3)));

  // ── 8. Estimate BPM from inter-beat intervals ─────────────────────
  let bpm = 0;
  let confidence = 0;

  if (beatTimestamps.length > 4) {
    const ibis = [];
    for (let i = 1; i < beatTimestamps.length; i++) {
      ibis.push(beatTimestamps[i] - beatTimestamps[i - 1]);
    }
    // Median IBI — more robust than mean
    const sorted = [...ibis].sort((a, b) => a - b);
    const medianIBI = sorted[Math.floor(sorted.length / 2)];
    bpm = Math.round(60 / medianIBI);

    // Confidence: fraction of IBIs within 20% of median
    const inliers = ibis.filter(d => Math.abs(d - medianIBI) / medianIBI < 0.2);
    confidence = parseFloat((inliers.length / ibis.length).toFixed(2));
  }

  ctx.close();
  onProgress('done', 100);

  console.log(`[BeatDetector] ${beatTimestamps.length} beats | BPM: ${bpm} | confidence: ${confidence}`);

  return { beats: beatTimestamps, bpm, confidence };
}

/**
 * Snaps an array of clip boundary times to the nearest detected beat.
 *
 * @param {number[]} clipBoundaries  - array of startTime values (seconds)
 * @param {number[]} beats           - beat timestamps from detectBeats()
 * @param {number}   snapWindowMs    - max snap distance in ms (default 150ms)
 * @returns {number[]}               - snapped boundary times
 */
export function snapTimestampsToBeat(clipBoundaries, beats, snapWindowMs = 150) {
  if (!beats || beats.length === 0) return clipBoundaries;
  const windowS = snapWindowMs / 1000;

  return clipBoundaries.map(t => {
    // Find nearest beat
    let closest = null;
    let closestDist = Infinity;
    for (const beat of beats) {
      const dist = Math.abs(beat - t);
      if (dist < closestDist) { closestDist = dist; closest = beat; }
    }
    // Only snap if within window
    return (closestDist <= windowS && closest !== null)
      ? parseFloat(closest.toFixed(3))
      : t;
  });
}

/**
 * Snaps caption startTimes to the nearest beat within snapWindowMs.
 * Beat-locked caption reveals are a hallmark of viral short-form content.
 *
 * @param {object[]} captionClips  - array of caption clip objects
 * @param {number[]} beats         - beat timestamps from detectBeats()
 * @param {number}   snapWindowMs  - max snap distance (default 80ms)
 * @returns {object[]}             - updated caption clips with beat-locked startTimes
 */
export function beatLockCaptions(captionClips, beats, snapWindowMs = 80) {
  if (!beats || beats.length === 0) return captionClips;
  const windowS = snapWindowMs / 1000;

  return captionClips.map(cap => {
    let closest = null;
    let closestDist = Infinity;
    for (const beat of beats) {
      const dist = Math.abs(beat - cap.startTime);
      if (dist < closestDist) { closestDist = dist; closest = beat; }
    }
    if (closestDist <= windowS && closest !== null) {
      // Snap startTime, preserve duration
      return { ...cap, startTime: parseFloat(closest.toFixed(3)) };
    }
    return cap;
  });
}
