import React, { useState } from 'react';
import { AlertTriangle, Wrench, CheckCircle, Clock, Type, Volume2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shows detected alignment drifts after AutoSync and lets the user
 * apply a targeted speech-density fix to just the affected scenes.
 */
export default function DriftFixPanel({ driftedScenes, onApplyFix, onDismiss }) {
  const [expanded, setExpanded] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [fixed, setFixed] = useState(false);

  if (!driftedScenes?.length || fixed) return null;

  const handleFix = async () => {
    setFixing(true);
    await onApplyFix(driftedScenes.map(d => d.index));
    setFixing(false);
    setFixed(true);
    setTimeout(() => onDismiss?.(), 4000);
  };

  return (
    <div className="mx-2 my-1.5 rounded-lg border border-amber-700/60 bg-gradient-to-r from-amber-950/60 to-orange-950/40 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-300">
            {driftedScenes.length} Scene{driftedScenes.length > 1 ? 's' : ''} with Alignment Drift
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-amber-500">
            {driftedScenes.reduce((s, d) => s + d.info.deadAir, 0).toFixed(0)}s total dead air
          </span>
          {expanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
        </div>
      </div>

      {expanded && (
        <>
          {/* Scene list */}
          <div className="px-3 pb-2 space-y-1.5 max-h-40 overflow-y-auto">
            {driftedScenes.map((d) => (
              <div key={d.index} className="flex items-center gap-3 p-2 rounded bg-black/30 border border-amber-900/40">
                <div className="flex-shrink-0 w-7 h-7 rounded bg-amber-800/50 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-amber-300">{d.sceneNumber}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1 text-red-400">
                      <Clock size={9} /> {d.info.currentDuration.toFixed(1)}s current
                    </span>
                    <span className="text-gray-500">→</span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Clock size={9} /> {d.info.suggestedDuration.toFixed(1)}s suggested
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-gray-500">
                    <span className="flex items-center gap-1">
                      <Volume2 size={8} /> Speech: {d.info.speechSpan.toFixed(1)}s
                    </span>
                    <span className="flex items-center gap-1">
                      <Type size={8} /> {d.info.wordCount} words
                    </span>
                    <span className="text-amber-500">
                      {d.info.deadAir.toFixed(1)}s dead air
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="px-3 pb-2">
            <p className="text-[10px] text-gray-400 leading-relaxed">
              These scenes have significantly more time than their actual speech content.
              The fix will shrink each to its speech duration, then re-anchor the next 5 scenes
              using ASR word positions. Only affected scenes are changed.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between px-3 pb-2.5">
            <button onClick={onDismiss} className="text-[10px] text-gray-500 hover:text-gray-300">
              Dismiss
            </button>
            <Button
              size="sm"
              onClick={handleFix}
              disabled={fixing}
              className="gap-1.5 text-xs bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
            >
              {fixing
                ? <><span className="animate-spin">⚙️</span> Fixing...</>
                : <><Wrench size={12} /> Fix {driftedScenes.length} Scene{driftedScenes.length > 1 ? 's' : ''}</>
              }
            </Button>
          </div>
        </>
      )}
    </div>
  );
}