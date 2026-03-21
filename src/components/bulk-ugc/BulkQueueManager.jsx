import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, AlertCircle } from 'lucide-react';

export default function BulkQueueManager({ queue }) {
  const pending = queue.filter(j => j.status === 'pending').length;
  const generating = queue.filter(j => j.status === 'generating').length;
  const completed = queue.filter(j => j.status === 'completed').length;
  const failed = queue.filter(j => j.status === 'failed').length;
  const total = queue.length;

  if (total === 0) return null;

  const progress = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Generation Queue</h3>
        <span className="text-xs text-gray-500">{completed + failed}/{total} done</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex gap-3 text-xs">
        {pending > 0 && (
          <div className="flex items-center gap-1 text-gray-500">
            <Clock className="w-3 h-3" /> {pending} queued
          </div>
        )}
        {generating > 0 && (
          <div className="flex items-center gap-1 text-indigo-600">
            <Loader2 className="w-3 h-3 animate-spin" /> {generating} generating
          </div>
        )}
        {completed > 0 && (
          <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">
            {completed} done
          </Badge>
        )}
        {failed > 0 && (
          <div className="flex items-center gap-1 text-red-500">
            <AlertCircle className="w-3 h-3" /> {failed} failed
          </div>
        )}
      </div>
    </div>
  );
}