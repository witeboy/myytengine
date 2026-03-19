/**
 * SilenceDetector — Detects silent/long pauses in voiceover audio
 * and suggests jump-cut removal points with one-click ripple delete.
 */
import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Loader2, Scissors, Trash2, CheckCircle, AlertCircle,
  Volume2, VolumeX, ChevronDown, ChevronUp, Zap
} from 'lucide-react';

const DEFAULT_SILENCE_THRESHOLD = 0.04; // amplitude (0-1)
const DEFAULT_MIN_SILENCE_MS = 400;     // ms

/**
 * Decode audio from URL → Float32Array of samples
 */
async function decodeAudio(url) {
  const resp = await fetch(url);
  const buf = await resp.arrayBuffer();
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await ctx.decodeAudioData(buf);
  // Downmix to mono
  const ch0 = decoded.getChannelData(0);
  const sr = decoded.sampleRate;
  ctx.close();
  return { samples: ch0, sampleRate: sr, duration: decoded.duration };
}

/**
 * Scan mono samples for silent regions
 * Returns array of { start, end } in seconds
 */
function findSilences(samples, sampleRate, threshold, minDurationMs) {
  const minSamples = Math.floor((minDurationMs / 1000) * sampleRate);
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms RMS window
  const silences = [];
  let silStart = null;
  let silCount = 0;

  for (let i = 0; i < samples.length; i += windowSize) {
    // RMS of window
    let sum = 0;
    const end = Math.min(i + windowSize, samples.length);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    const rms = Math.sqrt(sum / (end - i));

    if (rms < threshold) {
      if (silStart === null) silStart = i;
      silCount += (end - i);
    } else {
      if (silStart !== null && silCount >= minSamples) {
        silences.push({
          start: silStart / sampleRate,
          end: (silStart + silCount) / sampleRate,
          duration: silCount / sampleRate,
        });
      }
      silStart = null;
      silCount = 0;
    }
  }
  // Trailing silence
  if (silStart !== null && silCount >= minSamples) {
    silences.push({
      start: silStart / sampleRate,
      end: (silStart + silCount) / sampleRate,
      duration: silCount / sampleRate,
    });
  }
  return silences;
}

