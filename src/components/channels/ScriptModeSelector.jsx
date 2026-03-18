import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Moon, Sparkles, Zap } from 'lucide-react';

const MODES = [
  {
    id: 'standard',
    label: 'Standard (Viral)',
    description: 'TVF 8-phase viral formula — hooks, tension, transformation, CTA',
    icon: Zap,
    color: '#3b82f6',
  },
  {
    id: 'sleep_meditation',
    label: 'Sleep Meditation',
    description: 'Soothing affirmations, progressive relaxation, repetitive comfort — 90min to 8hrs',
    icon: Sparkles,
    color: '#8b5cf6',
  },
  {
    id: 'sleep_story',
    label: 'Sleep Story',
    description: 'Narrative bedtime stories — gentle activities, rich sensory details, no tension',
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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