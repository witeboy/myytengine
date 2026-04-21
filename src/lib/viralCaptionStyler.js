// ══════════════════════════════════════════════════════════════════════
// VIRAL CAPTION STYLER — Hormozi/CapCut-grade word-level ASS captions
//
// Builds an .ass subtitle file that:
//   • Splits captions into 1–3 word punchy chunks (based on speech pace)
//   • Emits ONE Dialogue line per chunk (no flicker)
//   • Animates a per-word highlight using ASS \t(ms,ms,tags) transforms
//   • Colors keywords (money, numbers, power words) in a DIFFERENT accent
//   • Pop-in bounce entrance on each chunk
//   • Positions at 58% vertical (just above center — above mouth, below UI)
//   • Massive (14% of frame height) with heavy stroke + shadow for punch
// ══════════════════════════════════════════════════════════════════════

// ── Time formatting for ASS (H:MM:SS.cs) ────────────────────────────
function assTime(sec) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec - Math.floor(sec)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ── Escape ASS-reserved characters in spoken text ──────────────────
function assEscape(text) {
  return String(text).replace(/[{}\\]/g, '').replace(/\n/g, ' ');
}

// ══════════════════════════════════════════════════════════════════════
// KEYWORD DETECTION — words that should get an accent color (GREEN/RED)
//
// Categories:
//   money    — $10, $1M, 50%, million, billion, dollars, cash, rich
//   number   — any bare number (great for "3 steps", "7 ways")
//   power    — shock/curiosity words (never, secret, insane, crazy)
//   question — who/what/why/how (for question hooks)
//
// Keywords get rendered in ACCENT color (default: bright green #00FF88)
// instead of the neutral primary (white), in ADDITION to the per-word
// yellow highlight when spoken.
// ══════════════════════════════════════════════════════════════════════
const POWER_WORDS = new Set([
  'never', 'always', 'secret', 'insane', 'crazy', 'shocking', 'wild', 'hidden',
  'truth', 'exposed', 'destroyed', 'finally', 'immediately', 'literally',
  'biggest', 'worst', 'best', 'ultimate', 'proven', 'guaranteed', 'forever',
  'impossible', 'obvious', 'wrong', 'right', 'stop', 'must', 'need',
]);

const QUESTION_WORDS = new Set(['who', 'what', 'why', 'how', 'when', 'where']);

export function classifyWord(raw) {
  const w = String(raw).toLowerCase().replace(/[^a-z0-9$%]/g, '');
  if (!w) return 'normal';

  // Money patterns: $10, $1m, $1.5k, 50%, 3x
  if (/^\$[\d.,]+[kmb]?$/i.test(raw) || /^\d+%$/.test(raw) || /^\d+x$/i.test(raw)) {
    return 'money';
  }
  // Money keywords
  if (['million', 'billion', 'thousand', 'dollars', 'cash', 'money', 'rich', 'broke', 'wealthy', 'profit', 'revenue', 'salary', 'income'].includes(w)) {
    return 'money';
  }
  // Pure numbers (and number-words)
  if (/^\d+$/.test(raw) || ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'hundred', 'zero'].includes(w)) {
    return 'number';
  }
  // Power words
  if (POWER_WORDS.has(w)) return 'power';
  // Question words (only if at chunk start — handled by caller)
  if (QUESTION_WORDS.has(w)) return 'question';
  return 'normal';
}

// ══════════════════════════════════════════════════════════════════════
// PACE-AWARE CHUNKING
//
// Groups words into caption chunks. Chunk size adapts to speech pace:
//   • Fast talker (<300ms/word avg) → max 2 words per chunk
//   • Medium (300-450ms/word)       → max 3 words
//   • Slow (>450ms/word)            → max 4 words
// Also breaks on natural punctuation.
// ══════════════════════════════════════════════════════════════════════
function chunkWordsByPace(words) {
  if (!words.length) return [];

  const avgWordDur = words.reduce((s, w) => s + (w.end - w.start), 0) / words.length;
  const maxWords = avgWordDur < 0.3 ? 2 : avgWordDur < 0.45 ? 3 : 4;
  const maxChunkDur = 1.8;

  const chunks = [];
  let current = [];
  let chunkStart = null;

  for (const w of words) {
    if (current.length === 0) chunkStart = w.start;
    current.push(w);
    const chunkDur = w.end - chunkStart;
    const hasEndPunct = /[.!?,]$/.test(w.word);

    if (current.length >= maxWords || chunkDur >= maxChunkDur || hasEndPunct) {
      chunks.push({
        start: current[0].start,
        end: current[current.length - 1].end,
        words: current,
      });
      current = [];
    }
  }
  if (current.length) {
    chunks.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      words: current,
    });
  }
  return chunks;
}

