import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, DollarSign, Eye, Zap, Loader2, RefreshCw, Crown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PERIODS = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const trendIcons = {
  rising: { icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
  stable: { icon: Minus, color: "text-gray-500", bg: "bg-gray-50" },
  declining: { icon: TrendingDown, color: "text-red-500", bg: "bg-red-50" },
};

function formatNumber(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
}

const SORT_OPTIONS = [
  { key: "rank", label: "Default Rank" },
  { key: "avg_rpm_estimate", label: "Est. RPM" },
  { key: "avg_views", label: "Avg Views" },
  { key: "avg_opportunity_score", label: "Opp Score" },
];

const COLUMN_TOOLTIPS = {
  rank: "Rank — Overall ranking based on a composite of views, opportunity, and RPM potential.",
  niche: "Niche — The YouTube content category or keyword being tracked.",
  avg_views: "Avg Views — The average number of views across the top-performing videos in this niche during the selected time period.",
  opp_score: "Opportunity Score — Measures viral potential by comparing views to subscriber count. Higher means the niche outperforms its audience size (views ÷ subscribers).",
  rpm: "Estimated RPM — Revenue Per Mille (per 1,000 views). Estimated ad revenue potential based on the niche's advertiser demand. Finance & legal niches pay the most.",
  trend: "Trend — Indicates whether this niche's viewership is rising, stable, or declining based on recent daily view velocity.",
};

export default function TrendingNichesTable({ onSelectNiche }) {
  const [period, setPeriod] = useState("daily");
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState("rank");
  const [sortDir, setSortDir] = useState(1); // 1 = asc for rank, -1 = desc for metrics

  const { data: niches = [], isLoading, refetch } = useQuery({
    queryKey: ["trending-niches", period],
    queryFn: () => base44.entities.TrendingNiches.filter({ period }, "rank", 25),
  });

  const sortedNiches = useMemo(() => {
    return [...niches].sort((a, b) => {
      const va = a[sortBy] || 0;
      const vb = b[sortBy] || 0;
      return sortDir === 1 ? va - vb : vb - va;
    });
  }, [niches, sortBy, sortDir]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(d => d * -1);
    } else {
      setSortBy(field);
      setSortDir(field === "rank" ? 1 : -1);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await base44.functions.invoke("fetchTrendingNiches", { period });
      await refetch();
    } catch (e) {
      console.error(e);
    }
    setRefreshing(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">Trending Niches</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort By */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => handleSort(s.key)}
                className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors flex items-center gap-1 ${
                  sortBy === s.key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {s.label}
                {sortBy === s.key && <ArrowUpDown className="w-2.5 h-2.5" />}
              </button>
            ))}
          </div>
          {/* Period Tabs */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  period === p.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-7 w-7"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        </div>
      ) : niches.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-sm text-gray-400">No trending data yet</p>
          <Button size="sm" onClick={handleRefresh} disabled={refreshing} className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Generate Rankings
          </Button>
        </div>
      ) : (
        <TooltipProvider delayDuration={200}>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  <HeaderWithTooltip align="center" className="w-10" tooltip={COLUMN_TOOLTIPS.rank}>#</HeaderWithTooltip>
                  <HeaderWithTooltip align="left" tooltip={COLUMN_TOOLTIPS.niche}>Niche</HeaderWithTooltip>
                  <HeaderWithTooltip align="right" tooltip={COLUMN_TOOLTIPS.avg_views} sortKey="avg_views" currentSort={sortBy} onSort={handleSort}>Avg Views</HeaderWithTooltip>
                  <HeaderWithTooltip align="right" tooltip={COLUMN_TOOLTIPS.opp_score} sortKey="avg_opportunity_score" currentSort={sortBy} onSort={handleSort}>Opp Score</HeaderWithTooltip>
                  <HeaderWithTooltip align="right" tooltip={COLUMN_TOOLTIPS.rpm} sortKey="avg_rpm_estimate" currentSort={sortBy} onSort={handleSort}>Est. RPM</HeaderWithTooltip>
                  <HeaderWithTooltip align="center" tooltip={COLUMN_TOOLTIPS.trend}>Trend</HeaderWithTooltip>
                </tr>
              </thead>
              <tbody>
                {sortedNiches.map((niche, i) => {
                  const trend = trendIcons[niche.growth_trend] || trendIcons.stable;
                  const TrendIcon = trend.icon;
                  return (
                    <tr
                      key={niche.id}
                      className="border-b border-gray-50 hover:bg-indigo-50/50 transition-colors cursor-pointer group"
                      onClick={() => onSelectNiche(niche.keyword)}
                    >
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-xs font-mono font-bold ${i < 3 ? "text-amber-600" : "text-gray-400"}`}>
                          {niche.rank}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-sm font-medium text-gray-800 group-hover:text-indigo-600 transition-colors">
                          {niche.keyword}
                        </span>
                        {niche.top_channel && (
                          <div className="text-[10px] text-gray-400 mt-0.5">Top: {niche.top_channel}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-xs font-mono text-gray-700">{formatNumber(niche.avg_views)}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-xs font-mono text-emerald-700">
                          {(niche.avg_opportunity_score || 0).toFixed(1)}x
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1.5 py-0">
                          ${(niche.avg_rpm_estimate || 0).toFixed(0)}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${trend.bg}`}>
                          <TrendIcon className={`w-3 h-3 ${trend.color}`} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        </TooltipProvider>
      )}
      <p className="text-[10px] text-gray-400 text-center">Click any niche to auto-search</p>
    </div>
  );
}

function HeaderWithTooltip({ children, tooltip, align = "left", className = "", sortKey, currentSort, onSort }) {
  const textAlign = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  const isActive = sortKey && currentSort === sortKey;

  const inner = (
    <span className={`inline-flex items-center gap-1 ${sortKey ? "cursor-pointer hover:text-gray-700 transition-colors" : ""}`}
      onClick={sortKey ? (e) => { e.stopPropagation(); onSort(sortKey); } : undefined}
    >
      {children}
      {isActive && <ArrowUpDown className="w-2.5 h-2.5 text-indigo-600" />}
    </span>
  );

  return (
    <th className={`py-2 px-3 ${textAlign} ${className}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help border-b border-dashed border-gray-300">
            {inner}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px] text-xs leading-relaxed">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </th>
  );
}