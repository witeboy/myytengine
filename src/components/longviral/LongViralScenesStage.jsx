import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, CheckCircle2, ImageIcon, Layers } from 'lucide-react';

export default function LongViralScenesStage({ projectId, project, scenes, onRefetch }) {
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState('');

  const hasScenes = scenes.length > 0;
  const allPromptsReady = hasScenes && scenes.every(s => s.status === 'prompts_ready' || s.status === 'image_generated');

  const handleBreakdown = async () => {
    setGenerating(true);
    setPhase('Extracting character DNA...');
    setProgress('');

    try {
      // ── Step 1: Character DNA (non-fatal) ──
      try {
        await base44.functions.invoke('extractCharacterDNA', { project_id: projectId });
      } catch (e) {
        console.warn('Character DNA extraction failed (non-fatal):', e.message);
      }

      // ── Step 2: Scene Breakdown (batched — same as standard pipeline) ──
      setPhase('Breaking script into cinematic scenes...');
      let breakdownDone = false;
      let nextBatch = 0;

      while (!breakdownDone) {
        try {
          if (nextBatch > 0) {
            const delay = nextBatch === 1 ? 8000 : 3000;
            await new Promise(r => setTimeout(r, delay));
          }

          const bdResult = await base44.functions.invoke('generateSceneBreakdown', {
            project_id: projectId,
            batch_index: nextBatch
          });
          const bdData = bdResult.data || bdResult;
          breakdownDone = bdData.done === true;
          nextBatch = bdData.next_batch ?? (nextBatch + 1);

          const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
          const target = bdData.total_target || freshScenes.length;
          setProgress(`${freshScenes.length}/${target} scenes created`);
        } catch (err) {
          const status = err?.response?.status || err?.status;
          const errMsg = err?.response?.data?.error || '';

          if (status === 400 && errMsg.includes('blueprint')) {
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          if (status === 500 || status === 502) {
            await new Promise(r => setTimeout(r, 8000));
            continue;
          }
          if (status === 504) {
            await new Promise(r => setTimeout(r, 8000));
            const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
            setProgress(`Recovering... ${freshScenes.length} scenes so far`);
            continue;
          }
          throw err;
        }
      }

      await onRefetch();

      // ── Step 3: Prompt Generation (batched — same as standard pipeline) ──
      setPhase('Generating image prompts...');
      let promptsDone = false;

      while (!promptsDone) {
        try {
          const prResult = await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
          const prData = prResult.data || prResult;
          promptsDone = prData.done === true;

          const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
          const ready = freshScenes.filter(s => s.status === 'prompts_ready');
          setProgress(`${ready.length}/${freshScenes.length} prompts ready`);
        } catch (err) {
          const status = err?.response?.status || err?.status;
          if (status === 500 || status === 502 || status === 504) {
            await new Promise(r => setTimeout(r, 8000));
            continue;
          }
          throw err;
        }
      }

      setPhase('Scenes ready!');
      setProgress('');
      await onRefetch();
    } catch (err) {
      console.error('Long Viral scene breakdown failed:', err);
      setPhase('Failed: ' + (err?.response?.data?.error || err.message || 'Unknown error'));
    }
    setGenerating(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Scene Breakdown</CardTitle>
            {allPromptsReady && <Badge className="bg-green-100 text-green-700 text-[10px]">Complete</Badge>}
          </div>
          <Button onClick={handleBreakdown} disabled={generating} className="bg-blue-600 hover:bg-blue-700 gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? 'Processing...' : hasScenes ? 'Regenerate Scenes' : 'Break Down into Scenes'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-500 mb-4">
          Uses the full cinematic scene breakdown engine with batched processing, character DNA, and visual prompts.
        </p>

        {generating && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <div>
              <p className="text-sm font-medium text-blue-700">{phase}</p>
              {progress && <p className="text-xs text-blue-500 mt-0.5">{progress}</p>}
            </div>
          </div>
        )}

        {hasScenes && (
          <div className="space-y-2 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="text-[10px]">{scenes.length} scenes</Badge>
              <Badge className="bg-blue-100 text-blue-700 text-[10px]">
                {scenes.filter(s => s.status === 'prompts_ready').length} prompts ready
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                ~{Math.round(scenes.reduce((s, sc) => s + (sc.duration_seconds || 0), 0) / 60)}min total
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
              {scenes.map(scene => (
                <div key={scene.id} className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-bold text-gray-700">S{scene.scene_number}</span>
                    {scene.status === 'prompts_ready' ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : (
                      <ImageIcon className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">
                    {scene.narration_text?.substring(0, 60)}...
                  </p>
                  <p className="text-[9px] text-blue-600 mt-1">{scene.duration_seconds?.toFixed(1)}s</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}