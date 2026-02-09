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

export default function hook_selection() {
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

  const handleSelectHook = async (hookId) => {
    setIsLoading(true);
    try {
      await base44.functions.invoke('selectHook', {
        project_id: projectId,
        hook_id: hookId,
      });

      const projectData = await base44.entities.Projects.get(projectId);
      const topicData = await base44.entities.Topics.get(projectData.selected_topic_id);

      const scriptResult = await base44.functions.invoke('generateScript', {
        project_id: projectId,
        topic_id: projectData.selected_topic_id,
        topic_title: topicData.title,
        topic_description: topicData.description,
        selected_hook: filteredHooks.find(h => h.id === hookId).hook_text,
      });

      navigate(createPageUrl(`script_workshop?project_id=${projectId}`));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const hookTypes = {
    curiosity_gap: 'Curiosity Gap',
    power_word: 'Power Word',
    pattern_break: 'Pattern Break',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={2} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Select Hook</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHooks.map((hook) => (
            <Card key={hook.id} className="hover:shadow-lg transition-shadow flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start gap-2">
                  <CardTitle className="text-lg line-clamp-2">{hook.hook_text}</CardTitle>
                  <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded flex-shrink-0">
                    #{hook.rank}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline">{hookTypes[hook.hook_type]}</Badge>
                  <Badge className="bg-purple-100 text-purple-800">
                    <Zap className="w-3 h-3 mr-1" /> {hook.intensity_score}/10
                  </Badge>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  {hook.use_as_thumbnail && <p>✓ Works as thumbnail</p>}
                  {hook.use_as_voiceover && <p>✓ Works as voiceover</p>}
                </div>

                <Button
                  onClick={() => handleSelectHook(hook.id)}
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