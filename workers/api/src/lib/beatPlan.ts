// Director-led scene segmentation.
//
// The breakdown used to cut a new scene every seven words. That is arbitrary: it gave a
// 2,500-word script 432 scenes, a cut every 2.4 seconds, whether the moment was a quiet
// realisation or a panic. Scenes should break where the story turns — a change of
// emotional tone, a new argument, a piece of evidence landing, a metaphor that has to
// evolve — and the number of scenes should fall out of that, not be decided in advance.
//
// HOW THE AI IS KEPT HONEST
// -------------------------
// The model is never asked to hand back script text: it returns the SENTENCE NUMBER each
// beat starts at, plus the beat's name, pacing and visual intent. We slice the real
// sentences ourselves, so no line can be dropped, duplicated or paraphrased — the failure
// mode that made earlier breakdowns lose parts of the script.

export interface RawBeat {
  start_sentence?: unknown;
  emotional_beat_name?: unknown;
  pacing_and_momentum?: unknown;
  directors_vision?: unknown;
}

export interface Beat {
  /** 0-based, inclusive. */
  startIndex: number;
  /** 0-based, exclusive. */
  endIndex: number;
  name: string;
  pacing: string;
  vision: string;
}

export interface SceneBeat {
  narration_text: string;
  word_count: number;
  angle_index: number;
  total_angles: number;
  is_multi_angle: boolean;
  beat_name: string;
  pacing: string;
  directors_vision: string;
}

const wordsIn = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Turns whatever the model returned into beats that cover every sentence exactly once,
 * in order. Out-of-range, duplicate and out-of-order starts are discarded rather than
 * trusted, and the first beat always starts at the first sentence.
 */
export function normalizeBeats(raw: RawBeat[] | null | undefined, sentenceCount: number): Beat[] {
  if (sentenceCount <= 0) return [];

  const seen = new Set<number>();
  const starts: Array<{ at: number; beat: RawBeat }> = [];
  for (const beat of Array.isArray(raw) ? raw : []) {
    const n = Number(beat?.start_sentence);
    if (!Number.isFinite(n)) continue;
    const at = Math.floor(n) - 1; // the model counts from 1
    if (at < 0 || at >= sentenceCount || seen.has(at)) continue;
    seen.add(at);
    starts.push({ at, beat });
  }
  starts.sort((a, b) => a.at - b.at);

  // Everything before the first break still has to belong to a scene.
  if (!starts.length || starts[0].at !== 0) {
    starts.unshift({ at: 0, beat: (starts[0]?.beat as RawBeat) || {} });
  }

  return starts.map((entry, i) => ({
    startIndex: entry.at,
    endIndex: i + 1 < starts.length ? starts[i + 1].at : sentenceCount,
    name: String(entry.beat?.emotional_beat_name || '').trim() || `Beat ${i + 1}`,
    pacing: String(entry.beat?.pacing_and_momentum || '').trim(),
    vision: String(entry.beat?.directors_vision || '').trim(),
  })).filter(b => b.endIndex > b.startIndex);
}

/**
 * Words of narration per shot, taken from the director's own pacing note. A frantic beat
 * cuts fast; a heavy one is allowed to hold.
 */
export function wordsPerShot(pacing: string): number {
  const note = (pacing || '').toLowerCase();
  if (/fast|rapid|chaotic|erratic|urgent|frantic|panic|staccato|accelerat|breathless/.test(note)) return 9;
  if (/slow|heavy|linger|still|quiet|sombre|somber|solemn|mournful|reflective|hold|dwell|weight/.test(note)) return 22;
  return 14;
}

/** Split a beat's sentences into `count` contiguous groups of roughly equal length. */
function groupSentences(sentences: string[], count: number): string[][] {
  if (count <= 1 || sentences.length <= 1) return [sentences];
  const total = sentences.reduce((sum, s) => sum + wordsIn(s), 0);
  const target = total / count;
  const groups: string[][] = [];
  let current: string[] = [];
  let running = 0;

  for (let i = 0; i < sentences.length; i++) {
    current.push(sentences[i]);
    running += wordsIn(sentences[i]);
    const groupsLeft = count - groups.length - 1;
    const sentencesLeft = sentences.length - i - 1;
    // Close this group when it has its share — but never leave later groups empty.
    if (groupsLeft > 0 && (running >= target || sentencesLeft <= groupsLeft)) {
      groups.push(current);
      current = [];
      running = 0;
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

/**
 * Beats to shots. Each beat becomes as many shots as its own length and pacing justify —
 * a long, frantic beat gets several, a short quiet one gets a single held image. A beat
 * whose shots outnumber its sentences covers the line from more than one camera angle.
 */
/**
 * No single scene may hold more narration than this. A long beat with few shots left one
 * image on screen for nearly half a minute; at ~150 words a minute this caps a scene at
 * about thirteen seconds.
 */
const MAX_WORDS_PER_SCENE = 32;

export function beatsToSceneBeats(beats: Beat[], sentences: string[], maxShotsPerBeat = 12): SceneBeat[] {
  const out: SceneBeat[] = [];

  for (const beat of beats) {
    const own = sentences.slice(beat.startIndex, beat.endIndex).filter(s => s && s.trim());
    if (!own.length) continue;

    const words = own.reduce((sum, s) => sum + wordsIn(s), 0);
    const shots = Math.max(1, Math.min(maxShotsPerBeat, Math.round(words / wordsPerShot(beat.pacing)) || 1));

    const meta = { beat_name: beat.name, pacing: beat.pacing, directors_vision: beat.vision };

    if (shots <= own.length) {
      for (const group of groupSentences(own, shots)) {
        const text = group.join(' ');
        const groupWords = wordsIn(text);

        // A group that still runs long is split again — by sentence where it can be, and
        // otherwise covered from several angles, so no image is held too long.
        if (groupWords > MAX_WORDS_PER_SCENE) {
          const pieces = Math.ceil(groupWords / MAX_WORDS_PER_SCENE);
          if (group.length > 1) {
            for (const sub of groupSentences(group, Math.min(pieces, group.length))) {
              const subText = sub.join(' ');
              out.push({ narration_text: subText, word_count: wordsIn(subText), angle_index: 0, total_angles: 1, is_multi_angle: false, ...meta });
            }
          } else {
            for (let a = 0; a < pieces; a++) {
              out.push({ narration_text: text, word_count: groupWords, angle_index: a, total_angles: pieces, is_multi_angle: pieces > 1, ...meta });
            }
          }
          continue;
        }

        out.push({ narration_text: text, word_count: groupWords, angle_index: 0, total_angles: 1, is_multi_angle: false, ...meta });
      }
      continue;
    }

    // More shots than sentences: give the extra shots to the longest lines as angles.
    const extra = shots - own.length;
    const order = own.map((s, i) => ({ i, w: wordsIn(s) })).sort((a, b) => b.w - a.w);
    const anglesFor = new Map<number, number>(own.map((_, i) => [i, 1]));
    for (let k = 0; k < extra; k++) {
      const target = order[k % order.length].i;
      anglesFor.set(target, (anglesFor.get(target) || 1) + 1);
    }
    own.forEach((sentence, i) => {
      const total = anglesFor.get(i) || 1;
      for (let a = 0; a < total; a++) {
        out.push({
          narration_text: sentence,
          word_count: wordsIn(sentence),
          angle_index: a,
          total_angles: total,
          is_multi_angle: total > 1,
          ...meta,
        });
      }
    });
  }

  return out;
}
