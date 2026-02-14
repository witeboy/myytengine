import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import BatchCard from '@/components/script/BatchCard';
import ScriptEditor from '@/components/script/ScriptEditor';
import { Loader2, RefreshCw, Download, ArrowRight, FileText, Image } from 'lucide-react';

export default function StoryScript() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

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
  });

  // Only show the latest script (the final merged one)
  const latestScript = [...scripts].sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

  // Auto-generate batches when arriving with pending batches
  const [autoGenTriggered, setAutoGenTriggered] = useState(false);
  useEffect(() => {
    if (autoGenTriggered || generating) return;
    const hasContent = batches.some(b => b.status === 'completed' && b.content);
    const needsGeneration = !hasContent && batches.length > 0 && 
      ['hooks_ready', 'scripting'].includes(project?.status);
    if (needsGeneration) {
      setAutoGenTriggered(true);
      setGenerating(true);
      base44.functions.invoke('generateScriptBatches', {
        project_id: projectId,
        selected_hook_id: project.selected_hook_id,
      }).then(() => Promise.all([refetchProject(), refetchBatches(), refetchScripts()]))
        .finally(() => setGenerating(false));
    }
  }, [project?.status, batches.length, autoGenTriggered, generating]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    for (const b of batches) {
      await base44.entities.ScriptBatches.update(b.id, { content: '', word_count: 0, status: 'pending', scene_image_url: '' });
    }
    for (const s of scripts) {
      await base44.entities.Scripts.delete(s.id);
    }
    await base44.entities.Projects.update(projectId, { status: 'hooks_ready', script_id: '' });
    setGenerating(true);
    setRegenerating(false);
    await base44.functions.invoke('generateScriptBatches', {
      project_id: projectId,
      selected_hook_id: project.selected_hook_id,
    });
    await Promise.all([refetchProject(), refetchBatches(), refetchScripts()]);
    setGenerating(false);
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

  const completedCount = batches.filter(b => b.status === 'completed').length;
  const allCompleted = batches.length > 0 && completedCount === batches.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Script Generation</h1>
          <div className="flex gap-2">
            {allCompleted && (
              <>
                <Button variant="outline" onClick={handleRegenerate} disabled={regenerating}>
                  <RefreshCw className={`w-4 h-4 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
                  Regenerate
                </Button>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </Button>
              </>
            )}
          </div>
        </div>
        <p className="text-gray-600 mb-8">
          {generating ? 'AI is writing your script batch by batch...' : allCompleted ? 'Script generation complete.' : 'Preparing script...'}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Progress */}
            {batches.length > 0 && (
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    {completedCount}/{batches.length} batches
                  </span>
                  {!allCompleted && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(completedCount / batches.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Batch Cards */}
            {batches.map(batch => (
              <div key={batch.id} className="relative">
                <BatchCard
                  batch={batch}
                  onUpdate={() => { refetchBatches(); refetchScripts(); }}
                  onGenerateImage={handleGenerateImage}
                />
                {generatingImageFor === batch.id && (
                  <div className="absolute inset-0 bg-white/70 rounded-xl flex items-center justify-center">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <Image className="w-4 h-4" /> Generating scene image...
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Combine Button */}
            {allCompleted && !latestScript && (
              <div className="flex justify-center py-4">
                <Button onClick={handleMergeScript} disabled={merging} className="bg-green-600 hover:bg-green-700" size="lg">
                  {merging ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-5 h-5 mr-2" />}
                  {merging ? 'Combining Batches...' : 'Combine Batches into Full Script'}
                </Button>
              </div>
            )}

            {/* Full Script Editor */}
            {activeScript && (
              <ScriptEditor
                script={activeScript}
                onSaved={() => refetchScripts()}
              />
            )}

            {/* Continue */}
            {allCompleted && latestScript && (
              <div className="flex justify-end pt-4">
                <Button onClick={handleContinue} className="bg-blue-600 hover:bg-blue-700" size="lg">
                  Continue to Content Generation
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <VersionHistory
              scripts={scripts}
              currentScriptId={activeScript?.id}
              onSelect={(s) => setViewingScriptId(s.id)}
            />

          </div>
        </div>
      </div>
    </div>
  );
}