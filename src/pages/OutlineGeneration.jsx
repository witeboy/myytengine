import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Loader2, FileText, CheckCircle2 } from 'lucide-react';

export default function OutlineGeneration() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => base44.entities.Projects.get(projectId),
    enabled: !!projectId,
    refetchInterval: isGenerating ? 3000 : false,
  });

  const { data: topic } = useQuery({
    queryKey: ['topic', project?.selected_topic_id],
    queryFn: () => base44.entities.Topics.get(project.selected_topic_id),
    enabled: !!project?.selected_topic_id,
  });

  useEffect(() => {
    if (project?.status === 'outline_ready' && isGenerating) {
      setIsGenerating(false);
    }
  }, [project?.status]);

  const outline = project?.outline ? JSON.parse(project.outline) : null;
  const isOutlineReady = project?.status === 'outline_ready';

  const handleContinue = async () => {
    setIsProcessing(true);
    try {
      // Generate hooks first (before script batches) so they can be used in script
      await base44.functions.invoke('generateHooks', {
        project_id: projectId,
        topic_id: project.selected_topic_id,
        topic_title: topic?.title || '',
      });

      // Then generate script batches
      await base44.functions.invoke('generateScriptBatches', {
        project_id: projectId,
      });

      // Update current step
      await base44.entities.Projects.update(projectId, { current_step: 4 });
      navigate(createPageUrl(`ScriptWorkshop?project_id=${projectId}`));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={3} />
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Video Outline</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Story Structure
            </CardTitle>
            <CardDescription>
              {topic?.title}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-600">Generating outline...</p>
              </div>
            ) : isOutlineReady && outline ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600 mb-4">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold">Outline Complete</span>
                </div>
                
                <div className="space-y-4">
                   {outline.map((batch, idx) => (
                     <div key={idx} className="border-l-4 border-blue-600 pl-4 py-3 bg-white p-4 rounded">
                       <h3 className="font-semibold text-gray-900 text-lg mb-2">
                         Batch {batch.batch_number}: {batch.story_segment}
                       </h3>
                       {batch.synopsis ? (
                         <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">{batch.synopsis}</p>
                       ) : (
                         <p className="text-sm text-gray-600 italic mb-3">{batch.focus_area}</p>
                       )}
                       <p className="text-xs text-gray-500">
                         Target: ~{batch.target_words} words
                       </p>
                     </div>
                   ))}
                 </div>

                <div className="bg-blue-50 p-4 rounded-lg mt-6">
                  <p className="text-sm text-blue-900">
                    <strong>Storytelling Format:</strong> {project.storytelling_format}
                  </p>
                  <p className="text-sm text-blue-900 mt-2">
                    <strong>Video Duration:</strong> {project.video_duration_minutes} minutes
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No outline generated yet
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => navigate(createPageUrl(`VideoDurationSetup?project_id=${projectId}`))}
          >
            Back
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!isOutlineReady || isProcessing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isProcessing ? 'Generating Hooks & Scripts...' : 'Generate Hooks & Script Batches'}
          </Button>
        </div>
      </div>
    </div>
  );
}