import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AudioLines, Check, AlertCircle } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// BEAT SYNC BUTTON v7 — Full ASR → Word-Match → Persist pipeline
// ══════════════════════════════════════════════════════════════════
//
// THE HOLY GRAIL: media start/end times are EXCLUSIVELY derived
// from word-level ASR timestamps. No formulas. No distributions.
//
// Flow:
//   1. Measure voiceover duration (HTML5 Audio API)
//   2. Submit audio to AssemblyAI via submitTranscription
//   3. Poll for completion via pollTranscription (browser-side loop)
//   4. Run alignScenesToASR() — fuzzy word-match per scene
//      → scene.startTime = ASR timestamp of first matched word
//      → scene.endTime   = ASR timestamp of last matched word
//      → scene.duration  = endTime - startTime (with gap stitching)
//   5. Write duration_seconds per scene to DB (parallel batches)
//   6. Write beat_durations + beat_start_times to ProductionSettings
//   7. Call onSynced() so the Timeline refreshes
//
// Props:
//   projectId    — string
//   voiceoverUrl — string (ProductionSettings.voiceover_url)
//   onSynced     — () => void  (called after successful sync)
// ══════════════════════════════════════════════════════════════════

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 180000; // 3 min

// ── Inline copies of the alignment utilities ───────────────────────
// (avoids a dynamic import that may fail in some Base44 environments)

