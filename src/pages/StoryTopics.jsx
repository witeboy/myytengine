import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import { Loader2, Star, TrendingUp, Heart } from 'lucide-react';

export default function StoryTopics() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [selecting, setSelecting] = useState(null);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  // No auto-skip — users can always come back to regenerate or re-select topics

  const { data: topics = [], isLoading } = useQuery({
    queryKey: ['topics', projectId],
    queryFn: async () => {
      const all = await base44.entities.Topics.filter({ project_id: projectId });
      return all.sort((a, b) => a.rank - b.rank);
    },
    enabled: !!projectId,
  });

  const handleSelect = async (topic) => {
    setSelecting(topic.id);
    await base44.entities.Topics.update(topic.id, { is_selected: true });
    await base44.entities.Projects.update(projectId, {
      selected_topic_id: topic.id,
      status: 'topic_selected',
      current_step: 1,
    });
    navigate(createPageUrl(`StoryDuration?project_id=${projectId}`));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} projectStatus={project?.status} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-2">Select a Topic</h1>
        <p className="text-gray-600 mb-8">Choose the best topic for your video ({topics.length} generated)</p>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topics.map(topic => (
              <Card key={topic.id} className="hover:shadow-lg transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">#{topic.rank}</Badge>
                    {topic.monthly_searches && (
                      <Badge className="bg-gray-100 text-gray-600 text-xs">{topic.monthly_searches}</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg leading-tight">{topic.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">{topic.description}</p>
                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1" title="Viral Score">
                      <TrendingUp className="w-4 h-4 text-orange-500" />
                      <span className="font-medium">{topic.viral_score}</span>
                    </div>
                    <div className="flex items-center gap-1" title="Story Score">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span className="font-medium">{topic.storytelling_score}</span>
                    </div>
                    <div className="flex items-center gap-1" title="Emotion Score">
                      <Heart className="w-4 h-4 text-red-500" />
                      <span className="font-medium">{topic.emotional_score}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleSelect(topic)}
                    disabled={selecting !== null}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {selecting === topic.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Select Topic'}
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