// ══════════════════════════════════════════════════════════════════════
// STYLE PRESETS — each defines fonts, colors, sizes, positioning
//
// ASS colors use &HBBGGRR& (reverse byte order from hex RGB).
// Font sizes are in ASS units (PlayResY = frame height, so ~14% of height).
// MarginV pushes UP from bottom in the 1920h frame.
//   → 58% vertical center = marginV of (1920 * 0.42) = ~806
// ══════════════════════════════════════════════════════════════════════
const STYLE_PRESETS = {
  // "Hormozi Pro" — white + yellow active + GREEN money words
  hormozi_pro: {
    fontName: 'Arial Black',
    fontSize: 130,
    primary:    '&H00FFFFFF',  // white (normal word)
    active:     '&H0000FFFF',  // yellow (actively spoken)
    moneyColor: '&H0088FF00',  // bright green $ words
    powerColor: '&H000099FF',  // orange power words
    numberColor:'&H00FFAA00',  // cyan-ish for numbers
    outline:    '&H00000000',  // black stroke
    back:       '&H80000000',  // translucent black shadow
    outlineW:   10,
    shadowW:    4,
    bold:       -1,
    alignment:  5,             // centered in frame (numpad 5)
    marginV:    0,             // alignment=5 ignores marginV for centering
    popScale:   120,           // entrance bounce scale %
    posY:       0.58,          // vertical center position (fraction of height)
  },
  // "Beast Mode" — Impact, massive, red active word
  beast: {
    fontName: 'Impact',
    fontSize: 145,
    primary:    '&H00FFFFFF',
    active:     '&H000000FF',  // red
    moneyColor: '&H0000FF00',  // green
    powerColor: '&H0000FFFF',  // yellow
    numberColor:'&H000000FF',  // red
    outline:    '&H00000000',
    back:       '&H80000000',
    outlineW:   12,
    shadowW:    6,
    bold:       -1,
    alignment:  5,
    marginV:    0,
    popScale:   125,
    posY:       0.55,
  },
  // "TikTok Native" — bold sans, tighter, above mouth
  tiktok: {
    fontName: 'Arial Black',
    fontSize: 105,
    primary:    '&H00FFFFFF',
    active:     '&H0000FFFF',
    moneyColor: '&H0088FF00',
    powerColor: '&H000099FF',
    numberColor:'&H00FFAA00',
    outline:    '&H00000000',
    back:       '&H60000000',
    outlineW:   7,
    shadowW:    3,
    bold:       -1,
    alignment:  5,
    marginV:    0,
    popScale:   115,
    posY:       0.62,
  },
  // "Minimal" — clean, small, single accent
  minimal: {
    fontName: 'Arial',
    fontSize: 78,
    primary:    '&H00FFFFFF',
    active:     '&H00FFFF00',  // cyan
    moneyColor: '&H00FFFF00',
    powerColor: '&H00FFFFFF',
    numberColor:'&H00FFFF00',
    outline:    '&H00000000',
    back:       '&H00000000',
    outlineW:   4,
    shadowW:    2,
    bold:       0,
    alignment:  5,
    marginV:    0,
    popScale:   108,
    posY:       0.65,
  },
};

export const CAPTION_STYLE_KEYS = Object.keys(STYLE_PRESETS);

