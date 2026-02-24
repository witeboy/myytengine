import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import { Loader2, Zap, Check, ArrowLeft, ArrowRight } from 'lucide-react';

export default function StoryHooks() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [generatingHooks, setGeneratingHooks] = useState(false);
  const [hooksGenerated, setHooksGenerated] = useState(false);
  const [selecting, setSelecting] = useState(null);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  // No auto-skip — users can always come back to change hooks

  const { data: topic } = useQuery({
    queryKey: ['topic', project?.selected_topic_id],
    queryFn: async () => {
      if (!project?.selected_topic_id) return null;
      const list = await base44.entities.Topics.filter({ id: project.selected_topic_id });
      return list[0];
    },
    enabled: !!project?.selected_topic_id,
  });

  const { data: hooks = [], refetch: refetchHooks } = useQuery({
    queryKey: ['hooks', projectId],
    queryFn: async () => {
      const all = await base44.entities.Hooks.filter({ project_id: projectId });
      return all.sort((a, b) => a.rank - b.rank);
    },
    enabled: !!projectId,
  });

  // Generate hooks on mount if none exist
  useEffect(() => {
    const generate = async () => {
      if (!project || !topic || hooks.length > 0 || generatingHooks || hooksGenerated) return;
      setGeneratingHooks(true);
      await base44.functions.invoke('generateHooks', {
        project_id: projectId,
        topic_id: project.selected_topic_id,
        topic_title: topic.title,
      });
      await refetchHooks();
      setGeneratingHooks(false);
      setHooksGenerated(true);
    };
    generate();
  }, [project, topic, hooks.length]);

  const handleSelect = async (hook) => {
    setSelecting(hook.id);
    await base44.entities.Hooks.update(hook.id, { is_selected: true });
    await base44.entities.Projects.update(projectId, {
      selected_hook_id: hook.id,
      status: 'hooks_ready',
      current_step: 3,
    });
    navigate(createPageUrl(`StoryScript?project_id=${projectId}`));
  };

  const typeColors = {
    curiosity_gap: 'bg-purple-100 text-purple-800',
    power_word: 'bg-red-100 text-red-800',
    pattern_break: 'bg-orange-100 text-orange-800',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} projectStatus={project?.status} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">Select an Opening Hook</h1>
        <p className="text-gray-600 mb-8">
          Topic: <span className="font-semibold">{topic?.title || 'Loading...'}</span>
        </p>

        {generatingHooks ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
            <p className="text-gray-600 font-medium">Generating 5 viral hooks...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hooks.map(hook => (
              <Card key={hook.id} className="hover:shadow-lg transition-all">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline">#{hook.rank}</Badge>
                    <Badge className={typeColors[hook.hook_type] || 'bg-gray-100 text-gray-800'}>
                      {hook.hook_type?.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-lg font-semibold mb-3 leading-tight">"{hook.hook_text}"</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <div className="flex items-center gap-1">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      Intensity: {hook.intensity_score}/10
                    </div>
                    {hook.use_as_thumbnail && <Badge variant="outline" className="text-xs">Thumbnail</Badge>}
                    {hook.use_as_voiceover && <Badge variant="outline" className="text-xs">Voiceover</Badge>}
                  </div>
                  <Button
                    onClick={() => handleSelect(hook)}
                    disabled={selecting !== null}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {selecting === hook.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <><Check className="w-4 h-4 mr-1" /> Use This Hook</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}