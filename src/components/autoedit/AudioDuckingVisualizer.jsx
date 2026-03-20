import React from 'react';
import { Volume2, Mic } from 'lucide-react';

export default function AudioDuckingVisualizer({ scene }) {
  const ducking = scene.audioDucking;
  if (!ducking?.enabled || !ducking.envelope) return null;

  const w = 200;
  const h = 40;
  const envelope = ducking.envelope;
  const maxTime = scene.duration || envelope[envelope.length - 1]?.time || 1;

  // Build SVG path from envelope keyframes
  const points = envelope.map(kf => {
    const x = (kf.time / maxTime) * w;
    const y = h - (kf.volume * h);
    return `${x},${y}`;
  }).join(' ');

  // Narration bar (full-width, representing constant narration)
  const narrationY = h - (ducking.narrationVolume * h * 0.4); // Scale to 40% height for visual clarity

  return (
    <div className="bg-gray-900 rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
        <span className="flex items-center gap-1"><Mic className="w-3 h-3 text-blue-400" /> Narration</span>
        <span className="flex items-center gap-1"><Volume2 className="w-3 h-3 text-green-400" /> B-Roll Audio</span>
      </div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="rounded">
        {/* Background */}
        <rect width={w} height={h} fill="#1e293b" rx="2" />

        {/* Narration level (constant blue bar) */}
        <rect x="0" y={narrationY} width={w} height={h - narrationY} fill="rgba(59,130,246,0.15)" />
        <line x1="0" y1={narrationY} x2={w} y2={narrationY} stroke="rgba(59,130,246,0.5)" strokeWidth="1" strokeDasharray="4,3" />

        {/* B-roll volume envelope (green area) */}
        <polygon
          points={`0,${h} ${points} ${w},${h}`}
          fill="rgba(34,197,94,0.25)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="rgba(34,197,94,0.8)"
          strokeWidth="1.5"
        />

        {/* Duck zone label */}
        {envelope.length >= 4 && (
          <text
            x={w / 2}
            y={h - 4}
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize="7"
          >
            ducked to {Math.round(ducking.brollVolume * 100)}%
          </text>
        )}
      </svg>
      <div className="flex items-center justify-between text-[9px] text-gray-500">
        <span>0s</span>
        <span className="text-green-400">
          B-roll: {Math.round(ducking.brollVolume * 100)}% during narration → {Math.round(ducking.brollVolumeNoDuck * 100)}% in gaps
        </span>
        <span>{scene.duration}s</span>
      </div>
    </div>
  );
}