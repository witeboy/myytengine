import React from 'react';
import { SHORTS_NICHES } from '@/lib/shortsNicheData';

export default function ShortsNicheSelector({ value, onChange }) {
  const niches = Object.values(SHORTS_NICHES);
  return (
    <div>
      <p className="text-xs text-green-400 tracking-widest font-bold mb-3">SELECT NICHE</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {niches.map(niche => {
          const selected = value === niche.id;
          return (
            <button
              key={niche.id}
              onClick={() => onChange(niche.id)}
              className={`text-left p-3 rounded-lg border-2 transition-all ${
                selected
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-white/10 hover:border-white/20 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{niche.emoji}</span>
                <span className="text-xs font-bold text-white leading-tight">{niche.title}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 text-[9px] text-white/40">
                <span>{niche.duration}</span>
                <span>·</span>
                <span>{niche.rpm}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}