import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { CheckCircle2, Loader2, FileText } from 'lucide-react';

export default function ScriptBatching() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isGenerating, setIsGenerating] = useState(true);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Projects.list();
      return projects.find(p => p.id === projectId);
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
    refetchInterval: 3000,
  });

  useEffect(() => {
    const startBatchGeneration = async () => {
      try {
        await base44.functions.invoke('generateScriptBatches', {
          project_id: projectId,
        });
        await refetchProject();
        setIsGenerating(false);
      } catch (error) {
        alert('Error: ' + error.message);
        setIsGenerating(false);
      }
    };

    if (projectId && isGenerating) {
      startBatchGeneration();
    }
  }, [projectId]);

  const allCompleted = batches.length > 0 && batches.every(b => b.status === 'completed');
  const completedCount = batches.filter(b => b.status === 'completed').length;

  const handleContinue = async () => {
    try {
      const topics = await base44.entities.Topics.list();
      const selectedTopic = topics.find(t => t.id === project.selected_topic_id);

      await base44.functions.invoke('generateHooks', {
        project_id: projectId,
        topic_id: project.selected_topic_id,
        topic_title: selectedTopic?.title || 'Topic',
      });

      navigate(createPageUrl(`hook_selection?project_id=${projectId}`));
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={3} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Script Generation</h1>
          <p className="text-gray-600">
            AI is generating your script in batches based on the storytelling format: <span className="font-semibold">{project?.storytelling_format}</span>
          </p>
        </div>

        <div className="mb-6 bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="font-medium">Progress: {completedCount}/{batches.length} batches completed</span>
            </div>
            {!allCompleted && (
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

        {allCompleted && (
          <div className="mt-8 flex justify-end">
            <Button
              onClick={handleContinue}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Continue to Hook Selection
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}