function normalizeWord(w) {
  if (!w) return '';
  return w
    .toLowerCase()
    .replace(/[^a-z0-9']/g, '')
    .replace(/^'+|'+$/g, '');
}

function wordsMatch(scriptWord, asrWord) {
  const a = normalizeWord(scriptWord);
  const b = normalizeWord(asrWord);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3) {
    if (a.startsWith(b) || b.startsWith(a)) return true;
  }
  if (Math.abs(a.length - b.length) <= 1) {
    let diffs = 0;
    const longer  = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    let si = 0;
    for (let li = 0; li < longer.length && diffs <= 1; li++) {
      if (shorter[si] === longer[li]) { si++; }
      else { diffs++; if (a.length === b.length) si++; }
    }
    if (diffs <= 1) return true;
  }
  return false;
}

function getSceneWords(scene) {
  const text = (scene.narration_text || scene.voiceover_text || '').trim();
  if (!text) return [];
  return text.split(/\s+/).filter(Boolean);
}

/**
 * alignScenesToASR
 * ────────────────
 * Matches each scene's narration words to ASR word timestamps in order.
 * Returns [{sceneId, sceneNumber, startTime, endTime, duration, ...}]
 */
function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return [];

  const sceneScriptWords = scenes.map(s => getSceneWords(s));
  const MAX_PAD  = 0.5;
  const MIN_EMPTY = 0.8;
  const MIN_DURATION = 0.5;

  // ── Step 1: Sequential word-anchored matching ──────────────────
  let asrCursor = 0;
  const sceneMatches = [];

  for (let si = 0; si < scenes.length; si++) {
    const scriptWords = sceneScriptWords[si];

    if (scriptWords.length === 0) {
      sceneMatches.push({ firstAsrIdx: -1, lastAsrIdx: -1, matchedCount: 0, empty: true });
      continue;
    }

    let firstMatchedAsrIdx = -1;
    let lastMatchedAsrIdx  = -1;
    let scriptIdx   = 0;
    let matchedCount = 0;
    const maxAsrConsume = Math.min(
      scriptWords.length * 4 + 15,
      asrWords.length - asrCursor
    );
    let localAsrIdx = 0;

    while (scriptIdx < scriptWords.length && localAsrIdx < maxAsrConsume) {
      const asrIdx = asrCursor + localAsrIdx;
      if (asrIdx >= asrWords.length) break;

      const asrW    = asrWords[asrIdx].word;
      const scriptW = scriptWords[scriptIdx];

      if (wordsMatch(scriptW, asrW)) {
        if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = asrIdx;
        lastMatchedAsrIdx = asrIdx;
        matchedCount++;
        scriptIdx++;
        localAsrIdx++;
      } else {
        // Try skipping up to 3 ASR words
        let found = false;
        for (let skip = 1; skip <= 3 && localAsrIdx + skip < maxAsrConsume; skip++) {
          const ci = asrIdx + skip;
          if (ci < asrWords.length && wordsMatch(scriptW, asrWords[ci].word)) {
            localAsrIdx += skip;
            if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = asrCursor + localAsrIdx;
            lastMatchedAsrIdx = asrCursor + localAsrIdx;
            matchedCount++;
            scriptIdx++;
            localAsrIdx++;
            found = true;
            break;
          }
        }
        if (!found) {
          // Try skipping up to 3 script words
          let sfound = false;
          for (let skip = 1; skip <= 3 && scriptIdx + skip < scriptWords.length; skip++) {
            if (wordsMatch(scriptWords[scriptIdx + skip], asrW)) {
              scriptIdx += skip;
              if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = asrIdx;
              lastMatchedAsrIdx = asrIdx;
              matchedCount++;
              scriptIdx++;
              localAsrIdx++;
              sfound = true;
              break;
            }
          }
          if (!sfound) localAsrIdx++;
        }
      }
    }

    if (lastMatchedAsrIdx >= 0) {
      asrCursor = lastMatchedAsrIdx + 1;
      sceneMatches.push({
        firstMatchedAsrIdx: firstMatchedAsrIdx >= 0 ? firstMatchedAsrIdx : asrCursor,
        lastAsrIdx: lastMatchedAsrIdx,
        matchedCount,
        empty: false,
        fallback: false,
        matchRate: matchedCount / scriptWords.length,
      });
    } else {
      sceneMatches.push({ firstAsrIdx: -1, lastAsrIdx: -1, matchedCount: 0, empty: false, fallback: true });
    }
  }

  // ── Step 2: Extract authoritative timestamps ───────────────────
  const results = scenes.map((scene, idx) => {
    const match = sceneMatches[idx];
    const wc = sceneScriptWords[idx].length;

    if (match.empty || (match.firstAsrIdx === -1 && match.lastAsrIdx === -1 && !match.firstMatchedAsrIdx)) {
      return {
        sceneId: scene.id, sceneNumber: scene.scene_number,
        startTime: null, endTime: null, duration: 0,
        matchScore: 0, empty: match.empty || false, fallback: match.fallback || false,
        wordCount: wc, speechStart: null, speechEnd: null,
      };
    }

    const firstIdx = Math.max(0, Math.min(match.firstMatchedAsrIdx ?? 0, asrWords.length - 1));
    const lastIdx  = Math.max(0, Math.min(match.lastAsrIdx, asrWords.length - 1));
    const speechStart = asrWords[firstIdx].start;
    const speechEnd   = asrWords[lastIdx].end;

    return {
      sceneId: scene.id, sceneNumber: scene.scene_number,
      startTime: speechStart, endTime: speechEnd,
      duration: Math.max(MIN_DURATION, speechEnd - speechStart),
      matchScore: match.matchRate || 0,
      empty: false, fallback: false, wordCount: wc,
      speechStart, speechEnd, matchedCount: match.matchedCount,
    };
  });

  // ── Step 3: Stitch gaps symmetrically (max MAX_PAD per side) ───
  const firstSpoken = results.find(r => !r.empty && !r.fallback && r.speechStart !== null);
  if (firstSpoken) {
    const lead = firstSpoken.speechStart;
    firstSpoken.startTime = Math.max(0, firstSpoken.speechStart - Math.min(lead, MAX_PAD));
  }

  const lastSpoken = [...results].reverse().find(r => !r.empty && !r.fallback && r.speechEnd !== null);
  if (lastSpoken) {
    const trail = totalAudioDuration - lastSpoken.speechEnd;
    lastSpoken.endTime = Math.min(totalAudioDuration, lastSpoken.speechEnd + Math.min(trail, MAX_PAD));
  }

  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.empty || curr.fallback || next.empty || next.fallback) continue;
    if (curr.speechEnd === null || next.speechStart === null) continue;

    const gap = next.speechStart - curr.speechEnd;
    if (gap > 0) {
      const half = gap / 2;
      curr.endTime   = curr.speechEnd  + Math.min(half, MAX_PAD);
      next.startTime = next.speechStart - Math.min(half, MAX_PAD);
      if (curr.endTime < next.startTime) {
        const mid = (curr.endTime + next.startTime) / 2;
        curr.endTime = mid;
        next.startTime = mid;
      }
    } else {
      const boundary = (curr.speechEnd + next.speechStart) / 2;
      curr.endTime = boundary;
      next.startTime = boundary;
    }
  }

  // Fill empty/fallback scenes
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r.empty && !r.fallback) continue;
    const prev = i > 0 ? results[i - 1] : null;
    const next = i < results.length - 1 ? results[i + 1] : null;
    if (prev?.endTime != null && next?.startTime != null) {
      const avail = next.startTime - prev.endTime;
      r.startTime = prev.endTime;
      r.endTime   = prev.endTime + (avail >= MIN_EMPTY ? Math.min(MIN_EMPTY, avail) : Math.max(0, avail));
    } else if (prev?.endTime != null) {
      r.startTime = prev.endTime;
      r.endTime   = Math.min(prev.endTime + MIN_EMPTY, totalAudioDuration);
    } else if (next?.startTime != null) {
      r.endTime   = next.startTime;
      r.startTime = Math.max(0, next.startTime - MIN_EMPTY);
    } else {
      r.startTime = 0; r.endTime = MIN_EMPTY;
    }
  }

  // Anchor first to 0, last to totalAudioDuration
  if (results.length > 0 && results[0].startTime != null && results[0].startTime > 0)
    results[0].startTime = 0;
  const last = results[results.length - 1];
  if (last?.endTime != null && last.endTime < totalAudioDuration)
    last.endTime = totalAudioDuration;

  // Enforce continuity + minimums + round
  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    const next = results[i + 1];
    if (curr.endTime != null && next.startTime != null) {
      if (next.startTime > curr.endTime + 0.002) curr.endTime = next.startTime;
      else if (curr.endTime > next.startTime + 0.002) next.startTime = curr.endTime;
    }
  }

  results.forEach((r, i) => {
    if (r.startTime == null || r.endTime == null) return;
    if (r.endTime - r.startTime < MIN_DURATION) {
      r.endTime = r.startTime + MIN_DURATION;
      if (i + 1 < results.length && results[i + 1].startTime != null) {
        if (results[i + 1].startTime < r.endTime) results[i + 1].startTime = r.endTime;
      }
    }
    r.startTime = Math.round(r.startTime * 1000) / 1000;
    r.endTime   = Math.round(r.endTime   * 1000) / 1000;
    r.duration  = Math.round((r.endTime - r.startTime) * 1000) / 1000;
  });

  return results;
}

