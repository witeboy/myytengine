import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import { Loader2, CheckCircle2, RefreshCw, Download, ArrowRight, FileText, Eye, EyeOff } from 'lucide-react';

export default function StoryScript() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [showFullScript, setShowFullScript] = useState(false);

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

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: async () => {
      return await base44.entities.Scripts.filter({ project_id: projectId });
    },
    enabled: !!projectId,
  });

  const latestScript = scripts.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))[0];

  // Auto-generate if hooks_ready but no script yet
  useEffect(() => {
    const autoGenerate = async () => {
      if (project?.status === 'hooks_ready' && !latestScript && !generating) {
        setGenerating(true);
        await base44.functions.invoke('generateFullScript', {
          project_id: projectId,
          hook_id: project.selected_hook_id,
        });
        await Promise.all([refetchProject(), refetchBatches()]);
        queryClient.invalidateQueries({ queryKey: ['scripts', projectId] });
        setGenerating(false);
      }
    };
    autoGenerate();
  }, [project?.status, latestScript]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    // Clear old batches
    for (const b of batches) {
      await base44.entities.ScriptBatches.update(b.id, { content: '', word_count: 0, status: 'pending' });
    }
    // Delete old scripts
    for (const s of scripts) {
      await base44.entities.Scripts.delete(s.id);
    }

    await base44.entities.Projects.update(projectId, { status: 'hooks_ready', script_id: '' });
    setGenerating(true);
    setRegenerating(false);

    await base44.functions.invoke('generateFullScript', {
      project_id: projectId,
      hook_id: project.selected_hook_id,
    });

    await Promise.all([refetchProject(), refetchBatches()]);
    queryClient.invalidateQueries({ queryKey: ['scripts', projectId] });
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
      <div className="max-w-5xl mx-auto px-4 py-8">
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
                  Export Script
                </Button>
              </>
            )}
          </div>
        </div>
        <p className="text-gray-600 mb-8">
          {generating ? 'AI is writing your script batch by batch...' : allCompleted ? 'Script generation complete.' : 'Preparing script...'}
        </p>

        {/* Progress */}
        {batches.length > 0 && (
          <div className="bg-white p-4 rounded-lg shadow-sm border mb-6">
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
        <div className="space-y-4 mb-8">
          {batches.map(batch => (
            <Card key={batch.id} className={batch.status === 'completed' ? 'border-green-200' : ''}>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpandedBatch(expandedBatch === batch.id ? null : batch.id)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">Batch {batch.batch_number}</Badge>
                    <CardTitle className="text-base">{batch.story_segment}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {batch.word_count > 0 && (
                      <Badge className="bg-blue-100 text-blue-800">{batch.word_count} words</Badge>
                    )}
                    {batch.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : batch.status === 'generating' ? (
                      <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    ) : null}
                  </div>
                </div>
                <p className="text-sm text-gray-500">{batch.focus_area}</p>
              </CardHeader>
              {expandedBatch === batch.id && batch.content && (
                <CardContent>
                  <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
                    {batch.content}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* Full Script Preview */}
        {latestScript && (
          <Card className="mb-8">
            <CardHeader className="cursor-pointer" onClick={() => setShowFullScript(!showFullScript)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {showFullScript ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  Full Script Preview
                </CardTitle>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  <span>{latestScript.word_count?.toLocaleString()} words</span>
                  <span>~{Math.round(latestScript.estimated_duration_sec / 60)} min</span>
                </div>
              </div>
            </CardHeader>
            {showFullScript && (
              <CardContent>
                <div className="bg-gray-50 p-6 rounded-lg text-sm text-gray-700 whitespace-pre-wrap max-h-[600px] overflow-y-auto leading-relaxed">
                  {latestScript.full_script}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Continue to Stage 2 */}
        {allCompleted && latestScript && (
          <div className="flex justify-end">
            <Button onClick={handleContinue} className="bg-blue-600 hover:bg-blue-700" size="lg">
              Continue to Content Generation
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}