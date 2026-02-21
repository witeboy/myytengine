import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { ArrowLeft, BarChart3, TrendingUp, DollarSign, Eye, Loader2, ArrowUpDown, Users, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DeepVideoRow from "../components/niche/DeepVideoRow";
import ChannelSummaryCard from "../components/niche/ChannelSummaryCard";

function fmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n?.toLocaleString() || "0";
}

const SORT_FIELDS = [
  { key: "view_count", label: "Views" },
  { key: "views_per_day", label: "VPD" },
  { key: "opportunity_score", label: "Opp" },
  { key: "engagement_pct", label: "Eng%" },
  { key: "est_rpm", label: "RPM" },
  { key: "est_cpm", label: "CPM" },
  { key: "est_total_revenue", label: "Revenue" },
  { key: "profitability_score", label: "Profit Score" },
  { key: "published_date", label: "Age" },
];

const COL_TIPS = {
  views: "Total views this video has received since published.",
  vpd: "Views Per Day — average daily views since publish date. Higher = consistent performer.",
  opp: "Opportunity Score — Views ÷ Subscribers. Higher means the video massively outperformed the channel size (strong CTR signal).",
  engagement: "Engagement % — (Likes + Comments) ÷ Views × 100. Higher correlates with better retention.",
  rpm: "Revenue Per Mille — estimated earnings per 1,000 views based on niche category. Higher RPM niches (finance, law, insurance) pay significantly more.",
  cpm: "Cost Per Mille — estimated advertiser cost per 1,000 impressions. Typically ~55% of RPM goes to the creator.",
  revenue: "Estimated total revenue from this video based on niche RPM. Monthly estimate shown below.",
  age: "How long ago this video was published.",
};

