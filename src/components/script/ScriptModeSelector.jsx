import React from 'react';
import { Flame, Moon, BookOpen, Film } from 'lucide-react';

const MODES = [
  { id: '', label: 'Standard (Viral)', desc: 'Documentary / storytelling with TVF retention formula', Icon: Flame, color: 'orange' },
  { id: 'youtube_shorts', label: 'YouTube Shorts', desc: '90s high-retention shorts — multiple niche structures available', Icon: Film, color: 'green' },
  { id: 'sleep_meditation', label: 'Sleep Meditation', desc: 'Soothing affirmations, breathing cues, nature imagery', Icon: Moon, color: 'indigo' },
  { id: 'sleep_story', label: 'Sleep Story', desc: 'Peaceful narrative bedtime story with rich sensory detail', Icon: BookOpen, color: 'purple' },
];

const SHORTS_NICHES = [
  { id: 'finance', label: '💰 Finance / Wealth', desc: 'Hook → Tension → Pivot → 3 Rules → CTA' },
  { id: 'book', label: '📚 Book Summaries', desc: 'Hook → Context → 3 Lessons → Transformation → CTA' },
  { id: 'crime_story', label: '🔪 Crime Story', desc: 'Cold Open → Setup → Escalation → Twist → CTA' },
  { id: 'tech_explainer', label: '⚡ Tech Explainer', desc: 'WTF Hook → Context → 3 Steps → So What → CTA' },
  { id: 'side_hustle', label: '💸 Side Hustle', desc: 'Proof Hook → Myth Kill → 3 Steps → Proof → CTA' },
];

export default function ScriptModeSelector({ value, onChange, shortsNiche, onShortsNicheChange }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium block">Script Mode</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                    : m.color === 'green' ? 'border-green-500 bg-green-50'
                    : m.color === 'indigo' ? 'border-indigo-500 bg-indigo-50'
                    : 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <m.Icon className={`w-4 h-4 ${
                  selected
                    ? m.color === 'orange' ? 'text-orange-600'
                      : m.color === 'green' ? 'text-green-600'
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

      {/* Shorts Niche Sub-selector */}
      {(value || '') === 'youtube_shorts' && onShortsNicheChange && (
        <div className="mt-4 pt-4 border-t border-green-200">
          <label className="text-sm font-medium text-green-800 block mb-2">Shorts Niche Structure</label>
          <p className="text-xs text-gray-500 mb-3">Each niche has a unique storytelling structure optimized for retention</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SHORTS_NICHES.map(n => {
              const nicheSelected = (shortsNiche || 'finance') === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onShortsNicheChange(n.id)}
                  className={`text-left p-2.5 rounded-lg border-2 transition-all ${
                    nicheSelected
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{n.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{n.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}