// ── Main component ─────────────────────────────────────────────────
export default function AutoSyncButton({ projectId, voiceoverUrl, onSynced }) {
  const [phase, setPhase]       = useState(null);   // null | 'measuring' | 'submitting' | 'polling' | 'aligning' | 'saving' | 'done' | 'error'
  const [progress, setProgress] = useState('');
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const abortRef = useRef(false);

  const syncing = phase !== null && phase !== 'done' && phase !== 'error';

  // ── Measure audio duration via HTML5 Audio API ─────────────────
  const measureAudioDuration = (url) => new Promise((resolve) => {
    const audio = new Audio();
    const timeout = setTimeout(() => resolve(0), 8000);
    audio.addEventListener('loadedmetadata', () => {
      clearTimeout(timeout);
      resolve(isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0);
    });
    audio.addEventListener('error', () => { clearTimeout(timeout); resolve(0); });
    audio.preload = 'metadata';
    audio.src = url;
  });

  // ── ASR submit/poll (browser-side) ─────────────────────────────
  const transcribeVoiceover = async (url) => {
    // Submit
    const submitRes = await base44.functions.invoke('submitTranscription', { voiceover_url: url });
    const submitData = submitRes?.data ?? submitRes;
    if (!submitData?.success || !submitData?.transcript_id)
      throw new Error(submitData?.error || 'Failed to submit transcription');

    const transcriptId = submitData.transcript_id;

    // Poll
    const start = Date.now();
    let pollCount = 0;
    while (true) {
      if (abortRef.current) throw new Error('Cancelled');
      if (Date.now() - start > POLL_TIMEOUT_MS) throw new Error('Transcription timed out after 3 minutes');

      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      pollCount++;
      setProgress(`Recognizing speech… (${pollCount * 3}s)`);

      const pollRes  = await base44.functions.invoke('pollTranscription', { transcript_id: transcriptId });
      const pollData = pollRes?.data ?? pollRes;

      if (pollData?.status === 'completed') {
        return {
          success:    true,
          words:      pollData.words,      // [{word, start, end}] — already in seconds
          word_count: pollData.word_count,
          confidence: pollData.confidence,
          duration:   pollData.duration,
        };
      }
      if (pollData?.status === 'error') {
        throw new Error(pollData.error || 'Transcription failed');
      }
      // status === 'processing' | 'queued' — keep polling
    }
  };

  // ── Main sync flow ─────────────────────────────────────────────
  const handleSync = async () => {
    if (!voiceoverUrl || syncing) return;

    abortRef.current = false;
    setPhase('measuring');
    setResult(null);
    setError(null);

    try {
      // ── 1. Require voiceover ───────────────────────────────────
      if (!voiceoverUrl) throw new Error('No voiceover audio. Add a voiceover first.');

      // ── 2. Measure audio duration ──────────────────────────────
      setProgress('Measuring audio duration…');
      const audioDuration = await measureAudioDuration(voiceoverUrl);
      if (!audioDuration || audioDuration <= 0)
        throw new Error('Could not measure audio duration. Check the voiceover URL.');

      // ── 3. Load scenes from DB ─────────────────────────────────
      setPhase('submitting');
      setProgress('Loading scenes…');
      const [allScenes, allProdSettings] = await Promise.all([
        base44.asServiceRole
          ? base44.asServiceRole.entities.Scenes.filter({ project_id: projectId })
          : base44.entities.Scenes.filter({ project_id: projectId }),
        base44.asServiceRole
          ? base44.asServiceRole.entities.ProductionSettings.filter({ project_id: projectId })
          : base44.entities.ProductionSettings.filter({ project_id: projectId }),
      ]);

      const scenes = allScenes.sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
      const prod   = allProdSettings[0];

      if (!scenes.length) throw new Error('No scenes found. Import a script first.');

      const scenesWithText = scenes.filter(s => (s.narration_text || s.voiceover_text)?.trim());
      if (!scenesWithText.length)
        throw new Error('No scenes have narration text. AutoSync needs narration to align.');

      // ── 4. ASR transcription ───────────────────────────────────
      setProgress('Submitting audio for speech recognition…');
      const asrResult = await transcribeVoiceover(voiceoverUrl);

      if (!asrResult?.success || !asrResult.words?.length)
        throw new Error('Speech recognition returned no words. Check that your voiceover has audible speech.');

      const asrWords = asrResult.words; // [{word, start, end}] in seconds

      // ── 5. Word-anchored alignment — THE HOLY GRAIL ────────────
      setPhase('aligning');
      setProgress(`Matching ${asrWords.length} ASR words to ${scenes.length} scenes…`);

      const alignment = alignScenesToASR(asrWords, scenes, audioDuration);

      // These are the ONLY source of truth — no formula, no distribution
      const newDurations  = alignment.map(a => a.duration);
      const newStartTimes = alignment.map(a => a.startTime ?? 0);

      const avgScore = alignment
        .filter(a => !a.empty && !a.fallback)
        .reduce((s, a) => s + (a.matchScore || 0), 0)
        / Math.max(1, alignment.filter(a => !a.empty && !a.fallback).length);

      console.log(
        `[AutoSyncButton] Alignment complete: ${alignment.length} scenes, ` +
        `avg match score: ${(avgScore * 100).toFixed(0)}%, ` +
        `total: ${audioDuration.toFixed(1)}s`
      );

      // ── 6. Persist to DB ───────────────────────────────────────
      setPhase('saving');
      setProgress('Writing scene durations to database…');

      // 6a. Update Scenes.duration_seconds in parallel batches of 10
      const BATCH = 10;
      let applied = 0;
      let failed  = 0;
      const entities = base44.asServiceRole
        ? base44.asServiceRole.entities
        : base44.entities;

      for (let i = 0; i < scenes.length && i < newDurations.length; i += BATCH) {
        const batch = [];
        for (let j = i; j < Math.min(i + BATCH, scenes.length, newDurations.length); j++) {
          const duration = newDurations[j];
          if (typeof duration !== 'number' || duration <= 0 || !isFinite(duration)) {
            console.warn(`[AutoSyncButton] Skipping scene ${scenes[j].scene_number} — invalid duration: ${duration}`);
            failed++;
            continue;
          }
          batch.push(
            entities.Scenes.update(scenes[j].id, {
              duration_seconds: parseFloat(duration.toFixed(3)),
            }).catch(e => {
              console.warn(`[AutoSyncButton] Scene ${scenes[j].scene_number} update failed:`, e?.message);
              failed++;
              return null;
            })
          );
        }
        const results = await Promise.all(batch);
        applied += results.filter(r => r !== null).length;
      }

      // 6b. Write beat_durations + beat_start_times to ProductionSettings
      setProgress('Saving timeline timing data…');
      const psPayload = {
        beat_durations:   JSON.stringify(newDurations),
        beat_start_times: JSON.stringify(newStartTimes),
      };
      if (prod) {
        await entities.ProductionSettings.update(prod.id, psPayload);
      } else {
        await entities.ProductionSettings.create({ project_id: projectId, ...psPayload });
      }

      // ── 7. Done ────────────────────────────────────────────────
      setPhase('done');

      const totalDuration = newDurations.reduce((s, d) => s + d, 0);
      const mins = Math.floor(totalDuration / 60);
      const secs = String(Math.floor(totalDuration % 60)).padStart(2, '0');
      const fallbacks = alignment.filter(a => a.fallback).length;
      const matchPct  = Math.round(avgScore * 100);

      setResult({
        scenes:     applied,
        failed,
        duration:   `${mins}:${secs}`,
        matchPct,
        fallbacks,
        wordCount:  asrResult.word_count,
      });

      onSynced?.();

      setTimeout(() => { setPhase(null); setResult(null); }, 7000);

    } catch (err) {
      console.error('[AutoSyncButton] Error:', err.message);
      setPhase('error');
      setError(err.message || 'AutoSync failed');
      setTimeout(() => { setPhase(null); setError(null); }, 6000);
    }
  };

  // ── Phase label ────────────────────────────────────────────────
  const phaseLabel = {
    measuring:  'Measuring…',
    submitting: 'Submitting…',
    polling:    'Transcribing…',
    aligning:   'Aligning…',
    saving:     'Saving…',
  }[phase] ?? 'Beat Sync';

  // ── Phase dot colors ───────────────────────────────────────────
  const DOTS = ['measuring', 'submitting', 'polling', 'aligning', 'saving'];
  const phaseIdx = DOTS.indexOf(phase);

  return (
    <div className="flex items-center gap-2">
      {/* Main button */}
      <Button
        size="sm"
        variant="ghost"
        onClick={handleSync}
        disabled={syncing || !voiceoverUrl}
        className={`text-[10px] h-6 px-2.5 gap-1.5 font-semibold transition-all ${
          syncing
            ? 'text-cyan-400 bg-cyan-500/10'
            : phase === 'done'
            ? 'text-emerald-400 bg-emerald-500/10'
            : phase === 'error'
            ? 'text-red-400 bg-red-500/10'
            : 'text-cyan-400 hover:bg-cyan-500/10'
        }`}
        title={
          !voiceoverUrl
            ? 'Add a voiceover first — AutoSync needs audio to align scenes'
            : 'ASR Beat Sync — transcribes voiceover and matches each scene narration words to exact audio timestamps'
        }
      >
        {syncing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : phase === 'done' ? (
          <Check className="w-3 h-3" />
        ) : phase === 'error' ? (
          <AlertCircle className="w-3 h-3" />
        ) : (
          <AudioLines className="w-3 h-3" />
        )}
        {syncing ? phaseLabel : phase === 'done' ? 'Synced!' : phase === 'error' ? 'Failed' : 'Beat Sync'}
      </Button>

      {/* Progress dots + message */}
      {syncing && (
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5">
            {DOTS.map((p, i) => (
              <div
                key={p}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i < phaseIdx  ? 'bg-cyan-600' :
                  i === phaseIdx ? 'bg-cyan-400 animate-pulse scale-125' :
                  'bg-gray-700'
                }`}
              />
            ))}
          </div>
          <span className="text-[9px] font-mono text-cyan-300 max-w-[160px] truncate">
            {progress}
          </span>
        </div>
      )}

      {/* Success toast */}
      {phase === 'done' && result && (
        <span className="text-[9px] text-emerald-300 font-medium animate-in fade-in slide-in-from-left-2 duration-300 flex items-center gap-1.5">
          <Check className="w-3 h-3" />
          {result.scenes} scenes · {result.duration} · {result.matchPct}% match
          {result.wordCount > 0 && ` · ${result.wordCount}w`}
          {result.fallbacks > 0 && (
            <span className="text-amber-400">· {result.fallbacks} unmatched</span>
          )}
          {result.failed > 0 && (
            <span className="text-red-400">· {result.failed} save err</span>
          )}
        </span>
      )}

      {/* Error toast */}
      {phase === 'error' && error && (
        <span className="text-[9px] text-red-400 flex items-center gap-1 max-w-[220px]">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{error}</span>
        </span>
      )}
    </div>
  );
}