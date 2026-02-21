import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Zap, Shield, BarChart3, DollarSign, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import ChannelProfitCard from "../components/audit/ChannelProfitCard";
import ConsistencyChart from "../components/audit/ConsistencyChart";
import AuditHistory from "../components/audit/AuditHistory";

export default function ChannelAuditor() {
  const [keyword, setKeyword] = useState("");
  const [maxChannels, setMaxChannels] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedChart, setSelectedChart] = useState(null);
  const queryClient = useQueryClient();

  const handleAudit = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSelectedChart(null);

    const response = await base44.functions.invoke("auditNicheChannels", {
      keyword: keyword.trim(),
      maxChannels: parseInt(maxChannels),
    });

    if (response.data?.error) {
      setError(response.data.error);
      setLoading(false);
      return;
    }

    setResults(response.data.results || []);
    queryClient.invalidateQueries({ queryKey: ["recent-audits"] });
    setLoading(false);
  };

  const stats = [
    { label: "Monetization Detection", icon: Shield, value: "5 Signals", color: "text-green-600" },
    { label: "CTR Inference", icon: BarChart3, value: "Viral Proxy", color: "text-indigo-600" },
    { label: "Revenue Estimation", icon: DollarSign, value: "CPM-Based", color: "text-amber-600" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Top Bar */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-gray-900 hidden sm:inline">
              Channel Profitability Auditor
            </span>
          </div>
          <Link
            to={createPageUrl("Dashboard")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col items-center space-y-8">
          {/* Header */}
          <div className="text-center space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium mb-2">
              <Shield className="w-3 h-3" /> Channel-First Niche Intelligence
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight">
              Channel Profitability Auditor
            </h1>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              Discover monetized channels with strong CTR, retention, and profit signals. Not keywords — real channel performance.
            </p>
          </div>

          {/* Search Card */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 shadow-sm w-full max-w-2xl">
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Seed Keyword or Channel Name</label>
              <Input
                placeholder="e.g. Finance, Scary Stories, AI Automation, Tech Reviews..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleAudit()}
                className="bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 h-12 text-base focus:border-amber-500 focus:ring-amber-500/20"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Channels to Audit</label>
                <Select value={maxChannels} onValueChange={setMaxChannels}>
                  <SelectTrigger className="bg-gray-50 border-gray-200 text-gray-900 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="3">3 Channels</SelectItem>
                    <SelectItem value="5">5 Channels</SelectItem>
                    <SelectItem value="8">8 Channels</SelectItem>
                    <SelectItem value="10">10 Channels</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAudit}
                  disabled={loading || !keyword.trim()}
                  className="w-full sm:w-auto h-10 bg-amber-600 hover:bg-amber-500 text-white font-medium px-6 gap-2"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Auditing Channels...</>
                  ) : (
                    <><Search className="w-4 h-4" /> Audit Channels</>
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-2xl">
            {stats.map((s) => (
              <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-3 text-center shadow-sm">
                <s.icon className={`w-4 h-4 mx-auto mb-1.5 ${s.color}`} />
                <div className="text-gray-900 font-semibold text-sm">{s.value}</div>
                <div className="text-gray-500 text-xs">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Loading State */}
          {loading && (
            <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
              <p className="text-sm text-gray-600 font-medium">Deep-diving {maxChannels} channels...</p>
              <p className="text-xs text-gray-400">Analyzing monetization signals, CTR patterns, retention proxies, and revenue potential.</p>
            </div>
          )}

          {/* Results */}
          {results && results.length > 0 && (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Audit Results — "{keyword}" <span className="text-sm font-normal text-gray-400">({results.length} channels)</span>
                </h2>
              </div>
              <div className="space-y-4">
                {results.map((audit) => (
                  <div key={audit.id}>
                    <ChannelProfitCard audit={audit} />
                    {selectedChart === audit.id ? (
                      <div className="mt-2">
                        <ConsistencyChart audit={audit} />
                        <button onClick={() => setSelectedChart(null)} className="text-xs text-gray-400 hover:text-indigo-600 mt-1 ml-1">Hide chart</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectedChart(audit.id)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 mt-1 ml-1 transition-colors"
                      >
                        <BarChart3 className="w-3 h-3" /> View consistency graph
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {results && results.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No channels found. Try a broader keyword.
            </div>
          )}

          {/* Audit History */}
          {!results && (
            <div className="w-full max-w-2xl">
              <AuditHistory onSelectKeyword={(kw) => {
                setKeyword(kw);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}