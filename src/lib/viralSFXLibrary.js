// ══════════════════════════════════════════════════════════════════════
// VIRAL SFX LIBRARY — synthesized in-browser (no network, no CORS)
//
// Generates short punchy SFX using Web Audio OfflineAudioContext:
//   • whoosh      — filtered noise sweep (transitions)
//   • impact      — low sine thump + noise crack (keyword hits)
//   • bass_drop   — sub-bass sine with pitch drop (hook opener)
//   • ding        — bell-like sine decay (number accents)
//
// Each returns a WAV file as Uint8Array — written directly into FFmpeg FS.
// This is instant (no network) and always works.
//
// Placement logic same as before: hook, keyword hits, scene-cut whooshes.
// ══════════════════════════════════════════════════════════════════════

// ── WAV encoder for Float32 buffer → WAV bytes ──────────────────────
function encodeWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;

  // Interleave channels into Int16 PCM
  const pcm = new Int16Array(length * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      pcm[i * numChannels + ch] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
  }

  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeStr = (offset, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);              // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  // Copy PCM
  new Int16Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}

// ── SFX synth using OfflineAudioContext ─────────────────────────────
const SR = 44100;

async function synthWhoosh() {
  const dur = 0.45;
  const ctx = new OfflineAudioContext(2, SR * dur, SR);
  // White-noise buffer
  const noiseBuf = ctx.createBuffer(1, SR * dur, SR);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  // Band-pass filter sweeping down
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(3000, 0);
  filter.frequency.exponentialRampToValueAtTime(300, dur);
  // Volume envelope (soft attack, quick decay)
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, 0);
  gain.gain.exponentialRampToValueAtTime(0.7, 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, dur);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(0);
  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

async function synthImpact() {
  const dur = 0.55;
  const ctx = new OfflineAudioContext(2, SR * dur, SR);
  // Low sine thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, 0);
  osc.frequency.exponentialRampToValueAtTime(40, 0.15);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.9, 0);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, 0.4);
  osc.connect(oscGain).connect(ctx.destination);
  // Noise crack on attack
  const noiseBuf = ctx.createBuffer(1, SR * 0.08, SR);
  const nData = noiseBuf.getChannelData(0);
  for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(0.5, 0);
  nGain.gain.exponentialRampToValueAtTime(0.0001, 0.08);
  noise.connect(nGain).connect(ctx.destination);
  osc.start(0); noise.start(0);
  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

async function synthBassDrop() {
  const dur = 0.8;
  const ctx = new OfflineAudioContext(2, SR * dur, SR);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, 0);
  osc.frequency.exponentialRampToValueAtTime(35, 0.6);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, 0);
  gain.gain.exponentialRampToValueAtTime(0.85, 0.08);
  gain.gain.setValueAtTime(0.85, 0.5);
  gain.gain.exponentialRampToValueAtTime(0.0001, dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(0);
  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

async function synthDing() {
  const dur = 0.35;
  const ctx = new OfflineAudioContext(2, SR * dur, SR);
  // Two sines for bell-like quality
  const freqs = [1200, 2400];
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(f === 1200 ? 0.4 : 0.2, 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(0);
  }
  const rendered = await ctx.startRendering();
  return encodeWav(rendered);
}

// ── Cache synthesized SFX (synth once per session) ──────────────────
const SFX_CACHE = {};

async function getSfx(type) {
  if (SFX_CACHE[type]) return SFX_CACHE[type];
  let data;
  switch (type) {
    case 'whoosh':    data = await synthWhoosh(); break;
    case 'impact':    data = await synthImpact(); break;
    case 'bass_drop': data = await synthBassDrop(); break;
    case 'ding':      data = await synthDing(); break;
    default:          data = await synthWhoosh();
  }
  SFX_CACHE[type] = data;
  return data;
}

// ══════════════════════════════════════════════════════════════════════
// Plan SFX placements based on transcript + keyword positions.
// Returns [{type, timeInTrimmed, volume}]
// ══════════════════════════════════════════════════════════════════════
export function planSfxPlacements({
  words = [],
  clipStart,
  clipEnd,
  removeRanges = [],
  classifyFn,
  maxPlacements = 5,
}) {
  const placements = [];

  // Convert original-timeline time → trimmed-timeline time
  const origToTrimmed = (tOrig) => {
    let shift = 0;
    for (const r of removeRanges) {
      if (tOrig >= r.end) shift += (r.end - r.start);
      else if (tOrig >= r.start) shift += (tOrig - r.start);
    }
    return Math.max(0, tOrig - clipStart - shift);
  };

  const removedDur = removeRanges.reduce((s, r) => s + (r.end - r.start), 0);
  const trimmedDur = (clipEnd - clipStart) - removedDur;

  // 1. HOOK SFX at t=0 (random: whoosh OR bass_drop)
  placements.push({
    type: Math.random() < 0.6 ? 'whoosh' : 'bass_drop',
    timeInTrimmed: 0,
    volume: 0.45,
    placement: 'hook',
  });

  // 2. KEYWORD HITS — money/power words → impact
  const clipWords = (words || []).filter(w =>
    typeof w.start === 'number' && w.start >= clipStart && w.end <= clipEnd
  );
  let lastHitT = -10;
  let keywordCount = 0;
  for (const w of clipWords) {
    if (!classifyFn || keywordCount >= 2) break;
    const cls = classifyFn(w.word || w.text);
    if (cls === 'money' || cls === 'power') {
      const trimmedT = origToTrimmed(w.start);
      if (trimmedT - lastHitT < 2.0) continue;
      if (trimmedT < 0.5 || trimmedT > trimmedDur - 0.4) continue;
      placements.push({
        type: 'impact',
        timeInTrimmed: trimmedT,
        volume: 0.4,
        placement: `keyword_${cls}`,
      });
      lastHitT = trimmedT;
      keywordCount++;
    } else if (cls === 'number' && keywordCount < 2) {
      const trimmedT = origToTrimmed(w.start);
      if (trimmedT - lastHitT < 2.5) continue;
      if (trimmedT < 0.5 || trimmedT > trimmedDur - 0.4) continue;
      placements.push({
        type: 'ding',
        timeInTrimmed: trimmedT,
        volume: 0.25,
        placement: 'number',
      });
      lastHitT = trimmedT;
      keywordCount++;
    }
  }

  // 3. SCENE-CUT WHOOSHES at big trim points
  const bigCuts = removeRanges.filter(r => (r.end - r.start) > 0.6);
  let whooshCount = 0;
  for (const cut of bigCuts) {
    const cutT = origToTrimmed(cut.start);
    if (cutT < 0.5 || cutT > trimmedDur - 0.4) continue;
    placements.push({
      type: 'whoosh',
      timeInTrimmed: Math.max(0, cutT - 0.1),
      volume: 0.3,
      placement: 'scene_cut',
    });
    whooshCount++;
    if (whooshCount >= 2) break;
  }

  if (placements.length > maxPlacements) placements.splice(maxPlacements);
  return placements;
}

// ══════════════════════════════════════════════════════════════════════
// Synthesize + write SFX files to FFmpeg FS
// Returns array of {filename, timeInTrimmed, volume, type}
// ══════════════════════════════════════════════════════════════════════
export async function fetchAndWriteSfx(ffmpeg, _fetchFile, placements) {
  const written = [];
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    try {
      const wavData = await getSfx(p.type);
      const filename = `sfx_${i}.wav`;
      await ffmpeg.writeFile(filename, wavData);
      written.push({ ...p, filename });
    } catch (err) {
      console.warn(`[SFX] Failed to synthesize ${p.type}:`, err.message);
    }
  }
  return written;
}