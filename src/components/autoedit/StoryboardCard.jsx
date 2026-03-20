import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Camera, Blend, Volume2, VolumeX, Search, GripVertical, Clock
} from 'lucide-react';

const MOTIONS_MAP = {
  zoom_in_center: 'Push In', zoom_out_center: 'Pull Out',
  pan_right_zoom: 'Drift Right', pan_left_zoom: 'Drift Left',
  push_in_top: 'Drift Up', push_in_bottom: 'Drift Down',
  diagonal_tl_br: 'Diagonal ↘', diagonal_tr_bl: 'Diagonal ↙',
};

const ARC_COLORS = {
  setup: 'bg-blue-100 text-blue-700',
  rising: 'bg-amber-100 text-amber-700',
  climax: 'bg-red-100 text-red-700',
  resolution: 'bg-emerald-100 text-emerald-700',
};

export default function StoryboardCard({
  scene, index, isSelected, isDragging,
  onSelect, onSwapClick, dragHandleProps
}) {
  const ducking = scene.audioDucking;

  return (
    <div
      className={`relative group rounded-lg border-2 transition-all cursor-pointer ${
        isDragging ? 'shadow-xl scale-105 border-violet-400 bg-white z-50' :
        isSelected ? 'border-violet-500 ring-2 ring-violet-200 bg-violet-50/50' :
        'border-gray-200 hover:border-gray-300 bg-white'
      }`}
      onClick={() => onSelect(index)}
    >
      {/* Drag Handle */}
      <div
        {...dragHandleProps}
        className="absolute top-1 left-1 z-10 p-1 rounded bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* Scene Number Badge */}
      <div className="absolute top-1 right-1 z-10 bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
        S{scene.sceneNumber}
      </div>

      {/* Thumbnail */}
      <div className="aspect-video bg-gray-900 rounded-t-md overflow-hidden relative">
        {scene.thumbnail || scene.imageUrl ? (
          <img
            src={scene.thumbnail || scene.imageUrl}
            className="w-full h-full object-cover"
            alt=""
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <Camera className="w-6 h-6" />
          </div>
        )}

        {/* Swap B-roll button */}
        <button
          onClick={(e) => { e.stopPropagation(); onSwapClick(index); }}
          className="absolute bottom-1 right-1 bg-black/70 hover:bg-violet-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-all"
          title="Swap B-roll clip"
        >
          <Search className="w-3 h-3" />
        </button>

        {/* Audio ducking indicator */}
        {ducking?.enabled && (
          <div className="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Volume2 className="w-2.5 h-2.5 text-green-400" />
            <span className="text-[9px] text-green-300">{Math.round(ducking.brollVolume * 100)}%</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2 space-y-1">
        <p className="text-[11px] font-medium text-gray-800 line-clamp-2 leading-tight">
          {scene.label || scene.description || `Scene ${scene.sceneNumber}`}
        </p>
        <div className="flex flex-wrap gap-1">
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" /> {scene.duration}s
          </span>
          {scene.cinematicMotion && (
            <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
              <Camera className="w-2.5 h-2.5" /> {MOTIONS_MAP[scene.cinematicMotion] || scene.cinematicMotion}
            </span>
          )}
          {scene.transition && (
            <span className="text-[10px] text-purple-600 flex items-center gap-0.5">
              <Blend className="w-2.5 h-2.5" /> {scene.transition}
            </span>
          )}
        </div>
        {scene.arcPosition && (
          <Badge className={`text-[9px] px-1 py-0 ${ARC_COLORS[scene.arcPosition] || 'bg-gray-100 text-gray-600'}`}>
            {scene.arcPosition}
          </Badge>
        )}
        {scene.keywords && (
          <p className="text-[9px] text-gray-400 truncate" title={scene.keywords}>🔍 {scene.keywords}</p>
        )}
      </div>
    </div>
  );
}