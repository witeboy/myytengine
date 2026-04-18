import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Clock, Calendar, Flame, Youtube, ExternalLink, Hash,
  FileText, Tag, Trash2, AlertCircle, Loader2, CheckCircle, Play,
} from 'lucide-react';

const STATUS_STYLES = {
  scheduled:    { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Scheduled', Icon: Clock },
  publishing:   { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Publishing…', Icon: Loader2 },
  published:    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Published', Icon: CheckCircle },
  failed:       { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Failed', Icon: AlertCircle },
  cancelled:    { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', label: 'Cancelled', Icon: AlertCircle },
  ready_to_post:{ bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Ready', Icon: CheckCircle },
};

function formatDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function ClipPreviewModal({ post, open, onClose, onCancel }) {
  if (!post) return null;

  const status = STATUS_STYLES[post.status] || STATUS_STYLES.scheduled;
  const StatusIcon = status.Icon;
  let clipData = {};
  try {
    clipData = typeof post.clip_data === 'string' ? JSON.parse(post.clip_data) : (post.clip_data || {});
  } catch (_) { clipData = {}; }

  const tags = (post.tags || '').split(',').map((t) => t.trim()).filter(Boolean);
  const hashtags = (post.hashtags || '').split(/\s+/).filter(Boolean);
  const clipUrl = post.clip_url || post.video_url || '';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 pr-8">
            <Youtube className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="truncate">{post.title_primary || 'Untitled Clip'}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-4">
          {/* Status + Schedule info */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`${status.bg} ${status.text} ${status.border} gap-1`}>
              <StatusIcon className={`w-3 h-3 ${post.status === 'publishing' ? 'animate-spin' : ''}`} />
              {status.label}
            </Badge>
            {post.virality_score > 0 && (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1">
                <Flame className="w-3 h-3" />
                {post.virality_score}/100 virality
              </Badge>
            )}
            {clipData.category && (
              <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                {clipData.category}
              </Badge>
            )}
          </div>

          {/* Video preview */}
          {clipUrl && (
            <div className="rounded-lg overflow-hidden bg-black aspect-video">
              <video
                src={clipUrl}
                controls
                className="w-full h-full object-contain"
                preload="metadata"
              >
                Your browser does not support video.
              </video>
            </div>
          )}

          {/* Schedule time */}
          <div className="flex items-start gap-2 text-sm bg-gray-50 rounded-lg p-3 border border-gray-100">
            <Calendar className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled for</p>
              <p className="font-medium text-gray-900">{formatDateTime(post.scheduled_at)}</p>
            </div>
          </div>

          {/* Published URL */}
          {post.published_url && (
            <a
              href={post.published_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <ExternalLink className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate font-medium">{post.published_url}</span>
              <Play className="w-4 h-4" />
            </a>
          )}

          {/* Error */}
          {post.error_message && post.status === 'failed' && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
              <p className="font-medium text-red-700 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Publishing error
              </p>
              <p className="text-red-600 mt-1">{post.error_message}</p>
            </div>
          )}

          {/* Description */}
          {post.description_template && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[10px] uppercase tracking-wider font-medium text-gray-500">Description</span>
              </div>
              <div className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 border border-gray-100 max-h-32 overflow-y-auto">
                {post.description_template}
              </div>
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Tag className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[10px] uppercase tracking-wider font-medium text-gray-500">Tags ({tags.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {tags.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Hash className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[10px] uppercase tracking-wider font-medium text-gray-500">Hashtags</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {hashtags.map((h, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div className="text-[10px] text-gray-400">
              Post ID: <span className="font-mono">{post.id?.substring(0, 12)}</span>
            </div>
            {post.status === 'scheduled' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { onCancel(post.id); onClose(); }}
                className="gap-1.5 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Cancel this post
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}