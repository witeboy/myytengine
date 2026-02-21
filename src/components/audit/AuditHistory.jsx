import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const GRADE_COLORS = {
  "S-Tier": "bg-amber-100 text-amber-800",
  "A-Tier": "bg-green-100 text-green-800",
  "B-Tier": "bg-blue-100 text-blue-800",
  "C-Tier": "bg-gray-100 text-gray-600",
};

function timeAgo(date) {
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AuditHistory({ onSelectKeyword }) {
  const { data: audits = [] } = useQuery({
    queryKey: ["recent-audits"],
    queryFn: () => base44.entities.NicheAudits.list("-created_date", 20),
  });

  // Group by search_keyword
  const grouped = {};
  audits.forEach(a => {
    if (!grouped[a.search_keyword]) {
      grouped[a.search_keyword] = { keyword: a.search_keyword, date: a.audit_date || a.created_date, channels: [], bestGrade: "C-Tier" };
    }
    grouped[a.search_keyword].channels.push(a);
    const gradeOrder = { "S-Tier": 0, "A-Tier": 1, "B-Tier": 2, "C-Tier": 3 };
    if ((gradeOrder[a.profitability_grade] || 3) < (gradeOrder[grouped[a.search_keyword].bestGrade] || 3)) {
      grouped[a.search_keyword].bestGrade = a.profitability_grade;
    }
  });

  const entries = Object.values(grouped).slice(0, 8);
  if (!entries.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <Clock className="w-3.5 h-3.5" /> Recent Audits
      </div>
      <div className="space-y-1.5">
        {entries.map((entry) => (
          <button
            key={entry.keyword}
            onClick={() => onSelectKeyword(entry.keyword)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-gray-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors text-left group"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-800 group-hover:text-indigo-600 truncate block">{entry.keyword}</span>
              <span className="text-[10px] text-gray-400">{entry.channels.length} channels • {timeAgo(entry.date)}</span>
            </div>
            <Badge className={`${GRADE_COLORS[entry.bestGrade]} text-[10px] px-1.5 py-0`}>
              Best: {entry.bestGrade}
            </Badge>
            <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-indigo-400" />
          </button>
        ))}
      </div>
    </div>
  );
}