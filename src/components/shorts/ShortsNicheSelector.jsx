import React from 'react';
import { SHORTS_NICHES } from '@/lib/shortsNicheData';

export default function ShortsNicheSelector({ value, onChange }) {
  return (
    <div>
      <p className="text-xs text-green-400 tracking-widest font-bold mb-3">SELECT NICHE</p>
      <div className="grid grid-cols-2 gap-3">
        {Object.values(SHORTS_NICHES).map(niche => {
          const selected = value === niche.id;
          return (
            <button
              key={niche.id}
              onClick={() => onChange(niche.id)}
              className={`text-left p-4 rounded-lg border-2 transition-all ${
                selected
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-white/10 hover:border-white/20 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{niche.emoji}</span>
                <span className="text-sm font-bold text-white">{niche.title}</span>
              </div>
              <div className="flex gap-2 mt-2 text-[10px] text-white/40">
                <span>{niche.duration}</span>
                <span>·</span>
                <span>{niche.wordCount}</span>
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