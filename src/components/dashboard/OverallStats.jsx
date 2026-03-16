import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tv, FileText, CheckCircle2, Clock, Film, Zap } from 'lucide-react';

export default function OverallStats({ channels, topics, projects }) {
  const activeChannels = channels.filter(c => c.status === 'active').length;
  const totalTopics = topics.length;
  const completed = topics.filter(t => t.status === 'completed' || t.status === 'published').length;
  const inProgress = topics.filter(t => t.status === 'in_progress').length;
  const scheduled = topics.filter(t => t.status === 'scheduled').length;
  const activeProjects = projects.filter(p => !p.archived).length;

  const stats = [
    { label: 'Active Channels', value: activeChannels, icon: Tv, color: 'from-blue-500 to-indigo-600', link: '/ChannelsHub' },
    { label: 'Total Topics', value: totalTopics, icon: FileText, color: 'from-purple-500 to-violet-600', link: '/ChannelsHub' },
    { label: 'In Progress', value: inProgress, icon: Zap, color: 'from-amber-500 to-orange-600', link: '/ChannelsHub' },
    { label: 'Scheduled', value: scheduled, icon: Clock, color: 'from-cyan-500 to-blue-600', link: '/ChannelsHub' },
    { label: 'Completed', value: completed, icon: CheckCircle2, color: 'from-green-500 to-emerald-600', link: '/ChannelsHub' },
    { label: 'Active Projects', value: activeProjects, icon: Film, color: 'from-rose-500 to-pink-600', link: '/ChannelsHub' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {stats.map(s => (
        <Link key={s.label} to={s.link} className="block">
          <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-sm`}>
                  <s.icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}