import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, ExternalLink, ChevronDown, ChevronUp, DollarSign, Eye, Shield, Zap, BarChart3, Target } from "lucide-react";

const GRADE_STYLES = {
  "S-Tier": { bg: "bg-amber-50 border-amber-300", badge: "bg-amber-500 text-white", label: "🏆 S-Tier (Gold Mine)" },
  "A-Tier": { bg: "bg-green-50 border-green-300", badge: "bg-green-600 text-white", label: "💎 A-Tier (Stable)" },
  "B-Tier": { bg: "bg-blue-50 border-blue-300", badge: "bg-blue-600 text-white", label: "📈 B-Tier (Up & Coming)" },
  "C-Tier": { bg: "bg-gray-50 border-gray-200", badge: "bg-gray-500 text-white", label: "⏳ C-Tier (Watch)" },
};

function formatNum(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}

function ScoreMeter({ label, value, max = 10, color, tooltip }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="space-y-1 cursor-help">
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-500 font-medium">{label}</span>
            <span className="font-mono font-bold text-gray-700">{value.toFixed(1)}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export default function ChannelProfitCard({ audit }) {
  const [expanded, setExpanded] = useState(false);
  const style = GRADE_STYLES[audit.profitability_grade] || GRADE_STYLES["C-Tier"];
  const signals = (() => { try { return JSON.parse(audit.monetization_signals || "[]"); } catch { return []; } })();
  const recentVids = (() => { try { return JSON.parse(audit.recent_video_data || "[]"); } catch { return []; } })();
  const velocity = audit.growth_velocity || 0;

  return (
    <TooltipProvider delayDuration={200}>
      <Card className={`border-2 ${style.bg} transition-all duration-200 hover:shadow-md`}>
        <CardContent className="p-5">
          {/* Header Row */}
          <div className="flex items-start gap-4">
            {audit.channel_thumbnail && (
              <img src={audit.channel_thumbnail} alt="" className="w-12 h-12 rounded-full ring-2 ring-white shadow" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-gray-900 truncate">{audit.channel_name}</h3>
                <Badge className={`${style.badge} text-[10px] px-2 py-0`}>{style.label}</Badge>
                {velocity > 20 && <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px] px-1.5 py-0 gap-1"><TrendingUp className="w-2.5 h-2.5" /> Growing</Badge>}
                {velocity < -20 && <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px] px-1.5 py-0 gap-1"><TrendingDown className="w-2.5 h-2.5" /> Declining</Badge>}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span>{formatNum(audit.subscriber_count)} subs</span>
                <span>•</span>
                <span>{formatNum(audit.total_views)} total views</span>
                <span>•</span>
                <span>{audit.video_count} videos</span>
              </div>
            </div>
            <a href={audit.channel_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-gray-400 hover:text-indigo-600 transition-colors shrink-0">
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <MetricBox icon={Eye} label="Avg Views/Day" value={formatNum(audit.avg_views_per_day)} color="text-blue-600" />
            <MetricBox icon={DollarSign} label="Est. Monthly Rev" value={`$${formatNum(audit.estimated_monthly_revenue)}`} color="text-green-600" />
            <MetricBox icon={Shield} label="Monetization" value={audit.monetization_likelihood} color={audit.monetization_likelihood === "High" ? "text-green-600" : audit.monetization_likelihood === "Medium" ? "text-amber-600" : "text-red-500"} />
            <MetricBox icon={Zap} label="Viral Hits" value={`${audit.viral_consistency}/10`} color="text-purple-600" />
          </div>

          {/* Score Bars */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <ScoreMeter label="CTR Score" value={audit.estimated_ctr_score} color="bg-indigo-500" tooltip="Estimated click-through rate based on viral multiplier (views ÷ subscribers). Higher = algorithm pushes to non-subscribers." />
            <ScoreMeter label="Retention" value={audit.estimated_retention_score} color="bg-emerald-500" tooltip="Estimated retention from engagement density. High likes+comments/views = viewers stay longer." />
            <ScoreMeter label="Engagement" value={audit.engagement_density} max={8} color="bg-amber-500" tooltip="Average (likes + comments) / views × 100. Industry avg is 3-5%." />
            <ScoreMeter label="Long-Form" value={audit.long_form_ratio * 10} color="bg-purple-500" tooltip="Ratio of videos over 8 min. Higher = mid-roll ad eligible = more revenue." />
          </div>

          {/* CPM + Entry Angle */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">CPM Range:</span>
              <Badge variant="outline" className="text-[10px]">{audit.avg_cpm_category}</Badge>
              {signals.length > 0 && (
                <>
                  <span className="text-gray-400">|</span>
                  <span className="text-gray-500">Signals:</span>
                  {signals.map(s => (
                    <Badge key={s} className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] px-1.5 py-0">{s.replace(/_/g, " ")}</Badge>
                  ))}
                </>
              )}
            </div>
            {audit.recommended_entry_angle && (
              <div className="bg-white/60 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center gap-1.5 text-[10px] font-medium text-indigo-600 uppercase tracking-wider mb-1">
                  <Target className="w-3 h-3" /> Recommended Entry Angle
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{audit.recommended_entry_angle}</p>
              </div>
            )}
          </div>

          {/* Expand/Collapse Recent Videos */}
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 mt-3 transition-colors">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Show"} recent videos ({recentVids.length})
          </button>

          {expanded && recentVids.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {recentVids.map((v, i) => (
                <div key={i} className="flex items-center gap-3 text-xs bg-white/80 rounded-md px-3 py-2 border border-gray-100">
                  <span className="text-gray-400 font-mono w-4">{i + 1}</span>
                  <span className="flex-1 truncate text-gray-700">{v.title}</span>
                  <span className="font-mono text-gray-500">{formatNum(v.views)}</span>
                  <span className="font-mono text-green-600">{v.engagement_pct}%</span>
                  <span className="font-mono text-blue-600">{formatNum(v.vpd)}/d</span>
                  {v.opp_score > 1 && <Badge className="bg-amber-50 text-amber-700 text-[9px] px-1 py-0">🔥 Viral</Badge>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function MetricBox({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white/70 rounded-lg p-2.5 border border-gray-100 text-center">
      <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${color}`} />
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500">{label}</div>
    </div>
  );
}