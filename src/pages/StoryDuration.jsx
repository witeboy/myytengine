import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import { Loader2, Clock, FileText, Layers, ArrowRight } from 'lucide-react';

export default function StoryDuration() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [duration, setDuration] = useState(8);
  const [loading, setLoading] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  // Auto-skip if already past this step
  React.useEffect(() => {
    if (!project) return;
    const s = project.status;
    if (s === 'outline_ready') navigate(createPageUrl(`StoryHooks?project_id=${projectId}`), { replace: true });
    else if (['hooks_ready', 'scripting', 'script_complete'].includes(s)) navigate(createPageUrl(`StoryScript?project_id=${projectId}`), { replace: true });
    else if (['content_generation', 'scenes_ready'].includes(s)) navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`), { replace: true });
    else if (['timeline_editing', 'compiled'].includes(s)) navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`), { replace: true });
    else if (['post_production', 'published'].includes(s)) navigate(createPageUrl(`PostProduction?project_id=${projectId}`), { replace: true });
  }, [project?.status]);

  const { data: topic } = useQuery({
    queryKey: ['topic', project?.selected_topic_id],
    queryFn: async () => {
      const list = await base44.entities.Topics.filter({ id: project.selected_topic_id });
      return list[0];
    },
    enabled: !!project?.selected_topic_id,
  });

  const totalWords = duration * 150;
  const numBatches = Math.max(2, Math.round(totalWords / 1500));

  const handleGenerate = async () => {
    setLoading(true);
    await base44.entities.Projects.update(projectId, {
      video_duration_minutes: duration,
    });

    await base44.functions.invoke('generateOutline', {
      project_id: projectId,
      topic_id: project.selected_topic_id,
      topic_title: topic?.title || project.name,
      niche: project.niche,
      duration_minutes: duration,
    });

    navigate(createPageUrl(`StoryHooks?project_id=${projectId}`));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} projectStatus={project?.status} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Set Video Duration</h1>
            <p className="text-gray-600">
              Topic: <span className="font-semibold">{topic?.title || 'Loading...'}</span>
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 gap-2"
            size="lg"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {loading ? 'Generating...' : 'Generate & Continue'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Duration & Batches</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="text-sm font-medium mb-2 block">Video Duration (minutes)</label>
              <Input
                type="number"
                min={2}
                max={120}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="text-lg"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-blue-700">{duration}</p>
                <p className="text-xs text-blue-600">minutes</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <FileText className="w-5 h-5 text-purple-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-purple-700">{totalWords.toLocaleString()}</p>
                <p className="text-xs text-purple-600">words</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <Layers className="w-5 h-5 text-green-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-green-700">{numBatches}</p>
                <p className="text-xs text-green-600">batches</p>
              </div>
            </div>

{/* Button moved to header */}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}