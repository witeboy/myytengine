import React from 'react';
import { LONG_VIRAL_NICHE_IDS } from '@/lib/longViralNicheData';

export default function LongViralNicheSelector({ value, onChange }) {
  return (
    <div>
      <p className="text-xs text-amber-400 tracking-widest font-bold mb-3">SELECT NICHE</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {LONG_VIRAL_NICHE_IDS.map(niche => {
          const selected = value === niche.id;
          return (
            <button
              key={niche.id}
              onClick={() => onChange(niche.id)}
              className={`text-left p-3 rounded-lg border-2 transition-all ${
                selected
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-white/10 hover:border-white/20 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{niche.emoji}</span>
                <span className="text-xs font-bold text-white leading-tight">{niche.label}</span>
              </div>
              <p className="text-[9px] text-white/40 mt-1 leading-snug">{niche.structure}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}