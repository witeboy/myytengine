import React, { useRef } from 'react';
import { GripHorizontal, ChevronDown, ChevronUp } from 'lucide-react';

const LABEL_WIDTH = 40;
const MIN_TIMELINE_HEIGHT = 100;

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function TimelineRuler({ totalDuration, pps, onSeek, beats = [], bpm = 0 }) {
  const markers = [];
  const interval = pps >= 15 ? 5 : pps >= 8 ? 10 : 30;
  for (let t = 0; t <= totalDuration; t += interval) markers.push(t);
  const hookEndPx = Math.min(3 * pps, totalDuration * pps);

  return (
    <div className="h-6 bg-[#0d0d1a] border-b border-gray-800 relative cursor-pointer overflow-hidden"
      style={{ width: totalDuration * pps, marginLeft: LABEL_WIDTH }}
      onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(Math.max(0, Math.min(totalDuration, (e.clientX - r.left) / pps))); }}>
      <div className="absolute top-0 bottom-0 pointer-events-none"
        style={{ left: 0, width: hookEndPx, background: 'rgba(239,68,68,0.10)', borderRight: '1px solid rgba(239,68,68,0.5)' }}
        title="Hook Zone — first 3s must grab viewer">
        <span className="text-[7px] text-red-400 absolute top-0.5 left-1 font-bold tracking-wide select-none">HOOK</span>
      </div>
      {beats.map((beat, i) => (
        <div key={i} className="absolute top-0 bottom-0 pointer-events-none"
          style={{ left: beat * pps, width: 1, background: i % 4 === 0 ? 'rgba(6,182,212,0.55)' : 'rgba(6,182,212,0.18)' }} />
      ))}
      {markers.map(t => (
        <div key={t} className="absolute bottom-0" style={{ left: t * pps }}>
          <span className="text-[8px] text-gray-500 font-mono">{formatTime(t)}</span>
        </div>
      ))}
      {bpm > 0 && (
        <div className="absolute right-1 top-0.5 text-[7px] text-cyan-400 font-mono select-none">{bpm} BPM</div>
      )}
    </div>
  );
}

export function TimelineDivider({ timelineHeight, onResize, collapsed, onToggle }) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = timelineHeight;
    const onMouseMove = (ev) => {
      if (!dragging.current) return;
      const delta = startY.current - ev.clientY;
      const newH = Math.max(MIN_TIMELINE_HEIGHT, Math.min(500, startH.current + delta));
      onResize(newH);
    };
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className="h-2 bg-gray-800 border-t border-gray-700 cursor-row-resize flex items-center justify-center gap-2 hover:bg-gray-700 transition-colors group select-none"
      onMouseDown={onMouseDown}
    >
      <GripHorizontal size={12} className="text-gray-500 group-hover:text-gray-300" />
      <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="p-0.5 text-gray-500 hover:text-white">
        {collapsed ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>
    </div>
  );
}