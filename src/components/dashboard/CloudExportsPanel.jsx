import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Cloud, Download, Trash2, Loader2, Film, HardDrive,
  RefreshCw, ExternalLink, FolderOpen
} from 'lucide-react';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatSize(mb) {
  const num = parseFloat(mb);
  if (num >= 1000) return `${(num / 1000).toFixed(1)} GB`;
  return `${num} MB`;
}

export default function CloudExportsPanel() {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['r2-exports'],
    queryFn: async () => {
      const res = await base44.functions.invoke('listR2Exports', {});
      return res.data || res;
    },
    staleTime: 30000,
  });

  const files = data?.files || [];
  const totalSize = files.reduce((sum, f) => sum + parseFloat(f.size_mb || 0), 0);

  const handleDelete = async (file) => {
    if (!confirm(`Delete "${file.filename}"? This cannot be undone.`)) return;
    setDeleting(file.key);
    try {
      await base44.functions.invoke('listR2Exports', { action: 'delete', key: file.key });
      queryClient.invalidateQueries({ queryKey: ['r2-exports'] });
    } catch (err) {
      console.error('Delete failed:', err);
    }
    setDeleting(null);
  };

  const handleDownload = (file) => {
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.filename;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Group by project
  const byProject = {};
  files.forEach(f => {
    const pid = f.project_id || 'general';
    if (!byProject[pid]) byProject[pid] = [];
    byProject[pid].push(f);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        <span className="text-gray-500">Loading cloud exports...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-red-500 text-sm mb-3">Failed to load cloud exports</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-16">
        <Cloud className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-700">No cloud exports yet</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          When you export a video from the Timeline Editor, it will automatically be uploaded to cloud storage and appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1.5">
            <Film className="w-3 h-3" /> {files.length} file{files.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <HardDrive className="w-3 h-3" /> {formatSize(totalSize)} total
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Files grouped by project */}
      {Object.entries(byProject).map(([projectId, projectFiles]) => (
        <div key={projectId}>
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">
              {projectId === 'general' ? 'General' : `Project ${projectId.substring(0, 8)}...`}
            </span>
            <Badge variant="secondary" className="text-[10px]">{projectFiles.length}</Badge>
          </div>

          <div className="grid gap-2">
            {projectFiles.map(file => (
              <Card key={file.key} className="overflow-hidden">
                <CardContent className="p-3 flex items-center gap-3">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Film className="w-5 h-5 text-blue-600" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.filename}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <span>{formatSize(file.size_mb)}</span>
                      <span>·</span>
                      <span>{formatDate(file.uploaded_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-500 hover:text-blue-600"
                      onClick={() => handleDownload(file)}
                      title="Download"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:text-blue-600 hover:bg-accent"
                      title="Open in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-red-600"
                      onClick={() => handleDelete(file)}
                      disabled={deleting === file.key}
                      title="Delete"
                    >
                      {deleting === file.key
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}