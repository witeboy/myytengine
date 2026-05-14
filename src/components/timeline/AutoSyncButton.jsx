import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AudioLines, Check, AlertCircle } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// BEAT SYNC BUTTON v8 — Full ASR → Word-Match → Persist pipeline
// ══════════════════════════════════════════════════════════════════

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 180000; // 3 min

// ── Word matching utilities ────────────────────────────────────────

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
  // Full Levenshtein DP — correctly handles insertion, deletion, substitution
  if (Math.abs(a.length - b.length) <= 2 && a.length >= 4 && b.length >= 4) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    if (dp[m][n] <= 1) return true;
  }
  return false;
}

// Numeric tokens (years, dates, counts) that ASR expands to spoken words.
// Skipping them prevents the cursor stalling on "44" vs "forty" etc.
const TRANSPARENT_TOKEN_RE = /^[\d,]+(?:st|nd|rd|th|s)?$|^\d+[\d,.]*$/;

function isTransparentToken(word) {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return true;
  if (TRANSPARENT_TOKEN_RE.test(word.replace(/,/g, ''))) return true;
  return false;
}

function getSceneWords(scene) {
  const text = (scene.narration_text || scene.voiceover_text || '').trim();
  if (!text) return [];
  return text.split(/\s+/).filter(Boolean);
}

