import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, Eye, ThumbsUp, MessageSquare, Zap } from 'lucide-react';

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export default function CompetitorVideoList({ videos, title, emptyText, onRepurpose }) {
  if (!videos?.length) {
    return <p className="text-[11px] text-gray-400 italic">{emptyText || 'No videos'}</p>;
  }

  return (
    <div>
      {title && <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{title}</p>}
      <div className="space-y-1">
        {videos.map((v, i) => (
          <div key={i} className="flex items-start gap-2 p-1.5 rounded bg-gray-50 hover:bg-gray-100 transition-colors group">
            {v.thumbnail && (
              <img src={v.thumbnail} alt="" className="w-16 h-9 rounded object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-gray-800 truncate">{v.title}</p>
              <div className="flex items-center gap-2 text-[9px] text-gray-400 mt-0.5 flex-wrap">
                <span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" /> {formatNum(v.views)}</span>
                <span className="flex items-center gap-0.5"><ThumbsUp className="w-2.5 h-2.5" /> {formatNum(v.likes)}</span>
                <span className="flex items-center gap-0.5"><MessageSquare className="w-2.5 h-2.5" /> {formatNum(v.comments)}</span>
                <span>{formatNum(v.vpd)}/day</span>
                {v.is_long_form && <Badge className="text-[7px] px-1 py-0 bg-purple-100 text-purple-600">LONG</Badge>}
                {v.opp_score > 1 && (
                  <Badge className="text-[7px] px-1 py-0 bg-green-100 text-green-600 flex items-center gap-0.5">
                    <ArrowUpRight className="w-2 h-2" /> {v.opp_score.toFixed(1)}x
                  </Badge>
                )}
              </div>
            </div>
            {onRepurpose && (
              <button
                onClick={(e) => { e.stopPropagation(); onRepurpose(v); }}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-md bg-orange-100 text-orange-700 hover:bg-orange-200 text-[9px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                title="Repurpose this video into your pipeline"
              >
                <Zap className="w-2.5 h-2.5" /> Repurpose
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}