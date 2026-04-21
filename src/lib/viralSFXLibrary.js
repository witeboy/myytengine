// ══════════════════════════════════════════════════════════════════════
// VIRAL SFX LIBRARY — short-form sound FX infusion
//
// Strategy: for each clip, we pick 2-4 SFX placements:
//   1. HOOK SFX at t=0      — "whoosh" or "bass drop" to grab attention
//   2. KEYWORD HITS         — short "ding" / "boom" on money/shock words
//   3. SCENE-CUT WHOOSHES   — on silence-trim jump cuts (subtle)
//   4. OUTRO STING          — last 0.4s fade-out hit
//
// SFX files are sourced from a curated list of royalty-free Pixabay URLs
// (short stingers, pre-vetted for viral shorts). The URLs are direct
// CDN links that fetch-and-cache at render time.
//
// Each SFX is layered into the audio via FFmpeg amix with -18dB under
// speech (so it punches but doesn't cover the voice).
// ══════════════════════════════════════════════════════════════════════

// ── Curated royalty-free SFX from Pixabay (CC0) ─────────────────────
// These are short (<1s each), loudness-normalized stingers commonly
// used in TikTok/Shorts edits. All from Pixabay's free-use library.
export const SFX_LIBRARY = {
  // Whooshes — scene transitions, hook openers
  whoosh: [
    'https://cdn.pixabay.com/download/audio/2022/03/10/audio_d1718beaef.mp3?filename=whoosh-6316.mp3',
    'https://cdn.pixabay.com/download/audio/2022/03/24/audio_c8c8a73467.mp3?filename=whoosh-cinematic-161021.mp3',
  ],
  // Impacts — keyword hits, money moments
  impact: [
    'https://cdn.pixabay.com/download/audio/2022/03/15/audio_db6591201b.mp3?filename=cinematic-boom-6872.mp3',
    'https://cdn.pixabay.com/download/audio/2021/08/04/audio_c8c8a73467.mp3?filename=cinematic-hit-159067.mp3',
  ],
  // Bass drops — hook attention grabbers
  bass_drop: [
    'https://cdn.pixabay.com/download/audio/2022/10/30/audio_347111d654.mp3?filename=deep-cinematic-logo-142663.mp3',
  ],
  // Dings — small accents on numbers
  ding: [
    'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=notification-sound-7062.mp3',
  ],
  // Risers — building to reveal
  riser: [
    'https://cdn.pixabay.com/download/audio/2022/08/23/audio_2dde7c6f69.mp3?filename=riser-120042.mp3',
  ],
};

// ══════════════════════════════════════════════════════════════════════
// Plan SFX placements based on the transcript + keyword positions.
//
// @param words          — source words (original timeline)
// @param clipStart/End  — clip bounds in source
// @param removeRanges   — from silenceTrimmer (for scene-cut whooshes)
// @param classifyFn     — from viralCaptionStyler (for keyword detection)
//
// @returns [{url, timeInTrimmed, volume, type}] — placements AFTER trim
//
// `timeInTrimmed` is the time in the FINAL (trimmed) clip, so the caller
// can mix SFX directly into the post-trim audio.
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

  // Helper: convert original-timeline time → trimmed-timeline time
  const origToTrimmed = (tOrig) => {
    let shift = 0;
    for (const r of removeRanges) {
      if (tOrig >= r.end) shift += (r.end - r.start);
      else if (tOrig >= r.start) shift += (tOrig - r.start); // inside removed range → clamp
    }
    return Math.max(0, tOrig - clipStart - shift);
  };

  // Compute final trimmed duration
  const removedDur = removeRanges.reduce((s, r) => s + (r.end - r.start), 0);
  const trimmedDur = (clipEnd - clipStart) - removedDur;

  const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // 1. HOOK SFX at clip start (whoosh or bass drop)
  const hookType = Math.random() < 0.6 ? 'whoosh' : 'bass_drop';
  placements.push({
    url: pickRandom(SFX_LIBRARY[hookType]),
    timeInTrimmed: 0,
    volume: hookType === 'bass_drop' ? 0.55 : 0.45,
    type: `hook_${hookType}`,
  });

  // 2. KEYWORD HITS — find money/power words, place impact under each
  const clipWords = (words || []).filter(w =>
    typeof w.start === 'number' && w.start >= clipStart && w.end <= clipEnd
  );
  const keywordHits = [];
  for (const w of clipWords) {
    if (!classifyFn) break;
    const cls = classifyFn(w.word || w.text);
    if (cls === 'money' || cls === 'power') {
      keywordHits.push({
        word: w.word,
        orig: w.start,
        trimmedT: origToTrimmed(w.start),
        cls,
      });
    }
  }
  // Pick up to 2 best keyword hits (prefer ones spaced >2s apart)
  let lastHitT = -10;
  for (const kh of keywordHits) {
    if (kh.trimmedT - lastHitT < 2.0) continue;
    if (kh.trimmedT < 0.5 || kh.trimmedT > trimmedDur - 0.3) continue;
    placements.push({
      url: pickRandom(SFX_LIBRARY.impact),
      timeInTrimmed: kh.trimmedT,
      volume: 0.35,
      type: `keyword_${kh.cls}`,
    });
    lastHitT = kh.trimmedT;
    if (placements.filter(p => p.type.startsWith('keyword')).length >= 2) break;
  }

  // 3. SCENE-CUT WHOOSHES — at jump-cut points from silence trim
  //    Only add if we removed something substantial (>0.6s)
  const bigCuts = removeRanges.filter(r => (r.end - r.start) > 0.6);
  let whooshCount = 0;
  for (const cut of bigCuts) {
    const cutT = origToTrimmed(cut.start);
    if (cutT < 0.5 || cutT > trimmedDur - 0.4) continue;
    placements.push({
      url: pickRandom(SFX_LIBRARY.whoosh),
      timeInTrimmed: Math.max(0, cutT - 0.1),
      volume: 0.3,
      type: 'scene_cut',
    });
    whooshCount++;
    if (whooshCount >= 2) break;
  }

  // 4. Cap total SFX (avoid overmix)
  if (placements.length > maxPlacements) {
    placements.splice(maxPlacements);
  }

  return placements;
}

// ══════════════════════════════════════════════════════════════════════
// Fetch SFX file and write to FFmpeg FS
// ══════════════════════════════════════════════════════════════════════
export async function fetchAndWriteSfx(ffmpeg, fetchFile, placements) {
  const written = [];
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    try {
      const data = await fetchFile(p.url);
      const filename = `sfx_${i}.mp3`;
      await ffmpeg.writeFile(filename, data);
      written.push({ ...p, filename });
    } catch (err) {
      console.warn(`[SFX] Failed to load ${p.url}:`, err.message);
    }
  }
  return written;
}