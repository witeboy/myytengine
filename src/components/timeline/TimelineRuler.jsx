import React from 'react';

export default function TimelineRuler({ totalDuration, pixelsPerSecond }) {
  const markers = [];
  const interval = pixelsPerSecond >= 15 ? 5 : pixelsPerSecond >= 8 ? 10 : 30;

  for (let t = 0; t <= totalDuration; t += interval) {
    markers.push(t);
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-end h-6 bg-[#1a1a2e] border-b border-gray-800 relative">
      <div className="w-16 flex-shrink-0 border-r border-gray-800" />
      <div className="flex-1 relative">
        {markers.map(t => (
          <div
            key={t}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: t * pixelsPerSecond }}
          >
            <span className="text-[9px] text-gray-500 mb-0.5">{formatTime(t)}</span>
            <div className="w-px h-2 bg-gray-600" />
          </div>
        ))}
      </div>
    </div>
  );
}