import React, { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clapperboard, Wand2, CheckCircle2, Clock, Zap, AlertTriangle } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// PROCESSING NOTIFIER — Persistent, animated progress banner
// Designed for long-running operations (up to 10,000 word scripts)
// Shows elapsed time, estimated remaining, live scene count, stages
// ══════════════════════════════════════════════════════════════════

function formatTime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function getEstimate(wordCount, phase) {
  // Rough estimates based on word count
  if (phase === 'breakdown') {
    // ~2s per scene for visual generation + overhead
    const scenes = Math.ceil(wordCount / 13); // avg 13 words per beat
    const visualBatches = Math.ceil(scenes / 12);
    const waves = Math.ceil(visualBatches / 3);
    return Math.max(30, waves * 15 + 20); // ~15s per wave + overhead
  }
  if (phase === 'prompts') {
    const scenes = Math.ceil(wordCount / 13);
    const promptBatches = Math.ceil(scenes / 12);
    const waves = Math.ceil(promptBatches / 3);
    return Math.max(20, waves * 12 + 15);
  }
  return 60;
}

const PHASE_CONFIG = {
  breakdown: {
    icon: Clapperboard,
    label: "Phase 1: Director's Breakdown",
    color: 'blue',
    stages: [
      'Analyzing story structure...',
      'Identifying characters & themes...',
      'Splitting narration into beats...',
      'Generating visual directions...',
      'Saving scenes to database...',
    ]
  },
  prompts: {
    icon: Wand2,
    label: 'Phase 2: Visual Prompts',
    color: 'purple',
    stages: [
      'Reading director notes...',
      'Building style-specific prompts...',
      'Generating image prompts...',
      'Generating animation prompts...',
      'Finalizing production prompts...',
    ]
  }
};

export default function ProcessingNotifier({
  active,
  phase,
  progressText,
  scenesCreated = 0,
  totalExpected = 0,
  breakdownReady = 0,
  promptsReady = 0,
  wordCount = 0,
}) {
  const [elapsed, setElapsed] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const startTimeRef = useRef(null);
  const intervalRef = useRef(null);

  // Timer
  useEffect(() => {
    if (active) {
      startTimeRef.current = Date.now();
      setElapsed(0);
      setStageIndex(0);
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
      startTimeRef.current = null;
    }
    return () => clearInterval(intervalRef.current);
  }, [active]);

  // Rotate stage text for visual feedback
  useEffect(() => {
    if (!active) return;
    const config = PHASE_CONFIG[phase];
    if (!config) return;
    const interval = setInterval(() => {
      setStageIndex(prev => (prev + 1) % config.stages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [active, phase]);

  if (!active) return null;

  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.breakdown;
  const Icon = config.icon;
  const estimatedTotal = getEstimate(wordCount || 2000, phase);
  const progress = totalExpected > 0
    ? Math.min(95, Math.round((scenesCreated / totalExpected) * 100))
    : Math.min(90, Math.round((elapsed / estimatedTotal) * 100));
  const estimatedRemaining = Math.max(0, estimatedTotal - elapsed);

  const colorClasses = {
    blue: {
      bg: 'from-blue-50 to-indigo-50',
      border: 'border-blue-200',
      badge: 'bg-blue-100 text-blue-800',
      bar: 'bg-blue-500',
      barBg: 'bg-blue-100',
      text: 'text-blue-600',
      pulse: 'bg-blue-400',
      glow: 'shadow-blue-200/50',
    },
    purple: {
      bg: 'from-purple-50 to-violet-50',
      border: 'border-purple-200',
      badge: 'bg-purple-100 text-purple-800',
      bar: 'bg-purple-500',
      barBg: 'bg-purple-100',
      text: 'text-purple-600',
      pulse: 'bg-purple-400',
      glow: 'shadow-purple-200/50',
    },
  };
  const c = colorClasses[config.color] || colorClasses.blue;

  return (
    <div className={`bg-gradient-to-r ${c.bg} ${c.border} border rounded-xl p-5 mb-6 shadow-lg ${c.glow} transition-all duration-500`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Loader2 className={`w-6 h-6 animate-spin ${c.text}`} />
            <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 ${c.pulse} rounded-full animate-ping`} />
          </div>
          <div>
            <Badge className={`${c.badge} text-xs font-semibold`}>
              <Icon className="w-3 h-3 mr-1" />
              {config.label}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-gray-500 font-mono">
            <Clock className="w-3 h-3" />
            {formatTime(elapsed)}
          </span>
          {estimatedRemaining > 0 && elapsed > 5 && (
            <span className="text-gray-400">
              ~{formatTime(estimatedRemaining)} left
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className={`w-full ${c.barBg} rounded-full h-2.5 mb-3 overflow-hidden`}>
        <div
          className={`${c.bar} h-2.5 rounded-full transition-all duration-1000 ease-out relative`}
          style={{ width: `${Math.max(3, progress)}%` }}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
        </div>
      </div>

      {/* Status text */}
      <div className="space-y-1.5">
        <p className="text-sm text-gray-700 font-medium">{progressText}</p>

        {/* Rotating stage hint */}
        <p className="text-xs text-gray-400 italic transition-all duration-500">
          {config.stages[stageIndex]}
        </p>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {scenesCreated > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 bg-white/60 px-2 py-0.5 rounded-full">
              <Zap className="w-3 h-3 text-amber-500" />
              {scenesCreated} scenes created
            </span>
          )}
          {totalExpected > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white/60 px-2 py-0.5 rounded-full">
              Target: {totalExpected} scenes
            </span>
          )}
          {breakdownReady > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {breakdownReady} awaiting prompts
            </span>
          )}
          {promptsReady > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              {promptsReady} ready for images
            </span>
          )}
        </div>

        {/* Long-running reassurance */}
        {elapsed > 60 && (
          <div className="flex items-center gap-2 mt-2 p-2 bg-white/50 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-gray-500">
              {wordCount > 5000
                ? `Processing a ${wordCount.toLocaleString()}-word script takes several minutes. The AI is working through ${Math.ceil(wordCount / (13 * 12))} visual batches. Don't close this page.`
                : "This is taking longer than usual but is still processing. Don't close this page — scenes are being saved as they're generated."
              }
            </p>
          </div>
        )}

        {elapsed > 180 && (
          <div className="flex items-center gap-2 mt-1 p-2 bg-white/50 rounded-lg">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
            <p className="text-xs text-gray-500">
              Still working... Large scripts generate scenes in waves. You'll see them appear gradually below.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}