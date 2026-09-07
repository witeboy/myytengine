import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import { Loader2, Star, TrendingUp, Heart, ArrowRight, ArrowLeft, Pencil, Check, X } from 'lucide-react';

export default function StoryTopics() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [selecting, setSelecting] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: topics = [], isLoading, refetch: refetchTopics } = useQuery({
    queryKey: ['topics', projectId],
    queryFn: async () => {
      const all = await base44.entities.Topics.filter({ project_id: projectId });
      return all.sort((a, b) => a.rank - b.rank);
    },
    enabled: !!projectId,
  });

  // Detect if this project came from a channel pipeline with pre-imported topic
  const isChannelProject = !!project?.channel_topic_id;
  const selectedTopic = topics.find(t => t.is_selected);
  const hasImportedTopic = isChannelProject && selectedTopic && project?.status === 'topic_selected';

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

  const handleStartEdit = () => {
    setEditTitle(selectedTopic.title);
    setEditDescription(selectedTopic.description || '');
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    await base44.entities.Topics.update(selectedTopic.id, {
      title: editTitle,
      description: editDescription,
    });
    // Also update project name to match
    await base44.entities.Projects.update(projectId, { name: editTitle });
    await refetchTopics();
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    setEditing(false);
    setSaving(false);
  };

  const handleContinueToDuration = () => {
    navigate(createPageUrl(`StoryDuration?project_id=${projectId}`));
  };

  // If imported topic from channel, show the imported topic view
  if (hasImportedTopic) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <StageProgress currentStage={1} projectStatus={project?.status} />
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-6">
            {project?.channel_id && (
              <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl(`ChannelDetail?channel_id=${project.channel_id}`))}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Channel
              </Button>
            )}
          </div>

          <div className="mb-2">
            <Badge className="bg-blue-100 text-blue-700 text-xs mb-3">Imported from Channel</Badge>
            <h1 className="text-3xl font-bold mb-1">Topic Ready</h1>
            <p className="text-gray-500">Your topic has been imported. You can edit it or continue to the next step.</p>
          </div>

          <Card className="mt-6 border-2 border-blue-200">
            <CardContent className="p-6">
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Topic Title</label>
                    <Input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="text-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Description / Brief</label>
                    <Textarea
                      value={editDescription}
                      onChange={e => setEditDescription(e.target.value)}
                      rows={4}
                      placeholder="Add context, angle, or specific details for the AI to use..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveEdit} disabled={saving || !editTitle.trim()} className="bg-blue-600 hover:bg-blue-700">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                      Save Changes
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedTopic.title}</h2>
                  {selectedTopic.description && (
                    <p className="text-gray-600 mb-4">{selectedTopic.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-4 h-4 text-orange-500" />
                      <span>Viral: {selectedTopic.viral_score}/10</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span>Story: {selectedTopic.storytelling_score}/10</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Heart className="w-4 h-4 text-red-500" />
                      <span>Emotion: {selectedTopic.emotional_score}/10</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={handleStartEdit}>
                      <Pencil className="w-4 h-4 mr-1" /> Edit Topic
                    </Button>
                    <Button onClick={handleContinueToDuration} className="bg-blue-600 hover:bg-blue-700 flex-1 gap-2">
                      Continue to Duration <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Standard topic selection view (for non-channel projects or projects needing topic selection)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={1} projectStatus={project?.status} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {project?.channel_id && (
              <Button variant="outline" size="sm" onClick={() => navigate(createPageUrl(`ChannelDetail?channel_id=${project.channel_id}`))}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Channel
              </Button>
            )}
            <h1 className="text-3xl font-bold">Select a Topic</h1>
          </div>
          {project && ['topic_selected','outline_ready','hooks_ready','scripting','script_complete','voiceover_ready','scene_breakdown','breakdown_complete','content_generation','scenes_ready','timeline_editing','compiled','post_production','published'].includes(project.status) && (
            <Button onClick={() => navigate(createPageUrl(`StoryDuration?project_id=${projectId}`))} className="bg-blue-600 hover:bg-blue-700 gap-2">
              Continue <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-gray-600 mb-8">Choose the best topic for your video ({topics.length} generated)</p>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {topics.map(topic => (
              <Card key={topic.id} className={`hover:shadow-lg transition-all ${topic.is_selected ? 'ring-2 ring-blue-500' : ''}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">#{topic.rank}</Badge>
                    {topic.is_selected && <Badge className="bg-blue-100 text-blue-700 text-xs">Selected</Badge>}
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