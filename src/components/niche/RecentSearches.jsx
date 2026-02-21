import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { createPageUrl } from "../../utils";
import { Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const statusConfig = {
  Complete: { icon: CheckCircle2, color: "text-green-600" },
  Failed: { icon: XCircle, color: "text-red-500" },
  Pending: { icon: Loader2, color: "text-amber-500" },
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

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
          const isClickable = s.status === "Complete";
          return (
            <Link
              key={s.id}
              to={isClickable ? createPageUrl("ResultsGrid") + `?search_id=${s.id}&keyword=${encodeURIComponent(s.keyword)}` : "#"}
              onClick={(e) => { if (!isClickable) e.preventDefault(); }}
              className={`flex items-center justify-between p-2.5 rounded-lg bg-white border border-gray-200 transition-colors group shadow-sm ${
                isClickable ? "hover:border-indigo-300 cursor-pointer" : "opacity-60 cursor-default"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-3.5 h-3.5 ${cfg.color} ${s.status === "Pending" ? "animate-spin" : ""}`} />
                <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">{s.keyword}</span>
                <span className="text-xs text-gray-400">{s.duration}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {s.result_count != null && s.status === "Complete" && (
                  <span>{s.result_count} results</span>
                )}
                <span>{timeAgo(s.created_date)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}