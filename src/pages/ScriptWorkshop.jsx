import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Edit, RefreshCw, BarChart3, ArrowRight, Loader2 } from 'lucide-react';

export default function ScriptWorkshop() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isLoading, setIsLoading] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Projects.get(projectId),
    enabled: !!projectId,
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: () => base44.entities.Scripts.list(),
    enabled: !!projectId,
  });

  const projectScripts = scripts.filter(s => s.project_id === projectId);
  const draftScript = projectScripts.find(s => s.version === 'draft');
  const editedScript = projectScripts.find(s => s.version === 'edited');
  const finalScript = projectScripts.find(s => s.version === 'final');

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
      <StepProgress currentStep={project?.current_step || 4} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Script Workshop</h1>

        <div className="grid gap-6">
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

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => navigate(createPageUrl(`hook_selection?project_id=${projectId}`))}>
              Back
            </Button>
            <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}