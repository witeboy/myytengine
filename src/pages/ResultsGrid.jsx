import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { ArrowLeft, BarChart3, TrendingUp, DollarSign, Eye, Loader2, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import VideoRow from "../components/niche/VideoRow";

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n?.toLocaleString() || "0";
}

export default function ResultsGrid() {
  const params = new URLSearchParams(window.location.search);
  const searchId = params.get("search_id");
  const keyword = params.get("keyword") || "Unknown";
  const [sortField, setSortField] = useState("profitability_score");
  const [sortDir, setSortDir] = useState(-1);

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["cached-videos", searchId],
    queryFn: async () => {
      if (searchId) {
        return base44.entities.CachedVideos.filter({ search_id: searchId }, "-profitability_score", 50);
      }
      return base44.entities.CachedVideos.list("-profitability_score", 50);
    },
  });

  const sortedVideos = useMemo(() => {
    return [...videos].sort((a, b) => {
      const va = a[sortField] || 0;
      const vb = b[sortField] || 0;
      return sortDir === -1 ? vb - va : va - vb;
    });
  }, [videos, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d * -1);
    } else {
      setSortField(field);
      setSortDir(-1);
    }
  };

  const maxOpp = videos.reduce((m, v) => Math.max(m, v.opportunity_score || 0), 1);
  const maxProfit = videos.reduce((m, v) => Math.max(m, v.profitability_score || 0), 1);

  const topViews = videos.reduce((max, v) => Math.max(max, v.view_count || 0), 0);
  const avgOpp = videos.length > 0
    ? (videos.reduce((s, v) => s + (v.opportunity_score || 0), 0) / videos.length).toFixed(1)
    : 0;
  const avgProfit = videos.length > 0
    ? (videos.reduce((s, v) => s + (v.profitability_score || 0), 0) / videos.length).toFixed(1)
    : 0;
  const viralCount = videos.filter(v => v.opportunity_score > 10).length;

  const summaryCards = [
    { label: "Videos Found", value: videos.length, icon: BarChart3, color: "text-indigo-400" },
    { label: "Top Views", value: formatNumber(topViews), icon: Eye, color: "text-cyan-400" },
    { label: "Avg Opportunity", value: avgOpp + "x", icon: TrendingUp, color: "text-emerald-400" },
    { label: "Avg Profit Score", value: avgProfit, icon: DollarSign, color: "text-amber-400" },
  ];

  const SortHeader = ({ field, children, align = "right" }) => (
    <th
      className={`py-2.5 px-3 text-${align} cursor-pointer hover:text-gray-300 transition-colors select-none`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field && (
          <ArrowUpDown className="w-2.5 h-2.5 text-indigo-400" />
        )}
      </span>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl("ResearchTerminal")}>
            <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white hover:bg-white/5">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white">Results: {decodeURIComponent(keyword)}</h1>
            <p className="text-xs text-gray-500">{videos.length} profitable opportunities detected</p>
          </div>
        </div>
        {viralCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-400">{viralCount} Viral Gaps Detected</span>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className="bg-[#12121a] border border-[#1e1e2e] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
              <span className="text-xs text-gray-500">{c.label}</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          <p className="text-gray-500 text-sm">Loading results...</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <BarChart3 className="w-10 h-10 text-gray-700" />
          <p className="text-gray-500 text-sm">No profitable opportunities found for this niche.</p>
          <p className="text-gray-600 text-xs">Try broadening your keyword or changing the time range.</p>
          <Link to={createPageUrl("ResearchTerminal")}>
            <Button variant="outline" className="border-[#1e1e2e] text-gray-400 hover:text-white">
              New Search
            </Button>
          </Link>
        </div>
      ) : (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-[#1e1e2e] text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                  <th className="py-2.5 px-3 text-center w-10">#</th>
                  <th className="py-2.5 px-3 text-left">Video</th>
                  <th className="py-2.5 px-3 text-left">Channel</th>
                  <SortHeader field="view_count">Views</SortHeader>
                  <SortHeader field="views_per_day">Views/Day</SortHeader>
                  <SortHeader field="opportunity_score">Opportunity</SortHeader>
                  <SortHeader field="profitability_score">Profitability</SortHeader>
                </tr>
              </thead>
              <tbody>
                {sortedVideos.map((video, i) => (
                  <VideoRow key={video.id} video={video} index={i} maxOpp={maxOpp} maxProfit={maxProfit} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}