import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Upload, Calendar, List, Settings, Loader2, Play,
  FileText, Clock, Zap, ArrowRight, ChevronDown, ChevronUp, Package, Sparkles
} from 'lucide-react';
import { getNicheDefaults } from '@/components/channels/NicheCard';
import ContentCalendar from '@/components/channels/ContentCalendar';
import DayTopicsPanel from '@/components/channels/DayTopicsPanel';
import TopicImporter from '@/components/channels/TopicImporter';
import NicheInsightsPanel from '@/components/channels/NicheInsightsPanel';
import CompetitorPanel from '@/components/channels/CompetitorPanel';
import TopicStatusPanel from '@/components/channels/TopicStatusPanel';
import { ExpandableAssets } from '@/components/channels/TopicAssetsPanel';
import ScriptModeSelector from '@/components/channels/ScriptModeSelector';
import EditableTopicTitle from '@/components/channels/EditableTopicTitle';
import AITitleGenerator from '@/components/channels/AITitleGenerator';
import AutoEditButton from '@/components/channels/AutoEditButton';
import AutoEditJobsList from '@/components/channels/AutoEditJobsList';

export default function ChannelDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channelId = new URLSearchParams(window.location.search).get('channel_id');

  const [showImporter, setShowImporter] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [activeStatFilter, setActiveStatFilter] = useState(null);
  const [expandedTopicAll, setExpandedTopicAll] = useState(null);
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  const getProjectRoute = (project) => {
    const s = project.status;
    const isSleep = project.project_mode === 'sleep_meditation' || project.project_mode === 'sleep_story';
    if (s === 'created' || s === 'topics_ready') return `StoryTopics?project_id=${project.id}`;
    if (s === 'topic_selected') return `StoryDuration?project_id=${project.id}`;
    if (['outline_ready', 'hooks_ready', 'scripting', 'script_complete'].includes(s)) return `StoryScript?project_id=${project.id}`;
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

  const selectedTopicsLive = selectedDate
    ? topics.filter(t => t.scheduled_date === selectedDate)
    : [];

  const handleDateClick = (date) => {
    setSelectedDate(date);
  };

  const handleStartPipeline = async (topic) => {
    if (topic.project_id) {
      const existingProjects = await base44.entities.Projects.filter({ id: topic.project_id });
      if (existingProjects[0]) {
        const ep = existingProjects[0];
        // Route sleep projects to their own pipeline
        if (ep.project_mode === 'sleep_meditation' || ep.project_mode === 'sleep_story') {
          navigate(`/SleepPipeline?project_id=${ep.id}`);
          return;
        }
        // Route shorts projects to their own pipeline
        if (ep.project_mode === 'youtube_shorts') {
          navigate(`/ShortsPipeline?project_id=${ep.id}`);
          return;
        }
        const route = getProjectRoute(ep);
        navigate(`/${route}`);
        return;
      }
    }

    const scriptMode = channel.script_mode || 'standard';
    const isSleep = scriptMode === 'sleep_meditation' || scriptMode === 'sleep_story';
    const isShorts = scriptMode === 'youtube_shorts';

    const project = await base44.entities.Projects.create({
      name: topic.title,
      niche: channel.niche,
      tone: isSleep ? 'soothing' : (channel.tone || 'dramatic'),
      visual_style: channel.visual_style || 'cinematic_realistic',
      video_duration_minutes: isShorts ? 1.5 : (topic.format === 'short' ? 1 : (channel.long_form_duration_minutes || 15)),
      orientation: isShorts ? 'portrait' : (topic.format === 'short' ? 'portrait' : 'landscape'),
      status: 'created',
      current_step: 0,
      channel_id: channel.id,
      channel_topic_id: topic.id,
      script_strategy_override: channel.script_strategy || '',
      project_mode: isSleep ? scriptMode : (isShorts ? 'youtube_shorts' : ''),
    });

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

    await base44.entities.Projects.update(project.id, {
      selected_topic_id: importedTopic.id,
      status: 'topic_selected',
      current_step: 1,
    });

    await base44.entities.ChannelTopics.update(topic.id, {
      project_id: project.id,
      status: 'in_progress',
    });

    queryClient.invalidateQueries({ queryKey: ['channel-topics', channelId] });

    // Route to dedicated pipelines
    if (isSleep) {
      navigate(`/SleepPipeline?project_id=${project.id}`);
    } else if (isShorts) {
      navigate(`/ShortsPipeline?project_id=${project.id}`);
    } else {
      navigate(`/StoryTopics?project_id=${project.id}`);
    }
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
          <Button variant="ghost" size="icon" onClick={() => navigate('/ChannelsHub')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${color}15` }}
          >
            {channel.icon_emoji || defaults.emoji}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{channel.name}</h1>
              {channel.script_mode && channel.script_mode !== 'standard' && (
                <Badge className={`text-[10px] ${channel.script_mode === 'youtube_shorts' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {channel.script_mode === 'youtube_shorts' ? '📱 YouTube Shorts' : channel.script_mode === 'sleep_meditation' ? '🧘 Sleep Meditation' : '🌙 Sleep Story'}
                </Badge>
              )}
            </div>
            <p className="text-sm text-gray-500">{channel.niche_label || defaults.label}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowAIGenerator(true)} className="border-purple-200 text-purple-700 hover:bg-purple-50">
              <Sparkles className="w-4 h-4 mr-1" /> AI Generate 100 Titles
            </Button>
            <Button variant="outline" onClick={() => setShowImporter(true)}>
              <Upload className="w-4 h-4 mr-1" /> Import Topics
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { key: 'total', label: 'Total Topics', value: topics.length, icon: FileText, hex: '#3b82f6' },
            { key: 'scheduled', label: 'Scheduled', value: scheduledTopics.length, icon: Calendar, hex: '#22c55e' },
            { key: 'in_progress', label: 'In Progress', value: inProgressTopics.length, icon: Zap, hex: '#f59e0b' },
            { key: 'completed', label: 'Completed', value: completedTopics.length, icon: Play, hex: '#10b981' },
          ].map(stat => (
            <div
              key={stat.key}
              onClick={() => setActiveStatFilter(activeStatFilter === stat.key ? null : stat.key)}
              className={`cursor-pointer transition-all hover:shadow-md rounded-xl border bg-card text-card-foreground shadow ${activeStatFilter === stat.key ? 'ring-2 ring-offset-1' : ''}`}
              style={activeStatFilter === stat.key ? { borderColor: stat.hex, '--tw-ring-color': stat.hex } : {}}
            >
              <div className="p-4 flex items-center gap-3">
                <stat.icon className="w-5 h-5" style={{ color: stat.hex }} />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-[11px] text-gray-500">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filtered Topic Panel */}
        {activeStatFilter && (
          <div className="mb-6">
            <TopicStatusPanel
              title={
                activeStatFilter === 'total' ? 'All Topics' :
                activeStatFilter === 'scheduled' ? 'Scheduled Topics' :
                activeStatFilter === 'in_progress' ? 'In Progress' :
                'Completed'
              }
              icon={
                activeStatFilter === 'total' ? FileText :
                activeStatFilter === 'scheduled' ? Calendar :
                activeStatFilter === 'in_progress' ? Zap :
                Play
              }
              topics={
                activeStatFilter === 'total' ? topics :
                activeStatFilter === 'scheduled' ? scheduledTopics :
                activeStatFilter === 'in_progress' ? inProgressTopics :
                completedTopics
              }
              color={
                activeStatFilter === 'total' ? '#3b82f6' :
                activeStatFilter === 'scheduled' ? '#22c55e' :
                activeStatFilter === 'in_progress' ? '#f59e0b' :
                '#10b981'
              }
              onClose={() => setActiveStatFilter(null)}
              onStartPipeline={handleStartPipeline}
              onTopicUpdated={() => refetchTopics()}
            />
          </div>
        )}

        {/* Auto-Edit Pipeline Jobs */}
        <div className="mb-4">
          <AutoEditJobsList channelId={channelId} />
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

        {/* Competitor Monitor - inline for this channel */}
        <div className="mb-6">
          <CompetitorPanel channel={channel} onTopicsChanged={() => refetchTopics()} />
        </div>

        {/* AI Insights Panel */}
        <div className="mb-6">
          <NicheInsightsPanel
            channel={channel}
            onRefreshed={() => queryClient.invalidateQueries({ queryKey: ['channel', channelId] })}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="calendar">
          <TabsList>
            <TabsTrigger value="calendar"><Calendar className="w-3.5 h-3.5 mr-1" /> Calendar</TabsTrigger>
            <TabsTrigger value="topics"><List className="w-3.5 h-3.5 mr-1" /> All Topics ({topics.length})</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-3.5 h-3.5 mr-1" /> Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-4 space-y-4">
            <Card>
              <CardContent className="p-4">
                <ContentCalendar
                  topics={topics}
                  channel={channel}
                  onDateClick={handleDateClick}
                />
              </CardContent>
            </Card>
            {selectedDate ? (
              <DayTopicsPanel
                date={selectedDate}
                topics={selectedTopicsLive}
                channel={channel}
                onStartPipeline={handleStartPipeline}
                onClose={() => setSelectedDate(null)}
                onTopicUpdated={() => refetchTopics()}
              />
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-gray-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Click a date to see scheduled topics</p>
                </CardContent>
              </Card>
            )}
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
                      <div key={topic.id} className="rounded-lg border border-gray-100 overflow-hidden">
                        <div className="flex items-center gap-3 p-2.5 hover:bg-gray-50 text-sm cursor-pointer group">
                          {topic.project_id && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedTopicAll(expandedTopicAll === topic.id ? null : topic.id); }}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 flex-shrink-0"
                            >
                              {expandedTopicAll === topic.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                          )}
                          {!topic.project_id && <div className="w-6 flex-shrink-0" />}
                          <Badge className={`text-[10px] ${topic.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                            {topic.format === 'short' ? 'S' : 'L'}
                          </Badge>
                          <div className="flex-1 min-w-0" onClick={() => handleStartPipeline(topic)}>
                            <EditableTopicTitle topic={topic} onUpdated={() => refetchTopics()} />
                          </div>
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
                          {topic.project_id && (
                            <Package className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" title="Has assets" />
                          )}
                          <AutoEditButton
                            topic={topic}
                            channel={channel}
                            onJobCreated={() => queryClient.invalidateQueries({ queryKey: ['auto-edit-jobs', channelId] })}
                          />
                          <ArrowRight
                            className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition-colors flex-shrink-0"
                            onClick={() => handleStartPipeline(topic)}
                          />
                        </div>
                        <ExpandableAssets projectId={topic.project_id} topicTitle={topic.title} isOpen={expandedTopicAll === topic.id} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-4 space-y-4">
            <Card>
              <CardContent className="p-6">
                <ScriptModeSelector
                  value={channel.script_mode || 'standard'}
                  onChange={async (mode) => {
                    await base44.entities.Channels.update(channel.id, { script_mode: mode });
                    queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
                  }}
                />
                {channel.script_mode === 'youtube_shorts' && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium text-gray-800 mb-2">Shorts Niche</p>
                    <p className="text-xs text-gray-500 mb-3">Determines the script structure, hook style, and visual spec for your Shorts</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { id: 'finance', label: '💰 Finance / Wealth', desc: 'Hook → Tension → Pivot → 3 Rules → CTA' },
                        { id: 'book', label: '📚 Book Summaries', desc: 'Hook → Context → 3 Lessons → Transformation → CTA' },
                      ].map(n => (
                        <button
                          key={n.id}
                          onClick={async () => {
                            await base44.entities.Channels.update(channel.id, { shorts_niche: n.id });
                            queryClient.invalidateQueries({ queryKey: ['channel', channelId] });
                          }}
                          className={`text-left p-3 rounded-lg border-2 transition-all ${
                            (channel.shorts_niche || 'finance') === n.id
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <p className="text-sm font-medium text-gray-900">{n.label}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{n.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
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

      <AITitleGenerator
        open={showAIGenerator}
        onOpenChange={setShowAIGenerator}
        channel={channel}
        existingTopics={topics}
        onComplete={() => refetchTopics()}
      />
    </div>
  );
}