export default function SilenceDetector({
  voiceoverUrl,
  videoClips,
  captionClips,
  onSetVideoClips,
  onSetCaptionClips,
  onSeek,
  totalDuration,
}) {
  const [status, setStatus] = useState('idle'); // idle | scanning | done | error
  const [silences, setSilences] = useState([]);
  const [dismissed, setDismissed] = useState(new Set());
  const [threshold, setThreshold] = useState(DEFAULT_SILENCE_THRESHOLD);
  const [minDuration, setMinDuration] = useState(DEFAULT_MIN_SILENCE_MS);
  const [expanded, setExpanded] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const activeSilences = silences.filter((_, i) => !dismissed.has(i));

  const handleScan = useCallback(async () => {
    if (!voiceoverUrl) return;
    setStatus('scanning');
    setErrorMsg('');
    setSilences([]);
    setDismissed(new Set());

    try {
      const { samples, sampleRate } = await decodeAudio(voiceoverUrl);
      const found = findSilences(samples, sampleRate, threshold, minDuration);
      // Filter: skip silences at very start (<0.3s) or very end
      const filtered = found.filter(
        s => s.start > 0.3 && s.end < totalDuration - 0.3 && s.duration >= minDuration / 1000
      );
      setSilences(filtered);
      setStatus('done');
    } catch (e) {
      console.error('Silence detection failed:', e);
      setErrorMsg(e.message || 'Could not analyze audio');
      setStatus('error');
    }
  }, [voiceoverUrl, threshold, minDuration, totalDuration]);

  /**
   * Ripple-delete a single silence region:
   * 1. Find all video clips that overlap the silence range
   * 2. Trim/split them to remove the silent portion
   * 3. Shift all subsequent clips left by the removed duration
   * 4. Do the same for caption clips
   */
  const handleRemoveSilence = useCallback((silence, silIdx) => {
    const { start: cutStart, end: cutEnd } = silence;
    const cutDur = cutEnd - cutStart;

    const ripple = (clips) => {
      const result = [];
      for (const clip of clips) {
        const cStart = clip.startTime;
        const cEnd = cStart + clip.duration;

        // Entirely before the cut — keep as-is
        if (cEnd <= cutStart) {
          result.push(clip);
          continue;
        }
        // Entirely after the cut — shift left
        if (cStart >= cutEnd) {
          result.push({ ...clip, startTime: clip.startTime - cutDur });
          continue;
        }
        // Clip overlaps cut region — trim it
        if (cStart < cutStart && cEnd > cutEnd) {
          // Cut is in the middle — shrink duration
          result.push({ ...clip, duration: clip.duration - cutDur });
        } else if (cStart < cutStart) {
          // Cut trims the tail
          result.push({ ...clip, duration: cutStart - cStart });
        } else if (cEnd > cutEnd) {
          // Cut trims the head
          result.push({
            ...clip,
            startTime: cutStart,
            duration: cEnd - cutEnd,
          });
        }
        // else: clip entirely inside the cut — removed
      }
      return result;
    };

    onSetVideoClips(ripple(videoClips));
    onSetCaptionClips(ripple(captionClips));

    // Mark as dismissed and shift subsequent silence times
    setDismissed(prev => new Set([...prev, silIdx]));
    setSilences(prev =>
      prev.map((s, i) => {
        if (i <= silIdx) return s;
        return { ...s, start: s.start - cutDur, end: s.end - cutDur };
      })
    );
  }, [videoClips, captionClips, onSetVideoClips, onSetCaptionClips]);

  /**
   * Remove ALL active silences in one click (processes from end to start
   * so time shifts don't affect earlier indices)
   */
  const handleRemoveAll = useCallback(() => {
    // Process from last to first so earlier times stay valid
    const activeIndices = silences
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => !dismissed.has(i))
      .reverse();

    let vClips = [...videoClips];
    let cClips = [...captionClips];

    for (const { s: silence, i: idx } of activeIndices) {
      const { start: cutStart, end: cutEnd } = silence;
      const cutDur = cutEnd - cutStart;

      const ripple = (clips) => {
        const result = [];
        for (const clip of clips) {
          const cStart = clip.startTime;
          const cEnd = cStart + clip.duration;
          if (cEnd <= cutStart) { result.push(clip); continue; }
          if (cStart >= cutEnd) { result.push({ ...clip, startTime: clip.startTime - cutDur }); continue; }
          if (cStart < cutStart && cEnd > cutEnd) {
            result.push({ ...clip, duration: clip.duration - cutDur });
          } else if (cStart < cutStart) {
            result.push({ ...clip, duration: cutStart - cStart });
          } else if (cEnd > cutEnd) {
            result.push({ ...clip, startTime: cutStart, duration: cEnd - cutEnd });
          }
        }
        return result;
      };

      vClips = ripple(vClips);
      cClips = ripple(cClips);
    }

    onSetVideoClips(vClips);
    onSetCaptionClips(cClips);
    setDismissed(new Set(silences.map((_, i) => i)));
  }, [silences, dismissed, videoClips, captionClips, onSetVideoClips, onSetCaptionClips]);

  if (!voiceoverUrl) return null;

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scissors size={14} className="text-rose-400" />
          <span className="text-xs font-medium text-white">Jump Cut Detector</span>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-gray-500 hover:text-gray-300">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Controls */}
          <div className="space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-400">Silence Threshold</span>
              <span className="text-white font-mono">{(threshold * 100).toFixed(1)}%</span>
            </div>
            <Slider
              value={[threshold * 100]}
              onValueChange={([v]) => setThreshold(v / 100)}
              min={1} max={15} step={0.5}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-[10px]">
              <span className="text-gray-400">Min Pause Duration</span>
              <span className="text-white font-mono">{minDuration}ms</span>
            </div>
            <Slider
              value={[minDuration]}
              onValueChange={([v]) => setMinDuration(v)}
              min={200} max={2000} step={50}
            />
          </div>

          <Button
            onClick={handleScan}
            disabled={status === 'scanning'}
            className="w-full bg-rose-600 hover:bg-rose-700 gap-2"
            size="sm"
          >
            {status === 'scanning'
              ? <><Loader2 size={14} className="animate-spin" /> Scanning Audio…</>
              : <><Zap size={14} /> Detect Silences</>
            }
          </Button>

          {/* Status */}
          {status === 'error' && (
            <div className="p-2 bg-red-900/30 border border-red-700/50 rounded text-[10px] text-red-300 flex items-center gap-2">
              <AlertCircle size={12} /> {errorMsg}
            </div>
          )}

          {status === 'done' && silences.length === 0 && (
            <div className="p-2 bg-green-900/30 border border-green-700/50 rounded text-[10px] text-green-300 flex items-center gap-2">
              <CheckCircle size={12} /> No significant silences found.
            </div>
          )}

          {/* Results */}
          {status === 'done' && activeSilences.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-400">
                  {activeSilences.length} pause{activeSilences.length > 1 ? 's' : ''} detected
                </span>
                <Button
                  onClick={handleRemoveAll}
                  size="sm"
                  className="bg-rose-600 hover:bg-rose-700 gap-1 text-[10px] h-7 px-2"
                >
                  <Scissors size={10} /> Remove All
                </Button>
              </div>

              <div className="space-y-1.5">
                {silences.map((s, i) => {
                  if (dismissed.has(i)) return null;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 bg-gray-800/60 rounded border border-gray-700/50 hover:border-rose-600/50 group"
                    >
                      <button
                        onClick={() => onSeek(s.start)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <VolumeX size={10} className="text-rose-400 flex-shrink-0" />
                          <span className="text-[10px] text-gray-300 font-mono">
                            {s.start.toFixed(2)}s — {s.end.toFixed(2)}s
                          </span>
                        </div>
                        <span className="text-[9px] text-gray-500">
                          {s.duration.toFixed(2)}s pause
                        </span>
                      </button>

                      <div className="flex gap-1 opacity-60 group-hover:opacity-100">
                        <button
                          onClick={() => handleRemoveSilence(s, i)}
                          className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/20"
                          title="Ripple delete this silence"
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          onClick={() => setDismissed(prev => new Set([...prev, i]))}
                          className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/10"
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Info */}
          {status === 'idle' && (
            <p className="text-[9px] text-gray-500 leading-relaxed">
              Scans the voiceover audio for long pauses and silences. Each detected pause can be removed with a one-click ripple delete that trims the gap and snaps all subsequent clips together.
            </p>
          )}
        </div>
      )}
    </div>
  );
}