import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { Zap } from 'lucide-react';

export default function HookSelection() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isLoading, setIsLoading] = useState(false);

  const { data: hooks = [] } = useQuery({
    queryKey: ['hooks', projectId],
    queryFn: () => base44.entities.Hooks.list(),
    enabled: !!projectId,
  });

  const filteredHooks = hooks.filter(h => h.project_id === projectId).sort((a, b) => a.rank - b.rank);

  const handleSelectHook = async (hookId, hookText) => {
    setIsLoading(true);
    try {
      await base44.functions.invoke('selectHook', {
        project_id: projectId,
        hook_id: hookId,
      });

      const project = await base44.entities.Projects.get(projectId);
      const topic = await base44.entities.Topics.get(project.selected_topic_id);

      await base44.functions.invoke('generateScript', {
        project_id: projectId,
        topic_id: topic.id,
        topic_title: topic.title,
        topic_description: topic.description,
        selected_hook: hookText,
      });

      navigate(createPageUrl(`script_workshop?project_id=${projectId}`));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const hookTypeColors = {
    curiosity_gap: 'bg-purple-100 text-purple-800',
    power_word: 'bg-red-100 text-red-800',
    pattern_break: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={5} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Select Hook</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHooks.map((hook) => (
            <Card key={hook.id} className="hover:shadow-lg transition-shadow flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="text-lg">#{hook.rank}</CardTitle>
                  <Badge className={hookTypeColors[hook.hook_type] || ''}>
                    {hook.hook_type?.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <p className="text-sm font-semibold italic text-gray-700 line-clamp-3">"{hook.hook_text}"</p>

                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-gray-600">Intensity: {hook.intensity_score}/10</span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-yellow-500 h-2 rounded-full" style={{ width: `${hook.intensity_score * 10}%` }} />
                </div>

                <div className="flex gap-2 text-xs text-gray-600 pt-2">
                  {hook.use_as_thumbnail && <span className="bg-gray-100 px-2 py-1 rounded">Thumbnail</span>}
                  {hook.use_as_voiceover && <span className="bg-gray-100 px-2 py-1 rounded">Voiceover</span>}
                </div>

                <Button
                  onClick={() => handleSelectHook(hook.id, hook.hook_text)}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 mt-auto"
                >
                  {isLoading ? 'Loading...' : 'Select Hook'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}