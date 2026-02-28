import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  FileText, ChevronDown, ChevronUp, Loader2, Sparkles, Trash2, Copy, Check
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// SCRIPT PANEL — Full narration display with scene markers
// ══════════════════════════════════════════════════════════════════
//
// Shows the complete narration script with:
//   - Scene number markers (clickable to jump)
//   - Current scene highlight (syncs with playhead/selection)
//   - Word count + estimated duration
//   - Clean Script button (removes duplicates)
//   - Copy to clipboard
//
// Used on both ContentGeneration page and Timeline.
// ══════════════════════════════════════════════════════════════════

export default function ScriptPanel({
  scenes = [],
  projectId,
  currentSceneNumber = null,
  onSceneClick = null,
  onCleanComplete = null,
  compact = false,
}) {
  const [expanded, setExpanded] = useState(!compact);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const activeRef = useRef(null);

  // Auto-scroll to current scene
  useEffect(() => {
    if (activeRef.current && currentSceneNumber) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentSceneNumber]);

  const sorted = [...scenes].sort((a, b) => a.scene_number - b.scene_number);
  const fullScript = sorted.map(s => s.narration_text || '').join(' ');
  const wordCount = fullScript.split(/\s+/).filter(Boolean).length;
  const estMinutes = Math.ceil(wordCount / 150);

  const handleClean = async () => {
    if (cleaning || !projectId) return;
    setCleaning(true);
    setCleanResult(null);

    try {
      const res = await base44.functions.invoke('cleanScript', { project_id: projectId });
      const data = res.data || res;
      if (data?.success) {
        setCleanResult(data.stats);
        onCleanComplete?.();
      } else {
        setCleanResult({ error: data?.error || 'Failed' });
      }
    } catch (err) {
      setCleanResult({ error: err.message });
    }

    setCleaning(false);
    setTimeout(() => setCleanResult(null), 6000);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  if (sorted.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-850 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-gray-200">Script</span>
          <span className="text-[10px] text-gray-500">
            {wordCount.toLocaleString()} words · ~{estMinutes} min
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Copy button */}
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[9px] text-gray-400 hover:text-white"
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </Button>

          {/* Clean Script button */}
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[9px] text-amber-400 hover:bg-amber-500/10"
            onClick={(e) => { e.stopPropagation(); handleClean(); }}
            disabled={cleaning}
          >
            {cleaning ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            <span className="ml-1">Clean</span>
          </Button>

          {expanded ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
        </div>
      </div>

      {/* Clean result toast */}
      {cleanResult && (
        <div className={`px-3 py-1.5 text-[10px] ${cleanResult.error ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
          {cleanResult.error
            ? `✗ ${cleanResult.error}`
            : `✓ Removed ${cleanResult.words_removed} words (${cleanResult.exact_duplicates} exact + ${cleanResult.near_duplicates} near duplicates) · ${cleanResult.scenes_updated} scenes updated`
          }
        </div>
      )}

      {/* Script body */}
      {expanded && (
        <div className={`overflow-y-auto ${compact ? 'max-h-48' : 'max-h-96'} p-3 space-y-2`}>
          {sorted.map((scene) => {
            const text = scene.narration_text || '';
            if (!text.trim()) return null;

            const isCurrent = currentSceneNumber === scene.scene_number;
            const words = text.split(/\s+/).filter(Boolean).length;

            return (
              <div
                key={scene.id || scene.scene_number}
                ref={isCurrent ? activeRef : null}
                className={`group relative rounded-md p-2 transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-blue-500/10 border border-blue-500/30 ring-1 ring-blue-500/20'
                    : 'bg-gray-850 border border-transparent hover:bg-gray-800 hover:border-gray-700'
                }`}
                onClick={() => onSceneClick?.(scene.scene_number)}
              >
                {/* Scene number badge */}
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isCurrent ? 'bg-blue-500/30 text-blue-300' : 'bg-gray-700 text-gray-400'
                  }`}>
                    S{scene.scene_number}
                  </span>
                  <span className="text-[9px] text-gray-600">{words}w</span>
                </div>

                {/* Narration text */}
                <p className={`text-xs leading-relaxed ${
                  isCurrent ? 'text-gray-100' : 'text-gray-400'
                }`}>
                  {text}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
