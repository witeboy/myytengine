/**
 * OverlayPropertiesPanel — Right-side properties panel for editing
 * a selected overlay clip (position, scale, animation, timing).
 */
import React from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Trash2, Copy, Wand2 } from 'lucide-react';

const ANIMATIONS = [
  { id: 'none',     name: 'None' },
  { id: 'fade_in',  name: 'Fade In' },
  { id: 'pop',      name: 'Pop' },
  { id: 'bounce',   name: 'Bounce' },
  { id: 'slide_up', name: 'Slide Up' },
  { id: 'spin',     name: 'Spin In' },
  { id: 'shake',    name: 'Shake' },
];

export default function OverlayPropertiesPanel({ overlay, onUpdate, onDelete, onDuplicate }) {
  if (!overlay) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-gray-500">
        Select an overlay
      </div>
    );
  }

  const u = (key, value) => onUpdate({ ...overlay, [key]: value });

  return (
    <div className="h-full flex flex-col bg-[#12121f] p-3 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white flex items-center gap-2">
          <span className="text-lg">{overlay.content || '🎬'}</span>
          Overlay
        </span>
        <div className="flex gap-1">
          <button onClick={onDuplicate} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded" title="Duplicate">
            <Copy size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Timing */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Start Time</label>
          <Input type="number" step="0.1" value={overlay.startTime?.toFixed(1)}
            onChange={e => u('startTime', Math.max(0, parseFloat(e.target.value) || 0))}
            className="h-8 text-xs bg-gray-800 border-gray-700" />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Duration</label>
          <Input type="number" step="0.1" value={overlay.duration?.toFixed(1)}
            onChange={e => u('duration', Math.max(0.3, parseFloat(e.target.value) || 1))}
            className="h-8 text-xs bg-gray-800 border-gray-700" />
        </div>
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">X: {Math.round(overlay.x || 50)}%</label>
          <Slider value={[overlay.x || 50]} onValueChange={([v]) => u('x', v)} min={0} max={100} />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Y: {Math.round(overlay.y || 50)}%</label>
          <Slider value={[overlay.y || 50]} onValueChange={([v]) => u('y', v)} min={0} max={100} />
        </div>
      </div>

      {/* Quick position grid */}
      <div>
        <label className="text-[10px] text-gray-400 mb-2 block">Quick Position</label>
        <div className="grid grid-cols-3 gap-1">
          {[
            { x: 15, y: 15, label: '↖' }, { x: 50, y: 15, label: '↑' }, { x: 85, y: 15, label: '↗' },
            { x: 15, y: 50, label: '←' }, { x: 50, y: 50, label: '●' }, { x: 85, y: 50, label: '→' },
            { x: 15, y: 85, label: '↙' }, { x: 50, y: 85, label: '↓' }, { x: 85, y: 85, label: '↘' },
          ].map((pos, i) => (
            <button key={i} onClick={() => { u('x', pos.x); setTimeout(() => u('y', pos.y), 0); }}
              className={`px-2 py-1.5 text-[10px] rounded ${
                Math.abs((overlay.x || 50) - pos.x) < 10 && Math.abs((overlay.y || 50) - pos.y) < 10
                  ? 'bg-pink-500/30 text-pink-300' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}>
              {pos.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scale */}
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Scale: {(overlay.scale || 1).toFixed(2)}x</label>
        <Slider value={[overlay.scale ?? 1]} onValueChange={([v]) => u('scale', v)} min={0.1} max={3} step={0.05} />
      </div>

      {/* Opacity */}
      <div>
        <label className="text-[10px] text-gray-400 mb-1 block">Opacity: {Math.round((overlay.opacity ?? 1) * 100)}%</label>
        <Slider value={[overlay.opacity ?? 1]} onValueChange={([v]) => u('opacity', v)} min={0} max={1} step={0.05} />
      </div>

      {/* Animation */}
      <div>
        <label className="text-[10px] text-gray-400 mb-2 block">Entrance Animation</label>
        <div className="grid grid-cols-2 gap-1.5">
          {ANIMATIONS.map(anim => (
            <button key={anim.id}
              onClick={() => u('animation', anim.id)}
              className={`px-2 py-1.5 text-[10px] rounded border transition-all ${
                (overlay.animation || 'none') === anim.id
                  ? 'border-pink-400 bg-pink-500/20 text-pink-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}>
              {anim.name}
            </button>
          ))}
        </div>
      </div>

      {/* Content for emoji/sticker */}
      {overlay.overlayType === 'emoji' && (
        <div>
          <label className="text-[10px] text-gray-400 mb-1 block">Emoji</label>
          <Input value={overlay.content || ''} onChange={e => u('content', e.target.value)}
            className="h-8 text-lg bg-gray-800 border-gray-700 text-center" maxLength={4} />
        </div>
      )}
    </div>
  );
}