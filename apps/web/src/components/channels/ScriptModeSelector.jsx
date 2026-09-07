import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Moon, Zap, Film, Clapperboard } from 'lucide-react';

const MODES = [
  {
    id: 'standard',
    label: 'Standard (Viral)',
    description: 'Documentary / storytelling with TVF retention formula',
    icon: Zap,
    color: '#3b82f6',
  },
  {
    id: 'youtube_shorts',
    label: 'YouTube Shorts',
    description: '90s shorts — Hook → Tension → 3 Rules → CTA. Visual every 2-3s. 9:16 portrait.',
    icon: Film,
    color: '#22c55e',
  },
  {
    id: 'long_viral',
    label: 'Long Viral',
    description: 'Same viral Shorts structures scaled to any duration — 5 to 60 min. Set your own length.',
    icon: Clapperboard,
    color: '#f59e0b',
  },
  {
    id: 'sleep_story',
    label: 'Sleep Story',
    description: 'A classic folk/fairy tale retold slowly with characters and a gentle plot',
    icon: Moon,
    color: '#6366f1',
  },
];

export default function ScriptModeSelector({ value, onChange }) {
  const current = value || 'standard';

  return (
    <div>
      <p className="text-sm font-medium text-gray-800 mb-2">Script Generation Mode</p>
      <p className="text-xs text-gray-500 mb-3">Controls how scripts are structured and written for this channel</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {MODES.map(mode => {
          const selected = current === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => onChange(mode.id)}
              className={`text-left p-3 rounded-lg border-2 transition-all ${
                selected
                  ? 'border-current ring-1 ring-current/20 bg-opacity-5'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              style={selected ? { borderColor: mode.color, backgroundColor: `${mode.color}08` } : {}}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <mode.icon className="w-4 h-4" style={{ color: mode.color }} />
                <span className="text-sm font-medium text-gray-900">{mode.label}</span>
                {selected && <Badge className="text-[9px] ml-auto" style={{ backgroundColor: `${mode.color}15`, color: mode.color }}>Active</Badge>}
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">{mode.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}