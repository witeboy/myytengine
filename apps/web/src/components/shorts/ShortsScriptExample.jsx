import React from 'react';

export default function ShortsScriptExample({ example, niche }) {
  if (!example) return null;

  return (
    <div>
      <div className="bg-green-500/10 border border-green-800 rounded-lg p-4 mb-4">
        <p className="text-[10px] text-green-400 tracking-widest font-bold mb-1">COMPLETE SCRIPT — READY TO RECORD</p>
        <p className="text-base font-bold text-white">{example.title}</p>
        <p className="text-[11px] text-white/30 mt-1">
          {example.wordCount} · 90 seconds · {niche === 'finance' ? '$15-30 RPM' : '$8-15 RPM'}
        </p>
      </div>

      <div className="bg-[#0f0f0f] border border-white/10 rounded-lg p-5 font-mono text-xs leading-relaxed text-white/70 whitespace-pre-wrap overflow-x-auto">
        {example.script.split('\n').map((line, i) => {
          if (line.match(/^\[.*\]/)) {
            const color = line.includes('HOOK') ? '#dc2626' :
              line.includes('TENSION') || line.includes('CONTEXT') ? '#f59e0b' :
              line.includes('PIVOT') ? '#8b5cf6' :
              line.includes('RULE') || line.includes('LESSON') || line.includes('VALUE') ? '#22c55e' :
              line.includes('TRANSFORMATION') ? '#8b5cf6' :
              line.includes('CTA') ? '#06b6d4' : '#525252';
            return (
              <div key={i} style={{ color, fontWeight: 800, marginTop: i > 0 ? '14px' : '0', fontSize: '10px', letterSpacing: '2px' }}>
                {line}
              </div>
            );
          }
          if (line.startsWith('"')) {
            return <div key={i} className="text-yellow-400 italic pl-3">{line}</div>;
          }
          if (line.startsWith('[')) {
            return <div key={i} className="text-white/30 italic">{line}</div>;
          }
          return <div key={i}>{line}</div>;
        })}
      </div>
    </div>
  );
}