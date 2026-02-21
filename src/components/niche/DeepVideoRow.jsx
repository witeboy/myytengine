import React from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n?.toLocaleString() || "0";
}

function fmtDur(sec) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export default function DeepVideoRow({ video, index }) {
  const isOutlier = video.opportunity_score > 10;
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors group text-xs">
      <td className="py-2.5 px-2 text-center">
        <span className={`font-mono font-bold ${index < 3 ? "text-amber-600" : index < 10 ? "text-gray-600" : "text-gray-400"}`}>
          {index + 1}
        </span>
      </td>
      <td className="py-2.5 px-2 max-w-xs">
        <div className="flex items-start gap-2">
          {video.thumbnail_url && (
            <img src={video.thumbnail_url} alt="" className="w-16 h-9 rounded object-cover flex-shrink-0 bg-gray-100" />
          )}
          <div className="min-w-0 flex-1">
            <a href={video.video_url} target="_blank" rel="noopener noreferrer"
              className="text-gray-800 hover:text-indigo-600 transition-colors line-clamp-2 leading-tight flex items-start gap-1">
              <span className="flex-1">{video.video_title}</span>
              <ExternalLink className="w-2.5 h-2.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100" />
            </a>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {isOutlier && <Badge className="bg-emerald-50 text-emerald-700 text-[9px] px-1 py-0">Viral</Badge>}
              {video.long_form && <Badge variant="outline" className="text-[9px] px-1 py-0 border-gray-300">Long</Badge>}
              <span className="text-[9px] text-gray-400 font-mono">{fmtDur(video.duration_seconds)}</span>
            </div>
          </div>
        </div>
      </td>
      <td className="py-2.5 px-2">
        <span className="text-gray-700 truncate block max-w-[100px]">{video.channel_name}</span>
        <span className="text-[9px] text-gray-400">{fmt(video.subscriber_count)} subs</span>
      </td>
      <td className="py-2.5 px-2 text-right font-mono text-gray-900">{fmt(video.view_count)}</td>
      <td className="py-2.5 px-2 text-right font-mono text-cyan-600">{fmt(video.views_per_day)}</td>
      <td className="py-2.5 px-2 text-right font-mono text-emerald-600">{(video.opportunity_score || 0).toFixed(1)}x</td>
      <td className="py-2.5 px-2 text-right font-mono text-blue-600">{(video.engagement_pct || 0).toFixed(1)}%</td>
      <td className="py-2.5 px-2 text-right font-mono text-orange-600">${video.est_rpm || 4}</td>
      <td className="py-2.5 px-2 text-right font-mono text-pink-600">${Math.round((video.est_rpm || 4) * 0.55)}</td>
      <td className="py-2.5 px-2 text-right">
        <span className="font-mono text-green-700">${fmt(video.est_total_revenue || 0)}</span>
        <div className="text-[9px] text-gray-400">${fmt(video.est_monthly_revenue || 0)}/mo</div>
      </td>
      <td className="py-2.5 px-2 text-right text-[9px] text-gray-400">{timeAgo(video.published_date)}</td>
    </tr>
  );
}