import React from 'react';
import { Clock, Flame, Loader2, CheckCircle, AlertCircle, ChevronRight, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const STATUS_STYLES = {
  scheduled:    { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'Scheduled' },
  publishing:   { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Publishing…' },
  published:    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Published' },
  failed:       { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Failed' },
  cancelled:    { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200', label: 'Cancelled' },
  ready_to_post:{ bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', label: 'Ready' },
};

function formatTime(d) {
  return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateHeader(d) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function DayPostsList({ date, posts, onPostClick, onCancel }) {
  const sorted = [...posts].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-sm font-semibold text-gray-900">{formatDateHeader(date)}</p>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">
          {posts.length} clip{posts.length > 1 ? 's' : ''} scheduled
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {sorted.map((post) => {
          const style = STATUS_STYLES[post.status] || STATUS_STYLES.scheduled;
          return (
            <button
              key={post.id}
              onClick={() => onPostClick(post)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left group"
            >
              {/* Time */}
              <div className="flex flex-col items-center text-[10px] text-gray-400 w-14 flex-shrink-0 font-mono">
                <Clock className="w-3 h-3" />
                <span className="mt-0.5 text-[10px] font-semibold text-gray-700">
                  {formatTime(post.scheduled_at)}
                </span>
              </div>

              {/* Title + description preview */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                  {post.title_primary || 'Untitled'}
                </p>
                {post.description_template && (
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {post.description_template.substring(0, 80)}
                  </p>
                )}
                {post.error_message && post.status === 'failed' && (
                  <p className="text-[10px] text-red-500 mt-0.5 truncate">{post.error_message}</p>
                )}
              </div>

              {/* Virality */}
              {post.virality_score > 0 && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Flame className={`w-3.5 h-3.5 ${post.virality_score >= 85 ? 'text-red-500' : 'text-amber-500'}`} />
                  <span className="text-xs font-bold text-gray-700">{post.virality_score}</span>
                </div>
              )}

              {/* Status */}
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${style.bg} ${style.text} ${style.border}`}>
                {post.status === 'publishing' && <Loader2 className="w-2.5 h-2.5 mr-0.5 animate-spin" />}
                {post.status === 'published' && <CheckCircle className="w-2.5 h-2.5 mr-0.5" />}
                {post.status === 'failed' && <AlertCircle className="w-2.5 h-2.5 mr-0.5" />}
                {style.label}
              </Badge>

              {/* Actions */}
              {post.status === 'scheduled' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCancel(post.id); }}
                  className="text-gray-300 hover:text-red-500 flex-shrink-0 transition-colors"
                  title="Cancel"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}