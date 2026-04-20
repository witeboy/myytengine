import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

// ══════════════════════════════════════════════════════════════════
// SILENCE + FILLER DETECTOR — For pre-upload cleanup
// Input:  AssemblyAI word-level timestamps (with disfluencies enabled)
// Output: cut-list [{start, end, reason}] the editor can apply
// Competes with: Descript, Gling
// ══════════════════════════════════════════════════════════════════

const FILLER_WORDS = new Set([
  'um', 'uh', 'umm', 'uhh', 'ah', 'er', 'erm',
  'like', 'you know', 'i mean', 'sort of', 'kind of',
  'basically', 'literally', 'actually', 'honestly',
  'right', 'okay', 'so yeah',
]);

// Multi-word fillers matched separately against adjacent words
const MULTI_WORD_FILLERS = [
  ['you', 'know'],
  ['i', 'mean'],
  ['sort', 'of'],
  ['kind', 'of'],
  ['so', 'yeah'],
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      words = [],
      silence_threshold_sec = 0.4,   // pauses longer than this are candidates
      silence_tighten_to_sec = 0.2,  // tighten to this much pause (0 = remove entirely)
      remove_fillers = true,
      aggressiveness = 'moderate',   // 'conservative' | 'moderate' | 'aggressive'
    } = await req.json();

    if (!words.length) return Response.json({ error: 'words[] required' }, { status: 400 });

    const cuts = [];
    let totalTrimmed = 0;

    // Adjust threshold by aggressiveness
    const thresholds = {
      conservative: { silence: 0.8, keepGap: 0.35 },
      moderate:     { silence: silence_threshold_sec, keepGap: silence_tighten_to_sec },
      aggressive:   { silence: 0.25, keepGap: 0.1 },
    };
    const { silence, keepGap } = thresholds[aggressiveness] || thresholds.moderate;

    // 1) SILENCE DETECTION — gaps between consecutive words
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1];
      const curr = words[i];
      const gap = curr.start - prev.end;
      if (gap > silence) {
        const cutStart = prev.end + keepGap;
        const cutEnd = curr.start - keepGap;
        if (cutEnd - cutStart > 0.05) {
          cuts.push({
            type: 'silence',
            start: Number(cutStart.toFixed(3)),
            end: Number(cutEnd.toFixed(3)),
            duration: Number((cutEnd - cutStart).toFixed(3)),
            reason: `Gap of ${gap.toFixed(2)}s`,
          });
          totalTrimmed += (cutEnd - cutStart);
        }
      }
    }

    // 2) FILLER WORD DETECTION
    if (remove_fillers) {
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const lower = (w.word || '').toLowerCase().replace(/[.,!?;:]/g, '');

        // Single-word filler
        if (FILLER_WORDS.has(lower)) {
          cuts.push({
            type: 'filler',
            start: Number(w.start.toFixed(3)),
            end: Number(w.end.toFixed(3)),
            duration: Number((w.end - w.start).toFixed(3)),
            word: lower,
            reason: `Filler word "${lower}"`,
          });
          totalTrimmed += (w.end - w.start);
          continue;
        }

        // Multi-word filler (look at next word)
        if (i + 1 < words.length) {
          const next = (words[i + 1].word || '').toLowerCase().replace(/[.,!?;:]/g, '');
          const match = MULTI_WORD_FILLERS.find(pair => pair[0] === lower && pair[1] === next);
          if (match) {
            const end = words[i + 1].end;
            cuts.push({
              type: 'filler',
              start: Number(w.start.toFixed(3)),
              end: Number(end.toFixed(3)),
              duration: Number((end - w.start).toFixed(3)),
              word: `${lower} ${next}`,
              reason: `Filler phrase "${lower} ${next}"`,
            });
            totalTrimmed += (end - w.start);
            i++; // skip next
          }
        }
      }
    }

    // Merge overlapping/adjacent cuts
    cuts.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const c of cuts) {
      const last = merged[merged.length - 1];
      if (last && c.start <= last.end + 0.05) {
        last.end = Math.max(last.end, c.end);
        last.duration = Number((last.end - last.start).toFixed(3));
        last.reason = `${last.reason} + ${c.reason}`;
      } else {
        merged.push({ ...c });
      }
    }

    const silenceCount = merged.filter(c => c.type === 'silence').length;
    const fillerCount = cuts.filter(c => c.type === 'filler').length;

    console.log(`[detectSilencesAndFillers] ${merged.length} cuts | ${silenceCount} silences | ${fillerCount} fillers | ${totalTrimmed.toFixed(1)}s saved`);

    return Response.json({
      success: true,
      cuts: merged,
      stats: {
        total_cuts: merged.length,
        silence_cuts: silenceCount,
        filler_cuts: fillerCount,
        total_seconds_trimmed: Number(totalTrimmed.toFixed(2)),
        aggressiveness,
      },
    });
  } catch (error) {
    console.error('detectSilencesAndFillers error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});