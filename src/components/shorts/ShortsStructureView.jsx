import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

function TimelineBar({ sections }) {
  const total = sections.reduce((s, sec) => s + sec.seconds, 0);
  return (
    <div className="flex rounded-md overflow-hidden h-8 mb-4">
      {sections.map((s, i) => (
        <div
          key={i}
          className="flex items-center justify-center text-[8px] font-bold overflow-hidden whitespace-nowrap px-0.5"
          style={{
            width: `${(s.seconds / total) * 100}%`,
            backgroundColor: s.color + '44',
            color: s.color,
            borderRight: i < sections.length - 1 ? '1px solid #0a0a0a' : 'none',
          }}
          title={`${s.label}: ${s.seconds}s`}
        >
          {s.seconds >= 10 ? s.label : s.seconds + 's'}
        </div>
      ))}
    </div>
  );
}

export default function ShortsStructureView({ structure }) {
  const [openSection, setOpenSection] = useState(null);

  return (
    <div>
      <div className="flex gap-3 flex-wrap mb-4 text-[11px] text-white/40">
        <span>Duration: <strong className="text-white">{structure.duration}</strong></span>
        <span>Words: <strong className="text-white">{structure.wordCount}</strong></span>
        <span>Pace: <strong className="text-white">{structure.pacing}</strong></span>
      </div>

      <TimelineBar sections={structure.sections} />

      <div className="space-y-1.5">
        {structure.sections.map((s, i) => (
          <div
            key={i}
            onClick={() => setOpenSection(openSection === i ? null : i)}
            className="rounded-lg cursor-pointer transition-all"
            style={{
              background: openSection === i ? '#141414' : '#0f0f0f',
              border: `1px solid ${openSection === i ? s.color + '44' : '#1a1a1a'}`,
              borderLeft: `3px solid ${s.color}`,
              padding: '12px 14px',
            }}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: s.color + '22', color: s.color, letterSpacing: '1px' }}>
                  {s.time}
                </span>
                <span className="text-[13px] font-bold text-white">{s.label}</span>
                <span className="text-[11px] text-white/30">{s.seconds}s · {s.words}</span>
              </div>
              {openSection === i ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
            </div>

            {openSection === i && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-4">
                <p className="text-xs text-white/50 italic leading-relaxed">{s.purpose}</p>

                <div>
                  <p className="text-[10px] text-white/30 font-bold tracking-widest mb-1.5">RULES</p>
                  {s.rules.map((r, ri) => (
                    <div key={ri} className="text-xs text-white/70 leading-relaxed py-0.5 pl-3" style={{ borderLeft: `1px solid ${s.color}33` }}>
                      {r}
                    </div>
                  ))}
                </div>

                {s.templates.length > 0 && (
                  <div>
                    <p className="text-[10px] text-white/30 font-bold tracking-widest mb-1.5">SCRIPT TEMPLATES</p>
                    {s.templates.map((t, ti) => (
                      <div key={ti} className="text-xs text-yellow-400 italic leading-relaxed p-2 rounded bg-yellow-500/5 mb-1">
                        {t}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-white/30 font-bold tracking-widest mb-1">VISUAL SPEC</p>
                    <div className="text-[11px] text-white/50 leading-relaxed bg-green-500/5 p-2.5 rounded whitespace-pre-wrap">
                      {s.visualSpec}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/30 font-bold tracking-widest mb-1">AUDIO SPEC</p>
                    <div className="text-[11px] text-white/50 leading-relaxed bg-red-500/5 p-2.5 rounded whitespace-pre-wrap">
                      {s.audioSpec}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}