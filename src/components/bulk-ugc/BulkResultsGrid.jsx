import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, RefreshCw, X, Loader2, Download, Eye } from 'lucide-react';

export default function BulkResultsGrid({ queue, onApprove, onReject, onRegenerate }) {
  const results = queue.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'approved' || j.status === 'rejected');

  if (results.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Results</h3>
        <div className="flex gap-2 text-xs">
          <Badge className="bg-green-100 text-green-700">{queue.filter(j => j.status === 'approved').length} approved</Badge>
          <Badge className="bg-red-100 text-red-700">{queue.filter(j => j.status === 'rejected').length} rejected</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {results.map(job => (
          <ResultCard
            key={job.id}
            job={job}
            onApprove={() => onApprove(job.id)}
            onReject={() => onReject(job.id)}
            onRegenerate={() => onRegenerate(job.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ResultCard({ job, onApprove, onReject, onRegenerate }) {
  const statusColors = {
    completed: 'border-gray-200',
    approved: 'border-green-400 ring-2 ring-green-200',
    rejected: 'border-red-300 opacity-60',
    failed: 'border-red-400',
  };

  return (
    <Card className={`overflow-hidden transition-all ${statusColors[job.status] || 'border-gray-200'}`}>
      <div className="aspect-square relative bg-gray-50">
        {job.status === 'failed' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
            <X className="w-8 h-8 text-red-400 mb-2" />
            <p className="text-[10px] text-red-500">{job.error || 'Generation failed'}</p>
          </div>
        ) : job.result_url ? (
          <img src={job.result_url} alt={job.label} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        )}

        {/* Status badge overlay */}
        {job.status === 'approved' && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow">
            <Check className="w-4 h-4 text-white" />
          </div>
        )}
        {job.status === 'rejected' && (
          <div className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow">
            <X className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      <CardContent className="p-2 space-y-1.5">
        <div className="flex items-center gap-1">
          <span className="text-base">{job.templateEmoji}</span>
          <p className="text-[10px] font-medium truncate flex-1">{job.templateName}</p>
        </div>
        <p className="text-[9px] text-gray-400 truncate">{job.productName}</p>

        {/* Action buttons */}
        {(job.status === 'completed' || job.status === 'approved' || job.status === 'rejected') && (
          <div className="flex gap-1 pt-1">
            {job.status !== 'approved' && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 flex-1 text-green-600 hover:bg-green-50" onClick={onApprove}>
                <Check className="w-3 h-3 mr-0.5" /> Approve
              </Button>
            )}
            {job.status !== 'rejected' && job.status !== 'approved' && (
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-500 hover:bg-red-50" onClick={onReject}>
                <X className="w-3 h-3" />
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-gray-500" onClick={onRegenerate}>
              <RefreshCw className="w-3 h-3" />
            </Button>
          </div>
        )}
        {job.status === 'failed' && (
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 w-full" onClick={onRegenerate}>
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        )}

        {job.status === 'approved' && job.result_url && (
          <a href={job.result_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 w-full text-indigo-600">
              <Download className="w-3 h-3 mr-1" /> Download
            </Button>
          </a>
        )}
      </CardContent>
    </Card>
  );
}