function alignScenesToASR(asrWords, scenes, totalAudioDuration) {
  if (!asrWords?.length || !scenes?.length) return [];

  const sceneScriptWords = scenes.map(s => getSceneWords(s));
  const MAX_PAD    = 0.5;
  const MIN_EMPTY  = 0.8;
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
    let scriptIdx    = 0;
    let matchedCount = 0;
    // Wider window: *6+25 catches ASR verbosity on long scenes
    const maxAsrConsume = Math.min(
      scriptWords.length * 6 + 25,
      asrWords.length - asrCursor
    );
    let localAsrIdx = 0;

    while (scriptIdx < scriptWords.length && localAsrIdx < maxAsrConsume) {
      const asrIdx = asrCursor + localAsrIdx;
      if (asrIdx >= asrWords.length) break;

      const asrW    = asrWords[asrIdx].word;
      const scriptW = scriptWords[scriptIdx];

      // Skip numeric tokens — ASR says "forty four", script says "44"
      if (isTransparentToken(scriptW)) {
        scriptIdx++;
        continue;
      }

      if (wordsMatch(scriptW, asrW)) {
        if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = asrIdx;
        lastMatchedAsrIdx = asrIdx;
        matchedCount++;
        scriptIdx++;
        localAsrIdx++;
      } else {
        // Try skipping up to 3 ASR words (ASR inserted extra)
        let found = false;
        for (let skip = 1; skip <= 3 && localAsrIdx + skip < maxAsrConsume; skip++) {
          const ci = asrIdx + skip;
          if (ci < asrWords.length && wordsMatch(scriptW, asrWords[ci].word)) {
            localAsrIdx += skip;
            if (firstMatchedAsrIdx === -1) firstMatchedAsrIdx = ci;
            lastMatchedAsrIdx = ci;
            matchedCount++;
            scriptIdx++;
            localAsrIdx++;
            found = true;
            break;
          }
        }
        if (!found) {
          // Try skipping up to 3 script words (ASR dropped a word)
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
      // Advance cursor by estimated consumption so next scene doesn't re-scan same words
      const estimatedConsumed = Math.max(1, Math.floor(scriptWords.length * 0.8));
      asrCursor = Math.min(asrWords.length, asrCursor + estimatedConsumed);
      sceneMatches.push({ firstAsrIdx: -1, lastAsrIdx: -1, matchedCount: 0, empty: false, fallback: true });
    }
  }

  // ── Step 2: Extract authoritative timestamps ───────────────────
  const results = scenes.map((scene, idx) => {
    const match = sceneMatches[idx];
    const wc = sceneScriptWords[idx].length;

    if (match.empty || match.fallback || (match.lastAsrIdx == null || match.lastAsrIdx < 0)) {
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

  // ── Step 3: Stitch gaps — bridge over intermediate fallbacks ───
  const firstSpoken = results.find(r => !r.empty && !r.fallback && r.speechStart !== null);
  if (firstSpoken) {
    firstSpoken.startTime = Math.max(0, firstSpoken.speechStart - Math.min(firstSpoken.speechStart, MAX_PAD));
  }

  const lastSpoken = [...results].reverse().find(r => !r.empty && !r.fallback && r.speechEnd !== null);
  if (lastSpoken) {
    const trail = totalAudioDuration - lastSpoken.speechEnd;
    lastSpoken.endTime = Math.min(totalAudioDuration, lastSpoken.speechEnd + Math.min(trail, MAX_PAD));
  }

  for (let i = 0; i < results.length - 1; i++) {
    const curr = results[i];
    if (curr.empty || curr.fallback || curr.speechEnd === null) continue;
    // Bridge over fallback/empty neighbours to find next valid scene
    let nextIdx = i + 1;
    while (nextIdx < results.length && (results[nextIdx].empty || results[nextIdx].fallback)) nextIdx++;
    if (nextIdx >= results.length) continue;
    const next = results[nextIdx];
    if (next.speechStart === null) continue;

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

  // Fill empty/fallback scenes between neighbours
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

  // Anchor first valid scene to 0, last to totalAudioDuration
  const firstValid = results.find(r => r.startTime !== null);
  if (firstValid && firstValid.startTime > 0) firstValid.startTime = 0;
  const lastValid = [...results].reverse().find(r => r.endTime !== null);
  if (lastValid && lastValid.endTime < totalAudioDuration) lastValid.endTime = totalAudioDuration;

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
  const [phase, setPhase]       = useState(null);
  const [progress, setProgress] = useState('');
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const abortRef = useRef(false);

  const syncing = phase !== null && phase !== 'done' && phase !== 'error';

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

  const transcribeVoiceover = async (url) => {
    const submitRes = await base44.functions.invoke('submitTranscription', { voiceover_url: url });
    const submitData = submitRes?.data ?? submitRes;
    if (!submitData?.success || !submitData?.transcript_id)
      throw new Error(submitData?.error || 'Failed to submit transcription');

    const transcriptId = submitData.transcript_id;
    const start = Date.now();
    let pollCount = 0;

    while (true) {
      if (abortRef.current) throw new Error('Cancelled');
      if (Date.now() - start > POLL_TIMEOUT_MS) throw new Error('Transcription timed out after 3 minutes');

      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      pollCount++;
      setProgress(`Recognizing speech\u2026 (${pollCount * 3}s)`);

      const pollRes  = await base44.functions.invoke('pollTranscription', { transcript_id: transcriptId });
      const pollData = pollRes?.data ?? pollRes;

      if (pollData?.status === 'completed') {
        return {
          success:    true,
          words:      pollData.words,
          word_count: pollData.word_count,
          confidence: pollData.confidence,
          duration:   pollData.duration,
        };
      }
      if (pollData?.status === 'error') {
        throw new Error(pollData.error || 'Transcription failed');
      }
    }
  };

  const handleSync = async () => {
    if (!voiceoverUrl || syncing) return;

    abortRef.current = false;
    setPhase('measuring');
    setResult(null);
    setError(null);

    try {
      if (!voiceoverUrl) throw new Error('No voiceover audio. Add a voiceover first.');

      setProgress('Measuring audio duration\u2026');
      const audioDuration = await measureAudioDuration(voiceoverUrl);
      if (!audioDuration || audioDuration <= 0)
        throw new Error('Could not measure audio duration. Check the voiceover URL.');

      setPhase('submitting');
      setProgress('Loading scenes\u2026');
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

      setProgress('Submitting audio for speech recognition\u2026');
      const asrResult = await transcribeVoiceover(voiceoverUrl);

      if (!asrResult?.success || !asrResult.words?.length)
        throw new Error('Speech recognition returned no words. Check that your voiceover has audible speech.');

      const asrWords = asrResult.words;

      setPhase('aligning');
      setProgress(`Matching ${asrWords.length} ASR words to ${scenes.length} scenes\u2026`);

      const alignment = alignScenesToASR(asrWords, scenes, audioDuration);
      const newDurations  = alignment.map(a => a.duration);
      const newStartTimes = alignment.map(a => a.startTime ?? 0);

      const avgScore = alignment
        .filter(a => !a.empty && !a.fallback)
        .reduce((s, a) => s + (a.matchScore || 0), 0)
        / Math.max(1, alignment.filter(a => !a.empty && !a.fallback).length);

      console.log(`[AutoSyncButton] Alignment: ${alignment.length} scenes, avg match: ${(avgScore * 100).toFixed(0)}%`);

      setPhase('saving');
      setProgress('Writing scene durations to database\u2026');

      const BATCH = 10;
      let applied = 0;
      let failed  = 0;
      const entities = base44.asServiceRole ? base44.asServiceRole.entities : base44.entities;

      for (let i = 0; i < scenes.length && i < newDurations.length; i += BATCH) {
        const batch = [];
        for (let j = i; j < Math.min(i + BATCH, scenes.length, newDurations.length); j++) {
          const duration = newDurations[j];
          if (typeof duration !== 'number' || duration <= 0 || !isFinite(duration)) {
            failed++; continue;
          }
          batch.push(
            entities.Scenes.update(scenes[j].id, {
              duration_seconds: parseFloat(duration.toFixed(3)),
            }).catch(() => { failed++; return null; })
          );
        }
        const res = await Promise.all(batch);
        applied += res.filter(r => r !== null).length;
      }

      setProgress('Saving timeline timing data\u2026');
      const psPayload = {
        beat_durations:   JSON.stringify(newDurations),
        beat_start_times: JSON.stringify(newStartTimes),
      };
      if (prod) {
        await entities.ProductionSettings.update(prod.id, psPayload);
      } else {
        await entities.ProductionSettings.create({ project_id: projectId, ...psPayload });
      }

      setPhase('done');

      const totalDuration = newDurations.reduce((s, d) => s + d, 0);
      const mins = Math.floor(totalDuration / 60);
      const secs = String(Math.floor(totalDuration % 60)).padStart(2, '0');
      const fallbacks = alignment.filter(a => a.fallback).length;

      setResult({
        scenes:   applied,
        failed,
        duration: `${mins}:${secs}`,
        matchPct: Math.round(avgScore * 100),
        fallbacks,
        wordCount: asrResult.word_count,
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

  const phaseLabel = {
    measuring:  'Measuring\u2026',
    submitting: 'Submitting\u2026',
    polling:    'Transcribing\u2026',
    aligning:   'Aligning\u2026',
    saving:     'Saving\u2026',
  }[phase] ?? 'Beat Sync';

  const DOTS = ['measuring', 'submitting', 'polling', 'aligning', 'saving'];
  const phaseIdx = DOTS.indexOf(phase);

  return (
    <div className="flex items-center gap-2">
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

      {phase === 'done' && result && (
        <span className="text-[9px] text-emerald-300 font-medium animate-in fade-in slide-in-from-left-2 duration-300 flex items-center gap-1.5">
          <Check className="w-3 h-3" />
          {result.scenes} scenes &middot; {result.duration} &middot; {result.matchPct}% match
          {result.wordCount > 0 && ` \u00b7 ${result.wordCount}w`}
          {result.fallbacks > 0 && (
            <span className="text-amber-400">&middot; {result.fallbacks} unmatched</span>
          )}
          {result.failed > 0 && (
            <span className="text-red-400">&middot; {result.failed} save err</span>
          )}
        </span>
      )}

      {phase === 'error' && error && (
        <span className="text-[9px] text-red-400 flex items-center gap-1 max-w-[220px]">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{error}</span>
        </span>
      )}
    </div>
  );
}