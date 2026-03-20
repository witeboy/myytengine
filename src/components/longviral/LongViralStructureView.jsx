import React from 'react';

export default function LongViralStructureView({ structure }) {
  if (!structure) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{structure.emoji}</span>
        <div>
          <h3 className="text-sm font-black text-white">{structure.title}</h3>
          <div className="flex gap-3 text-[10px] text-white/40 mt-0.5">
            <span>{structure.duration}</span>
            <span>·</span>
            <span>{structure.wordCount}</span>
            <span>·</span>
            <span>{structure.pacing}</span>
          </div>
        </div>
      </div>

      {structure.sections.map((section) => (
        <div
          key={section.id}
          className="bg-white/5 rounded-lg p-4 border-l-4 transition-all hover:bg-white/8"
          style={{ borderLeftColor: section.color }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white">{section.label}</span>
              <span className="text-[10px] text-white/30 font-mono">{section.time}</span>
            </div>
            <div className="flex gap-2 text-[9px] text-white/30">
              <span>{section.seconds}s</span>
              {section.words !== '0' && <span>· {section.words}</span>}
            </div>
          </div>
          <p className="text-[11px] text-white/50 mb-2">{section.purpose}</p>
          {section.rules && section.rules.length > 0 && (
            <ul className="space-y-0.5">
              {section.rules.map((rule, i) => (
                <li key={i} className="text-[10px] text-white/30 flex items-start gap-1.5">
                  <span className="text-amber-400/60 mt-0.5">→</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          )}
          {section.visualSpec && (
            <p className="text-[9px] text-cyan-400/40 mt-2">🎬 {section.visualSpec}</p>
          )}
          {section.audioSpec && (
            <p className="text-[9px] text-purple-400/40 mt-0.5">🎧 {section.audioSpec}</p>
          )}
        </div>
      ))}
    </div>
  );
}