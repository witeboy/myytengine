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
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false);
  const [hooksGenerated, setHooksGenerated] = useState(false);
  const [selectedHookId, setSelectedHookId] = useState(null);

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

  const { data: hooks = [] } = useQuery({
    queryKey: ['hooks', projectId],
    queryFn: async () => {
      const allHooks = await base44.entities.Hooks.list();
      return allHooks.filter(h => h.project_id === projectId).sort((a, b) => a.rank - b.rank);
    },
    enabled: !!projectId,
    refetchInterval: isGeneratingHooks ? 3000 : false,
  });

  useEffect(() => {
    if (project?.status === 'outline_ready' && isGenerating) {
      setIsGenerating(false);
    }
  }, [project?.status]);

  const outline = project?.outline ? JSON.parse(project.outline) : null;
  const isOutlineReady = project?.status === 'outline_ready';

  const handleGenerateHooks = async () => {
    setIsGeneratingHooks(true);
    try {
      await base44.functions.invoke('generateHooks', {
        project_id: projectId,
        topic_id: project.selected_topic_id,
        topic_title: topic?.title || '',
      });
      setTimeout(() => setHooksGenerated(true), 1000);
    } catch (error) {
      alert('Error generating hooks: ' + error.message);
      setIsGeneratingHooks(false);
    }
  };

  const handleSelectHook = async (hookId) => {
    setSelectedHookId(hookId);
    await base44.entities.Projects.update(projectId, { selected_hook_id: hookId });
  };

  const handleGenerateScriptBatches = async () => {
    try {
      const selectedHook = hooks.find(h => h.id === selectedHookId);
      await base44.functions.invoke('generateScriptBatches', {
        project_id: projectId,
        selected_hook_id: selectedHookId,
        hook_text: selectedHook?.hook_text || '',
      });
      await base44.entities.Projects.update(projectId, { current_step: 4 });
      navigate(createPageUrl(`ScriptBatching?project_id=${projectId}`));
    } catch (error) {
      alert('Error: ' + error.message);
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

        {!hooksGenerated ? (
           <div className="flex justify-between mt-8">
             <Button
               variant="outline"
               onClick={() => navigate(createPageUrl(`VideoDurationSetup?project_id=${projectId}`))}
             >
               Back
             </Button>
             <Button
               onClick={handleGenerateHooks}
               disabled={!isOutlineReady || isGeneratingHooks}
               className="bg-blue-600 hover:bg-blue-700"
             >
               {isGeneratingHooks ? 'Generating Hooks...' : 'Generate Hooks'}
             </Button>
           </div>
         ) : (
           <>
             <Card className="mb-6">
               <CardHeader>
                 <CardTitle>Select Opening Hook</CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="space-y-3">
                   {hooks.length > 0 ? (
                     hooks.map((hook) => (
                       <div
                         key={hook.id}
                         onClick={() => handleSelectHook(hook.id)}
                         className={`p-4 rounded-lg border-2 cursor-pointer transition ${
                           selectedHookId === hook.id
                             ? 'border-blue-600 bg-blue-50'
                             : 'border-gray-200 hover:border-blue-400'
                         }`}
                       >
                         <div className="flex justify-between items-start">
                           <div className="flex-1">
                             <p className="font-semibold text-gray-900">{hook.hook_text}</p>
                             <p className="text-xs text-gray-500 mt-1">
                               Type: {hook.hook_type} | Intensity: {hook.intensity_score}/10
                             </p>
                           </div>
                           {selectedHookId === hook.id && (
                             <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                           )}
                         </div>
                       </div>
                     ))
                   ) : (
                     <p className="text-gray-500 text-center py-4">No hooks generated yet</p>
                   )}
                 </div>
               </CardContent>
             </Card>

             <div className="flex justify-between">
               <Button
                 variant="outline"
                 onClick={() => setHooksGenerated(false)}
               >
                 Back
               </Button>
               <Button
                 onClick={handleGenerateScriptBatches}
                 disabled={!selectedHookId}
                 className="bg-blue-600 hover:bg-blue-700"
               >
                 Generate Script Batches
               </Button>
             </div>
           </>
         )}
      </div>
    </div>
  );
}