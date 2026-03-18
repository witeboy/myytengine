import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Play, Clock, ArrowRight, FileText, ChevronDown, ChevronUp, Package, RotateCcw, Globe, Zap, CheckCircle2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

import { ExpandableAssets } from './TopicAssetsPanel';

const statusColors = {
  queued: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  published: 'bg-green-100 text-green-700',
  skipped: 'bg-red-100 text-red-600',
};

export default function TopicStatusPanel({ title, icon: Icon, topics, onClose, onStartPipeline, onTopicUpdated, color }) {
  const navigate = useNavigate();
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const handleRestart = async (topic) => {
    setActionLoading(topic.id);
    await base44.entities.ChannelTopics.update(topic.id, { status: 'scheduled', project_id: '' });
    setActionLoading(null);
    onTopicUpdated?.();
  };

  const handleMarkDone = async (topic) => {
    setActionLoading(topic.id);
    await base44.entities.ChannelTopics.update(topic.id, { status: 'completed' });
    setActionLoading(null);
    onTopicUpdated?.();
  };

  const handleMarkPublished = async (topic) => {
    setActionLoading(topic.id);
    await base44.entities.ChannelTopics.update(topic.id, { status: 'published' });
    setActionLoading(null);
    onTopicUpdated?.();
  };

  const handleTopicClick = async (topic) => {
    if (topic.project_id) {
      // Navigate to existing project
      const projects = await (await import('@/api/base44Client')).base44.entities.Projects.filter({ id: topic.project_id });
      if (projects[0]) {
        const route = getProjectRoute(projects[0]);
        navigate(`/${route}`);
        return;
      }
    }
    // No project yet — start pipeline
    onStartPipeline(topic);
  };

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


  return (
    <Card className="border-l-4 animate-in slide-in-from-top-2 duration-200" style={{ borderLeftColor: color }}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" style={{ color }} />
            <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
            <Badge className="text-[10px]" style={{ backgroundColor: `${color}20`, color }}>
              {topics.length}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {topics.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No topics in this category</p>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto space-y-1.5 pr-1">
            {topics.map(topic => (
              <div key={topic.id} className="rounded-lg border border-gray-100 overflow-hidden">
                <div
                  className="flex items-center gap-3 p-2.5 hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  {topic.project_id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedTopic(expandedTopic === topic.id ? null : topic.id); }}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 flex-shrink-0"
                    >
                      {expandedTopic === topic.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                  )}
                  {!topic.project_id && <div className="w-6 flex-shrink-0" />}
                  <Badge className={`text-[10px] flex-shrink-0 ${topic.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                    {topic.format === 'short' ? 'S' : 'L'}
                  </Badge>
                  <div className="flex-1 min-w-0" onClick={() => handleTopicClick(topic)}>
                    <p className="text-sm text-gray-800 truncate">{topic.title}</p>
                    {topic.scheduled_date && (
                      <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" /> {topic.scheduled_date}
                      </p>
                    )}
                  </div>
                  <Badge className={`text-[10px] flex-shrink-0 ${statusColors[topic.status] || 'bg-gray-100 text-gray-600'}`}>
                    {topic.status === 'published' ? <><Globe className="w-3 h-3 mr-0.5 inline" /> Published</> : topic.status}
                  </Badge>
                  {topic.project_id && (
                    <Package className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" title="Has assets" />
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {topic.status === 'in_progress' && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleTopicClick(topic); }} className="h-6 px-2 text-[10px] font-medium rounded border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-0.5">
                          <Zap className="w-3 h-3" /> Continue
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleRestart(topic); }} className="h-6 px-2 text-[10px] font-medium rounded border border-orange-200 text-orange-700 hover:bg-orange-50 flex items-center gap-0.5">
                          <RotateCcw className="w-3 h-3" /> Restart
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleMarkDone(topic); }} disabled={actionLoading === topic.id} className="h-6 px-2 text-[10px] font-medium rounded border border-green-200 text-green-700 hover:bg-green-50 flex items-center gap-0.5">
                          {actionLoading === topic.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3" /> Done</>}
                        </button>
                      </>
                    )}
                    {topic.status === 'completed' && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); handleTopicClick(topic); }} className="h-6 px-2 text-[10px] font-medium rounded border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-0.5">
                          <Zap className="w-3 h-3" /> Continue
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleRestart(topic); }} className="h-6 px-2 text-[10px] font-medium rounded border border-orange-200 text-orange-700 hover:bg-orange-50 flex items-center gap-0.5">
                          <RotateCcw className="w-3 h-3" /> Restart
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleMarkPublished(topic); }} disabled={actionLoading === topic.id} className="h-6 px-2 text-[10px] font-medium rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center gap-0.5">
                          {actionLoading === topic.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Globe className="w-3 h-3" /> Published</>}
                        </button>
                      </>
                    )}
                    {topic.status === 'published' && (
                      <button onClick={(e) => { e.stopPropagation(); handleRestart(topic); }} className="h-6 px-2 text-[10px] font-medium rounded border border-orange-200 text-orange-700 hover:bg-orange-50 flex items-center gap-0.5">
                        <RotateCcw className="w-3 h-3" /> Restart
                      </button>
                    )}
                    {(topic.status === 'scheduled' || topic.status === 'queued') && (
                      <button onClick={(e) => { e.stopPropagation(); onStartPipeline(topic); }} className="h-6 px-2 text-[10px] font-medium rounded border border-blue-200 text-blue-700 hover:bg-blue-50 flex items-center gap-0.5">
                        <Play className="w-3 h-3" /> Start
                      </button>
                    )}
                  </div>
                </div>
                <ExpandableAssets projectId={topic.project_id} topicTitle={topic.title} isOpen={expandedTopic === topic.id} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}