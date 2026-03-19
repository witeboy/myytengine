import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Loader2, Wand2 } from 'lucide-react';

export default function AutoEditButton({ topic, channel, onJobCreated }) {
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  const handleAutoEdit = async (e) => {
    e.stopPropagation();
    setLoading(true);

    try {
      const job = await base44.entities.AutoEditJobs.create({
        channel_id: channel.id,
        topic_id: topic.id,
        title: topic.title,
        status: 'pending',
        progress: 0,
        phase_message: 'Starting auto-edit pipeline...',
        orientation: topic.format === 'short' ? 'portrait' : 'landscape',
        format: (topic.format || 'short').toLowerCase(),
      });

      // Immediately refresh the jobs list so the user sees the new job
      queryClient.invalidateQueries({ queryKey: ['auto-edit-jobs', channel.id] });

      // Fire the pipeline (don't await — it runs in background)
      base44.functions.invoke('autoEditPipeline', { job_id: job.id }).catch(err => {
        console.error('Auto-edit pipeline error:', err);
      });

      onJobCreated?.(job);
    } catch (err) {
      console.error('Failed to create auto-edit job:', err);
    }

    setLoading(false);
  };

  return (
    <Button
      onClick={handleAutoEdit}
      disabled={loading}
      size="sm"
      variant="outline"
      className="gap-1 text-[11px] border-violet-200 text-violet-700 hover:bg-violet-50"
    >
      {loading ? (
        <><Loader2 className="w-3 h-3 animate-spin" /> Starting...</>
      ) : (
        <><Wand2 className="w-3 h-3" /> Auto Edit</>
      )}
    </Button>
  );
}