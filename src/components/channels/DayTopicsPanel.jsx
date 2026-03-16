import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Clock, FileText, Zap } from 'lucide-react';

export default function DayTopicsPanel({ date, topics, onStartPipeline, onClose, channel }) {
  if (!date) return null;

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

  const TopicRow = ({ topic }) => (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{topic.title}</p>
        {topic.notes && <p className="text-[11px] text-gray-400 truncate mt-0.5">{topic.notes}</p>}
      </div>
      <Badge className={`text-[10px] flex-shrink-0 ${topic.format === 'short' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
        {topic.format === 'short' ? <Clock className="w-3 h-3 mr-0.5" /> : <FileText className="w-3 h-3 mr-0.5" />}
        {topic.format === 'short' ? `≤${channel?.short_form_word_limit || 200}w` : `${channel?.long_form_duration_minutes || 15}min`}
      </Badge>
      <Badge className={`text-[10px] flex-shrink-0 ${statusColors[topic.status] || statusColors.queued}`}>
        {topic.status}
      </Badge>
      {(topic.status === 'scheduled' || topic.status === 'queued') && (
        <Button
          size="sm"
          className="h-7 text-xs bg-blue-600 hover:bg-blue-700 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onStartPipeline?.(topic)}
        >
          <Play className="w-3 h-3 mr-1" /> Start
        </Button>
      )}
      {topic.status === 'in_progress' && topic.project_id && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onStartPipeline?.(topic)}
        >
          <Zap className="w-3 h-3 mr-1" /> Continue
        </Button>
      )}
    </div>
  );

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