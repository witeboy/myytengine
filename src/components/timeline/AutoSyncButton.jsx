import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AudioLines, Check, AlertCircle } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// BEAT SYNC BUTTON — One-click media-aware timeline sync
// ══════════════════════════════════════════════════════════════════
//
// Click flow:
//   1. Call autoSyncTimeline (returns durations + transitions)
//   2. Apply durations to Scenes (incremental, with progress)
//   3. Apply transitions to Scenes (incremental, with progress)
//   4. Refresh timeline
//   5. Show stats toast
// ══════════════════════════════════════════════════════════════════

export default function AutoSyncButton({ projectId, voiceoverUrl, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [phase, setPhase] = useState(null);    // 'computing' | 'durations' | 'transitions' | 'done'
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSync = async () => {
    if (!voiceoverUrl || syncing) return;
    setSyncing(true);
    setResult(null);
    setError(null);

    // ── Single backend call — computes + applies everything ───────
    setPhase('computing');
    setProgress('Analyzing scenes & applying...');

    let data;
    try {
      const res = await base44.functions.invoke('autoSyncTimeline', { project_id: projectId });
      data = res.data || res;

      if (!data?.success) {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (err) {
      setSyncing(false);
      setPhase(null);
      setError(err.message || 'Beat sync failed');
      setTimeout(() => setError(null), 5000);
      return;
    }

    // ── Done — just refresh the timeline ──────────────────────────
    setPhase('done');
    setSyncing(false);
    setProgress(null);

    const stats = data.stats || {};
    const parts = [
      `${data.applied || stats.total_scenes} scenes synced`,
      `${Math.floor((stats.total_duration || 0) / 60)}:${String(Math.floor((stats.total_duration || 0) % 60)).padStart(2, '0')}`,
    ];
    if (stats.dissolves > 0) parts.push(`${stats.dissolves} dissolves`);
    if (stats.fades > 0) parts.push(`${stats.fades} fades`);
    if (stats.video_holds > 0) parts.push(`${stats.video_holds} video holds`);
    if (data.failed > 0) parts.push(`${data.failed} failed`);

    setResult(`✓ ${parts.join(' · ')}`);

    onSynced?.();

    setTimeout(() => { setResult(null); setPhase(null); }, 6000);
  };

  // Phase-specific colors
  const phaseColor = {
    computing: 'text-cyan-300',
    durations: 'text-blue-300',
    transitions: 'text-purple-300',
    done: 'text-emerald-300',
  };

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
            : result
            ? 'text-emerald-400 bg-emerald-500/10'
            : 'text-cyan-400 hover:bg-cyan-500/10'
        }`}
        title="Beat Sync — match scene durations to voiceover beats + add transitions"
      >
        {syncing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : result ? (
          <Check className="w-3 h-3" />
        ) : (
          <AudioLines className="w-3 h-3" />
        )}
        Beat Sync
      </Button>

      {/* Progress indicator */}
      {phase && phase !== 'done' && (
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5">
            {['computing', 'durations', 'transitions'].map((p, i) => (
              <div
                key={p}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  phase === p ? 'bg-cyan-400 animate-pulse scale-125' :
                  ['computing', 'durations', 'transitions'].indexOf(phase) > i ? 'bg-cyan-600' :
                  'bg-gray-700'
                }`}
              />
            ))}
          </div>
          <span className={`text-[9px] font-mono ${phaseColor[phase] || 'text-gray-400'}`}>
            {progress}
          </span>
        </div>
      )}

      {/* Result toast */}
      {result && !syncing && (
        <span className="text-[9px] text-emerald-300 font-medium animate-in fade-in slide-in-from-left-2 duration-300">
          {result}
        </span>
      )}

      {/* Error toast */}
      {error && (
        <span className="text-[9px] text-red-400 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </span>
      )}
    </div>
  );
}