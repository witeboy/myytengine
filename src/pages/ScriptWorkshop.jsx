import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Edit, RefreshCw, BarChart3, ArrowRight, Loader2, CheckCircle2, FileText } from 'lucide-react';

export default function ScriptWorkshop() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Projects.list();
      return projects.find(p => p.id === projectId);
    },
    enabled: !!projectId,
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: async () => {
      const allScripts = await base44.entities.Scripts.list();
      return Array.isArray(allScripts) ? allScripts : [];
    },
    enabled: !!projectId,
  });

  const { data: batches = [], refetch: refetchBatches } = useQuery({
    queryKey: ['batches', projectId],
    queryFn: async () => {
      const allBatches = await base44.entities.ScriptBatches.list();
      return allBatches.filter(b => b.project_id === projectId).sort((a, b) => a.batch_number - b.batch_number);
    },
    enabled: !!projectId,
    refetchInterval: (data) => {
      const hasGeneratingBatches = data?.some(b => b.status === 'generating' || b.status === 'pending');
      return hasGeneratingBatches ? 3000 : false;
    },
  });

  const projectScripts = scripts.filter(s => s.project_id === projectId);
  const draftScript = projectScripts.find(s => s.version === 'draft');
  const editedScript = projectScripts.find(s => s.version === 'edited');
  const finalScript = projectScripts.find(s => s.version === 'final');

  const allBatchesCompleted = batches.length > 0 && batches.every(b => b.status === 'completed');
  const completedCount = batches.filter(b => b.status === 'completed').length;
  const showBatchGeneration = project?.status === 'outline_ready' && !draftScript;

  useEffect(() => {
    const startBatchGeneration = async () => {
      if (!showBatchGeneration || isGenerating) return;
      
      setIsGenerating(true);
      try {
        await base44.functions.invoke('generateScriptBatches', {
          project_id: projectId,
        });
        await refetchProject();
      } catch (error) {
        alert('Error: ' + error.message);
      } finally {
        setIsGenerating(false);
      }
    };

    if (projectId && showBatchGeneration) {
      startBatchGeneration();
    }
  }, [projectId, showBatchGeneration]);

  const handleEditScript = async () => {
    setIsLoading(true);
    try {
      await base44.functions.invoke('editScript', {
        project_id: projectId,
        script_id: draftScript.id,
        topic_title: draftScript.title,
        full_script: draftScript.full_script,
      });
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRewriteOutro = async () => {
    setIsLoading(true);
    try {
      const scriptToUse = editedScript || draftScript;
      await base44.functions.invoke('rewriteOutro', {
        project_id: projectId,
        script_id: scriptToUse.id,
      });
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetentionMap = async () => {
    setIsLoading(true);
    try {
      const scriptToUse = finalScript || editedScript || draftScript;
      await base44.functions.invoke('generateRetentionMap', {
        project_id: projectId,
        script_id: scriptToUse.id,
        category: project?.category || project?.niche,
      });
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    navigate(createPageUrl(`production_studio?project_id=${projectId}`));
  };

  const ScriptTab = ({ script, label }) => (
    <TabsContent value={label.toLowerCase()} className="space-y-4">
      {script ? (
        <Card>
          <CardHeader>
            <CardTitle>{script.title}</CardTitle>
            <div className="flex gap-4 text-sm text-gray-600 mt-2">
              <span>{script.word_count} words</span>
              <span>{Math.ceil(script.estimated_duration_sec / 60)} min</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {script.cold_open && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Cold Open</h4>
                <p className="text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap line-clamp-4">{script.cold_open}</p>
              </div>
            )}
            {script.full_script && (
              <div>
                <h4 className="font-semibold text-sm mb-2">Full Script</h4>
                <div className="text-sm bg-gray-50 p-3 rounded max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {script.full_script}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-center py-8 text-gray-600">
            {label} version not yet generated
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={4} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Script Workshop</h1>
          {showBatchGeneration && (
            <p className="text-gray-600">
              AI is generating your script in batches based on the storytelling format: <span className="font-semibold">{project?.storytelling_format}</span>
            </p>
          )}
        </div>

        <div className="grid gap-6">
          {showBatchGeneration && (
            <>
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">Progress: {completedCount}/{batches.length} batches completed</span>
                  </div>
                  {!allBatchesCompleted && (
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  )}
                </div>
                <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${batches.length > 0 ? (completedCount / batches.length) * 100 : 0}%` }} 
                  />
                </div>
              </div>

              <div className="space-y-4">
                {batches.map((batch) => (
                  <Card key={batch.id} className={batch.status === 'completed' ? 'border-green-200 bg-green-50/50' : ''}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <Badge variant="outline" className="font-mono">Batch {batch.batch_number}</Badge>
                            {batch.status === 'completed' ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : batch.status === 'generating' ? (
                              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                            ) : null}
                          </div>
                          <CardTitle className="text-lg">{batch.story_segment}</CardTitle>
                          <p className="text-sm text-gray-600 mt-1">{batch.focus_area}</p>
                        </div>
                        {batch.word_count > 0 && (
                          <Badge className="bg-blue-100 text-blue-800">
                            {batch.word_count} words
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    {batch.status === 'completed' && batch.content && (
                      <CardContent>
                        <div className="bg-white p-4 rounded border text-sm text-gray-700 max-h-40 overflow-y-auto">
                          {batch.content.substring(0, 300)}...
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}

          {!showBatchGeneration && (
            <Tabs defaultValue="draft" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="draft">Draft</TabsTrigger>
                <TabsTrigger value="edited">Edited</TabsTrigger>
                <TabsTrigger value="final">Final</TabsTrigger>
              </TabsList>
              <ScriptTab script={draftScript} label="Draft" />
              <ScriptTab script={editedScript} label="Edited" />
              <ScriptTab script={finalScript} label="Final" />
            </Tabs>
          )}

          {!showBatchGeneration && (
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleEditScript}
                disabled={isLoading || !draftScript}
                variant="outline"
                className="flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit className="w-4 h-4" />}
                Edit Script
              </Button>
              <Button
                onClick={handleRewriteOutro}
                disabled={isLoading || (!editedScript && !draftScript)}
                variant="outline"
                className="flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Rewrite Outro
              </Button>
              <Button
                onClick={handleRetentionMap}
                disabled={isLoading || (!finalScript && !editedScript && !draftScript)}
                variant="outline"
                className="flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
                Build Retention Map
              </Button>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button 
              variant="outline" 
              onClick={() => navigate(createPageUrl(`video_duration_setup?project_id=${projectId}`))}
              disabled={showBatchGeneration && !allBatchesCompleted}
            >
              Back
            </Button>
            <Button 
              onClick={async () => {
                if (showBatchGeneration && allBatchesCompleted) {
                  setIsLoading(true);
                  try {
                    await Promise.all([
                      base44.functions.invoke('generateBrandIdentity', { project_id: projectId }),
                      base44.functions.invoke('generateHooks', { project_id: projectId })
                    ]);
                    navigate(createPageUrl(`hook_selection?project_id=${projectId}`));
                  } catch (error) {
                    alert('Error: ' + error.message);
                  } finally {
                    setIsLoading(false);
                  }
                } else {
                  handleNext();
                }
              }} 
              disabled={(showBatchGeneration && !allBatchesCompleted) || isLoading}
              className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {showBatchGeneration ? 'Continue to Hooks' : 'Next'} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}