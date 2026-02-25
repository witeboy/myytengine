import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AudioLines } from 'lucide-react';

export default function AutoSyncButton({ projectId, voiceoverUrl, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    if (!voiceoverUrl) return;
    setSyncing(true);
    setResult(null);
    setProgress('Computing...');

    // Step 1: Get computed durations from backend (no DB writes)
    const res = await base44.functions.invoke('autoSyncTimeline', { project_id: projectId });
    
    if (!res.data?.success || !res.data?.scene_durations) {
      setSyncing(false);
      setResult(res.data?.error || 'Sync failed');
      setProgress(null);
      setTimeout(() => setResult(null), 4000);
      return;
    }

    const durations = res.data.scene_durations;
    const total = durations.length;
    
    // Step 2: Apply updates from frontend, one at a time with small delays
    let applied = 0;
    for (let i = 0; i < durations.length; i++) {
      const d = durations[i];
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await base44.entities.Scenes.update(d.scene_id, { duration_seconds: d.duration_seconds });
          applied++;
          break;
        } catch (err) {
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      }
      setProgress(`${applied}/${total}`);
      
      // Small throttle between updates
      if (i < durations.length - 1) {
        await new Promise(r => setTimeout(r, 150));
      }
    }

    setSyncing(false);
    setProgress(null);
    setResult(`Synced ${applied} scenes to ${Math.round(res.data.total_duration)}s`);
    onSynced?.();
    setTimeout(() => setResult(null), 4000);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={handleSync}
        disabled={syncing || !voiceoverUrl}
        className="text-[10px] h-6 px-2 gap-1 text-cyan-400 hover:bg-cyan-500/10"
        title="Auto-sync scene durations to match voiceover audio length"
      >
        {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <AudioLines className="w-3 h-3" />}
        Auto-Sync
      </Button>
      {progress && (
        <span className="text-[9px] text-cyan-300 font-mono">{progress}</span>
      )}
      {result && (
        <span className="text-[9px] text-cyan-300 animate-pulse">{result}</span>
      )}
    </div>
  );
}