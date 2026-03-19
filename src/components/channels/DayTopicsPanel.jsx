import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Clock, FileText, Zap, CheckCircle2, Loader2, ChevronDown, ChevronUp, Package, RotateCcw, Globe, Wand2 } from 'lucide-react';
import { ExpandableAssets } from './TopicAssetsPanel';
import AutoEditButton from './AutoEditButton';

export default function DayTopicsPanel({ date, topics, onStartPipeline, onClose, channel, onTopicUpdated }) {
  if (!date) return null;

  const [projectData, setProjectData] = useState({});
  const [actionLoading, setActionLoading] = useState(null);
  const [expandedTopic, setExpandedTopic] = useState(null);

  // Fetch project data for topics that have projects
  useEffect(() => {
    const fetchProjects = async () => {
      const withProject = topics.filter(t => t.project_id);
      if (withProject.length === 0) return;

      const results = {};
      for (const t of withProject) {
        const projects = await base44.entities.Projects.filter({ id: t.project_id });
        results[t.id] = projects[0] || null;
      }
      setProjectData(results);
    };
    fetchProjects();
  }, [topics]);

  const handleRestart = async (topic) => {
    setActionLoading(topic.id);
    // Archive the old project if it exists
    if (topic.project_id) {
      await base44.entities.Projects.update(topic.project_id, { archived: true });
    }
    // Reset topic to scheduled so it starts from scratch
    await base44.entities.ChannelTopics.update(topic.id, { 
      status: 'scheduled', 
      project_id: '' 
    });
    setActionLoading(null);
    onTopicUpdated?.();
  };

  const handleMarkPublished = async (topic) => {
    setActionLoading(topic.id);
    await base44.entities.ChannelTopics.update(topic.id, { status: 'published' });
    setActionLoading(null);
    onTopicUpdated?.();
  };

  const shorts = topics.filter(t => t.format === 'short');
  const longs = topics.filter(t => t.format === 'long');

  const statusColors = {
    queued: 'bg-gray-100 text-gray-600',
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    published: 'bg-emerald-100 text-emerald-800',
    skipped: 'bg-red-100 text-red-600',
  };

  const TopicRow = ({ topic }) => {
    const proj = projectData[topic.id];
    const isArchived = proj ? proj.archived === true : false;
    const isInProgress = topic.status === 'in_progress';
    const isCompleted = topic.status === 'completed';
    const isPublished = topic.status === 'published';
    const canStart = topic.status === 'scheduled' || topic.status === 'queued' || (isInProgress && isArchived);
    // Project has reached post_production or published — can mark topic as done/published
    const projectIsDone = proj && ['post_production', 'published'].includes(proj.status);

    return (
      <div className={`rounded-lg border transition-all overflow-hidden ${
      isPublished ? 'border-emerald-200 bg-emerald-50/30' : isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-100 hover:border-blue-200'
      }`}>
        <div className="flex items-center gap-3 p-3 group">
          {topic.project_id && (
            <button
              onClick={() => setExpandedTopic(expandedTopic === topic.id ? null : topic.id)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 flex-shrink-0"
            >
              {expandedTopic === topic.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          )}
          {!topic.project_id && <div className="w-6 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium truncate ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
              {topic.title}
            </p>
            {topic.ai_notes && <p className="text-[11px] text-purple-500 truncate mt-0.5">🧠 {topic.ai_notes}</p>}
            {!topic.ai_notes && topic.notes && <p className="text-[11px] text-gray-400 truncate mt-0.5">{topic.notes}</p>}
          </div>
          <Badge className={`text-[10px] flex-shrink-0 ${topic.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
            {topic.format === 'short' ? <Clock className="w-3 h-3 mr-0.5" /> : <FileText className="w-3 h-3 mr-0.5" />}
            {topic.format === 'short' ? `≤${channel?.short_form_word_limit || 200}w` : `${channel?.long_form_duration_minutes || 15}min`}
          </Badge>
          {topic.suggested_post_time && (
            <Badge className="text-[9px] flex-shrink-0 bg-blue-50 text-blue-600 border border-blue-200">
              <Clock className="w-2.5 h-2.5 mr-0.5" /> {topic.suggested_post_time}
            </Badge>
          )}

          {isPublished ? (
            <Badge className="text-[10px] flex-shrink-0 bg-emerald-100 text-emerald-800">
              <Globe className="w-3 h-3 mr-0.5" /> Published
            </Badge>
          ) : isCompleted ? (
            <Badge className="text-[10px] flex-shrink-0 bg-green-100 text-green-700">
              <CheckCircle2 className="w-3 h-3 mr-0.5" /> Done
            </Badge>
          ) : (
            <Badge className={`text-[10px] flex-shrink-0 ${statusColors[isArchived ? 'scheduled' : topic.status] || statusColors.queued}`}>
              {isArchived ? 'ready' : topic.status}
            </Badge>
          )}

          {topic.project_id && (
            <Package className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" title="Has assets" />
          )}

          {canStart && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <AutoEditButton topic={topic} channel={channel} onJobCreated={() => onTopicUpdated?.()} />
              <Button
                size="sm"
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  if (isArchived) {
                    handleRestart(topic);
                  } else {
                    onStartPipeline?.(topic);
                  }
                }}
              >
                <Play className="w-3 h-3 mr-1" /> Start
              </Button>
            </div>
          )}

          {isInProgress && !isArchived && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onStartPipeline?.(topic)}
              >
                <Zap className="w-3 h-3 mr-1" /> Continue
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => handleRestart(topic)}
                disabled={actionLoading === topic.id}
              >
                {actionLoading === topic.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RotateCcw className="w-3 h-3 mr-1" /> Restart</>}
              </Button>
              {projectIsDone && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => handleMarkPublished(topic)}
                  disabled={actionLoading === topic.id}
                >
                  {actionLoading === topic.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Globe className="w-3 h-3 mr-1" /> Published</>}
                </Button>
              )}
            </div>
          )}

          {isCompleted && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onStartPipeline?.(topic)}
              >
                <Zap className="w-3 h-3 mr-1" /> Continue
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => handleRestart(topic)}
                disabled={actionLoading === topic.id}
              >
                {actionLoading === topic.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RotateCcw className="w-3 h-3 mr-1" /> Restart</>}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                onClick={() => handleMarkPublished(topic)}
                disabled={actionLoading === topic.id}
              >
                {actionLoading === topic.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Globe className="w-3 h-3 mr-1" /> Published</>}
              </Button>
            </div>
          )}

          {isPublished && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => handleRestart(topic)}
                disabled={actionLoading === topic.id}
              >
                {actionLoading === topic.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><RotateCcw className="w-3 h-3 mr-1" /> Restart</>}
              </Button>
            </div>
          )}
        </div>
        <ExpandableAssets projectId={topic.project_id} topicTitle={topic.title} isOpen={expandedTopic === topic.id} />
      </div>
    );
  };

  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <Card className="border-blue-200 shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">{formattedDate}</h3>
            <p className="text-xs text-gray-500">{topics.length} topic{topics.length !== 1 ? 's' : ''} scheduled</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">✕ Close</Button>
        </div>

        {topics.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No topics scheduled for this date</p>
        ) : (
          <div className="space-y-4">
            {shorts.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-2">
                  Short-form ({shorts.length})
                </p>
                <div className="space-y-1.5">
                  {shorts.map(t => <TopicRow key={t.id} topic={t} />)}
                </div>
              </div>
            )}
            {longs.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide mb-2">
                  Long-form ({longs.length})
                </p>
                <div className="space-y-1.5">
                  {longs.map(t => <TopicRow key={t.id} topic={t} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}