import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createPageUrl } from '@/utils';
import {
  ArrowLeft, Upload, Calendar, List, Settings, Loader2, Play,
  FileText, Clock, Zap
} from 'lucide-react';
import { getNicheDefaults } from '@/components/channels/NicheCard';
import ContentCalendar from '@/components/channels/ContentCalendar';
import DayTopicsPanel from '@/components/channels/DayTopicsPanel';
import TopicImporter from '@/components/channels/TopicImporter';

export default function ChannelDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channelId = new URLSearchParams(window.location.search).get('channel_id');

  const [showImporter, setShowImporter] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const getProjectRoute = (project) => {
    const s = project.status;
    if (s === 'created' || s === 'topics_ready') return `StoryTopics?project_id=${project.id}`;
    if (s === 'topic_selected') return `StoryDuration?project_id=${project.id}`;
    if (s === 'outline_ready') return `StoryHooks?project_id=${project.id}`;
    if (['hooks_ready', 'scripting', 'script_complete'].includes(s)) return `StoryScript?project_id=${project.id}`;
    if (['voiceover_ready', 'scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready'].includes(s)) return `ContentGeneration?project_id=${project.id}`;
    if (['timeline_editing', 'compiled'].includes(s)) return `TimelineEditor?project_id=${project.id}`;
    if (['post_production', 'published'].includes(s)) return `PostProduction?project_id=${project.id}`;
    return `StoryTopics?project_id=${project.id}`;
  };

  const { data: channel, isLoading: loadingChannel } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: async () => {
      const list = await base44.entities.Channels.filter({ id: channelId });
      return list[0];
    },
    enabled: !!channelId,
  });

  const { data: topics = [], refetch: refetchTopics } = useQuery({
    queryKey: ['channel-topics', channelId],
    queryFn: () => base44.entities.ChannelTopics.filter({ channel_id: channelId }),
    enabled: !!channelId,
  });

  // Derive selected topics from the live topics array so they stay fresh after mutations
  const selectedTopicsLive = selectedDate
    ? topics.filter(t => t.scheduled_date === selectedDate)
    : [];

  const handleDateClick = (date) => {
    setSelectedDate(date);
  };

  const handleStartPipeline = async (topic) => {
    // If topic already has a project, navigate to it
    if (topic.project_id) {
      const existingProjects = await base44.entities.Projects.filter({ id: topic.project_id });
      if (existingProjects[0]) {
        const route = getProjectRoute(existingProjects[0]);
        navigate(createPageUrl(route));
        return;
      }
    }

    // Create a Project from this topic, pre-configured with channel settings
    const project = await base44.entities.Projects.create({
      name: topic.title,
      niche: channel.niche,
      tone: channel.tone || 'dramatic',
      visual_style: channel.visual_style || 'cinematic_realistic',
      video_duration_minutes: topic.format === 'short' ? 1 : (channel.long_form_duration_minutes || 15),
      orientation: topic.format === 'short' ? 'portrait' : 'landscape',
      status: 'created',
      current_step: 0,
      channel_id: channel.id,
      channel_topic_id: topic.id,
      script_strategy_override: channel.script_strategy || '',
    });

    // Auto-create a Topics entity from the channel topic and select it
    const importedTopic = await base44.entities.Topics.create({
      project_id: project.id,
      rank: 1,
      title: topic.title,
      description: topic.notes || `Imported from channel: ${channel.name}`,
      viral_score: 8,
      storytelling_score: 8,
      emotional_score: 8,
      is_selected: true,
    });

    // Mark project as topic_selected so it skips the selection step
    await base44.entities.Projects.update(project.id, {
      selected_topic_id: importedTopic.id,
      status: 'topic_selected',
      current_step: 1,
    });

    // Link channel topic to project
    await base44.entities.ChannelTopics.update(topic.id, {
      project_id: project.id,
      status: 'in_progress',
    });

    // Refresh topic list so UI reflects the change
    queryClient.invalidateQueries({ queryKey: ['channel-topics', channelId] });

    // Navigate directly to StoryTopics where the imported topic is shown with edit option
    navigate(createPageUrl(`StoryTopics?project_id=${project.id}`));
  };

  if (loadingChannel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <p className="text-gray-500">Channel not found</p>
      </div>
    );
  }

  const defaults = getNicheDefaults(channel.niche);
  const color = channel.color || defaults.color;

  const queuedTopics = topics.filter(t => t.status === 'queued');
  const scheduledTopics = topics.filter(t => t.scheduled_date);
  const inProgressTopics = topics.filter(t => t.status === 'in_progress');
  const completedTopics = topics.filter(t => t.status === 'completed' || t.status === 'published');

  let strategy = null;
  if (channel.script_strategy) {
    try { strategy = JSON.parse(channel.script_strategy); } catch (_) {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(createPageUrl('ChannelsHub'))}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${color}15` }}
          >
            {channel.icon_emoji || defaults.emoji}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{channel.name}</h1>
            <p className="text-sm text-gray-500">{channel.niche_label || defaults.label}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImporter(true)}>
              <Upload className="w-4 h-4 mr-1" /> Import Topics
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total Topics', value: topics.length, icon: FileText, color: 'blue' },
            { label: 'Scheduled', value: scheduledTopics.length, icon: Calendar, color: 'green' },
            { label: 'In Progress', value: inProgressTopics.length, icon: Zap, color: 'amber' },
            { label: 'Completed', value: completedTopics.length, icon: Play, color: 'emerald' },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <stat.icon className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-[11px] text-gray-500">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Niche Strategy Card */}
        {strategy && (
          <Card className="mb-6 border-l-4" style={{ borderLeftColor: color }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4" style={{ color }} />
                <h3 className="text-sm font-bold text-gray-800">Viral Script Strategy</h3>
                <Badge className="text-[9px]" style={{ backgroundColor: `${color}15`, color }}>Auto-researched</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-600">
                {strategy.hook_formula && (
                  <div><span className="font-medium text-gray-800">Hook:</span> {strategy.hook_formula}</div>
                )}
                {strategy.structure && (
                  <div><span className="font-medium text-gray-800">Structure:</span> {Array.isArray(strategy.structure) ? strategy.structure.join(' → ') : strategy.structure}</div>
                )}
                {strategy.tone && (
                  <div><span className="font-medium text-gray-800">Tone:</span> {strategy.tone}</div>
                )}
                {strategy.pacing && (
                  <div><span className="font-medium text-gray-800">Pacing:</span> {strategy.pacing}</div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="calendar">
          <TabsList>
            <TabsTrigger value="calendar"><Calendar className="w-3.5 h-3.5 mr-1" /> Calendar</TabsTrigger>
            <TabsTrigger value="topics"><List className="w-3.5 h-3.5 mr-1" /> All Topics ({topics.length})</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-3.5 h-3.5 mr-1" /> Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Card>
                  <CardContent className="p-4">
                    <ContentCalendar
                      topics={topics}
                      channel={channel}
                      onDateClick={handleDateClick}
                    />
                  </CardContent>
                </Card>
              </div>
              <div>
                {selectedDate ? (
                  <DayTopicsPanel
                    date={selectedDate}
                    topics={selectedTopicsLive}
                    channel={channel}
                    onStartPipeline={handleStartPipeline}
                    onClose={() => setSelectedDate(null)}
                  />
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center text-gray-400">
                      <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Click a date to see scheduled topics</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="topics" className="mt-4">
            <Card>
              <CardContent className="p-4">
                {topics.length === 0 ? (
                  <div className="text-center py-10 text-gray-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm mb-3">No topics yet</p>
                    <Button onClick={() => setShowImporter(true)} variant="outline" className="text-xs">
                      <Upload className="w-3 h-3 mr-1" /> Import Topics
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {[...topics].sort((a, b) => (a.scheduled_date || '9999').localeCompare(b.scheduled_date || '9999') || (a.priority || 0) - (b.priority || 0)).map(topic => (
                      <div key={topic.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 text-sm">
                        <Badge className={`text-[10px] ${topic.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                          {topic.format === 'short' ? 'S' : 'L'}
                        </Badge>
                        <span className="flex-1 text-gray-800 truncate">{topic.title}</span>
                        {topic.scheduled_date && (
                          <span className="text-[11px] text-gray-400 flex-shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {topic.scheduled_date}
                          </span>
                        )}
                        <Badge className={`text-[10px] flex-shrink-0 ${
                          topic.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                          topic.status === 'completed' || topic.status === 'published' ? 'bg-green-100 text-green-700' :
                          topic.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {topic.status}
                        </Badge>
                        {(topic.status === 'queued' || topic.status === 'scheduled') && (
                          <Button size="sm" className="h-6 text-[10px] bg-blue-600 hover:bg-blue-700" onClick={() => handleStartPipeline(topic)}>
                            <Play className="w-3 h-3 mr-0.5" /> Start
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-bold text-gray-900">Channel Configuration</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Niche</p>
                    <p className="font-medium">{channel.niche_label || defaults.label}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tone</p>
                    <p className="font-medium capitalize">{channel.tone || 'dramatic'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Shorts per Day</p>
                    <p className="font-medium">{channel.shorts_per_day || 5}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Long-form per Week</p>
                    <p className="font-medium">{channel.longform_per_week || 3}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Short-form Word Limit</p>
                    <p className="font-medium">{channel.short_form_word_limit || 200} words</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Long-form Duration</p>
                    <p className="font-medium">{channel.long_form_duration_minutes || 15} minutes</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <TopicImporter
        open={showImporter}
        onOpenChange={setShowImporter}
        channel={channel}
        onImported={() => refetchTopics()}
      />
    </div>
  );
}