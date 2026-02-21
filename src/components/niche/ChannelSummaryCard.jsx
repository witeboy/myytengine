import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, ExternalLink, Eye, DollarSign, Zap, Star, BarChart3 } from "lucide-react";

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n?.toLocaleString() || "0";
}

function fmtDur(sec) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ChannelSummaryCard({ channel, rank }) {
  const [expanded, setExpanded] = useState(false);
  const vids = channel.videos || [];

  return (
    <Card className="border border-gray-200 hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-sm font-bold font-mono ${rank < 3 ? "text-amber-600" : "text-gray-400"}`}>#{rank + 1}</span>
            {channel.channel_thumbnail && (
              <img src={channel.channel_thumbnail} alt="" className="w-10 h-10 rounded-full ring-2 ring-white shadow" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-gray-900 truncate text-sm">{channel.channel_name}</h4>
              {channel.monetization_likely && <Badge className="bg-green-50 text-green-700 text-[9px] px-1.5 py-0">💰 Monetized</Badge>}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-0.5">
              <span>{fmt(channel.subscriber_count)} subs</span>
              <span>{fmt(channel.channel_total_views)} total views</span>
              <span>{channel.channel_video_count} videos</span>
            </div>
          </div>
          <a href={`https://www.youtube.com/channel/${channel.channel_id}`} target="_blank" rel="noopener noreferrer"
            className="text-gray-400 hover:text-indigo-600 shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
          <MiniMetric icon={Eye} label="Avg Views" value={fmt(channel.avg_views)} color="text-blue-600" />
          <MiniMetric icon={BarChart3} label="Avg VPD" value={fmt(channel.avg_vpd)} color="text-cyan-600" />
          <MiniMetric icon={Zap} label="Engagement" value={`${channel.avg_engagement}%`} color="text-purple-600" />
          <MiniMetric icon={Star} label="Outliers" value={`${channel.outlier_count}/${vids.length}`} color="text-amber-600" />
          <MiniMetric icon={DollarSign} label="Est. Rev/mo" value={`$${fmt(channel.est_monthly_revenue)}`} color="text-green-600" />
        </div>

        {/* Expand Videos */}
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-indigo-600 mt-3 transition-colors">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Hide" : "Show"} {vids.length} videos in results
        </button>

        {expanded && (
          <div className="mt-2 space-y-1">
            {vids
              .sort((a, b) => b.view_count - a.view_count)
              .map((v, i) => (
                <div key={v.video_id} className="flex items-center gap-2 text-[10px] bg-gray-50 rounded px-2 py-1.5 border border-gray-100">
                  <span className={`font-mono font-bold w-4 ${v.view_count >= channel.max_views * 0.5 ? "text-amber-600" : "text-gray-400"}`}>{i + 1}</span>
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt="" className="w-12 h-7 rounded object-cover shrink-0" />}
                  <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-gray-700 hover:text-indigo-600">
                    {v.video_title}
                  </a>
                  <span className="font-mono text-gray-600 shrink-0">{fmt(v.view_count)}</span>
                  <span className="font-mono text-green-600 shrink-0">${fmt(v.est_total_revenue)}</span>
                  <span className="font-mono text-cyan-600 shrink-0">{fmt(v.views_per_day)}/d</span>
                  {v.view_count >= channel.max_views * 0.5 && (
                    <Badge className="bg-amber-50 text-amber-700 text-[8px] px-1 py-0">⭐</Badge>
                  )}
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-gray-50 rounded-md p-2 text-center border border-gray-100">
      <Icon className={`w-3 h-3 mx-auto mb-0.5 ${color}`} />
      <div className={`text-xs font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-gray-500">{label}</div>
    </div>
  );
}