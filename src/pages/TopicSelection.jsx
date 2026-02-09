import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StepProgress from '@/components/StepProgress';
import { createPageUrl } from '@/utils';
import { TrendingUp, Zap, Heart } from 'lucide-react';

export default function TopicSelection() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = new URLSearchParams(location.search).get('project_id');
  const [isLoading, setIsLoading] = useState(false);

  const { data: topics = [] } = useQuery({
    queryKey: ['topics', projectId],
    queryFn: () => base44.entities.Topics.list(),
    enabled: !!projectId,
  });

  const filteredTopics = topics.filter(t => t.project_id === projectId).sort((a, b) => a.rank - b.rank);

  const handleSelectTopic = async (topicId, topic) => {
    setIsLoading(true);
    try {
      await base44.functions.invoke('selectTopic', {
        project_id: projectId,
        topic_id: topicId,
      });

      await base44.functions.invoke('generateHooks', {
        project_id: projectId,
        topic_id: topicId,
        topic_title: topic.title,
      });

      navigate(createPageUrl(`hook_selection?project_id=${projectId}`));
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StepProgress currentStep={1} />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Select Topic</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTopics.map((topic) => (
            <Card key={topic.id} className="hover:shadow-lg transition-shadow flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg line-clamp-2">{topic.title}</CardTitle>
                  <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    #{topic.rank}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col space-y-4">
                <p className="text-sm text-gray-600 line-clamp-2">{topic.description}</p>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Viral
                      </span>
                      <span className="text-xs text-gray-600">{topic.viral_score}/10</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-red-500 h-2 rounded-full" style={{ width: `${topic.viral_score * 10}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Story
                      </span>
                      <span className="text-xs text-gray-600">{topic.storytelling_score}/10</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${topic.storytelling_score * 10}%` }} />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium flex items-center gap-1">
                        <Heart className="w-3 h-3" /> Emotion
                      </span>
                      <span className="text-xs text-gray-600">{topic.emotional_score}/10</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-pink-500 h-2 rounded-full" style={{ width: `${topic.emotional_score * 10}%` }} />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => handleSelectTopic(topic.id, topic)}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 mt-auto"
                >
                  {isLoading ? 'Loading...' : 'Select Topic'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}