export default function ResultsGrid() {
  const params = new URLSearchParams(window.location.search);
  const searchId = params.get("search_id");
  const keyword = params.get("keyword") || "Unknown";
  const [sortField, setSortField] = useState("view_count");
  const [sortDir, setSortDir] = useState(-1);
  const [viewMode, setViewMode] = useState("videos"); // "videos" | "channels"

  const { data, isLoading } = useQuery({
    queryKey: ["deep-results", searchId],
    queryFn: async () => {
      if (searchId) {
        // Fetch from the deep analysis results stored in CachedVideos
        const videos = await base44.entities.CachedVideos.filter({ search_id: searchId }, "-view_count", 100);
        return { videos, channels: [] };
      }
      const videos = await base44.entities.CachedVideos.list("-view_count", 100);
      return { videos, channels: [] };
    },
  });

  // Also try to get fresh deep data if we navigated with search_id
  const { data: deepData } = useQuery({
    queryKey: ["deep-live", searchId, keyword],
    queryFn: async () => {
      // Re-fetch deep analysis for channel data
      const res = await base44.functions.invoke("deepNicheAnalysis", {
        keyword: decodeURIComponent(keyword),
        duration: "This Month",
      });
      return res.data;
    },
    enabled: !!keyword && keyword !== "Unknown",
    staleTime: 60000,
  });

  const videos = deepData?.results || data?.videos || [];
  const channels = deepData?.channels || [];
  const rpmEstimate = deepData?.rpm_estimate || 4;

  const sortedVideos = useMemo(() => {
    return [...videos].sort((a, b) => {
      if (sortField === "published_date") {
        const da = new Date(a.published_date || 0).getTime();
        const db = new Date(b.published_date || 0).getTime();
        return sortDir === -1 ? db - da : da - db;
      }
      const va = a[sortField] || 0;
      const vb = b[sortField] || 0;
      return sortDir === -1 ? vb - va : va - vb;
    });
  }, [videos, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d * -1);
    else { setSortField(field); setSortDir(-1); }
  };

  const topViews = videos.reduce((m, v) => Math.max(m, v.view_count || 0), 0);
  const totalRevenue = videos.reduce((s, v) => s + (v.est_total_revenue || 0), 0);
  const avgEngagement = videos.length ? (videos.reduce((s, v) => s + (v.engagement_pct || 0), 0) / videos.length).toFixed(1) : 0;
  const viralCount = videos.filter(v => (v.opportunity_score || 0) > 10).length;

  const summaryCards = [
    { label: "Videos Analyzed", value: videos.length, icon: BarChart3, color: "text-indigo-600" },
    { label: "Top Views", value: fmt(topViews), icon: Eye, color: "text-cyan-600" },
    { label: "Channels Found", value: channels.length || "—", icon: Users, color: "text-purple-600" },
    { label: "Total Est. Revenue", value: `$${fmt(totalRevenue)}`, icon: DollarSign, color: "text-green-600" },
    { label: "Avg Engagement", value: avgEngagement + "%", icon: TrendingUp, color: "text-emerald-600" },
    { label: "Viral Outliers", value: viralCount, icon: TrendingUp, color: "text-amber-600" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl("ResearchTerminal")}>
              <Button variant="ghost" size="icon" className="text-gray-500 hover:text-gray-900 hover:bg-gray-100">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Top 100: {decodeURIComponent(keyword)}
              </h1>
              <p className="text-xs text-gray-500">
                {videos.length} videos • {channels.length} channels • Est. RPM ${rpmEstimate}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button onClick={() => setViewMode("videos")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${viewMode === "videos" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                <List className="w-3 h-3" /> Videos
              </button>
              <button onClick={() => setViewMode("channels")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${viewMode === "channels" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                <Users className="w-3 h-3" /> Channels
              </button>
            </div>
            {viralCount > 0 && (
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs px-2 py-0.5">
                🔥 {viralCount} Viral Outliers
              </Badge>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {summaryCards.map((c) => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex items-center gap-1.5 mb-1">
                <c.icon className={`w-3.5 h-3.5 ${c.color}`} />
                <span className="text-[10px] text-gray-500">{c.label}</span>
              </div>
              <div className="text-lg font-bold text-gray-900 font-mono">{c.value}</div>
            </div>
          ))}
        </div>

        {isLoading && !deepData ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
            <p className="text-gray-500 text-sm">Fetching top 100 videos & channel data...</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <BarChart3 className="w-10 h-10 text-gray-300" />
            <p className="text-gray-500 text-sm">No results found.</p>
            <Link to={createPageUrl("ResearchTerminal")}><Button variant="outline">New Search</Button></Link>
          </div>
        ) : viewMode === "channels" && channels.length > 0 ? (
          /* CHANNEL VIEW */
          <div className="space-y-3">
            <p className="text-xs text-gray-500">{channels.length} unique channels ranked by total views in results. Expand to see all their top videos.</p>
            {channels.map((ch, i) => (
              <ChannelSummaryCard key={ch.channel_id} channel={ch} rank={i} />
            ))}
          </div>
        ) : (
          /* VIDEO TABLE */
          <div className="space-y-3">
            {/* Sort pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Sort by:</span>
              {SORT_FIELDS.map(s => (
                <button key={s.key} onClick={() => handleSort(s.key)}
                  className={`px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors flex items-center gap-1 ${
                    sortField === s.key ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:text-gray-900"
                  }`}>
                  {s.label}
                  {sortField === s.key && <ArrowUpDown className="w-2.5 h-2.5" />}
                </button>
              ))}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-200 text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                      <th className="py-2 px-2 text-center w-8">#</th>
                      <th className="py-2 px-2 text-left">Video</th>
                      <th className="py-2 px-2 text-left">Channel</th>
                      <TipHeader tip={COL_TIPS.views} onClick={() => handleSort("view_count")} active={sortField === "view_count"}>Views</TipHeader>
                      <TipHeader tip={COL_TIPS.vpd} onClick={() => handleSort("views_per_day")} active={sortField === "views_per_day"}>VPD</TipHeader>
                      <TipHeader tip={COL_TIPS.opp} onClick={() => handleSort("opportunity_score")} active={sortField === "opportunity_score"}>Opp</TipHeader>
                      <TipHeader tip={COL_TIPS.engagement} onClick={() => handleSort("engagement_pct")} active={sortField === "engagement_pct"}>Eng%</TipHeader>
                      <TipHeader tip={COL_TIPS.rpm} onClick={() => handleSort("est_rpm")} active={sortField === "est_rpm"}>RPM</TipHeader>
                      <TipHeader tip={COL_TIPS.cpm} onClick={() => handleSort("est_cpm")} active={sortField === "est_cpm"}>CPM</TipHeader>
                      <TipHeader tip={COL_TIPS.revenue} onClick={() => handleSort("est_total_revenue")} active={sortField === "est_total_revenue"}>Revenue</TipHeader>
                      <TipHeader tip={COL_TIPS.age} onClick={() => handleSort("published_date")} active={sortField === "published_date"}>Age</TipHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedVideos.map((video, i) => (
                      <DeepVideoRow key={video.video_id} video={video} index={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function TipHeader({ children, tip, onClick, active }) {
  return (
    <th
      className={`py-2 px-2 text-right select-none ${onClick ? "cursor-pointer hover:text-gray-700" : ""}`}
      onClick={onClick}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 border-b border-dashed border-gray-300">
            {children}
            {active && <ArrowUpDown className="w-2.5 h-2.5 text-indigo-600" />}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs leading-relaxed">{tip}</TooltipContent>
      </Tooltip>
    </th>
  );
}