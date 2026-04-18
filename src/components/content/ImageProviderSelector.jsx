import React from 'react';

const PROVIDERS = [
  {
    id: 'auto',
    label: 'Auto (Best Available)',
    emoji: '🤖',
    desc: 'Tries Z-Image → Seedream → Grok → Nano. Auto-fallback on failure.',
    color: 'border-gray-300 bg-gray-50',
    activeColor: 'border-blue-500 bg-blue-50 ring-2 ring-blue-200',
  },
  {
    id: 'z_image',
    label: 'Z-Image',
    emoji: '⚡',
    desc: 'Fast, photorealistic, strong bilingual text. Primary — no reference support.',
    color: 'border-gray-300 bg-gray-50',
    activeColor: 'border-purple-500 bg-purple-50 ring-2 ring-purple-200',
  },
  {
    id: 'ai33_seedream',
    label: 'Seedream 4.5',
    emoji: '🌱',
    desc: 'Highest quality. Strict content moderation — may reject some prompts.',
    color: 'border-gray-300 bg-gray-50',
    activeColor: 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200',
  },
  {
    id: 'grok',
    label: 'Grok Imagine',
    emoji: '🔥',
    desc: 'Reliable. Supports image-to-image for character reference. Less strict.',
    color: 'border-gray-300 bg-gray-50',
    activeColor: 'border-orange-500 bg-orange-50 ring-2 ring-orange-200',
  },
  {
    id: 'nano_banana',
    label: 'Nano Banana',
    emoji: '🍌',
    desc: 'Google model. Good fallback. No reference image support.',
    color: 'border-gray-300 bg-gray-50',
    activeColor: 'border-yellow-500 bg-yellow-50 ring-2 ring-yellow-200',
  },
];

export default function ImageProviderSelector({ selected, onSelect }) {
  const current = selected || 'auto';

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        🖼️ Image Generator
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {PROVIDERS.map(p => {
          const isActive = current === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`text-left p-3 rounded-lg border-2 transition-all ${
                isActive ? p.activeColor : p.color + ' hover:border-gray-400'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{p.emoji}</span>
                <span className={`text-xs font-semibold ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                  {p.label}
                </span>
              </div>
              <p className="text-[10px] text-gray-500 leading-relaxed">{p.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}