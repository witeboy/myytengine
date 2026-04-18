import React from 'react';
import { CheckCircle, Clock, Loader2, AlertCircle, Flame } from 'lucide-react';

export default function SchedulerStats({ posts }) {
  const counts = posts.reduce(
    (acc, p) => {
      if (p.status === 'scheduled') acc.scheduled++;
      else if (p.status === 'publishing') acc.publishing++;
      else if (p.status === 'published') acc.published++;
      else if (p.status === 'failed') acc.failed++;
      acc.totalScore += p.virality_score || 0;
      return acc;
    },
    { scheduled: 0, publishing: 0, published: 0, failed: 0, totalScore: 0 }
  );

  const avgScore = posts.length > 0 ? Math.round(counts.totalScore / posts.length) : 0;

  const stats = [
    { label: 'Scheduled', value: counts.scheduled, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Publishing', value: counts.publishing, icon: Loader2, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', spin: true },
    { label: 'Published', value: counts.published, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Failed', value: counts.failed, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
    { label: 'Avg Virality', value: avgScore, icon: Flame, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', suffix: '/100' },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {stats.map((s) => (
        <div key={s.label} className={`rounded-lg border ${s.border} ${s.bg} p-2.5`}>
          <div className="flex items-center gap-1.5">
            <s.icon className={`w-3.5 h-3.5 ${s.color} ${s.spin ? 'animate-spin' : ''}`} />
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">{s.label}</span>
          </div>
          <p className={`text-xl font-bold ${s.color} mt-1`}>
            {s.value}
            {s.suffix && <span className="text-xs font-normal text-gray-400">{s.suffix}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}