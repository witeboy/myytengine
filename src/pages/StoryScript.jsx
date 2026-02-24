import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import BatchCard from '@/components/script/BatchCard';
import ScriptEditor from '@/components/script/ScriptEditor';
import { Loader2, RefreshCw, Download, ArrowRight, ArrowLeft, FileText } from 'lucide-react';

export default function StoryScript() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [autoGenTriggered, setAutoGenTriggered] = useState(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: batches = [], refetch: refetchBatches } = useQuery({
    queryKey: ['batches', projectId],
    queryFn: async () => {
      const all = await base44.entities.ScriptBatches.filter({ project_id: projectId });
      return all.sort((a, b) => a.batch_number - b.batch_number);
    },
    enabled: !!projectId,
    refetchInterval: generating ? 3000 : false,
  });

      const { data: scripts = [], refetch: refetchScripts } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: () => base44.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
    // 🛡️ Added Array.isArray check to prevent the TypeError
    refetchInterval: (data) => {
      const hasFinal = Array.isArray(data) && data.some(s => s.version === 'final_aggregated');
      return hasFinal ? false : 2000;
    }
  });



  const completedCount = batches.filter(b => b.status === 'completed').length;
  const allCompleted = batches.length > 0 && completedCount === batches.length;

    // 🎯 Strictly look for the version created by your 'generateFullScript' function
  const latestScript = allCompleted
    ? scripts.find(s => s.version === 'final_aggregated')
    : null;


  // Auto-generate: delete old scripts first, then generate batches
  useEffect(() => {
    if (autoGenTriggered || generating) return;
    if (project?.status === 'script_complete') return;

    const hasPendingBatches = batches.length > 0 && batches.some(b => b.status === 'pending');
    const hasNoContent = !batches.some(b => b.status === 'completed' && b.content);

    if (hasPendingBatches && hasNoContent && project?.id) {
      setAutoGenTriggered(true);
      setGenerating(true);

      const cleanupAndGenerate = async () => {
        try {
          // Delete any old stale scripts before generating
          const oldScripts = await base44.entities.Scripts.filter({ project_id: projectId });
          for (const s of oldScripts) {
            await base44.entities.Scripts.delete(s.id);
          }
          await refetchScripts();

          await base44.functions.invoke('generateScriptBatches', {
            project_id: projectId,
            selected_hook_id: project.selected_hook_id,
          });

          await Promise.all([refetchProject(), refetchBatches(), refetchScripts()]);
        } catch (err) {
          console.error('Script generation error:', err);
        } finally {
          setGenerating(false);
        }
      };

      cleanupAndGenerate();
    }
  }, [project?.id, project?.status, batches, autoGenTriggered, generating]);

  // ⚡ NEW: Auto-trigger the Merge function when batches hit 100%
  useEffect(() => {
    // Only trigger if all batches are done AND we don't have the final script yet
    if (allCompleted && !latestScript && !generating && project?.status !== 'script_complete') {
      
      const triggerMerge = async () => {
        try {
          console.log("All batches complete. Starting final merge...");
          // This calls your 'generateFullScript' Deno function
          await base44.functions.invoke('generateFullScript', {
            project_id: projectId
          });
          // Refresh everything so the final script pops up
          await Promise.all([refetchProject(), refetchScripts()]);
        } catch (err) {
          console.error('Merge error:', err);
        }
      };

      triggerMerge();
    }
  }, [allCompleted, latestScript, generating, project?.status, projectId]);


  const handleRegenerate = async () => {
    setRegenerating(true);

    // Reset all batches to pending
    for (const b of batches) {
      await base44.entities.ScriptBatches.update(b.id, {
        content: '',
        word_count: 0,
        status: 'pending',
        scene_image_url: '',
      });
    }

    // Delete all old scripts
    for (const s of scripts) {
      await base44.entities.Scripts.delete(s.id);
    }

    await base44.entities.Projects.update(projectId, {
      status: 'hooks_ready',
      script_id: '',
    });

    await refetchScripts();
    setGenerating(true);
    setRegenerating(false);

    try {
      await base44.functions.invoke('generateScriptBatches', {
        project_id: projectId,
        selected_hook_id: project.selected_hook_id,
      });
      await Promise.all([refetchProject(), refetchBatches(), refetchScripts()]);
    } catch (err) {
      console.error('Regeneration error:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = () => {
    if (!latestScript?.full_script) return;
    const blob = new Blob([latestScript.full_script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'script'}-script.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleContinue = () => {
    navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} projectStatus={project?.status} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate(createPageUrl(`StoryHooks?project_id=${projectId}`))} className="gap-2" size="sm">
              <ArrowLeft className="w-4 h-4" /> Hooks
            </Button>
            <h1 className="text-3xl font-bold">Script Generation</h1>
          </div>
                    <div className="flex gap-2">
            {allCompleted && (
              <>
                {!latestScript && (
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      setGenerating(true);
                      try {
                        await base44.functions.invoke('generateFullScript', { project_id: projectId });
                        await refetchScripts();
                      } finally {
                        setGenerating(false);
                      }
                    }}
                    className="border-orange-500 text-orange-600 hover:bg-orange-50"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${generating ? 'animate-spin' : ''}`} />
                    Force Merge Script
                  </Button>
                )}
                <Button variant="outline" onClick={handleRegenerate} disabled={regenerating}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
                  Regenerate
                </Button>
                <Button variant="outline" onClick={handleExport} disabled={!latestScript}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </>
            )}
            {allCompleted && latestScript && (
              <Button onClick={handleContinue} className="bg-blue-600 hover:bg-blue-700 gap-2">
                Next: Content <ArrowRight className="w-5 h-5" />
              </Button>
            )}
          </div>

        </div>
                <p className="text-gray-600 mb-8">
          {generating
            ? 'AI is writing your script batch by batch...'
            : (allCompleted && !latestScript)
            ? 'Batches finished! Merging and cleaning the final documentary script...'
            : allCompleted
            ? 'Script generation complete.'
            : 'Preparing script...'}
        </p>


        <div className="space-y-6">
          {/* Progress bar while generating */}
          {batches.length > 0 && !allCompleted && (
            <div className="bg-white p-4 rounded-lg shadow-sm border">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  {completedCount}/{batches.length} batches
                </span>
                {generating && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / batches.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Batch Cards — show while generating or when not all complete */}
          {!allCompleted &&
            batches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                onUpdate={() => {
                  refetchBatches();
                  refetchScripts();
                }}
              />
            ))}

          {/* Full Script Editor — ONLY after all batches complete AND script exists */}
          {allCompleted && latestScript && (
            <ScriptEditor script={latestScript} onSaved={() => refetchScripts()} />
          )}
        </div>
      </div>
    </div>
  );
}