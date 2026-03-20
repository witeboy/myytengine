import React from 'react';
import { LONG_VIRAL_NICHE_IDS } from '@/lib/longViralNicheData';

export default function LongViralNicheSelector({ value, onChange }) {
  return (
    <div>
      <label className="text-sm font-medium mb-3 block">Select Niche</label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {LONG_VIRAL_NICHE_IDS.map(niche => {
          const selected = value === niche.id;
          return (
            <button
              key={niche.id}
              onClick={() => onChange(niche.id)}
              className={`text-left p-3 rounded-lg border-2 transition-all ${
                selected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{niche.emoji}</span>
                <span className="text-xs font-bold text-gray-900 leading-tight">{niche.label}</span>
              </div>
              <p className="text-[9px] text-gray-500 mt-1 leading-snug">{niche.structure}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}