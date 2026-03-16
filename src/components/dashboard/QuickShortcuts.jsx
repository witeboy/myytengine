import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Tv, Plus, Search, Image, Film, FileText, Music,
  BarChart3, Users, Wrench, FolderOpen, Zap, Sparkles
} from 'lucide-react';

const shortcuts = [
  { label: 'Content Factory', icon: Tv, page: 'ChannelsHub', color: 'from-blue-500 to-indigo-600' },
  { label: 'New Project', icon: Plus, page: 'NewProject', color: 'from-green-500 to-emerald-600' },
  { label: 'Niche Research', icon: Search, page: 'ResearchTerminal', color: 'from-purple-500 to-violet-600' },
  { label: 'Competitor Monitor', icon: Users, page: 'CompetitorMonitor', color: 'from-red-500 to-rose-600' },
  { label: 'Repurpose Video', icon: Film, page: 'ContentRepurpose', color: 'from-amber-500 to-orange-600' },
  { label: 'UGC Pipeline', icon: Sparkles, page: 'UGCPipeline', color: 'from-pink-500 to-fuchsia-600' },
  { label: 'Media Library', icon: FolderOpen, page: 'MediaLibrary', color: 'from-teal-500 to-cyan-600' },
  { label: 'Tools Hub', icon: Wrench, page: 'ToolsHub', color: 'from-slate-500 to-gray-600' },
];

export default function QuickShortcuts() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {shortcuts.map(s => (
        <button
          key={s.page}
          onClick={() => navigate(createPageUrl(s.page))}
          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-300 hover:shadow-lg transition-all duration-200 group"
        >
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
            <s.icon className="w-5 h-5 text-white" />
          </div>
          <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">{s.label}</span>
        </button>
      ))}
    </div>
  );
}