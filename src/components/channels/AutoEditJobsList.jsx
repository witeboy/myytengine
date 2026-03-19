import React, { useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, CheckCircle2, XCircle, Eye,
  Clock, AlertCircle, Wand2
} from 'lucide-react';

const ACTIVE_STATUSES = ['pending', 'searching_media', 'assembling_timeline', 'applying_effects', 'exporting'];

const STATUS_CONFIG = {
  pending:            { color: 'bg-gray-100 text-gray-600', icon: Clock, label: 'Pending' },
  searching_media:    { color: 'bg-blue-100 text-blue-700', icon: Loader2, label: 'Searching Media', animate: true },
  assembling_timeline:{ color: 'bg-indigo-100 text-indigo-700', icon: Loader2, label: 'Assembling', animate: true },
  applying_effects:   { color: 'bg-purple-100 text-purple-700', icon: Loader2, label: 'Adding Effects', animate: true },
  exporting:          { color: 'bg-amber-100 text-amber-700', icon: Loader2, label: 'Exporting', animate: true },
  ready_for_review:   { color: 'bg-green-100 text-green-700', icon: CheckCircle2, label: 'Ready for Review' },
  approved:           { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Approved' },
  rejected:           { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Rejected' },
  failed:             { color: 'bg-red-100 text-red-700', icon: AlertCircle, label: 'Failed' },
};

export default function AutoEditJobsList({ channelId }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: jobs = [] } = useQuery({
    queryKey: ['auto-edit-jobs', channelId],
    queryFn: () => base44.entities.AutoEditJobs.filter({ channel_id: channelId }),
    enabled: !!channelId,
    refetchInterval: (query) => {
      // Poll aggressively (2s) when there are active jobs, otherwise 15s
      const data = query.state.data || [];
      const hasActive = data.some(j => ACTIVE_STATUSES.includes(j.status));
      return hasActive ? 2000 : 15000;
    },
  });

  // Real-time subscription for instant updates
  useEffect(() => {
    if (!channelId) return;
    const unsubscribe = base44.entities.AutoEditJobs.subscribe((event) => {
      queryClient.invalidateQueries({ queryKey: ['auto-edit-jobs', channelId] });
    });
    return unsubscribe;
  }, [channelId, queryClient]);

  if (jobs.length === 0) return null;

  const activeJobs = jobs.filter(j => !['approved', 'rejected'].includes(j.status));
  const sortedJobs = [...activeJobs].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  if (sortedJobs.length === 0) return null;

  return (
    <Card className="border-violet-200 bg-gradient-to-r from-violet-50/50 to-purple-50/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-4 h-4 text-violet-600" />
          <h3 className="text-sm font-bold text-gray-800">Auto-Edit Pipeline</h3>
          <Badge className="text-[9px] bg-violet-100 text-violet-700">{sortedJobs.length} active</Badge>
        </div>
        <div className="space-y-2">
          {sortedJobs.slice(0, 5).map(job => {
            const config = STATUS_CONFIG[job.status] || STATUS_CONFIG.pending;
            const Icon = config.icon;
            const isActive = ['searching_media', 'assembling_timeline', 'applying_effects', 'exporting'].includes(job.status);

            return (
              <div key={job.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/80 border border-gray-100">
                <Icon className={`w-4 h-4 flex-shrink-0 ${config.animate ? 'animate-spin' : ''}`}
                  style={{ color: job.status === 'failed' ? '#ef4444' : job.status === 'ready_for_review' ? '#22c55e' : '#7c3aed' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{job.title}</p>
                  <p className="text-[10px] text-gray-500 truncate">{job.phase_message || config.label}</p>
                  {isActive && (
                    <Progress value={job.progress || 0} className="h-1 mt-1" />
                  )}
                </div>
                <Badge className={`text-[9px] ${config.color}`}>{config.label}</Badge>
                {job.status === 'ready_for_review' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] gap-1 border-green-200 text-green-700 hover:bg-green-50 h-7"
                    onClick={() => navigate(`/AutoEditReview?job_id=${job.id}`)}
                  >
                    <Eye className="w-3 h-3" /> Review
                  </Button>
                )}
                {job.status === 'failed' && (
                  <span className="text-[10px] text-red-500 max-w-[120px] truncate" title={job.error_message}>
                    {job.error_message?.slice(0, 40)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}