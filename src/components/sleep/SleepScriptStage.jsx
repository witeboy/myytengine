import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, FileText, RefreshCw } from 'lucide-react';

export default function SleepScriptStage({ projectId, project, batches, scripts, onRefetch }) {
  const [generating, setGenerating] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);

  const completedCount = batches.filter(b => b.status === 'completed').length;
  const allBatchesDone = batches.length > 0 && completedCount === batches.length;
  const hasFinalScript = scripts.some(s => s.version === 'final_aggregated');

  // Auto-start script generation
  useEffect(() => {
    if (autoStarted || generating || hasFinalScript) return;
    if (!project?.id || !['hooks_ready', 'scripting', 'topic_selected'].includes(project.status)) return;
    if (batches.some(b => b.status === 'completed' && b.content)) return;

    setAutoStarted(true);
    runFullGeneration();
  }, [project?.id, project?.status, autoStarted, generating, hasFinalScript]);

  // Auto-merge when all batches done
  useEffect(() => {
    if (!allBatchesDone || hasFinalScript || generating) return;
    (async () => {
      try {
        await base44.functions.invoke('generateFullScript', { project_id: projectId });
        await onRefetch();
      } catch (err) {
        console.error('Merge error:', err);
      }
    })();
  }, [allBatchesDone, hasFinalScript, generating]);

  const runFullGeneration = async () => {
    setGenerating(true);
    try {
      // Initialize batches if needed
      const hasPending = batches.length > 0 && batches.every(b => b.status === 'pending');
      if (!hasPending) {
        await base44.functions.invoke('initializeScriptBatches', { project_id: projectId });
        await onRefetch();
      }

      // Generate batch by batch
      let allDone = false;
      while (!allDone) {
        try {
          const resp = await base44.functions.invoke('generateScriptBatches', { project_id: projectId });
          const data = resp.data || resp;
          allDone = data.done === true;
          await onRefetch();
        } catch (err) {
          const status = err?.response?.status;
          if (status === 504 || status === 500) {
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          throw err;
        }
      }
      await onRefetch();
    } catch (err) {
      console.error('Script generation error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const latestScript = scripts.find(s => s.version === 'final_aggregated');
  const totalWords = batches.reduce((sum, b) => sum + (b.word_count || 0), 0);

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          Sleep Script
          {hasFinalScript && <Badge className="bg-green-500/20 text-green-300 text-[10px] ml-2">Complete</Badge>}
          {generating && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 ml-2" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Progress bar */}
        {batches.length > 0 && !hasFinalScript && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-white/50 mb-1">
              <span>{completedCount}/{batches.length} batches</span>
              <span>{totalWords.toLocaleString()} words</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-700"
                style={{ width: `${batches.length ? (completedCount / batches.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Batch list */}
        {!hasFinalScript && batches.length > 0 && (
          <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
            {batches.map(batch => (
              <div key={batch.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-2.5">
                <Badge className={`text-[10px] ${
                  batch.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                  batch.status === 'generating' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-white/10 text-white/40'
                }`}>
                  {batch.batch_number}
                </Badge>
                <span className="text-xs text-white/70 flex-1 truncate">{batch.story_segment}</span>
                {batch.word_count > 0 && (
                  <span className="text-[10px] text-white/40">{batch.word_count}w</span>
                )}
                {batch.status === 'generating' && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
              </div>
            ))}
          </div>
        )}

        {/* Final script preview */}
        {hasFinalScript && latestScript && (
          <div className="bg-white/5 rounded-lg p-4 max-h-48 overflow-y-auto">
            <p className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap">
              {latestScript.full_script?.substring(0, 800)}...
            </p>
            <p className="text-[10px] text-white/30 mt-2">
              {latestScript.word_count || latestScript.full_script?.split(/\s+/).length} words
            </p>
          </div>
        )}

        {/* Resume button */}
        {!generating && !allBatchesDone && batches.length > 0 && (
          <Button
            size="sm"
            onClick={runFullGeneration}
            className="bg-indigo-600 hover:bg-indigo-700 mt-3"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Resume
          </Button>
        )}
      </CardContent>
    </Card>
  );
}