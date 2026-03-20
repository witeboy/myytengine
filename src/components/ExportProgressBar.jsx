import React from 'react';
import { useExport } from '@/lib/ExportContext';
import { Progress } from '@/components/ui/progress';
import { Download, X, Loader2, CheckCircle, AlertCircle, Film, Cloud, CloudOff } from 'lucide-react';

const PHASE_LABELS = {
  checking: 'Checking browser...',
  loading: 'Loading media...',
  encoding: 'Encoding frames...',
  audio: 'Mixing audio...',
  finalizing: 'Finalizing MP4...',
  done: 'Export complete!',
};

export default function ExportProgressBar() {
  const { jobs, dismissJob, downloadJob } = useExport();
  const activeJobs = Object.entries(jobs);

  if (activeJobs.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {activeJobs.map(([projectId, job]) => (
        <div
          key={projectId}
          className={`rounded-xl shadow-2xl border backdrop-blur-md p-3 transition-all ${
            job.status === 'done'
              ? 'bg-green-50/95 border-green-300'
              : job.status === 'failed'
              ? 'bg-red-50/95 border-red-300'
              : 'bg-white/95 border-gray-200'
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              {job.status === 'exporting' && <Loader2 className="w-4 h-4 animate-spin text-blue-600 flex-shrink-0" />}
              {job.status === 'done' && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />}
              {job.status === 'failed' && <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
              <span className="text-sm font-medium truncate">{job.projectName}</span>
            </div>
            <button
              onClick={() => dismissJob(projectId)}
              className="text-gray-400 hover:text-gray-600 p-0.5 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Exporting state */}
          {job.status === 'exporting' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>{PHASE_LABELS[job.phase] || 'Processing...'}</span>
                <span className="font-mono">{job.progress}%</span>
              </div>
              <Progress value={job.progress} className="h-1.5" />
              <p className="text-[10px] text-gray-400">You can navigate away — export continues in background</p>
            </div>
          )}

          {/* Done state */}
          {job.status === 'done' && (
            <div className="space-y-2">
              <p className="text-xs text-green-700">{job.fileSize} MB ready to download</p>
              <button
                onClick={() => downloadJob(projectId)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download MP4
              </button>
              {/* R2 upload status */}
              {job.r2Status === 'uploading' && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 rounded-md px-2 py-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Uploading to cloud... {job.r2Progress > 0 ? `${job.r2Progress}%` : ''}
                  </div>
                  {job.r2Progress > 0 && (
                    <div className="w-full bg-blue-100 rounded-full h-1">
                      <div className="bg-blue-500 h-1 rounded-full transition-all duration-300" style={{ width: `${job.r2Progress}%` }} />
                    </div>
                  )}
                </div>
              )}
              {job.r2Status === 'done' && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 rounded-md px-2 py-1">
                  <Cloud className="w-3 h-3" />
                  Saved to cloud
                </div>
              )}
              {job.r2Status === 'failed' && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-md px-2 py-1">
                  <CloudOff className="w-3 h-3" />
                  Cloud upload failed
                </div>
              )}
            </div>
          )}

          {/* Failed state */}
          {job.status === 'failed' && (
            <p className="text-xs text-red-600">{job.error || 'Export failed'}</p>
          )}
        </div>
      ))}
    </div>
  );
}