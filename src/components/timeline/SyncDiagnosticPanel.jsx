import React, { useState, useEffect } from 'react';
import {
  Mic, Layers, Type, Clock, CheckCircle, XCircle, AlertTriangle,
  Loader2, Wand2, BarChart3, ArrowRight, X, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Pre-sync diagnostic panel.
 * Runs a fast analysis of current project state before AutoSync
 * to show the user what's ready, what's missing, and what will happen.
 */
export default function SyncDiagnosticPanel({
  open,
  onClose,
  onProceed,
  scenes,
  voiceoverUrl,
  audioDuration,
  audioLoading,
  audioError,
  videoClips,
  captionClips,
  prodSettings,
}) {
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    if (!open) { setAnalysis(null); return; }

    // Run instant analysis
    const result = runDiagnostics({
      scenes, voiceoverUrl, audioDuration, audioLoading, audioError,
      videoClips, captionClips, prodSettings,
    });
    setAnalysis(result);
  }, [open, scenes, voiceoverUrl, audioDuration, videoClips, captionClips, prodSettings]);

  if (!open || !analysis) return null;

  const { checks, issues, warnings, info, syncMethod, canProceed } = analysis;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] border border-gray-700 rounded-xl shadow-2xl w-[480px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
              <BarChart3 size={18} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">AutoSync Diagnostic</h3>
              <p className="text-[10px] text-gray-400">Pre-flight check before alignment</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Checks list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Status checks */}
          {checks.map((check, i) => (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
              check.status === 'pass' ? 'bg-emerald-900/20 border-emerald-800/40' :
              check.status === 'fail' ? 'bg-red-900/20 border-red-800/40' :
              check.status === 'warn' ? 'bg-amber-900/20 border-amber-800/40' :
              'bg-gray-800/40 border-gray-700/40'
            }`}>
              <div className="mt-0.5 flex-shrink-0">
                {check.status === 'pass' && <CheckCircle size={14} className="text-emerald-400" />}
                {check.status === 'fail' && <XCircle size={14} className="text-red-400" />}
                {check.status === 'warn' && <AlertTriangle size={14} className="text-amber-400" />}
                {check.status === 'info' && <Info size={14} className="text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <check.icon size={12} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-200">{check.label}</span>
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{check.detail}</p>
              </div>
              <span className={`text-[10px] font-mono flex-shrink-0 ${
                check.status === 'pass' ? 'text-emerald-400' :
                check.status === 'fail' ? 'text-red-400' :
                check.status === 'warn' ? 'text-amber-400' :
                'text-blue-400'
              }`}>{check.value}</span>
            </div>
          ))}

          {/* Issues */}
          {issues.length > 0 && (
            <div className="p-3 rounded-lg bg-red-900/30 border border-red-800/50">
              <p className="text-xs font-medium text-red-300 mb-2">🚫 Blocking Issues</p>
              {issues.map((issue, i) => (
                <p key={i} className="text-[10px] text-red-400 leading-relaxed">• {issue}</p>
              ))}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-900/30 border border-amber-800/50">
              <p className="text-xs font-medium text-amber-300 mb-2">⚠️ Warnings</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-[10px] text-amber-400 leading-relaxed">• {w}</p>
              ))}
            </div>
          )}

          {/* Info */}
          {info.length > 0 && (
            <div className="p-3 rounded-lg bg-blue-900/30 border border-blue-800/50">
              <p className="text-xs font-medium text-blue-300 mb-2">ℹ️ What will happen</p>
              {info.map((inf, i) => (
                <p key={i} className="text-[10px] text-blue-400 leading-relaxed">• {inf}</p>
              ))}
            </div>
          )}

          {/* Sync method */}
          <div className={`p-3 rounded-lg border ${
            syncMethod === 'asr' ? 'bg-gradient-to-r from-cyan-900/30 to-purple-900/30 border-cyan-800/50' :
            syncMethod === 'syllable' ? 'bg-teal-900/30 border-teal-800/50' :
            'bg-gray-800/30 border-gray-700/50'
          }`}>
            <p className={`text-xs font-medium ${
              syncMethod === 'asr' ? 'text-cyan-300' :
              syncMethod === 'syllable' ? 'text-teal-300' :
              'text-gray-300'
            }`}>
              {syncMethod === 'asr' ? '🎤 Will use ASR (Speech Recognition)' :
               syncMethod === 'syllable' ? '📝 Will use Syllable Estimation' :
               '❌ Cannot sync'}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              {syncMethod === 'asr' ? 'Voiceover will be transcribed with AssemblyAI for frame-accurate word-level timestamps. Takes 15-30 seconds.' :
               syncMethod === 'syllable' ? 'No voiceover audio — will estimate timing from narration text word count and syllable patterns. Less accurate.' :
               'Missing required data to perform sync.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={onClose}
            className="border-gray-600 text-gray-300 hover:text-white text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canProceed}
            onClick={() => { onClose(); onProceed(); }}
            className={`gap-2 text-xs ${canProceed
              ? 'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700'
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            <Wand2 size={14} />
            {canProceed ? 'Run AutoSync' : 'Cannot Sync'}
            {canProceed && <ArrowRight size={14} />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Diagnostic engine ─────────────────────────────────────────────
function runDiagnostics({ scenes, voiceoverUrl, audioDuration, audioLoading, audioError, videoClips, captionClips, prodSettings }) {
  const checks = [];
  const issues = [];
  const warnings = [];
  const info = [];

  // 1. Scenes
  const sceneCount = scenes?.length || 0;
  const scenesWithText = scenes?.filter(s => (s.narration_text || s.voiceover_text)?.trim()) || [];
  const emptyScenes = sceneCount - scenesWithText.length;
  const totalWords = scenesWithText.reduce((sum, s) => {
    const text = (s.narration_text || s.voiceover_text || '').trim();
    return sum + text.split(/\s+/).filter(Boolean).length;
  }, 0);

  checks.push({
    icon: Layers,
    label: 'Scenes',
    detail: `${sceneCount} scenes loaded, ${scenesWithText.length} with narration text`,
    value: `${sceneCount}`,
    status: sceneCount > 0 ? 'pass' : 'fail',
  });

  if (sceneCount === 0) issues.push('No scenes found — import a script first.');

  if (emptyScenes > 0) {
    warnings.push(`${emptyScenes} scene${emptyScenes > 1 ? 's have' : ' has'} no narration text — they'll get 1.5s minimum duration.`);
  }

  // 2. Narration words
  checks.push({
    icon: Type,
    label: 'Script Words',
    detail: totalWords > 0
      ? `${totalWords} words across ${scenesWithText.length} scenes (~${(totalWords * 0.35 / 60).toFixed(1)} min at normal speech)`
      : 'No narration text found on any scene',
    value: `${totalWords}`,
    status: totalWords > 0 ? 'pass' : 'fail',
  });

  if (totalWords === 0 && sceneCount > 0) {
    issues.push('No narration text found — AutoSync needs narration to align scenes.');
  }

  // 3. Voiceover audio
  const hasVoiceover = !!voiceoverUrl;
  const hasDuration = audioDuration > 0;

  checks.push({
    icon: Mic,
    label: 'Voiceover Audio',
    detail: hasVoiceover
      ? (audioLoading ? 'Measuring audio duration...' : audioError ? `Error: ${audioError}` : hasDuration ? `Duration: ${formatDuration(audioDuration)}` : 'Duration unknown')
      : 'No voiceover uploaded — will use syllable estimation',
    value: hasDuration ? formatDuration(audioDuration) : hasVoiceover ? '...' : 'None',
    status: hasVoiceover && hasDuration ? 'pass' : hasVoiceover ? 'warn' : 'warn',
  });

  if (hasVoiceover && !hasDuration && !audioLoading) {
    warnings.push('Voiceover URL exists but duration could not be measured — sync may fail.');
  }

  // 4. Word-to-duration ratio
  if (totalWords > 0 && hasDuration) {
    const wpm = (totalWords / audioDuration) * 60;
    const wpmOk = wpm >= 80 && wpm <= 220;
    checks.push({
      icon: Clock,
      label: 'Speech Rate',
      detail: `${Math.round(wpm)} words/min (normal is 120-170 WPM)`,
      value: `${Math.round(wpm)} WPM`,
      status: wpmOk ? 'pass' : 'warn',
    });
    if (wpm < 80) warnings.push(`Very slow speech rate (${Math.round(wpm)} WPM) — audio may have long silences or music sections.`);
    if (wpm > 220) warnings.push(`Very fast speech rate (${Math.round(wpm)} WPM) — script may have more text than the audio. Some words may not get matched.`);
  }

  // 5. Current sync state
  const hasSavedBeats = !!prodSettings?.beat_durations;
  const hasSavedTimeline = !!prodSettings?.timeline_video_clips;
  const syncedClips = videoClips?.filter(c => c.synced)?.length || 0;

  checks.push({
    icon: BarChart3,
    label: 'Current Sync State',
    detail: hasSavedBeats
      ? `Previously synced (${syncedClips}/${videoClips?.length || 0} clips). Re-syncing will overwrite.`
      : 'Not synced yet — first time running AutoSync.',
    value: hasSavedBeats ? 'Synced' : 'New',
    status: 'info',
  });

  // 6. Duration anomaly check on existing clips
  if (videoClips?.length > 0) {
    const longClips = videoClips.filter(c => c.duration > 20);
    const veryLongClips = videoClips.filter(c => c.duration > 30);
    const shortClips = videoClips.filter(c => c.duration < 1.0);
    if (veryLongClips.length > 0) {
      const worst = veryLongClips.reduce((a, b) => a.duration > b.duration ? a : b);
      warnings.push(`${veryLongClips.length} clip${veryLongClips.length > 1 ? 's are' : ' is'} over 30s (worst: Scene ${worst.sceneNumber} at ${worst.duration.toFixed(1)}s). AutoSync will hard-cap these to max 20s.`);
    } else if (longClips.length > 0) {
      const worst = longClips.reduce((a, b) => a.duration > b.duration ? a : b);
      warnings.push(`${longClips.length} clip${longClips.length > 1 ? 's are' : ' is'} over 20s (worst: Scene ${worst.sceneNumber} at ${worst.duration.toFixed(1)}s). AutoSync should fix this.`);
    }
    if (shortClips.length > 0) {
      warnings.push(`${shortClips.length} clip${shortClips.length > 1 ? 's are' : ' is'} under 1s. AutoSync will enforce minimums.`);
    }
  }

  // 7. Captions
  const captionCount = captionClips?.length || 0;
  if (captionCount > 0) {
    info.push(`${captionCount} captions on timeline — they won't be affected by AutoSync (only scene durations change).`);
  }

  // What will happen
  const syncMethod = hasVoiceover && hasDuration ? 'asr' : totalWords > 0 ? 'syllable' : null;

  if (syncMethod === 'asr') {
    info.push('Audio will be sent to AssemblyAI for word-level speech recognition (~15-30s).');
    info.push('Each narration word will be matched to its exact position in the audio waveform.');
    info.push('Scene boundaries will be derived from the first/last matched word per scene.');
  } else if (syncMethod === 'syllable') {
    info.push('Word durations will be estimated from syllable count and speech patterns.');
    info.push('Scenes will be proportionally sized based on narration length relative to total duration.');
  }

  if (hasSavedTimeline) {
    info.push('Existing clip effects, transitions, and motions will be preserved — only start times and durations change.');
  }

  const canProceed = issues.length === 0 && (syncMethod === 'asr' || syncMethod === 'syllable');

  return { checks, issues, warnings, info, syncMethod, canProceed };
}

function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}