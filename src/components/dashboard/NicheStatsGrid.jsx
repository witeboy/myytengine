import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';
import {
  TrendingUp, Clock, CheckCircle2, PlayCircle, FileText,
  ArrowRight, Pause, BarChart3, Trash2, Loader2
} from 'lucide-react';

const nicheColors = {
  true_crime: { bg: 'from-red-500 to-red-700', light: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  finance: { bg: 'from-emerald-500 to-emerald-700', light: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  tech: { bg: 'from-blue-500 to-blue-700', light: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  history: { bg: 'from-amber-500 to-amber-700', light: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  education: { bg: 'from-indigo-500 to-indigo-700', light: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  comedy: { bg: 'from-pink-500 to-pink-700', light: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  drama: { bg: 'from-purple-500 to-purple-700', light: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  nollywood: { bg: 'from-orange-500 to-orange-700', light: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  default: { bg: 'from-slate-500 to-slate-700', light: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

function getColors(niche) {
  const key = (niche || '').toLowerCase().replace(/[\s-]/g, '_');
  for (const k of Object.keys(nicheColors)) {
    if (key.includes(k)) return nicheColors[k];
  }
  return nicheColors.default;
}

export default function NicheStatsGrid({ channels, topics, projects, onDelete }) {
  const channelStats = channels.map(ch => {
    const chTopics = topics.filter(t => t.channel_id === ch.id);
    const chProjects = projects.filter(p => p.channel_id === ch.id && !p.archived);
    const completed = chTopics.filter(t => t.status === 'completed' || t.status === 'published').length;
    const inProgress = chTopics.filter(t => t.status === 'in_progress').length;
    const scheduled = chTopics.filter(t => t.status === 'scheduled').length;
    const queued = chTopics.filter(t => t.status === 'queued').length;
    const colors = getColors(ch.niche);

    return {
      ...ch,
      topics: chTopics,
      projects: chProjects,
      completed,
      inProgress,
      scheduled,
      queued,
      totalTopics: chTopics.length,
      colors,
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {channelStats.map(ch => (
        <Link to={`/ChannelDetail?channel_id=${ch.id}`} key={ch.id} className="block">
        <Card
          className={`overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group border ${ch.colors.border}`}
        >
          {/* Color header bar */}
          <div className={`h-2 bg-gradient-to-r ${ch.colors.bg}`} />
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{ch.icon_emoji || '📺'}</span>
                <div>
                  <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{ch.name}</h3>
                  <p className="text-xs text-gray-500">{ch.niche_label || ch.niche}</p>
                </div>
              </div>

              <button
                onClick={function(e) { e.preventDefault(); e.stopPropagation(); onDelete && onDelete(ch.id); }}
                className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded"
                title="Delete niche"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <Badge className={`text-[10px] ${
                ch.status === 'active' ? 'bg-green-100 text-green-700' :
                ch.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {ch.status === 'active' ? <PlayCircle className="w-3 h-3 mr-0.5" /> : <Pause className="w-3 h-3 mr-0.5" />}
                {ch.status}
              </Badge>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className={`rounded-lg p-2 text-center ${ch.colors.light}`}>
                <p className={`text-lg font-bold ${ch.colors.text}`}>{ch.totalTopics}</p>
                <p className="text-[9px] text-gray-500 uppercase">Total</p>
              </div>
              <div className="rounded-lg p-2 text-center bg-amber-50">
                <p className="text-lg font-bold text-amber-700">{ch.inProgress}</p>
                <p className="text-[9px] text-gray-500 uppercase">Active</p>
              </div>
              <div className="rounded-lg p-2 text-center bg-blue-50">
                <p className="text-lg font-bold text-blue-700">{ch.scheduled}</p>
                <p className="text-[9px] text-gray-500 uppercase">Sched.</p>
              </div>
              <div className="rounded-lg p-2 text-center bg-green-50">
                <p className="text-lg font-bold text-green-700">{ch.completed}</p>
                <p className="text-[9px] text-gray-500 uppercase">Done</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>Completion</span>
                <span>{ch.totalTopics > 0 ? Math.round(ch.completed / ch.totalTopics * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full bg-gradient-to-r ${ch.colors.bg} transition-all`}
                  style={{ width: `${ch.totalTopics > 0 ? (ch.completed / ch.totalTopics * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Publishing cadence */}
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {ch.shorts_per_day || 5} shorts/day</span>
              <span>•</span>
              <span>{ch.longform_per_week || 3} long/week</span>
            </div>

            {/* Open + Delete */}
            <div className="mt-3 flex items-center justify-between">
              {onDelete && (
                <button
                  onClick={function(e) { e.preventDefault(); e.stopPropagation(); onDelete(ch.id); }}
                  className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              )}
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </div>
          </CardContent>
        </Card>
        </Link>
      ))}
    </div>
  );
}
