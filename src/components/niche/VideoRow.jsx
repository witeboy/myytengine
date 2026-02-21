import React from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n?.toLocaleString() || "0";
}

export default function VideoRow({ video, index, maxOpp, maxProfit }) {
  const multiplier = video.subscriber_count > 0
    ? (video.view_count / video.subscriber_count).toFixed(1)
    : "∞";

  const isViralGap = video.opportunity_score > 10;
  const isHighRpm = video.profitability_score > 50;

  return (
    <tr className="border-b border-[#1e1e2e] hover:bg-white/[0.02] transition-colors group">
      {/* Rank */}
      <td className="py-3 px-3 text-center">
        <span className={`text-xs font-mono font-bold ${index < 3 ? "text-amber-400" : "text-gray-600"}`}>
          #{index + 1}
        </span>
      </td>

      {/* Title */}
      <td className="py-3 px-3 max-w-xs">
        <a
          href={video.video_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-200 hover:text-indigo-400 transition-colors line-clamp-2 flex items-start gap-1.5"
        >
          <span className="flex-1">{video.video_title}</span>
          <ExternalLink className="w-3 h-3 mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
        <div className="flex gap-1.5 mt-1">
          {isViralGap && (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">
              Viral Gap
            </Badge>
          )}
          {isHighRpm && (
            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[10px] px-1.5 py-0">
              High RPM
            </Badge>
          )}
          {video.long_form && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-gray-700 text-gray-500">
              Long-form
            </Badge>
          )}
        </div>
      </td>

      {/* Channel */}
      <td className="py-3 px-3">
        <span className="text-xs text-gray-400 truncate block max-w-[120px]">{video.channel_name}</span>
        <span className="text-[10px] text-gray-600">{formatNumber(video.subscriber_count)} subs</span>
      </td>

      {/* Views */}
      <td className="py-3 px-3 text-right">
        <span className="text-sm font-mono text-white">{formatNumber(video.view_count)}</span>
      </td>

      {/* Views/Day */}
      <td className="py-3 px-3 text-right">
        <span className="text-sm font-mono text-cyan-400">{formatNumber(video.views_per_day)}</span>
      </td>

      {/* Multiplier */}
      <td className="py-3 px-3 text-right">
        <span className={`text-sm font-mono font-bold ${parseFloat(multiplier) > 10 ? "text-emerald-400" : "text-gray-300"}`}>
          {multiplier}x
        </span>
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
    emerald: { bg: "bg-emerald-500/20", fill: "bg-emerald-500", text: "text-emerald-400" },
    amber: { bg: "bg-amber-500/20", fill: "bg-amber-500", text: "text-amber-400" },
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