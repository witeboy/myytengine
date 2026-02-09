import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Edit2, RefreshCw } from 'lucide-react';

export default function script_workshop() {
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

  const handleEditDraft = async () => {
    if (!draftScript) return;
    setIsLoading(true);
    try {
      await base44.functions.invoke('editScript', {
        project_id: projectId,
        script_id: draftScript.id,
        topic_title: project?.niche,
        full_script: draftScript.full_script,
      });
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRewriteOutro = async () => {
    const scriptId = editedScript?.id || draftScript?.id;
    if (!scriptId) return;
    setIsLoading(true);
    try {
      await base44.functions.invoke('rewriteOutro', {
        project_id: projectId,
        script_id: scriptId,
      });
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateRetentionMap = async () => {
    const scriptId = editedScript?.id || draftScript?.id;
    if (!scriptId) return;
    setIsLoading(true);
    try {
      await base44.functions.invoke('generateRetentionMap', {
        project_id: projectId,
        script_id: scriptId,
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={4} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Script Workshop</h1>

        <Tabs defaultValue="draft" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="draft" disabled={!draftScript}>Draft</TabsTrigger>
            <TabsTrigger value="edited" disabled={!editedScript}>Edited</TabsTrigger>
            <TabsTrigger value="final" disabled={!finalScript}>Final</TabsTrigger>
          </TabsList>

          {draftScript && (
            <TabsContent value="draft">
              <Card>
                <CardHeader>
                  <CardTitle>{draftScript.title}</CardTitle>
                  <p className="text-sm text-gray-600">{draftScript.word_count} words • ~{draftScript.estimated_duration_sec}s</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{draftScript.full_script}</p>
                  </div>
                  <Button
                    onClick={handleEditDraft}
                    disabled={isLoading}
                    className="bg-blue-600 hover:bg-blue-700 w-full"
                  >
                    <Edit2 className="w-4 h-4 mr-2" /> Edit & Create Edited Version
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {editedScript && (
            <TabsContent value="edited">
              <Card>
                <CardHeader>
                  <CardTitle>{editedScript.title}</CardTitle>
                  <p className="text-sm text-gray-600">{editedScript.word_count} words • ~{editedScript.estimated_duration_sec}s</p>
                  {editedScript.editor_notes && <p className="text-sm text-gray-700 mt-2">Notes: {editedScript.editor_notes}</p>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{editedScript.full_script}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleRewriteOutro}
                      disabled={isLoading}
                      variant="outline"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" /> Rewrite Outro
                    </Button>
                    <Button
                      onClick={handleGenerateRetentionMap}
                      disabled={isLoading}
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      Generate Retention Map
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {finalScript && (
            <TabsContent value="final">
              <Card>
                <CardHeader>
                  <CardTitle>{finalScript.title}</CardTitle>
                  <p className="text-sm text-gray-600">{finalScript.word_count} words • ~{finalScript.estimated_duration_sec}s</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{finalScript.full_script}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>

        <div className="flex gap-4 mt-8">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl(`hook_selection?project_id=${projectId}`))}
          >
            Back
          </Button>
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700"
            onClick={handleNext}
          >
            Continue to Production
          </Button>
        </div>
      </div>
    </div>
  );
}