import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Clock, FileText, Zap, CheckCircle2, Loader2 } from 'lucide-react';

export default function DayTopicsPanel({ date, topics, onStartPipeline, onClose, channel, onTopicUpdated }) {
  if (!date) return null;

  const [archivedProjects, setArchivedProjects] = useState({});
  const [markingDone, setMarkingDone] = useState(null);

  // Check if in_progress topics have archived projects
  useEffect(() => {
    const checkArchived = async () => {
      const inProgressWithProject = topics.filter(t => t.status === 'in_progress' && t.project_id);
      if (inProgressWithProject.length === 0) return;

      const results = {};
      for (const t of inProgressWithProject) {
        const projects = await base44.entities.Projects.filter({ id: t.project_id });
        const proj = projects[0];
        results[t.id] = !proj || proj.archived === true;
      }
      setArchivedProjects(results);
    };
    checkArchived();
  }, [topics]);

  const handleMarkDone = async (topic) => {
    setMarkingDone(topic.id);
    await base44.entities.ChannelTopics.update(topic.id, { status: 'completed' });
    setMarkingDone(null);
    onTopicUpdated?.();
  };

  const handleRestart = async (topic) => {
    // Reset topic so it can be started fresh
    await base44.entities.ChannelTopics.update(topic.id, { 
      status: 'scheduled', 
      project_id: '' 
    });
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
    const isArchived = archivedProjects[topic.id] === true;
    const isInProgress = topic.status === 'in_progress';
    const isCompleted = topic.status === 'completed' || topic.status === 'published';
    const canStart = topic.status === 'scheduled' || topic.status === 'queued' || (isInProgress && isArchived);

    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border transition-all group ${
        isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-100 hover:border-blue-200 hover:bg-blue-50/30'
      }`}>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
            {topic.title}
          </p>
          {topic.notes && <p className="text-[11px] text-gray-400 truncate mt-0.5">{topic.notes}</p>}
        </div>
        <Badge className={`text-[10px] flex-shrink-0 ${topic.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
          {topic.format === 'short' ? <Clock className="w-3 h-3 mr-0.5" /> : <FileText className="w-3 h-3 mr-0.5" />}
          {topic.format === 'short' ? `≤${channel?.short_form_word_limit || 200}w` : `${channel?.long_form_duration_minutes || 15}min`}
        </Badge>

        {isCompleted ? (
          <Badge className="text-[10px] flex-shrink-0 bg-green-100 text-green-700">
            <CheckCircle2 className="w-3 h-3 mr-0.5" /> Done
          </Badge>
        ) : (
          <Badge className={`text-[10px] flex-shrink-0 ${statusColors[isArchived ? 'scheduled' : topic.status] || statusColors.queued}`}>
            {isArchived ? 'ready' : topic.status}
          </Badge>
        )}

        {/* Action buttons */}
        {canStart && (
          <Button
            size="sm"
            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"
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
              className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => handleMarkDone(topic)}
              disabled={markingDone === topic.id}
            >
              {markingDone === topic.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <><CheckCircle2 className="w-3 h-3 mr-1" /> Done</>
              )}
            </Button>
          </div>
        )}
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