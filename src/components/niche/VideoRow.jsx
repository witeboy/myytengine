import React from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n?.toLocaleString() || "0";
}

function formatDuration(sec) {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function VideoRow({ video, index, maxOpp, maxProfit }) {
  const isViralGap = video.opportunity_score > 10;
  const isHighRpm = video.profitability_score > 50;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors group">
      {/* Rank */}
      <td className="py-3 px-3 text-center">
        <span className={`text-xs font-mono font-bold ${index < 3 ? "text-amber-600" : "text-gray-400"}`}>
          #{index + 1}
        </span>
      </td>

      {/* Thumbnail + Title */}
      <td className="py-3 px-3 max-w-sm">
        <div className="flex items-start gap-2.5">
          {video.thumbnail_url && (
            <img
              src={video.thumbnail_url}
              alt=""
              className="w-20 h-11 rounded object-cover flex-shrink-0 bg-gray-100"
            />
          )}
          <div className="min-w-0 flex-1">
            <a
              href={video.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-800 hover:text-indigo-600 transition-colors line-clamp-2 flex items-start gap-1"
            >
              <span className="flex-1">{video.video_title}</span>
              <ExternalLink className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {isViralGap && (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0">
                  Viral Gap
                </Badge>
              )}
              {isHighRpm && (
                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">
                  High RPM
                </Badge>
              )}
              {video.long_form && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-300 text-gray-500">
                  Long-form
                </Badge>
              )}
              {video.duration_seconds > 0 && (
                <span className="text-[10px] text-gray-600 font-mono">{formatDuration(video.duration_seconds)}</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Channel */}
      <td className="py-3 px-3">
        <span className="text-xs text-gray-600 truncate block max-w-[120px]">{video.channel_name}</span>
        <span className="text-[10px] text-gray-400">{formatNumber(video.subscriber_count)} subs</span>
      </td>

      {/* Views */}
      <td className="py-3 px-3 text-right">
        <span className="text-sm font-mono text-gray-900">{formatNumber(video.view_count)}</span>
        {video.published_date && (
          <div className="text-[10px] text-gray-400">{timeAgo(video.published_date)}</div>
        )}
      </td>

      {/* Views/Day */}
      <td className="py-3 px-3 text-right">
        <span className="text-sm font-mono text-cyan-600">{formatNumber(video.views_per_day)}</span>
      </td>

      {/* Opportunity */}
      <td className="py-3 px-3 text-right">
        <ScoreBar value={video.opportunity_score} max={maxOpp || 100} color="emerald" />
      </td>

      {/* Profitability */}
      <td className="py-3 px-3 text-right">
        <ScoreBar value={video.profitability_score} max={maxProfit || 100} color="amber" />
      </td>
    </tr>
  );
}

function ScoreBar({ value, max, color }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  const colorMap = {
    emerald: { bg: "bg-emerald-100", fill: "bg-emerald-500", text: "text-emerald-700" },
    amber: { bg: "bg-amber-100", fill: "bg-amber-500", text: "text-amber-700" },
  };
  const c = colorMap[color] || colorMap.emerald;

  return (
    <div className="flex items-center gap-2 justify-end">
      <span className={`text-xs font-mono ${c.text}`}>{value.toFixed(1)}</span>
      <div className={`w-14 h-1.5 rounded-full ${c.bg}`}>
        <div className={`h-full rounded-full ${c.fill} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}