import React from 'react';
import { Link } from 'react-router-dom';
import {
  Tv, Plus, Wrench, Settings
} from 'lucide-react';

const shortcuts = [
  { label: 'Content Factory',  icon: Tv,       path: '/ChannelsHub',      color: 'from-blue-500 to-indigo-600'   },
  { label: 'New Project',      icon: Plus,      path: '/NewProject',       color: 'from-green-500 to-emerald-600' },
  { label: 'Tools Hub',        icon: Wrench,    path: '/ToolsHub',         color: 'from-slate-500 to-gray-600'   },
  { label: 'Settings',         icon: Settings,  path: '/Settings',         color: 'from-slate-500 to-gray-600'   },
];

export default function QuickShortcuts() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {shortcuts.map(s => (
        <Link
          key={s.path}
          to={s.path}
          className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-300 hover:shadow-lg transition-all duration-200 group"
        >
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform`}>
            <s.icon className="w-5 h-5 text-white" />
          </div>
          <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">{s.label}</span>
        </Link>
      ))}
    </div>
  );
}