// ══════════════════════════════════════════════════════════════════════
// MAIN: build the full .ass file content
// ══════════════════════════════════════════════════════════════════════
export function buildViralAssFile({
  words,
  clipStart,
  clipDuration,
  style = 'hormozi_pro',
  videoWidth = 1080,
  videoHeight = 1920,
  timeShifts = null, // optional: [{t: origSec, shift: deltaSec}] from silence-trim
}) {
  const preset = STYLE_PRESETS[style] || STYLE_PRESETS.hormozi_pro;

  // Apply time shifts from silence-trimmer (so captions stay in sync after cuts)
  const applyShift = (t) => {
    if (!timeShifts || !timeShifts.length) return t;
    let shift = 0;
    for (const s of timeShifts) {
      if (t >= s.t) shift = s.shift;
      else break;
    }
    return Math.max(0, t - shift);
  };

  // Filter + shift words into clip timeline (0 .. clipDuration)
  const shifted = (words || [])
    .filter(w =>
      typeof w.start === 'number' &&
      typeof w.end === 'number' &&
      w.end > clipStart &&
      w.start < clipStart + clipDuration
    )
    .map(w => {
      const origStart = Math.max(clipStart, w.start);
      const origEnd = Math.min(clipStart + clipDuration, w.end);
      return {
        word: (w.word || w.text || '').trim(),
        start: applyShift(origStart - clipStart),
        end: applyShift(origEnd - clipStart),
      };
    })
    .filter(w => w.word && w.end > w.start);

  const chunks = chunkWordsByPace(shifted);

  // ── ASS header ─────────────────────────────────────────────────
  // alignment=5 is numpad-5 (center-middle of frame). We override with
  // an explicit \pos(x,y) per-line to set the vertical position.
  const posX = Math.round(videoWidth / 2);
  const posY = Math.round(videoHeight * preset.posY);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${preset.fontName},${preset.fontSize},${preset.primary},${preset.primary},${preset.outline},${preset.back},${preset.bold},0,0,0,100,100,0,0,1,${preset.outlineW},${preset.shadowW},${preset.alignment},40,40,${preset.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // ── Per-chunk dialogue lines ────────────────────────────────────
  // ONE line per chunk, spanning the full chunk duration.
  // Per-word highlight animates via \t(ms1,ms2,tags) — NO flicker.
  //
  // Structure per word:
  //   {baseColor}{\t(wordIn, wordIn+60, activeColor, scale up)}
  //   {\t(wordOut, wordOut+60, baseColor, scale back)}WORD
  //
  // Entrance: first 180ms of the chunk, scale 80→popScale→100.
  const lines = [];
  for (const chunk of chunks) {
    const chunkStart = chunk.start;
    const chunkEnd = chunk.end;
    const chunkDurMs = Math.round((chunkEnd - chunkStart) * 1000);

    // Entrance pop: scale 80% → 100% over first 180ms
    const entrance =
      `{\\fscx80\\fscy80\\alpha&HFF&` +
      `\\t(0,120,\\fscx${preset.popScale}\\fscy${preset.popScale}\\alpha&H00&)` +
      `\\t(120,200,\\fscx100\\fscy100)}`;

    const parts = chunk.words.map((w) => {
      const t = assEscape(w.word.toUpperCase());
      const cls = classifyWord(w.word);

      // Base color for this word (keyword-colored or primary white)
      let baseColor = preset.primary;
      if (cls === 'money') baseColor = preset.moneyColor;
      else if (cls === 'power') baseColor = preset.powerColor;
      else if (cls === 'number') baseColor = preset.numberColor;

      const relStartMs = Math.max(0, Math.round((w.start - chunkStart) * 1000));
      const relEndMs = Math.max(relStartMs + 50, Math.round((w.end - chunkStart) * 1000));
      const popOutMs = Math.min(chunkDurMs, relEndMs + 60);

      // Set base color, then animate to active (yellow/red) on speak,
      // then back to base color after speak. Scale pop during active.
      return (
        `{\\c${baseColor}\\fscx100\\fscy100}` +
        `{\\t(${relStartMs},${relStartMs + 70},\\c${preset.active}\\fscx115\\fscy115)}` +
        `{\\t(${relEndMs},${popOutMs},\\c${baseColor}\\fscx100\\fscy100)}` +
        t
      );
    });

    const text = `{\\pos(${posX},${posY})}${entrance}` + parts.join(' ');
    lines.push(
      `Dialogue: 0,${assTime(chunkStart)},${assTime(chunkEnd)},Default,,0,0,0,,${text}`
    );
  }

  return header + lines.join('\n') + '\n';
}