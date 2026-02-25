import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, AudioLines } from 'lucide-react';

export default function AutoSyncButton({ projectId, voiceoverUrl, onSynced }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    if (!voiceoverUrl) return;
    setSyncing(true);
    setResult(null);
    const res = await base44.functions.invoke('autoSyncTimeline', { project_id: projectId });
    setSyncing(false);
    if (res.data?.success) {
      setResult(`Synced ${res.data.scene_durations?.length} scenes to ${Math.round(res.data.total_duration)}s`);
      onSynced?.();
    } else {
      setResult(res.data?.error || 'Sync failed');
    }
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
      {result && (
        <span className="text-[9px] text-cyan-300 animate-pulse">{result}</span>
      )}
    </div>
  );
}