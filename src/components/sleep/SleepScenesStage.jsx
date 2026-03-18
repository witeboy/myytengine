import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Layers, RefreshCw, Clock } from 'lucide-react';

export default function SleepScenesStage({ projectId, project, scenes, breakdownDone, onRefetch }) {
  const [breaking, setBreaking] = useState(false);
  const [progress, setProgress] = useState('');
  const [autoStarted, setAutoStarted] = useState(false);

  // Auto-start breakdown if no scenes exist
  useEffect(() => {
    if (autoStarted || breaking || scenes.length > 0) return;
    setAutoStarted(true);
    handleBreakdown();
  }, [autoStarted, breaking, scenes.length]);

  const handleBreakdown = async () => {
    setBreaking(true);
    setProgress('Analyzing script for sleep scene breakdown...');
    let nextBatch = 0;
    let done = false;

    while (!done) {
      try {
        const resp = await base44.functions.invoke('sleepSceneBreakdown', {
          project_id: projectId,
          batch_index: nextBatch
        });
        const data = resp.data || resp;
        done = data.done === true;
        nextBatch = data.next_batch ?? (nextBatch + 1);
        await onRefetch();
        setProgress(`${data.scenes_created || 0}/${data.total_target || '?'} scenes created`);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 504 || status === 500) {
          await new Promise(r => setTimeout(r, 8000));
          continue;
        }
        console.error('Breakdown error:', err);
        break;
      }
    }

    // Auto-generate prompts after breakdown
    if (done) {
      setProgress('Converting to visual prompts...');
      let promptsDone = false;
      while (!promptsDone) {
        try {
          const resp = await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
          const data = resp.data || resp;
          promptsDone = data.done === true;
          await onRefetch();
        } catch (err) {
          const status = err?.response?.status;
          if (status === 504 || status === 500) {
            await new Promise(r => setTimeout(r, 8000));
            continue;
          }
          break;
        }
      }
    }

    await onRefetch();
    setBreaking(false);
    setProgress('');
  };

  const breakdownReadyCount = scenes.filter(s => s.status === 'breakdown_ready').length;
  const promptsReadyCount = scenes.filter(s => s.status === 'prompts_ready').length;

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <Layers className="w-4 h-4 text-indigo-400" />
          Scene Breakdown
          {breakdownDone && <Badge className="bg-green-500/20 text-green-300 text-[10px] ml-2">Complete</Badge>}
          {breaking && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 ml-2" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {breaking && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress}
            </div>
          </div>
        )}

        {scenes.length > 0 && (
          <>
            <div className="flex items-center gap-4 text-xs text-white/50 mb-3">
              <span>{scenes.length} scenes</span>
              {breakdownReadyCount > 0 && <span>{breakdownReadyCount} pending prompts</span>}
              {promptsReadyCount > 0 && <span className="text-green-400">{promptsReadyCount} ready</span>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
              {scenes.map(scene => {
                let mood = '';
                let sleepType = '';
                if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
                  try {
                    const notes = JSON.parse(scene.image_prompt.substring(15));
                    mood = notes.mood || '';
                    sleepType = notes.sleep_visual_type || '';
                  } catch (_) {}
                }

                return (
                  <div key={scene.id} className="bg-white/5 rounded-lg p-2 text-center">
                    <div className="text-[10px] text-white/30 mb-1">S{scene.scene_number}</div>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-white/30" />
                      <span className="text-[10px] text-white/50">{scene.duration_seconds?.toFixed(1)}s</span>
                    </div>
                    {sleepType && (
                      <Badge className="text-[8px] bg-indigo-500/20 text-indigo-300 px-1">
                        {sleepType.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!breaking && scenes.length === 0 && (
          <Button size="sm" onClick={handleBreakdown} className="bg-indigo-600 hover:bg-indigo-700">
            <Layers className="w-3.5 h-3.5 mr-1" /> Start Breakdown
          </Button>
        )}

        {!breaking && breakdownReadyCount > 0 && (
          <Button
            size="sm"
            onClick={async () => {
              setBreaking(true);
              setProgress('Generating prompts...');
              let done = false;
              while (!done) {
                try {
                  const resp = await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
                  done = (resp.data || resp).done === true;
                  await onRefetch();
                } catch (err) {
                  if (err?.response?.status === 504 || err?.response?.status === 500) {
                    await new Promise(r => setTimeout(r, 8000));
                    continue;
                  }
                  break;
                }
              }
              setBreaking(false);
              setProgress('');
            }}
            variant="outline"
            className="mt-3 border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Generate Prompts ({breakdownReadyCount})
          </Button>
        )}
      </CardContent>
    </Card>
  );
}