import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const statusConfig = {
  Complete: { icon: CheckCircle2, color: "text-green-400" },
  Failed: { icon: XCircle, color: "text-red-400" },
  Pending: { icon: Loader2, color: "text-amber-400" },
};

export default function RecentSearches() {
  const { data: searches = [] } = useQuery({
    queryKey: ["recent-searches"],
    queryFn: () => base44.entities.Searches.list("-created_date", 5),
  });

  if (searches.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
        <Clock className="w-3 h-3" /> Recent Searches
      </div>
      <div className="space-y-1.5">
        {searches.map((s) => {
          const cfg = statusConfig[s.status] || statusConfig.Pending;
          const Icon = cfg.icon;
          return (
            <Link
              key={s.id}
              to={s.status === "Complete" ? createPageUrl("ResultsGrid") + `?search_id=${s.id}&keyword=${encodeURIComponent(s.keyword)}` : "#"}
              onClick={(e) => { if (s.status !== "Complete") e.preventDefault(); }}
              className={`flex items-center justify-between p-2.5 rounded-lg bg-[#12121a] border border-[#1e1e2e] transition-colors group ${
                s.status === "Complete" ? "hover:border-indigo-500/30 cursor-pointer" : "opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-3.5 h-3.5 ${cfg.color} ${s.status === "Pending" ? "animate-spin" : ""}`} />
                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{s.keyword}</span>
                <span className="text-xs text-gray-600">{s.duration}</span>
              </div>
              <div className="text-xs text-gray-600">
                {s.result_count != null && <span>{s.result_count} results</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}