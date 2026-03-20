import React from 'react';

export default function LongViralStructureView({ structure }) {
  if (!structure) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{structure.emoji}</span>
        <div>
          <h3 className="text-sm font-black text-gray-900">{structure.title}</h3>
          <div className="flex gap-3 text-[10px] text-gray-400 mt-0.5">
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
          className="bg-white rounded-lg p-4 border-l-4 border border-gray-100 transition-all hover:shadow-md"
          style={{ borderLeftColor: section.color }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-gray-900">{section.label}</span>
              <span className="text-[10px] text-gray-400 font-mono">{section.time}</span>
            </div>
            <div className="flex gap-2 text-[9px] text-gray-400">
              <span>{section.seconds}s</span>
              {section.words !== '0' && <span>· {section.words}</span>}
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">{section.purpose}</p>
          {section.rules && section.rules.length > 0 && (
            <ul className="space-y-0.5">
              {section.rules.map((rule, i) => (
                <li key={i} className="text-[10px] text-gray-400 flex items-start gap-1.5">
                  <span className="text-amber-500 mt-0.5">→</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          )}
          {section.visualSpec && (
            <p className="text-[9px] text-cyan-600 mt-2">🎬 {section.visualSpec}</p>
          )}
          {section.audioSpec && (
            <p className="text-[9px] text-purple-600 mt-0.5">🎧 {section.audioSpec}</p>
          )}
        </div>
      ))}
    </div>
  );
}