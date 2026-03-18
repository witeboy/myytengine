import React from 'react';
import { Flame, Moon, BookOpen } from 'lucide-react';

const MODES = [
  { id: '', label: 'Standard (Viral)', desc: 'Documentary / storytelling with TVF retention formula', Icon: Flame, color: 'orange' },
  { id: 'sleep_meditation', label: 'Sleep Meditation', desc: 'Soothing affirmations, breathing cues, nature imagery', Icon: Moon, color: 'indigo' },
  { id: 'sleep_story', label: 'Sleep Story', desc: 'Peaceful narrative bedtime story with rich sensory detail', Icon: BookOpen, color: 'purple' },
];

export default function ScriptModeSelector({ value, onChange }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium block">Script Mode</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {MODES.map(m => {
          const selected = (value || '') === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-lg border-2 text-left transition-all ${
                selected
                  ? m.color === 'orange' ? 'border-orange-500 bg-orange-50'
                    : m.color === 'indigo' ? 'border-indigo-500 bg-indigo-50'
                    : 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <m.Icon className={`w-4 h-4 ${
                  selected
                    ? m.color === 'orange' ? 'text-orange-600'
                      : m.color === 'indigo' ? 'text-indigo-600'
                      : 'text-purple-600'
                    : 'text-gray-400'
                }`} />
                <span className={`text-sm font-semibold ${selected ? 'text-gray-900' : 'text-gray-600'}`}>{m.label}</span>
              </div>
              <span className="text-xs text-gray-500 leading-tight">{m.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}