import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Copy, Loader2, Trash2, Eye } from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// DEDUP BUTTON — Remove duplicate scenes from batch overlap
// ══════════════════════════════════════════════════════════════════
//
// Two-step: Preview (dry run) → Confirm (delete + renumber)
// Shows how many duplicates found before committing.
// ══════════════════════════════════════════════════════════════════

export default function DedupButton({ projectId, sceneCount = 0, onComplete }) {
  const [phase, setPhase] = useState(null); // null | 'scanning' | 'preview' | 'removing'
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleScan = async () => {
    setPhase('scanning');
    setError(null);
    setPreview(null);

    try {
      const res = await base44.functions.invoke('dedupScenes', {
        project_id: projectId,
        dry_run: true,
      });
      const data = res.data || res;

      if (data?.success && data.duplicates_found > 0) {
        setPreview(data);
        setPhase('preview');
      } else if (data?.success && data.duplicates_found === 0) {
        setResult('✓ No duplicates found');
        setPhase(null);
        setTimeout(() => setResult(null), 4000);
      } else {
        throw new Error(data?.error || 'Scan failed');
      }
    } catch (err) {
      setError(err.message);
      setPhase(null);
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleConfirm = async () => {
    setPhase('removing');

    try {
      const res = await base44.functions.invoke('dedupScenes', {
        project_id: projectId,
        dry_run: false,
      });
      const data = res.data || res;

      if (data?.success) {
        const s = data.stats;
        setResult(`✓ Removed ${s.deleted} duplicates · ${s.original_scenes} → ${s.remaining_scenes} scenes (${s.reduction_percent}% smaller)`);
        setPreview(null);
        setPhase(null);
        onComplete?.();
      } else {
        throw new Error(data?.error || 'Remove failed');
      }
    } catch (err) {
      setError(err.message);
      setPhase(null);
    }

    setTimeout(() => setResult(null), 8000);
    setTimeout(() => setError(null), 5000);
  };

  const handleCancel = () => {
    setPhase(null);
    setPreview(null);
  };

  return (
    <div className="inline-flex flex-col gap-1">
      {/* Main buttons */}
      <div className="inline-flex items-center gap-1.5">
        {phase === null && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs border-amber-600/40 text-amber-400 hover:bg-amber-500/10"
            onClick={handleScan}
            disabled={sceneCount === 0}
          >
            <Copy className="w-3 h-3 mr-1" />
            Dedup Scenes
            {sceneCount > 0 && <span className="ml-1 text-[10px] text-amber-500">({sceneCount})</span>}
          </Button>
        )}

        {phase === 'scanning' && (
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Scanning for duplicates...
          </Button>
        )}

        {phase === 'preview' && preview && (
          <>
            <Button
              size="sm"
              variant="destructive"
              className="h-7 px-2.5 text-xs"
              onClick={handleConfirm}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remove {preview.duplicates_found} Duplicates
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-gray-400"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </>
        )}

        {phase === 'removing' && (
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Removing duplicates & renumbering...
          </Button>
        )}
      </div>

      {/* Preview info */}
      {phase === 'preview' && preview && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded px-2.5 py-1.5 text-[10px] text-amber-300 max-w-md">
          <div className="font-semibold mb-1">
            Found {preview.duplicates_found} duplicate scenes ({preview.total_scenes} → {preview.unique_scenes})
          </div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {(preview.duplicates || []).slice(0, 8).map((d, i) => (
              <div key={i} className="text-amber-400/70">
                S{d.scene_number} = S{d.matched_scene_number}: "{d.narration_preview}"
              </div>
            ))}
            {preview.duplicates_found > 8 && (
              <div className="text-amber-500/50">...and {preview.duplicates_found - 8} more</div>
            )}
          </div>
        </div>
      )}

      {/* Result toast */}
      {result && (
        <div className="text-[10px] text-emerald-400 bg-emerald-500/10 rounded px-2 py-1">
          {result}
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">
          ✗ {error}
        </div>
      )}
    </div>
  );
}
