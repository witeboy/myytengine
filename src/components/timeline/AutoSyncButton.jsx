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

    // ── Phase 1: Backend computes durations + transitions ─────────
    setPhase('computing');
    setProgress('Analyzing scenes...');

    let data;
    try {
      const res = await base44.functions.invoke('autoSyncTimeline', { project_id: projectId });
      data = res.data || res;

      if (!data?.success || !data?.scene_durations) {
        throw new Error(data?.error || 'Sync failed — no data returned');
      }
    } catch (err) {
      setSyncing(false);
      setPhase(null);
      setError(err.message || 'Backend sync failed');
      setTimeout(() => setError(null), 5000);
      return;
    }

    const durations = data.scene_durations;
    const transitions = data.transitions || [];
    const totalSteps = durations.length + transitions.length;
    let completed = 0;
    let failedDurations = 0;
    let failedTransitions = 0;

    // ── Phase 2: Apply durations incrementally ────────────────────
    setPhase('durations');

    for (let i = 0; i < durations.length; i++) {
      const d = durations[i];
      if (!d.scene_id) continue;

      const updatePayload = {
        duration_seconds: d.duration_seconds,
      };

      // Store video_hold metadata so timeline can show +HOLD badge
      if (d.video_hold) {
        updatePayload.video_hold = true;
        updatePayload.video_play_seconds = d.video_play_seconds;
      }

      let success = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await base44.entities.Scenes.update(d.scene_id, updatePayload);
          success = true;
          break;
        } catch (err) {
          const is429 = err?.message?.includes('429') || err?.message?.includes('Rate limit');
          const delay = is429 ? 3000 * (attempt + 1) : 1500 * (attempt + 1);
          if (attempt < 4) {
            setProgress(`Durations: ${completed}/${durations.length} (rate limited, waiting ${Math.round(delay/1000)}s...)`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      if (!success) failedDurations++;
      completed++;
      setProgress(`Durations: ${completed}/${durations.length}`);

      // Throttle between updates — 500ms keeps us under rate limits
      if (i < durations.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // ── Phase 3: Apply transitions incrementally ──────────────────
    setPhase('transitions');
    let appliedTransitions = 0;

    for (let i = 0; i < transitions.length; i++) {
      const t = transitions[i];
      if (!t.scene_id) continue;

      const updatePayload = {
        transition_type: t.transition_type,
        transition_duration: t.transition_duration,
      };

      let success = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await base44.entities.Scenes.update(t.scene_id, updatePayload);
          success = true;
          break;
        } catch (err) {
          const is429 = err?.message?.includes('429') || err?.message?.includes('Rate limit');
          const delay = is429 ? 3000 * (attempt + 1) : 1500 * (attempt + 1);
          if (attempt < 4) {
            setProgress(`Transitions: ${appliedTransitions}/${transitions.length} (rate limited, waiting ${Math.round(delay/1000)}s...)`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      if (!success) failedTransitions++;
      else appliedTransitions++;
      completed++;
      setProgress(`Transitions: ${appliedTransitions}/${transitions.length}`);

      if (i < transitions.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // ── Phase 4: Done ─────────────────────────────────────────────
    setPhase('done');
    setSyncing(false);
    setProgress(null);

    // Build result summary
    const stats = data.stats || {};
    const parts = [
      `${durations.length} scenes synced`,
      `${Math.floor(stats.total_duration / 60)}:${String(Math.floor(stats.total_duration % 60)).padStart(2, '0')}`,
    ];
    if (stats.dissolves > 0) parts.push(`${stats.dissolves} dissolves`);
    if (stats.fades > 0) parts.push(`${stats.fades} fades`);
    if (stats.video_holds > 0) parts.push(`${stats.video_holds} video holds`);

    const failures = failedDurations + failedTransitions;
    if (failures > 0) parts.push(`${failures} failed`);

    setResult(`✓ ${parts.join(' · ')}`);

    // Refresh timeline
    onSynced?.();

    // Auto-clear result
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