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
    <div className="flex items-end h-8 bg-gray-50 border-b relative">
      <div className="w-24 flex-shrink-0 border-r" />
      <div className="flex-1 relative">
        {markers.map(t => (
          <div
            key={t}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: t * pixelsPerSecond }}
          >
            <span className="text-[10px] text-gray-400 mb-0.5">{formatTime(t)}</span>
            <div className="w-px h-2 bg-gray-300" />
          </div>
        ))}
      </div>
    </div>
  );
}