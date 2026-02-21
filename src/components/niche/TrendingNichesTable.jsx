import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus, DollarSign, Eye, Zap, Loader2, RefreshCw, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

export default function TrendingNichesTable({ onSelectNiche }) {
  const [period, setPeriod] = useState("daily");
  const [refreshing, setRefreshing] = useState(false);

  const { data: niches = [], isLoading, refetch } = useQuery({
    queryKey: ["trending-niches", period],
    queryFn: () => base44.entities.TrendingNiches.filter({ period }, "rank", 25),
  });

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
        <div className="flex items-center gap-2">
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
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  <th className="py-2 px-3 text-center w-10">#</th>
                  <th className="py-2 px-3 text-left">Niche</th>
                  <th className="py-2 px-3 text-right">Avg Views</th>
                  <th className="py-2 px-3 text-right">Opp Score</th>
                  <th className="py-2 px-3 text-right">Est. RPM</th>
                  <th className="py-2 px-3 text-center">Trend</th>
                </tr>
              </thead>
              <tbody>
                {niches.map((niche, i) => {
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
      )}
      <p className="text-[10px] text-gray-400 text-center">Click any niche to auto-search</p>
    </div>
  );
}