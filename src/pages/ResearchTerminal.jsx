import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "../utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Zap, TrendingUp, DollarSign, Target } from "lucide-react";
import RecentSearches from "../components/niche/RecentSearches";

export default function ResearchTerminal() {
  const [keyword, setKeyword] = useState("");
  const [duration, setDuration] = useState("This Week");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);

    // Create search record
    const searchRecord = await base44.entities.Searches.create({
      keyword: keyword.trim(),
      duration,
      search_date: new Date().toISOString(),
      status: "Pending",
    });

    // Trigger analysis
    try {
      const response = await base44.functions.invoke("analyzeNiche", {
        keyword: keyword.trim(),
        duration,
        search_id: searchRecord.id,
      });

      if (response.data?.error) {
        setError(response.data.error);
        setLoading(false);
        return;
      }

      setLoading(false);
      navigate(createPageUrl("ResultsGrid") + `?search_id=${searchRecord.id}&keyword=${encodeURIComponent(keyword.trim())}`);
    } catch (e) {
      setError(e.message || "Analysis failed. Please try again.");
      setLoading(false);
    }
  };

  const stats = [
    { label: "RPM Categories", value: "23+", icon: DollarSign, color: "text-amber-400" },
    { label: "Viral Detection", value: "Real-time", icon: TrendingUp, color: "text-green-400" },
    { label: "Accuracy", value: "High", icon: Target, color: "text-indigo-400" },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]">
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-2">
            <Zap className="w-3 h-3" /> YouTube Niche Intelligence
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Find Profitable Gaps
          </h1>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Analyze any YouTube niche for viral opportunities, low-competition gaps, and high-RPM potential.
          </p>
        </div>

        {/* Search Card */}
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-6 space-y-4">
          <div className="space-y-3">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Niche Keyword</label>
            <Input
              placeholder="e.g. AI automation, credit score hacks, car accident lawyer..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
              className="bg-[#0a0a0f] border-[#1e1e2e] text-white placeholder:text-gray-600 h-12 text-base focus:border-indigo-500 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Duration</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="bg-[#0a0a0f] border-[#1e1e2e] text-white h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#12121a] border-[#1e1e2e]">
                  <SelectItem value="Last 48h">Last 48h</SelectItem>
                  <SelectItem value="This Week">This Week</SelectItem>
                  <SelectItem value="This Month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSearch}
                disabled={loading || !keyword.trim()}
                className="w-full sm:w-auto h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-6 gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                ) : (
                  <><Search className="w-4 h-4" /> Find Profitable Gaps</>
                )}
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="bg-[#12121a] border border-[#1e1e2e] rounded-lg p-3 text-center">
              <s.icon className={`w-4 h-4 mx-auto mb-1.5 ${s.color}`} />
              <div className="text-white font-semibold text-sm">{s.value}</div>
              <div className="text-gray-500 text-xs">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent Searches */}
        <RecentSearches />
      </div>
    </div>
  );
}