import React from 'react';
import { ENGINE_SPECS } from '@/lib/shortsNicheData';

export default function ShortsEngineSpecs() {
  return (
    <div className="space-y-2">
      <div className="bg-red-500/10 border border-red-800 rounded-lg p-4 mb-4 text-xs text-red-300 leading-relaxed">
        <strong className="text-red-500">FOR YOUR FACELESS YOUTUBE ENGINE:</strong> Below are the exact specs your pipeline needs to hit for each section. Map these directly to your Gemini script generation, ElevenLabs voice settings, and Timeline Editor automation.
      </div>

      {ENGINE_SPECS.map((section, i) => (
        <div key={i} className="bg-[#0f0f0f] border border-white/10 rounded-lg p-4">
          <p className="text-[11px] text-green-400 tracking-widest font-bold mb-2.5">{section.title}</p>
          {section.specs.map((spec, si) => (
            <div key={si} className="text-xs text-white/50 leading-relaxed py-1 pl-3 border-l border-green-500/15 mb-0.5">
              <span className="text-white/20 mr-1.5">→</span>
              {spec}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}